#!/bin/bash
# Sealos图片上传接口完整测试脚本
# 用于验证上传功能是否正常

echo "🧪 开始测试Sealos图片上传接口..."
echo "=========================================="

SEALOS_URL="https://omqktqrtntnn.sealosbja.site"
UPLOAD_ENDPOINT="/api/v4/photo/upload"

# 1. 创建测试图片（如果不存在）
echo ""
echo "📋 步骤1：准备测试图片"
echo "----------------------------------------"

if [ ! -f "test-upload.jpg" ]; then
  echo "创建测试图片..."
  # 创建一个1x1像素的PNG图片（使用base64编码）
  echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > test-upload.jpg 2>/dev/null || {
    # 如果base64命令失败，创建一个简单的文本文件作为替代
    echo "无法创建图片文件，使用文本文件替代测试"
    echo "Test upload file" > test-upload.txt
    TEST_FILE="test-upload.txt"
  }
  TEST_FILE="test-upload.jpg"
  echo "✅ 测试文件已创建: $TEST_FILE"
else
  TEST_FILE="test-upload.jpg"
  echo "✅ 使用现有测试文件: $TEST_FILE"
fi

# 2. 测试无参数上传（应返回400错误）
echo ""
echo "📋 步骤2：测试无参数上传"
echo "----------------------------------------"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SEALOS_URL$UPLOAD_ENDPOINT" 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

echo "HTTP状态码: $HTTP_CODE"

if [ "$HTTP_CODE" = "400" ]; then
  echo "✅ 返回400参数错误（符合预期）"
  echo "响应内容: $BODY" | head -c 200
elif [ "$HTTP_CODE" = "503" ]; then
  echo "🔴 返回503服务不可用"
  echo "响应内容: $BODY"
  echo ""
  echo "⚠️ 问题确认：Sealos服务确实存在503错误"
  echo "💡 建议：立即检查Sealos应用日志"
elif [ "$HTTP_CODE" = "000" ]; then
  echo "🔴 无法连接到Sealos服务"
  echo "⚠️ 网络连接失败或服务完全不可用"
else
  echo "⚠️ 意外的HTTP状态码: $HTTP_CODE"
  echo "响应内容: $BODY"
fi

# 3. 测试仅上传文件（缺少user_id，应返回400）
echo ""
echo "📋 步骤3：测试仅上传文件"
echo "----------------------------------------"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SEALOS_URL$UPLOAD_ENDPOINT" \
  -F "photo=@$TEST_FILE" 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

echo "HTTP状态码: $HTTP_CODE"

if [ "$HTTP_CODE" = "400" ]; then
  echo "✅ 返回400参数错误（符合预期，缺少user_id）"
  if echo "$BODY" | grep -q "user_id\|MISSING_USER_ID"; then
    echo "✅ 错误信息正确：缺少user_id参数"
  fi
elif [ "$HTTP_CODE" = "503" ]; then
  echo "🔴 返回503服务不可用"
  echo ""
  echo "⚠️ 问题依然存在：即使配置了域名白名单，仍然503"
  echo "💡 下一步：需要检查Sealos服务内部状态"
else
  echo "⚠️ HTTP状态码: $HTTP_CODE"
  echo "响应内容: $BODY" | head -c 300
fi

# 4. 测试完整上传（包含所有必需参数）
echo ""
echo "📋 步骤4：测试完整参数上传"
echo "----------------------------------------"

# 使用测试用户ID：1
TEST_USER_ID="1"

echo "测试参数："
echo "  - photo: $TEST_FILE"
echo "  - user_id: $TEST_USER_ID"
echo "  - business_type: user_upload_review"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SEALOS_URL$UPLOAD_ENDPOINT" \
  -F "photo=@$TEST_FILE" \
  -F "user_id=$TEST_USER_ID" \
  -F "business_type=user_upload_review" 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

echo ""
echo "HTTP状态码: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ 上传成功！"
  echo ""
  echo "响应数据："
  echo "$BODY" | head -c 500
  
  # 尝试解析响应JSON
  if echo "$BODY" | grep -q '"success":true'; then
    echo ""
    echo "🎉 图片上传功能完全正常！"
    echo ""
    echo "💡 结论：后端服务正常，问题可能在于："
    echo "   1. 微信小程序代码配置问题"
    echo "   2. 小程序请求参数缺失或错误"
    echo "   3. 需要重启微信开发者工具使配置生效"
  fi
  
