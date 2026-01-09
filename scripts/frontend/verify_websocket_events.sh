#!/bin/bash
# WebSocket事件命名规范检查脚本
# 用途: 确保前后端WebSocket事件命名一致且符合规范
# 创建时间: 2025年11月23日
# 事件命名规范: <模块>:<操作> (如: notification:new, chat:new_message)

echo "🔍 检查WebSocket事件命名规范..."

# 定义标准事件名称（符合规范的事件）
STANDARD_EVENTS=(
  "notification:new"
  "notification:broadcast"
  "notification:update"
  "chat:new_message"
  "chat:session_update"
  "chat:session_assigned"
  "system:status_change"
  "system:alert"
)

# 定义不规范的事件名称（需要修改）
DEPRECATED_EVENTS=(
  "notification"
  "new_message"
  "session_update"
  "new_session"
)

TOTAL_ISSUES=0

echo ""
echo "📄 检查前端事件监听..."

# 检查前端HTML文件
HTML_FILES=$(find public/admin -name "*.html" -type f 2>/dev/null || echo "")

for file in $HTML_FILES; do
  filename=$(basename "$file")
  FILE_ISSUES=0
  
  # 检查是否使用了不规范的事件名
  for event in "${DEPRECATED_EVENTS[@]}"; do
    # 查找 .on('event_name' 模式
    if grep -q "\.on(['\"]${event}['\"]" "$file" 2>/dev/null; then
      echo "  ⚠️ $filename: 使用了不规范的事件名: '$event'"
      echo "     建议: 检查是否应该使用带模块前缀的事件名（如: chat:${event}, notification:${event}）"
      ((FILE_ISSUES++))
    fi
  done
  
  # 检查是否使用了WebSocket但没有错误处理
  if grep -q "wsConnection\s*=" "$file" 2>/dev/null; then
    if ! grep -q "connect_error\|disconnect" "$file" 2>/dev/null; then
      echo "  ⚠️ $filename: WebSocket缺少错误处理 (connect_error, disconnect)"
      ((FILE_ISSUES++))
    fi
  fi
  
  if [ $FILE_ISSUES -eq 0 ]; then
    echo "  ✅ $filename: WebSocket事件命名符合规范"
  fi
  
  ((TOTAL_ISSUES+=$FILE_ISSUES))
done

echo ""
echo "📄 检查后端事件发送..."

# 检查后端WebSocket服务
BACKEND_ISSUES=0

if [ -f "services/ChatWebSocketService.js" ]; then
  # 检查是否使用了不规范的事件名
  for event in "${DEPRECATED_EVENTS[@]}"; do
    # 查找 .emit('event_name' 模式
    if grep -q "\.emit(['\"]${event}['\"]" "services/ChatWebSocketService.js" 2>/dev/null; then
      echo "  ⚠️ ChatWebSocketService.js: 使用了不规范的事件名: '$event'"
      echo "     建议: 使用带模块前缀的事件名（如: notification:new）"
      ((BACKEND_ISSUES++))
    fi
  done
  
  if [ $BACKEND_ISSUES -eq 0 ]; then
    echo "  ✅ ChatWebSocketService.js: 事件命名符合规范"
  fi
  
  ((TOTAL_ISSUES+=$BACKEND_ISSUES))
fi

echo ""
echo "📊 WebSocket事件规范检查统计:"
echo "   发现问题: $TOTAL_ISSUES 处"

if [ $TOTAL_ISSUES -gt 0 ]; then
  echo ""
  echo "⚠️ 建议修改为规范的事件命名格式: <模块>:<操作>"
  echo ""
  echo "标准事件名称示例:"
  for event in "${STANDARD_EVENTS[@]}"; do
    echo "  ✅ $event"
  done
  echo ""
  echo "注意: 这是警告，不影响启动，但建议尽快规范化"
fi

echo ""
echo "✅ WebSocket事件验证完成"

