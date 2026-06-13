import os
import sys
import yaml
import asyncio
import logging
import secrets
import time
from typing import List, Dict
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse, JSONResponse
from pydantic import BaseModel

from tools import config as config_tool
from module import unseeded, global_scanner, db

# 获取日志记录器
logger = logging.getLogger('Void')

app = FastAPI(title="Void Web Server")
app.mount("/static", StaticFiles(directory="static"), name="static")
scan_lock = asyncio.Lock()

# 会话管理
active_sessions: Dict[str, dict] = {}
SESSION_EXPIRE_SECONDS = 24 * 3600

# Pydantic 校验模型
class LoginModel(BaseModel):
    username: str
    password: str

class ChangePasswordModel(BaseModel):
    old_password: str
    new_password: str

class ConfigUpdateModel(BaseModel):
    check_interval: int
    enable_auto_remove: bool
    notification_type: str
    checkfile_size: int
    excluded_paths: List[str]
    email: Dict = {}
    webhook: Dict = {}
    wecom: Dict = {}
    services: List[Dict] = []
    global_scan: Dict = {}
    web_port: int = 8000
    enable_recycle_bin: bool = False
    recycle_bin_path: str = "./.trash"

class DeleteFilesModel(BaseModel):
    files: List[str]

class CreateTaskModel(BaseModel):
    mode: str = "normal"  # normal, global
    force: bool = False

def get_size_mb(path: str) -> float:
    try:
        if os.path.exists(path):
            return os.path.getsize(path) / (1024 * 1024)
    except Exception:
        return 0.0

@app.on_event("startup")
async def startup_event():
    """初始化数据库并清理旧的历史记录"""
    db.init_db()
    db.clean_old_tasks()

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    
    # 白名单，不需要认证
    whitelist = [
        "/",
        "/favicon.png",
        "/api/auth/login"
    ]
    
    if path in whitelist or path.startswith("/static/"):
        return await call_next(request)
        
    # 其他 /api/ 路由需要鉴权
    if path.startswith("/api/"):
        token = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
        elif request.query_params.get("token"):
            token = request.query_params.get("token")
            
        if not token:
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
            
        session = active_sessions.get(token)
        
        if not session or time.time() - session["created_at"] > SESSION_EXPIRE_SECONDS:
            if token in active_sessions:
                del active_sessions[token]
            return JSONResponse(status_code=401, content={"detail": "Session expired or invalid"})
            
        # 将用户信息挂载到 request 状态中
        request.state.user = session["user"]
        
    return await call_next(request)

@app.post("/api/auth/login")
async def login(data: LoginModel):
    user = db.verify_user(data.username, data.password)
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
        
    token = secrets.token_hex(32)
    active_sessions[token] = {
        "user": user,
        "created_at": time.time()
    }
    
    return {
        "success": True, 
        "token": token, 
        "must_change_password": bool(user["must_change_password"])
    }

@app.get("/api/auth/check")
async def check_auth(request: Request):
    user = request.state.user
    return {
        "success": True, 
        "username": user["username"], 
        "must_change_password": bool(user["must_change_password"])
    }

@app.post("/api/auth/change-password")
async def change_password(data: ChangePasswordModel, request: Request):
    user = request.state.user
    verified_user = db.verify_user(user["username"], data.old_password)
    if not verified_user:
        raise HTTPException(status_code=400, detail="旧密码错误")
        
    if db.update_user_password(user["id"], data.new_password):
        request.state.user["must_change_password"] = 0
        active_sessions[request.headers.get("Authorization").split(" ")[1]]["user"]["must_change_password"] = 0
        return {"success": True, "message": "密码修改成功"}
    else:
        raise HTTPException(status_code=500, detail="密码修改失败")

@app.post("/api/auth/logout")
async def logout(request: Request):
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        if token in active_sessions:
            del active_sessions[token]
    return {"success": True}

@app.get("/", response_class=HTMLResponse)
async def read_index():
    static_path = "./static/index.html"
    if os.path.exists(static_path):
        with open(static_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read(), status_code=200)
    return HTMLResponse(content="<h1>Void GUI Frontend not found.</h1>", status_code=404)

