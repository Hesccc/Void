import os
import platform
import unicodedata
from pathlib import Path
from typing import List, Set, Dict, Tuple, Optional
import qbittorrentapi
import transmission_rpc
import fnmatch
import shutil
from datetime import datetime
import time
import threading
from tools import logs

logger = logs.logs_configuration()
IS_WINDOWS = platform.system() == "Windows"

class CanceledException(Exception):
    """任务被终止异常"""
    pass

class TaskControl:
    """任务控制器，用于在线程内监听暂停与取消操作"""
    def __init__(self, task_id: int):
        self.task_id = task_id
        self.pause_event = threading.Event()
        self.pause_event.set()  # True 表示运行，False 表示暂停
        self.stop_event = threading.Event()  # True 表示终止
        
    def check_state(self):
        if self.stop_event.is_set():
            raise CanceledException("扫描任务已被终止")
        if not self.pause_event.is_set():
            while not self.pause_event.is_set():
                time.sleep(0.5)
                if self.stop_event.is_set():
                    raise CanceledException("扫描任务在暂停状态下被终止")

def normalize_path(path: str) -> str:
    """
    跨平台与字符编码路径规范化
    - 统一 Unicode 编码为 NFC 规范（防止中文字符跨系统匹配失败）
    - 统一分隔符并消除冗余相对路径 (. / ..)
    - 识别路径类型（Windows 或 Linux/Unix）
    """
    if not path:
        return ""
    
    # 统一 Unicode 形式为 NFC (解决 Mac/Linux/Windows 跨系统挂载中文编码差异)
    path = unicodedata.normalize('NFC', path)
    
    # 统一分隔符
    path = path.replace('\\', os.sep).replace('/', os.sep)
    
    # 标准化相对路径消除多余斜杠与 ..
    path = os.path.normpath(path)
    
    # 移除末尾的分隔符（除非是根目录）
    path = path.rstrip(os.sep)
    
    # 如果路径为空（原来只有分隔符），恢复为根目录
    if not path:
        return os.sep
    
    return path

def is_path_excluded(path: str, excluded_patterns: List[str]) -> bool:
    """
    检查路径是否匹配任何排除模式（支持 Glob 通配符如 *.tmp, **/temp/**）
    """
    if not path or not excluded_patterns:
        return False
        
    path_norm = normalize_path(path)
    for pattern in excluded_patterns:
        pattern_norm = normalize_path(pattern)
        
        # 1. 文件夹前缀匹配（向下兼容原有的前缀排除逻辑）
        if path_norm == pattern_norm or path_norm.startswith(pattern_norm + os.sep):
            return True
            
        # 2. 通配符 Glob 匹配
        if fnmatch.fnmatch(path_norm, pattern_norm):
            return True
            
        # 3. 处理如 **/temp/** 的相对匹配情况
        if '*' in pattern_norm or '?' in pattern_norm:
            if fnmatch.fnmatchcase(path_norm, pattern_norm):
                return True
                
    return False

def translate_path(docker_path: str, path_mapping: Dict[str, str]) -> str:
    """
    将容器路径转换为本地路径
    
    支持两种映射格式：
    1. 完整格式: {"remote": "/data", "local": "/mnt/user/data"}
    2. 简化格式: {"T:\\": "/download"} 或 {"/mnt/data": "/data"}
    """
    if not docker_path or not path_mapping:
        return docker_path
    
    # 尝试完整格式（优先）
    if 'remote' in path_mapping and 'local' in path_mapping:
        remote = path_mapping['remote']
        local = path_mapping['local']
    else:
        if len(path_mapping) != 1:
            logger.warning(f"[路径映射] 格式不正确，跳过: {path_mapping}")
            return docker_path
        
        local, remote = list(path_mapping.items())[0]
    
    remote_normalized = remote.rstrip('/').rstrip('\\')
    local_normalized = local.rstrip('/').rstrip('\\')
    docker_path_normalized = docker_path.rstrip('/').rstrip('\\')
    
    remote_for_compare = remote_normalized.replace('\\', '/')
    docker_for_compare = docker_path_normalized.replace('\\', '/')
    
    # 检查是否匹配（前缀匹配）
    if docker_for_compare == remote_for_compare or docker_for_compare.startswith(remote_for_compare + '/'):
        if docker_for_compare == remote_for_compare:
            relative_part = ""
        else:
            relative_part = docker_for_compare[len(remote_for_compare):].lstrip('/')
        
        if relative_part:
            relative_local = relative_part.replace('/', os.sep)
            if local_normalized and not local_normalized.endswith(os.sep):
                result = local_normalized + os.sep + relative_local
            else:
                result = local_normalized + relative_local
        else:
            result = local_normalized
        
        return normalize_path(result)
    
    return docker_path

