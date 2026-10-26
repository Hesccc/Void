"""
全局目录扫描模块

用于扫描指定目录，并检查该目录中的文件是否在任何一个下载器中做种
支持单文件级精准匹配、媒体库 Inode 硬链接穿透保护与修改时间缓冲保护
"""

import os
import platform
import time
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


def aggregate_seeded_files(services: List[Dict], task_control=None, task_id=None) -> Tuple[Set[str], Set[Tuple[int, int]], Set[str], List[str]]:
    """
    聚合所有下载器的单文件做种列表、物理 Inode 与活动下载保护集
    
    Returns:
        (所有做种文件规范化路径集合, 所有正在做种物理文件的 Inode 集合, 处于下载中的活动文件路径集合, 错误消息列表)
    """
    from module import db
    all_seeded_files = set()
    all_seeded_inodes = set()
    all_downloading_files = set()
    error_messages = []
    
    logger.info(f"[全局扫描] 开始聚合 {len(services)} 个下载器的单文件做种列表与 Inode")
    if task_id:
        db.update_task_progress(task_id, 2.0, "开始拉取各个下载器的单文件做种数据与 Inode...")
        
    total_services = len(services)
    for idx, service in enumerate(services):
        if task_control:
            task_control.check_state()
            
        name = service.get('name', 'Unknown')
        client_type = service.get('type', '')
        
        if task_id:
            progress = 2.0 + (idx / total_services) * 8.0
            db.update_task_progress(task_id, progress, f"正在连接下载器并获取单文件数据: {name}")
            
        try:
            client = create_client(service)
            if not client:
                error_messages.append(f"无法连接到 {name}")
                continue
            
            save_paths, content_paths, seeded_inodes, active_downloading_paths, err = get_torrents_data(
                client, client_type, service.get("path_mapping", [])
            )
            
            if err:
                error_messages.append(f"{name}: {err}")
                continue
            
            all_seeded_files.update(content_paths)
            all_seeded_inodes.update(seeded_inodes)
            all_downloading_files.update(active_downloading_paths)
            logger.info(f"[全局扫描] {name}: 提取到 {len(content_paths)} 个做种文件实体, {len(seeded_inodes)} 个物理 Inode, {len(active_downloading_paths)} 个活动下载保护实体")
            
        except Exception as e:
            error_msg = f"{name} 处理失败: {str(e)}"
            logger.error(f"[全局扫描] {error_msg}")
            error_messages.append(error_msg)
            
    logger.info(f"[全局扫描] 聚合完成，共汇总 {len(all_seeded_files)} 个做种文件，{len(all_seeded_inodes)} 个 Inode，{len(all_downloading_files)} 个活动下载保护文件")
    return all_seeded_files, all_seeded_inodes, all_downloading_files, error_messages


