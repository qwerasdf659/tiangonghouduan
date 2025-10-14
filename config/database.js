/**
 * 餐厅积分抽奖系统 - 统一数据库配置
 * 🔴 统一配置架构 - 完全从环境变量读取，消除硬编码
 * 🕐 时区设置：全系统统一使用北京时间 (UTC+8)
 *
 * 配置统一架构：
 * .env (主配置源) → config/database.js (读取.env) → 应用使用
 * 更新时间：2025年09月29日 北京时间
 */

const { Sequelize } = require('sequelize')
require('dotenv').config()

// ⚡ 慢查询监控配置（2025年01月21日新增）
const SLOW_QUERY_THRESHOLD = 1000 // 1秒阈值
const slowQueryLogger = (sql, timing) => {
  if (timing >= SLOW_QUERY_THRESHOLD) {
    console.warn('🐌 慢查询检测:', {
      sql: sql.substring(0, 200), // 只记录前200字符
      timing: `${timing}ms`,
      threshold: `${SLOW_QUERY_THRESHOLD}ms`,
      timestamp: new Date().toISOString()
    })
  }
}

// 🔴 从环境变量读取所有数据库配置 - 零硬编码
const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  dialect: 'mysql',
  timezone: '+08:00', // 全系统统一使用北京时间
  // ⚡ 使用慢查询监控日志（2025年01月21日优化）
  logging:
    process.env.NODE_ENV === 'development'
      ? (sql, timing) => {
        // 开发环境：记录所有查询和慢查询
        console.log(sql)
        if (timing) slowQueryLogger(sql, timing)
      }
      : (sql, timing) => {
        // 生产环境：只记录慢查询
        if (timing) slowQueryLogger(sql, timing)
      },
  benchmark: true, // ⚡ 启用查询时间记录（必需）
  pool: {
    max: 40, // ⭐ 最大连接数（优化：从50降到40）- 支持多实例部署
    min: 5, // ✅ 最小连接数 - 避免冷启动延迟
    acquire: 30000, // ✅ 获取连接超时30秒 - 外网数据库需要更长时间
    idle: 180000, // ⭐ 空闲连接3分钟（优化：从5分钟改为3分钟）- 平衡性能和资源
    evict: 60000, // ✅ 连接池清理间隔1分钟
    handleDisconnects: true // ✅ 自动处理连接断开
  },
  define: {
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: true,
    underscored: true, // ✅ 修复：统一使用snake_case命名 (created_at, updated_at)
    freezeTableName: true
  },
  dialectOptions: {
    charset: 'utf8mb4',
    // 移除collation配置 - MySQL2不支持此选项，会产生警告
    // collation通过charset自动设置为utf8mb4_unicode_ci
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
    typeCast: true,
    connectTimeout: 30000 // ✅ MySQL连接超时30秒 - 外网数据库连接优化
  }
}

// 🔴 配置验证 - 确保所有必需的环境变量都存在
function validateDatabaseConfig () {
  const requiredVars = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
  const missingVars = requiredVars.filter(varName => !process.env[varName])

  if (missingVars.length > 0) {
    throw new Error(`缺少必需的环境变量: ${missingVars.join(', ')}`)
  }

  // 验证端口号是否为有效数字
  if (isNaN(parseInt(process.env.DB_PORT))) {
    throw new Error('DB_PORT 必须是有效的数字')
  }
}

// 执行配置验证
validateDatabaseConfig()

// 🔴 所有环境使用相同配置 - 统一架构
const unifiedConfig = {
  development: { ...dbConfig },
  production: { ...dbConfig },
  test: {
    ...dbConfig,
    logging: false // 测试时关闭日志输出
  }
}

const env = process.env.NODE_ENV || 'development'
const config = unifiedConfig[env]

console.log(`🔗 统一数据库配置: ${config.host}:${config.port}/${config.database} (环境: ${env})`)

// 创建Sequelize实例
const sequelize = new Sequelize(config.database, config.username, config.password, config)

// 🔴 数据库连接测试函数
async function testConnection () {
  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功:', config.host + ':' + config.port + '/' + config.database)
    return true
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message)
    return false
  }
}

// 🔴 数据库同步函数
async function syncDatabase (force = false) {
  try {
    console.log('开始同步数据库...')
    await sequelize.sync({ force, alter: !force })
    console.log('✅ 数据库同步完成')
    return true
  } catch (error) {
    console.error('❌ 数据库同步失败:', error.message)
    return false
  }
}

module.exports = {
  sequelize,
  testConnection,
  syncDatabase,
  config,
  // 🔴 导出统一配置供其他工具使用
  unifiedConfig,
  // Sequelize CLI配置导出
  development: unifiedConfig.development,
  production: unifiedConfig.production,
  test: unifiedConfig.test
}
