import os
import logging
from logging.handlers import RotatingFileHandler

def logs_configuration(log_file=None, class_name='Void'):
    if log_file is None:
        log_file = os.getenv('LOG_PATH', 'logs/Void.log')
        
    logger = logging.getLogger(class_name)
    
    # 【关键修复】如果已经有处理器了，说明已经配置过，直接返回，不再重复添加
    if logger.handlers:
        return logger

    logger.setLevel(logging.DEBUG)

    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - [%(process)d:%(thread)d] - %(message)s')

    os.makedirs(os.path.dirname(log_file), exist_ok=True)
    
    # 文件处理器
    file_handler = RotatingFileHandler(log_file, maxBytes=10*1024*1024, backupCount=5, encoding='utf-8')
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.DEBUG)

    # 控制台处理器
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.DEBUG)

    # 添加处理器
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    # 可选：防止日志向上传递给 root logger 导致再次重复
    logger.propagate = False

    return logger