import os
import sys
import time
import json
import fnmatch
import shutil
import unicodedata
import threading
import io
import urllib.request
import urllib.parse
from typing import List, Tuple, Dict, Any, Optional, Set
from datetime import datetime
from pathlib import Path

# 导入 APScheduler CronTrigger
try:
    from apscheduler.triggers.cron import CronTrigger
except ImportError:
    CronTrigger = None

# 尝试导入 Paramiko（仅用于远程 SSH 下载器场景）
try:
    import paramiko
except ImportError:
    paramiko = None

# 兼容直接导入与外部独立运行
try:
    from app.plugins import _PluginBase
    from app.core.config import settings
    from app.log import logger
    from app.schemas import NotificationType
    try:
        from app.sdk.services import DownloaderHelper
    except ImportError:
        DownloaderHelper = None
    try:
        from app.application.directory import DirectoryHelper
    except ImportError:
        try:
            from app.helper.directory import DirectoryHelper
        except ImportError:
            DirectoryHelper = None
except ImportError:
    class _PluginBase:
        def __init__(self):
            pass
        def post_message(self, *args, **kwargs):
            pass
        def get_notify_channel(self, *args, **kwargs):
            return None
        def get_data(self, *args, **kwargs):
            return None
        def save_data(self, *args, **kwargs):
            pass
        def get_config(self, *args, **kwargs):
            return {}
        def update_config(self, *args, **kwargs):
            return True
    class DummySettings:
        DOWNLOAD_PATH = ["/downloads"]
        TRASH_PATH = "/downloads/.trash"
    settings = DummySettings()
    import logging
    logger = logging.getLogger("VoidCleaner")
    class NotificationType:
        Manual = "Manual"
    DownloaderHelper = None


class DownloaderClient:
    """直接与 qBittorrent / Transmission 客户端交互获取种子及文件信息"""

    # 处于这些状态的种子，说明其关联的文件正在下载、排队下载或校验中，绝对不可删除！
    DOWNLOADING_STATES = {
        # qBittorrent states
        "downloading", "stalledDL", "metaDL", "forcedDL", "allocating", 
        "checkingDL", "queuedDL", "pausedDL",
        # Transmission states
        "downloading", "download_wait", "check", "check_wait"
    }

    @classmethod
    def get_qbittorrent_torrents_and_files(cls, conf: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], Dict[str, List[Dict[str, Any]]]]:
        """调用 qBittorrent WebAPI 获取所有种子及其内部文件结构"""
        host = conf.get("host", "").rstrip("/")
        username = conf.get("username", "")
        password = conf.get("password", "")

        if not host:
            return [], {}

        # 1. 登录获取 Cookie
        cookie = ""
        try:
            login_data = urllib.parse.urlencode({"username": username, "password": password}).encode("utf-8")
            login_req = urllib.request.Request(f"{host}/api/v2/auth/login", data=login_data, headers={"User-Agent": "VoidCleaner"})
            with urllib.request.urlopen(login_req, timeout=10) as resp:
                set_cookie = resp.headers.get("Set-Cookie")
                if set_cookie:
                    cookie = set_cookie.split(";")[0]
        except Exception as e:
            logger.warning(f"[VoidCleaner] 连接 qBittorrent ({host}) 登录失败: {e}")
            return [], {}

        headers = {"User-Agent": "VoidCleaner", "Cookie": cookie} if cookie else {"User-Agent": "VoidCleaner"}

        # 2. 获取种子列表
        torrents = []
        try:
            info_req = urllib.request.Request(f"{host}/api/v2/torrents/info", headers=headers)
            with urllib.request.urlopen(info_req, timeout=15) as resp:
                torrents = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            logger.warning(f"[VoidCleaner] 获取 qBittorrent ({host}) 种子列表失败: {e}")
            return [], {}

        # 3. 逐个获取各种子内部文件
        torrent_files: Dict[str, List[Dict[str, Any]]] = {}
        for t in torrents:
            t_hash = t.get("hash")
            if not t_hash:
                continue
            try:
                files_req = urllib.request.Request(f"{host}/api/v2/torrents/files?hash={t_hash}", headers=headers)
                with urllib.request.urlopen(files_req, timeout=10) as resp:
                    files = json.loads(resp.read().decode("utf-8"))
                    torrent_files[t_hash] = files
            except Exception:
                torrent_files[t_hash] = []

        return torrents, torrent_files


