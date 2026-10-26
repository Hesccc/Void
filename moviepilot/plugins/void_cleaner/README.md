# Void Cleaner for MoviePilot 插件

专为 **MoviePilot** 定制的冗余孤儿文件清理插件。通过直接挂载到 MoviePilot 内部，彻底消除 Docker 路径映射与下载器配置的繁琐步骤，并在 **MoviePilot 左侧导航栏**中增加专属的可视化管理界面。

---

## 🌟 核心特性

1. **固定在 MoviePilot 左侧导航栏**：
   * 插件内置 `get_page()` 路由，在 MP 左侧边栏新增 **「Void 清理」** 独立入口；
   * 点开即为现代黑曜石暗色管理界面：实时展示待清理文件、已释放空间，支持**在线一键手动触发扫描**与**批量勾选清理**。
2. **彻底告别路径映射**：
   * 自动继承 MoviePilot 系统中已配置的 `DOWNLOAD_PATH`（下载目录），无需用户手动理解并配置容器路径转换。
3. **彻底免配下载器**：
   * 自动读取 MoviePilot 现有的 qBittorrent / Transmission 客户端连接池，开箱即用。
4. **单文件展开 + Inode 硬链接穿透保护**：
   * 展开种子内部每个真实文件，精准定位解压后多余的垃圾文件；
   * 通过 `(st_dev, st_ino)` 校验，绝不误杀被 MoviePilot 硬链接转移到影视库的同源文件！
5. **原生复用 MP 通知中心**：
   * 巡检完成自动调用 MP 原生通知网关，企业微信、Telegram、网页端全渠道排版推送。

---

## 📦 安装与使用方式

### 方式一：直接映射/拷贝到 MP 容器的 plugins 目录（最推荐）

将整个 `void_cleaner` 文件夹，拷贝或挂载到你的 MoviePilot 容器的插件目录：

```bash
# 假设你的宿主机 MoviePilot 配置目录为 /volume1/docker/moviepilot
cp -r moviepilot/plugins/void_cleaner /volume1/docker/moviepilot/plugins/
```

如果使用 `docker-compose.yaml`，可以直接映射插件卷：
```yaml
services:
  moviepilot:
    image: jxxghp/moviepilot:latest
    volumes:
      - /your_path/moviepilot/config:/config
      # 直接挂载本插件目录
      - ./moviepilot/plugins/void_cleaner:/app/plugins/void_cleaner
```

### 方式二：在 MoviePilot 界面管理

1. 重启或刷新 MoviePilot；
2. 进入 MoviePilot 后台：
   * 在 **「插件」** 列表中可以看到 **「Void 冗余文件清理」**，点击右侧开关启用；
   * 点击设置图标，可配置定时 Cron（默认凌晨 3 点）、回收站开关及小文件大小阈值；
3. **在 MP 左侧导航栏点击「Void 清理」**：
   * 即可打开专属交互面板，实时查看未做种文件、一键触发全量巡检、勾选物理删除！
