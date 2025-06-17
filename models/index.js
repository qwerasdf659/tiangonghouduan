/**
 * 数据库模型索引文件
 * 🔴 设置所有模型的关联关系，确保前后端数据一致性
 */

const { sequelize } = require('../config/database');

// 导入所有模型
const User = require('./User');
const PointsRecord = require('./PointsRecord');
const LotterySetting = require('./LotterySetting');
const CommodityPool = require('./CommodityPool');
const PhotoReview = require('./PhotoReview');

// 🔴 设置模型关联关系 - 确保外键约束
// 用户与积分记录的关联
User.hasMany(PointsRecord, {
  foreignKey: 'user_id',
  as: 'pointsRecords',
  onDelete: 'CASCADE'
});
PointsRecord.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

// 用户与拍照审核的关联
User.hasMany(PhotoReview, {
  foreignKey: 'user_id',
  as: 'photoReviews',
  onDelete: 'CASCADE'
});
PhotoReview.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

// 审核员与拍照审核的关联
User.hasMany(PhotoReview, {
  foreignKey: 'reviewer_id',
  as: 'reviewedPhotos',
  onDelete: 'SET NULL'
});
PhotoReview.belongsTo(User, {
  foreignKey: 'reviewer_id',
  as: 'reviewer'
});

// 导出所有模型
const models = {
  User,
  PointsRecord,
  LotterySetting,
  CommodityPool,
  PhotoReview,
  sequelize
};

// 🔴 同步数据库函数 - 开发对接时使用
async function syncModels(force = false) {
  try {
    console.log('开始同步数据库模型...');
    
    if (force) {
      console.log('⚠️ 强制同步模式：将删除现有表');
    }
    
    await sequelize.sync({ force, alter: !force });
    console.log('✅ 数据库模型同步完成');
    
    // 如果是强制同步，初始化基础数据
    if (force) {
      await initializeData();
    }
    
    return true;
  } catch (error) {
    console.error('❌ 数据库模型同步失败:', error);
    throw error;
  }
}

// 🔴 初始化基础数据 - 根据数据库开发文档
async function initializeData() {
  try {
    console.log('开始初始化基础数据...');
    
    // 初始化抽奖转盘配置（8个奖品）
    await LotterySetting.bulkCreate([
      {
        prize_name: '八八折券',
        prize_type: 'coupon',
        prize_value: 88.00,
        angle: 0,
        color: '#FF6B6B',
        probability: 0.05,
        is_activity: true,
        cost_points: 100
      },
      {
        prize_name: '50积分',
        prize_type: 'points',
        prize_value: 50.00,
        angle: 45,
        color: '#4ECDC4',
        probability: 0.20,
        is_activity: false,
        cost_points: 100
      },
      {
        prize_name: '九九折券',
        prize_type: 'coupon',
        prize_value: 99.00,
        angle: 90,
        color: '#45B7D1',
        probability: 0.10,
        is_activity: false,
        cost_points: 100
      },
      {
        prize_name: '100积分',
        prize_type: 'points',
        prize_value: 100.00,
        angle: 135,
        color: '#96CEB4',
        probability: 0.15,
        is_activity: false,
        cost_points: 100
      },
      {
        prize_name: '免费咖啡',
        prize_type: 'physical',
        prize_value: 25.00,
        angle: 180,
        color: '#FFEAA7',
        probability: 0.08,
        is_activity: true,
        cost_points: 100
      },
      {
        prize_name: '30积分',
        prize_type: 'points',
        prize_value: 30.00,
        angle: 225,
        color: '#DDA0DD',
        probability: 0.25,
        is_activity: false,
        cost_points: 100
      },
      {
        prize_name: '神秘大奖',
        prize_type: 'physical',
        prize_value: 500.00,
        angle: 270,
        color: '#FF7675',
        probability: 0.02,
        is_activity: true,
        cost_points: 100
      },
      {
        prize_name: '谢谢参与',
        prize_type: 'empty',
        prize_value: 0.00,
        angle: 315,
        color: '#74B9FF',
        probability: 0.15,
        is_activity: false,
        cost_points: 100
      }
    ]);
    
    // 初始化商品库存（部分示例数据）
    await CommodityPool.bulkCreate([
      {
        name: '星巴克拿铁',
        description: '经典拿铁咖啡，香醇浓郁',
        category: '饮品',
        exchange_points: 800,
        stock: 50,
        image: '/images/starbucks-latte.jpg',
        is_hot: true,
        sort_order: 1,
        rating: 4.8,
        sales_count: 156
      },
      {
        name: '喜茶芝芝莓莓',
        description: '新鲜草莓与芝士的完美结合',
        category: '饮品',
        exchange_points: 600,
        stock: 30,
        image: '/images/heytea-berry.jpg',
        is_hot: true,
        sort_order: 2,
        rating: 4.9,
        sales_count: 203
      },
      {
        name: '肯德基全家桶',
        description: '8块原味鸡+薯条+汽水',
        category: '美食',
        exchange_points: 1500,
        stock: 20,
        image: '/images/kfc-bucket.jpg',
        is_hot: true,
        sort_order: 4,
        rating: 4.6,
        sales_count: 78
      },
      {
        name: '三只松鼠坚果',
        description: '每日坚果混合装',
        category: '零食',
        exchange_points: 300,
        stock: 100,
        image: '/images/squirrel-nuts.jpg',
        is_hot: false,
        sort_order: 7,
        rating: 4.4,
        sales_count: 312
      }
    ]);
    
    console.log('✅ 基础数据初始化完成');
  } catch (error) {
    console.error('❌ 基础数据初始化失败:', error);
    throw error;
  }
}

// 🔴 数据库健康检查 - 运维监控使用
async function healthCheck() {
  try {
    await sequelize.authenticate();
    
    // 检查核心表是否存在
    const tables = await sequelize.getQueryInterface().showAllTables();
    const requiredTables = ['users', 'points_records', 'lottery_settings', 'commodity_pool', 'photo_reviews'];
    
    const missingTables = requiredTables.filter(table => !tables.includes(table));
    
    if (missingTables.length > 0) {
      throw new Error(`缺少必要的数据表: ${missingTables.join(', ')}`);
    }
    
    return {
      status: 'healthy',
      database: 'connected',
      tables: tables.length,
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

module.exports = {
  ...models,
  syncModels,
  initializeData,
  healthCheck
}; 