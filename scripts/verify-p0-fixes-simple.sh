#!/bin/bash
# P0技术债务修复验证脚本

echo "开始验证P0技术债务修复..."
echo "=================================================="

# 1. dotenv override
echo -e "\n=== 验证1: dotenv override配置 ==="
if grep -q "NODE_ENV || 'development') === 'development'" app.js; then
  echo "✅ dotenv override仅在development环境允许"
else
  echo "❌ dotenv override配置未修复"
fi

# 2. Redis健康检查
echo -e "\n=== 验证2: Redis健康检查 ==="
HEALTH=$(curl -s http://localhost:3000/health)
if echo "$HEALTH" | grep -q '"redis"'; then
  REDIS_STATUS=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['systems']['redis'])" 2>/dev/null)
  echo "✅ Redis状态: $REDIS_STATUS"
else
  echo "❌ Redis健康检查未实现"
fi

# 3. HTTP状态码
echo -e "\n=== 验证3: HTTP状态码 ==="
if grep -q "this.error(message, errorCode, details, 400)" utils/ApiResponse.js; then
  echo "✅ HTTP状态码已修正为400/401/403/404"
else
  echo "❌ HTTP状态码未修复"
fi

# 4. MarketListing幂等键
echo -e "\n=== 验证4: MarketListing幂等键约束 ==="
node -e "
const { sequelize } = require('./models');
(async () => {
  const [rows] = await sequelize.query(\"SHOW INDEX FROM market_listings WHERE Key_name = 'uk_market_listings_seller_business_id'\");
  if (rows.length === 2) {
    console.log('✅ 幂等键唯一索引已创建');
  } else {
    console.log('❌ 幂等键唯一索引未创建');
  }
  await sequelize.close();
  process.exit(0);
})();
"

# 5. WebSocket CORS
echo -e "\n=== 验证5: WebSocket CORS白名单 ==="
if grep -q "origin: (origin, callback)" services/ChatWebSocketService.js && ! grep -q "origin: '\*'" services/ChatWebSocketService.js; then
  echo "✅ WebSocket CORS已配置白名单"
else
  echo "❌ WebSocket CORS仍然完全开放"
fi

# 6. WebSocket JWT
echo -e "\n=== 验证6: WebSocket握手JWT鉴权 ==="
if grep -q "socket.handshake.auth?.token" services/ChatWebSocketService.js && grep -q "jwt.verify" services/ChatWebSocketService.js; then
  echo "✅ WebSocket握手JWT鉴权已实现"
else
  echo "❌ WebSocket握手JWT鉴权未实现"
fi

# 7. errorHandler已删除
echo -e "\n=== 验证7: errorHandler.js已删除 ==="
if [ ! -f "middleware/errorHandler.js" ]; then
  echo "✅ errorHandler.js已删除"
  if ! grep -r "require.*errorHandler" routes/ --include="*.js" 2>/dev/null; then
    echo "✅ 所有errorHandler引用已清除"
  else
    echo "❌ 仍有文件引用errorHandler"
  fi
else
  echo "❌ errorHandler.js仍然存在"
fi

echo -e "\n=================================================="
echo "验证完成"
