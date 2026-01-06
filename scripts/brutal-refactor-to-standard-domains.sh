#!/bin/bash
#
# 暴力重构脚本：完全对齐 docs/01-技术架构标准-权威版.md
# 执行策略：零兼容、一次性改完、删除旧代码
# 创建时间：2025-01-21
# 适用区域：中国（北京时间 Asia/Shanghai）
#

set -e  # 遇到错误立即退出

PROJECT_ROOT="/home/devbox/project"
cd "$PROJECT_ROOT"

echo "🚀 开始暴力重构：对齐技术架构标准"
echo "========================================"
echo "⚠️  本脚本将："
echo "  1. 删除 routes/v4/unified-engine（旧架构）"
echo "  2. 创建标准7域目录：market/shop/user/lottery/admin/auth/system"
echo "  3. 迁移所有路由到对应域"
echo "  4. 清理TODO/注释代码/410测试"
echo "  5. 修改app.js挂载点"
echo ""
read -p "确认执行？(yes/no): " -r
if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
  echo "❌ 用户取消操作"
  exit 1
fi

echo ""
echo "📋 第1步：备份当前routes/v4结构"
BACKUP_DIR="backups/brutal-refactor-backup-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r routes/v4 "$BACKUP_DIR/"
echo "✅ 备份完成：$BACKUP_DIR"

echo ""
echo "🗑️  第2步：删除旧架构目录"
rm -rf routes/v4/unified-engine
rm -f routes/v4/permissions.js routes/v4/notifications.js routes/v4/statistics.js routes/v4/system.js routes/v4/debug-control.js
rm -rf routes/v4/hierarchy  # 合并到admin
echo "✅ 旧架构已删除"

echo ""
echo "📁 第3步：创建标准7域目录"
mkdir -p routes/v4/market
mkdir -p routes/v4/shop
mkdir -p routes/v4/user
mkdir -p routes/v4/lottery
mkdir -p routes/v4/admin
mkdir -p routes/v4/auth
mkdir -p routes/v4/system
echo "✅ 7个标准域目录已创建"

echo ""
echo "⏳ 第4步：调用Node.js脚本执行路由迁移..."
node scripts/brutal-refactor-migrate-routes.js

echo ""
echo "⏳ 第5步：修改app.js挂载点..."
node scripts/brutal-refactor-fix-app-mounts.js

echo ""
echo "⏳ 第6步：清理TODO和注释代码..."
node scripts/brutal-refactor-cleanup-residuals.js

echo ""
echo "⏳ 第7步：删除410相关测试用例..."
node scripts/brutal-refactor-delete-410-tests.js

echo ""
echo "✅ 暴力重构完成！"
echo "========================================"
echo "📊 下一步："
echo "  1. 检查语法：npm run lint"
echo "  2. 运行测试：npm test"
echo "  3. 启动服务：npm run pm:start:pm2"
echo ""


