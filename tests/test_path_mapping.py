"""
路径映射功能测试脚本
用于验证 Windows 和 Linux 环境下的路径映射是否正常工作
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from module.unseeded import normalize_path, translate_path

def test_normalize_path():
    """测试路径规范化"""
    print("=== 测试路径规范化 ===")
    
    test_cases = [
        ("T:\\download", "T:\\download"),
        ("/data/downloads", "/data/downloads" if os.sep == '/' else "\\data\\downloads"),
        ("T:\\\\", "T:"),
        ("", ""),
    ]
    
    for input_path, expected in test_cases:
        result = normalize_path(input_path)
        status = "[PASS]" if result == expected else "[FAIL]"
        print(f"{status} normalize_path('{input_path}') = '{result}' (expected: '{expected}')")

def test_translate_path():
    """测试路径映射转换"""
    print("\n=== 测试路径映射转换 ===")
    
    # 测试简化格式 - Windows
    print("\n1. Windows 简化格式:")
    mapping1 = {"T:\\": "/download"}
    test_cases1 = [
        ("/download", "T:"),
        ("/download/movies", "T:\\movies"),
        ("/download/tv/show1", "T:\\tv\\show1"),
        ("/other/path", "/other/path"),  # 不匹配，应返回原路径
    ]
    
    for docker_path, expected in test_cases1:
        result = translate_path(docker_path, mapping1)
        # Normalize expected values to match current system
        expected_norm = normalize_path(expected) if expected != docker_path else expected
        result_norm = normalize_path(result) if result != docker_path else result
        status = "[PASS]" if result_norm == expected_norm else "[FAIL]"
        print(f"  {status} '{docker_path}' -> '{result}' (expected: '{expected}')")
    
    # 测试简化格式 - Linux
    print("\n2. Linux 简化格式:")
    mapping2 = {"/mnt/data": "/data"}
    test_cases2 = [
        ("/data", "/mnt/data"),
        ("/data/movies", "/mnt/data/movies"),
        ("/other", "/other"),  # 不匹配
    ]
    
    for docker_path, expected in test_cases2:
        result = translate_path(docker_path, mapping2)
        expected_norm = normalize_path(expected) if expected != docker_path else expected
        result_norm = normalize_path(result) if result != docker_path else result
        status = "[PASS]" if result_norm == expected_norm else "[FAIL]"
        print(f"  {status} '{docker_path}' -> '{result}' (expected: '{expected}')")
    
    # 测试完整格式
    print("\n3. 完整格式:")
    mapping3 = {"remote": "/data", "local": "/mnt/user/data"}
    test_cases3 = [
        ("/data", "/mnt/user/data"),
        ("/data/torrents", "/mnt/user/data/torrents"),
    ]
    
    for docker_path, expected in test_cases3:
        result = translate_path(docker_path, mapping3)
        expected_norm = normalize_path(expected) if expected != docker_path else expected
        result_norm = normalize_path(result) if result != docker_path else result
        status = "[PASS]" if result_norm == expected_norm else "[FAIL]"
        print(f"  {status} '{docker_path}' -> '{result}' (expected: '{expected}')")

if __name__ == "__main__":
    print(f"Current OS: {os.name}")
    print(f"Path separator: {os.sep}")
    print()
    
    test_normalize_path()
    test_translate_path()
    
    print("\n=== Test Complete ===")