@app.get("/favicon.png")
async def get_favicon():
    favicon_path = "./static/favicon.png"
    if os.path.exists(favicon_path):
        return FileResponse(favicon_path)
    raise HTTPException(status_code=404, detail="Favicon not found")

@app.get("/api/config")
async def get_config():
    try:
        config = config_tool.yaml_configuration()
        # 补充默认值
        if 'web_port' not in config:
            config['web_port'] = 8000
        if 'enable_recycle_bin' not in config:
            config['enable_recycle_bin'] = False
        if 'recycle_bin_path' not in config:
            config['recycle_bin_path'] = "./.trash"
        return config
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取配置失败: {e}")

@app.post("/api/config")
async def update_config(config_data: ConfigUpdateModel):
    config_file = os.getenv("CONFIG_PATH", "./config/config.yaml")
    try:
        # 转换为字典并序列化写回 yaml
        data_dict = config_data.model_dump()
        with open(config_file, 'w', encoding='utf-8') as f:
            yaml.safe_dump(data_dict, f, allow_unicode=True, sort_keys=False)
        logger.info("[Web API] 成功更新配置文件")
        return {"success": True, "message": "配置更新成功"}
    except Exception as e:
        logger.error(f"[Web API] 更新配置文件失败: {e}")
        raise HTTPException(status_code=500, detail=f"保存配置失败: {e}")

@app.post("/api/config/test")
async def test_downloader_connection(service: dict):
    try:
        client = unseeded.create_client(service)
        if client:
            # 校验 TR 连通性
            if service.get("type", "").lower() == "transmission":
                try:
                    client.get_session()
                except Exception as e:
                    return {"success": False, "error": f"Transmission API 异常: {e}"}
            return {"success": True}
        else:
            return {"success": False, "error": "连接测试失败，无法登录或网络不可达"}
    except Exception as e:
        return {"success": False, "error": f"测试时抛出异常: {e}"}

@app.post("/api/scan/dry-run")
async def scan_dry_run():
    async with scan_lock:
        logger.info("[Web API] 收到手动扫描请求 (Dry-Run)")
        try:
            config = config_tool.yaml_configuration()
            services = config.get('services', [])
            min_size = config.get('checkfile_size', 0)
            excluded = set(config.get('excluded_paths', []))
            
            global_scan_config = config.get('global_scan', {})
            is_global_mode = global_scan_config.get('enabled', False)
            
            results = []
            errors = []
            
            if is_global_mode:
                scan_paths = global_scan_config.get('scan_paths', [])
                files, errs, _ = global_scanner.find_unseeded_files_global(
                    services=services,
                    scan_paths=scan_paths,
                    check_file_size=min_size,
                    excluded_paths=excluded
                )
                errors.extend(errs)
                for f in files:
                    results.append({
                        "file_path": f,
                        "file_size_mb": get_size_mb(f),
                        "service_name": "全局扫描模式"
                    })
            else:
                for item in services:
                    name = item.get('name', 'Unknown')
                    files, errs, _ = unseeded.find_unseeded_files(
                        services=item,
                        check_file_size=min_size,
                        excluded_paths=excluded
                    )
                    errors.extend(errs)
                    for f in files:
                        results.append({
                            "file_path": f,
                            "file_size_mb": get_size_mb(f),
                            "service_name": name
                        })
            
            return {"success": True, "files": results, "errors": errors}
        except Exception as e:
            logger.error(f"[Web API] 手动扫描失败: {e}")
            raise HTTPException(status_code=500, detail=f"扫描执行失败: {e}")

