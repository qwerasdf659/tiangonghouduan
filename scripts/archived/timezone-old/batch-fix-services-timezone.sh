#!/bin/bash
# 批量修复services文件的时间处理
# 创建时间：2025年10月11日

echo "🔧 开始批量修复services文件的时间处理..."
echo ""

# 定义颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 统计变量
total_files=0
modified_files=0

# 函数：修复单个文件
fix_file() {
    local file=$1
    local file_name=$(basename "$file")
    
    echo -e "${YELLOW}检查:${NC} $file_name"
    
    # 检查文件是否存在
    if [ ! -f "$file" ]; then
        echo -e "  ${RED}✗${NC} 文件不存在"
        return
    fi
    
    ((total_files++))
    
    # 备份原文件
    cp "$file" "$file.bak"
    
    local changed=0
    
    # 1. 确保已导入BeijingTimeHelper
    if ! grep -q "BeijingTimeHelper" "$file"; then
        # 在第一个require语句后添加导入
        sed -i "/require.*sequelize/a const BeijingTimeHelper = require('../utils/timeHelper')" "$file"
        echo -e "  ${GREEN}✓${NC} 添加BeijingTimeHelper导入"
        changed=1
    fi
    
    # 2. 修复new Date()在时间比较中的使用
    # new Date() > xxx -> BeijingTimeHelper.isExpired(xxx)
    if grep -q "new Date() >" "$file"; then
        # 注意：这个sed命令可能需要根据实际情况调整
        echo -e "  ${YELLOW}!${NC} 检测到时间比较，请手动检查"
        changed=1
    fi
    
    # 3. 修复new Date()在赋值中的使用
    # : new Date() -> : BeijingTimeHelper.createDatabaseTime()
    if sed -i "s/: new Date(),/: BeijingTimeHelper.createDatabaseTime(),/g" "$file"; then
        if ! diff -q "$file" "$file.bak" > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} 替换赋值中的new Date()"
            changed=1
        fi
    fi
    
    # 4. 修复Date.now()在ID生成中的使用
    # Date.now() in template strings -> BeijingTimeHelper.generateIdTimestamp()
    if grep -q 'Date.now()' "$file" && grep -q '`.*Date.now().*`' "$file"; then
        echo -e "  ${YELLOW}!${NC} 检测到ID生成中的Date.now()，请手动检查"
        changed=1
    fi
    
    # 5. 修复Date.now()在时间戳中的使用
    # Date.now() (not in template strings) -> BeijingTimeHelper.timestamp()
    # 这个比较复杂，需要手动处理
    
    # 如果文件有修改，保留修改；否则恢复备份
    if [ "$changed" -eq 1 ]; then
        rm "$file.bak"
        ((modified_files++))
        echo -e "  ${GREEN}✅ 修复完成${NC}"
    else
        mv "$file.bak" "$file"
        echo -e "  ${GREEN}⏭️  无需修改${NC}"
    fi
    
    echo ""
}

# 修复主要服务文件
fix_file "services/NotificationService.js"
fix_file "services/AuditManagementService.js"
fix_file "services/ChatWebSocketService.js"
fix_file "services/sealosStorage.js"

# UnifiedLotteryEngine相关
fix_file "services/UnifiedLotteryEngine/UnifiedLotteryEngine.js"
fix_file "services/UnifiedLotteryEngine/strategies/BasicGuaranteeStrategy.js"
fix_file "services/UnifiedLotteryEngine/utils/CacheManager.js"
fix_file "services/UnifiedLotteryEngine/utils/PerformanceMonitor.js"

echo "============================================================"
echo -e "${GREEN}✅ 批量修复完成！${NC}"
echo "   总文件数: $total_files"
echo "   修改文件数: $modified_files"
echo "============================================================"
echo ""
echo "💡 下一步："
echo "1. 手动检查标记为需要手动检查的文件"
echo "2. 运行 npm run lint 检查代码质量"
echo "3. 运行 npm test 执行测试"
echo ""

