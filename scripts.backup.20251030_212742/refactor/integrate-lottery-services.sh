#!/bin/bash
# 抽奖服务整合执行脚本（方案A：最小变动方案）
# 创建时间：2025年10月15日 北京时间
# 预计耗时：20分钟
# 风险等级：低

set -e  # 遇到错误立即退出

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 当前时间戳（用于备份）
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="services.backup.${TIMESTAMP}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}抽奖服务整合脚本 - 方案A执行${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ====================
# 阶段1：前置检查和备份（5分钟）
# ====================
echo -e "${YELLOW}[阶段1/6] 前置检查和备份...${NC}"

# 1.1 检查必要目录是否存在
echo "1.1 检查目录结构..."
if [ ! -d "services/lottery" ]; then
    echo -e "${RED}❌ 错误：services/lottery 目录不存在${NC}"
    exit 1
fi

if [ ! -d "services/UnifiedLotteryEngine" ]; then
    echo -e "${RED}❌ 错误：services/UnifiedLotteryEngine 目录不存在${NC}"
    exit 1
fi

if [ ! -f "services/lottery/LotteryUserService.js" ]; then
    echo -e "${RED}❌ 错误：LotteryUserService.js 文件不存在${NC}"
    exit 1
fi

if [ ! -f "services/lottery/LotteryHistoryService.js" ]; then
    echo -e "${RED}❌ 错误：LotteryHistoryService.js 文件不存在${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 目录结构检查完成${NC}"

# 1.2 检查Git状态
echo ""
echo "1.2 检查Git状态..."
if [ -d ".git" ]; then
    # 检查是否有未提交的更改
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        echo -e "${YELLOW}⚠️  警告：有未提交的更改${NC}"
        echo "建议先提交或暂存当前更改"
        read -p "是否继续？(y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${RED}❌ 用户取消操作${NC}"
            exit 1
        fi
    fi
    echo -e "${GREEN}✅ Git状态检查完成${NC}"
else
    echo -e "${YELLOW}⚠️  警告：未检测到Git仓库${NC}"
fi

# 1.3 创建备份
echo ""
echo "1.3 创建备份..."
mkdir -p "$BACKUP_DIR"
cp -r services/lottery "$BACKUP_DIR/"
cp -r services/UnifiedLotteryEngine "$BACKUP_DIR/"
echo -e "${GREEN}✅ 备份已创建：$BACKUP_DIR${NC}"

# 1.4 创建Git分支
echo ""
echo "1.4 创建Git分支..."
if [ -d ".git" ]; then
    BRANCH_NAME="feature/lottery-service-integration-${TIMESTAMP}"
    git checkout -b "$BRANCH_NAME"
    echo -e "${GREEN}✅ 已创建分支：$BRANCH_NAME${NC}"
else
    echo -e "${YELLOW}⚠️  跳过Git分支创建（无Git仓库）${NC}"
fi

echo ""
echo -e "${GREEN}[阶段1] ✅ 前置检查和备份完成${NC}"
echo ""

# ====================
# 阶段2：创建services子目录（1分钟）
# ====================
echo -e "${YELLOW}[阶段2/6] 创建services子目录...${NC}"

if [ ! -d "services/UnifiedLotteryEngine/services" ]; then
    mkdir -p services/UnifiedLotteryEngine/services
    echo -e "${GREEN}✅ 已创建：services/UnifiedLotteryEngine/services/${NC}"
else
    echo -e "${YELLOW}⚠️  目录已存在：services/UnifiedLotteryEngine/services/${NC}"
fi

echo ""
echo -e "${GREEN}[阶段2] ✅ 子目录创建完成${NC}"
echo ""

# ====================
# 阶段3：迁移服务文件（2分钟）
# ====================
echo -e "${YELLOW}[阶段3/6] 迁移服务文件...${NC}"

# 3.1 迁移LotteryUserService.js
echo "3.1 迁移LotteryUserService.js..."
if [ -f "services/lottery/LotteryUserService.js" ]; then
    cp services/lottery/LotteryUserService.js services/UnifiedLotteryEngine/services/
    echo -e "${GREEN}✅ LotteryUserService.js 已迁移${NC}"
else
    echo -e "${RED}❌ 错误：LotteryUserService.js 不存在${NC}"
    exit 1
fi

# 3.2 迁移LotteryHistoryService.js
echo "3.2 迁移LotteryHistoryService.js..."
if [ -f "services/lottery/LotteryHistoryService.js" ]; then
    cp services/lottery/LotteryHistoryService.js services/UnifiedLotteryEngine/services/
    echo -e "${GREEN}✅ LotteryHistoryService.js 已迁移${NC}"
else
    echo -e "${RED}❌ 错误：LotteryHistoryService.js 不存在${NC}"
    exit 1
fi

# 3.3 验证文件已复制
echo ""
echo "3.3 验证文件已复制..."
ls -lh services/UnifiedLotteryEngine/services/
echo -e "${GREEN}✅ 文件验证完成${NC}"

echo ""
echo -e "${GREEN}[阶段3] ✅ 服务文件迁移完成${NC}"
echo ""

# ====================
# 阶段4：更新服务内部引用（5分钟）
# ====================
echo -e "${YELLOW}[阶段4/6] 更新服务内部引用路径...${NC}"

# 4.1 更新LotteryUserService.js的引用
echo "4.1 更新LotteryUserService.js..."
sed -i.bak "s|require('../../models')|require('../../../models')|g" services/UnifiedLotteryEngine/services/LotteryUserService.js
sed -i.bak "s|require('../../middleware/auth')|require('../../../middleware/auth')|g" services/UnifiedLotteryEngine/services/LotteryUserService.js
echo -e "${GREEN}✅ LotteryUserService.js 引用已更新${NC}"