class SSHNodeManager:
    """管理远程 SSH 连接、连通性测试与远程文件系统操作"""

    @staticmethod
    def connect(node: Dict[str, Any], timeout: int = 10):
        if not paramiko:
            raise RuntimeError("系统尚未安装 paramiko 依赖，请执行 'pip install paramiko'")

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        host = node.get("host", "").strip()
        port = int(node.get("port") or 22)
        username = node.get("username", "").strip()
        auth_type = node.get("auth_type", "password")
        password = node.get("password", "")
        private_key = node.get("private_key", "").strip()

        if not host or not username:
            raise ValueError("SSH 主机地址与用户名不能为空")

        kwargs: Dict[str, Any] = {
            "hostname": host,
            "port": port,
            "username": username,
            "timeout": timeout,
        }

        if auth_type == "key" or (private_key and not password):
            key_file = io.StringIO(private_key)
            pkey = None
            for key_cls in (paramiko.RSAKey, paramiko.Ed25519Key, paramiko.ECDSAKey):
                try:
                    key_file.seek(0)
                    pkey = key_cls.from_private_key(key_file, password=password if password else None)
                    break
                except Exception:
                    continue
            if not pkey:
                raise ValueError("无法解析提供的 SSH 私钥，请检查密钥格式是否有效（支持 RSA/Ed25519/ECDSA）")
            kwargs["pkey"] = pkey
        else:
            kwargs["password"] = password

        client.connect(**kwargs)
        return client

    @classmethod
    def test_connection(cls, node: Dict[str, Any]) -> Dict[str, Any]:
        t0 = time.time()
        client = None
        try:
            client = cls.connect(node, timeout=8)
            stdin, stdout, stderr = client.exec_command("uname -s -m -r || uname -a", timeout=5)
            sys_info = stdout.read().decode("utf-8", errors="replace").strip()
            latency = int((time.time() - t0) * 1000)
            return {
                "code": 0,
                "msg": f"连接成功！延迟 {latency}ms",
                "system_info": sys_info or "Linux/Unix Host",
                "latency_ms": latency
            }
        except Exception as e:
            return {
                "code": 1,
                "msg": f"连接失败：{str(e)}",
                "system_info": None,
                "latency_ms": 0
            }
        finally:
            if client:
                try:
                    client.close()
                except Exception:
                    pass

    @classmethod
    def scan_remote_files(
        cls,
        node: Dict[str, Any],
        remote_path: str,
        min_bytes: int,
        exclude_patterns: List[str]
    ) -> List[Dict[str, Any]]:
        """在远程 SSH 服务器上遍历文件并返回物理属性"""
        client = cls.connect(node, timeout=12)
        try:
            exclude_str = "|||".join(exclude_patterns)
            now_ts = time.time()
            py_cmd = f"""python3 -c '
import os, sys, fnmatch, unicodedata

root_dir = sys.argv[1]
min_bytes = int(sys.argv[2])
now = float(sys.argv[3])
excludes = sys.argv[4].split("|||") if sys.argv[4] else []

def is_excluded(p):
    for pat in excludes:
        if not pat: continue
        if p == pat or p.startswith(pat + os.sep) or fnmatch.fnmatch(p, pat) or fnmatch.fnmatch(os.path.basename(p), pat):
            return True
    return False

if os.path.exists(root_dir):
    for r, dirs, files in os.walk(root_dir):
        norm_r = unicodedata.normalize("NFC", os.path.normpath(r))
        if is_excluded(norm_r):
            dirs[:] = []
            continue
        for f in files:
            fp = unicodedata.normalize("NFC", os.path.normpath(os.path.join(r, f)))
            if is_excluded(fp):
                continue
            try:
                st = os.stat(fp)
                if now - st.st_mtime < 300:
                    continue
                if st.st_size >= min_bytes:
                    print(f"{{fp}}|{{st.st_size}}|{{st.st_mtime}}|{{st.st_dev}}_{{st.st_ino}}|{{st.st_nlink}}")
            except OSError:
                pass
' "{remote_path}" {min_bytes} {now_ts} "{exclude_str}"
"""
            stdin, stdout, stderr = client.exec_command(py_cmd, timeout=180)
            output = stdout.read().decode("utf-8", errors="replace")
            err_output = stderr.read().decode("utf-8", errors="replace")

            results = []
            if output and ("Traceback" not in output) and ("command not found" not in err_output):
                for line in output.splitlines():
                    parts = line.strip().split("|")
                    if len(parts) >= 4:
                        p, sz, mt, ino = parts[0], parts[1], parts[2], parts[3]
                        nlink = int(parts[4]) if len(parts) >= 5 else 1
                        results.append({
                            "path": p,
                            "size": int(sz),
                            "mtime": float(mt),
                            "inode": ino,
                            "nlink": nlink
                        })
                return results

            # 备用 find 命令
            find_cmd = f'find "{remote_path}" -type f -printf "%p|%s|%T@|%i|%n\\n" 2>/dev/null'
            stdin, stdout, stderr = client.exec_command(find_cmd, timeout=180)
            output = stdout.read().decode("utf-8", errors="replace")
            for line in output.splitlines():
                parts = line.strip().split("|")
                if len(parts) >= 4:
                    p, sz, mt, ino = parts[0], parts[1], parts[2], parts[3]
                    nlink = int(parts[4]) if len(parts) >= 5 else 1
                    sz_int = int(float(sz))
                    if sz_int >= min_bytes:
                        results.append({
                            "path": p,
                            "size": sz_int,
                            "mtime": float(mt),
                            "inode": str(ino),
                            "nlink": nlink
                        })
            return results
        finally:
            client.close()

    @classmethod
    def clean_remote_files(
        cls,
        node: Dict[str, Any],
        files: List[str],
        enable_recycle_bin: bool,
        recycle_bin_path: str,
        base_dir: str
    ) -> List[str]:
        if not files:
            return []
        client = cls.connect(node, timeout=15)
        try:
            trash_dest = recycle_bin_path or "./.trash"
            if not os.path.isabs(trash_dest) and base_dir:
                trash_dest = os.path.normpath(os.path.join(base_dir, trash_dest))

            payload = {
                "files": files,
                "recycle": enable_recycle_bin,
                "trash_dir": trash_dest
            }
            py_clean = """python3 -c '
import sys, os, shutil, json, time
data = json.load(sys.stdin)
files = data.get("files", [])
recycle = data.get("recycle", True)
trash_dir = data.get("trash_dir", "./.trash")

if recycle:
    os.makedirs(trash_dir, exist_ok=True)

deleted = []
for p in files:
    if not os.path.exists(p):
        continue
    try:
        if recycle:
            dest = os.path.join(trash_dir, os.path.basename(p))
            if os.path.exists(dest):
                name, ext = os.path.splitext(os.path.basename(p))
                dest = os.path.join(trash_dir, f"{name}_{int(time.time())}{ext}")
            shutil.move(p, dest)
        else:
            os.remove(p)
        deleted.append(p)
    except Exception:
        pass
print(json.dumps(deleted))
'"""
            stdin, stdout, stderr = client.exec_command(py_clean, timeout=60)
            stdin.write(json.dumps(payload))
            stdin.channel.shutdown_write()
            out = stdout.read().decode("utf-8", errors="replace").strip()
            if out.startswith("["):
                return json.loads(out)

            deleted = []
            if enable_recycle_bin:
                client.exec_command(f'mkdir -p "{trash_dest}"')
            for f in files:
                if enable_recycle_bin:
                    cmd = f'mv "{f}" "{trash_dest}/" 2>/dev/null'
                else:
                    cmd = f'rm -f "{f}" 2>/dev/null'
                client.exec_command(cmd)
                deleted.append(f)
            return deleted
        finally:
            client.close()


