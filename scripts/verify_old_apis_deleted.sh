#!/bin/bash
# 验证旧版客服接口已删除脚本
# 用于确认所有旧版接口返回404
# 创建日期：2025年12月7日

# 配置
BASE_URL="${BASE_URL:-http://localhost:3000}"
TOKEN="${ADMIN_TOKEN:-}"

echo "🔍 =========================================="
echo "🔍 验证旧版客服接口已删除"
echo "🔍 =========================================="
echo ""
echo "📋 配置信息:"
echo "   服务地址: $BASE_URL"
echo "   认证Token: ${TOKEN:0:20}..."
echo ""

if [ -z "$TOKEN" ]; then
  echo "⚠️ 警告: 未设置ADMIN_TOKEN环境变量"
  echo "   某些接口可能需要认证才能测试"
  echo "   建议: export ADMIN_TOKEN='your_token_here'"
  echo ""
fi

TOTAL_TESTS=5
PASSED_TESTS=0
FAILED_TESTS=0

# 测试函数
test_api_deleted() {
  local test_num=$1
  local method=$2
  local endpoint=$3
  local description=$4
  
  echo "[$test_num/$TOTAL_TESTS] 测试: $description"
  echo "   方法: $method"
  echo "   路径: $endpoint"
  
  # 构建curl命令
  if [ -n "$TOKEN" ]; then
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" \
      "$BASE_URL$endpoint" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"session_id": 1, "content": "test"}' 2>/dev/null)
  else
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" \
      "$BASE_URL$endpoint" \
      -H "Content-Type: application/json" \
      -d '{"session_id": 1, "content": "test"}' 2>/dev/null)
  fi
  
  # 验证结果
  if [ "$RESPONSE" = "404" ]; then
    echo "   ✅ 结果: 404 Not Found (已删除)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  elif [ "$RESPONSE" = "000" ]; then
    echo "   ⚠️ 结果: 无法连接到服务器"
    echo "   💡 提示: 请确保服务已启动 (pm2 status)"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  else
    echo "   ❌ 结果: HTTP $RESPONSE (接口仍然存在！)"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
  echo ""
}

# 执行测试
echo "🧪 开始测试旧版接口（应全部返回404）..."
echo ""

# 测试1: POST /chat/admin-reply
test_api_deleted 1 "POST" "/api/v4/system/chat/admin-reply" "管理员回复消息"

# 测试2: GET /admin/chat/sessions
test_api_deleted 2 "GET" "/api/v4/system/admin/chat/sessions" "获取会话列表"

# 测试3: PUT /admin/chat/sessions/:id/assign
test_api_deleted 3 "PUT" "/api/v4/system/admin/chat/sessions/1/assign" "分配会话"

# 测试4: PUT /admin/chat/sessions/:id/close
test_api_deleted 4 "PUT" "/api/v4/system/admin/chat/sessions/1/close" "关闭会话"

# 测试5: GET /admin/chat/stats
test_api_deleted 5 "GET" "/api/v4/system/admin/chat/stats" "获取统计数据"

# 测试新版接口（可选）
echo "✅ 验证新版接口正常工作（可选）..."
echo ""

echo "[额外] 测试新版接口: 获取会话列表"
echo "   方法: GET"
echo "   路径: /api/v4/console/customer-service/sessions"

if [ -n "$TOKEN" ]; then
  NEW_API_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X GET \
    "$BASE_URL/api/v4/console/customer-service/sessions" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null)
else
  NEW_API_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X GET \
    "$BASE_URL/api/v4/console/customer-service/sessions" 2>/dev/null)
fi

if [ "$NEW_API_RESPONSE" = "200" ] || [ "$NEW_API_RESPONSE" = "401" ]; then
  echo "   ✅ 结果: HTTP $NEW_API_RESPONSE (新版接口正常)"
elif [ "$NEW_API_RESPONSE" = "000" ]; then
  echo "   ⚠️ 结果: 无法连接到服务器"
else
  echo "   ⚠️ 结果: HTTP $NEW_API_RESPONSE (可能有问题)"
fi
echo ""

# 生成测试报告
echo "📊 =========================================="
echo "📊 测试结果汇总"
echo "📊 =========================================="
echo ""
echo "测试统计:"
echo "   总测试数: $TOTAL_TESTS"
echo "   通过: $PASSED_TESTS"
echo "   失败: $FAILED_TESTS"
echo "   通过率: $(awk "BEGIN {printf \"%.1f\", ($PASSED_TESTS/$TOTAL_TESTS)*100}")%"
echo ""

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
  echo "🎉 =========================================="
  echo "🎉 验证成功！所有旧版接口已彻底删除"
  echo "🎉 =========================================="
  echo ""
  echo "✅ 所有旧版接口返回404"
  echo "✅ 删除操作完全成功"
  echo ""
  echo "📋 下一步操作:"
  echo "   1. 测试前端功能: 访问 $BASE_URL/admin/customer-service.html"
  echo "   2. 检查浏览器Network标签，确认无旧版API调用"
  echo "   3. Git提交: git add . && git commit -m 'feat: 彻底删除旧版客服接口'"
  echo ""
  exit 0
else
  echo "❌ =========================================="
  echo "❌ 验证失败！部分接口仍然存在"
  echo "❌ =========================================="
  echo ""
  echo "❌ $FAILED_TESTS 个接口未能正确删除"
  echo ""
  echo "⚠️ 可能的原因:"
  echo "   1. 服务未重启: 执行 npm run pm:restart"
  echo "   2. 删除不完整: 检查 routes/v4/system.js"
  echo "   3. 缓存问题: 清除浏览器缓存"
  echo "   4. 服务未启动: 执行 pm2 status 检查"
  echo ""
  echo "🔧 建议操作:"
  echo "   1. 重启服务: npm run pm:restart"
  echo "   2. 检查日志: pm2 logs --lines 50"
  echo "   3. 重新运行删除脚本: bash scripts/delete_old_chat_apis.sh"
  echo "   4. 如有问题，使用备份恢复"
  echo ""
  exit 1
fi

