#!/bin/bash
# 快速测试通知API的Shell脚本
# 用法: ./scripts/test-notifications-quick.sh [TOKEN]

set -e

BASE_URL="http://localhost:3000"
TOKEN="${1:-$ADMIN_TOKEN}"

if [ -z "$TOKEN" ]; then
  echo "❌ 请提供Token: ./test-notifications-quick.sh <token>"
  echo "或设置环境变量: ADMIN_TOKEN=xxx ./test-notifications-quick.sh"
  exit 1
fi

echo "🚀 快速测试通知API..."
echo "📡 API地址: $BASE_URL"
echo ""

# 测试1: 获取通知列表
echo "📋 1. 获取通知列表..."
RESULT=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/v4/system/notifications")
echo "$RESULT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if data.get('success'):
    stats = data.get('data', {}).get('statistics', {})
    notifs = data.get('data', {}).get('notifications', [])
    print(f'   ✅ 成功 - 通知数: {len(notifs)}, 统计: total={stats.get(\"total\",0)}, unread={stats.get(\"unread\",0)}, today={stats.get(\"today\",0)}, week={stats.get(\"week\",0)}')
else:
    print(f'   ❌ 失败: {data.get(\"message\", \"未知错误\")}')
" 2>/dev/null || echo "   ⚠️ 解析响应失败"

# 测试2: 发送通知
echo ""
echo "📤 2. 发送测试通知..."
SEND_RESULT=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"system","title":"Shell测试通知","content":"这是通过Shell脚本发送的测试通知","target":"all"}' \
  "$BASE_URL/api/v4/system/notifications/send")
echo "$SEND_RESULT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if data.get('success'):
    notif_id = data.get('data', {}).get('notification_id')
    print(f'   ✅ 成功 - 通知ID: {notif_id}')
else:
    print(f'   ❌ 失败: {data.get(\"message\", \"未知错误\")}')
" 2>/dev/null || echo "   ⚠️ 解析响应失败"

# 测试3: 再次获取列表验证
echo ""
echo "📋 3. 验证通知列表更新..."
RESULT=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/v4/system/notifications")
echo "$RESULT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if data.get('success'):
    stats = data.get('data', {}).get('statistics', {})
    notifs = data.get('data', {}).get('notifications', [])
    print(f'   ✅ 成功 - 通知数: {len(notifs)}, 统计: total={stats.get(\"total\",0)}, unread={stats.get(\"unread\",0)}, today={stats.get(\"today\",0)}, week={stats.get(\"week\",0)}')
else:
    print(f'   ❌ 失败: {data.get(\"message\", \"未知错误\")}')
" 2>/dev/null || echo "   ⚠️ 解析响应失败"

echo ""
echo "✅ 快速测试完成!"

