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

console.log(`🔗 数据库连接配置: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`)

// 🔴 导入所有模型 (v2.0架构 + 新增核心业务模型)
const ImageResources = require('./ImageResources')(sequelize)
const BusinessConfigs = require('./BusinessConfigs')(sequelize)
const User = require('./User')(sequelize)
const Prize = require('./Prize')(sequelize)
const LotteryRecord = require('./LotteryRecord')(sequelize)
const PointsRecord = require('./PointsRecord')(sequelize)

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

  console.log('✅ 数据库模型关联关系定义完成 (v2.0 架构 + 核心业务模型)')
}

// 🔴 数据库连接测试
async function testConnection () {
  try {
    console.log('🔄 测试数据库连接...')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')
    return true
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message)
    return false
  }
}

// 🔴 同步数据库模型 (新架构)
async function syncModels (options = {}) {
  try {
    const { alter = false, force = false } = options

    // 🔴 生产环境安全检查
    if (process.env.NODE_ENV === 'production' && (alter || force)) {
      throw new Error('❌ 生产环境禁止使用危险的同步选项')
    }

    console.log('🔄 开始同步数据库模型 (v2.0 架构 + 核心业务模型)...')

    // 定义关联关系
    defineAssociations()

    // 同步模型到数据库
    await sequelize.sync({ alter, force })

    console.log('✅ 数据库模型同步完成')
    return true
  } catch (error) {
    console.error('❌ 数据库模型同步失败:', error.message)
    throw error
  }
}

// 🔴 初始化业务配置数据
async function initializeBusinessConfigs () {
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

// 🔴 数据库初始化主函数
async function initializeDatabase (options = {}) {
  try {
    console.log('🚀 开始初始化数据库 (v2.0 架构 + 核心业务模型)...')

    // 1. 测试连接
    const connected = await testConnection()
    if (!connected) {
      throw new Error('数据库连接失败')
    }

    // 2. 同步模型
    await syncModels(options)

    // 3. 初始化配置数据
    await initializeBusinessConfigs()

    console.log('🎉 数据库初始化完成！')
    return true
  } catch (error) {
    console.error('💥 数据库初始化失败:', error.message)
    throw error
  }
}

// 🔴 优雅关闭数据库连接
async function closeDatabase () {
  try {
    await sequelize.close()
    console.log('🔌 数据库连接已关闭')
  } catch (error) {
    console.error('❌ 关闭数据库连接失败:', error.message)
  }
}

// 🔴 导出完整的模型和工具函数
module.exports = {
  sequelize,

  // v2.0架构模型
  ImageResources,
  BusinessConfigs,

  // 新增核心业务模型
  User,
  Prize,
  LotteryRecord,
  PointsRecord,

  // 工具函数
  testConnection,
  syncModels,
  initializeDatabase,
  closeDatabase,
  defineAssociations,

  // 向后兼容 (完整模型集合)
  models: {
    ImageResources,
    BusinessConfigs,
    User,
    Prize,
    LotteryRecord,
    PointsRecord
  }
} 