@app.post("/api/delete")
async def delete_files(payload: DeleteFilesModel):
    async with scan_lock:
        logger.info(f"[Web API] 收到手动删除文件请求，数量: {len(payload.files)}")
        try:
            config = config_tool.yaml_configuration()
            # 临时补充默认配置
            if 'enable_recycle_bin' not in config:
                config['enable_recycle_bin'] = False
            if 'recycle_bin_path' not in config:
                config['recycle_bin_path'] = "./.trash"
                
            deleted = unseeded.process_cleanup(payload.files, config)
            if deleted:
                try:
                    conn = db.get_db_connection()
                    cursor = conn.cursor()
                    cursor.executemany(
                        "UPDATE scan_results SET deleted = 1 WHERE file_path = ?",
                        [(f,) for f in deleted]
                    )
                    conn.commit()
                    conn.close()
                    logger.info(f"[Web API] 已在数据库中将 {len(deleted)} 个文件标记为 deleted=1")
                except Exception as db_err:
                    logger.error(f"[Web API] 标记数据库中删除文件状态失败: {db_err}")
                    
            return {"success": True, "deleted": deleted, "failed": list(set(payload.files) - set(deleted))}
        except Exception as e:
            logger.error(f"[Web API] 手动删除失败: {e}")
            raise HTTPException(status_code=500, detail=f"删除文件失败: {e}")

@app.get("/api/tasks")
async def get_tasks():
    """获取所有任务列表"""
    try:
        conn = db.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tasks ORDER BY id DESC")
        rows = cursor.fetchall()
        tasks = [dict(row) for row in rows]
        conn.close()
        return {"success": True, "tasks": tasks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tasks")
async def create_task(payload: CreateTaskModel):
    """创建扫描任务"""
    try:
        if not payload.force:
            conn = db.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM tasks WHERE status IN ('pending', 'running', 'paused')")
            count = cursor.fetchone()[0]
            conn.close()
            if count > 0:
                return {
                    "warning_pending": True,
                    "message": "当前已有未完成的扫描任务，是否继续创建？"
                }
        
        from module import task_runner
        mode = payload.mode
        if mode not in ("normal", "global"):
            config = config_tool.yaml_configuration()
            is_global = config.get("global_scan", {}).get("enabled", False)
            mode = "global" if is_global else "normal"
            
        task_id = task_runner.start_task(mode=mode, trigger_type="manual")
        return {"success": True, "task_id": task_id}
    except Exception as e:
        logger.error(f"[Web API] 创建任务失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tasks/{task_id}/pause")
async def pause_task(task_id: int):
    """暂停任务"""
    from module import task_runner
    success = task_runner.pause_task(task_id)
    if success:
        return {"success": True}
    else:
        raise HTTPException(status_code=400, detail="无法暂停（该任务可能已结束，或不在运行状态中）")

@app.post("/api/tasks/{task_id}/resume")
async def resume_task(task_id: int):
    """恢复/继续任务"""
    from module import task_runner
    success = task_runner.resume_task(task_id)
    if success:
        return {"success": True}
    else:
        raise HTTPException(status_code=400, detail="无法恢复（该任务可能已结束，或不在暂停状态中）")

@app.post("/api/tasks/{task_id}/cancel")
async def cancel_task(task_id: int):
    """终止/取消任务"""
    from module import task_runner
    success = task_runner.cancel_task(task_id)
    if success:
        return {"success": True}
    else:
        raise HTTPException(status_code=400, detail="无法终止任务")

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: int):
    """删除任务记录（外键关联自动级联删除扫描结果）"""
    conn = db.get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT status FROM tasks WHERE id = ?", (task_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="未找到该任务")
        status = row["status"]
        if status in ("pending", "running", "paused"):
            raise HTTPException(status_code=400, detail="进行中/暂停中/排队中的活动任务不能被删除，请先终止它。")
        
        cursor.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        conn.commit()
        logger.info(f"[Web API] 成功删除任务 #{task_id} 及其关联扫描结果")
        return {"success": True, "message": f"任务 #{task_id} 已删除"}
    except Exception as e:
        logger.error(f"[Web API] 删除任务失败: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/tasks/{task_id}/results")