def create_client(config: dict):
    """创建并测试客户端连接"""
    ctype = config.get("type", "").lower()
    try:
        if ctype == "qbittorrent":
            client = qbittorrentapi.Client(
                host=config["host"], port=config["port"],
                username=config["username"], password=config["password"],
                REQUESTS_ARGS={'timeout': (5, 15)}
            )
            client.auth_log_in()
            return client
        elif ctype == "transmission":
            return transmission_rpc.Client(
                host=config["host"], port=config["port"],
                username=config["username"], password=config["password"],
                timeout=15
            )
    except Exception as e:
        err_msg = str(e) or repr(e)
        logger.error(f"[客户端] {config.get('name', '未命名')} 连接失败: {err_msg}")
    return None

DOWNLOADING_TORRENT_STATES = {
    # qBittorrent 处于正在下载/排队下载/分配空间/校验等状态
    "downloading", "stalledDL", "metaDL", "forcedDL", "allocating",
    "checkingDL", "queuedDL", "pausedDL",
    # Transmission 处于下载中或校验中
    "downloading", "download_wait", "check", "check_wait"
}

def get_torrents_data(client, client_type: str, mapping_list: List[Dict]) -> Tuple[Set[str], Set[str], Set[Tuple[int, int]], Set[str], Optional[str]]:
    """
    一次性获取所有种子单文件清单，并完成路径转换、物理 Inode 索引与活动下载保护集
    
    Returns:
        save_paths: 种子保存目录集合
        content_paths: 所有单文件的规范化绝对路径白名单集合
        seeded_inodes: 所有正在做种文件的物理 (st_dev, st_ino) 集合 (硬链接穿透保护)
        active_downloading_paths: 处于正在下载状态的单文件规范化路径集合 (防误删 !qB 与临时块)
        error: 错误信息
    """
    save_paths = set()
    content_paths = set()
    seeded_inodes = set()
    active_downloading_paths = set()
    
    try:
        if client_type == "qbittorrent":
            torrents = client.torrents_info()
        else:
            torrents = client.get_torrents()

        for t in torrents:
            raw_save_path = t.save_path if client_type == "qbittorrent" else t.download_dir
            t_name = t.name
            t_state = str(getattr(t, "state", "") or "").lower()
            is_active_dl = any(st in t_state for st in DOWNLOADING_TORRENT_STATES)
            
            # 对每个种子，尝试所有的路径映射关系
            translated_save = raw_save_path
            for mapping in mapping_list:
                translated_save = translate_path(raw_save_path, mapping)
                if translated_save != raw_save_path:
                    break
            
            save_paths.add(translated_save)
            root_path = normalize_path(os.path.join(translated_save, t_name))
            content_paths.add(root_path)
            if is_active_dl:
                active_downloading_paths.add(root_path)

            # 提取单文件级别精确清单
            try:
                if client_type == "qbittorrent":
                    files = client.torrents_files(t.hash)
                    for f in files:
                        f_rel = f.name.replace('/', os.sep).replace('\\', os.sep)
                        full_f_path = normalize_path(os.path.join(translated_save, f_rel))
                        content_paths.add(full_f_path)
                        f_prog = getattr(f, "progress", 1.0)
                        if is_active_dl or (f_prog < 1.0 and f_prog > 0):
                            active_downloading_paths.add(full_f_path)

                        # 记录物理 Inode
                        try:
                            if os.path.exists(full_f_path):
                                st = os.stat(full_f_path)
                                seeded_inodes.add((st.st_dev, st.st_ino))
                        except OSError:
                            pass
                else: # transmission
                    files = t.get_files()
                    for f in files:
                        f_rel = f.name.replace('/', os.sep).replace('\\', os.sep)
                        full_f_path = normalize_path(os.path.join(translated_save, f_rel))
                        content_paths.add(full_f_path)
                        if is_active_dl:
                            active_downloading_paths.add(full_f_path)
                        try:
                            if os.path.exists(full_f_path):
                                st = os.stat(full_f_path)
                                seeded_inodes.add((st.st_dev, st.st_ino))
                        except OSError:
                            pass
            except Exception as fe:
                logger.debug(f"[种子文件获取] 单文件清单展开异常: {fe}")

        return save_paths, content_paths, seeded_inodes, active_downloading_paths, None
    except Exception as e:
        return set(), set(), set(), set(), str(e)

