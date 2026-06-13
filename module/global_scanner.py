"""
全局目录扫描模块

用于扫描指定目录，并检查该目录中的文件是否在任何一个下载器中做种
支持同时连接多个 qBittorrent/Transmission 实例进行跨下载器对比
"""

import os
import platform
from pathlib import Path
from typing import List, Set, Dict, Tuple, Optional
from tools import logs
from module.unseeded import (
    create_client, 
    get_torrents_data, 
    normalize_path,
    is_path_excluded,
    IS_WINDOWS
)

logger = logs.logs_configuration()


def aggregate_seeded_files(services: List[Dict], task_control=None, task_id=None) -> Tuple[Set[str], List[str]]:
    """
    聚合所有下载器的做种文件列表
    
    Args:
        services: 所有下载器配置列表
        task_control: 任务控制器
        task_id: 任务 ID
    
    Returns:
        (所有做种文件的集合, 错误消息列表)
    """
    from module import db
    all_seeded_files = set()
    error_messages = []
    
    logger.info(f"[全局扫描] 开始聚合 {len(services)} 个下载器的做种文件")
    if task_id:
        db.update_task_progress(task_id, 2.0, "开始拉取各个下载器的做种数据...")
        
    total_services = len(services)
    for idx, service in enumerate(services):
        if task_control:
            task_control.check_state()
            
        name = service.get('name', 'Unknown')
        client_type = service.get('type', '')
        
        if task_id:
            progress = 2.0 + (idx / total_services) * 8.0
            db.update_task_progress(task_id, progress, f"正在连接下载器并获取数据: {name}")
            
        try:
            # 创建客户端连接
            client = create_client(service)
            if not client:
                error_messages.append(f"无法连接到 {name}")
                continue
            
            # 获取该下载器的种子数据
            save_paths, content_paths, err = get_torrents_data(
                client, client_type, service.get("path_mapping", [])
            )
            
            if err:
                error_messages.append(f"{name}: {err}")
                continue
            
            # 添加到全局集合
            all_seeded_files.update(content_paths)
            logger.info(f"[全局扫描] {name}: 找到 {len(content_paths)} 个做种文件")
            
        except Exception as e:
            error_msg = f"{name} 处理失败: {str(e)}"
            logger.error(f"[全局扫描] {error_msg}")
            error_messages.append(error_msg)
            
    logger.info(f"[全局扫描] 聚合完成，共 {len(all_seeded_files)} 个做种文件")
    return all_seeded_files, error_messages


def scan_directory_global(
    scan_paths: List[str],
    all_seeded_files: Set[str],
    min_size_mb: int,
    excluded_paths: Set[str],
    task_control=None,
    task_id=None
) -> Tuple[List[str], int]:
    """
    全局扫描指定目录，找出未在任何下载器中做种的文件
    
    Args:
        scan_paths: 要扫描的目录列表
        all_seeded_files: 所有下载器的做种文件集合
        min_size_mb: 最小文件大小（MB）
        excluded_paths: 排除路径集合
        task_control: 任务控制器
        task_id: 任务 ID
    
    Returns:
        (未做种文件列表, 扫描文件总数)
    """
    from module import db
    all_files = []
    norm_excluded = [normalize_path(p) for p in excluded_paths]
    
    logger.info(f"[全局扫描] 开始扫描 {len(scan_paths)} 个目录")
    if task_id:
        db.update_task_progress(task_id, 10.0, "开始扫描目录结构构建索引...")
        
    for scan_path in scan_paths:
        if task_control:
            task_control.check_state()
            
        scan_path_norm = normalize_path(scan_path)
        if not os.path.exists(scan_path_norm):
            logger.warning(f"[全局扫描] 路径不存在，跳过: {scan_path_norm}")
            continue
            
        logger.info(f"[全局扫描] 正在构建目录索引: {scan_path_norm}")
        for root, dirs, files in os.walk(scan_path_norm):
            if task_control:
                task_control.check_state()
                
            curr_root = normalize_path(root)
            # 检查是否在排除路径中（目录级）
            if is_path_excluded(curr_root, norm_excluded):
                dirs[:] = []  # 停止遍历子目录
                continue
                
            for file in files:
                if task_control:
                    task_control.check_state()
                full_path = normalize_path(os.path.join(root, file))
                # 检查是否在排除路径中（文件级）
                if not is_path_excluded(full_path, norm_excluded):
                    all_files.append(full_path)
                    
    total_files_count = len(all_files)
    unseeded_files = []
    min_size_bytes = min_size_mb * 1024 * 1024
    
    # 预处理做种文件路径，方便比较
    norm_seeded = {normalize_path(p) for p in all_seeded_files}
    
    logger.info(f"[全局扫描] 索引构建完成，共发现 {total_files_count} 个待检查文件，开始比对做种状态")
    
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
                for seeded_path in norm_seeded:
                    # 检查文件是否属于某个做种内容
                    # 1. 文件本身是做种文件
                    # 2. 文件在某个做种目录下
                    if full_path == seeded_path or full_path.startswith(seeded_path + os.sep):
                        is_seeded = True
                        break
                if not is_seeded:
                    unseeded_files.append(full_path)
        except OSError as e:
            logger.debug(f"[全局扫描] 无法访问文件: {full_path} - {e}")
            continue
            
    logger.info(f"[全局扫描] 扫描完成，检查了 {total_files_count} 个文件，找到 {len(unseeded_files)} 个未做种文件")
    return unseeded_files, total_files_count


