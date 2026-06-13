# Void

一款用于自动清理 PT/BT 下载目录中**未做种（冗余）文件**的工具。它会通过 API 连接下载客户端（qBittorrent/Transmission），获取所有当前正在做种的文件列表，并与本地下载目录进行比对，自动删除那些**不在做种列表中**的文件和空文件夹，帮助你释放磁盘空间。

- Docker Hub 仓库：[https://hub.docker.com/r/hescc/void](https://hub.docker.com/r/hescc/void)
- GitHub 仓库：[https://github.com/Hesccc/Void](https://github.com/Hesccc/Void)

> 借鉴蜂巢论坛 [PT工具：找到硬盘里没有被做种的文件](https://pting.club/d/1840) 文章中的 Python 代码
>
> 在此基础上添加：可视化 Web 管理后台、扫描任务生命周期控制、扫描结果通知、定时执行、自动删除、Docker 封装

## ✨ 主要特性

* **可视化 Web 管理后台 ⭐**:
  * **控制中心 (Dashboard)**：实时展示冗余文件总数、占用空间大小、已清理文件统计、最近扫描时间，以及活动任务的 live 进度看板（支持暂停/继续/终止操作）。
  * **冗余文件管理**：支持去重合并显示和按历史任务过滤，提供物理删除功能与彩色客户端徽章标识。已物理删除的文件在历史中以灰色删除线回显，保证历史完整性。
  * **任务管理**：任务列表支持彩色状态徽章与动态进度条展示。支持暂停、继续或安全终止正在运行的任务，并可一键级联删除任务记录与关联的扫描结果。
  * **配置中心**：扫描周期、客户端、排除路径与推送通知按基础、服务、排除、通知 4 个 Tab 分栏分类管理；客户端密码及邮箱授权码支持明暗文切换；内置测试连接功能，即时验证下载器连通性。
  * **实时日志终端**：基于 SSE (Server-Sent Events) 流式直观显示控制台日志，支持自动滚动。
* **双扫描模式**:
  * **普通模式** — 每个下载器独立扫描自己的下载目录
  * **全局模式** — 扫描共享目录，跨所有下载器聚合做种列表后统一检查
* **任务生命周期控制**: 基于线程锁与事件模型，支持扫描任务的暂停、恢复与安全终止
* **跨平台支持**: 支持 Windows 和 Linux 操作系统
* **多客户端支持**: 支持 qBittorrent 和 Transmission
* **多实例支持**: 支持同时连接多个下载器实例
* **智能路径映射**: 自动处理 Docker 容器路径与本地实际路径的映射转换，支持 Windows/Linux 跨平台路径规范化
* **安全保护**:
  * **文件大小阈值**: 可设置仅删除大于指定大小的文件 (例如 > 50MB)，防止误删小文件 (nfo, 字幕等)
  * **排除路径**: 支持配置排除目录，保护重要文件不被扫描（支持 Glob 通配符匹配）
  * **回收站模式**: 可选将文件移入回收站而非直接物理删除，降低误删风险
* **通知系统**: 支持 Email (SMTP/SSL)、通用 Webhook (兼容 Discord/Slack/Telegram/MoviePilot 等) 和企业微信 Webhook 发送清理报告
* **定时任务**: 内置 schedule 调度器，支持自定义检查频率（分钟级），并支持运行时热更新执行周期
* **数据持久化**: 使用 SQLite 数据库持久化任务记录和扫描结果，自动清理 180 天前的历史数据
* **Docker 部署**: 提供 Dockerfile 和 docker-compose 一键部署，使用 `uv` 加速 Python 依赖安装

## 🚀 快速开始 (Docker)

### 1. 启动容器

使用 Docker Compose 启动（推荐）：

```yaml
services:
  void:
    image: hescc/void:latest
    container_name: void
    # 若不使用 host 网络模式，可取消注释 ports 并注释 network_mode
    # ports:
    #   - 8000:8000
    network_mode: host
    restart: unless-stopped
    environment:
      - TZ=Asia/Shanghai
    volumes:
      - ./config:/app/config    # 配置文件与数据库持久化
      - /data:/data             # 下载目录挂载（程序扫描的目标目录）
```

```bash
docker-compose up -d
```

或者使用 Docker CLI：

* **使用 host 网络模式（推荐）**：
```bash
docker run -d \
  --name void \
  --restart unless-stopped \
  --network host \
  -e TZ=Asia/Shanghai \
  -v ./config:/app/config \
  -v /data:/data \
  hescc/void:latest
```

* **使用端口映射桥接模式**：
```bash
docker run -d \
  --name void \
  --restart unless-stopped \
  -p 8000:8000 \
  -e TZ=Asia/Shanghai \
  -v ./config:/app/config \
  -v /data:/data \
  hescc/void:latest
```

### 2. 进入管理后台

容器首次启动时，会**自动生成默认配置文件** `config.yaml` 到挂载的 `./config` 目录中，无需手动创建。

启动成功后，通过浏览器访问 Web GUI 管理后台：

```
http://[宿主机IP]:8000
```
**默认账号：admin**

**默认密码：void@123**

> 首次部署强制修改密码才能使用。

在管理后台的**配置中心**页面中，可以可视化地完成所有配置项设置：

- **基础设置**：扫描周期、自动删除开关、文件大小阈值
- **服务配置**：添加 qBittorrent / Transmission 下载器实例、路径映射、测试连接
- **排除路径**：配置不参与扫描的目录
- **通知设置**：配置 Email / Webhook / 企业微信通知

## 运行效果

### 登录界面

![登录界面](https://ovvo.oss-cn-shenzhen.aliyuncs.com/%E5%BE%AE%E4%BF%A1%E5%9B%BE%E7%89%87_2026-06-13_234428_436.png)

### 控制中心

![控制中心](https://ovvo.oss-cn-shenzhen.aliyuncs.com/PicGo/20260613234756198.png)

### 冗余文件

![冗余文件](https://ovvo.oss-cn-shenzhen.aliyuncs.com/PicGo/20260613234858622.png)

### 任务管理

![任务管理](https://ovvo.oss-cn-shenzhen.aliyuncs.com/PicGo/20260613234944648.png)

### 配置中心

![配置中心](https://ovvo.oss-cn-shenzhen.aliyuncs.com/PicGo/20260613235030760.png)

### 实时日志

![实时日志](https://ovvo.oss-cn-shenzhen.aliyuncs.com/PicGo/20260613235216520.png)

通知功能
1. 邮件通知

![邮件通知](https://ovvo.oss-cn-shenzhen.aliyuncs.com/GitHub/PixPin_2026-01-23_02-17-26.png)

2. MoviePilot通知转发

![MoviePilot通知转发](https://ovvo.oss-cn-shenzhen.aliyuncs.com/GitHub/PixPin_2026-01-23_02-20-43.png)

3. 企业微信通知

![企业微信通知](https://ovvo.oss-cn-shenzhen.aliyuncs.com/GitHub/ScreenShot_2026-01-23_021214_778.png)

## 🛠️ 本地开发与运行

本项目使用 `uv` 进行 Python 依赖管理，要求 Python >= 3.11。

1. **拉取仓库**:

```bash
git clone https://github.com/Hesccc/void.git
cd void
```

2. **安装依赖**:

```bash
uv sync
```

3. **运行**:

```bash
uv run main.py
```

启动后同样可通过 `http://localhost:8000` 访问 Web 管理后台。

## 📁 项目结构

```
Void/
├── main.py                     # 程序主入口（调度器 + Web 服务启动）
├── module/
│   ├── web_server.py           # FastAPI Web 后端（REST API + SSE 日志流）
│   ├── task_runner.py          # 扫描任务调度与生命周期管理
│   ├── unseeded.py             # 普通模式扫描核心（含路径映射、客户端连接）
│   ├── global_scanner.py       # 全局模式扫描（跨下载器聚合做种列表）
│   ├── notification.py         # 通知发送（Email / Webhook / 企业微信）
│   └── db.py                   # SQLite 数据库操作（任务与扫描结果）
├── tools/
│   ├── config.py               # YAML 配置文件加载
│   └── logs.py                 # 日志配置（RotatingFileHandler + Console）
├── static/
│   ├── index.html              # Web GUI 前端页面
│   ├── index.css               # 前端样式
│   ├── index.js                # 前端逻辑
│   └── favicon.png             # 站点图标
├── config/
│   ├── config-examples.yaml    # 普通模式配置模板
│   └── config-global-example.yaml  # 全局模式配置模板
├── Dockerfile                  # Docker 镜像构建文件
├── docker-compose.yaml         # Docker Compose 编排文件
├── entrypoint.sh               # 容器入口脚本（自动初始化配置）
└── pyproject.toml              # 项目依赖定义
```

## ⚠️ 注意事项

1. **路径映射**: 请务必确保配置中的 `path_mapping` 正确。下载客户端看到的保存路径必须能准确映射到本工具实际可访问的路径，否则会导致误删或找不到文件。
2. **数据无价**: 初次使用建议先将 `enable_auto_remove` 设为 `false`（仅扫描报告模式），或设置较大的 `checkfile_size` 阈值，确认扫描结果符合预期后再启用自动删除。
3. **全局模式**: 启用全局扫描模式时，`scan_paths` 中的扫描目录必须与至少一个下载器的 `path_mapping` 中的本地路径存在关联（路径包含关系），否则该扫描路径会被自动跳过。
