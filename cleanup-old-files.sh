#!/bin/bash
echo "🧹 开始清理旧代码文件..."

# 删除旧路由文件
echo "🗑️ 删除旧路由文件..."
rm -f routes/exchange.js routes/auth.js routes/user.js routes/merchant.js routes/photo.js routes/lottery.js

# 删除旧模型文件 (保留新的ImageResources.js和BusinessConfigs.js)
echo "🗑️ 删除旧模型文件..."
rm -f models/PhotoReview.js models/ExchangeOrder.js models/LotteryPity.js models/LotteryRecord.js models/LotterySetting.js models/CommodityPool.js models/PointsRecord.js models/User.js

# 删除旧服务文件 (保留新的和sealosStorage.js)
echo "🗑️ 删除旧服务文件..."
rm -f services/lotteryService.js services/websocket.js

# 删除旧工具文件 (保留新的ApiResponse.js)
echo "🗑️ 删除旧工具文件..."
rm -f utils/sequelize-wrapper.js utils/field-transformer.js

# 删除旧主应用文件
echo "🗑️ 删除旧应用文件..."
rm -f app.js package.json

# 重命名新文件为主文件
echo "📝 重命名新架构文件..."
mv package-v2.json package.json
mv app-v2.js app.js
mv README-v2.md README.md

echo "✅ 旧代码清理完成！"
echo "📋 剩余的应该是："
echo "  - models/: ImageResources.js, BusinessConfigs.js, index.js"
echo "  - services/: ImageResourceService.js, MultiBusinessPhotoStorage.js, sealosStorage.js"  
echo "  - routes/v2/: resources.js, lottery.js"
echo "  - utils/: ApiResponse.js"
echo "  - app.js (原app-v2.js)"
echo "  - package.json (原package-v2.json)" 