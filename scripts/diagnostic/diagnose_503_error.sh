#!/bin/bash
# HTTP 503错误诊断和修复脚本
# 用于诊断图片上传接口503错误

echo "🔍 开始诊断HTTP 503错误..."
echo "=========================================="

# 1. 检查本地后端服务状态
echo ""
echo "📋 步骤1：检查本地后端服务"
echo "----------------------------------------"

if ps aux | grep -v grep | grep "node app.js" > /dev/null; then
  echo "✅ 本地后端服务运行中"
  LOCAL_PID=$(ps aux | grep -v grep | grep "node app.js" | awk '{print $2}')
  echo "   PID: $LOCAL_PID"
else
  echo "❌ 本地后端服务未运行"
  echo "💡 建议：运行 npm run dev 启动服务"
fi

# 2. 检查本地接口可用性
echo ""
echo "📋 步骤2：检查本地接口"
echo "----------------------------------------"

LOCAL_HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null || echo "000")

if [ "$LOCAL_HEALTH_STATUS" = "200" ]; then
  echo "✅ 本地Health接口正常 (200)"
else
  echo "❌ 本地Health接口异常 ($LOCAL_HEALTH_STATUS)"
fi

LOCAL_UPLOAD_STATUS=$(curl -s -X POST http://localhost:3000/api/v4/photo/upload 2>&1)

if echo "$LOCAL_UPLOAD_STATUS" | grep -q "MISSING_FILE"; then
  echo "✅ 本地上传接口可访问（返回正确的参数错误）"
else
  echo "❌ 本地上传接口异常"
  echo "   响应: $LOCAL_UPLOAD_STATUS"
fi

# 3. 检查Sealos外网访问
echo ""
echo "📋 步骤3：检查Sealos外网访问"
echo "----------------------------------------"

SEALOS_URL="https://omqktqrtntnn.sealosbja.site"

echo "🌐 测试URL: $SEALOS_URL/health"

SEALOS_HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SEALOS_URL/health" 2>/dev/null || echo "000")

if [ "$SEALOS_HEALTH_STATUS" = "200" ]; then
  echo "✅ Sealos Health接口正常 (200)"
elif [ "$SEALOS_HEALTH_STATUS" = "503" ]; then
  echo "🔴 Sealos Health接口返回503"
  echo "   🎯 问题确认：Sealos服务不可用"
elif [ "$SEALOS_HEALTH_STATUS" = "000" ]; then
  echo "🔴 Sealos服务无响应（连接失败）"
  echo "   🎯 问题确认：网络连接或DNS解析失败"
else
  echo "⚠️ Sealos Health接口返回: $SEALOS_HEALTH_STATUS"
fi

# 4. 检查Sealos上传接口
echo ""
echo "🌐 测试URL: $SEALOS_URL/api/v4/photo/upload"

SEALOS_UPLOAD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SEALOS_URL/api/v4/photo/upload" 2>/dev/null || echo "000")

if [ "$SEALOS_UPLOAD_STATUS" = "400" ]; then
  echo "✅ Sealos上传接口可访问（返回400参数错误，说明路由正常）"
elif [ "$SEALOS_UPLOAD_STATUS" = "503" ]; then
  echo "🔴 Sealos上传接口返回503"
  echo "   🎯 问题确认：上传服务不可用"
elif [ "$SEALOS_UPLOAD_STATUS" = "000" ]; then
  echo "🔴 Sealos上传服务无响应"
else
  echo "⚠️ Sealos上传接口返回: $SEALOS_UPLOAD_STATUS"
fi

# 5. DNS解析检查
echo ""
echo "📋 步骤4：DNS解析检查"
echo "----------------------------------------"

DOMAIN="omqktqrtntnn.sealosbja.site"

if command -v nslookup > /dev/null 2>&1; then
  DNS_RESULT=$(nslookup $DOMAIN 2>&1)
  
  if echo "$DNS_RESULT" | grep -q "can't find\|NXDOMAIN"; then
    echo "❌ DNS解析失败：域名不存在"
  else
    echo "✅ DNS解析成功"
    echo "$DNS_RESULT" | grep "Address:" | tail -1
  fi
else
  echo "⚠️ nslookup命令不可用，跳过DNS检查"
fi

# 6. 诊断总结和建议
echo ""
echo "=========================================="
echo "📊 诊断结果总结"
echo "=========================================="

if [ "$LOCAL_HEALTH_STATUS" = "200" ] && [ "$SEALOS_HEALTH_STATUS" = "503" ]; then
  echo ""
  echo "🎯 问题确认：**Sealos服务配置问题**"
  echo ""
  echo "📋 问题详情："
  echo "   ✅ 本地后端服务正常运行"
  echo "   ✅ 本地接口可以访问"
  echo "   🔴 Sealos外网访问返回503"
  echo ""
  echo "💡 解决方案："
  echo ""
  echo "方案1：检查Sealos容器服务状态"
  echo "   1. 登录Sealos控制台"
  echo "   2. 检查应用是否正常运行"
  echo "   3. 查看容器日志是否有错误"
  echo "   4. 重启Sealos应用服务"
  echo ""
  echo "方案2：检查Sealos网络配置"
  echo "   1. 检查域名绑定是否正确"
  echo "   2. 检查端口映射：容器3000端口 → 外部443/80端口"
  echo "   3. 检查SSL证书是否有效"
  echo "   4. 检查网络策略是否允许外部访问"
  echo ""
  echo "方案3：检查资源配置"
  echo "   1. 检查容器内存是否充足（建议>512MB）"
  echo "   2. 检查CPU配额是否合理"
  echo "   3. 查看是否有OOM (Out of Memory) 错误"
  echo "   4. 增加资源配额并重启服务"
  echo ""
  echo "方案4：临时解决方案（用于测试）"
  echo "   1. 使用内网穿透工具（如ngrok）暴露本地服务"
  echo "   2. 临时修改小程序代码，使用ngrok URL"
  echo "   3. 在Sealos修复后再切换回正式URL"
  echo ""
  
elif [ "$LOCAL_HEALTH_STATUS" != "200" ]; then
  echo ""
  echo "🎯 问题确认：**本地后端服务异常**"
  echo ""
  echo "💡 解决方案："
  echo "   1. 检查Node.js进程是否运行"
  echo "   2. 运行 npm run dev 启动服务"
  echo "   3. 检查3000端口是否被占用"
  echo "   4. 查看日志文件 logs/combined.log"
  echo ""
  
elif [ "$SEALOS_HEALTH_STATUS" = "000" ]; then
  echo ""
  echo "🎯 问题确认：**网络连接或DNS问题**"
  echo ""
  echo "💡 解决方案："
  echo "   1. 检查网络连接是否正常"
  echo "   2. 尝试ping $DOMAIN"
  echo "   3. 检查DNS服务器配置"
  echo "   4. 尝试使用其他网络环境访问"
  echo ""
  
else
  echo ""
  echo "⚠️ 需要进一步排查"
  echo ""
  echo "💡 建议："
  echo "   1. 提供Sealos控制台截图"
  echo "   2. 查看Sealos应用日志"
  echo "   3. 检查最近的配置变更"
  echo ""
fi

echo "=========================================="
echo "✅ 诊断完成"
echo "=========================================="

