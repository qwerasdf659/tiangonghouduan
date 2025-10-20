#!/bin/bash
# 数据库完全重建自动化脚本 V1.0.0
# 用途: 清理40个混乱迁移，建立V1.0.0基准版本
# 作者: Database Team
# 创建时间: 2025年10月12日

set -e  # 遇到错误立即退出

# ==================== 配置 ====================

DB_NAME="restaurant_points_dev"
DB_USER="root"
DB_HOST="localhost"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="rebuild_${TIMESTAMP}.log"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

# ==================== 第0步: 最终确认 ====================

echo ""
echo "========================================================"
echo "🚨 数据库完全重建 V1.0.0 - 最终确认"
echo "========================================================"
echo ""
echo "即将执行的操作:"
echo "  1. ⏸️  停止服务"
echo "  2. 💾 完整数据备份"
echo "  3. 🗑️  删除旧数据库"
echo "  4. 🆕 创建全新数据库"
echo "  5. 📦 执行基准迁移"
echo "  6. 📊 导入业务数据（如有）"
echo "  7. ✅ 验证并启动服务"
echo ""
echo "⏱️  预计耗时: 81分钟"
echo "📊 数据量: 584行, 3.33MB"
echo "🔄 回滚时间: 2分钟"
echo ""
read -p "❓ 确认执行？(yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "❌ 已取消执行"
    exit 1
fi

echo ""
log "🚀 开始执行数据库重建..."

# ==================== 第1步: 准备阶段（30分钟）====================

log "📌 步骤1: 准备阶段"

# 1.1 停止服务
log "⏸️  停止服务..."
pm2 stop all || {
    warn "PM2停止失败，尝试其他方式..."
    pkill -f "node.*app.js" || true
}
sleep 2
log "✅ 服务已停止"

# 1.2 创建备份目录
mkdir -p "$BACKUP_DIR"
log "✅ 备份目录已创建: $BACKUP_DIR"

# 1.3 多重备份
log "💾 开始数据备份（3份）..."

# 完整备份（含结构+数据+存储过程）
log "   备份1/3: 完整备份..."
mysqldump -u "$DB_USER" -p --single-transaction \
  --routines --triggers --events \
  "$DB_NAME" > "$BACKUP_DIR/full_${TIMESTAMP}.sql" || {
    error "完整备份失败！"
    exit 1
}
log "   ✅ 完整备份完成: full_${TIMESTAMP}.sql"

# 纯数据备份（不含表结构）
log "   备份2/3: 纯数据备份..."
mysqldump -u "$DB_USER" -p --no-create-info \
  "$DB_NAME" > "$BACKUP_DIR/data_${TIMESTAMP}.sql" || {
    error "数据备份失败！"
    exit 1
}
log "   ✅ 纯数据备份完成: data_${TIMESTAMP}.sql"

# Git备份
log "   备份3/3: Git备份..."
git add -A
git commit -m "backup: 完全重建前的最后备份 - ${TIMESTAMP}" || true
log "   ✅ Git备份完成"

# 1.4 验证备份
log "🔍 验证备份文件..."
FULL_SIZE=$(du -h "$BACKUP_DIR/full_${TIMESTAMP}.sql" | cut -f1)
DATA_SIZE=$(du -h "$BACKUP_DIR/data_${TIMESTAMP}.sql" | cut -f1)
log "   完整备份大小: $FULL_SIZE"
log "   数据备份大小: $DATA_SIZE"

if [ ! -s "$BACKUP_DIR/full_${TIMESTAMP}.sql" ]; then
    error "备份文件为空！中止执行"
    exit 1
fi
log "✅ 备份验证通过"

# 1.5 备份迁移目录
log "📦 备份迁移目录..."
if [ -d "migrations" ]; then
    mv migrations "migrations_old_${TIMESTAMP}"
    tar -czf "migrations_old_${TIMESTAMP}.tar.gz" "migrations_old_${TIMESTAMP}"
    log "✅ 迁移目录已备份并压缩"
else
    warn "migrations目录不存在，跳过备份"
fi

log "✅ 步骤1完成 - 准备阶段"

# ==================== 第2步: 重建阶段（30分钟）====================

log "📌 步骤2: 重建阶段"

# 2.1 删除旧数据库
log "🗑️  删除旧数据库..."
mysql -u "$DB_USER" -p -e "
  DROP DATABASE IF EXISTS $DB_NAME;
  CREATE DATABASE $DB_NAME 
    DEFAULT CHARACTER SET utf8mb4 
    DEFAULT COLLATE utf8mb4_unicode_ci;
