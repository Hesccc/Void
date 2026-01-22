import os
import time
import signal
import sys
import threading
import schedule
from tools import logs, config as config_tool
from module import notification, unseeded, global_scanner


# 初始化日志
logger = logs.logs_configuration()

# 全局退出标志
exit_event = threading.Event()

def handle_exit(signum, frame):
    """处理 Docker 停止信号 (SIGTERM/SIGINT)"""
    logger.info(f"--- 收到信号 {signum}, 正在安全退出... ---")
    exit_event.set()

# 注册信号
signal.signal(signal.SIGTERM, handle_exit)
signal.signal(signal.SIGINT, handle_exit)

def get_size_mb(path: str) -> float:
    try:
        if os.path.exists(path):
            return os.path.getsize(path) / (1024 * 1024)
    except Exception:
        return 0.0

def remove_empty_folders(path: str):
    """递归清理空目录"""
    try:
        if not os.path.isdir(path) or exit_event.is_set():
            return
        if not os.listdir(path):
            os.rmdir(path)
            logger.info(f"[清理] 已删除空目录: {path}")
            remove_empty_folders(os.path.dirname(path))
    except Exception:
        pass

def process_cleanup(file_list: list):
    """物理删除逻辑"""
    actual_deleted = []
    for file_path in file_list:
        if exit_event.is_set(): break # 停止期间不再执行后续删除
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                actual_deleted.append(file_path)
                logger.info(f"[删除] 成功: {file_path}")
                remove_empty_folders(os.path.dirname(file_path))
        except Exception as e:
            logger.error(f"[删除] 失败 {file_path}: {e}")
    return actual_deleted

def main_task_normal_mode(config: dict):
    """普通模式：每个下载器独立扫描"""
    services = config.get('services', [])
    min_size = config.get('checkfile_size', 0)
    excluded = set(config.get('excluded_paths', []))
    auto_remove = config.get('enable_auto_remove', False)

    for item in services:
        if exit_event.is_set(): 
            break
        
        name = item.get('name', 'Unknown')
        logger.info(f"--- 正在扫描服务: {name} ---")
        
        files_to_remove, error_messages = unseeded.find_unseeded_files(
            services=item, 
            check_file_size=min_size, 
            excluded_paths=excluded
        )
    
        if files_to_remove:
            total_size = sum(get_size_mb(f) for f in files_to_remove)
            deleted_info = {"deleted_files": files_to_remove, "total_size": total_size}

            if auto_remove:
                process_cleanup(files_to_remove)
                notification.send_notification(item, config, True, deleted_info=deleted_info)
            else:
                logger.info(f"[报告] 发现 {len(files_to_remove)} 个文件 (预览模式)")
                notification.send_notification(item, config, True, deleted_info=deleted_info)
        else:
            if error_messages:
                notification.send_notification(item, config, False, error=error_messages)
            else:
                logger.info(f"[扫描] {name} 目录整洁")


def main_task_global_mode(config: dict):
    """全局模式：扫描共享目录并跨所有下载器检查"""
    global_scan_config = config.get('global_scan', {})
    services = config.get('services', [])
    scan_paths = global_scan_config.get('scan_paths', [])
    min_size = config.get('checkfile_size', 0)
    excluded = set(config.get('excluded_paths', []))
    auto_remove = config.get('enable_auto_remove', False)
    
    if not services:
        logger.error("[全局扫描] 未配置任何下载器服务")
        return
    
    if not scan_paths:
        logger.error("[全局扫描] 未配置扫描路径")
        return
    
    # 执行全局扫描
    files_to_remove, error_messages = global_scanner.find_unseeded_files_global(
        services=services,
        scan_paths=scan_paths,
        check_file_size=min_size,
        excluded_paths=excluded
    )
    
    # 处理扫描结果
    if files_to_remove:
        total_size = sum(get_size_mb(f) for f in files_to_remove)
        deleted_info = {"deleted_files": files_to_remove, "total_size": total_size}
        
        if auto_remove:
            logger.info(f"[全局扫描] 准备删除 {len(files_to_remove)} 个文件")
            process_cleanup(files_to_remove)
            notification.send_notification(
                {"name": "GlobalScan", "type": "global"}, 
                config, 
                True, 
                deleted_info=deleted_info
            )
        else:
            logger.info(f"[全局扫描] 发现 {len(files_to_remove)} 个未做种文件 (预览模式)")
            notification.send_notification(
                {"name": "GlobalScan", "type": "global"}, 
                config, 
                True, 
                deleted_info=deleted_info
            )
    else:
        if error_messages:
            logger.warning(f"[全局扫描] 完成，但有错误: {error_messages}")
            notification.send_notification(
                {"name": "GlobalScan", "type": "global"}, 
                config, 
                False, 
                error=error_messages
            )
        else:
            logger.info("[全局扫描] 完成，所有文件都在做种中")


def main_task():
    """主任务入口：根据配置自动选择扫描模式"""
    config = config_tool.yaml_configuration()
    
    # 检查是否启用全局扫描模式
    global_scan_config = config.get('global_scan', {})
    is_global_mode = global_scan_config.get('enabled', False)
    
    if is_global_mode:
        logger.info("[模式] 全局扫描模式")
        main_task_global_mode(config)
    else:
        logger.info("[模式] 普通扫描模式")
        main_task_normal_mode(config)


if __name__ == "__main__":
    init_config = config_tool.yaml_configuration()
    interval = init_config.get('check_interval', 60)
    
    # 检测运行模式
    global_scan_config = init_config.get('global_scan', {})
    is_global_mode = global_scan_config.get('enabled', False)
    mode_name = "全局扫描模式" if is_global_mode else "普通模式"

    logger.info(f"===== Void 服务 已启动 ({mode_name}) =====")
    logger.info(f"清理: {'【自动清理】' if init_config.get('enable_auto_remove') else '【仅扫描报告】'}")
    logger.info(f"周期: 每 {interval} 分钟执行一次")
    
    if is_global_mode:
        scan_paths = global_scan_config.get('scan_paths', [])
        logger.info(f"扫描目录: {scan_paths}")
        logger.info(f"下载器数量: {len(init_config.get('services', []))}")
    
    # 立即执行一次
    main_task()

    # 注册定时器
    schedule.every(interval).minutes.do(main_task)

    # 优雅的循环
    while not exit_event.is_set():
        schedule.run_pending()
        # 每隔 1 秒检查一次退出标志，而不是阻塞在这里
        if exit_event.wait(timeout=1):
            break
            
    logger.info("===== 程序已安全停止 =====")
    sys.exit(0)

# test github action