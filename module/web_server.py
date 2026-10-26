import os
import sys
import yaml
import time
import secrets
import logging
import threading
from typing import Dict, List, Optional
from flask import Flask, request, jsonify, Response, send_from_directory, g
from flask_cors import CORS

from tools import config as config_tool
from module import unseeded, global_scanner, db, notification

logger = logging.getLogger('Void')

# 初始化 Flask 应用，静态资源目录指向 static
STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "static"))
app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="")
CORS(app)

# 线程锁替代原先的 asyncio.Lock
scan_lock = threading.Lock()

# 会话管理
active_sessions: Dict[str, dict] = {}
SESSION_EXPIRE_SECONDS = 24 * 3600

def get_size_mb(path: str) -> float:
    try:
        if os.path.exists(path):
            return os.path.getsize(path) / (1024 * 1024)
    except Exception:
        return 0.0

@app.before_request
def auth_middleware():
    """认证拦截中间件"""
    path = request.path
    
    # 静态资源与认证白名单
    whitelist = [
        "/",
        "/favicon.png",
        "/favicon.svg",
        "/api/auth/login"
    ]
    
    if path in whitelist or path.startswith("/assets/") or path.startswith("/static/"):
        return None
        
    # 其余 /api/ 接口需要登录鉴权
    if path.startswith("/api/"):
        token = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
        elif request.args.get("token"):
            token = request.args.get("token")
            
        if not token:
            return jsonify({"detail": "未授权访问，请先登录"}), 401
            
        session = active_sessions.get(token)
        if not session or (time.time() - session["created_at"] > SESSION_EXPIRE_SECONDS):
            if token in active_sessions:
                del active_sessions[token]
            return jsonify({"detail": "登录已失效，请重新登录"}), 401
            
        g.user = session["user"]
        g.token = token

# ----------------- 静态页面与 SPA 路由 -----------------

@app.route("/")
def index():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return send_from_directory(STATIC_DIR, "index.html")
    return "<h1>Void Web GUI Frontend not found. Please build frontend.</h1>", 404

@app.route("/favicon.png")
def favicon():
    fav_file = os.path.join(STATIC_DIR, "favicon.png")
    if os.path.exists(fav_file):
        return send_from_directory(STATIC_DIR, "favicon.png")
    return "", 404

@app.errorhandler(404)
def not_found(e):
    # 非 API 请求，作为单页应用 (SPA) fallback 返回 index.html
    if not request.path.startswith("/api/"):
        index_file = os.path.join(STATIC_DIR, "index.html")
        if os.path.exists(index_file):
            return send_from_directory(STATIC_DIR, "index.html")
    return jsonify({"detail": "Not Found"}), 404

# ----------------- 认证相关接口 -----------------

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")
    
    user = db.verify_user(username, password)
    if not user:
        return jsonify({"detail": "用户名或密码错误"}), 401
        
    token = secrets.token_hex(32)
    active_sessions[token] = {
        "user": user,
        "created_at": time.time()
    }
    
    return jsonify({
        "success": True,
        "token": token,
        "username": user["username"],
        "must_change_password": bool(user["must_change_password"])
    })

@app.route("/api/auth/check", methods=["GET"])
def check_auth():
    user = getattr(g, "user", None)
    if not user:
        return jsonify({"detail": "未登录"}), 401
    return jsonify({
        "success": True,
        "username": user["username"],
        "must_change_password": bool(user["must_change_password"])
    })

@app.route("/api/auth/change-password", methods=["POST"])
def change_password():
    user = getattr(g, "user", None)
    if not user:
        return jsonify({"detail": "未登录"}), 401
        
    data = request.get_json(silent=True) or {}
    old_password = data.get("old_password", "")
    new_password = data.get("new_password", "")
    
    if not new_password or len(new_password) < 4:
        return jsonify({"detail": "新密码长度至少需要4个字符"}), 400
        
    verified = db.verify_user(user["username"], old_password)
    if not verified:
        return jsonify({"detail": "旧密码验证失败，请重试"}), 400
        
    if db.update_user_password(user["id"], new_password):
        user["must_change_password"] = 0
        token = getattr(g, "token", None)
        if token and token in active_sessions:
            active_sessions[token]["user"]["must_change_password"] = 0
        return jsonify({"success": True, "message": "密码修改成功"})
    else:
        return jsonify({"detail": "数据库更新密码失败"}), 500

@app.route("/api/auth/logout", methods=["POST"])
def logout():
    token = getattr(g, "token", None)
    if token and token in active_sessions:
        del active_sessions[token]
    return jsonify({"success": True})

