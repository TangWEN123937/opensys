#!/bin/bash
# ==================== OpenSys 容器入口脚本 ====================
# 以 root 身份启动，先修复挂载目录权限，再启动 supervisord
#
# 解决问题：容器内 root 创建的文件在宿主机上无法删除/修改
# 方案：将挂载目录的 owner 改为 OPENSYS_UID:OPENSYS_GID

# 从环境变量获取宿主机用户 UID/GID（默认 1000:1000）
TARGET_UID=${OPENSYS_UID:-1000}
TARGET_GID=${OPENSYS_GID:-1000}

echo "[entrypoint] 修复挂载目录权限 → UID=${TARGET_UID}, GID=${TARGET_GID}"

# 修复数据目录和输出目录的 owner（仅顶层 + 已有文件，不递归跟踪符号链接）
for dir in /app/data /app/output; do
    if [ -d "$dir" ]; then
        chown -R "${TARGET_UID}:${TARGET_GID}" "$dir" 2>/dev/null || true
    fi
done

echo "[entrypoint] 权限修复完成，启动 supervisord..."

# 启动 supervisord（保持 root 身份，supervisor 管理 Xvfb/x11vnc/noVNC/FastAPI）
exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/opensys.conf
