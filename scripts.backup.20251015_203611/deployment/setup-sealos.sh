#!/bin/bash
# Sealos对象存储配置和测试脚本
# 🔴 使用用户提供的真实配置

echo "🚀 ===== Sealos对象存储配置向导 ====="

# 设置颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查环境变量文件
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️ 未找到.env文件，正在创建...${NC}"
    cp config.example .env
    echo -e "${GREEN}✅ 已从config.example创建.env文件${NC}"
fi

# 显示当前Sealos配置
echo -e "\n${GREEN}📋 当前Sealos对象存储配置:${NC}"
echo "桶名: tiangong"
echo "Access Key: br0za7uc"
echo "Secret Key: skxg8mk5gqfhf9xz"
echo "内网端点: object-storage.objectstorage-system.svc.cluster.local"
echo "外网端点: objectstorageapi.bja.sealos.run"

# 检查依赖包
echo -e "\n${YELLOW}📦 检查AWS SDK依赖...${NC}"
if ! npm list aws-sdk > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️ AWS SDK未安装，正在安装...${NC}"
    npm install aws-sdk
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ AWS SDK安装成功${NC}"
    else
        echo -e "${RED}❌ AWS SDK安装失败${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ AWS SDK已安装${NC}"
fi

# 测试Sealos连接
echo -e "\n${YELLOW}🧪 测试Sealos存储连接...${NC}"

# 创建测试配置
cat > test-config.json << EOF
{
  "endpoint": "https://objectstorageapi.bja.sealos.run",
  "internalEndpoint": "http://object-storage.objectstorage-system.svc.cluster.local",
  "bucket": "tiangong",
  "accessKeyId": "br0za7uc",
  "secretAccessKey": "skxg8mk5gqfhf9xz"
}
EOF

# 运行连接测试
if [ -f "test-sealos.js" ]; then
    echo -e "${YELLOW}正在运行连接测试...${NC}"
    node test-sealos.js
    
    if [ $? -eq 0 ]; then
        echo -e "\n${GREEN}🎉 ===== Sealos配置测试成功！ =====${NC}"
        echo -e "${GREEN}✅ 存储服务已就绪，可以开始使用${NC}"
        
        # 显示使用示例
        echo -e "\n${YELLOW}📖 使用示例:${NC}"
        echo "const sealosStorage = require('./services/sealosStorage');"
        echo "const imageUrl = await sealosStorage.uploadImage(fileBuffer, 'image.jpg');"
        
    else
        echo -e "\n${RED}❌ ===== Sealos配置测试失败！ =====${NC}"
        echo -e "${RED}请检查网络连接和配置信息${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ 未找到test-sealos.js测试文件${NC}"
    exit 1
fi

# 清理临时文件
rm -f test-config.json

# 显示下一步操作
echo -e "\n${GREEN}🔥 下一步操作建议:${NC}"
echo "1. 启动应用服务: npm start"
echo "2. 测试图片上传API: POST /api/photo/upload"
echo "3. 查看存储统计: GET /api/storage/stats"
echo "4. 配置OCR服务进行完整的拍照识别功能"

echo -e "\n${GREEN}✨ Sealos对象存储配置完成！${NC}" 