# 4.2 更新LotteryHistoryService.js的引用
echo "4.2 更新LotteryHistoryService.js..."
sed -i.bak "s|require('../../models')|require('../../../models')|g" services/UnifiedLotteryEngine/services/LotteryHistoryService.js
sed -i.bak "s|require('../../utils/timeHelper')|require('../../../utils/timeHelper')|g" services/UnifiedLotteryEngine/services/LotteryHistoryService.js
sed -i.bak "s|require('../UnifiedLotteryEngine/utils/Logger')|require('../utils/Logger')|g" services/UnifiedLotteryEngine/services/LotteryHistoryService.js
echo -e "${GREEN}✅ LotteryHistoryService.js 引用已更新${NC}"

# 4.3 清理备份文件
echo ""
echo "4.3 清理临时备份文件..."
rm -f services/UnifiedLotteryEngine/services/*.bak
echo -e "${GREEN}✅ 临时文件已清理${NC}"

echo ""
echo -e "${GREEN}[阶段4] ✅ 服务内部引用更新完成${NC}"
echo ""

# ====================
# 阶段5：查找并报告需要更新的路由文件（10分钟）
# ====================
echo -e "${YELLOW}[阶段5/6] 查找需要更新的路由引用...${NC}"

echo "5.1 搜索路由文件中的引用..."
echo ""

# 创建临时文件存储搜索结果
ROUTES_TO_UPDATE=$(mktemp)

# 搜索所有引用
grep -rn "services/lottery/LotteryUserService\|services/lottery/LotteryHistoryService" routes --include="*.js" > "$ROUTES_TO_UPDATE" 2>/dev/null || true

if [ -s "$ROUTES_TO_UPDATE" ]; then
    echo -e "${YELLOW}⚠️  发现需要更新的路由文件：${NC}"
    echo ""
    cat "$ROUTES_TO_UPDATE"
    echo ""
    echo -e "${YELLOW}请手动更新以下路径：${NC}"
    echo "  旧路径: services/lottery/LotteryUserService"
    echo "  新路径: services/UnifiedLotteryEngine/services/LotteryUserService"
    echo ""
    echo "  旧路径: services/lottery/LotteryHistoryService"
    echo "  新路径: services/UnifiedLotteryEngine/services/LotteryHistoryService"
    echo ""
    
    # 询问是否自动更新
    read -p "是否自动更新这些文件？(y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "正在自动更新路由引用..."
        # 自动替换
        find routes -name "*.js" -type f -exec sed -i.bak \
            "s|services/lottery/LotteryUserService|services/UnifiedLotteryEngine/services/LotteryUserService|g" {} \;
        find routes -name "*.js" -type f -exec sed -i.bak \
            "s|services/lottery/LotteryHistoryService|services/UnifiedLotteryEngine/services/LotteryHistoryService|g" {} \;
        # 清理备份文件
        find routes -name "*.bak" -type f -delete
        echo -e "${GREEN}✅ 路由引用已自动更新${NC}"
    else
        echo -e "${YELLOW}⚠️  请手动更新路由文件后再继续${NC}"
    fi
else
    echo -e "${GREEN}✅ 未发现需要更新的路由引用（可能使用了其他导入方式）${NC}"
fi

rm -f "$ROUTES_TO_UPDATE"

echo ""
echo -e "${GREEN}[阶段5] ✅ 路由引用检查完成${NC}"
echo ""

# ====================
# 阶段6：删除旧目录（1分钟）
# ====================
echo -e "${YELLOW}[阶段6/6] 清理旧目录...${NC}"

read -p "是否删除旧的services/lottery目录？(y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "正在删除services/lottery目录..."
    rm -rf services/lottery/
    echo -e "${GREEN}✅ services/lottery 目录已删除${NC}"
else
    echo -e "${YELLOW}⚠️  保留services/lottery目录（建议验证完成后手动删除）${NC}"
fi

echo ""
echo -e "${GREEN}[阶段6] ✅ 目录清理完成${NC}"
echo ""

# ====================
# 完成总结
# ====================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}整合完成总结${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}✅ 迁移完成！文件已整合到：${NC}"
echo "   services/UnifiedLotteryEngine/services/"
echo ""
echo -e "${YELLOW}📋 下一步操作：${NC}"
echo "   1. 启动开发服务器验证功能"
echo "      ${BLUE}npm run dev${NC}"
echo ""
echo "   2. 运行单元测试"
echo "      ${BLUE}npm test${NC}"
echo ""
echo "   3. 验证抽奖功能正常"
echo "      ${BLUE}curl http://localhost:3000/api/v4/unified-engine/lottery/prizes/test_campaign${NC}"
echo ""
echo "   4. 如果一切正常，提交代码"
echo "      ${BLUE}git add .${NC}"
echo "      ${BLUE}git commit -m \"feat: 整合抽奖服务到统一目录结构\"${NC}"
echo ""
echo "   5. 如果出现问题，快速回滚"
echo "      ${BLUE}cp -r $BACKUP_DIR/lottery services/${NC}"
echo "      ${BLUE}rm -rf services/UnifiedLotteryEngine/services${NC}"
echo ""
echo -e "${GREEN}📁 备份位置：${NC}$BACKUP_DIR"
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}脚本执行完成！${NC}"
echo -e "${BLUE}========================================${NC}"



