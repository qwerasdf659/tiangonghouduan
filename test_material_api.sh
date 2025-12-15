#!/bin/bash

# 材料系统API测试脚本
# 测试管理员侧材料和钻石API端点

BASE_URL="http://localhost:3000"
PHONE="13612227930"
VERIFY_CODE="123456"

echo "==================== 材料系统API测试 ===================="
echo ""

# 1. 登录获取token
echo "1. 登录获取管理员Token..."
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/v4/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"mobile\":\"${PHONE}\",\"verification_code\":\"${VERIFY_CODE}\"}")

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败，无法获取Token"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ 登录成功，Token: ${TOKEN:0:20}..."
echo ""

# 2. 测试获取材料资产类型列表
echo "2. 测试 GET /api/v4/admin/material/asset-types"
curl -s -X GET "${BASE_URL}/api/v4/admin/material/asset-types" \
  -H "Authorization: Bearer ${TOKEN}"
echo ""
echo ""

# 3. 测试获取材料转换规则列表
echo "3. 测试 GET /api/v4/admin/material/conversion-rules"
curl -s -X GET "${BASE_URL}/api/v4/admin/material/conversion-rules" \
  -H "Authorization: Bearer ${TOKEN}"
echo ""
echo ""

# 4. 测试查询用户材料余额（用户ID 31）
echo "4. 测试 GET /api/v4/admin/material/users/31/balance"
curl -s -X GET "${BASE_URL}/api/v4/admin/material/users/31/balance" \
  -H "Authorization: Bearer ${TOKEN}"
echo ""
echo ""

# 5. 测试查询用户钻石余额（用户ID 31）
echo "5. 测试 GET /api/v4/admin/diamond/users/31/balance"
curl -s -X GET "${BASE_URL}/api/v4/admin/diamond/users/31/balance" \
  -H "Authorization: Bearer ${TOKEN}"
echo ""
echo ""

# 6. 测试查询材料流水
echo "6. 测试 GET /api/v4/admin/material/transactions?page=1&page_size=5"
curl -s -X GET "${BASE_URL}/api/v4/admin/material/transactions?page=1&page_size=5" \
  -H "Authorization: Bearer ${TOKEN}"
echo ""
echo ""

# 7. 测试查询钻石流水
echo "7. 测试 GET /api/v4/admin/diamond/transactions?page=1&page_size=5"
curl -s -X GET "${BASE_URL}/api/v4/admin/diamond/transactions?page=1&page_size=5" \
  -H "Authorization: Bearer ${TOKEN}"
echo ""
echo ""

echo "==================== 测试完成 ===================="
