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
    IS_WINDOWS
)

logger = logs.logs_configuration()


def aggregate_seeded_files(services: List[Dict]) -> Tuple[Set[str], List[str]]:
    """
    聚合所有下载器的做种文件列表
    
    Args:
        services: 所有下载器配置列表
    
    Returns:
        (所有做种文件的集合, 错误消息列表)
    """
    all_seeded_files = set()
    error_messages = []
    
    logger.info(f"[全局扫描] 开始聚合 {len(services)} 个下载器的做种文件")
    
    for service in services:
        name = service.get('name', 'Unknown')
        client_type = service.get('type', '')
        
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
    excluded_paths: Set[str]
) -> List[str]:
    """
    全局扫描指定目录，找出未在任何下载器中做种的文件
    
    Args:
        scan_paths: 要扫描的目录列表
        all_seeded_files: 所有下载器的做种文件集合
        min_size_mb: 最小文件大小（MB）
        excluded_paths: 排除路径集合
    
    Returns:
        未做种文件列表
    """
    unseeded_files = []
    min_size_bytes = min_size_mb * 1024 * 1024
    
    # 预处理：规范化做种文件路径和排除路径
    norm_seeded = {normalize_path(p) for p in all_seeded_files}
    norm_excluded = [normalize_path(p) for p in excluded_paths]
    
    logger.info(f"[全局扫描] 开始扫描 {len(scan_paths)} 个目录")
    
    for scan_path in scan_paths:
        scan_path_norm = normalize_path(scan_path)
        
        if not os.path.exists(scan_path_norm):
            logger.warning(f"[全局扫描] 路径不存在，跳过: {scan_path_norm}")
            continue
        
        logger.info(f"[全局扫描] 正在扫描: {scan_path_norm}")
        file_count = 0
        
        for root, dirs, files in os.walk(scan_path_norm):
            curr_root = normalize_path(root)
            
            # 检查是否在排除路径中
            if any(curr_root.startswith(ex) for ex in norm_excluded):
                dirs[:] = []  # 停止遍历子目录
                continue
            
            for file in files:
                file_path = os.path.join(root, file)
                full_path = normalize_path(file_path)
                
                try:
                    # 检查文件大小
                    f_size = os.path.getsize(full_path)
                    if f_size < min_size_bytes:
                        continue
                    
                    file_count += 1
                    
                    # 核心逻辑：检查文件是否在任何下载器的做种列表中
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
        
        logger.info(f"[全局扫描] {scan_path_norm}: 检查了 {file_count} 个文件")
    
    logger.info(f"[全局扫描] 扫描完成，找到 {len(unseeded_files)} 个未做种文件")
    return unseeded_files


def find_unseeded_files_global(
    services: List[Dict],
    scan_paths: List[str],
    check_file_size: int,
    excluded_paths: Set[str]
) -> Tuple[List[str], List[str]]:
    """
    全局扫描模式入口函数
    
    Args:
        services: 所有下载器配置列表
        scan_paths: 要扫描的目录列表
        check_file_size: 文件大小阈值（MB）
        excluded_paths: 排除路径集合
    
    Returns:
        (未做种文件列表, 错误消息列表)
    """
    logger.info("=" * 60)
    logger.info("[全局扫描模式] 开始执行")
    logger.info(f"[全局扫描模式] 下载器数量: {len(services)}")
    logger.info(f"[全局扫描模式] 扫描目录: {scan_paths}")
    logger.info("=" * 60)
    
    # 步骤1: 聚合所有下载器的做种文件
    all_seeded_files, error_messages = aggregate_seeded_files(services)
    
    if not all_seeded_files:
        logger.warning("[全局扫描] 未找到任何做种文件，可能所有下载器都无连接或无种子")
        return [], error_messages
    
    # 步骤2: 扫描指定目录
    unseeded_files = scan_directory_global(
        scan_paths=scan_paths,
        all_seeded_files=all_seeded_files,
        min_size_mb=check_file_size,
        excluded_paths=excluded_paths
    )
    
    logger.info("=" * 60)
    logger.info(f"[全局扫描模式] 完成，未做种文件: {len(unseeded_files)}")
    logger.info("=" * 60)
    
    return unseeded_files, error_messages
