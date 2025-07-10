#!/bin/bash
# Claude Supervisor 状态检查脚本

cd "$(dirname "$0")"

echo "📊 Claude 规则监督系统状态"
echo "================================"

# 检查进程状态
if pgrep -f "auto_runner.js" > /dev/null; then
    PID=$(pgrep -f "auto_runner.js")
    echo "🟢 状态: 运行中 (PID: $PID)"
    
    # 显示内存使用
    if command -v ps &> /dev/null; then
        MEMORY=$(ps -o pid,vsz,rss,comm -p $PID | tail -1)
        echo "💾 内存: $MEMORY"
    fi
    
    # 显示运行时间
    if [ -f "logs/supervisor.pid" ]; then
        START_TIME=$(stat -c %Y logs/supervisor.pid)
        CURRENT_TIME=$(date +%s)
        UPTIME=$((CURRENT_TIME - START_TIME))
        HOURS=$((UPTIME / 3600))
        MINUTES=$(((UPTIME % 3600) / 60))
        echo "⏱️ 运行时间: ${HOURS}小时${MINUTES}分钟"
    fi
else
    echo "🔴 状态: 未运行"
fi

# 检查最新报告
if [ -d "reports" ] && [ "$(ls -A reports)" ]; then
    LATEST_REPORT=$(ls -t reports/*.json | head -1)
    if [ -f "$LATEST_REPORT" ]; then
        echo "📄 最新报告: $(basename "$LATEST_REPORT")"
        
        # 提取关键信息
        if command -v node &> /dev/null; then
            SCORE=$(node -e "const data=JSON.parse(require('fs').readFileSync('$LATEST_REPORT','utf8')); console.log(data.compliance_score || 'N/A');")
            VIOLATIONS=$(node -e "const data=JSON.parse(require('fs').readFileSync('$LATEST_REPORT','utf8')); console.log(data.violations_summary?.total || 'N/A');")
            echo "📊 合规分数: $SCORE"
            echo "⚠️ 违规次数: $VIOLATIONS"
        fi
    fi
else
    echo "📄 报告: 无可用报告"
fi

echo "================================"
echo "📋 管理命令:"
echo "  启动: ./start.sh"
echo "  停止: ./stop.sh"
echo "  仪表板: 打开 dashboard.html"
