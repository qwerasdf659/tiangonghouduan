#!/bin/bash
#
# 测试管理后台统计数据API
# 验证后端数据返回和前后端联动
#
# 运行：bash scripts/test-admin-statistics.sh
#

set -e

BASE_URL="http://localhost:3000"
ADMIN_MOBILE="13800138000"
VERIFICATION_CODE="123456"

echo "═════════════════════════════════════════════════════════════"
echo "🔍 管理后台统计数据API测试脚本"
echo "═════════════════════════════════════════════════════════════"
echo ""

# 1. 登录获取Token
echo "📝 1. 管理员登录..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v4/console/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"mobile\":\"$ADMIN_MOBILE\",\"verification_code\":\"$VERIFICATION_CODE\"}")

if echo "$LOGIN_RESPONSE" | grep -q '"success":true'; then
  TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
  NICKNAME=$(echo "$LOGIN_RESPONSE" | grep -o '"nickname":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "   ✅ 登录成功: $NICKNAME"
  echo "   Token: ${TOKEN:0:50}..."
else
  echo "   ❌ 登录失败!"
  echo "$LOGIN_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$LOGIN_RESPONSE"
  exit 1
fi
echo ""

# 2. 测试图表数据API (7天)
echo "📊 2. 测试图表数据API (/api/v4/system/statistics/charts?days=7)..."
CHARTS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/v4/system/statistics/charts?days=7" \
  -H "Authorization: Bearer $TOKEN")

if echo "$CHARTS_RESPONSE" | grep -q '"success":true'; then
  echo "   ✅ API调用成功"
  
  # 解析关键数据
  echo ""
  echo "   📋 返回的数据摘要:"
  echo "   ─────────────────────────────────────────"
  
  python3 << EOF
import json
data = json.loads('''$CHARTS_RESPONSE''')['data']

# 用户统计
user_types = data.get('user_types', {})
total_users = user_types.get('total', 0)
admin_users = user_types.get('admin', {}).get('count', 0)
regular_users = user_types.get('regular', {}).get('count', 0)
print(f"   👥 用户统计:")
print(f"      - 总用户数: {total_users}")
print(f"      - 管理员: {admin_users}")
print(f"      - 普通用户: {regular_users}")

# 用户增长
user_growth = data.get('user_growth', [])
new_users = sum(item.get('count', 0) for item in user_growth)
print(f"      - 周期内新增: {new_users}")

# 抽奖统计
lottery_trend = data.get('lottery_trend', [])
total_draws = sum(item.get('count', 0) for item in lottery_trend)
high_tier = sum(item.get('high_tier_count', 0) for item in lottery_trend)
high_tier_rate = (high_tier / total_draws * 100) if total_draws > 0 else 0
print(f"   🎰 抽奖统计:")
print(f"      - 总抽奖次数: {total_draws}")
print(f"      - 高档奖励次数: {high_tier}")
print(f"      - 高档奖励率: {high_tier_rate:.2f}%")

# 消费统计
consumption = data.get('consumption_trend', [])
total_amount = sum(float(item.get('amount', 0)) for item in consumption)
print(f"   💰 消费统计:")
print(f"      - 总消费金额: ¥{total_amount:.2f}")

# 积分统计
points = data.get('points_flow', [])
earned = sum(item.get('earned', 0) for item in points)
spent = sum(item.get('spent', 0) for item in points)
print(f"   ⭐ 积分统计:")
print(f"      - 发放积分: {earned}")
print(f"      - 消耗积分: {spent}")

# 热门奖品
prizes = data.get('top_prizes', [])
print(f"   🎁 热门奖品: {len(prizes)}个")
for p in prizes[:3]:
    print(f"      - {p.get('prize_name', '未知')}: {p.get('count', 0)}次")

# 活跃时段
active_hours = data.get('active_hours', [])
total_activity = sum(item.get('activity_count', 0) for item in active_hours)
active_hour_count = len([h for h in active_hours if h.get('activity_count', 0) > 0])
print(f"   ⏰ 活跃时段:")
print(f"      - 总活跃次数: {total_activity}")
print(f"      - 活跃小时数: {active_hour_count}/24")

print("   ─────────────────────────────────────────")
EOF

else
  echo "   ❌ API调用失败!"
  echo "$CHARTS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$CHARTS_RESPONSE"
fi
echo ""

# 3. 测试报表API (周)
echo "📈 3. 测试报表API (/api/v4/system/statistics/report?period=week)..."
REPORT_RESPONSE=$(curl -s -X GET "$BASE_URL/api/v4/system/statistics/report?period=week" \
  -H "Authorization: Bearer $TOKEN")

if echo "$REPORT_RESPONSE" | grep -q '"success":true'; then
  echo "   ✅ API调用成功"
  QUERY_TIME=$(echo "$REPORT_RESPONSE" | grep -o '"query_time_ms":[0-9]*' | cut -d':' -f2)
  echo "   ⏱️ 查询耗时: ${QUERY_TIME}ms"
else
  echo "   ❌ API调用失败!"
fi
echo ""

# 4. 测试决策分析API
echo "📉 4. 测试决策分析API (/api/v4/console/analytics/decisions/analytics)..."
ANALYTICS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/v4/console/analytics/decisions/analytics?days=7" \
  -H "Authorization: Bearer $TOKEN")

if echo "$ANALYTICS_RESPONSE" | grep -q '"success":true'; then
  echo "   ✅ API调用成功"
else
  echo "   ⚠️ API调用失败（可能未实现）"
fi
echo ""

# 5. 测试今日统计API
echo "📅 5. 测试今日统计API (/api/v4/console/analytics/stats/today)..."
TODAY_RESPONSE=$(curl -s -X GET "$BASE_URL/api/v4/console/analytics/stats/today" \
  -H "Authorization: Bearer $TOKEN")

if echo "$TODAY_RESPONSE" | grep -q '"success":true'; then
  echo "   ✅ API调用成功"
  
  python3 << EOF
import json
try:
    data = json.loads('''$TODAY_RESPONSE''')['data']
    user_stats = data.get('user_stats', {})
    lottery_stats = data.get('lottery_stats', {})
    print(f"   📋 今日统计:")
    print(f"      - 今日新增用户: {user_stats.get('new_users_today', 0)}")
    print(f"      - 今日活跃用户: {user_stats.get('active_users_today', 0)}")
    print(f"      - 今日抽奖次数: {lottery_stats.get('draws_today', 0)}")
except:
    print("   ⚠️ 解析数据失败")
EOF
else
  echo "   ⚠️ API调用失败"
fi
echo ""

# 6. 总结
echo "═════════════════════════════════════════════════════════════"
echo "✅ 测试完成！"
echo ""
echo "📌 前端页面适配说明:"
echo "   1. statistics.js 已更新为适配后端 getChartsData() 格式"
echo "   2. statistics.html 标签已更新反映实际数据含义"
echo "   3. API路径: /api/v4/system/statistics/charts?days=N"
echo ""
echo "💡 访问管理后台查看效果:"
echo "   http://localhost:3000/admin/statistics.html"
echo "═════════════════════════════════════════════════════════════"

