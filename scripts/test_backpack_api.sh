#!/bin/bash
# 测试背包双轨接口

echo "🧪 测试背包双轨接口"
echo ""

# 1. 登录获取token
echo "📝 步骤1：登录获取token（使用测试账号13612227930，验证码123456）"
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v4/auth/login \
  -H "Content-Type: application/json" \
  -d '{"mobile": "13612227930", "verification_code": "123456"}')

TOKEN=$(echo $LOGIN_RESPONSE | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('access_token', ''))" 2>/dev/null)
USER_ID=$(echo $LOGIN_RESPONSE | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('user', {}).get('user_id', ''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败"
  echo "响应: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ 登录成功"
echo "   用户ID: $USER_ID"
echo "   Token: ${TOKEN:0:30}..."
echo ""

# 2. 查询背包数据
echo "📝 步骤2：查询背包数据（双轨统一接口）"
echo "   URL: GET /api/v4/backpack/user/$USER_ID"
BACKPACK_RESPONSE=$(curl -s -X GET "http://localhost:3000/api/v4/backpack/user/$USER_ID" \
  -H "Authorization: Bearer $TOKEN")

echo ""
echo "📊 背包响应:"
echo "$BACKPACK_RESPONSE" | python3 -m json.tool

# 提取关键数据
ASSETS_COUNT=$(echo $BACKPACK_RESPONSE | python3 -c "import sys, json; data = json.load(sys.stdin); print(len(data.get('data', {}).get('assets', [])))" 2>/dev/null)
ITEMS_COUNT=$(echo $BACKPACK_RESPONSE | python3 -c "import sys, json; data = json.load(sys.stdin); print(len(data.get('data', {}).get('items', [])))" 2>/dev/null)

echo ""
echo "✅ 背包数据汇总:"
echo "   可叠加资产(assets): $ASSETS_COUNT 种"
echo "   不可叠加物品(items): $ITEMS_COUNT 个"
echo ""

# 3. 查询背包统计
echo "📝 步骤3：查询背包统计信息"
echo "   URL: GET /api/v4/backpack/stats/$USER_ID"
STATS_RESPONSE=$(curl -s -X GET "http://localhost:3000/api/v4/backpack/stats/$USER_ID" \
  -H "Authorization: Bearer $TOKEN")

echo ""
echo "📊 统计响应:"
echo "$STATS_RESPONSE" | python3 -m json.tool

echo ""
echo "✅ 全部测试完成"
