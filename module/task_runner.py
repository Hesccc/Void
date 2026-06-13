import os
import time
import threading
import logging
from datetime import datetime
from typing import Dict

from tools import config as config_tool
from module import db, unseeded, global_scanner, notification
from module.unseeded import TaskControl, CanceledException

logger = logging.getLogger('Void')

# 全局运行中任务字典
active_tasks: Dict[int, TaskControl] = {}
active_tasks_lock = threading.Lock()

def get_size_mb(path: str) -> float:
    try:
        if os.path.exists(path):
            return os.path.getsize(path) / (1024 * 1024)
    except Exception:
        return 0.0

def start_task(mode: str, trigger_type: str) -> int:
    """
    创建一个新任务并启动后台执行线程
    
    Args:
        mode: 任务模式 (normal, global)
        trigger_type: 触发类型 (manual, cron)
        
    Returns:
        新创建任务的 ID
    """
    conn = db.get_db_connection()
    try:
        cursor = conn.cursor()
        created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute(
            "INSERT INTO tasks (status, mode, trigger_type, progress, progress_msg, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            ("pending", mode, trigger_type, 0.0, "任务已创建，等待启动...", created_at)
        )
        conn.commit()
        task_id = cursor.lastrowid
    finally:
        conn.close()
        
    # 异步启动后台线程
    t = threading.Thread(target=run_task_thread, args=(task_id, mode, trigger_type), daemon=True)
    t.start()
    
    return task_id

def run_task_thread(task_id: int, mode: str, trigger_type: str):
    """后台任务执行线程"""
    logger.info(f"[任务 {task_id}] 后台执行线程已启动 (模式: {mode}, 触发: {trigger_type})")
    
    # 初始化控制器并注册
    task_control = TaskControl(task_id)
    with active_tasks_lock:
        active_tasks[task_id] = task_control
        
    started_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db.update_task_status(task_id, "running", started_at=started_at)
    db.update_task_progress(task_id, 0.0, "任务启动中...")
    
    # 自动清理 180 天前的历史任务记录
    db.clean_old_tasks()
    
    try:
        config = config_tool.yaml_configuration()
        services = config.get('services', [])
        min_size = config.get('checkfile_size', 0)
        excluded = set(config.get('excluded_paths', []))
        auto_remove = config.get('enable_auto_remove', False)
        
        all_unseeded_results = []
        total_files_scanned = 0
        all_errors = []
        
        if mode == "global":
            global_scan_config = config.get('global_scan', {})
            scan_paths = global_scan_config.get('scan_paths', [])
            
            if not services:
                raise ValueError("未配置任何下载器服务")
            if not scan_paths:
                raise ValueError("未配置扫描路径")
                
            files_to_remove, error_messages, total_scanned = global_scanner.find_unseeded_files_global(
                services=services,
                scan_paths=scan_paths,
                check_file_size=min_size,
                excluded_paths=excluded,
                task_control=task_control,
                task_id=task_id
            )
            total_files_scanned = total_scanned
            all_errors.extend(error_messages)
            
            for f in files_to_remove:
                all_unseeded_results.append({
                    "file_path": f,
                    "file_size_mb": get_size_mb(f),
                    "service_name": "全局扫描模式",
                    "deleted": 0
                })
                
            task_control.check_state()
            
            if files_to_remove:
                deleted_info = {"deleted_files": files_to_remove, "total_size": sum(get_size_mb(f) for f in files_to_remove)}
                if auto_remove:
                    logger.info(f"[任务 {task_id}] 自动清理启用，正在清理文件...")
                    db.update_task_progress(task_id, 96.0, "正在自动清理未做种文件...")
                    actual_deleted = unseeded.process_cleanup(files_to_remove, config, task_control.stop_event)
                    actual_deleted_set = set(actual_deleted)
                    for res in all_unseeded_results:
                        if res["file_path"] in actual_deleted_set:
                            res["deleted"] = 1
                    notification.send_notification(
                        {"name": "GlobalScan", "type": "global"}, 
                        config, 
                        True, 
                        deleted_info=deleted_info
                    )
                else:
                    notification.send_notification(
                        {"name": "GlobalScan", "type": "global"}, 
                        config, 
                        True, 
                        deleted_info=deleted_info
                    )
            else:
                if error_messages:
                    notification.send_notification(
                        {"name": "GlobalScan", "type": "global"}, 
                        config, 
                        False, 
                        error=error_messages
                    )
                    
        else:  # normal mode
            if not services:
                raise ValueError("未配置任何下载器服务")
                
            for s_idx, item in enumerate(services):
                task_control.check_state()
                name = item.get('name', 'Unknown')
                
                # 针对多服务做个进度分区提示，防止进度条倒退或混乱
                db.update_task_progress(task_id, (s_idx / len(services)) * 100.0, f"正在扫描服务: {name}")
                
                files_to_remove, error_messages, total_scanned = unseeded.find_unseeded_files(
                    services=item,
                    check_file_size=min_size,
                    excluded_paths=excluded,
                    task_control=task_control,
                    task_id=task_id
                )
                total_files_scanned += total_scanned
                all_errors.extend(error_messages)
                
                service_results = []
                for f in files_to_remove:
                    res_item = {
                        "file_path": f,
                        "file_size_mb": get_size_mb(f),
                        "service_name": name,
                        "deleted": 0
                    }
                    service_results.append(res_item)
                    all_unseeded_results.append(res_item)
                    
                task_control.check_state()
                
                if files_to_remove:
                    deleted_info = {"deleted_files": files_to_remove, "total_size": sum(get_size_mb(f) for f in files_to_remove)}
                    if auto_remove:
                        logger.info(f"[任务 {task_id}] 自动清理启用，正在清理服务 {name} 的文件...")
                        db.update_task_progress(task_id, ((s_idx + 0.9) / len(services)) * 100.0, f"正在自动清理 {name} 的未做种文件...")
                        actual_deleted = unseeded.process_cleanup(files_to_remove, config, task_control.stop_event)
                        actual_deleted_set = set(actual_deleted)
                        for res in service_results:
                            if res["file_path"] in actual_deleted_set:
                                res["deleted"] = 1
                        notification.send_notification(item, config, True, deleted_info=deleted_info)
                    else:
                        notification.send_notification(item, config, True, deleted_info=deleted_info)
                else:
                    if error_messages:
                        notification.send_notification(item, config, False, error=error_messages)
                        
        # 保存结果
        task_control.check_state()
        if all_unseeded_results:
            db.save_scan_results(task_id, all_unseeded_results)
            
        completed_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        db.update_task_status(
            task_id, 
            "completed", 
            completed_at=completed_at,
            total_files_scanned=total_files_scanned,
            total_unseeded_found=len(all_unseeded_results)
        )
        db.update_task_progress(task_id, 100.0, "扫描完成")
        logger.info(f"[任务 {task_id}] 扫描成功完成")
        
    except CanceledException as ce:
        logger.warning(f"[任务 {task_id}] 被终止: {ce}")
        completed_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        db.update_task_status(task_id, "canceled", completed_at=completed_at)
        db.update_task_progress(task_id, 100.0, "任务已被用户终止")
        
    except Exception as e:
        logger.error(f"[任务 {task_id}] 执行异常: {e}", exc_info=True)
        completed_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        db.update_task_status(task_id, "failed", completed_at=completed_at)
        db.update_task_progress(task_id, 100.0, f"任务异常失败: {e}")
        
    finally:
        with active_tasks_lock:
            active_tasks.pop(task_id, None)