def scan_large_files(
    save_paths: Set[str],
    content_paths: Set[str],
    seeded_inodes: Set[Tuple[int, int]],
    active_downloading_paths: Set[str],
    min_size_mb: int,
    excluded_paths: Set[str],
    task_control=None,
    task_id=None
) -> Tuple[List[str], int]:
    """分阶段扫描未做种文件，支持下载中保护、硬链接 Inode 穿透与修改时间缓冲保护"""
    from module import db
    
    # 1. 索引阶段
    all_files = []
    norm_excluded = [normalize_path(p) for p in excluded_paths]
    
    valid_base_paths = [p for p in save_paths if os.path.exists(p)]
    
    for base_path in valid_base_paths:
        if task_control:
            task_control.check_state()
            
        for root, dirs, files in os.walk(base_path):
            curr_root = normalize_path(root)
            
            # 目录级排除检查
            if is_path_excluded(curr_root, norm_excluded):
                dirs[:] = []
                continue
                
            for file in files:
                if task_control:
                    task_control.check_state()
                full_path = normalize_path(os.path.join(root, file))
                if not is_path_excluded(full_path, norm_excluded):
                    all_files.append(full_path)
                    
    total_files_count = len(all_files)
    
    # 2. 比对做种状态阶段
    unseeded_files = []
    min_size_bytes = min_size_mb * 1024 * 1024
    norm_content = {normalize_path(p) for p in content_paths}
    norm_downloading = {normalize_path(p) for p in active_downloading_paths}
    
    for idx, full_path in enumerate(all_files):
        if task_control:
            task_control.check_state()
            
        if task_id and (idx % 100 == 0 or idx == total_files_count - 1):
            progress_pct = (idx / total_files_count) * 100.0 if total_files_count > 0 else 100.0
            scaled_progress = 10.0 + (progress_pct * 0.85)
            db.update_task_progress(task_id, scaled_progress, f"正在比对文件做种状态: {idx}/{total_files_count}")
            
        try:
            st = os.stat(full_path)
            
            # 安全门 1: 修改时间缓冲锁（5分钟内变动的文件跳过，防写入与移动竞争）
            if time.time() - st.st_mtime < 300:
                continue

            f_size = st.st_size
            if f_size >= min_size_bytes:
                # 检查是否为 !qB 未完成块，若是则提取去除后缀的原路径
                is_qb_part = full_path.endswith(".!qB")
                orig_path = full_path[:-4] if is_qb_part else full_path

                # 规则 1: 正在下载状态保护（若该文件属于活动下载任务，绝不删除！）
                if orig_path in norm_downloading:
                    continue

                is_seeded = False
                
                # 判定 1: 精准单文件绝对路径匹配
                if orig_path in norm_content:
                    is_seeded = True
                # 判定 2: 媒体库/辅种硬链接 Inode 穿透保护
                elif (st.st_dev, st.st_ino) in seeded_inodes:
                    is_seeded = True
                # 判定 3: 目录前缀兜底
                else:
                    for seeded_p in norm_content:
                        if orig_path == seeded_p or orig_path.startswith(seeded_p + os.sep):
                            is_seeded = True
                            break
                            
                if not is_seeded:
                    unseeded_files.append(full_path)
        except OSError:
            continue
            
    return unseeded_files, total_files_count

