# 使用官方 Python 3.11 slim 镜像作为基础镜像
FROM python:3.11-slim

# 安装 uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# 设置环境变量
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # 使用 uv 创建的虚拟环境
    VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    # 配置文件的默认路径，配合 entrypoint.sh 使用
    CONFIG_PATH="/app/config/config.yaml" \
    # 日志文件路径，暴露到 config 目录
    LOG_PATH="/app/config/logs/Void.log"

# 设置工作目录
WORKDIR /app

RUN uv venv $VIRTUAL_ENV

# 复制依赖相关文件
COPY pyproject.toml ./

# 安装依赖
RUN uv pip install --no-cache -r ./pyproject.toml

# 复制项目源代码
COPY . .

# 设置配置文件模板
# 将源码中的 config.yaml 移动到 defaults 目录，供 entrypoint.sh 在初始化时使用
RUN mkdir -p defaults && \
    mv config.yaml defaults/config.yaml && \
    chmod +x entrypoint.sh

# 声明配置挂载点
VOLUME ["/app/config", "/data"]

# 设置入口点脚本
ENTRYPOINT ["/app/entrypoint.sh"]

# 默认启动命令
CMD ["python", "main.py"]