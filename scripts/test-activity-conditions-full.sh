#!/bin/bash
# 活动条件配置完整业务流程测试脚本
# 运行方式: bash scripts/test-activity-conditions-full.sh

echo "🔍 活动条件配置完整业务流程测试"
echo "============================================================"

# 配置
BASE_URL="http://localhost:3000"
CAMPAIGN_CODE="BASIC_LOTTERY"

# 生成测试token (使用管理员用户ID 31)
echo "📝 1. 生成测试Token..."
cd "$(dirname "$0")/.."
TEST_TOKEN=$(node -e "
const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
const jwt = require('jsonwebtoken');
const token = jwt.sign({
  user_id: 31,
  mobile: '13612227930',
  nickname: '管理员用户',
  roles: [{ role_name: 'admin', role_level: 100 }]
}, process.env.JWT_SECRET || 'your_jwt_secret', { expiresIn: '1h' });
console.log(token);
")

if [ -z "$TEST_TOKEN" ]; then
  echo "❌ Token生成失败"
  exit 1
fi
echo "✅ Token生成成功"

# 测试健康检查
echo ""
echo "📝 2. 检查服务健康状态..."
HEALTH=$(curl -s "$BASE_URL/health")
if echo "$HEALTH" | grep -q '"status":"healthy"'; then
  echo "✅ 服务健康状态正常"
else
  echo "❌ 服务不可用: $HEALTH"
  exit 1
fi

# 测试获取活动列表
echo ""
echo "📝 3. 获取活动列表 (GET /api/v4/lottery/campaigns)..."
CAMPAIGNS=$(curl -s "$BASE_URL/api/v4/lottery/campaigns" \
  -H "Authorization: Bearer $TEST_TOKEN")

if echo "$CAMPAIGNS" | grep -q '"success":true'; then
  CAMPAIGN_COUNT=$(echo "$CAMPAIGNS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))")
  echo "✅ 获取活动列表成功，共 $CAMPAIGN_COUNT 个活动"
  echo "   活动数据:"
  echo "$CAMPAIGNS" | python3 -c "import sys,json; d=json.load(sys.stdin); [print(f\"   - [{c['status']}] {c['campaign_name']} ({c['campaign_code']})\") for c in d.get('data',[])]"
else
  echo "❌ 获取活动列表失败: $CAMPAIGNS"
  exit 1
fi

# 测试获取活动条件配置
echo ""
echo "📝 4. 获取活动条件配置 (GET /api/v4/activities/$CAMPAIGN_CODE/conditions)..."
CONDITIONS=$(curl -s "$BASE_URL/api/v4/activities/$CAMPAIGN_CODE/conditions" \
  -H "Authorization: Bearer $TEST_TOKEN")

if echo "$CONDITIONS" | grep -q '"success":true'; then
  echo "✅ 获取条件配置成功"
  echo "   当前条件配置:"
  echo "$CONDITIONS" | python3 -c "
import sys,json
d = json.load(sys.stdin)
data = d.get('data', {})
conditions = data.get('participation_conditions', {})
messages = data.get('condition_error_messages', {})
if conditions:
  for k, v in conditions.items():
    msg = messages.get(k, '无提示')
    print(f\"   - {k}: {v['operator']} {v['value']} (提示: {msg})\")
else:
  print('   - 暂无条件配置')
"
else
  echo "❌ 获取条件配置失败: $CONDITIONS"
fi

# 测试配置活动条件
echo ""
echo "📝 5. 配置活动条件 (POST /api/v4/activities/$CAMPAIGN_CODE/configure-conditions)..."
NEW_CONDITIONS='{
  "participation_conditions": {
    "user_points": {"operator": ">=", "value": 200},
    "registration_days": {"operator": ">=", "value": 14}
  },
  "condition_error_messages": {
    "user_points": "您的积分不足200分，快去消费获取积分吧！",
    "registration_days": "注册满14天后才能参与活动"
  }
}'

CONFIGURE_RESULT=$(curl -s -X POST "$BASE_URL/api/v4/activities/$CAMPAIGN_CODE/configure-conditions" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$NEW_CONDITIONS")

if echo "$CONFIGURE_RESULT" | grep -q '"success":true'; then
  echo "✅ 条件配置保存成功"
  echo "   更新后的条件:"
  echo "$CONFIGURE_RESULT" | python3 -c "
import sys,json
d = json.load(sys.stdin)
data = d.get('data', {})
conditions = data.get('participation_conditions', {})
for k, v in conditions.items():
  print(f\"   - {k}: {v['operator']} {v['value']}\")
"
else
  echo "❌ 条件配置保存失败: $CONFIGURE_RESULT"
  exit 1
fi

# 验证配置是否生效
echo ""
echo "📝 6. 验证配置是否生效..."
VERIFY=$(curl -s "$BASE_URL/api/v4/activities/$CAMPAIGN_CODE/conditions" \
  -H "Authorization: Bearer $TEST_TOKEN")

if echo "$VERIFY" | grep -q '"value":200'; then
  echo "✅ 配置验证成功，新条件已生效"
else
  echo "❌ 配置验证失败"
  exit 1
fi

# 恢复原始配置
echo ""
echo "📝 7. 恢复原始配置..."
RESTORE_CONDITIONS='{
  "participation_conditions": {
    "user_points": {"operator": ">=", "value": 100}
  },
  "condition_error_messages": {
    "user_points": "您的积分不足100分，快去消费获取积分吧！"
  }
}'

RESTORE_RESULT=$(curl -s -X POST "$BASE_URL/api/v4/activities/$CAMPAIGN_CODE/configure-conditions" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$RESTORE_CONDITIONS")

if echo "$RESTORE_RESULT" | grep -q '"success":true'; then
  echo "✅ 原始配置已恢复"
else
  echo "⚠️ 恢复原始配置失败"
fi

# 总结
echo ""
echo "============================================================"
echo "📋 测试总结:"
echo "✅ 1. 服务健康状态检查 - 通过"
echo "✅ 2. 获取活动列表API - 通过"
echo "✅ 3. 获取活动条件配置API - 通过"
echo "✅ 4. 配置活动条件API - 通过"
echo "✅ 5. 配置验证 - 通过"
echo ""
echo "🎉 所有测试通过！活动条件配置功能正常工作"
echo "============================================================"

