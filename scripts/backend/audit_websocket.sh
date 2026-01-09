#!/bin/bash
# 后端WebSocket服务审计脚本
# 用途: 全面排查后端WebSocket服务的事件命名、调用规范等问题
# 创建时间: 2025年11月23日

echo "🔍 ========================================="
echo "   后端WebSocket服务全面审计报告"
echo "   审计时间: $(date '+%Y年%m月%d日 %H:%M:%S')"
echo "========================================="
echo ""

# 1. WebSocket服务文件检查
echo "📁 1. WebSocket服务文件检查"
echo "-------------------------------------------"

WS_SERVICE_FILES=$(find services -name "*WebSocket*.js" -o -name "*websocket*.js" 2>/dev/null)

if [ -z "$WS_SERVICE_FILES" ]; then
  echo "❌ 未找到WebSocket服务文件"
  exit 1
else
  echo "找到WebSocket服务文件:"
  echo "$WS_SERVICE_FILES" | while read file; do
    echo "  ✅ $file"
  done
fi
echo ""

# 2. 事件发送审计（.emit方法）
echo "📤 2. 事件发送审计"
echo "-------------------------------------------"

for service_file in $WS_SERVICE_FILES; do
  echo "检查: $service_file"
  
  # 提取所有emit事件
  EVENTS=$(grep -n "\.emit(" "$service_file" | head -30)
  
  if [ -z "$EVENTS" ]; then
    echo "  无emit事件"
  else
    echo "$EVENTS" | while read line; do
      line_num=$(echo "$line" | cut -d: -f1)
      event_name=$(echo "$line" | grep -o "emit(['\"][^'\"]*['\"]" | sed "s/emit(['\"]//g; s/['\"]//g")
      
      if echo "$event_name" | grep -q ":"; then
        echo "  ✅ 行$line_num: $event_name (符合规范)"
      else
        echo "  ⚠️ 行$line_num: $event_name (建议改为 模块:操作)"
      fi
    done
  fi
  echo ""
done

# 3. WebSocket方法调用审计
echo "📞 3. WebSocket方法调用审计"
echo "-------------------------------------------"

# 查找所有调用WebSocket服务的文件
WS_CALLERS=$(grep -rl "ChatWebSocketService\|webSocketService" routes services 2>/dev/null | grep -v "ChatWebSocketService.js")

echo "调用WebSocket服务的文件:"
for caller in $WS_CALLERS; do
  echo "  📄 $caller"
  
  # 提取调用的方法
  METHODS=$(grep -o "ChatWebSocketService\.[a-zA-Z_]*(" "$caller" 2>/dev/null | \
    sed 's/ChatWebSocketService\.//g; s/(//g' | sort -u)
  
  if [ -n "$METHODS" ]; then
    echo "     调用方法:"
    echo "$METHODS" | while read method; do
      echo "       - $method()"
    done
  fi
done
echo ""

# 4. 推送方法完整性检查
echo "🔔 4. 通知推送方法检查"
echo "-------------------------------------------"

# 检查必需的推送方法是否存在
REQUIRED_METHODS=(
  "pushMessageToUser"
  "pushMessageToAdmin"
  "broadcastToAllAdmins"
  "pushNotificationToAdmin"
  "broadcastNotificationToAllAdmins"
)

if [ -f "services/ChatWebSocketService.js" ]; then
  for method in "${REQUIRED_METHODS[@]}"; do
    if grep -q "^\s*${method}\s*(" services/ChatWebSocketService.js 2>/dev/null; then
      echo "  ✅ $method() - 已实现"
    else
      echo "  ❌ $method() - 缺失"
    fi
  done
else
  echo "  ❌ ChatWebSocketService.js 不存在"
fi
echo ""

# 5. 连接管理检查
echo "🔗 5. 连接管理检查"
echo "-------------------------------------------"

if [ -f "services/ChatWebSocketService.js" ]; then
  # 检查连接Map
  if grep -q "connectedUsers\s*=.*Map" services/ChatWebSocketService.js; then
    echo "  ✅ 用户连接管理 (connectedUsers Map)"
  fi
  
  if grep -q "connectedAdmins\s*=.*Map" services/ChatWebSocketService.js; then
    echo "  ✅ 管理员连接管理 (connectedAdmins Map)"
  fi
  
  # 检查连接限制
  if grep -q "MAX_TOTAL_CONNECTIONS\|MAX_USER_CONNECTIONS\|MAX_ADMIN_CONNECTIONS" services/ChatWebSocketService.js; then
    echo "  ✅ 连接数限制配置"
    MAX_TOTAL=$(grep "MAX_TOTAL_CONNECTIONS" services/ChatWebSocketService.js | grep -o "[0-9]*" | head -1)
    echo "     最大总连接: $MAX_TOTAL"
  else
    echo "  ⚠️ 未配置连接数限制"
  fi
fi
echo ""