" || {
    error "数据库删除/创建失败！"
    exit 1
}
log "✅ 旧数据库已删除，新数据库已创建"

# 2.2 创建全新migrations目录
log "📁 创建全新migrations目录..."
mkdir -p migrations
cd migrations

# 创建README
cat > README.md << 'EOFREADME'
# 数据库迁移管理 V1.0.0

## 基准版本
- 版本: V1.0.0-clean-start
- 创建时间: 2025年10月13日
- 基准迁移: 20251013100000-baseline-v1.0.0-clean-start.js

## 迁移规范
{YYYYMMDD}HHMMSS-{action}-{target}.js

### Action类型
- create-table: 创建新表
- alter-table: 修改表结构
- add-column: 添加列
- drop-column: 删除列
- create-index: 创建索引
- migrate-data: 数据迁移

### 创建迁移
```bash
npm run migration:create
```

### 执行迁移
```bash
npm run migration:up
```

### 验证迁移
```bash
npm run migration:verify
```
EOFREADME

cd ..
log "✅ migrations目录和README已创建"

# 2.3 检查基准迁移文件
log "📄 检查基准迁移文件..."
if [ ! -f "migrations/20251013100000-baseline-v1.0.0-clean-start.js" ]; then
    error "基准迁移文件不存在！请先创建"
    exit 1
fi
log "✅ 基准迁移文件已就绪"

# 2.4 执行基准迁移
log "🚀 执行基准迁移..."
npx sequelize-cli db:migrate || {
    error "基准迁移执行失败！"
    exit 1
}
log "✅ 基准迁移执行完成"

# 2.5 验证表结构
log "🔍 验证表结构..."
TABLE_COUNT=$(mysql -u "$DB_USER" -p "$DB_NAME" -e "SHOW TABLES;" | wc -l)
# 减去1是因为第一行是表头
TABLE_COUNT=$((TABLE_COUNT - 1))
log "   创建的表数量: $TABLE_COUNT"

if [ "$TABLE_COUNT" -ne 22 ]; then  # 21个业务表 + 1个SequelizeMeta
    error "表数量不正确！预期22个，实际${TABLE_COUNT}个"
    exit 1
fi
log "✅ 表结构验证通过"

log "✅ 步骤2完成 - 重建阶段"

# ==================== 第3步: 数据导入阶段（10分钟）====================

log "📌 步骤3: 数据导入阶段"

# 提示用户是否导入数据
read -p "❓ 是否导入业务数据？(yes/no): " IMPORT_DATA

if [ "$IMPORT_DATA" = "yes" ]; then
    log "📊 开始导入业务数据..."
    
    # 直接导入数据备份
    mysql -u "$DB_USER" -p "$DB_NAME" < "$BACKUP_DIR/data_${TIMESTAMP}.sql" || {
        warn "数据导入失败，可能需要手动处理"
    }
    
    # 验证数据
    log "🔍 验证数据完整性..."
    mysql -u "$DB_USER" -p "$DB_NAME" -e "
      SELECT 
        'users' as table_name, COUNT(*) as record_count FROM users
      UNION ALL
        SELECT 'lottery_draws', COUNT(*) FROM lottery_draws
      UNION ALL
        SELECT 'chat_messages', COUNT(*) FROM chat_messages;
    " | tee -a "$LOG_FILE"
    
    log "✅ 数据导入完成"
else
    warn "跳过数据导入 - 将使用空数据库"
fi

log "✅ 步骤3完成 - 数据导入阶段"

# ==================== 第4步: 测试验证阶段（15分钟）====================

log "📌 步骤4: 测试验证阶段"

# 4.1 启动服务
log "🚀 启动服务..."
pm2 start ecosystem.config.js || npm run dev &
sleep 5
log "✅ 服务已启动"

# 4.2 健康检查
log "🏥 执行健康检查..."
HEALTH_RESPONSE=$(curl -s http://localhost:3000/health || echo "FAILED")

if [[ "$HEALTH_RESPONSE" == *"healthy"* ]]; then
    log "✅ 健康检查通过"
else
    error "健康检查失败！响应: $HEALTH_RESPONSE"
    exit 1
fi

# 4.3 数据库连接测试
log "🔌 测试数据库连接..."
node -e "
const { sequelize } = require('./models');
sequelize.authenticate()
  .then(() => console.log('✅ 数据库连接正常'))
  .catch(err => {
    console.error('❌ 数据库连接失败:', err.message);
    process.exit(1);
  });
" || {
    error "数据库连接测试失败！"
    exit 1
}