def find_unseeded_files(
    services: Dict,
    check_file_size: int,
    excluded_paths: Set[str],
    task_control=None,
    task_id=None
) -> Tuple[List[str], List[str], int]:
    """主入口函数，支持单文件索引与硬链接保护"""
    from module import db
    error_messages = []
    
    logger.info(f"[扫描开始] 服务: {services['name']} ({services['type']})")
    if task_id:
        db.update_task_progress(task_id, 3.0, f"正在初始化连接下载客户端: {services['name']}")
        
    client = create_client(services)
    if not client:
        return [], [f"无法连接到客户端: {services['name']}"], 0

    if task_control:
        task_control.check_state()
        
    if task_id:
        db.update_task_progress(task_id, 6.0, "连接成功，正在从客户端拉取单文件做种列表与 Inode 索引...")
        
    # 1. 获取种子路径数据与硬链接 Inode
    save_paths, content_paths, seeded_inodes, active_downloading_paths, err = get_torrents_data(
        client, services["type"], services.get("path_mapping", [])
    )
    
    if err:
        return [], [f"获取种子数据失败: {err}"], 0

    if task_control:
        task_control.check_state()

    if not save_paths:
        logger.info("[扫描] 客户端内无种子或未匹配到路径")
        return [], [], 0

    if task_id:
        db.update_task_progress(task_id, 10.0, "完成拉取种子，正在扫描目录结构构建索引...")

    # 2. 执行物理扫描与多级安全判定
    unseeded_list, total_files_count = scan_large_files(
        save_paths=save_paths,
        content_paths=content_paths,
        seeded_inodes=seeded_inodes,
        active_downloading_paths=active_downloading_paths,
        min_size_mb=check_file_size,
        excluded_paths=excluded_paths,
        task_control=task_control,
        task_id=task_id
    )
    
    return unseeded_list, error_messages, total_files_count

def auto_detect_path_mapping(service_config: dict, candidate_dirs: Optional[List[str]] = None) -> dict:
    """
    智能嗅探并自动推导下载器与本地容器之间的路径映射 (Auto-Sniffing)
    
    原理：
    1. 连通客户端，提取最新 10 个已完成种子的样本文件；
    2. 在 Void 本地可访问目录（如 /data, /downloads 等）中定位该样本文件；
    3. 提取两者的公共相对路径后缀，自动计算出路径替换前缀。
    """
    client = create_client(service_config)
    if not client:
        return {"success": False, "message": "无法连接到下载客户端，请检查 IP/端口/账号密码"}
        
    ctype = service_config.get("type", "qbittorrent").lower()
    
    # 候选本地目录
    if not candidate_dirs:
        candidate_dirs = ["/data", "/downloads", "/media", "/volume1", "/storage"]
    candidate_dirs = [normalize_path(p) for p in candidate_dirs if os.path.exists(normalize_path(p))]
    
    if not candidate_dirs:
        return {"success": False, "message": "未在当前容器内找到任何可扫描的数据目录 (请检查 Docker -v 挂载)"}
        
    try:
        sample_torrents = []
        if ctype == "qbittorrent":
            torrents = client.torrents_info(filter="completed", limit=15)
            if not torrents:
                torrents = client.torrents_info(limit=15)
            for t in torrents:
                try:
                    files = client.torrents_files(t.hash)
                    for f in files:
                        if f.size > 1024 * 1024: # 大于 1MB
                            sample_torrents.append({
                                "save_path": t.save_path,
                                "rel_path": f.name.replace('/', os.sep).replace('\\', os.sep),
                                "filename": os.path.basename(f.name),
                                "size": f.size
                            })
                            break
                    if len(sample_torrents) >= 5:
                        break
                except Exception:
                    pass
        else: # transmission
            torrents = client.get_torrents()[:15]
            for t in torrents:
                try:
                    for f in t.get_files():
                        if f.size > 1024 * 1024:
                            sample_torrents.append({
                                "save_path": t.download_dir,
                                "rel_path": f.name.replace('/', os.sep).replace('\\', os.sep),
                                "filename": os.path.basename(f.name),
                                "size": f.size
                            })
                            break
                    if len(sample_torrents) >= 5:
                        break
                except Exception:
                    pass
                    
        if not sample_torrents:
            return {"success": False, "message": "客户端中暂无做种样本文件可用于对齐（请确保客户端中有在种任务）"}
            
        # 在本地候选目录中搜索匹配的样本文件
        for sample in sample_torrents:
            target_name = sample["filename"]
            target_size = sample["size"]
            
            for c_dir in candidate_dirs:
                for root, _, files in os.walk(c_dir):
                    if target_name in files:
                        local_full = os.path.join(root, target_name)
                        try:
                            # 校验文件大小是否基本吻合 (允许微小误差)
                            if abs(os.path.getsize(local_full) - target_size) <= 4096:
                                remote_full = os.path.join(sample["save_path"], sample["rel_path"])
                                r_norm = remote_full.replace('\\', '/').rstrip('/')
                                l_norm = local_full.replace('\\', '/').rstrip('/')
                                
                                r_parts = [p for p in r_norm.split('/') if p]
                                l_parts = [p for p in l_norm.split('/') if p]
                                
                                match_len = 0
                                for r, l in zip(reversed(r_parts), reversed(l_parts)):
                                    if r.lower() == l.lower():
                                        match_len += 1
                                    else:
                                        break
                                        
                                if match_len > 0:
                                    r_prefix = '/' + '/'.join(r_parts[:-match_len]) if len(r_parts) > match_len else '/'
                                    l_prefix = '/' + '/'.join(l_parts[:-match_len]) if len(l_parts) > match_len else '/'
                                    
                                    if r_prefix == l_prefix:
                                        return {
                                            "success": True,
                                            "status": "identical",
                                            "remote": r_prefix,
                                            "local": l_prefix,
                                            "sample": target_name,
                                            "message": f"🎉 检测到零映射对齐！下载器路径与容器挂载完全一致 ({r_prefix})，无需任何映射！"
                                        }
                                    else:
                                        return {
                                            "success": True,
                                            "status": "mapped",
                                            "remote": r_prefix,
                                            "local": l_prefix,
                                            "sample": target_name,
                                            "message": f"⚡ 自动嗅探推导成功！映射关系：客户端 [{r_prefix}] ➔ 容器 [{l_prefix}]"
                                        }
                        except OSError:
                            continue
                            
        return {
            "success": False,
            "message": "未能自动在本地挂载目录匹配到样本文件，请确认 Docker 容器中是否正确挂载了下载目录"
        }
    except Exception as e:
        return {"success": False, "message": f"自动推导发生异常: {str(e)}"}

