import os
import platform
from pathlib import Path
from typing import List, Set, Dict, Tuple, Optional
import qbittorrentapi
import transmission_rpc
from tools import logs

logger = logs.logs_configuration()
IS_WINDOWS = platform.system() == "Windows"

def normalize_path(path: str) -> str:
    """高度优化的路径规范化"""
    if not path:
        return ""
    # 统一使用对应系统的标准分隔符
    return str(Path(path).resolve())

def translate_path(docker_path: str, path_mapping: Dict[str, str]) -> str:
    """
    将容器路径转换为本地路径
    path_mapping 格式示例: {"remote": "/data", "local": "/mnt/user/data"}
    """
    if not docker_path or not path_mapping:
        return docker_path

    # 获取 remote 和 local，适配你 YAML 优化后的结构
    remote = normalize_path(path_mapping.get('remote', ''))
    local = normalize_path(path_mapping.get('local', ''))
    
    target_path = normalize_path(docker_path)
    
    if remote and target_path.startswith(remote):
        return target_path.replace(remote, local, 1)
    return target_path

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
        logger.error(f"[客户端] {config['name']} 连接失败: {e}")
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

def scan_large_files(save_paths: Set[str], content_paths: Set[str], min_size_mb: int, excluded_paths: Set[str]) -> List[str]:
    """高性能扫描未做种文件"""
    unseeded_files = []
    min_size_bytes = min_size_mb * 1024 * 1024
    
    # 预处理排除路径和内容路径，提升匹配速度
    norm_excluded = [normalize_path(p) for p in excluded_paths]
    norm_content = {normalize_path(p) for p in content_paths}

    for base_path in save_paths:
        if not os.path.exists(base_path):
            logger.warning(f"[扫描] 路径不存在，跳过: {base_path}")
            continue

        for root, dirs, files in os.walk(base_path):
            curr_root = normalize_path(root)
            
            # 1. 排除检查
            if any(curr_root.startswith(ex) for ex in norm_excluded):
                dirs[:] = [] # 停止遍历该子目录
                continue

            for file in files:
                file_path = os.path.join(root, file)
                full_path = normalize_path(file_path)
                
                try:
                    # 2. 只有满足大小的文件才进行核心比对
                    f_size = os.path.getsize(full_path)
                    if f_size >= min_size_bytes:
                        # 3. 核心逻辑：检查该文件是否属于任何一个活跃种子的内容
                        # 使用路径前缀比对，处理种子是单文件或文件夹的情况
                        is_seeded = False
                        for seeded_p in norm_content:
                            if full_path.startswith(seeded_p):
                                is_seeded = True
                                break
                        
                        if not is_seeded:
                            unseeded_files.append(full_path)
                            
                except OSError:
                    continue

    return unseeded_files

def find_unseeded_files(services: Dict, check_file_size: int, excluded_paths: Set[str]) -> Tuple[List[str], List[str]]:
    """主入口函数"""
    error_messages = []
    
    logger.info(f"[扫描开始] 服务: {services['name']} ({services['type']})")
    
    client = create_client(services)
    if not client:
        return [], [f"无法连接到客户端: {services['name']}"]

    # 1. 获取种子路径数据
    save_paths, content_paths, err = get_torrents_data(
        client, services["type"], services.get("path_mapping", [])
    )
    
    if err:
        return [], [f"获取种子数据失败: {err}"]

    if not save_paths:
        logger.info("[扫描] 客户端内无种子或未匹配到路径")
        return [], []

    # 2. 执行物理扫描
    unseeded_list = scan_large_files(
        save_paths=save_paths,
        content_paths=content_paths,
        min_size_mb=check_file_size,
        excluded_paths=excluded_paths
    )
    
    return unseeded_list, error_messages