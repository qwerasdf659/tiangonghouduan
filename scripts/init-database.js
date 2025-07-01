#!/usr/bin/env node

/**
 * 数据库初始化脚本
 * 🔴 根据前端文档要求初始化数据库
 * 
 * 使用方法：
 * node scripts/init-database.js [--force] [--with-data]
 * 
 * 参数说明：
 * --force      强制重建表（开发环境）
 * --with-data  初始化示例数据
 * --prod       生产环境模式（只创建表结构）
 */

require('dotenv').config();
const { syncModels, initializeData, healthCheck, getStatistics } = require('../models');
const webSocketService = require('../services/websocket');

// 解析命令行参数
const args = process.argv.slice(2);
const force = args.includes('--force');
const withData = args.includes('--with-data');
const isProd = args.includes('--prod') || process.env.NODE_ENV === 'production';

async function main() {
  console.log('🚀 开始初始化餐厅积分抽奖系统数据库...');
  console.log(`📊 模式: ${isProd ? '生产环境' : '开发环境'}`);
  console.log(`🔧 参数: force=${force}, withData=${withData}`);
  
  try {
    // 🔴 遵循工作区规则：生产环境不允许force
    if (isProd && force) {
      console.error('❌ 生产环境不允许使用 --force 参数');
      process.exit(1);
    }
    
    console.log('\n⭐ 第一步：同步数据库模型');
    console.log('📋 将创建/更新以下表：');
    console.log('  - users (用户表)');
    console.log('  - lottery_prizes (抽奖配置表) 🔴');
    console.log('  - products (商品表，主键：commodity_id) 🔴');
    console.log('  - upload_reviews (上传审核表) 🔴');
    console.log('  - points_records (积分记录表)');
    console.log('  - lottery_pity (抽奖保底表)');
    
    // 设置同步选项
    const syncOptions = {};
    if (!isProd) {
      syncOptions.alter = !force;  // 开发环境允许alter
      syncOptions.force = force;   // 开发环境允许force（慎用）
    }
    
    await syncModels(syncOptions);
    console.log('✅ 数据库模型同步完成');
    
    // 🔴 初始化数据（如果需要）
    if (withData || force) {
      console.log('\n⭐ 第二步：初始化示例数据');
      console.log('📋 将创建以下数据：');
      console.log('  - 标准转盘配置（8个奖品，0-315度45度间隔）');
      console.log('  - 示例商品（6个商品，不同分类）');
      console.log('  - 测试用户（3个用户，包含商家用户）');
      
      await initializeData();
      console.log('✅ 示例数据初始化完成');
    }
    
    // 🔴 数据库健康检查
    console.log('\n⭐ 第三步：健康检查');
    const health = await healthCheck();
    
    if (health.status === 'healthy') {
      console.log('✅ 数据库健康检查通过');
      console.log('📊 表状态:', health.tables);
      console.log('📈 数据统计:', health.data_counts);
    } else {
      console.error('❌ 数据库健康检查失败:', health.error);
      process.exit(1);
    }
    
    // 🔴 获取详细统计
    if (withData || force) {
      console.log('\n⭐ 第四步：数据统计');
      const stats = await getStatistics();
      console.log('📊 详细统计信息:');
      console.log('  👥 用户统计:');
      console.log(`    - 总用户: ${stats.users.total}`);
      console.log(`    - 活跃用户: ${stats.users.active}`);
      console.log(`    - 商家用户: ${stats.users.merchants}`);
      console.log('  🎰 抽奖统计:');
      console.log(`    - 总奖品: ${stats.lottery.total_prizes}`);
      console.log(`    - 活跃奖品: ${stats.lottery.active_prizes}`);
      console.log('  🛍️ 商品统计:');
      console.log(`    - 总商品: ${stats.products.total}`);
      console.log(`    - 活跃商品: ${stats.products.active}`);
      console.log(`    - 有库存商品: ${stats.products.in_stock}`);
      console.log('  📸 审核统计:');
      console.log(`    - 总审核: ${stats.reviews.total}`);
      console.log(`    - 待审核: ${stats.reviews.pending}`);
      console.log(`    - 已通过: ${stats.reviews.approved}`);
    }
    
    // 🔴 前端对接验证
    console.log('\n⭐ 第五步：前端对接验证');
    console.log('🔍 验证前端文档要求的关键配置...');
    
    // 验证转盘角度配置
    const { LotterySetting } = require('../models');
    const prizes = await LotterySetting.findAll({
      where: { status: 'active' },
      order: [['angle', 'ASC']]
    });
    
    const expectedAngles = [0, 45, 90, 135, 180, 225, 270, 315];
    const actualAngles = prizes.map(p => p.angle);
    
    if (JSON.stringify(actualAngles.sort()) === JSON.stringify(expectedAngles.sort())) {
      console.log('✅ 转盘角度配置正确（0-315度，45度间隔）');
    } else {
      console.log('⚠️ 转盘角度配置异常');
      console.log('期望角度:', expectedAngles);
      console.log('实际角度:', actualAngles);
    }
    
    // 验证商品字段
    const { CommodityPool } = require('../models');
    const sampleProduct = await CommodityPool.findOne();
    if (sampleProduct) {
      const frontendInfo = sampleProduct.getFrontendInfo();
      if (frontendInfo.commodity_id && frontendInfo.exchange_points !== undefined) {
        console.log('✅ 商品字段映射正确（commodity_id, exchange_points）');
      } else {
        console.log('⚠️ 商品字段映射异常');
      }
    }
    
    console.log('\n🎉 数据库初始化完成！');
    console.log('\n📋 接下来可以：');
    console.log('1. 启动后端服务: npm start');
    console.log('2. 访问健康检查: GET /health');
    console.log('3. 测试API接口:');
    console.log('   - GET /api/lottery/config (获取转盘配置)');
    console.log('   - GET /api/exchange/products (获取商品列表)');
    console.log('   - POST /api/auth/login (用户登录)');
    console.log('\n🔗 WebSocket连接地址: ws://localhost:8080?token=YOUR_JWT_TOKEN');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ 初始化失败:', error);
    console.error('\n🔧 可能的解决方案:');
    console.error('1. 检查数据库连接配置');
    console.error('2. 确保MySQL服务正在运行');
    console.error('3. 检查数据库权限');
    console.error('4. 查看详细错误日志');
    
    if (error.name === 'SequelizeConnectionError') {
      console.error('\n💡 数据库连接失败，请检查config/database.js配置');
    } else if (error.name === 'SequelizeValidationError') {
      console.error('\n💡 数据验证失败，请检查模型定义');
    } else if (error.name === 'SequelizeDatabaseError') {
      console.error('\n💡 数据库操作失败，可能是表结构或SQL语法问题');
    }
    
    process.exit(1);
  }
}

// 🔴 优雅退出处理
process.on('SIGINT', () => {
  console.log('\n⚠️ 收到退出信号，正在清理...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('\n💥 未捕获的异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 未处理的Promise拒绝:', reason);
  process.exit(1);
});

// 运行初始化
main(); 