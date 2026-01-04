import os
import sys
import yaml
from tools import logs

# 初始化日志记录器
logger = logs.logs_configuration()

def yaml_configuration():
    # 建议使用绝对路径或环境变量，防止 Docker 工作目录切换导致找不到文件
    config_file = os.getenv("CONFIG_PATH", "./config.yaml")
    
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