class VoidCleaner(_PluginBase):
    """Void 冗余文件清理插件"""

    plugin_name = "Void 冗余文件清理"
    plugin_desc = "精准扫描并清理下载目录中未在任何客户端做种、未硬链接的残留孤儿文件（支持本地及远程 SSH 下载器）"
    plugin_version = "1.2.6"
    plugin_author = "Hescc"
    author_url = "https://github.com/Hesccc/Void"
    plugin_icon = "trash-2.png"
    plugin_config_prefix = "voidcleaner_"
    plugin_order = 100
    auth_level = 1

    # 插件配置项
    _enabled: bool = True
    enable_auto_remove: bool = False
    enable_recycle_bin: bool = True
    recycle_bin_path: str = "./.trash"
    min_size_mb: int = 0
    exclude_patterns: List[str] = [
        "*.nfo", "*.srt", "*.ass", "*.torrent", 
        "lost+found", ".@__thumb", ".recycle", ".qBittorrent", "@eaDir"
    ]
    cron: str = "0 3 * * *"

    # 通知策略配置（集成 MP 原生通知网关）
    notify_enabled: bool = True               # 是否开启通知推送
    notify_only_on_unseeded: bool = True     # 仅当发现未做种冗余文件或清理时才发送（无冗余静默免打扰）

    # 远程 SSH 节点列表
    ssh_nodes: List[Dict[str, Any]] = []

    # 下载器绑定映射
    downloader_mappings: List[Dict[str, Any]] = []

    # 运行时状态缓存
    _scan_state: Dict[str, Any] = {
        "status": "idle",
        "last_scan_time": "--",
        "last_message": "尚未执行扫描",
        "total_files_scanned": 0,
        "unseeded_count": 0,
        "unseeded_size_mb": 0.0,
        "cleaned_count": 0,
        "unseeded_files": []
    }

    def init_plugin(self, config: Optional[Dict[str, Any]] = None) -> None:
        """MP 启动或用户修改插件配置时调用"""
        # 确保日志文件存在，防止 Web 界面查看日志时因文件未生成而报 404 Not Found
        try:
            log_dir = Path("/config/logs/plugins")
            if log_dir.exists() and log_dir.is_dir():
                log_file = log_dir / "voidcleaner.log"
                if not log_file.exists():
                    log_file.touch()
        except Exception:
            pass

        if config:
            self._enabled = bool(config.get("enabled", True))
            self.enable_auto_remove = bool(config.get("enable_auto_remove", False))
            self.enable_recycle_bin = bool(config.get("enable_recycle_bin", True))
            self.recycle_bin_path = str(config.get("recycle_bin_path") or "./.trash")
            self.min_size_mb = int(config.get("min_size_mb", 0))
            
            excludes = config.get("exclude_patterns", "")
            if isinstance(excludes, str):
                self.exclude_patterns = [p.strip() for p in excludes.split("\n") if p.strip()]
            elif isinstance(excludes, list):
                self.exclude_patterns = excludes
                
            self.cron = str(config.get("cron") or "0 3 * * *")
            self.notify_enabled = bool(config.get("notify_enabled", True))
            self.notify_only_on_unseeded = bool(config.get("notify_only_on_unseeded", True))
            self.ssh_nodes = config.get("ssh_nodes") or []
            self.downloader_mappings = config.get("downloader_mappings") or []

        try:
            persisted_state = self.get_data("last_scan_state")
            if isinstance(persisted_state, dict):
                self._scan_state.update(persisted_state)
                self._scan_state["status"] = "idle"
        except Exception:
            pass

        logger.info(f"[{self.plugin_name}] 插件加载完成 | 启用: {self._enabled} | 远程节点数: {len(self.ssh_nodes)} | 阈值: {self.min_size_mb}MB")

    def get_state(self) -> bool:
        return self._enabled

    def stop_service(self) -> None:
        return None

    @staticmethod
    def get_render_mode() -> Tuple[str, Optional[str]]:
        return "vue", "dist/assets"

    def get_sidebar_nav(self) -> List[Dict[str, Any]]:
        if not self.get_state():
            return []
        return [
            {
                "nav_key": "main",
                "title": "Void 清理",
                "icon": "mdi-trash-can-outline",
                "section": "organize",
                "permission": "manage",
                "order": 55,
            }
        ]

    @staticmethod
    def get_command() -> List[Dict[str, Any]]:
        return [{
            "cmd": "/void_clean",
            "desc": "立即扫描并核对下载目录中的冗余未做种文件",
            "data": {}
        }]

    def get_service(self) -> Optional[List[Dict[str, Any]]]:
        if self._enabled and self.cron:
            try:
                cron_str = str(self.cron).strip()
                if cron_str.count(" ") == 4:
                    trigger = CronTrigger.from_crontab(cron_str) if CronTrigger else "cron"
                    return [{
                        "id": "VoidCleanerService",
                        "name": "Void 冗余文件定时清理服务",
                        "trigger": trigger,
                        "func": self.scan_and_clean,
                        "kwargs": {}
                    }]
                else:
                    logger.error(f"[{self.plugin_name}] cron 表达式格式不正确: {self.cron}")
            except Exception as e:
                logger.error(f"[{self.plugin_name}] 注册定时服务失败: {e}")
        return None

    def get_form(self) -> Tuple[Optional[List[dict]], Dict[str, Any]]:
        return [], self.get_current_config()

    def get_page(self) -> Optional[List[dict]]:
        return []

    def get_current_config(self) -> Dict[str, Any]:
        return {
            "enabled": self._enabled,
            "enable_auto_remove": self.enable_auto_remove,
            "enable_recycle_bin": self.enable_recycle_bin,
            "recycle_bin_path": self.recycle_bin_path,
            "min_size_mb": self.min_size_mb,
            "cron": self.cron,
            "notify_enabled": self.notify_enabled,
            "notify_only_on_unseeded": self.notify_only_on_unseeded,
            "exclude_patterns": self.exclude_patterns,
            "ssh_nodes": self.ssh_nodes,
            "downloader_mappings": self.downloader_mappings,
        }

    def get_api(self) -> List[Dict[str, Any]]:
        return [
            {
                "path": "/status",
                "methods": ["GET"],
                "endpoint": self.api_get_status,
                "auth": "bear",
                "summary": "获取 Void 清理状态与冗余列表"
            },
            {
                "path": "/scan",
                "methods": ["POST"],
                "endpoint": self.api_trigger_scan,
                "auth": "bear",
                "summary": "手动触发全量比对扫描"
            },
            {
                "path": "/delete",
                "methods": ["POST"],
                "endpoint": self.api_delete_files,
                "auth": "bear",
                "summary": "手动删除指定的冗余文件"
            },
            {
                "path": "/config",
                "methods": ["GET"],
                "endpoint": self.api_get_config,
                "auth": "bear",
                "summary": "获取插件配置"
            },
            {
                "path": "/config",
                "methods": ["POST"],
                "endpoint": self.api_save_config,
                "auth": "bear",
                "summary": "保存插件配置"
            },
            {
                "path": "/downloaders",
                "methods": ["GET"],
                "endpoint": self.api_get_downloaders,
                "auth": "bear",
                "summary": "获取系统下载器列表与存储映射"
            },
            {
                "path": "/ssh/test",
                "methods": ["POST"],
                "endpoint": self.api_test_ssh,
                "auth": "bear",
                "summary": "测试指定 SSH 节点的连通性"
            },
            {
                "path": "/clear_history",
                "methods": ["POST"],
                "endpoint": self.api_clear_history,
                "auth": "bear",
                "summary": "清空历史扫描记录"
            }
        ]

    def api_get_status(self) -> Dict[str, Any]:
        return {"code": 0, "msg": "ok", "data": self._scan_state}

    def api_clear_history(self) -> Dict[str, Any]:
        """重置并清空待清理冗余文件列表"""
        self._scan_state["unseeded_files"] = []
        self._scan_state["unseeded_count"] = 0
        self._scan_state["unseeded_size_mb"] = 0.0
        self._scan_state["last_message"] = "历史扫描记录已清空"
        try:
            self.save_data("last_scan_state", self._scan_state)
        except Exception:
            pass
        return {"code": 0, "msg": "已清空历史扫描记录", "data": self._scan_state}

    def api_get_config(self) -> Dict[str, Any]:
        return {"code": 0, "msg": "ok", "data": self.get_current_config()}

    def api_save_config(self, body: dict) -> Dict[str, Any]:
        if not body or not isinstance(body, dict):
            return {"code": 1, "msg": "配置数据无效"}
        self.init_plugin(body)
        self.update_config(body)
        return {"code": 0, "msg": "配置保存成功", "data": self.get_current_config()}

    def api_get_downloaders(self) -> Dict[str, Any]:
        """获取 MoviePilot 已注册的所有下载器、系统配置的下载目录及存储模式"""
        downloaders = []
        if DownloaderHelper:
            try:
                configs = DownloaderHelper().get_configs() or {}
                for name, conf in configs.items():
                    downloaders.append({
                        "name": name,
                        "type": getattr(conf, "type", "qbittorrent"),
                        "enabled": getattr(conf, "enabled", True),
                        "default": getattr(conf, "default", False),
                    })
            except Exception as e:
                logger.warning(f"[{self.plugin_name}] 获取下载器配置异常: {e}")

        if not downloaders:
            downloaders.append({
                "name": "本地默认下载目录",
                "type": "local",
                "enabled": True,
                "default": True
            })

        system_directories = []
        if DirectoryHelper:
            try:
                dirs = DirectoryHelper().get_local_download_dirs() or []
                for d in dirs:
                    p = getattr(d, "download_path", None)
                    if p:
                        clean_p = str(p).removeprefix("local:")
                        if clean_p and clean_p not in system_directories:
                            system_directories.append(clean_p)
            except Exception:
                pass

        if not system_directories:
            def_p = self._get_default_local_path()
            if def_p:
                system_directories.append(def_p)

        return {
            "code": 0,
            "msg": "ok",
            "data": {
                "downloaders": downloaders,
                "ssh_nodes": self.ssh_nodes,
                "mappings": self.downloader_mappings,
                "system_directories": system_directories
            }
        }

    def api_test_ssh(self, body: dict) -> Dict[str, Any]:
        node = body or {}
        return SSHNodeManager.test_connection(node)

    def api_trigger_scan(self) -> Dict[str, Any]:
        if self._scan_state["status"] == "running":
            return {"code": 1, "msg": "已有扫描任务正在执行中，请稍后再试"}
        t = threading.Thread(target=self.scan_and_clean, daemon=True)
        t.start()
        return {"code": 0, "msg": "扫描任务已在后台成功启动！"}

    def api_delete_files(self, body: dict) -> Dict[str, Any]:
        raw_items = body.get("files", []) if body else []
        if not raw_items:
            return {"code": 1, "msg": "文件列表为空"}

        items_to_clean: List[Dict[str, Any]] = []
        path_to_info = {f["path"]: f for f in self._scan_state["unseeded_files"]}
        for item in raw_items:
            if isinstance(item, str):
                info = path_to_info.get(item, {"path": item, "storage_type": "local"})
                items_to_clean.append(info)
            elif isinstance(item, dict) and item.get("path"):
                items_to_clean.append(item)

        local_files: List[str] = []
        ssh_groups: Dict[str, List[str]] = {}

        for item in items_to_clean:
            p = item.get("path")
            st = item.get("storage_type", "local")
            nid = item.get("node_id")
            if st == "ssh" and nid:
                ssh_groups.setdefault(nid, []).append(p)
            else:
                local_files.append(p)

        all_deleted = []

        if local_files:
            del_loc = self._do_cleanup(local_files)
            all_deleted.extend(del_loc)

        node_dict = {n["id"]: n for n in self.ssh_nodes if n.get("id")}
        for nid, r_files in ssh_groups.items():
            node = node_dict.get(nid)
            if not node:
                continue
            base_p = node.get("remote_path", "")
            try:
                del_rem = SSHNodeManager.clean_remote_files(
                    node=node,
                    files=r_files,
                    enable_recycle_bin=self.enable_recycle_bin,
                    recycle_bin_path=self.recycle_bin_path,
                    base_dir=base_p
                )
                all_deleted.extend(del_rem)
            except Exception as e:
                logger.error(f"[{self.plugin_name}] 远程清理异常 [{node.get('name')}]: {e}")

        self._scan_state["unseeded_files"] = [
            f for f in self._scan_state["unseeded_files"] if f["path"] not in all_deleted
        ]
        self._scan_state["unseeded_count"] = len(self._scan_state["unseeded_files"])
        self._scan_state["unseeded_size_mb"] = sum(f["size_mb"] for f in self._scan_state["unseeded_files"])
        self._scan_state["cleaned_count"] += len(all_deleted)

        try:
            self.save_data("last_scan_state", self._scan_state)
        except Exception:
            pass

        return {"code": 0, "msg": f"成功清理 {len(all_deleted)} 个文件", "deleted": all_deleted}

    @staticmethod
    def _is_file_seeded(
        full_path: str,
        rel_norm: str,
        orig_rel_norm: str,
        all_seeded_exact_paths: Set[str],
        all_seeded_subpaths: Set[str],
        all_seeded_filenames: Set[str],
        seeded_root_names: Set[str],
        active_downloading_files: Set[str],
    ) -> bool:
        """多重保险判断文件是否属于当前下载器的做种或下载任务"""
        # 1. 临时文件标识 (.!qB, .!ut, .part)
        is_temp = rel_norm.endswith(".!qB") or rel_norm.endswith(".!ut") or rel_norm.endswith(".part")
        file_base_name = os.path.basename(orig_rel_norm)

        # 2. 如果在下载中白名单里（绝对路径、相对路径或纯文件名）
        if (
            orig_rel_norm in active_downloading_files
            or full_path in active_downloading_files
            or file_base_name in active_downloading_files
        ):
            return True

        # 3. 临时文件保护：如果带 .!qB 且基础文件名在任意已知种子文件清单中
        if is_temp and file_base_name in all_seeded_filenames:
            return True

        # 4. 绝对路径完全命中
        if full_path in all_seeded_exact_paths:
            return True

        # 5. 相对路径完全命中
        if orig_rel_norm in all_seeded_subpaths:
            return True

        # 6. 分类子目录穿透后缀匹配（例如磁盘是 Manually/Douban.../file.mkv，种子是 Douban.../file.mkv）
        for sp in all_seeded_subpaths:
            if orig_rel_norm.endswith("/" + sp) or orig_rel_norm.endswith("\\" + sp):
                return True

        # 7. 种子顶层目录包含保护（处于已知种子文件夹内部，且纯文件名在清单中）
        path_parts = orig_rel_norm.replace("\\", "/").split("/")
        for part in path_parts[:-1]:
            if part in seeded_root_names and file_base_name in all_seeded_filenames:
                return True

        # 8. 纯文件名命中保护（文件名在当前下载器做种清单中）
        if file_base_name in all_seeded_filenames:
            return True

        return False

    def scan_and_clean(self):
        """核心扫描比对逻辑：清晰区分 MP 本地容器目录映射 与 远程 SSH 模式"""
        self._scan_state["status"] = "running"
        self._scan_state["last_message"] = "正在分析下载器与存储映射配置..."
        logger.info(f"[{self.plugin_name}] 开始执行比对扫描任务...")

        active_tasks = self._build_scan_tasks()
        if not active_tasks:
            err = "未找到任何启用的下载器或有效扫描路径，请在插件配置中检查下载器绑定"
            logger.warning(f"[{self.plugin_name}] {err}")
            self._scan_state["status"] = "error"
            self._scan_state["last_message"] = err
            return

        unseeded_results: List[Dict[str, Any]] = []
        total_scanned = 0
        min_bytes = self.min_size_mb * 1024 * 1024
        now_ts = time.time()
        node_map = {n.get("id"): n for n in self.ssh_nodes if n.get("id")}

        for task in active_tasks:
            dl_name = task["downloader_name"]
            mode = task["mode"] # "local" 或 "ssh"
            node_id = task.get("ssh_node_id")
            scan_path = task.get("scan_path")
            node = node_map.get(node_id) if mode == "ssh" else None
            node_name = node.get("name") if node else "本地挂载"

            self._scan_state["last_message"] = f"正在从下载器 [{dl_name}] 读取做种任务与文件树..."
            logger.info(f"[{self.plugin_name}] 扫描下载器: {dl_name} | 模式: {mode} | 节点: {node_name} | 路径: {scan_path}")

            # 多维做种白名单索引
            active_downloading_files: Set[str] = set()
            all_seeded_exact_paths: Set[str] = set()
            all_seeded_subpaths: Set[str] = set()
            all_seeded_filenames: Set[str] = set()
            seeded_root_names: Set[str] = set()

            dl_conf = self._get_downloader_conf(dl_name)
            if dl_conf:
                conf_dict = getattr(dl_conf, "config", {}) or {}
                torrents, torrent_files = DownloaderClient.get_qbittorrent_torrents_and_files(conf_dict)

                for t in torrents:
                    t_hash = t.get("hash")
                    t_name = t.get("name", "")
                    t_save = unicodedata.normalize("NFC", os.path.normpath(t.get("save_path", ""))) if t.get("save_path") else ""
                    t_content = unicodedata.normalize("NFC", os.path.normpath(t.get("content_path", ""))) if t.get("content_path") else ""
                    t_state = t.get("state", "").lower()
                    is_downloading = any(st.lower() in t_state for st in DownloaderClient.DOWNLOADING_STATES)

                    if t_name:
                        seeded_root_names.add(t_name)
                    if t_content:
                        all_seeded_exact_paths.add(t_content)

                    files = torrent_files.get(t_hash, [])
                    if files:
                        for f in files:
                            f_name = f.get("name", "")
                            if not f_name:
                                continue
                            norm_f = unicodedata.normalize("NFC", os.path.normpath(f_name))
                            all_seeded_subpaths.add(norm_f)
                            base_fn = os.path.basename(norm_f)
                            all_seeded_filenames.add(base_fn)

                            if t_save:
                                abs_p = unicodedata.normalize("NFC", os.path.normpath(os.path.join(t_save, norm_f)))
                                all_seeded_exact_paths.add(abs_p)

                            if is_downloading or (f.get("progress", 0) < 1.0 and f.get("progress", 0) > 0):
                                active_downloading_files.add(norm_f)
                                active_downloading_files.add(base_fn)
                                if t_save:
                                    active_downloading_files.add(abs_p)
                    else:
                        if t_name:
                            all_seeded_subpaths.add(t_name)
                            base_tn = os.path.basename(t_name)
                            all_seeded_filenames.add(base_tn)
                            if t_save:
                                abs_p = unicodedata.normalize("NFC", os.path.normpath(os.path.join(t_save, t_name)))
                                all_seeded_exact_paths.add(abs_p)
                            if is_downloading:
                                active_downloading_files.add(base_tn)

            logger.info(f"[{self.plugin_name}] [{dl_name}] 已建立多维做种白名单: {len(all_seeded_subpaths)} 个相对路径，{len(all_seeded_filenames)} 个文件名，正在下载中保护: {len(active_downloading_files)} 项")

            # 2. 执行目录比对：严格区分 本地容器目录 与 远程 SSH 模式
            if mode == "local":
                # 【本地模式】：直接在 MP 容器内的映射目录中扫描，禁止使用 SSH
                if not scan_path or not os.path.exists(scan_path):
                    logger.warning(f"[{self.plugin_name}] 本地扫描路径不存在: {scan_path}")
                    continue

                for root, dirs, files in os.walk(scan_path):
                    curr_root = unicodedata.normalize("NFC", os.path.normpath(root))
                    if self._is_excluded(curr_root):
                        dirs[:] = []
                        continue

                    for file in files:
                        full_path = unicodedata.normalize("NFC", os.path.normpath(os.path.join(root, file)))
                        if self._is_excluded(full_path):
                            continue

                        total_scanned += 1
                        try:
                            st = os.stat(full_path)
                            # 300秒内被写入的文件避让保护
                            if now_ts - st.st_mtime < 300:
                                continue
                            if st.st_size < min_bytes:
                                continue

                            # 核心比对判定：计算相对于 scan_path 的相对路径
                            rel_path = os.path.relpath(full_path, scan_path)
                            rel_norm = unicodedata.normalize("NFC", os.path.normpath(rel_path))

                            # 处理 .!qB 临时文件判断
                            is_qb_incomplete = rel_norm.endswith(".!qB")
                            orig_rel_norm = rel_norm[:-4] if is_qb_incomplete else rel_norm

                            # 多维白名单核验：命中任何规则直接放行（做种中、下载中、多级分类子目录等）
                            if self._is_file_seeded(
                                full_path=full_path,
                                rel_norm=rel_norm,
                                orig_rel_norm=orig_rel_norm,
                                all_seeded_exact_paths=all_seeded_exact_paths,
                                all_seeded_subpaths=all_seeded_subpaths,
                                all_seeded_filenames=all_seeded_filenames,
                                seeded_root_names=seeded_root_names,
                                active_downloading_files=active_downloading_files,
                            ):
                                continue

                            # 到这里说明该文件在下载器中无任何对应任务！判定为孤儿冗余文件
                            unseeded_results.append({
                                "path": full_path,
                                "size_mb": round(st.st_size / (1024 * 1024), 2),
                                "time": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                                "storage_type": "local",
                                "node_id": "local",
                                "node_name": "本地容器目录",
                                "downloader": dl_name
                            })
                        except OSError:
                            continue

            elif mode == "ssh" and node:
                # 【远程模式】：使用 SSH 登录目标服务器进行远程文件比对
                self._scan_state["last_message"] = f"正在通过 SSH 扫描远程服务器 [{node_name}] ({scan_path})..."
                try:
                    rem_files = SSHNodeManager.scan_remote_files(
                        node=node,
                        remote_path=scan_path,
                        min_bytes=min_bytes,
                        exclude_patterns=self.exclude_patterns
                    )
                    for item in rem_files:
                        total_scanned += 1
                        f_path = item["path"]
                        f_sz = item["size"]
                        f_mt = item["mtime"]

                        # 计算远端相对路径
                        rel_path = os.path.relpath(f_path, scan_path)
                        rel_norm = unicodedata.normalize("NFC", os.path.normpath(rel_path))

                        # 处理 .!qB 临时文件判断
                        is_qb_incomplete = rel_norm.endswith(".!qB")
                        orig_rel_norm = rel_norm[:-4] if is_qb_incomplete else rel_norm

                        # 多维白名单核验：命中任何规则直接放行（做种中、下载中、多级分类子目录等）
                        if self._is_file_seeded(
                            full_path=f_path,
                            rel_norm=rel_norm,
                            orig_rel_norm=orig_rel_norm,
                            all_seeded_exact_paths=all_seeded_exact_paths,
                            all_seeded_subpaths=all_seeded_subpaths,
                            all_seeded_filenames=all_seeded_filenames,
                            seeded_root_names=seeded_root_names,
                            active_downloading_files=active_downloading_files,
                        ):
                            continue

                        unseeded_results.append({
                            "path": f_path,
                            "size_mb": round(f_sz / (1024 * 1024), 2),
                            "time": datetime.fromtimestamp(f_mt).strftime("%Y-%m-%d %H:%M:%S"),
                            "storage_type": "ssh",
                            "node_id": node_id,
                            "node_name": node_name,
                            "downloader": dl_name
                        })
                except Exception as se:
                    logger.error(f"[{self.plugin_name}] 远程服务器 [{node_name}] SSH 扫描异常: {se}")

        # 3. 统计汇总
        total_unseeded_size_mb = sum(f["size_mb"] for f in unseeded_results)
        self._scan_state["status"] = "completed"
        self._scan_state["last_scan_time"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self._scan_state["total_files_scanned"] = total_scanned
        self._scan_state["unseeded_count"] = len(unseeded_results)
        self._scan_state["unseeded_size_mb"] = total_unseeded_size_mb
        self._scan_state["unseeded_files"] = unseeded_results
        self._scan_state["last_message"] = f"巡检完成：扫描 {total_scanned} 个文件，发现 {len(unseeded_results)} 个未做种冗余文件"

        logger.info(f"[{self.plugin_name}] {self._scan_state['last_message']}")

        # 4. 自动清理
        deleted_count = 0
        if self.enable_auto_remove and unseeded_results:
            to_del_payload = {"files": unseeded_results}
            res = self.api_delete_files(to_del_payload)
            deleted_count = len(res.get("deleted", []))

        # 5. 推送通知与持久化
        self._send_mp_notification(unseeded_results, total_unseeded_size_mb, deleted_count)
        try:
            self.save_data("last_scan_state", self._scan_state)
        except Exception:
            pass

    def _get_downloader_conf(self, name: str) -> Optional[Any]:
        """获取指定名称下载器的配置对象"""
        if DownloaderHelper:
            try:
                configs = DownloaderHelper().get_configs() or {}
                return configs.get(name)
            except Exception:
                pass
        return None

    def _build_scan_tasks(self) -> List[Dict[str, Any]]:
        """构建待扫描任务清单：自动解析 MP 内部目录映射 或 远程 SSH 节点"""
        tasks = []
        mapping_dict = {m.get("downloader_name"): m for m in self.downloader_mappings if m.get("downloader_name")}
        node_dict = {n.get("id"): n for n in self.ssh_nodes if n.get("id")}

        configured_dls = []
        if DownloaderHelper:
            try:
                configs = DownloaderHelper().get_configs() or {}
                for name, conf in configs.items():
                    configured_dls.append((name, conf))
            except Exception:
                pass

        if configured_dls:
            for name, conf in configured_dls:
                mp = mapping_dict.get(name)
                is_enabled = mp.get("enabled", True) if mp else True
                if not is_enabled:
                    continue

                mode = mp.get("mode", "local") if mp else "local"
                node_id = mp.get("ssh_node_id") if mp else None

                if mode == "ssh" and node_id:
                    # 远程模式：取用户填写的远程路径或 SSH 节点的默认路径
                    node = node_dict.get(node_id)
                    scan_p = (mp.get("download_path") if mp else "") or (node.get("remote_path") if node else "")
                    if scan_p:
                        tasks.append({
                            "downloader_name": name,
                            "mode": "ssh",
                            "ssh_node_id": node_id,
                            "scan_path": os.path.normpath(scan_p)
                        })
                else:
                    # 本地模式：
                    # 1. 优先从 MP 下载器配置中的 path_mapping 获取容器内对应的目录映射
                    local_dirs = []
                    path_mappings = getattr(conf, "path_mapping", []) or []
                    for (storage_path, dl_path) in path_mappings:
                        clean_storage_p = storage_path.removeprefix("local:")
                        if clean_storage_p and os.path.exists(clean_storage_p):
                            local_dirs.append(clean_storage_p)

                    # 2. 用户如果手动在插件设置中填写了特定路径
                    custom_p = (mp.get("download_path") if mp else "").strip()
                    if custom_p:
                        local_dirs = [custom_p]

                    # 3. 否则继承 MP 系统【设定 -> 目录】中配置的所有本地下载目录
                    if not local_dirs:
                        local_dirs = self._get_system_download_paths()

                    for lp in local_dirs:
                        if lp:
                            tasks.append({
                                "downloader_name": name,
                                "mode": "local",
                                "ssh_node_id": None,
                                "scan_path": os.path.normpath(lp)
                            })

        # 保底任务
        if not tasks:
            def_path = self._get_default_local_path()
            if def_path:
                tasks.append({
                    "downloader_name": "本地默认下载目录",
                    "mode": "local",
                    "ssh_node_id": None,
                    "scan_path": def_path
                })

        return tasks

    def _get_system_download_paths(self) -> List[str]:
        """获取 MP 系统目录设置中所有本地下载目录路径列表"""
        paths = []
        if DirectoryHelper:
            try:
                local_dirs = DirectoryHelper().get_local_download_dirs() or []
                for d in local_dirs:
                    p = getattr(d, "download_path", None)
                    if p:
                        clean_p = str(p).removeprefix("local:")
                        if clean_p and os.path.exists(clean_p) and clean_p not in paths:
                            paths.append(clean_p)
                # 即使容器内临时不存在也先加入备选
                if not paths and local_dirs:
                    for d in local_dirs:
                        p = getattr(d, "download_path", None)
                        if p:
                            clean_p = str(p).removeprefix("local:")
                            if clean_p and clean_p not in paths:
                                paths.append(clean_p)
            except Exception:
                pass

        if not paths:
            def_p = self._get_default_local_path()
            if def_p:
                paths.append(def_p)

        return paths

    def _get_default_local_path(self) -> str:
        """获取本地首选下载路径"""
        if DirectoryHelper:
            try:
                local_dirs = DirectoryHelper().get_local_download_dirs() or []
                for d in local_dirs:
                    p = getattr(d, "download_path", None)
                    if p:
                        clean_p = str(p).removeprefix("local:")
                        if clean_p and os.path.exists(clean_p):
                            return clean_p
                if local_dirs and getattr(local_dirs[0], "download_path", None):
                    return str(local_dirs[0].download_path).removeprefix("local:")
            except Exception:
                pass

        if hasattr(settings, "DOWNLOAD_PATH") and settings.DOWNLOAD_PATH:
            if isinstance(settings.DOWNLOAD_PATH, list) and settings.DOWNLOAD_PATH:
                return str(settings.DOWNLOAD_PATH[0])
            return str(settings.DOWNLOAD_PATH)
        if os.path.exists("/downloads"):
            return "/downloads"
        return ""

    def _is_excluded(self, path: str) -> bool:
        if not path or not self.exclude_patterns:
            return False
        for pattern in self.exclude_patterns:
            pattern_norm = unicodedata.normalize("NFC", os.path.normpath(pattern))
            if path == pattern_norm or path.startswith(pattern_norm + os.sep):
                return True
            if fnmatch.fnmatch(path, pattern) or fnmatch.fnmatch(os.path.basename(path), pattern):
                return True
        return False

    def _do_cleanup(self, paths: List[str]) -> List[str]:
        actually_deleted = []
        if self.enable_recycle_bin:
            os.makedirs(self.recycle_bin_path, exist_ok=True)

        for p in paths:
            if not os.path.exists(p):
                continue
            try:
                if self.enable_recycle_bin:
                    dest = os.path.join(self.recycle_bin_path, os.path.basename(p))
                    if os.path.exists(dest):
                        name, ext = os.path.splitext(os.path.basename(p))
                        dest = os.path.join(self.recycle_bin_path, f"{name}_{int(time.time())}{ext}")
                    shutil.move(p, dest)
                    logger.info(f"[{self.plugin_name}] 移入回收站: {p} -> {dest}")
                else:
                    os.remove(p)
                    logger.info(f"[{self.plugin_name}] 物理删除: {p}")
                actually_deleted.append(p)
            except OSError as e:
                logger.error(f"[{self.plugin_name}] 清理文件失败 {p}: {e}")
        return actually_deleted

    def _send_mp_notification(self, unseeded: List[Dict], total_size_mb: float, deleted_count: int):
        # 1. 检查通知总开关
        if not self.notify_enabled:
            return

        # 2. 检查免打扰设置：如果设置了“仅发现冗余或清理时通知”，且本次既没有冗余也没删除，则保持静默
        if self.notify_only_on_unseeded and not unseeded and deleted_count == 0:
            return

        size_str = f"{total_size_mb:.1f} MB" if total_size_mb < 1024 else f"{total_size_mb/1024:.2f} GB"
        action_text = f"🚀 已自动清理 {deleted_count} 个文件" if self.enable_auto_remove else "🔍 扫描完成 (待手动处理)"
        
        lines = [
            f"🧹 Void 冗余文件清理报告",
            f"• 执行时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"• 任务状态: {action_text}",
            f"• 冗余文件: {len(unseeded)} 个",
            f"• 释放空间: {size_str}",
            f"• 保护机制: 下载中保护 + 智能映射比对"
        ]

        if unseeded:
            lines.append("──────────────────────")
            lines.append("待处理文件样例:")
            for item in unseeded[:8]:
                node_tag = f"[{item.get('node_name', '本地')}] " if item.get('node_name') else ""
                lines.append(f"- {node_tag}{os.path.basename(item['path'])} ({item['size_mb']}MB)")
            if len(unseeded) > 8:
                lines.append(f"... 等共 {len(unseeded)} 个文件")

        message = "\n".join(lines)
        try:
            # 通过 MoviePilot 原生 post_message 广播投递给所有已配置渠道
            self.post_message(
                mtype=NotificationType.Manual,
                title="【Void】冗余清理任务报告",
                text=message
            )
            logger.info(f"[{self.plugin_name}] 已成功调用 MoviePilot 消息中心推送清理报告")
        except Exception as e:
            logger.warning(f"[{self.plugin_name}] 调用 MP 发送通知异常: {e}")
