import smtplib
import ssl
import requests
from datetime import datetime
from email.mime.text import MIMEText
from email.header import Header
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from tools import logs
logger = logs.logs_configuration()

# 全局共享 Session 以提高性能
_http_session = None

def get_http_session():
    global _http_session
    if _http_session is None:
        _http_session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=2,
            status_forcelist=[500, 502, 503, 504],
            allowed_methods=["POST"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        _http_session.mount("https://", adapter)
        _http_session.mount("http://", adapter)
    return _http_session

def report(enable_auto_remove: bool, scanning_status: bool, error=None, deleted_info: dict = None, services_name="未知服务"):
    """生成统一的报告文本"""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = [
        f"{'=' * 10} 🧹 清理任务报告 {'=' * 10}",
        f"⚙️ 服务名称: {services_name}",
        f"📅 执行时间: {now}"
    ]

    # 1. 处理异常
    if error:
        error_msg = ", ".join(error) if isinstance(error, list) else str(error)
        lines.extend([
            "🛠️ 任务状态: ❌ 执行异常",
            f"❗ 错误详情: {error_msg}",
            f"{'-' * 34}",
            "💡 建议排查:",
            "   1. 检查下载器 (qBit/TR) 容器连接状态",
            "   2. 确认配置文件中的 API 账户权限",
            "   3. 检查物理磁盘挂载路径是否离线"
        ])
    
    # 2. 正常扫描但无文件
    elif not scanning_status:
        lines.extend([
            "📊 扫描详情: 未发现「未做种」的冗余文件",
            "✅ 任务结果: 目录整洁，无需操作。"
        ])

    # 3. 发现并处理文件
    else:
        info = deleted_info or {}
        files = info.get('deleted_files', [])
        raw_size = info.get('total_size', 0)
        
        # 空间换算
        size_str = f"{raw_size:.2f} MB" if raw_size < 1024 else f"{raw_size/1024:.2f} GB"
        
        status_text = "🚀 已执行自动清理" if enable_auto_remove else "🔍 扫描完成 (待手动处理)"
        mode_text = "已启用 (自动维护中)" if enable_auto_remove else "未启用 (仅报告)"
        file_label = "🗑️ 删除文件" if enable_auto_remove else "📂 待处理文件"
        
        # 限制文件列表长度，防止消息过长
        display_files = files[:15]
        file_list_str = "\n   - ".join(display_files) if display_files else "无"
        if len(files) > 15:
            file_list_str += f"\n   ... 等共 {len(files)} 个文件"

        lines.extend([
            f"📊 任务状态: {status_text}",
            f"🤖 自动模式: {mode_text}",
            f"{'-' * 34}",
            "📈 统计数据:",
            f"   • 文件数量: {len(files)} 个",
            f"   • 释放空间: {size_str}",
            "",
            f"{file_label}列表:",
            f"   - {file_list_str}"
        ])

    lines.append(f"{'=' * 34}")
    return "\n".join(lines)

def send_notification(services: dict, config: dict, scanning_status: bool, error=None, deleted_info: dict = None) -> None:
    """分发通知的入口"""
    notification_type = config.get('notification_type', 'webhook').lower()
    services_name = services.get('name', '未知服务')
    
    # 先生成报告，避免在 if/else 中重复调用
    message = report(
        enable_auto_remove=config.get('enable_auto_remove', False),
        scanning_status=scanning_status,
        error=error,
        deleted_info=deleted_info,
        services_name=services_name
    )

    logger.info(f"[发送通知] 正在通过 {notification_type} 发送报告...")

    if notification_type == "webhook":
        _send_webhook(message, config.get('webhook', {}))
    elif notification_type == "wecom":
        _send_wecom_webhook(message, config.get('wecom', {}))
    elif notification_type == "email":
        _send_email(message, config.get('email', {}))
    else:
        logger.error(f"[发送通知] 未知通知类型: {notification_type}")

def _send_webhook(message: str, webhook_config: dict) -> None:
    url = webhook_config.get('url')
    if not url:
        logger.error("[发送通知] Webhook URL 未配置")
        return

    session = get_http_session()
    payload = {
        "title": "[📣] Void 通知",
        "text": message
    }
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
    }

    try:
        # 使用全局 session 发送，verify=False 已经在 urllib3 禁用警告
        response = session.post(url, json=payload, timeout=15, headers=headers, verify=False)
        response.raise_for_status()
        logger.info("[发送通知] Webhook 发送成功")
    except Exception as e:
        logger.error(f"[发送通知] Webhook 失败: {str(e)}")

