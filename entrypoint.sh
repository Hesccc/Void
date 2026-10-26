#!/bin/bash
set -e

# 定义配置文件在容器内的路径
CONFIG_PATH="/app/config/config.yaml"

# 定义镜像自带的备份路径
DEFAULT_CONFIG="/app/defaults/config.yaml"

# 检查挂载的目录中是否存在配置文件
if [ ! -f "$CONFIG_PATH" ]; then
    echo "检测到配置文件缺失，正在初始化默认配置..."
    # 如果目录不存在则创建
    mkdir -p "$(dirname "$CONFIG_PATH")"
    # 拷贝默认模板到挂载目录
    cp "$DEFAULT_CONFIG" "$CONFIG_PATH"
    echo "配置文件初始化成功！"
else
    echo "配置文件已存在，跳过初始化。"
fi

# 执行容器的主命令 (即 Dockerfile 中的 CMD)
exec "$@"