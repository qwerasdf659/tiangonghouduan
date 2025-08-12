/**
 * 餐厅积分抽奖系统 v2.0 - 数据库模型索引文件
 * 全新多业务线分层存储架构
 *
 * 🚀 完全重构，放弃旧架构，直接实施新技术栈
 */

const { Sequelize } = require('sequelize')

// 🔴 载入环境变量配置
require('dotenv').config()

// 数据库连接配置 (使用.env文件配置)
const sequelize = new Sequelize(
  process.env.DB_NAME || 'restaurant_points_dev',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || 'mc6r9cgb',
  {
    host: process.env.DB_HOST || 'dbconn.sealosbja.site',
    port: parseInt(process.env.DB_PORT) || 42182,
    dialect: 'mysql',
    logging: process.env.NODE_ENV !== 'production' ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      freezeTableName: true,
      underscored: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    },
    timezone: '+08:00'
  }
)

console.log(
  `🔗 数据库连接配置: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
)

// 🔴 导入所有模型 (v2.0架构 + 新增核心业务模型)
const ImageResources = require('./ImageResources')(sequelize)
const BusinessConfigs = require('./BusinessConfigs')(sequelize)
const User = require('./User')(sequelize)
const Prize = require('./Prize')(sequelize)
const LotteryRecord = require('./LotteryRecord')(sequelize)
const PointsRecord = require('./PointsRecord')(sequelize)
const Product = require('./Product')(sequelize)
const ExchangeRecord = require('./ExchangeRecord')(sequelize)
const PremiumSpaceAccess = require('./PremiumSpaceAccess')(sequelize)
const TradeRecord = require('./TradeRecord')(sequelize)
// 🔴 新增模型 - 为孤立表创建对应模型
const LotteryPity = require('./LotteryPity')(sequelize)
const UploadReview = require('./UploadReview')(sequelize)
// 🔴 用户库存模型 - 管理用户获得的奖品和商品
const UserInventory = require('./UserInventory')(sequelize)
// 🔴 聊天客服系统模型
const CustomerSession = require('./CustomerSession')(sequelize)
const ChatMessage = require('./ChatMessage')(sequelize)
const AdminStatus = require('./AdminStatus')(sequelize)
const QuickReply = require('./QuickReply')(sequelize)

// 🔴 定义完整的模型关联关系
function defineAssociations () {
  console.log('🔄 开始定义数据库模型关联关系...')

  // 用户关联关系
  User.hasMany(ImageResources, {
    foreignKey: 'user_id',
    as: 'uploadedImages'
  })

  User.hasMany(LotteryRecord, {
    foreignKey: 'user_id',
    as: 'lotteryRecords'
  })

  User.hasMany(PointsRecord, {
    foreignKey: 'user_id',
    as: 'pointsRecords'
  })

  // ImageResources 关联关系
  ImageResources.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
  })

  // Prize 关联关系
  Prize.belongsTo(ImageResources, {
    foreignKey: 'primary_image_id',
    as: 'primaryImage'
  })

  Prize.hasMany(LotteryRecord, {
    foreignKey: 'prize_id',
    as: 'lotteryRecords'
  })

  // LotteryRecord 关联关系
  LotteryRecord.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
  })

  LotteryRecord.belongsTo(Prize, {
    foreignKey: 'prize_id',
    as: 'prize'
  })

  // PointsRecord 关联关系
  PointsRecord.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
  })

  PointsRecord.belongsTo(User, {
    foreignKey: 'admin_id',
    as: 'admin'
  })

  // Product 关联关系
  Product.belongsTo(User, {
    foreignKey: 'created_by',
    as: 'creator'
  })

  Product.hasMany(ExchangeRecord, {
    foreignKey: 'product_id',
    targetKey: 'commodity_id', // 指定Product的主键字段
    as: 'exchangeRecords'
  })

  // ExchangeRecord 关联关系
  ExchangeRecord.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
  })

  ExchangeRecord.belongsTo(Product, {
    foreignKey: 'product_id',
    targetKey: 'commodity_id', // 指定Product的主键字段
    as: 'product'
  })

  // 🔴 新增模型关联关系
  // LotteryPity 关联关系
  LotteryPity.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
  })

  LotteryPity.belongsTo(Prize, {
    foreignKey: 'pity_prize_id',
    as: 'pityPrize'
  })

  // UploadReview 关联关系
  UploadReview.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
  })

  UploadReview.belongsTo(User, {
    foreignKey: 'reviewer_id',
    as: 'reviewer'
  })

  UploadReview.belongsTo(ImageResources, {
    foreignKey: 'image_id',
    as: 'image'
  })

  // 添加到User的关联
  User.hasMany(LotteryPity, {
    foreignKey: 'user_id',
    as: 'lotteryPities'
  })

  User.hasMany(UploadReview, {
    foreignKey: 'user_id',
    as: 'uploadReviews'
  })

  User.hasMany(UploadReview, {
    foreignKey: 'reviewer_id',
    as: 'reviewedUploads'
  })

  // 添加到ImageResources的关联
  ImageResources.hasMany(UploadReview, {
    foreignKey: 'image_id',
    as: 'reviews'
  })

  // PremiumSpaceAccess 关联关系
  PremiumSpaceAccess.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
  })

  User.hasOne(PremiumSpaceAccess, {
    foreignKey: 'user_id',
    as: 'premiumAccess'
  })

  User.hasMany(ExchangeRecord, {
    foreignKey: 'user_id',
    as: 'exchangeRecords'
  })

  // TradeRecord 关联关系
  TradeRecord.belongsTo(User, {
    foreignKey: 'from_user_id',
    as: 'fromUser'
  })

  TradeRecord.belongsTo(User, {
    foreignKey: 'to_user_id',
    as: 'toUser'
  })

  TradeRecord.belongsTo(User, {
    foreignKey: 'operator_id',
    as: 'operator'
  })

  User.hasMany(TradeRecord, {
    foreignKey: 'from_user_id',
    as: 'sentTrades'
  })

  User.hasMany(TradeRecord, {
    foreignKey: 'to_user_id',
    as: 'receivedTrades'
  })

  // UserInventory 关联关系
  UserInventory.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
  })

  UserInventory.belongsTo(User, {
    foreignKey: 'transfer_to_user_id',
    as: 'transferTarget'
  })

  User.hasMany(UserInventory, {
    foreignKey: 'user_id',
    as: 'inventory'
  })

  // 🔴 聊天客服系统关联关系
  // 用户与聊天会话的关系
  User.hasMany(CustomerSession, {
    foreignKey: 'user_id',
    as: 'customerSessions'
  })

  User.hasMany(CustomerSession, {
    foreignKey: 'admin_id',
    as: 'adminSessions'
  })

  // 用户与聊天消息的关系
  User.hasMany(ChatMessage, {
    foreignKey: 'sender_id',
    as: 'sentMessages'
  })

  // 用户与管理员状态的关系
  User.hasOne(AdminStatus, {
    foreignKey: 'admin_id',
    as: 'adminStatus'
  })

  // 用户与快速回复模板的关系
  User.hasMany(QuickReply, {
    foreignKey: 'admin_id',
    as: 'quickReplies'
  })

  // 聊天会话关联关系
  CustomerSession.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
  })

  CustomerSession.belongsTo(User, {
    foreignKey: 'admin_id',
    as: 'admin'
  })

  CustomerSession.hasMany(ChatMessage, {
    foreignKey: 'session_id',
    sourceKey: 'session_id',
    as: 'messages'
  })

  // 聊天消息关联关系
  ChatMessage.belongsTo(User, {
    foreignKey: 'sender_id',
    as: 'sender'
  })

  ChatMessage.belongsTo(CustomerSession, {
    foreignKey: 'session_id',
    targetKey: 'session_id',
    as: 'session'
  })

  // 管理员状态关联关系
  AdminStatus.belongsTo(User, {
    foreignKey: 'admin_id',
    as: 'admin'
  })

  // 快速回复模板关联关系
  QuickReply.belongsTo(User, {
    foreignKey: 'admin_id',
    as: 'admin'
  })

  console.log('✅ 数据库模型关联关系定义完成 (v2.0 架构 + 核心业务模型 + 聊天客服系统)')
}

// 🔴 数据库管理函数 (v2.0架构支持)
async function testConnection () {
  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接测试成功')
    return true
  } catch (error) {
    console.error('❌ 数据库连接测试失败:', error.message)
    return false
  }
}

async function syncModels (force = false) {
  console.log('🔄 开始同步数据库模型...')
  await sequelize.sync({ force, alter: !force })
  console.log('✅ 数据库模型同步完成')
}

async function _initializeDatabase () {
  try {
    console.log('🔄 开始数据库初始化...')
    await testConnection()
    await syncModels()
    console.log('✅ 数据库初始化完成')
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error.message)
    throw error
  }
}

// 🔴 初始化业务配置数据
async function _initializeBusinessConfigs () {
  try {
    console.log('🔄 初始化业务配置数据...')

    // 检查配置是否已存在
    const configCount = await BusinessConfigs.count()
    if (configCount > 0) {
      console.log('✅ 业务配置已存在，跳过初始化')
      return
    }

    // 创建默认业务配置
    await BusinessConfigs.initializeDefaultConfigs()
    console.log('✅ 业务配置初始化完成')
  } catch (error) {
    console.error('❌ 业务配置初始化失败:', error.message)
    throw error
  }
}

async function _closeDatabase () {
  try {
    await sequelize.close()
    console.log('✅ 数据库连接已关闭')
  } catch (error) {
    console.error('❌ 关闭数据库连接失败:', error.message)
  }
}

// 🔴 立即定义关联关系
defineAssociations()

// 🔴 导出完整的模型和工具函数
module.exports = {
  sequelize,
  User,
  Prize,
  LotteryRecord,
  PointsRecord,
  Product,
  ExchangeRecord,
  PremiumSpaceAccess,
  ImageResources,
  BusinessConfigs,
  LotteryPity,
  TradeRecord,
  UploadReview,
  UserInventory,
  // 聊天客服系统模型
  CustomerSession,
  ChatMessage,
  AdminStatus,
  QuickReply
}