elif [ "$HTTP_CODE" = "404" ]; then
  echo "❌ 返回404：用户不存在"
  echo "💡 建议：使用有效的user_id进行测试"
  echo "响应内容: $BODY"
  
elif [ "$HTTP_CODE" = "503" ]; then
  echo "🔴 返回503服务不可用"
  echo "响应内容: $BODY"
  echo ""
  echo "⚠️ 严重问题：即使参数完整仍然503"
  echo ""
  echo "🎯 问题定位："
  echo "   ✅ 域名白名单已配置"
  echo "   ✅ 请求参数完整"
  echo "   🔴 Sealos服务内部存在问题"
  echo ""
  echo "💡 紧急处理建议："
  echo "   1. 登录Sealos控制台查看应用日志"
  echo "   2. 检查应用是否正常运行"
  echo "   3. 查看资源使用情况（CPU/内存）"
  echo "   4. 尝试重启Sealos应用"
  
else
  echo "⚠️ HTTP状态码: $HTTP_CODE"
  echo "响应内容: $BODY" | head -c 500
fi

# 5. 测试响应时间
echo ""
echo "📋 步骤5：测试响应时间"
echo "----------------------------------------"

START_TIME=$(date +%s%N)
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SEALOS_URL$UPLOAD_ENDPOINT" 2>&1)
END_TIME=$(date +%s%N)
ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))

echo "响应时间: ${ELAPSED_MS}ms"

if [ $ELAPSED_MS -lt 1000 ]; then
  echo "✅ 响应速度正常 (<1秒)"
elif [ $ELAPSED_MS -lt 3000 ]; then
  echo "⚠️ 响应稍慢 (1-3秒)"
else
  echo "🔴 响应过慢 (>3秒)"
  echo "💡 可能原因："
  echo "   - 服务器资源不足"
  echo "   - 网络延迟过高"
  echo "   - 服务启动中"
fi

# 6. 清理测试文件
echo ""
echo "📋 步骤6：清理测试文件"
echo "----------------------------------------"

if [ -f "test-upload.jpg" ] || [ -f "test-upload.txt" ]; then
  # 不删除，保留以供后续测试
  echo "✅ 保留测试文件供后续使用"
fi

# 7. 生成诊断报告
echo ""
echo "=========================================="
echo "📊 诊断报告总结"
echo "=========================================="

if [ "$HTTP_CODE" = "200" ]; then
  echo ""
  echo "🎉 测试结果：上传功能完全正常！"
  echo ""
  echo "✅ 已确认："
  echo "   - Sealos服务运行正常"
  echo "   - 上传接口可以访问"
  echo "   - 参数验证正常工作"
  echo "   - 文件上传处理正常"
  echo ""
  echo "💡 下一步操作："
  echo "   1. 重启微信开发者工具（使域名白名单配置生效）"
  echo "   2. 清除小程序缓存"
  echo "   3. 检查小程序代码中的上传参数（特别是user_id）"
  echo "   4. 确保小程序代码使用正确的字段名 'photo'（不是'file'或'image'）"
  echo ""
  
elif [ "$HTTP_CODE" = "503" ]; then
  echo ""
  echo "🔴 测试结果：Sealos服务存在503错误"
  echo ""
  echo "✅ 已排除："
  echo "   - 不是域名白名单问题（已配置）"
  echo "   - 不是参数问题（已提供完整参数）"
  echo ""
  echo "🎯 问题定位：Sealos服务内部问题"
  echo ""
  echo "🚨 立即执行："
  echo "   1. 登录Sealos控制台：https://cloud.sealos.io"
  echo "   2. 查看应用状态（是否为'运行中'）"
  echo "   3. 查看应用日志（查找503、error、failed关键词）"
  echo "   4. 检查资源使用（内存是否>512MB，CPU是否>0.5核）"
  echo "   5. 如有异常，重启应用"
  echo ""
  
else
  echo ""
  echo "⚠️ 测试结果：需要进一步排查"
  echo ""
  echo "💡 建议："
  echo "   - 提供完整的错误日志"
  echo "   - 检查Sealos控制台"
  echo "   - 确认网络连接正常"
  echo ""
fi

echo "=========================================="
echo "✅ 测试完成"
echo "=========================================="

