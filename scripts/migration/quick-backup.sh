#!/bin/bash
###############################################################################
# 快速备份脚本 - 可在迁移前独立执行
# 用途：如果需要在凌晨迁移前手动备份，可以先执行此脚本
# 执行方式：./scripts/migration/quick-backup.sh
###############################################################################

set -e

# 配置
PROJECT_ROOT="/home/devbox/project"
BACKUP_DIR="/home/devbox/project/backups/manual-$(date +%Y%m%d_%H%M%S)"
DB_NAME="restaurant_lottery"
DB_USER="root"
DB_PASS="Aa112211"
DB_HOST="localhost"

echo "🔹 开始快速备份..."
echo "备份目录: $BACKUP_DIR"

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 1. 备份数据库
echo "📦 备份数据库: $DB_NAME"
mysqldump -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" \
    --single-transaction \
    --routines \
    --triggers \
    "$DB_NAME" > "$BACKUP_DIR/database_full.sql"

echo "✅ 数据库备份完成: $(du -h "$BACKUP_DIR/database_full.sql" | cut -f1)"

# 2. 备份关键表（额外安全）
echo "📦 备份关键表: user_inventory, item_instances, redemption_orders"
mysqldump -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" \
    "$DB_NAME" \
    user_inventory \
    item_instances \
    redemption_orders \
    account_asset_balances \
    > "$BACKUP_DIR/critical_tables.sql"

echo "✅ 关键表备份完成: $(du -h "$BACKUP_DIR/critical_tables.sql" | cut -f1)"

# 3. 备份代码文件
echo "📦 备份关键代码文件"
cp "$PROJECT_ROOT/services/InventoryService.js" "$BACKUP_DIR/"
cp "$PROJECT_ROOT/models/UserInventory.js" "$BACKUP_DIR/"
cp "$PROJECT_ROOT/routes/v4/unified-engine/inventory-core.js" "$BACKUP_DIR/"

echo "✅ 代码文件备份完成"

# 4. 生成备份信息文件
cat > "$BACKUP_DIR/backup_info.txt" << EOF
备份信息
========================================
备份时间: $(date '+%Y-%m-%d %H:%M:%S')
备份目录: $BACKUP_DIR
数据库: $DB_NAME
========================================

数据库统计:
$(mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" -s -N "$DB_NAME" \
    -e "SELECT 'user_inventory', COUNT(*) FROM user_inventory
        UNION ALL
        SELECT 'item_instances', COUNT(*) FROM item_instances
        UNION ALL
        SELECT 'redemption_orders', COUNT(*) FROM redemption_orders
        UNION ALL
        SELECT 'account_asset_balances', COUNT(*) FROM account_asset_balances;")

========================================
备份文件清单:
$(ls -lh "$BACKUP_DIR" | tail -n +2)
========================================
EOF

echo ""
echo "🎉 备份完成！"
echo "备份目录: $BACKUP_DIR"
echo "备份信息: $BACKUP_DIR/backup_info.txt"
cat "$BACKUP_DIR/backup_info.txt"

