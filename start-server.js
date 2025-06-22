/**
 * Sealos环境专用启动脚本
 * 解决公网调试地址准备中的问题
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

// 🔴 中间件配置
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 🔴 健康检查接口 - Sealos必需
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  });
});

// 🔴 根路径响应
app.get('/', (req, res) => {
  res.json({
    message: '餐厅积分抽奖系统',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api/*'
    }
  });
});

// 🔴 测试API接口
app.get('/api/test', (req, res) => {
  res.json({
    message: 'API测试成功',
    timestamp: new Date().toISOString(),
    server: 'Sealos Devbox'
  });
});

// 🔴 启动服务器
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Sealos要求监听所有接口

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 服务器启动成功!`);
  console.log(`📍 监听地址: ${HOST}:${PORT}`);
  console.log(`🔗 公网地址: https://rqchrlqndora.sealosbja.site`);
  console.log(`🔗 内网地址: http://devbox1.ns-br0za7uc.svc.cluster.local:${PORT}`);
  console.log(`✅ 服务状态: 运行中`);
});

// 🔴 优雅关闭
process.on('SIGTERM', () => {
  console.log('🛑 收到关闭信号，优雅关闭服务器...');
  server.close(() => {
    console.log('✅ 服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 收到中断信号，优雅关闭服务器...');
  server.close(() => {
    console.log('✅ 服务器已关闭');
    process.exit(0);
  });
});

module.exports = app; 