# ----------------- 配置与辅助检测接口 -----------------

@app.route("/api/config", methods=["GET"])
def get_config():
    try:
        config = config_tool.yaml_configuration()
        if not isinstance(config, dict):
            config = {}
        # 补充并规整默认值
        config.setdefault('web_port', 8000)
        config.setdefault('check_interval', 60)
        config.setdefault('enable_auto_remove', False)
        config.setdefault('checkfile_size', 0)
        config.setdefault('enable_recycle_bin', False)
        config.setdefault('recycle_bin_path', "./.trash")
        config.setdefault('excluded_paths', [])
        config.setdefault('services', [])
        config.setdefault('notification_type', "none")
        config.setdefault('email', {})
        config.setdefault('webhook', {})
        config.setdefault('wecom', {})
        config.setdefault('global_scan', {"enabled": True, "scan_paths": ["/data"]})
        return jsonify(config)
    except Exception as e:
        logger.error(f"[Web API] 读取配置失败: {e}")
        return jsonify({"detail": f"读取配置失败: {e}"}), 500

@app.route("/api/config", methods=["POST"])
def update_config():
    config_file = os.getenv("CONFIG_PATH", "./config/config.yaml")
    try:
        data = request.get_json(silent=True) or {}
        # 确保基础字段存在
        data.setdefault('web_port', 8000)
        data.setdefault('check_interval', 60)
        data.setdefault('enable_auto_remove', False)
        data.setdefault('checkfile_size', 0)
        data.setdefault('excluded_paths', [])
        data.setdefault('services', [])
        
        os.makedirs(os.path.dirname(os.path.abspath(config_file)), exist_ok=True)
        with open(config_file, 'w', encoding='utf-8') as f:
            yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
            
        logger.info("[Web API] 成功更新配置文件")
        return jsonify({"success": True, "message": "配置更新成功"})
    except Exception as e:
        logger.error(f"[Web API] 更新配置文件失败: {e}")
        return jsonify({"detail": f"保存配置失败: {e}"}), 500

@app.route("/api/config/test", methods=["POST"])
def test_downloader_connection():
    """测试下载器客户端连通性"""
    try:
        service = request.get_json(silent=True) or {}
        client = unseeded.create_client(service)
        if client:
            stype = service.get("type", "").lower()
            if stype == "transmission":
                try:
                    client.get_session()
                except Exception as e:
                    return jsonify({"success": False, "error": f"Transmission API 异常: {e}"})
            return jsonify({"success": True, "message": "连接成功，客户端认证通过！"})
        else:
            return jsonify({"success": False, "error": "连接测试失败，请检查 IP/端口/密码或 WebUI 是否启用"})
    except Exception as e:
        return jsonify({"success": False, "error": f"测试时抛出异常: {e}"})

@app.route("/api/config/auto-detect-mapping", methods=["POST"])
def auto_detect_mapping():
    """智能嗅探并自动推导下载器与容器挂载目录之间的映射关系 (Auto-Sniffing)"""
    try:
        data = request.get_json(silent=True) or {}
        service = data.get("service") or {}
        config = config_tool.yaml_configuration()
        global_scan = config.get("global_scan", {})
        scan_paths = global_scan.get("scan_paths", ["/data"])
        
        candidate_dirs = list(set(scan_paths + ["/data", "/downloads", "/media", "/volume1"]))
        result = unseeded.auto_detect_path_mapping(service, candidate_dirs=candidate_dirs)
        return jsonify(result)
    except Exception as e:
        logger.error(f"[Web API] 自动探测映射失败: {e}")
        return jsonify({"success": False, "message": f"探测过程异常: {e}"}), 500

@app.route("/api/config/test-notify", methods=["POST"])
def test_notify_push():
    """测试通知推送渠道"""
    try:
        cfg = request.get_json(silent=True) or {}
        ok, msg = notification.test_notification(cfg)
        return jsonify({"success": ok, "message": msg})
    except Exception as e:
        logger.error(f"[Web API] 测试通知异常: {e}")
        return jsonify({"success": False, "message": f"测试发生异常: {e}"})