def remove_empty_folders(path: str, exit_event=None):
    """递归删除空文件夹"""
    if not os.path.isdir(path):
        return
    for root, dirs, files in os.walk(path, topdown=False):
        if exit_event and exit_event.is_set():
            logger.info("收到退出信号，停止清理空文件夹...")
            break
        for dir_name in dirs:
            dir_path = os.path.join(root, dir_name)
            try:
                if not os.listdir(dir_path):
                    os.rmdir(dir_path)
                    logger.info(f"[空目录清理] 已删除空文件夹: {dir_path}")
            except OSError as e:
                logger.debug(f"[空目录清理] 无法删除文件夹 {dir_path}: {e}")

def process_cleanup(files_to_remove: List[str], config: dict, exit_event=None) -> List[str]:
    """执行物理删除或移动到回收站"""
    enable_recycle = config.get("enable_recycle_bin", False)
    recycle_dir = config.get("recycle_bin_path", "./.trash")
    
    if enable_recycle:
        os.makedirs(recycle_dir, exist_ok=True)
        
    actually_deleted = []
    
    for file_path in files_to_remove:
        if exit_event and exit_event.is_set():
            logger.info("收到退出信号，停止删除文件...")
            break
            
        norm_path = normalize_path(file_path)
        if not os.path.exists(norm_path):
            continue
            
        try:
            if enable_recycle:
                # 移动到回收站
                dest_path = os.path.join(recycle_dir, os.path.basename(norm_path))
                # 如果重名则加上时间戳
                if os.path.exists(dest_path):
                    name, ext = os.path.splitext(os.path.basename(norm_path))
                    dest_path = os.path.join(recycle_dir, f"{name}_{int(time.time())}{ext}")
                shutil.move(norm_path, dest_path)
                logger.info(f"[回收站] 已移动冗余文件至回收站: {norm_path} -> {dest_path}")
            else:
                # 物理删除
                os.remove(norm_path)
                logger.info(f"[物理删除] 已删除未做种文件: {norm_path}")
                
            actually_deleted.append(file_path)
        except OSError as e:
            logger.error(f"[清理失败] 无法删除文件 {norm_path}: {e}")
            
    # 清理涉及到的空文件夹
    cleaned_parents = {os.path.dirname(f) for f in actually_deleted}
    for parent_dir in cleaned_parents:
        if os.path.exists(parent_dir):
            remove_empty_folders(parent_dir, exit_event)
            
    return actually_deleted
