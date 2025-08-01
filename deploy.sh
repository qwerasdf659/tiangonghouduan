#!/bin/bash

# 餐厅积分抽奖系统 - 部署脚本
# 🔴 部署到Sealos Devbox环境

set -e  # 遇到错误立即退出

echo "🚀 开始部署餐厅积分抽奖系统..."

# 🔴 环境检查
echo "📋 检查部署环境..."

# 检查Node.js版本
NODE_VERSION=$(node --version 2>/dev/null || echo "未安装")
if [[ $NODE_VERSION == "未安装" ]]; then
    echo "❌ Node.js未安装，请先安装Node.js 16+版本"
    exit 1
fi

echo "✅ Node.js版本: $NODE_VERSION"

# 检查npm版本
NPM_VERSION=$(npm --version 2>/dev/null || echo "未安装")
if [[ $NPM_VERSION == "未安装" ]]; then
    echo "❌ npm未安装"
    exit 1
fi

echo "✅ npm版本: $NPM_VERSION"

# 🔴 安装依赖
echo "📦 安装项目依赖..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ 依赖安装失败"
    exit 1
fi

echo "✅ 依赖安装完成"

# 🔴 环境变量配置
echo "⚙️ 配置环境变量..."

if [ ! -f ".env" ]; then
    echo "📝 创建.env文件..."
    cp config.example .env
    
    echo "⚠️ 请编辑.env文件，配置正确的数据库连接信息："
    echo "   - DB_HOST=test-db-mysql.ns-br0za7uc.svc"
    echo "   - DB_PORT=3306"
    echo "   - DB_USER=root"
    echo "   - DB_PASSWORD=mc6r9cgb"
    echo "   - NODE_ENV=production"
fi

# 🔴 创建必要的目录
echo "📁 创建目录结构..."
mkdir -p uploads
mkdir -p images
mkdir -p logs

echo "✅ 目录创建完成"

echo ""
echo "🎉 部署完成！"
echo "================================"
echo ""
echo "📋 部署信息:"
echo "   - 项目目录: $(pwd)"
echo "   - Node.js版本: $NODE_VERSION"
echo "   - 数据库: test-db-mysql.ns-br0za7uc.svc:3306"
echo ""
echo "🚀 启动命令:"
echo "   - 开发环境: npm run dev"
echo "   - 生产环境: npm start"
echo ""
echo "🔗 访问地址:"
echo "   - 内网: http://devbox2.ns-br0za7uc.svc.cluster.local:3000"
echo "   - 公网: https://omqktqrtntnn.sealosbja.site"
echo "   - 健康检查: http://localhost:3000/health"
echo "   - API文档: http://localhost:3000/api/docs (开发环境)"
echo ""
echo "⚠️ 注意事项:"
echo "   1. 请确保.env文件配置正确"
echo "   2. 首次运行前执行: npm run db:init (初始化数据库)"
echo "   3. 查看服务状态: npm run start"
echo "" 