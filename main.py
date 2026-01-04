import os
import time
import signal
import sys
import threading
import schedule
from tools import logs, config as config_tool
from module import notification, unseeded


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

def main_task():
    """单次扫描任务主逻辑"""
    config = config_tool.yaml_configuration()
    services = config.get('services', [])
    min_size = config.get('checkfile_size', 0)
    excluded = set(config.get('excluded_paths', []))
    auto_remove = config.get('enable_auto_remove', False)

    for item in services:
        if exit_event.is_set(): break
        
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
                # 可选：不发现文件时不发通知以减少打扰
                # notification.send_notification(item, config, False)


if __name__ == "__main__":
    init_config = config_tool.yaml_configuration()
    interval = init_config.get('check_interval', 60)

    logger.info(f"===== Void 服务 已启动 =====")
    logger.info(f"模式: {'【自动清理】' if init_config.get('enable_auto_remove') else '【仅扫描报告】'}")
    logger.info(f"周期: 每 {interval} 分钟执行一次")
    
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