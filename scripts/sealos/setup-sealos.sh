#!/bin/bash
# Sealos对象存储配置验证脚本
# 🔴 遵循单一真相源方案：所有配置从 .env 读取
# 🔴 遵循 fail-fast 策略：缺少配置立即退出
# 参考：docs/Devbox单环境统一配置规范.md

echo "🚀 ===== Sealos对象存储配置验证 ====="

# 设置颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 🔴 fail-fast: 检查 .env 文件是否存在（禁止自动创建）
if [ ! -f ".env" ]; then
    echo ""
    echo -e "${RED}❌ 错误：缺少 .env 配置文件（fail-fast 策略）${NC}"
    echo ""
    echo "📋 请手工创建 .env 文件，参考 config.example 填写 Sealos 配置："
    echo ""
    echo "   touch .env"
    echo "   chmod 600 .env"
    echo ""
    echo "   必需的 Sealos 配置项："
    echo "   - SEALOS_ENDPOINT=https://your-endpoint"
    echo "   - SEALOS_BUCKET=your-bucket-name"
    echo "   - SEALOS_ACCESS_KEY=your-access-key"
    echo "   - SEALOS_SECRET_KEY=your-secret-key"
    echo "   - SEALOS_REGION=your-region"
    echo ""
    echo -e "${YELLOW}⚠️ 禁止直接使用 cp config.example .env（会包含占位符）${NC}"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ .env 文件存在${NC}"

# 🔴 从 .env 加载环境变量（不输出敏感信息）
set -a
source .env
set +a

# 🔴 验证必需的 Sealos 配置项
echo -e "\n${YELLOW}📋 验证 Sealos 配置...${NC}"

MISSING_VARS=()

if [ -z "$SEALOS_ENDPOINT" ]; then
    MISSING_VARS+=("SEALOS_ENDPOINT")
fi

if [ -z "$SEALOS_BUCKET" ]; then
    MISSING_VARS+=("SEALOS_BUCKET")
fi

if [ -z "$SEALOS_ACCESS_KEY" ]; then
    MISSING_VARS+=("SEALOS_ACCESS_KEY")
fi

if [ -z "$SEALOS_SECRET_KEY" ]; then
    MISSING_VARS+=("SEALOS_SECRET_KEY")
fi

if [ -z "$SEALOS_REGION" ]; then
    MISSING_VARS+=("SEALOS_REGION")
fi

# 如果有缺失的配置项，报错退出
if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo ""
    echo -e "${RED}❌ 缺少必需的 Sealos 环境变量：${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo -e "   - ${var}"
    done
    echo ""
    echo "📋 请在 .env 文件中添加以上配置项"
    echo ""
    exit 1
fi

# 显示配置状态（脱敏）
echo -e "${GREEN}✅ Sealos 配置已加载${NC}"
echo "   - SEALOS_ENDPOINT: ${SEALOS_ENDPOINT}"
echo "   - SEALOS_BUCKET: ${SEALOS_BUCKET}"
echo "   - SEALOS_REGION: ${SEALOS_REGION}"
echo "   - SEALOS_ACCESS_KEY: ***已配置***"
echo "   - SEALOS_SECRET_KEY: ***已配置***"

# 检查依赖包
echo -e "\n${YELLOW}📦 检查 AWS SDK 依赖...${NC}"
if ! npm list aws-sdk > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️ AWS SDK 未安装，正在安装...${NC}"
    npm install aws-sdk
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ AWS SDK 安装成功${NC}"
    else
        echo -e "${RED}❌ AWS SDK 安装失败${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ AWS SDK 已安装${NC}"
fi

# 测试 Sealos 连接（使用 Node.js 脚本，从环境变量读取配置）
echo -e "\n${YELLOW}🧪 测试 Sealos 存储连接...${NC}"

# 使用内联 Node.js 脚本测试连接（从环境变量读取，不创建临时文件）
node -e "
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
    endpoint: process.env.SEALOS_ENDPOINT,
    accessKeyId: process.env.SEALOS_ACCESS_KEY,
    secretAccessKey: process.env.SEALOS_SECRET_KEY,
    region: process.env.SEALOS_REGION,
    s3ForcePathStyle: true,
    signatureVersion: 'v4'
});

s3.listObjectsV2({
    Bucket: process.env.SEALOS_BUCKET,
    MaxKeys: 1
}).promise()
    .then(() => {
        console.log('✅ Sealos 存储连接测试成功');
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Sealos 存储连接测试失败:', err.message);
        process.exit(1);
    });
"

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}🎉 ===== Sealos 配置验证成功！ =====${NC}"
    echo -e "${GREEN}✅ 存储服务已就绪，可以开始使用${NC}"

    # 显示使用示例
    echo -e "\n${YELLOW}📖 使用示例:${NC}"
    echo "const SealosStorageService = require('./services/sealosStorage');"
    echo "const storage = new SealosStorageService();"
    echo "const imageUrl = await storage.uploadImage(fileBuffer, 'image.jpg');"
else
    echo -e "\n${RED}❌ ===== Sealos 配置验证失败！ =====${NC}"
    echo -e "${RED}请检查 .env 中的 Sealos 配置是否正确${NC}"
    exit 1
fi

# 显示下一步操作
echo -e "\n${GREEN}🔥 下一步操作建议:${NC}"
echo "1. 启动应用服务: npm run pm:start:pm2"
echo "2. 测试图片上传 API: POST /api/v4/system/upload"
echo "3. 查看健康状态: GET /health"

echo -e "\n${GREEN}✨ Sealos 对象存储配置验证完成！${NC}"
