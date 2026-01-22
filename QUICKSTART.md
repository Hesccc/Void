# Void 快速开始指南 🚀

## 🎯 5分钟快速上手

### 步骤 1: 选择运行模式

Void 支持两种扫描模式，根据你的场景选择：

| 场景 | 选择模式 |
|------|---------|
| 每个下载器有独立的下载目录 | **普通模式** |
| 多个下载器共享同一个目录 | **全局模式** |

---

## 📦 方式一：Docker 运行（推荐）

### 普通模式

**1. 创建配置目录**
```bash
mkdir -p /opt/void/config
cd /opt/void/config
```

**2. 创建配置文件 `config.yaml`**
```yaml
check_interval: 60
enable_auto_remove: False  # 首次使用建议设为 False
notification_type: "webhook"
checkfile_size: 50
excluded_paths: []

webhook:
  url: "https://your-webhook-url"

services:
  - name: "QB01"
    type: "qbittorrent"
    host: "127.0.0.1"
    port: 8080
    username: "admin"
    password: "password"
    path_mapping:
      - "/data": "/downloads"  # 本地路径: 容器内路径
```

**3. 运行容器**
```bash
docker run -d \
  --name void \
  --restart unless-stopped \
  -v /opt/void/config:/app/config \
  -v /data:/data \
  hescc/void:latest
```

**4. 查看日志**
```bash
docker logs -f void
```

---

### 全局模式

**1. 修改配置文件，添加全局扫描配置**
```yaml
# ... 其他配置不变 ...

# 添加这部分
global_scan:
  enabled: True
  scan_paths:
    - "/data"  # 要扫描的共享目录

# 配置所有下载器
services:
  - name: "QB01"
    type: "qbittorrent"
    host: "127.0.0.1"
    port: 8080
    username: "admin"
    password: "password1"
    path_mapping:
      - "/data": "/downloads"
  
  - name: "QB02"
    type: "qbittorrent"
    host: "192.168.1.100"
    port: 8080
    username: "admin"
    password: "password2"
    path_mapping:
      - "/data": "/data"
```

**2. 重启容器**
```bash
docker restart void
```

---

## 🖥️ 方式二：本地运行

### 1. 安装依赖

```bash
# 克隆仓库
git clone https://github.com/Hesccc/void.git
cd void

# 安装 uv（如果未安装）
curl -LsSf https://astral.sh/uv/install.sh | sh

# 安装依赖
uv sync
```

### 2. 配置文件

```bash
# 复制配置模板
cp config-examples.yaml config.yaml

# 编辑配置
nano config.yaml
```

### 3. 运行

```bash
# 普通模式（默认）
uv run main.py

# 全局模式（需在 config.yaml 中设置 global_scan.enabled: True）
uv run main.py
```

---

## 🔍 Windows 环境配置示例

```yaml
services:
  - name: "QB-Windows"
    type: "qbittorrent"
    host: "127.0.0.1"
    port: 8080
    username: "admin"
    password: "admin"
    path_mapping:
      - "T:\\": "/download"      # 注意：Windows 路径使用双反斜杠
      - "D:\\Media": "/media"

# 全局模式（可选）
global_scan:
  enabled: True
  scan_paths:
    - "T:\\"                     # 扫描 T 盘
```

---

## ⚙️ 常用配置说明

| 配置项 | 说明 | 推荐值 |
|--------|------|--------|
| `check_interval` | 扫描间隔（分钟） | `60` |
| `enable_auto_remove` | 是否自动删除 | 首次使用：`False` |
| `checkfile_size` | 文件大小阈值（MB） | `50` |
| `notification_type` | 通知方式 | `webhook` 或 `email` |

---

## 📊 验证运行

### 检查日志

**Docker**:
```bash
docker logs -f void
```

**本地运行**:
```bash
tail -f logs/Void.log
```

### 期望输出

**普通模式**:
```
===== Void 服务 已启动 (普通模式) =====
清理: 【仅扫描报告】
周期: 每 60 分钟执行一次
[模式] 普通扫描模式
--- 正在扫描服务: QB01 ---
[扫描开始] 服务: QB01 (qbittorrent)
[扫描] QB01 目录整洁
```

**全局模式**:
```
===== Void 服务 已启动 (全局扫描模式) =====
清理: 【仅扫描报告】
周期: 每 60 分钟执行一次
扫描目录: ['/data']
下载器数量: 2
[全局扫描] 开始聚合 2 个下载器的做种文件
[全局扫描] QB01: 找到 150 个做种文件
[全局扫描] QB02: 找到 200 个做种文件
[全局扫描] 聚合完成，共 350 个做种文件
```

---

## ✅ 启用自动删除

确认运行正常后，可以开启自动删除：

```yaml
enable_auto_remove: True
```

然后重启服务：
```bash
# Docker
docker restart void

# 本地
# Ctrl+C 停止，然后重新运行
uv run main.py
```

---

## 🆘 常见问题

### 提示 "路径不存在"

**原因**: 路径映射配置错误

**解决**:
1. 检查 `path_mapping` 配置
2. 确保本地路径实际存在
3. Windows 路径使用双反斜杠 `\\`

### 所有文件都被标记为未做种

**原因**: 路径映射不正确，导致无法匹配做种文件

**解决**:
1. 检查日志中的路径转换是否正确
2. 确认下载器连接正常
3. 验证路径映射的方向（本地:容器）

### 无法连接下载器

**原因**: 网络或认证问题

**解决**:
1. 检查 host 和 port 配置
2. 验证 username 和 password
3. 确保 Docker 容器能访问下载器（可能需要 `network_mode: host`）

---

## 📚 进阶文档

- **完整文档**: [README.md](README.md)
- **全局模式详解**: [GLOBAL_MODE.md](GLOBAL_MODE.md)
- **更新日志**: [CHANGELOG.md](CHANGELOG.md)
- **配置示例**: 
  - 普通模式: `config-examples.yaml`
  - 全局模式: `config-global-example.yaml`

---

## 🔗 获取帮助

- GitHub Issues: [提交问题](https://github.com/Hesccc/void/issues)
- Docker Hub: [hescc/void](https://hub.docker.com/r/hescc/void)

---

**祝您使用愉快！** 🎉
