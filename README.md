# Void

一款用于自动清理 PT/BT 下载目录中**未做种（冗余）文件**的工具。它会通过 API 连接下载客户端（qBittorrent/Transmission），获取所有当前正在做种的文件列表，并与本地下载目录进行比对，自动删除那些**不在做种列表中**的文件和空文件夹，帮助你释放磁盘空间。

- docker hub仓库：[https://hub.docker.com/repository/docker/hescc/void/general](https://hub.docker.com/r/hescc/void)
- github仓库：[https://github.com/Hesccc/Void](https://github.com/Hesccc/Void)

> 借鉴蜂巢论坛[PT工具：找到硬盘里没有被做种的文件](https://pting.club/d/1840) 文章中的Python代码
>
> 在此基础上添加：扫描结果通知、定时执行、自动删除、Docker封装

> **最新更新 v2.0**: 
> - ✅ 现已支持 Windows 和 Linux 跨平台运行
> - ✅ 新增全局扫描模式（多下载器共享目录）
> - 📚 [快速开始指南](QUICKSTART.md) | [全局模式说明](GLOBAL_MODE.md)

## ✨ 主要特性

* **双扫描模式**: 
  * 普通模式 - 每个下载器独立扫描自己的目录
  * 全局模式 ⭐ - 扫描共享目录，跨所有下载器检查（[详细说明](GLOBAL_MODE.md)）
* **跨平台支持**: 完美支持 Windows 和 Linux 操作系统
* **多客户端支持**: 支持 qBittorrent 和 Transmission
* **多实例支持**: 支持同时连接多个下载器实例。
* **智能比对**: 自动处理路径映射（Docker 容器路径 vs 本地实际路径），支持 Windows/Linux 跨平台路径转换。
* **安全保护**:
  * **文件大小阈值**: 可设置仅删除大于指定大小的文件 (例如 > 50MB)，防止误删小文件 (nfo, 字幕等)。
  * **排除路径**: 支持配置排除目录，保护重要文件不被扫描。
* **自定义配置**:支持输出检查报告 或 主动删除
* **通知系统**: 支持 Email、常规 Webhook (Discord, Slack, Telegram 等) 和**企业微信 Webhook** 发送清理报告
* **定时任务**: 内置定时任务调度器，支持自定义检查频率。
* **Docker 部署**: 提供 Dockerfile 和 docker-compose 一键部署，支持 uv 加速依赖安装。

## 🚀 快速开始 (Docker)

### 1. 准备配置

在你的机器上创建配置目录并复制配置模板：

```bash
# 创建目录
mkdir -p /opt/void/config

# 复制配置模板
cp config/config-examples.yaml /opt/void/config/config.yaml

# 编辑配置
nano /opt/void/config/config.yaml
```

### 2. 启动容器

使用 Docker Compose 启动（推荐）：

```yaml
version: '3.8'

services:
  Void:
    image: hescc/void:latest
    container_name: void
    network_mode: host
    restart: unless-stopped
    environment:
      - TZ=Asia/Shanghai # 设置容器时区为上海
    volumes:
      # 格式为 [宿主机路径]:[容器内路径]
    
      # 1. 配置文件挂载
      # 作用：将宿主机的配置持久化。修改 /opt/config 下的文件即可调整程序行为，
      # 容器重启或更新镜像后，配置不会丢失。
      - /opt/config:/app/config
    
      # 2. 数据目录挂载
      # 作用：这是程序扫描和清理的目标目录。
      # 程序会在容器内的 /data 路径下查找未做种的文件。
      # 请确保此路径与你在配置文件中设置的路径一致。
      - /data:/data
```

```bash
docker-compose up -d
```

或者使用 Docker CLI：

```bash
docker run -d \
  --name void \
  --restart always \
  -e TZ=Asia/Shanghai \
  -v /opt/config:/app/config \
  -v /data:/data \
  hescc/void:latest
```

## ⚙️ 配置说明 (config.yaml)

```yaml
# =================================================================
# 全局设置：执行频率、通知配置、文件大小阈值、排除路径等
# =================================================================
check_interval: 60              # 任务执行频率(分钟)，默认执行频率为：60分钟。例如：60：每小时执行一次；720：每12小时执行一次，1440：每天执行一次
enable_auto_remove: False       # 是否启用自动删除，True，False表示禁用(禁用只发送检查通知)
notification_type: "wecom"    # 通知类型：email、webhook、wecom（企业微信）
checkfile_size: 0             # 文件大小阈值(MB)，仅删除大于等于该值的未做种文件。设置为0则不限制文件大小。例如：50表示50MB， 0表示不限制
excluded_paths: []            # 排除路径列表,不支持通配符需要填写完整路径；默认无设置排除目录

# 排除路径列表配置示例
# excluded_paths:
    # - "/data/important/"
    # - "/data/movies/exclude_this_folder/"

email:
  smtp_host: "smtp.example.com"     # SMTP服务器地址
  smtp_port: 465                    # 端口 (SSL一般为465)
  username: "send@example.com"      # 发件人邮箱地址
  password: "xxxxxxx"               # 邮箱授权码
  to: "to@example.com"              # 收件人地址

webhook:
  url: "https://example.com/webhook"  # Webhook URL


# 企业微信 Webhook 通知配置
# 使用方法：设置 notification_type: "wecom"
wecom:
  key: "437e9174-xxxx-4b4b-xxxx-852d0f1fa1ea"  # 企业微信机器人 Webhook URL

# =================================================================
# PT下载器配置，支持多个PT下载器
# =================================================================
services:
  - name: "QB02"
    type: "qbittorrent"
    host: "127.0.0.1"
    port: 8080
    username: "admin"
    password: "example"
    path_mapping:
      - "/data": "/data"

#### 示例配置（更多下载器）

# Linux 环境示例
#   - name: "TR01"                 # 服务名称
#     type: "transmission"         # 服务类型: qbittorrent 或 transmission
#     host: "127.0.0.1"            # PT下载器服务地址，确保容器内能访问
#     port: 9091                   # 服务端口
#     username: "admin"            # 登录用户名
#     password: "admin"            # 登录密码
#     path_mapping:                # 路径映射关系
#       - "/downloads": "/data"    # 格式："宿主机路径": "下载器内的保存路径"

# Windows 环境示例
#   - name: "QB-Windows"
#     type: "qbittorrent"
#     host: "10.10.0.100"
#     port: 8080
#     username: "admin"
#     password: "password"
#     path_mapping:
#       - "T:\\": "/download"      # Windows 路径必须使用双反斜杠 "\\"
#       - "D:\\Media": "/media"    # 支持配置多个映射关系

# 完整格式示例（兼容旧版本）
#   - name: "QB03"
#     type: "qbittorrent"
#     host: "192.168.1.100"
#     path_mapping:
#       - remote: "/data"          # 下载器内的路径
#         local: "/mnt/data"       # 宿主机实际路径
```

## 运行效果

邮件通知

![邮件通知](https://ovvo.oss-cn-shenzhen.aliyuncs.com/GitHub/PixPin_2026-01-23_02-17-26.png)


MoviePilot通知转发

![MoviePile通知转发](https://ovvo.oss-cn-shenzhen.aliyuncs.com/GitHub/PixPin_2026-01-23_02-20-43.png)


企业微信通知

![企业微信通知](https://ovvo.oss-cn-shenzhen.aliyuncs.com/GitHub/ScreenShot_2026-01-23_021214_778.png)

## 🛠️ 本地开发与运行

本项目使用 `uv` 进行依赖管理。

1. **拉取仓库**:

```bash
git clone https://github.com/Hesccc/void.git
```

2. **安装依赖**:

```bash
uv sync
```

3. **运行**:

```bash
uv run main.py
```

## ⚠️ 注意事项

1. **路径映射**: 请务必确保 `config.yml` 中的 `path_mapping` 正确。*PT客户端看到的下载路径* 必须能准确映射到 *本工具容器内挂载的路径*，否则会导致误删或找不到文件。
2. **数据无价**: 初次使用建议先设置较大的 `checkfile_size` 或在测试环境运行，确认日志输出符合预期后再投入生产使用。