def get_service_local_paths(services: List[Dict]) -> Set[str]:
    local_paths = set()
    for service in services:
        mappings = service.get("path_mapping", [])
        if not mappings:
            continue
        for mapping in mappings:
            if not mapping:
                continue
            if isinstance(mapping, dict):
                if 'local' in mapping:
                    local_paths.add(mapping['local'])
                else:
                    for local in mapping.keys():
                        local_paths.add(local)
    return local_paths


def is_path_associated_with_downloader(scan_path: str, local_paths: Set[str]) -> bool:
    if not scan_path:
        return False
    
    s_path = normalize_path(scan_path)
    
    if IS_WINDOWS:
        s_path = s_path.lower()
        
    for local_path in local_paths:
        l_path = normalize_path(local_path)
        if IS_WINDOWS:
            l_path = l_path.lower()
            
        if s_path == l_path:
            return True
            
        # Check if one is a subdirectory of another
        s_path_sep = s_path + os.sep
        l_path_sep = l_path + os.sep
        
        if s_path.startswith(l_path_sep) or l_path.startswith(s_path_sep):
            return True
            
    return False


def find_unseeded_files_global(
    services: List[Dict],
    scan_paths: List[str],
    check_file_size: int,
    excluded_paths: Set[str],
    task_control=None,
    task_id=None
) -> Tuple[List[str], List[str], int]:
    """
    全局扫描模式入口函数
    
    Args:
        services: 所有下载器配置列表
        scan_paths: 要扫描的目录列表
        check_file_size: 文件大小阈值（MB）
        excluded_paths: 排除路径集合
        task_control: 任务控制器
        task_id: 任务 ID
    
    Returns:
        (未做种文件列表, 错误消息列表, 扫描文件总数)
    """
    # 过滤未与任何下载器关联的扫描目录
    local_paths = get_service_local_paths(services)
    associated_scan_paths = []
    skipped_paths = []
    
    for path in scan_paths:
        if is_path_associated_with_downloader(path, local_paths):
            associated_scan_paths.append(path)
        else:
            skipped_paths.append(path)
            
    if skipped_paths:
        logger.info(f"[全局扫描] 以下路径没有与下载器关联，跳过全局扫描: {skipped_paths}")
        
    if not associated_scan_paths:
        logger.warning("[全局扫描] 没有可用的与下载器关联的扫描路径，全局扫描终止")
        return [], [f"扫描目录没有与下载器关联，已跳过全局扫描: {', '.join(skipped_paths)}"], 0

    logger.info("=" * 60)
    logger.info("[全局扫描模式] 开始执行")
    logger.info(f"[全局扫描模式] 下载器数量: {len(services)}")
    logger.info(f"[全局扫描模式] 原始扫描目录: {scan_paths}")
    logger.info(f"[全局扫描模式] 过滤后关联目录: {associated_scan_paths}")
    logger.info("=" * 60)
    
    # 步骤1: 聚合所有下载器的做种文件
    all_seeded_files, error_messages = aggregate_seeded_files(
        services=services, 
        task_control=task_control, 
        task_id=task_id
    )
    
    if not all_seeded_files:
        logger.warning("[全局扫描] 未找到任何做种文件，可能所有下载器都无连接或无种子")
        return [], error_messages, 0
        
    # 步骤2: 扫描指定目录
    unseeded_files, total_files_count = scan_directory_global(
        scan_paths=associated_scan_paths,
        all_seeded_files=all_seeded_files,
        min_size_mb=check_file_size,
        excluded_paths=excluded_paths,
        task_control=task_control,
        task_id=task_id
    )
    
    logger.info("=" * 60)
    logger.info(f"[全局扫描模式] 完成，未做种文件: {len(unseeded_files)}")
    logger.info("=" * 60)
    
    return unseeded_files, error_messages, total_files_count
