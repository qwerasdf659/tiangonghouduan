#!/bin/bash
# 临时测试脚本 - 验证数据驾驶舱相关API
# 完成后删除此文件

echo "======================================"
echo "数据驾驶舱API测试 - $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================"

# 配置
BASE_URL="http://localhost:3000"
# 使用测试账号登录获取token
echo ""
echo "1. 登录获取Token..."
# 使用quick-login (开发环境快速登录，使用手机号)
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/v4/auth/quick-login" \
  -H "Content-Type: application/json" \
  -d '{"mobile": "13612227930"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"access_token":"[^"]*"' | sed 's/"access_token":"//;s/"$//')

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败，响应: $LOGIN_RESPONSE"
  exit 1
fi
echo "✅ 登录成功，Token获取完成"

# 测试漏斗API
echo ""
echo "2. 测试转化漏斗API: /api/v4/console/users/funnel"
echo "--------------------------------------"
FUNNEL_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/v4/console/users/funnel?days=7" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "响应: $FUNNEL_RESPONSE"
echo ""

# 检查响应
if echo "$FUNNEL_RESPONSE" | grep -q '"success":true'; then
  echo "✅ 漏斗API返回成功"
  # 提取funnel数组
  echo "漏斗阶段数据:"
  echo "$FUNNEL_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('data', {}).get('funnel'):
        for stage in data['data']['funnel']:
            print(f\"  - {stage.get('name', '?')}: {stage.get('count', 0)} 人, 转化率: {stage.get('percentage', 0)}%\")
    else:
        print('  ⚠️ funnel数组为空或不存在')
except Exception as e:
    print(f'  解析错误: {e}')
" 2>/dev/null || echo "  (无法解析JSON)"
else
  echo "❌ 漏斗API返回失败"
fi

# 测试今日统计API
echo ""
echo "3. 测试今日统计API: /api/v4/console/analytics/stats/today"
echo "--------------------------------------"
TODAY_STATS=$(curl -s -X GET "${BASE_URL}/api/v4/console/analytics/stats/today" \
  -H "Authorization: Bearer $TOKEN")
echo "响应: $TODAY_STATS" | head -c 500
echo "..."

# 测试用户分层API
echo ""
echo "4. 测试用户分层API: /api/v4/console/users/segments"
echo "--------------------------------------"
SEGMENTS_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/v4/console/users/segments" \
  -H "Authorization: Bearer $TOKEN")
echo "响应: $SEGMENTS_RESPONSE" | head -c 500
echo "..."

# 测试时间对比API
echo ""
echo "5. 测试时间对比API: /api/v4/console/dashboard/time-comparison"
echo "--------------------------------------"
COMPARISON_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/v4/console/dashboard/time-comparison" \
  -H "Authorization: Bearer $TOKEN")
echo "响应: $COMPARISON_RESPONSE" | head -c 500
echo "..."

# 测试业务健康度API
echo ""
echo "6. 测试业务健康度API: /api/v4/console/dashboard/business-health"
echo "--------------------------------------"
HEALTH_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/v4/console/dashboard/business-health" \
  -H "Authorization: Bearer $TOKEN")
echo "响应: $HEALTH_RESPONSE" | head -c 500
echo "..."

echo ""
echo "======================================"
echo "测试完成"
echo "======================================"