def scan_directory_global(
    scan_paths: List[str],
    all_seeded_files: Set[str],
    all_seeded_inodes: Set[Tuple[int, int]],
    all_downloading_files: Set[str],
    min_size_mb: int,
    excluded_paths: Set[str],
    task_control=None,
    task_id=None
) -> Tuple[List[str], int]:
    """
    全局扫描指定目录，找出未在任何下载器中做种的文件
    引入单文件精准比对 + 硬链接 Inode 穿透 + 活动下载中保护 + 修改时间安全缓冲
    """
    from module import db
    all_files = []
    norm_excluded = [normalize_path(p) for p in excluded_paths]
    
    logger.info(f"[全局扫描] 开始扫描 {len(scan_paths)} 个目标目录")
    if task_id:
        db.update_task_progress(task_id, 10.0, "开始扫描物理目录结构构建索引...")
        
    for scan_path in scan_paths:
        if task_control:
            task_control.check_state()
            
        scan_path_norm = normalize_path(scan_path)
        if not os.path.exists(scan_path_norm):
            logger.warning(f"[全局扫描] 路径不存在，跳过: {scan_path_norm}")
            continue
            
        logger.info(f"[全局扫描] 正在遍历构建索引: {scan_path_norm}")
        for root, dirs, files in os.walk(scan_path_norm):
            if task_control:
                task_control.check_state()
                
            curr_root = normalize_path(root)
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
    unseeded_files = []
    min_size_bytes = min_size_mb * 1024 * 1024
    
    norm_seeded = {normalize_path(p) for p in all_seeded_files}
    norm_downloading = {normalize_path(p) for p in all_downloading_files}
    
    logger.info(f"[全局扫描] 发现 {total_files_count} 个待核验物理文件，开始多级安全判定")
    
    for idx, full_path in enumerate(all_files):
        if task_control:
            task_control.check_state()
            
        if task_id and (idx % 100 == 0 or idx == total_files_count - 1):
            progress_pct = (idx / total_files_count) * 100.0 if total_files_count > 0 else 100.0
            scaled_progress = 10.0 + (progress_pct * 0.85)
            db.update_task_progress(task_id, scaled_progress, f"正在精准比对做种状态: {idx}/{total_files_count}")
            
        try:
            st = os.stat(full_path)
            
            # 安全门 1: 修改时间缓冲锁（5分钟内修改的文件跳过，防写入与移动并发竞争）
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
                
                # 判定 1: 单文件路径绝对精确匹配
                if orig_path in norm_seeded:
                    is_seeded = True
                # 判定 2: 媒体库/辅种硬链接 Inode 穿透保护
                elif (st.st_dev, st.st_ino) in all_seeded_inodes:
                    is_seeded = True
                # 判定 3: 目录前缀兜底
                else:
                    for seeded_path in norm_seeded:
                        if orig_path == seeded_path or orig_path.startswith(seeded_path + os.sep):
                            is_seeded = True
                            break
                            
                if not is_seeded:
                    unseeded_files.append(full_path)
        except OSError as e:
            logger.debug(f"[全局扫描] 无法访问文件: {full_path} - {e}")
            continue
            
    logger.info(f"[全局扫描] 扫描完成，核验了 {total_files_count} 个文件，抓取到 {len(unseeded_files)} 个未做种冗余文件")
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
    全局扫描模式主入口
    """
    local_paths = get_service_local_paths(services)
    
    # 智能处理：若未配置复杂映射，默认采用零映射对齐（只要本地路径存在即扫描）
    if not local_paths:
        associated_scan_paths = [p for p in scan_paths if os.path.exists(normalize_path(p))]
    else:
        associated_scan_paths = []
        for path in scan_paths:
            if is_path_associated_with_downloader(path, local_paths) or os.path.exists(normalize_path(path)):
                associated_scan_paths.append(path)
                
    if not associated_scan_paths:
        return [], ["没有可用的扫描路径，请检查 global_scan.scan_paths 是否挂载并在容器中存在"], 0

    logger.info("=" * 60)
    logger.info("[全局扫描模式] 开始执行 (单文件精确索引 + Inode 硬链接穿透)")
    logger.info(f"[全局扫描模式] 下载器数量: {len(services)}")
    logger.info(f"[全局扫描模式] 目标扫描目录: {associated_scan_paths}")
    logger.info("=" * 60)
    
    # 步骤1: 聚合所有下载器的做种文件与 Inode
    all_seeded_files, all_seeded_inodes, all_downloading_files, error_messages = aggregate_seeded_files(
        services=services, 
        task_control=task_control, 
        task_id=task_id
    )
    
    if not all_seeded_files:
        logger.warning("[全局扫描] 未获取到任何有效做种清单，跳过本次清理以策安全")
        return [], error_messages, 0
        
    # 步骤2: 扫描指定目录
    unseeded_files, total_files_count = scan_directory_global(
        scan_paths=associated_scan_paths,
        all_seeded_files=all_seeded_files,
        all_seeded_inodes=all_seeded_inodes,
        all_downloading_files=all_downloading_files,
        min_size_mb=check_file_size,
        excluded_paths=excluded_paths,
        task_control=task_control,
        task_id=task_id
    )
    
    logger.info("=" * 60)
    logger.info(f"[全局扫描模式] 执行完毕，检出未做种冗余文件: {len(unseeded_files)}")
    logger.info("=" * 60)
    
    return unseeded_files, error_messages, total_files_count