def pause_task(task_id: int) -> bool:
    """暂停任务"""
    with active_tasks_lock:
        control = active_tasks.get(task_id)
        if control:
            control.pause_event.clear()
            db.update_task_status(task_id, "paused")
            db.update_task_progress(task_id, -1, "已暂停") # -1 表示保留原 progress，只更新消息
            logger.info(f"[任务 {task_id}] 已被暂停")
            return True
    return False

def resume_task(task_id: int) -> bool:
    """继续任务"""
    with active_tasks_lock:
        control = active_tasks.get(task_id)
        if control:
            control.pause_event.set()
            db.update_task_status(task_id, "running")
            db.update_task_progress(task_id, -1, "正在继续扫描...") # -1 表示保留原 progress，只更新消息
            logger.info(f"[任务 {task_id}] 已被恢复运行")
            return True
    return False

def cancel_task(task_id: int) -> bool:
    """终止任务"""
    # 无论任务在内存中是否存在，都支持置位
    with active_tasks_lock:
        control = active_tasks.get(task_id)
        if control:
            control.stop_event.set()
            # 如果处于暂停状态，唤醒它以使其能抛出 CanceledException 退出
            control.pause_event.set()
            logger.info(f"[任务 {task_id}] 信号已置为终止")
            return True
        else:
            # 如果内存里没了但数据库里还是非完结状态，直接强行更新数据库状态
            db.update_task_status(task_id, "canceled", completed_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
            db.update_task_progress(task_id, 100.0, "任务已被强制终止")
            logger.info(f"[任务 {task_id}] 不在内存中，已强制更新数据库状态为已终止")
            return True