@app.route("/api/config/check-path", methods=["POST"])
def check_directory_path():
    """检测扫描路径在当前系统/容器内是否存在（傻瓜化路径辅助检测）"""
    data = request.get_json(silent=True) or {}
    path = data.get("path", "").strip()
    if not path:
        return jsonify({"exists": False, "message": "路径不能为空"})
        
    try:
        exists = os.path.exists(path)
        is_dir = os.path.isdir(path) if exists else False
        readable = os.access(path, os.R_OK) if exists else False
        writable = os.access(path, os.W_OK) if exists else False
        
        sample_items = []
        if exists and is_dir and readable:
            try:
                items = os.listdir(path)[:5]
                sample_items = items
            except Exception:
                pass
                
        return jsonify({
            "exists": exists,
            "is_dir": is_dir,
            "readable": readable,
            "writable": writable,
            "sample_items": sample_items,
            "message": "路径有效" if (exists and is_dir) else "路径不存在或非目录"
        })
    except Exception as e:
        return jsonify({"exists": False, "message": str(e)})

# ----------------- 扫描与清理接口 -----------------

@app.route("/api/scan/dry-run", methods=["POST"])
def scan_dry_run():
    if not scan_lock.acquire(blocking=False):
        return jsonify({"detail": "当前已有扫描或清理任务正在执行中，请稍后再试"}), 409
        
    try:
        logger.info("[Web API] 收到手动扫描请求 (Dry-Run)")
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
        
        return jsonify({"success": True, "files": results, "errors": errors})
    except Exception as e:
        logger.error(f"[Web API] 手动扫描失败: {e}")
        return jsonify({"detail": f"扫描执行失败: {e}"}), 500
    finally:
        scan_lock.release()

@app.route("/api/delete", methods=["POST"])
def delete_files():
    if not scan_lock.acquire(blocking=False):
        return jsonify({"detail": "系统正忙，请稍候再试"}), 409
        
    try:
        data = request.get_json(silent=True) or {}
        files = data.get("files", [])
        if not files:
            return jsonify({"success": True, "deleted": [], "failed": []})
            
        logger.info(f"[Web API] 收到手动删除文件请求，数量: {len(files)}")
        config = config_tool.yaml_configuration()
        if 'enable_recycle_bin' not in config:
            config['enable_recycle_bin'] = False
        if 'recycle_bin_path' not in config:
            config['recycle_bin_path'] = "./.trash"
            
        deleted = unseeded.process_cleanup(files, config)
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
                
        failed = list(set(files) - set(deleted))
        return jsonify({"success": True, "deleted": deleted, "failed": failed})
    except Exception as e:
        logger.error(f"[Web API] 手动删除失败: {e}")
        return jsonify({"detail": f"删除文件失败: {e}"}), 500
    finally:
        scan_lock.release()

# ----------------- 任务管理接口 -----------------

@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    try:
        conn = db.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tasks ORDER BY id DESC")
        rows = cursor.fetchall()
        tasks = [dict(row) for row in rows]
        conn.close()
        return jsonify({"success": True, "tasks": tasks})
    except Exception as e:
        return jsonify({"detail": str(e)}), 500

@app.route("/api/tasks", methods=["POST"])
def create_task():
    try:
        data = request.get_json(silent=True) or {}
        force = data.get("force", False)
        mode = data.get("mode", "normal")
        
        if not force:
            conn = db.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM tasks WHERE status IN ('pending', 'running', 'paused')")
            count = cursor.fetchone()[0]
            conn.close()
            if count > 0:
                return jsonify({
                    "warning_pending": True,
                    "message": "当前已有正在运行或等待中的任务，是否继续创建新任务？"
                })
                
        from module import task_runner
        if mode not in ("normal", "global"):
            config = config_tool.yaml_configuration()
            is_global = config.get("global_scan", {}).get("enabled", False)
            mode = "global" if is_global else "normal"
            
        task_id = task_runner.start_task(mode=mode, trigger_type="manual")
        return jsonify({"success": True, "task_id": task_id})
    except Exception as e:
        logger.error(f"[Web API] 创建任务失败: {e}")
        return jsonify({"detail": str(e)}), 500

@app.route("/api/tasks/<int:task_id>/pause", methods=["POST"])
def pause_task(task_id: int):
    from module import task_runner
    success = task_runner.pause_task(task_id)
    if success:
        return jsonify({"success": True})
    return jsonify({"detail": "无法暂停（任务可能已结束，或不在运行状态中）"}), 400

@app.route("/api/tasks/<int:task_id>/resume", methods=["POST"])
def resume_task(task_id: int):
    from module import task_runner
    success = task_runner.resume_task(task_id)
    if success:
        return jsonify({"success": True})
    return jsonify({"detail": "无法恢复（任务可能已结束，或不在暂停状态中）"}), 400

@app.route("/api/tasks/<int:task_id>/cancel", methods=["POST"])
def cancel_task(task_id: int):
    from module import task_runner
    success = task_runner.cancel_task(task_id)
    if success:
        return jsonify({"success": True})
    return jsonify({"detail": "无法终止任务"}), 400