def _format_message_to_markdown(message: str) -> str:
    """
    将文本消息转换为企业微信 Markdown 格式
    """
    lines = message.split('\n')
    markdown_lines = []
    
    for line in lines:
        stripped = line.strip()
        # 处理标题行（包含等号分隔符）
        if '=' * 10 in line:
            # 提取标题文字
            title = line.replace('=', '').strip()
            if title:
                markdown_lines.append(f"## {title}")
            else:
                markdown_lines.append("---")  # 分隔线
        # 处理短横线分隔符
        elif '-' * 10 in line:
            markdown_lines.append("---")
        # 处理带 emoji 的行（标题级别）
        elif any(emoji in line for emoji in ['⚙️', '📅', '🛠️', '📊', '🚀', '🔍', '🤖', '📈', '💡']):
            # 加粗显示
            markdown_lines.append(f"**{stripped}**")
        # 处理列表项（通常是文件路径）
        elif stripped.startswith(('- ', '• ')):
            # 提取列表符号后的内容
            # 查找第一个空格后的内容
            content_start = line.find(' ') + 1
            if stripped.startswith('- '): # 处理 "   - path" 这种情况
                dash_index = line.find('- ')
                if dash_index != -1:
                    prefix = line[:dash_index+2]
                    content = line[dash_index+2:]
                    # 使用行内代码块包裹内容，解决由特殊字符（如反斜杠）在 Markdown 中不显示的问题
                    markdown_lines.append(f"{prefix}`{content}`")
                else:
                    markdown_lines.append(line)
            else:
                markdown_lines.append(line)
        # 普通文本
        else:
            markdown_lines.append(line)
    
    return '\n'.join(markdown_lines)

def _send_wecom_webhook(message: str, wecom_config: dict) -> None:
    """
    发送企业微信 Webhook 通知
    使用 markdown_v2 格式
    """
    key = wecom_config.get('key')
    if not key:
        logger.error("[发送通知] 企业微信 Webhook key 未配置")
        return

    # 将文本消息转换为 Markdown 格式
    markdown_content = _format_message_to_markdown(message)
    
    session = get_http_session()
    url = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=" + key
    payload = {
        "msgtype": "markdown_v2",
        "markdown_v2": {
            "content": markdown_content
        }
    }
    headers = {
        "Content-Type": "application/json; charset=utf-8"
    }

    try:
        response = session.post(url, json=payload, timeout=15, headers=headers, verify=False)
        response.raise_for_status()
        
        # 检查企业微信返回的状态
        result = response.json()
        if result.get('errcode') == 0:
            logger.info("[发送通知] 企业微信 Webhook 发送成功")
        else:
            logger.error(f"[发送通知] 企业微信 Webhook 失败: {result.get('errmsg', '未知错误')}")
    except Exception as e:
        logger.error(f"[发送通知] 企业微信 Webhook 失败: {str(e)}")

def _send_email(message: str, email_config: dict) -> None:
    """
    发送邮件通知
    :param message: 邮件内容
    :param email_config: 包含 smtp_host, smtp_port, username, password, to 的字典
    """
    required_keys = ["smtp_host", "smtp_port", "username", "password", "to"]
    if not all(email_config.get(k) for k in required_keys):
        logger.error("[发送通知] 邮件配置不完整")
        return

    # 1. 准备邮件元数据
    msg = MIMEText(message, 'plain', 'utf-8')
    msg['Subject'] = Header('[📣] Void 通知', 'utf-8')
    msg['From'] = email_config["username"]
    msg['To'] = email_config["to"]

    host = email_config["smtp_host"]
    port = int(email_config["smtp_port"])
        
    try:
        # 使用 SSL 连接判断
        if port == 465:
            server = smtplib.SMTP_SSL(host, port)
        else:
            server = smtplib.SMTP(host, port)
            server.starttls()
        
        server.login(email_config["username"], email_config["password"])
        server.send_message(msg)
        server.quit()
        logger.info("[发送通知] 邮件发送成功")
    except Exception as e:
        logger.error(f"[发送通知] 邮件失败: {type(e).__name__}: {str(e)}")