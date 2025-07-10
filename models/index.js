/**
 * 数据库模型索引文件
 * 🔴 前端对接要点：
 * - 确保所有表名和字段符合前端文档要求
 * - 提供初始化数据的方法
 * - 统一的数据库连接和模型管理
 */

const { sequelize } = require('../config/database');

// 🔴 导入所有模型
const User = require('./User');
const LotterySetting = require('./LotterySetting');  // 🔴 使用lottery_prizes表
const CommodityPool = require('./CommodityPool');    // 🔴 使用products表，主键commodity_id
const PhotoReview = require('./PhotoReview');        // 🔴 使用upload_reviews表
const PointsRecord = require('./PointsRecord');
const LotteryPity = require('./LotteryPity');
const LotteryRecord = require('./LotteryRecord');    // 🔴 抽奖记录模型
const ExchangeOrder = require('./ExchangeOrder');    // 🔴 兑换订单模型

// 🔴 定义模型关联关系
function defineAssociations() {
  // 用户和积分记录
  User.hasMany(PointsRecord, { 
    foreignKey: 'user_id',
    as: 'pointsRecords'
  });
  PointsRecord.belongsTo(User, { 
    foreignKey: 'user_id',
    as: 'user'
  });

  // 用户和上传审核
  User.hasMany(PhotoReview, { 
    foreignKey: 'user_id',
    as: 'photoReviews'
  });
  PhotoReview.belongsTo(User, { 
    foreignKey: 'user_id',
    as: 'user'
  });

  // 用户和抽奖保底
  User.hasOne(LotteryPity, { 
    foreignKey: 'user_id',
    as: 'lotteryPity'
  });
  LotteryPity.belongsTo(User, { 
    foreignKey: 'user_id',
    as: 'user'
  });

  // 用户和抽奖记录
  User.hasMany(LotteryRecord, { 
    foreignKey: 'user_id',
    as: 'lotteryRecords'
  });
  LotteryRecord.belongsTo(User, { 
    foreignKey: 'user_id',
    as: 'user'
  });

  // 用户和兑换订单
  User.hasMany(ExchangeOrder, { 
    foreignKey: 'user_id',
    as: 'exchangeOrders'
  });
  ExchangeOrder.belongsTo(User, { 
    foreignKey: 'user_id',
    as: 'user'
  });

  // 商品和兑换订单
  CommodityPool.hasMany(ExchangeOrder, { 
    foreignKey: 'product_id',
    as: 'exchangeOrders'
  });
  ExchangeOrder.belongsTo(CommodityPool, { 
    foreignKey: 'product_id',
    as: 'product'
  });

  console.log('✅ 数据库模型关联关系定义完成');
}

// 🔴 同步数据库模型（遵循工作区规则：不使用force: true）
async function syncModels(options = {}) {
  try {
    const { alter = false, force = false } = options;
    
    // 🔴 遵循工作区规则：生产环境禁止使用alter: true或force: true
    if (process.env.NODE_ENV === 'production' && (alter || force)) {
      throw new Error('❌ 生产环境禁止使用sequelize.sync({ alter: true })或force: true');
    }
    
    console.log('🔄 开始同步数据库模型...');
    
    // 🔴 关联关系已在模块导入时定义，这里不再重复定义
    
    // 🔴 按顺序同步模型，避免外键约束错误
    const syncOptions = { alter, force };
    
    await User.sync(syncOptions);
    console.log('✅ 用户表(users)同步完成');
    
    await LotterySetting.sync(syncOptions);
    console.log('✅ 抽奖配置表(lottery_prizes)同步完成');
    
    await CommodityPool.sync(syncOptions);
    console.log('✅ 商品表(products)同步完成');
    
    await PhotoReview.sync(syncOptions);
    console.log('✅ 上传审核表(upload_reviews)同步完成');
    
    await PointsRecord.sync(syncOptions);
    console.log('✅ 积分记录表同步完成');
    
    await LotteryPity.sync(syncOptions);
    console.log('✅ 抽奖保底表同步完成');
    
    await LotteryRecord.sync(syncOptions);
    console.log('✅ 抽奖记录表(lottery_records)同步完成');
    
    await ExchangeOrder.sync(syncOptions);
    console.log('✅ 兑换订单表(exchange_orders)同步完成');
    
    console.log('🎉 所有数据库模型同步完成！');
    
    return true;
  } catch (error) {
    console.error('❌ 数据库模型同步失败:', error);
    throw error;
  }
}

// 🔴 初始化生产数据（仅初始化必要的系统配置）
async function initializeData() {
  try {
    console.log('🔄 开始初始化生产数据...');
    
    // 🔴 初始化标准转盘配置（0-315度，45度间隔）
    await LotterySetting.initializeStandardConfig();
    
    // 🔴 已清除所有模拟数据 - 仅使用真实商品和用户数据
    console.log('🎉 生产数据初始化完成！');
    
    return true;
  } catch (error) {
    console.error('❌ 生产数据初始化失败:', error);
    throw error;
  }
}

// 🔴 数据库健康检查
async function healthCheck() {
  try {
    // 测试数据库连接
    await sequelize.authenticate();
    
    // 检查关键表是否存在
    const tableNames = ['users', 'lottery_prizes', 'products', 'upload_reviews'];
    const results = {};
    
    for (const tableName of tableNames) {
      try {
        const [results] = await sequelize.query(`SHOW TABLES LIKE '${tableName}'`);
        results[tableName] = results.length > 0;
      } catch (error) {
        results[tableName] = false;
      }
    }
    
    // 检查用户数量
    const userCount = await User.count();
    const lotteryCount = await LotterySetting.count();
    const productCount = await CommodityPool.count();
    
    return {
      status: 'healthy',
      connection: 'ok',
      tables: results,
      data_counts: {
        users: userCount,
        lottery_prizes: lotteryCount,
        products: productCount
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// 🔴 获取数据库统计信息
async function getStatistics() {
  try {
    const stats = {
      users: {
        total: await User.count(),
        active: await User.count({ where: { status: 'active' } }),
        merchants: await User.count({ where: { is_merchant: true } })
      },
      lottery: {
        total_prizes: await LotterySetting.count(),
        active_prizes: await LotterySetting.count({ where: { status: 'active' } })
      },
      products: {
        total: await CommodityPool.count(),
        active: await CommodityPool.count({ where: { status: 'active' } }),
        in_stock: await CommodityPool.count({ 
          where: { 
            status: 'active',
            stock: { [require('sequelize').Op.gt]: 0 }
          }
        })
      },
      reviews: {
        total: await PhotoReview.count(),
        pending: await PhotoReview.count({ where: { review_status: 'pending' } }),
        approved: await PhotoReview.count({ where: { review_status: 'approved' } })
      }
    };
    
    return stats;
  } catch (error) {
    console.error('获取统计信息失败:', error);
    throw error;
  }
}

// 🔴 立即定义关联关系，确保导入时关联关系生效
defineAssociations();

module.exports = {
  sequelize,
  User,
  LotterySetting,     // 🔴 对应lottery_prizes表
  CommodityPool,      // 🔴 对应products表，主键commodity_id
  PhotoReview,        // 🔴 对应upload_reviews表
  PointsRecord,
  LotteryPity,
  LotteryRecord,      // 🔴 抽奖记录模型
  ExchangeOrder,      // 🔴 兑换订单模型
  syncModels,
  initializeData,
  healthCheck,
  getStatistics,
  defineAssociations
}; 