#!/bin/bash
# Claude Supervisor 启动脚本

cd "$(dirname "$0")"

echo "🚀 启动 Claude 规则监督系统..."

# 检查是否已在运行
if pgrep -f "auto_runner.js" > /dev/null; then
    echo "⚠️ 监督系统已在运行中"
    exit 1
fi

# 启动监督程序
nohup node auto_runner.js start > logs/supervisor.log 2>&1 &
PID=$!

echo "✅ 监督系统已启动 (PID: $PID)"
echo "📊 仪表板: file://$(pwd)/dashboard.html"
echo "📋 日志: tail -f logs/supervisor.log"

# 等待启动完成
sleep 3

# 检查启动状态
if kill -0 $PID 2>/dev/null; then
    echo "🟢 监督系统运行正常"
    echo "PID: $PID" > logs/supervisor.pid
else
    echo "❌ 监督系统启动失败，请检查日志"
    exit 1
fi
