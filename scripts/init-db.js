/**
 * 数据库初始化脚本
 * 🔴 前端对接说明：此脚本用于初始化数据库结构和基础数据
 * 🔴 使用方法：node scripts/init-db.js [--force] [--seed]
 * 🔴 参数说明：
 *   --force: 强制重建所有表（慎用，会删除所有数据）
 *   --seed: 初始化示例数据
 */

require('dotenv').config();
const { syncModels } = require('../models');
const { sequelize } = require('../config/database');

// 解析命令行参数
const args = process.argv.slice(2);
const forceSync = args.includes('--force');
const seedData = args.includes('--seed');

// 🔴 基础数据种子函数 - 确保前后端数据一致性
async function seedDatabase() {
  try {
    console.log('🌱 开始初始化基础数据...');
    
    const { LotterySetting, CommodityPool, User } = require('../models');
    
    // 🔴 创建管理员账户 - 商家管理功能需要
    const adminUser = await User.create({
      username: 'admin',
      phone: '13800000000',
      nickname: '系统管理员',
      avatar: '/images/admin-avatar.png',
      total_points: 999999,
      used_points: 0,
      user_level: 'VIP',
      is_merchant: true, // 🔴 标记为商家，用于审核功能
      is_active: true,
      registration_ip: '127.0.0.1',
      last_login_time: new Date()
    });
    
    console.log('✅ 管理员账户创建成功:', adminUser.user_id);
    
    // 🔴 初始化抽奖配置 - 前端转盘需要这些数据
    const lotterySettings = await LotterySetting.bulkCreate([
      {
        prize_name: '八八折券',
        prize_type: 'coupon',
        prize_value: 88.00,
        angle: 0,
        color: '#FF6B6B',
        probability: 0.05,
        is_activity: true,
        cost_points: 100,
        description: '全场商品8.8折优惠券'
      },
      {
        prize_name: '50积分',
        prize_type: 'points',
        prize_value: 50.00,
        angle: 45,
        color: '#4ECDC4',
        probability: 0.20,
        is_activity: false,
        cost_points: 100,
        description: '直接获得50积分奖励'
      },
      {
        prize_name: '九九折券',
        prize_type: 'coupon',
        prize_value: 99.00,
        angle: 90,
        color: '#45B7D1',
        probability: 0.10,
        is_activity: false,
        cost_points: 100,
        description: '全场商品9.9折优惠券'
      },
      {
        prize_name: '100积分',
        prize_type: 'points',
        prize_value: 100.00,
        angle: 135,
        color: '#96CEB4',
        probability: 0.15,
        is_activity: false,
        cost_points: 100,
        description: '直接获得100积分奖励'
      },
      {
        prize_name: '免费咖啡',
        prize_type: 'physical',
        prize_value: 25.00,
        angle: 180,
        color: '#FFEAA7',
        probability: 0.08,
        is_activity: true,
        cost_points: 100,
        description: '可到店免费领取一杯咖啡'
      },
      {
        prize_name: '30积分',
        prize_type: 'points',
        prize_value: 30.00,
        angle: 225,
        color: '#DDA0DD',
        probability: 0.25,
        is_activity: false,
        cost_points: 100,
        description: '直接获得30积分奖励'
      },
      {
        prize_name: '神秘大奖',
        prize_type: 'physical',
        prize_value: 500.00,
        angle: 270,
        color: '#FF7675',
        probability: 0.02,
        is_activity: true,
        cost_points: 100,
        description: '价值500元的神秘大奖'
      },
      {
        prize_name: '谢谢参与',
        prize_type: 'empty',
        prize_value: 0.00,
        angle: 315,
        color: '#74B9FF',
        probability: 0.15,
        is_activity: false,
        cost_points: 100,
        description: '感谢您的参与，下次再来哦'
      }
    ]);
    
    console.log('✅ 抽奖配置初始化完成:', lotterySettings.length, '个奖品');
    
    // 🔴 初始化商品数据 - 积分兑换功能需要
    const commodities = await CommodityPool.bulkCreate([
      {
        name: '星巴克拿铁',
        description: '经典拿铁咖啡，香醇浓郁，温暖你的每一天',
        category: '饮品',
        exchange_points: 800,
        original_price: 32.00,
        discount_price: 25.00,
        stock: 50,
        image: '/images/starbucks-latte.jpg',
        is_hot: true,
        sort_order: 1,
        rating: 4.8,
        sales_count: 156,
        is_active: true
      },
      {
        name: '喜茶芝芝莓莓',
        description: '新鲜草莓与芝士的完美结合，口感层次丰富',
        category: '饮品',
        exchange_points: 600,
        original_price: 28.00,
        discount_price: 22.00,
        stock: 30,
        image: '/images/heytea-berry.jpg',
        is_hot: true,
        sort_order: 2,
        rating: 4.9,
        sales_count: 203,
        is_active: true
      },
      {
        name: '肯德基全家桶',
        description: '8块原味鸡+薯条+汽水，家庭聚餐首选',
        category: '快餐',
        exchange_points: 1500,
        original_price: 89.00,
        discount_price: 69.00,
        stock: 20,
        image: '/images/kfc-bucket.jpg',
        is_hot: false,
        sort_order: 3,
        rating: 4.6,
        sales_count: 89,
        is_active: true
      },
      {
        name: '海底捞火锅券',
        description: '200元海底捞代金券，享受正宗火锅美味',
        category: '代金券',
        exchange_points: 2000,
        original_price: 200.00,
        discount_price: 180.00,
        stock: 10,
        image: '/images/haidilao-voucher.jpg',
        is_hot: true,
        sort_order: 4,
        rating: 4.9,
        sales_count: 45,
        is_active: true
      },
      {
        name: '小米手环7',
        description: '智能运动手环，健康生活好伴侣',
        category: '数码',
        exchange_points: 2500,
        original_price: 249.00,
        discount_price: 199.00,
        stock: 5,
        image: '/images/xiaomi-band7.jpg',
        is_hot: false,
        sort_order: 5,
        rating: 4.7,
        sales_count: 23,
        is_active: true
      }
    ]);
    
    console.log('✅ 商品数据初始化完成:', commodities.length, '个商品');
    
    // 🔴 创建测试用户 - 开发调试使用
    const testUser = await User.create({
      username: 'test_user',
      phone: '13900000001',
      nickname: '测试用户',
      avatar: '/images/default-avatar.png',
      total_points: 1000,
      used_points: 0,
      user_level: '普通用户',
      is_merchant: false,
      is_active: true,
      registration_ip: '127.0.0.1',
      last_login_time: new Date()
    });
    
    console.log('✅ 测试用户创建成功:', testUser.user_id);
    
    console.log('🎉 基础数据初始化完成！');
    
  } catch (error) {
    console.error('❌ 基础数据初始化失败:', error);
    throw error;
  }
}

