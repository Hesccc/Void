# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-01-23

### 🎉 新功能

- **全局扫描模式**: 支持扫描共享目录并跨多个下载器检查文件是否做种
  - 新增 `module/global_scanner.py` 全局扫描模块
  - 新增 `GLOBAL_MODE.md` 详细使用文档
  - 新增 `config-global-example.yaml` 配置示例
  - 通过配置 `global_scan.enabled: True` 启用

### 🔧 修复

- **跨平台路径映射支持**: 修复 Windows 环境下路径识别问题
  - 修复 Windows 盘符路径（如 `T:\`）无法正确识别的问题
  - 修复 `Path.resolve()` 在 Windows 上错误解析 Linux 路径的问题
  - 重写 `normalize_path()` 和 `translate_path()` 函数
  - 支持简化格式路径映射：`"T:\\": "/download"`
  - 支持完整格式路径映射：`{"remote": "/data", "local": "/path"}`

### ♻️ 重构

- **统一程序入口**: 重构 `main.py` 支持双模式
  - 根据配置自动选择普通模式或全局模式
  - 无需修改 Docker 配置即可切换模式
  - 废弃 `main_global.py`（功能已合并到 `main.py`）

### 📚 文档

- 新增 `GLOBAL_MODE.md` - 全局扫描模式完整指南
- 新增 `UPDATE_SUMMARY.md` - 详细更新总结
- 新增 `tests/test_path_mapping.py` - 路径映射测试套件
- 更新 `README.md` - 添加路径映射示例
- 更新 `config-examples.yaml` - 添加全局模式配置说明

### ✅ 测试

- 添加路径映射单元测试（11 个测试用例全部通过）
- 验证 Windows 和 Linux 路径映射功能
- 验证普通模式和全局模式运行正常

---

## [1.0.0] - 2025-12-27

### 🎉 首次发布

- 支持 qBittorrent 和 Transmission
- 支持多下载器实例
- 文件大小阈值过滤
- 排除路径配置
- Email 和 Webhook 通知
- 定时任务调度
- Docker 部署支持