# 6. 错误处理检查
echo "🛡️ 6. 错误处理检查"
echo "-------------------------------------------"

if [ -f "services/ChatWebSocketService.js" ]; then
  ERROR_HANDLERS=$(grep -c "try\s*{" services/ChatWebSocketService.js)
  CATCH_BLOCKS=$(grep -c "catch\s*(" services/ChatWebSocketService.js)
  
  echo "  Try块数量: $ERROR_HANDLERS"
  echo "  Catch块数量: $CATCH_BLOCKS"
  
  if [ $ERROR_HANDLERS -eq $CATCH_BLOCKS ]; then
    echo "  ✅ 错误处理完整"
  else
    echo "  ⚠️ Try-Catch不匹配"
  fi
  
  # 检查日志记录
  if grep -q "wsLogger\|logger" services/ChatWebSocketService.js; then
    echo "  ✅ 使用统一日志系统"
  else
    echo "  ⚠️ 未使用统一日志系统"
  fi
fi
echo ""

# 7. 数据库日志记录检查
echo "💾 7. WebSocket启动/停止日志检查"
echo "-------------------------------------------"

if [ -f "services/ChatWebSocketService.js" ]; then
  if grep -q "WebSocketStartupLog" services/ChatWebSocketService.js; then
    echo "  ✅ 记录服务启动日志到数据库"
  else
    echo "  ⚠️ 未记录启动日志"
  fi
  
  if grep -q "shutdown" services/ChatWebSocketService.js; then
    echo "  ✅ 实现优雅停止方法"
  else
    echo "  ⚠️ 未实现优雅停止"
  fi
fi
echo ""

# 8. 性能配置检查
echo "⚡ 8. 性能配置检查"
echo "-------------------------------------------"

if [ -f "services/ChatWebSocketService.js" ]; then
  # 检查Socket.IO配置
  if grep -q "pingTimeout\|pingInterval" services/ChatWebSocketService.js; then
    PING_TIMEOUT=$(grep "pingTimeout" services/ChatWebSocketService.js | grep -o "[0-9]*" | head -1)
    PING_INTERVAL=$(grep "pingInterval" services/ChatWebSocketService.js | grep -o "[0-9]*" | head -1)
    echo "  ✅ 心跳配置:"
    echo "     pingTimeout: ${PING_TIMEOUT}ms"
    echo "     pingInterval: ${PING_INTERVAL}ms"
  else
    echo "  ⚠️ 未配置心跳参数"
  fi
  
  # 检查CORS配置
  if grep -q "cors:" services/ChatWebSocketService.js; then
    echo "  ✅ CORS跨域配置"
  else
    echo "  ⚠️ 未配置CORS"
  fi
fi
echo ""

# 9. 综合评分
echo "📊 9. 综合服务质量评分"
echo "-------------------------------------------"

SCORE=100
ISSUES=0

# 检查各项指标
if ! grep -q "pushNotificationToAdmin" services/ChatWebSocketService.js; then
  SCORE=$((SCORE - 15))
  ((ISSUES++))
fi

if ! grep -q "broadcastNotificationToAllAdmins" services/ChatWebSocketService.js; then
  SCORE=$((SCORE - 15))
  ((ISSUES++))
fi

# 事件命名不规范扣分
NON_STANDARD_EVENTS=$(grep -o "\.emit(['\"][^:]*['\"]" services/ChatWebSocketService.js 2>/dev/null | wc -l)
if [ $NON_STANDARD_EVENTS -gt 5 ]; then
  SCORE=$((SCORE - 20))
  ((ISSUES++))
fi

echo "评分: $SCORE / 100"

if [ $SCORE -ge 90 ]; then
  echo "评级: 🟢 优秀"
elif [ $SCORE -ge 70 ]; then
  echo "评级: 🟡 良好"
elif [ $SCORE -ge 50 ]; then
  echo "评级: 🟠 一般"
else
  echo "评级: 🔴 需改进"
fi

echo "发现问题: $ISSUES 项"
echo ""

# 10. 改进建议
echo "💡 10. 改进建议"
echo "-------------------------------------------"

if [ $NON_STANDARD_EVENTS -gt 5 ]; then
  echo "🔧 建议1: 规范化WebSocket事件命名"
  echo "   当前: 使用简单事件名 (new_message, notification)"
  echo "   建议: 使用模块化命名 (chat:new_message, notification:new)"
  echo "   优先级: 低（功能正常，优化项）"
  echo ""
fi

if ! grep -q "pushNotificationToAdmin\|broadcastNotificationToAllAdmins" services/ChatWebSocketService.js; then
  echo "🔧 建议2: 补充通知推送方法"
  echo "   缺失方法: pushNotificationToAdmin(), broadcastNotificationToAllAdmins()"
  echo "   优先级: 高"
  echo ""
fi

echo "========================================="
echo "✅ 后端审计完成"
echo "========================================="


