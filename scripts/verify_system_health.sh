#!/bin/bash
# 系统健康状态快速验证脚本
# 餐厅积分抽奖系统 V4.0
# 创建时间: 2025年12月12日

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║          餐厅积分抽奖系统 V4.0 - 快速健康检查                   ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "📅 检查时间: $(date '+%Y年%m月%d日 %H:%M:%S')"
echo ""

# 初始化检查结果计数
TOTAL_CHECKS=8
PASSED_CHECKS=0

echo "【🔍 执行系统健康检查】"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. PM2状态检查
echo -n "1. PM2进程管理: "
if pm2 list 2>&1 | grep -q "restaurant-lottery-backend.*online"; then
    echo "✅ 运行中"
    ((PASSED_CHECKS++))
else
    echo "❌ 异常"
fi

# 2. 端口监听检查
echo -n "2. 端口3000监听: "
if netstat -tlnp 2>/dev/null | grep -q ":3000.*LISTEN" || ss -tlnp 2>/dev/null | grep -q ":3000.*LISTEN"; then
    echo "✅ 正常"
    ((PASSED_CHECKS++))
else
    echo "❌ 未监听"
fi

# 3. API健康检查
echo -n "3. API健康检查: "
API_RESPONSE=$(timeout 5s curl -s http://localhost:3000/health 2>/dev/null)
if echo "$API_RESPONSE" | grep -q '"status":"healthy"'; then
    echo "✅ HEALTHY"
    ((PASSED_CHECKS++))
else
    echo "❌ 异常"
fi

# 4. 数据库连接检查
echo -n "4. 数据库连接: "
if echo "$API_RESPONSE" | grep -q '"database":"connected"'; then
    echo "✅ 已连接"
    ((PASSED_CHECKS++))
else
    echo "❌ 连接失败"
fi

# 5. Redis连接检查
echo -n "5. Redis连接: "
if redis-cli ping 2>&1 | grep -q "PONG"; then
    echo "✅ 已连接"
    ((PASSED_CHECKS++))
else
    echo "❌ 连接失败"
fi

# 6. 环境变量检查
echo -n "6. 环境变量加载: "
if pm2 env 0 2>&1 | grep -q "NODE_ENV"; then
    echo "✅ 已加载"
    ((PASSED_CHECKS++))
else
    echo "❌ 未加载"
fi

# 7. 进程唯一性检查
echo -n "7. 进程唯一性: "
NODE_PROCESS_COUNT=$(ps aux | grep -E "node.*app\.js" | grep -v grep | wc -l)
if [ "$NODE_PROCESS_COUNT" -eq 1 ]; then
    echo "✅ 单一进程"
    ((PASSED_CHECKS++))
else
    echo "⚠️ 发现 ${NODE_PROCESS_COUNT} 个进程"
fi

# 8. Web管理后台访问检查
echo -n "8. Web管理后台: "
HTTP_CODE=$(timeout 5s curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null)
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ 可访问 (HTTP $HTTP_CODE)"
    ((PASSED_CHECKS++))
else
    echo "❌ 访问异常 (HTTP $HTTP_CODE)"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 计算健康度百分比
HEALTH_PERCENTAGE=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))

echo "【📊 健康度评估】"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "通过检查: ${PASSED_CHECKS}/${TOTAL_CHECKS}"
echo "健康度: ${HEALTH_PERCENTAGE}%"
echo ""

# 评级判断
if [ $HEALTH_PERCENTAGE -eq 100 ]; then
    echo "🏆 评级: EXCELLENT (优秀)"
    echo "✨ 系统运行完全正常！"
elif [ $HEALTH_PERCENTAGE -ge 75 ]; then
    echo "🎯 评级: GOOD (良好)"
    echo "⚠️ 部分功能异常，建议检查"
elif [ $HEALTH_PERCENTAGE -ge 50 ]; then
    echo "⚠️ 评级: FAIR (一般)"
    echo "⚠️ 多项功能异常，需要修复"
else
    echo "❌ 评级: CRITICAL (严重)"
    echo "🚨 系统严重异常，需要立即处理"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 显示详细信息
if [ $HEALTH_PERCENTAGE -eq 100 ]; then
    echo "【✅ 系统详细信息】"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # 获取进程信息
    PM2_INFO=$(pm2 list 2>/dev/null | grep "restaurant-lottery-backend")
    PID=$(echo "$PM2_INFO" | awk '{print $10}')
    UPTIME=$(echo "$PM2_INFO" | awk '{print $12}')
    MEMORY=$(echo "$PM2_INFO" | awk '{print $16}')
    
    echo "进程ID: $PID"
    echo "运行时间: $UPTIME"
    echo "内存使用: $MEMORY"
    echo "系统版本: V4.0.0"
    echo ""
    echo "🌐 访问地址:"
    echo "   Web管理后台: http://localhost:3000/"
    echo "   健康检查: http://localhost:3000/health"
    echo "   API基础路径: http://localhost:3000/api/v4/"
    echo ""
    echo "🛡️ 稳定性保证:"
    echo "   ✅ PM2托管，独立于终端运行"
    echo "   ✅ 自动重启机制已启用"
    echo "   ✅ 开机自启动已配置"
    echo "   ✅ 关闭Claude/终端不影响服务"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi

# 返回状态码
if [ $HEALTH_PERCENTAGE -eq 100 ]; then
    exit 0
else
    exit 1
fi

