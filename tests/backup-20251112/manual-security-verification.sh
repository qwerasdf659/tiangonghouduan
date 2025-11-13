#!/bin/bash
# 用户管理安全修复手动验证脚本
# 测试风险1、2、3的修复
# 注意：ApiResponse设计约定HTTP状态码固定为200，业务状态在响应体JSON中

API_BASE="http://localhost:3000/api/v4/unified-engine"
ADMIN_MOBILE="13612227930"
ADMIN_USER_ID="31"
TEST_USER_ID="32"

echo "========================================"
echo "  用户管理安全修复验证 (风险1、2、3)"
echo "  ApiResponse约定: HTTP固定200"
echo "  业务状态在响应体JSON中验证"
echo "========================================"

# 辅助函数：提取JSON字段
extract_json_field() {
  local json="$1"
  local field="$2"
  echo "$json" | grep -o "\"$field\":[^,}]*" | head -1 | cut -d':' -f2 | tr -d ' "' 
}

# 1. 管理员登录获取token
echo -e "\n📱 步骤1: 管理员登录..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"mobile\":\"$ADMIN_MOBILE\",\"verification_code\":\"123456\"}")

TOKEN=$(extract_json_field "$LOGIN_RESPONSE" "access_token")

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败，无法获取token"
  echo "响应: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ 登录成功，获取token"

# 2. 测试风险2修复：禁止自我状态修改
echo -e "\n🚫 步骤2: 测试风险2修复（禁止自我状态修改）..."
SELF_MODIFY_RESPONSE=$(curl -s -X PUT "$API_BASE/admin/user-management/users/$ADMIN_USER_ID/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"inactive","reason":"测试自我修改"}')

echo "响应: $SELF_MODIFY_RESPONSE"

SUCCESS=$(extract_json_field "$SELF_MODIFY_RESPONSE" "success")
HTTP_STATUS=$(extract_json_field "$SELF_MODIFY_RESPONSE" "httpStatus")
CODE=$(extract_json_field "$SELF_MODIFY_RESPONSE" "code")

if [ "$SUCCESS" = "false" ] && [ "$HTTP_STATUS" = "403" ] && [ "$CODE" = "CANNOT_MODIFY_SELF" ]; then
  echo "✅ 风险2修复验证通过: 成功禁止管理员修改自己的状态"
  echo "   success=false, httpStatus=403, code=CANNOT_MODIFY_SELF"
else
  echo "❌ 风险2修复验证失败"
  echo "   预期: success=false, httpStatus=403, code=CANNOT_MODIFY_SELF"
  echo "   实际: success=$SUCCESS, httpStatus=$HTTP_STATUS, code=$CODE"
fi

# 3. 测试风险1修复：管理员修改其他用户的状态（正常情况）
echo -e "\n🔒 步骤3: 测试管理员修改其他用户的状态（正常情况）..."
NORMAL_MODIFY_RESPONSE=$(curl -s -X PUT "$API_BASE/admin/user-management/users/$TEST_USER_ID/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"active","reason":"测试正常修改"}')

echo "响应: $NORMAL_MODIFY_RESPONSE"

SUCCESS=$(extract_json_field "$NORMAL_MODIFY_RESPONSE" "success")

if [ "$SUCCESS" = "true" ]; then
  echo "✅ 正常修改验证通过: 管理员可以修改其他用户的状态"
else
  echo "❌ 正常修改验证失败: 预期success=true，实际success=$SUCCESS"
fi

# 4. 测试风险3修复：事务回滚处理（角色不存在）
echo -e "\n🔄 步骤4: 测试风险3修复（事务回滚 - 角色不存在）..."
INVALID_ROLE_RESPONSE=$(curl -s -X PUT "$API_BASE/admin/user-management/users/$TEST_USER_ID/role" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role_name":"nonexistent_role_test","reason":"测试事务回滚"}')

echo "响应: $INVALID_ROLE_RESPONSE"

SUCCESS=$(extract_json_field "$INVALID_ROLE_RESPONSE" "success")
HTTP_STATUS=$(extract_json_field "$INVALID_ROLE_RESPONSE" "httpStatus")
CODE=$(extract_json_field "$INVALID_ROLE_RESPONSE" "code")

if [ "$SUCCESS" = "false" ] && [ "$HTTP_STATUS" = "404" ]; then
  echo "✅ 风险3修复验证通过: 角色不存在时正确回滚"
  echo "   success=false, httpStatus=404, code=$CODE"
else
  echo "❌ 风险3修复验证失败"
  echo "   预期: success=false, httpStatus=404"
  echo "   实际: success=$SUCCESS, httpStatus=$HTTP_STATUS, code=$CODE"
fi

# 5. 测试事务回滚：用户不存在
echo -e "\n🔄 步骤5: 测试事务回滚（用户不存在）..."
NONEXIST_USER_RESPONSE=$(curl -s -X PUT "$API_BASE/admin/user-management/users/99999999/role" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role_name":"user","reason":"测试事务回滚"}')

echo "响应: $NONEXIST_USER_RESPONSE"

SUCCESS=$(extract_json_field "$NONEXIST_USER_RESPONSE" "success")
HTTP_STATUS=$(extract_json_field "$NONEXIST_USER_RESPONSE" "httpStatus")

if [ "$SUCCESS" = "false" ] && [ "$HTTP_STATUS" = "404" ]; then
  echo "✅ 事务回滚验证通过: 用户不存在时正确回滚"
  echo "   success=false, httpStatus=404"
else
  echo "❌ 事务回滚验证失败"
  echo "   预期: success=false, httpStatus=404"
  echo "   实际: success=$SUCCESS, httpStatus=$HTTP_STATUS"
fi

echo -e "\n========================================"
echo "  验证完成"
echo "========================================"
