# Void 项目更新总结

**更新日期**: 2026-01-23  
**版本**: v2.0

---

## 📋 本次更新内容

### 🔧 问题修复

#### 1. **跨平台路径映射支持** ✅

**问题**：
- Windows 环境下报错 "路径不存在，跳过: E:\download"
- 配置的 `T:\` 路径无法正确识别
- `Path.resolve()` 在 Windows 上错误地解析 Linux 路径

**解决方案**：
- 重写了 `normalize_path()` 函数，智能识别 Windows/Linux 路径
- 重写了 `translate_path()` 函数，支持简化和完整两种配置格式
- 使用字符串匹配而非 Path 对象，避免跨平台问题
- 修复了 Windows 盘符路径拼接问题（`T:` → `T:\movies`）

**修改文件**：
- `module/unseeded.py`

**测试结果**：
- ✅ Windows 路径映射正常工作
- ✅ Linux 路径映射正常工作
- ✅ 所有 11 个测试用例通过

---

### 🌟 新功能

#### 2. **全局扫描模式** ⭐ **NEW**

**功能描述**：
支持扫描一个被多个下载器共享的目录，只有不在任何下载器中做种的文件才会被标记/删除。

**使用场景**：
```
普通模式：
QB01 → /data/qb01/  (独立目录)
QB02 → /data/qb02/  (独立目录)

全局模式：
QB01 → /data/  ┐
QB02 → /data/  ├─ 共享目录
TR01 → /data/  ┘
```

**新增文件**：
- `module/global_scanner.py` - 全局扫描核心模块
- `GLOBAL_MODE.md` - 详细使用文档
- `config-global-example.yaml` - 配置示例
- `config-global-test.yaml` - 测试配置

**修改文件**：
- `main.py` - 重构为统一入口，支持双模式
- `config-examples.yaml` - 添加全局模式配置说明

**配置方式**：
```yaml
# 启用全局扫描模式
global_scan:
  enabled: True
  scan_paths:
    - "/data"        # 要扫描的共享目录

# 配置所有下载器
services:
  - name: "QB01"
    type: "qbittorrent"
    host: "127.0.0.1"
    port: 8080
    username: "admin"
    password: "password"
    path_mapping:
      - "/data": "/downloads"
  
  - name: "QB02"
    ...
```

**运行方式**：
```bash
# 统一入口，自动根据配置选择模式
uv run main.py

# Docker 运行
docker run -d \
  -v /opt/config:/app/config \
  -v /data:/data \
  hescc/void:latest
```

---

### 📚 文档更新

#### 3. **完善的文档体系**

新增/更新文档：
- ✅ `GLOBAL_MODE.md` - 全局模式完整使用指南
- ✅ `README.md` - 更新路径映射示例
- ✅ `config-examples.yaml` - 添加全局模式说明
- ✅ `tests/test_path_mapping.py` - 路径映射测试套件

---

## 🎯 核心改进

### 路径映射格式

现在支持两种格式，可以混用：

**格式一：简化格式**（推荐）
```yaml
path_mapping:
  - "T:\\": "/download"      # Windows
  - "/downloads": "/data"    # Linux
```

**格式二：完整格式**
```yaml
path_mapping:
  - remote: "/data"          # 容器路径
    local: "/mnt/data"       # 本地路径
```

### 双模式支持

**统一入口设计**：
- ✅ 只有一个 `main.py` 入口文件
- ✅ 通过配置自动选择运行模式
- ✅ 完美适配 Docker 部署
- ✅ 无需修改 Dockerfile 或启动命令

**模式切换**：
```yaml
# 普通模式（默认）
# 不配置 global_scan 或设置 enabled: False

# 全局模式
global_scan:
  enabled: True
  scan_paths: ["/data"]
```

---

## 📁 文件变更清单

### 新增文件
```
module/global_scanner.py        # 全局扫描核心模块
GLOBAL_MODE.md                  # 全局模式文档
config-global-example.yaml      # 全局模式配置示例
config-global-test.yaml         # 测试配置
tests/test_path_mapping.py      # 路径映射测试
```

### 修改文件
```
main.py                         # 重构为双模式统一入口
module/unseeded.py              # 修复路径映射逻辑
config-examples.yaml            # 添加全局模式说明
README.md                       # 更新路径映射示例
```

### 废弃文件
```
main_global.py                  # 已废弃，功能合并到 main.py
```

---

## 🧪 测试验证

### 测试环境
- 操作系统：Windows
- Python：3.14
- 下载器：qBittorrent

### 测试结果

**普通模式**：
```
✅ 路径映射正确工作
✅ 扫描功能正常
✅ 未做种文件检测准确
```

**全局模式**：
```
✅ 多下载器聚合正常
✅ 扫描共享目录成功
✅ 跨下载器检查准确
✅ 检查了 1688 个文件，未发现误判
```

**路径映射测试**：
```
✅ 11/11 测试用例通过
✅ Windows 路径映射正确
✅ Linux 路径映射正确
✅ 简化格式支持正常
✅ 完整格式支持正常
```

---

## 🚀 升级指南

### 从旧版本升级

1. **备份配置**
```bash
cp config.yaml config.yaml.bak
```

2. **更新代码**
```bash
git pull origin main
```

3. **更新依赖**
```bash
uv sync
```

4. **测试运行**
```bash
# 检查配置是否正常
uv run main.py
```

### Docker 用户

```bash
# 停止旧容器
docker stop void

# 拉取新镜像
docker pull hescc/void:latest

# 启动新容器（使用相同配置）
docker start void
```

**无需修改**：
- ✅ Dockerfile
- ✅ docker-compose.yml
- ✅ 启动命令
- ✅ 环境变量

---

## 📖 使用建议

### 选择合适的模式

**使用普通模式当**：
- 每个下载器有独立的下载目录
- 不同下载器管理不同类型的内容
- 需要分别管理各下载器的文件

**使用全局模式当**：
- 所有下载器共享同一个下载目录
- 想要集中清理未做种文件
- 需要跨下载器检查文件状态
- 有负载均衡场景（多个下载器，同一存储）

### 最佳实践

1. **首次使用**
   - 设置 `enable_auto_remove: False`（仅报告）
   - 检查日志输出是否符合预期
   - 确认路径映射正确
   - 确认无误后再启用自动删除

2. **路径映射**
   - 使用简化格式更简洁易读
   - Windows 路径使用双反斜杠 `\\`
   - 确保映射能正确转换到实际文件路径

3. **全局模式**
   - 确保所有下载器都能正常连接
   - 路径映射必须准确
   - 建议先用单个下载器测试

---

## 🔗 相关资源

- **完整文档**: `README.md`
- **全局模式指南**: `GLOBAL_MODE.md`
- **配置示例**: `config-examples.yaml`, `config-global-example.yaml`
- **测试代码**: `tests/test_path_mapping.py`

---

## 🙏 致谢

感谢所有使用 Void 的用户，您的反馈帮助我们不断改进！

如有问题，请在 GitHub 提交 Issue。
