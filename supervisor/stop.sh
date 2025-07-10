#!/bin/bash
# Claude Supervisor 停止脚本

cd "$(dirname "$0")"

echo "🛑 停止 Claude 规则监督系统..."

# 查找进程并停止
if pgrep -f "auto_runner.js" > /dev/null; then
    pkill -f "auto_runner.js"
    echo "✅ 监督系统已停止"
    
    # 清理PID文件
    rm -f logs/supervisor.pid
else
    echo "⚠️ 监督系统未在运行"
fi