async def get_task_results(task_id: int):
    """获取指定任务的扫描结果"""
    try:
        conn = db.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM scan_results WHERE task_id = ?", (task_id,))
        rows = cursor.fetchall()
        results = [dict(row) for row in rows]
        conn.close()
        return {"success": True, "files": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/dashboard/summary")
async def get_dashboard_summary():
    """获取控制中心概览统计信息"""
    try:
        conn = db.get_db_connection()
        cursor = conn.cursor()
        
        # 1. 任务统计
        cursor.execute("SELECT COUNT(*) FROM tasks")
        total_tasks = cursor.fetchone()[0]
        
        cursor.execute("SELECT MAX(completed_at) FROM tasks WHERE status = 'completed'")
        last_scan = cursor.fetchone()[0]
        
        # 2. 冗余文件统计 (未删除，使用 GROUP BY 去重统计与前端 merged 视图一致)
        cursor.execute("""
            SELECT COUNT(*), SUM(max_size) FROM (
                SELECT MAX(file_size_mb) as max_size
                FROM scan_results
                WHERE deleted = 0
                GROUP BY file_path
            )
        """)
        row = cursor.fetchone()
        unseeded_count = row[0] or 0
        unseeded_size_mb = row[1] or 0.0
        
        # 3. 已删除的文件统计 (去重)
        cursor.execute("SELECT COUNT(DISTINCT file_path) FROM scan_results WHERE deleted = 1")
        cleaned_count = cursor.fetchone()[0] or 0
        
        conn.close()
        
        return {
            "success": True,
            "total_tasks": total_tasks,
            "last_scan": last_scan or "--",
            "unseeded_count": unseeded_count,
            "unseeded_size_mb": unseeded_size_mb,
            "cleaned_count": cleaned_count
        }
    except Exception as e:
        logger.error(f"[Web API] 获取仪表盘摘要失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/files/unseeded")
async def get_unseeded_files(task_id: str = "merged"):
    """获取未做种冗余文件，支持合并显示和按具体任务过滤"""
    try:
        conn = db.get_db_connection()
        cursor = conn.cursor()
        if task_id == "merged":
            # 合并去重查询所有未删除的文件
            cursor.execute("""
                SELECT file_path, MAX(file_size_mb) as file_size_mb, MAX(service_name) as service_name, MIN(deleted) as deleted
                FROM scan_results
                WHERE deleted = 0
                GROUP BY file_path
            """)
        else:
            t_id = int(task_id)
            cursor.execute("""
                SELECT file_path, file_size_mb, service_name, deleted
                FROM scan_results
                WHERE task_id = ?
            """, (t_id,))
            
        rows = cursor.fetchall()
        results = [dict(row) for row in rows]
        conn.close()
        return {"success": True, "files": results}
    except Exception as e:
        logger.error(f"[Web API] 获取未做种文件失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/logs")
async def get_logs_stream():
    """实时流式查看运行日志 (Server-Sent Events)"""
    async def log_stream_generator():
        log_file = os.getenv('LOG_PATH', 'logs/Void.log')
        
        # 1. 如果日志文件不存在，先创建或提示
        if not os.path.exists(log_file):
            yield "data: [Web] 日志文件暂不存在，等待程序运行生成...\n\n"
            # 尝试等待 5 秒
            for _ in range(10):
                await asyncio.sleep(0.5)
                if os.path.exists(log_file):
                    break
            else:
                yield "data: [Web] 日志文件仍未找到。\n\n"
                return

        # 2. 发送最后的 150 行历史记录
        try:
            with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
                for line in lines[-150:]:
                    yield f"data: {line.strip()}\n\n"
        except Exception as e:
            yield f"data: [Web] 读取历史日志失败: {e}\n\n"

        # 3. 实时读取追加行
        try:
            with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
                f.seek(0, os.SEEK_END)
                while True:
                    line = f.readline()
                    if not line:
                        await asyncio.sleep(0.5)
                        continue
                    yield f"data: {line.strip()}\n\n"
        except asyncio.CancelledError:
            # 客户端连接断开时触发
            pass
        except Exception as e:
            yield f"data: [Web] 日志流异常中断: {e}\n\n"

    return StreamingResponse(log_stream_generator(), media_type="text/event-stream")
