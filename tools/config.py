import os
import sys
import yaml
from tools import logs

# 初始化日志记录器
logger = logs.logs_configuration()

def yaml_configuration():
    # 默认配置文件路径：config/config.yaml
    # 可通过环境变量 CONFIG_PATH 覆盖
    config_file = os.getenv("CONFIG_PATH", "./config/config.yaml")
    
    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            # safe_load 返回解析后的字典或列表
            config = yaml.safe_load(f)
            
            # 健壮性检查：如果文件是空的，safe_load 会返回 None
            if config is None:
                logger.error(f"[读取配置]错误: 配置文件 {config_file} 是空的！")
                return []
            return config

    except FileNotFoundError:
        logger.error(f"[读取配置]错误: 找不到配置文件 '{config_file}'。请检查 Docker 挂载是否正确。")
        # 根据你的逻辑，是选择退出程序还是返回空列表
        sys.exit(1) 

    except yaml.YAMLError as e:
        logger.error(f"[读取配置]错误: 配置文件格式非法 (YAML 解析失败): \n{e}")
        sys.exit(1)

    except Exception as e:
        logger.error(f"[读取配置]发生未知错误: {e}")
        sys.exit(1)