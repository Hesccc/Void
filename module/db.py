import os
import sqlite3
import logging
import hashlib
import secrets
from datetime import datetime, timedelta

DB_PATH = os.getenv("DB_PATH", "./config/void.db")
logger = logging.getLogger('Void')

def get_db_connection():
    """获取数据库连接，并启用外键约束"""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """初始化数据库表结构"""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        # 0. 用户表
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            must_change_password INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT
        )
        """)
        
        # 1. 任务表
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            status TEXT NOT NULL,                -- pending, running, paused, canceled, failed, completed
            mode TEXT NOT NULL,                  -- normal, global
            trigger_type TEXT NOT NULL,          -- manual, cron
            progress REAL DEFAULT 0.0,
            progress_msg TEXT,
            created_at TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT,
            total_files_scanned INTEGER DEFAULT 0,
            total_unseeded_found INTEGER DEFAULT 0
        )
        """)
        
        # 2. 扫描结果表
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS scan_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            file_size_mb REAL NOT NULL,
            service_name TEXT NOT NULL,
            deleted INTEGER DEFAULT 0,            -- 0: 否, 1: 是
            FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
        )
        """)
        
        # 3. 创建索引优化去重查询
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_scan_results_file_path ON scan_results(file_path);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_scan_results_deleted ON scan_results(deleted);")
        
        # 初始化默认用户
        init_default_user(cursor)
        
        conn.commit()
        logger.info("[DB] 数据库初始化成功")
    except Exception as e:
        logger.error(f"[DB] 数据库初始化失败: {e}")
    finally:
        conn.close()

def get_password_hash(password: str, salt: str) -> str:
    """生成加盐后的密码哈希"""
    return hashlib.sha256((salt + password).encode('utf-8')).hexdigest()

def init_default_user(cursor):
    """如果用户表为空，则初始化默认 admin 用户"""
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        salt = secrets.token_hex(16)
        pwd_hash = get_password_hash("void@123", salt)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute(
            "INSERT INTO users (username, password_hash, salt, must_change_password, created_at) VALUES (?, ?, ?, ?, ?)",
            ("admin", pwd_hash, salt, 1, now)
        )
        logger.info("[DB] 创建默认管理员用户: admin / void@123 (首次登录需修改密码)")

def verify_user(username: str, password: str) -> dict:
    """
    验证用户凭据。成功返回包含 user 信息的字典，失败返回 None
    """
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, password_hash, salt, must_change_password FROM users WHERE username = ?", (username,))
        user = cursor.fetchone()
        if user:
            expected_hash = get_password_hash(password, user['salt'])
            if secrets.compare_digest(user['password_hash'], expected_hash):
                return dict(user)
        return None
    except Exception as e:
        logger.error(f"[DB] 验证用户凭据失败: {e}")
        return None
    finally:
        conn.close()

def update_user_password(user_id: int, new_password: str):
    """
    更新用户密码，并将 must_change_password 置为 0
    """
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        new_salt = secrets.token_hex(16)
        new_hash = get_password_hash(new_password, new_salt)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute(
            "UPDATE users SET password_hash = ?, salt = ?, must_change_password = 0, updated_at = ? WHERE id = ?",
            (new_hash, new_salt, now, user_id)
        )
        conn.commit()
        return True
    except Exception as e:
        logger.error(f"[DB] 更新用户密码失败: {e}")
        return False
    finally:
        conn.close()

def clean_old_tasks():
    """清理 180 天前的历史任务记录 (级联删除结果)"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cutoff_time = (datetime.now() - timedelta(days=180)).strftime("%Y-%m-%d %H:%M:%S")
        
        # 查询需要删除的数量
        cursor.execute("SELECT COUNT(*) FROM tasks WHERE created_at < ?", (cutoff_time,))
        count = cursor.fetchone()[0]
        
        if count > 0:
            cursor.execute("DELETE FROM tasks WHERE created_at < ?", (cutoff_time,))
            conn.commit()
            logger.info(f"[DB] 已自动清理 {count} 条超过 180 天的历史任务记录")
    except Exception as e:
        logger.error(f"[DB] 清理历史任务失败: {e}")
    finally:
        conn.close()

def update_task_progress(task_id: int, progress: float, progress_msg: str):
    """更新任务进度与消息"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if progress is not None and progress >= 0:
            cursor.execute(
                "UPDATE tasks SET progress = ?, progress_msg = ? WHERE id = ?",
                (progress, progress_msg, task_id)
            )
        else:
            cursor.execute(
                "UPDATE tasks SET progress_msg = ? WHERE id = ?",
                (progress_msg, task_id)
            )
        conn.commit()
    except Exception as e:
        logger.error(f"[DB] 更新任务进度失败: {e}")
    finally:
        conn.close()

def update_task_status(task_id: int, status: str, started_at: str = None, completed_at: str = None, total_files_scanned: int = None, total_unseeded_found: int = None):
    """更新任务状态及完成信息"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        updates = ["status = ?"]
        params = [status]
        
        if started_at is not None:
            updates.append("started_at = ?")
            params.append(started_at)
        if completed_at is not None:
            updates.append("completed_at = ?")
            params.append(completed_at)
        if total_files_scanned is not None:
            updates.append("total_files_scanned = ?")
            params.append(total_files_scanned)
        if total_unseeded_found is not None:
            updates.append("total_unseeded_found = ?")
            params.append(total_unseeded_found)
            
        params.append(task_id)
        sql = f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?"
        cursor.execute(sql, params)
        conn.commit()
    except Exception as e:
        logger.error(f"[DB] 更新任务状态失败: {e}")
    finally:
        conn.close()

def save_scan_results(task_id: int, results: list):
    """保存扫描结果到数据库"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.executemany(
            "INSERT INTO scan_results (task_id, file_path, file_size_mb, service_name) VALUES (?, ?, ?, ?)",
            [(task_id, item['file_path'], item['file_size_mb'], item['service_name']) for item in results]
        )
        conn.commit()
        logger.info(f"[DB] 成功为任务 {task_id} 插入 {len(results)} 条扫描结果")
    except Exception as e:
        logger.error(f"[DB] 保存扫描结果失败: {e}")
    finally:
        conn.close()