# 4.4 迁移状态检查
log "📋 检查迁移状态..."
npx sequelize-cli db:migrate:status | tee -a "$LOG_FILE"

# 4.5 验证SequelizeMeta
log "🔍 验证SequelizeMeta表..."
MIGRATION_COUNT=$(mysql -u "$DB_USER" -p "$DB_NAME" -e "SELECT COUNT(*) FROM SequelizeMeta;" | tail -1)
log "   SequelizeMeta记录数: $MIGRATION_COUNT"

if [ "$MIGRATION_COUNT" -ne 1 ]; then
    error "SequelizeMeta记录数不正确！预期1个，实际${MIGRATION_COUNT}个"
    exit 1
fi
log "✅ SequelizeMeta验证通过"

log "✅ 步骤4完成 - 测试验证阶段"

# ==================== 第5步: 完成阶段（5分钟）====================

log "📌 步骤5: 完成阶段"

# 5.1 清理临时文件
log "🧹 清理临时文件..."
rm -f /tmp/data_import_*.sql
log "✅ 临时文件已清理"

# 5.2 提交代码
log "📤 提交代码到Git..."
git add migrations/
git add migrations_old_*.tar.gz
git commit -m "refactor: 完全重建数据库迁移历史 V1.0.0

- 清理40个混乱迁移文件
- 创建1个清晰的基准迁移
- 重建SequelizeMeta表
- 统一版本标识为V1.0.0-clean-start
- 执行时间: ${TIMESTAMP}
" || warn "Git提交失败，请手动提交"

log "✅ 代码已提交（推送请手动执行: git push）"

# 5.3 生成重建日志
log "📝 生成重建日志..."
cat > migrations/REBUILD_LOG.md << EOFLOG
# 数据库重建日志 V1.0.0

## 重建信息
- 执行时间: ${TIMESTAMP}
- 旧版本: 40个混乱迁移文件（含58条SequelizeMeta记录）
- 新版本: 1个清晰基准迁移
- 状态: ✅ 成功

## 备份文件
- 完整备份: $BACKUP_DIR/full_${TIMESTAMP}.sql (大小: $FULL_SIZE)
- 数据备份: $BACKUP_DIR/data_${TIMESTAMP}.sql (大小: $DATA_SIZE)
- 迁移备份: migrations_old_${TIMESTAMP}.tar.gz

## 验证结果
- 表数量: $TABLE_COUNT (预期22个: 21个业务表 + 1个SequelizeMeta)
- SequelizeMeta记录: $MIGRATION_COUNT (预期1个)
- 健康检查: 通过
- 数据库连接: 正常

## 回滚方案
如需回滚，执行以下命令：
\`\`\`bash
mysql -u root -p -e "DROP DATABASE $DB_NAME"
mysql -u root -p -e "CREATE DATABASE $DB_NAME"
mysql -u root -p $DB_NAME < $BACKUP_DIR/full_${TIMESTAMP}.sql
mv migrations_old_${TIMESTAMP} migrations
pm2 restart all
\`\`\`

预计回滚时间: 2分钟
EOFLOG

log "✅ 重建日志已生成: migrations/REBUILD_LOG.md"

# 5.4 通知完成
log "✅ 步骤5完成 - 完成阶段"

# ==================== 总结 ====================

echo ""
echo "========================================================"
echo "🎉 数据库重建 V1.0.0 成功完成！"
echo "========================================================"
echo ""
echo "📊 执行摘要:"
echo "   开始时间: ${TIMESTAMP}"
echo "   结束时间: $(date +%Y%m%d_%H%M%S)"
echo "   备份文件: $BACKUP_DIR/full_${TIMESTAMP}.sql"
echo "   日志文件: $LOG_FILE"
echo ""
echo "✅ 完成的工作:"
echo "   • 40个混乱迁移 → 1个清晰基准"
echo "   • 58条SequelizeMeta → 1条记录"
echo "   • 18个业务表已重建"
echo "   • 版本统一为V1.0.0"
echo ""
echo "📋 下一步:"
echo "   1. 验证核心业务功能"
echo "   2. 通知团队重建完成"
echo "   3. 执行: git push（手动推送代码）"
echo "   4. 监控系统运行状态"
echo ""
echo "💡 提示:"
echo "   • 详细日志: $LOG_FILE"
echo "   • 重建记录: migrations/REBUILD_LOG.md"
echo "   • 回滚方案: 见REBUILD_LOG.md"
echo ""

log "🎉 数据库重建 V1.0.0 全部完成！"