// 🔴 主初始化函数
async function initializeDatabase() {
  try {
    console.log('🚀 开始数据库初始化...');
    console.log('📋 参数配置:');
    console.log(`   - 强制重建: ${forceSync ? '是' : '否'}`);
    console.log(`   - 初始化数据: ${seedData ? '是' : '否'}`);
    console.log(`   - 数据库: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
    
    // 🔴 测试数据库连接
    console.log('🔗 测试数据库连接...');
    await sequelize.authenticate();
    console.log('✅ 数据库连接成功');
    
    // 🔴 同步数据库模型
    console.log('📊 同步数据库模型...');
    await syncModels(forceSync);
    
    if (forceSync) {
      console.log('⚠️ 强制重建模式：所有表已重新创建');
    }
    
    // 🔴 初始化基础数据
    if (seedData || forceSync) {
      await seedDatabase();
    }
    
    // 🔴 显示数据库状态
    console.log('\n📊 数据库状态:');
    const models = ['User', 'PointsRecord', 'LotterySetting', 'CommodityPool', 'PhotoReview'];
    for (const modelName of models) {
      try {
        const model = require('../models')[modelName];
        const count = await model.count();
        console.log(`   - ${modelName}: ${count} 条记录`);
      } catch (error) {
        console.log(`   - ${modelName}: 查询失败`);
      }
    }
    
    console.log('\n✅ 数据库初始化完成！');
    console.log('🔗 可以使用以下命令测试数据库连接:');
    console.log('   node scripts/test-db.js');
    
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

// 🔴 处理未捕获的异常
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  process.exit(1);
});

// 🔴 显示使用帮助
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🗄️ 数据库初始化脚本

使用方法:
  node scripts/init-db.js [选项]

选项:
  --force    强制重建所有表（会删除现有数据）
  --seed     初始化示例数据
  --help     显示此帮助信息

示例:
  node scripts/init-db.js                # 仅同步表结构
  node scripts/init-db.js --seed         # 同步表结构并初始化数据
  node scripts/init-db.js --force --seed # 重建所有表并初始化数据

⚠️ 注意：--force 参数会删除所有现有数据，请谨慎使用！
  `);
  process.exit(0);
}

// 🔴 执行初始化
initializeDatabase(); 