@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id: int):
    conn = db.get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT status FROM tasks WHERE id = ?", (task_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"detail": "未找到该任务"}), 404
        status = row["status"]
        if status in ("pending", "running", "paused"):
            return jsonify({"detail": "活动中的任务不能删除，请先终止它"}), 400
            
        cursor.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        conn.commit()
        logger.info(f"[Web API] 成功删除任务 #{task_id} 及其关联结果")
        return jsonify({"success": True, "message": f"任务 #{task_id} 已删除"})
    except Exception as e:
        logger.error(f"[Web API] 删除任务失败: {e}")
        return jsonify({"detail": str(e)}), 500
    finally:
        conn.close()

@app.route("/api/tasks/<int:task_id>/results", methods=["GET"])
def get_task_results(task_id: int):
    try:
        conn = db.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM scan_results WHERE task_id = ?", (task_id,))
        rows = cursor.fetchall()
        results = [dict(row) for row in rows]
        conn.close()
        return jsonify({"success": True, "files": results})
    except Exception as e:
        return jsonify({"detail": str(e)}), 500

# ----------------- 控制中心与文件查询接口 -----------------

@app.route("/api/dashboard/summary", methods=["GET"])
def get_dashboard_summary():
    try:
        conn = db.get_db_connection()
        cursor = conn.cursor()
        
        # 1. 任务统计
        cursor.execute("SELECT COUNT(*) FROM tasks")
        total_tasks = cursor.fetchone()[0]
        
        cursor.execute("SELECT MAX(completed_at) FROM tasks WHERE status = 'completed'")
        last_scan = cursor.fetchone()[0]
        
        # 2. 当前活动任务 (如果有)
        cursor.execute("SELECT * FROM tasks WHERE status IN ('pending', 'running', 'paused') ORDER BY id DESC LIMIT 1")
        active_task_row = cursor.fetchone()
        active_task = dict(active_task_row) if active_task_row else None
        
        # 3. 冗余文件统计 (未删除，使用 GROUP BY 去重统计)
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
        
        # 4. 已删除的文件统计 (去重)
        cursor.execute("SELECT COUNT(DISTINCT file_path) FROM scan_results WHERE deleted = 1")
        cleaned_count = cursor.fetchone()[0] or 0
        
        conn.close()
        
        return jsonify({
            "success": True,
            "total_tasks": total_tasks,
            "last_scan": last_scan or "--",
            "unseeded_count": unseeded_count,
            "unseeded_size_mb": unseeded_size_mb,
            "cleaned_count": cleaned_count,
            "active_task": active_task
        })
    except Exception as e:
        logger.error(f"[Web API] 获取仪表盘摘要失败: {e}")
        return jsonify({"detail": str(e)}), 500

@app.route("/api/files/unseeded", methods=["GET"])
def get_unseeded_files():
    task_id = request.args.get("task_id", "merged")
    try:
        conn = db.get_db_connection()
        cursor = conn.cursor()
        if task_id == "merged":
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
        return jsonify({"success": True, "files": results})
    except Exception as e:
        logger.error(f"[Web API] 获取未做种文件失败: {e}")
        return jsonify({"detail": str(e)}), 500

# ----------------- 实时日志流 (SSE) -----------------

@app.route("/api/logs")
def get_logs_stream():
    """实时流式查看运行日志 (Server-Sent Events)"""
    def log_stream_generator():
        log_file = os.getenv('LOG_PATH', 'logs/Void.log')
        
        # 1. 如果日志文件不存在，先提示并等待
        if not os.path.exists(log_file):
            yield "data: [Web] 日志文件暂不存在，等待程序生成...\n\n"
            for _ in range(10):
                time.sleep(0.5)
                if os.path.exists(log_file):
                    break
            else:
                yield "data: [Web] 日志文件尚未找到。\n\n"
                return

        # 2. 发送最后 150 行历史记录
        try:
            with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
                for line in lines[-150:]:
                    yield f"data: {line.strip()}\n\n"
        except Exception as e:
            yield f"data: [Web] 读取历史日志失败: {e}\n\n"

        # 3. 实时读取持续追加的内容
        try:
            with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
                f.seek(0, os.SEEK_END)
                while True:
                    line = f.readline()
                    if not line:
                        time.sleep(0.5)
                        continue
                    yield f"data: {line.strip()}\n\n"
        except GeneratorExit:
            pass
        except Exception as e:
            yield f"data: [Web] 日志流异常中断: {e}\n\n"

    response = Response(log_stream_generator(), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    return response
