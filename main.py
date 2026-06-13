import os
import time
import signal
import sys
import threading
import schedule
from tools import logs, config as config_tool
from module import db, task_runner

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


def main_task():
    """主任务入口：使用 task_runner 调度并记录到 SQLite"""
    try:
        # 确保数据库已初始化
        db.init_db()
        
        # 检查是否已有活动中的任务，避免并发冲突
        conn = db.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM tasks WHERE status IN ('pending', 'running', 'paused')")
        active_count = cursor.fetchone()[0]
        conn.close()
        
        if active_count > 0:
            logger.info("[调度器] 检测到已有活动中的扫描任务，跳过本次定时触发。")
            return
            
        config = config_tool.yaml_configuration()
        global_scan_config = config.get('global_scan', {})
        is_global_mode = global_scan_config.get('enabled', False)
        mode = "global" if is_global_mode else "normal"
        
        logger.info(f"[调度器] 自动触发扫描任务 (模式: {mode})")
        task_id = task_runner.start_task(mode=mode, trigger_type="cron")
        logger.info(f"[调度器] 自动扫描任务已启动，任务 ID: {task_id}")
    except Exception as e:
        logger.error(f"[调度器] 启动自动扫描任务失败: {e}", exc_info=True)


def run_web_server():
    import uvicorn
    from module.web_server import app
    
    # 重新加载配置以获取正确的 web_port
    config = config_tool.yaml_configuration()
    web_port = config.get('web_port', 8000)
    
    logger.info(f"[Web] 正在启动 GUI 管理界面，监听端口: {web_port}...")
    try:
        uvicorn.run(app, host="0.0.0.0", port=web_port, log_config=None)
    except Exception as e:
        logger.error(f"[Web] GUI 启动失败: {e}")


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
        
    # 确保数据库表在 web 服务器和定时任务开始前已正确初始化
    db.init_db()
    
    # 启动 Web UI 线程
    web_thread = threading.Thread(target=run_web_server, daemon=True)
    web_thread.start()
    
    # 注册定时器
    schedule.every(interval).minutes.do(main_task)

    # 优雅的循环
    last_interval = interval
    check_counter = 0
    
    while not exit_event.is_set():
        schedule.run_pending()
        
        # 每隔 10 秒重新读取一下配置，看看执行频率是否发生改变
        check_counter += 1
        if check_counter >= 10:
            check_counter = 0
            try:
                current_config = config_tool.yaml_configuration()
                current_interval = current_config.get('check_interval', 60)
                if current_interval != last_interval:
                    logger.info(f"[调度器] 检测到执行频率改变: {last_interval} 分钟 -> {current_interval} 分钟，正在重新注册定时器...")
                    schedule.clear()
                    schedule.every(current_interval).minutes.do(main_task)
                    last_interval = current_interval
            except Exception:
                pass
                
        # 每隔 1 秒检查一次退出标志，而不是阻塞在这里
        if exit_event.wait(timeout=1):
            break
            
    logger.info("===== 程序已安全停止 =====")
    sys.exit(0)