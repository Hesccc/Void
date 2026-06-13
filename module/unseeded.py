import os
import platform
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
    跨平台路径规范化
    - 识别路径类型（Windows 或 Linux/Unix）
    - Windows路径：保持盘符，统一使用反斜杠
    - Linux路径：保持以/开头，统一使用正斜杠
    """
    if not path:
        return ""
    
    # 统一分隔符
    path = path.replace('\\', os.sep).replace('/', os.sep)
    
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
        # 如果 pattern_norm 是相对路径且使用了通配符，在当前全路径中做相对匹配
        if '*' in pattern_norm or '?' in pattern_norm:
            # 兼容 Unix 和 Windows 下的 fnmatch 的斜杠表现
            if fnmatch.fnmatchcase(path_norm, pattern_norm):
                return True
                
    return False

def translate_path(docker_path: str, path_mapping: Dict[str, str]) -> str:
    """
    将容器路径转换为本地路径
    
    支持两种映射格式：
    1. 完整格式: {"remote": "/data", "local": "/mnt/user/data"}
    2. 简化格式: {"T:\\": "/download"} 或 {"/mnt/data": "/data"}
    
    Args:
        docker_path: 容器内的路径
        path_mapping: 路径映射字典
    
    Returns:
        转换后的本地路径
    """
    if not docker_path or not path_mapping:
        return docker_path
    
    # 尝试完整格式（优先）
    if 'remote' in path_mapping and 'local' in path_mapping:
        remote = path_mapping['remote']
        local = path_mapping['local']
    else:
        # 简化格式：字典只有一个键值对，local: remote
        # 例如： {"T:\\": "/download"} 表示本地T:\ 对应容器内的 /download
        if len(path_mapping) != 1:
            logger.warning(f"[路径映射] 格式不正确，跳过: {path_mapping}")
            return docker_path
        
        local, remote = list(path_mapping.items())[0]
    
    # 标准化路径（不使用resolve避免跨平台问题）
    # 移除末尾的分隔符以便比较
    remote_normalized = remote.rstrip('/').rstrip('\\')
    local_normalized = local.rstrip('/').rstrip('\\')
    docker_path_normalized = docker_path.rstrip('/').rstrip('\\')
    
    # 统一使用正斜杠进行比较（容器路径通常是Linux格式）
    remote_for_compare = remote_normalized.replace('\\', '/')
    docker_for_compare = docker_path_normalized.replace('\\', '/')
    
    # 检查是否匹配（前缀匹配）
    if docker_for_compare == remote_for_compare or docker_for_compare.startswith(remote_for_compare + '/'):
        # 计算相对路径
        if docker_for_compare == remote_for_compare:
            relative_part = ""
        else:
            relative_part = docker_for_compare[len(remote_for_compare):].lstrip('/')
        
        # 构建本地路径
        if relative_part:
            # 使用本地系统的路径分隔符
            relative_local = relative_part.replace('/', os.sep)
            # 确保本地路径有分隔符再拼接（处理Windows盘符情况）
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
                REQUESTS_ARGS={'timeout': (5, 15)} # (连接超时, 读取超时)
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
        logger.error(f"[客户端] {config['name']} 连接失败: {err_msg}")
    return None

def get_torrents_data(client, client_type: str, mapping_list: List[Dict]) -> Tuple[Set[str], Set[str], Optional[str]]:
    """一次性获取所有种子信息并完成路径转换"""
    save_paths = set()
    content_paths = set()
    
    try:
        if client_type == "qbittorrent":
            torrents = client.torrents_info()
        else: # transmission
            torrents = client.get_torrents()

        for t in torrents:
            # 获取原始路径
            raw_save_path = t.save_path if client_type == "qbittorrent" else t.download_dir
            t_name = t.name
            
            # 对每个种子，尝试所有的路径映射关系
            translated_save = raw_save_path
            for mapping in mapping_list:
                translated_save = translate_path(raw_save_path, mapping)
                if translated_save != raw_save_path: # 只要命中一个映射就跳出
                    break
            
            save_paths.add(translated_save)
            # content_paths 存储的是种子的完整物理路径（文件或文件夹）
            content_paths.add(normalize_path(os.path.join(translated_save, t_name)))

        return save_paths, content_paths, None
    except Exception as e:
        return set(), set(), str(e)

def scan_large_files(
    save_paths: Set[str],
    content_paths: Set[str],
    min_size_mb: int,
    excluded_paths: Set[str],
    task_control=None,
    task_id=None
) -> Tuple[List[str], int]:
    """分阶段扫描未做种文件，支持进度更新与状态控制"""
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
                dirs[:] = []  # 停止遍历该子目录
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
    
    for idx, full_path in enumerate(all_files):
        if task_control:
            task_control.check_state()
            
        if task_id and (idx % 100 == 0 or idx == total_files_count - 1):
            progress_pct = (idx / total_files_count) * 100.0 if total_files_count > 0 else 100.0
            scaled_progress = 10.0 + (progress_pct * 0.85)
            db.update_task_progress(task_id, scaled_progress, f"正在比对文件做种状态: {idx}/{total_files_count}")
            
        try:
            f_size = os.path.getsize(full_path)
            if f_size >= min_size_bytes:
                is_seeded = False
                for seeded_p in norm_content:
                    if full_path.startswith(seeded_p):
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
    """主入口函数，支持进度汇报"""
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
        db.update_task_progress(task_id, 6.0, "连接成功，正在从客户端拉取做种列表...")
        
    # 1. 获取种子路径数据
    save_paths, content_paths, err = get_torrents_data(
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

    # 2. 执行物理扫描
    unseeded_list, total_files_count = scan_large_files(
        save_paths=save_paths,
        content_paths=content_paths,
        min_size_mb=check_file_size,
        excluded_paths=excluded_paths,
        task_control=task_control,
        task_id=task_id
    )
    
    return unseeded_list, error_messages, total_files_count

def remove_empty_folders(path: str, exit_event=None):
    """递归清理空目录"""
    try:
        if not os.path.isdir(path) or (exit_event and exit_event.is_set()):
            return
        if not os.listdir(path):
            os.rmdir(path)
            logger.info(f"[清理] 已删除空目录: {path}")
            remove_empty_folders(os.path.dirname(path), exit_event)
    except Exception:
        pass

def move_to_trash(file_path: str, config: dict) -> bool:
    """将文件移动到回收站"""
    try:
        trash_dir = config.get('recycle_bin_path', './.trash')
        file_path_abs = os.path.abspath(file_path)
        trash_dir_abs = os.path.abspath(trash_dir)
        
        # 确保回收站存在
        os.makedirs(trash_dir_abs, exist_ok=True)
        
        # 剥离盘符或根斜杠以在回收站内构建相似的路径结构
        rel_path = file_path_abs
        if ":" in rel_path:
            drive, path_part = os.path.splitdrive(rel_path)
            rel_path = os.path.join(drive.replace(":", ""), path_part.lstrip("\\").lstrip("/"))
        else:
            rel_path = rel_path.lstrip("/")
            
        target_path = os.path.join(trash_dir_abs, rel_path)
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        
        # 解决同名文件冲突
        if os.path.exists(target_path):
            base, ext = os.path.splitext(target_path)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            target_path = f"{base}_{timestamp}{ext}"
            
        shutil.move(file_path_abs, target_path)
        logger.info(f"[回收站] 已移动到回收站: {file_path} -> {target_path}")
        return True
    except Exception as e:
        logger.error(f"[回收站] 移动失败 {file_path}: {e}")
        return False

def process_cleanup(file_list: list, config: dict, exit_event=None):
    """文件清理逻辑 (支持回收站与物理删除)"""
    actual_deleted = []
    enable_recycle = config.get('enable_recycle_bin', False)
    
    for file_path in file_list:
        if exit_event and exit_event.is_set():
            break
        try:
            if os.path.exists(file_path):
                if enable_recycle:
                    success = move_to_trash(file_path, config)
                    if success:
                        actual_deleted.append(file_path)
                        remove_empty_folders(os.path.dirname(file_path), exit_event)
                else:
                    os.remove(file_path)
                    actual_deleted.append(file_path)
                    logger.info(f"[删除] 成功物理删除: {file_path}")
                    remove_empty_folders(os.path.dirname(file_path), exit_event)
        except Exception as e:
            logger.error(f"[清理] 失败 {file_path}: {e}")
            
    return actual_deleted