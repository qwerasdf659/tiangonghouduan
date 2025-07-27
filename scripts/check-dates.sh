#!/bin/bash
# check-dates.sh - 自动检查项目中的过时日期
# 创建时间: 2025年01月21日
# 作者: 开发团队

echo "🔍 检查项目中的过时日期..."
echo "当前正确日期应为: 2025年01月21日 或 2025-01-21"
echo "=========================================="

# 设置颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查结果统计
found_issues=0

# 检查常见的过时日期模式
echo "📋 检查过时日期模式..."

# 检查2025年01月12日格式
echo "检查格式: 2025年01月12日"
if grep -r "2025年01月12日" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=logs --exclude-file=scripts/check-dates.sh 2>/dev/null; then
    echo -e "${RED}❌ 发现过时日期: 2025年01月12日${NC}"
    found_issues=$((found_issues + 1))
fi

# 检查2025-01-12格式
echo "检查格式: 2025-01-12"
if grep -r "2025-01-12" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=logs --exclude-file=scripts/check-dates.sh 2>/dev/null; then
    echo -e "${RED}❌ 发现过时日期: 2025-01-12${NC}"
    found_issues=$((found_issues + 1))
fi

# 检查创建时间注释
echo "检查创建时间注释..."
if grep -r "创建时间：2025-01-12\|创建时间: 2025-01-12" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=logs --exclude-file=scripts/check-dates.sh 2>/dev/null; then
    echo -e "${RED}❌ 发现过时的创建时间注释${NC}"
    found_issues=$((found_issues + 1))
fi

# 检查更新时间注释
if grep -r "更新时间：2025-01-12\|更新时间: 2025-01-12" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=logs --exclude-file=scripts/check-dates.sh 2>/dev/null; then
    echo -e "${RED}❌ 发现过时的更新时间注释${NC}"
    found_issues=$((found_issues + 1))
fi

# 检查英文日期格式
echo "检查英文日期格式..."
if grep -r "January 12, 2025\|Jan 12, 2025" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=logs --exclude-file=scripts/check-dates.sh 2>/dev/null; then
    echo -e "${RED}❌ 发现过时的英文日期${NC}"
    found_issues=$((found_issues + 1))
fi

echo "=========================================="

# 输出检查结果
if [ $found_issues -eq 0 ]; then
    echo -e "${GREEN}✅ 未发现过时日期，项目日期使用规范！${NC}"
    exit 0
else
    echo -e "${RED}❌ 发现 $found_issues 个日期问题${NC}"
    echo -e "${YELLOW}📝 请将所有过时日期更新为: 2025年01月21日${NC}"
    echo ""
    echo "🔧 修复建议:"
    echo "1. 将 '2025年01月12日' 替换为 '2025年01月21日'"
    echo "2. 将 '2025-01-12' 替换为 '2025-01-21'"
    echo "3. 更新所有创建时间和更新时间注释"
    echo "4. 检查文档的版本历史记录"
    echo ""
    echo "⚠️  请立即修正这些问题，确保项目时间信息准确性！"
    exit 1
fi 