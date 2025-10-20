#!/bin/bash
# 数据库性能优化脚本
# 创建时间：2025年10月13日 北京时间
# 功能：优化数据库表结构和索引

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}⚡ 数据库性能优化脚本${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 读取环境变量
if [ -f "config.example" ]; then
    source config.example
else
    echo -e "${RED}❌ 错误：找不到 config.example 文件${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 数据库连接信息：${NC}"
echo "   主机: $DB_HOST"
echo "   数据库: $DB_NAME"
echo ""

# 1. 分析慢查询
echo -e "${YELLOW}1️⃣ 分析慢查询日志...${NC}"
echo "   检查最近的慢查询情况"

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    -e "SHOW VARIABLES LIKE 'slow_query%';" 2>/dev/null | sed 's/^/   /'

echo ""

# 2. 检查表是否需要优化
echo -e "${YELLOW}2️⃣ 检查表碎片情况...${NC}"

FRAGMENTED_TABLES=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    -e "SELECT 
        table_name AS '表名',
        ROUND(data_length / 1024 / 1024, 2) AS '数据大小(MB)',
        ROUND(data_free / 1024 / 1024, 2) AS '碎片大小(MB)',
        ROUND(data_free / data_length * 100, 2) AS '碎片率(%)'
    FROM information_schema.tables 
    WHERE table_schema = '$DB_NAME' 
    AND data_free > 0
    ORDER BY data_free DESC;" 2>/dev/null)

if [ -n "$FRAGMENTED_TABLES" ]; then
    echo "$FRAGMENTED_TABLES" | sed 's/^/   /'
    echo ""
    echo -e "${YELLOW}   建议对上述表执行 OPTIMIZE TABLE${NC}"
else
    echo -e "${GREEN}   ✅ 没有发现明显的表碎片${NC}"
fi

echo ""

# 3. 优化核心表
echo -e "${YELLOW}3️⃣ 优化核心数据表...${NC}"
echo "   (这可能需要几分钟，请耐心等待...)"
echo ""

CORE_TABLES=("users" "products" "lottery_records" "orders" "order_items")

for table in "${CORE_TABLES[@]}"; do
    # 检查表是否存在
    if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
        -e "SHOW TABLES LIKE '$table';" -s -N | grep -q "$table"; then
        
        echo -e "${BLUE}   优化表: $table${NC}"
        mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
            -e "OPTIMIZE TABLE $table;" 2>/dev/null | grep -v "note" || echo "   (已优化)"
    fi
done

echo ""

# 4. 分析表统计信息
echo -e "${YELLOW}4️⃣ 更新表统计信息...${NC}"

for table in "${CORE_TABLES[@]}"; do
    if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
        -e "SHOW TABLES LIKE '$table';" -s -N | grep -q "$table"; then
        
        mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
            -e "ANALYZE TABLE $table;" 2>/dev/null > /dev/null
        echo -e "${GREEN}   ✅ $table${NC}"
    fi
done

echo ""

# 5. 检查缺失的索引
echo -e "${YELLOW}5️⃣ 检查关键索引...${NC}"

# 检查 users 表索引
echo "   检查 users 表："
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    -e "SHOW INDEX FROM users WHERE Key_name != 'PRIMARY';" 2>/dev/null | \
    awk 'NR>1 {print "   - " $3}' || echo "   无额外索引"

# 检查 products 表索引
echo "   检查 products 表："
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    -e "SHOW INDEX FROM products WHERE Key_name != 'PRIMARY';" 2>/dev/null | \
    awk 'NR>1 {print "   - " $3}' || echo "   无额外索引"

echo ""

# 6. 清理过期数据（可选）
echo -e "${YELLOW}6️⃣ 检查过期数据...${NC}"

# 检查30天前的日志数据
OLD_LOGS=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    -e "SELECT COUNT(*) FROM lottery_records WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);" -s -N 2>/dev/null || echo "0")

if [ "$OLD_LOGS" -gt 0 ]; then
    echo -e "${YELLOW}   发现 $OLD_LOGS 条30天前的抽奖记录${NC}"
    echo -e "${YELLOW}   提示：可以考虑归档或清理旧数据以提升性能${NC}"
else
    echo -e "${GREEN}   ✅ 没有发现大量过期数据${NC}"
fi

echo ""

# 7. 性能建议
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}💡 性能优化建议${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 检查当前连接数
CURRENT_CONNECTIONS=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" \
    -e "SHOW STATUS LIKE 'Threads_connected';" -s -N 2>/dev/null | awk '{print $2}')

echo "📊 当前状态："
echo "   - 活跃连接数: ${CURRENT_CONNECTIONS:-未知}"
echo ""

echo "🎯 优化建议："
echo "   1. ✅ 已完成表优化和统计信息更新"
echo "   2. 💡 建议定期（每周）执行表优化"
echo "   3. 💡 监控慢查询日志，优化慢查询"
echo "   4. 💡 考虑为常用查询字段添加索引"
echo "   5. 💡 定期归档历史数据"
echo ""

echo -e "${GREEN}✅ 数据库优化完成！${NC}"
echo -e "${BLUE}📅 优化时间: $(date '+%Y年%m月%d日 %H:%M:%S')${NC}"
echo ""

