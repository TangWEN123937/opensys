"""
OpenSys 通用工具函数

放置不依赖其他 agent 子模块的工具函数，避免循环导入。
"""


def sanitize_text(text: str) -> str:
    """
    清理文本中的无效 Unicode surrogate 字符（\\ud800-\\udfff）。
    这些字符会导致 'utf-8' codec can't encode: surrogates not allowed 错误。
    """
    if not isinstance(text, str):
        return text
    # 先用 surrogatepass 编码，再用 replace 解码，自动替换无效 surrogate
    return text.encode("utf-8", errors="surrogatepass").decode("utf-8", errors="replace")
