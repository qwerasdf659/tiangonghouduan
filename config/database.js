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
/*
 * 注意：dotenv只在app.js中加载一次（单一真相源方案）
 * 参考：docs/Devbox单环境统一配置方案.md
 */

// ⚡ 慢查询监控配置（2025年01月21日新增）
const SLOW_QUERY_THRESHOLD = 1000 // 1秒阈值

/*
 * 🔴 集成数据库性能监控模块（2025-11-09新增）
 * 用于统计慢查询频率，支持性能监控和告警
 */
let performanceMonitor = null
try {
  const { monitor } = require('../scripts/maintenance/database-performance-monitor')
  performanceMonitor = monitor
} catch (error) {
  // 如果监控模块加载失败，不影响数据库正常运行
  console.warn('⚠️ 数据库性能监控模块加载失败，慢查询统计功能不可用:', error.message)
}

const slowQueryLogger = (sql, timing) => {
  if (timing >= SLOW_QUERY_THRESHOLD) {
    console.warn('🐌 慢查询检测:', {
      sql: sql.substring(0, 200), // 只记录前200字符
      timing: `${timing}ms`,
      threshold: `${SLOW_QUERY_THRESHOLD}ms`,
      timestamp: new Date().toISOString()
    })

    /*
     * 🔴 记录慢查询到性能监控系统（2025-11-09新增）
     * 用于统计慢查询频率，判断是否需要优化
     */
    if (performanceMonitor) {
      try {
        performanceMonitor.recordSlowQuery(sql, timing)
      } catch (error) {
        // 监控记录失败不影响业务逻辑
        console.warn('⚠️ 慢查询统计记录失败:', error.message)
      }
    }
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
    max: 40, // ✅ 最大连接数 - 单实例场景合理，长期固定40（2025-12-30 已拍板）
    min: 5, // ✅ 最小连接数 - 避免冷启动延迟
    acquire: 10000, // ✅ 获取连接超时10秒（P0核心优化：从30s降到10s，改善用户体验，降低雪崩风险）
    idle: 60000, // ✅ 空闲连接1分钟（P1优化：从3分钟降到1分钟，更激进回收，支持多实例扩展）
    evict: 30000, // ✅ 连接池清理间隔30秒（P1优化：从1分钟降到30秒，更及时清理）
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
    /*
     * 移除collation配置 - MySQL2不支持此选项，会产生警告
     * collation通过charset自动设置为utf8mb4_unicode_ci
     */
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
    typeCast: true,
    connectTimeout: 10000 // ✅ MySQL连接超时10秒（P2优化：从30s降到10s，与acquire对齐）
  }
}

// 🔴 配置验证 - 确保所有必需的环境变量都存在
/**
 * 验证数据库配置的完整性
 *
 * 业务场景：
 * - 应用启动时验证环境变量配置是否完整
 * - 防止因缺少配置导致数据库连接失败
 * - 验证配置格式的正确性（如端口号必须是数字）
 *
 * 验证项：
 * - 必需环境变量：DB_HOST、DB_PORT、DB_USER、DB_PASSWORD、DB_NAME
 * - 端口号格式：必须是有效的数字
 *
 * @throws {Error} 当缺少必需环境变量时抛出错误
 * @throws {Error} 当端口号格式无效时抛出错误
 * @returns {void} 验证成功无返回值，验证失败抛出错误
 *
 * @example
 * // 在应用启动时自动执行
 * validateDatabaseConfig()
 * // 成功则继续，失败则抛出错误阻止启动
 */
function validateDatabaseConfig() {
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

/*
 * 注意：validateDatabaseConfig() 不再在模块顶层执行
 * 改为在 testConnection() 内部调用，避免脚本/测试被误伤
 * 参考：docs/Devbox单环境统一配置方案.md - 问题F
 */

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

/*
 * 注意：移除顶层 console.log 打印连接信息（避免敏感信息泄露到日志）
 * 连接信息在 testConnection() 成功后打印（且会脱敏）
 * 参考：docs/Devbox单环境统一配置方案.md - 问题F
 */

// 创建Sequelize实例
const sequelize = new Sequelize(config.database, config.username, config.password, config)

// 🔴 数据库连接测试函数
/**
 * 测试数据库连接是否可用
 *
 * 业务场景：
 * - 应用启动时验证数据库连接
 * - 健康检查接口中验证数据库状态
 * - 部署后验证数据库配置是否正确
 *
 * 功能说明：
 * - 使用Sequelize的authenticate()方法测试连接
 * - 成功：输出连接信息，返回true
 * - 失败：输出错误信息，返回false（不抛出异常）
 *
 * 连接信息包括：
 * - 数据库主机：config.host
 * - 端口号：config.port
 * - 数据库名：config.database
 *
 * @async
 * @returns {Promise<boolean>} 连接成功返回true，失败返回false
 *
 * @example
 * const isConnected = await testConnection()
 * if (!isConnected) {
 *   console.error('数据库连接失败，请检查配置')
 *   process.exit(1)
 * }
 */
async function testConnection() {
  try {
    /*
     * 在测试连接前先验证配置完整性（fail-fast）
     * 这样 app.js 启动时调用 testConnection() 可以在连接前发现配置问题
     */
    validateDatabaseConfig()

    await sequelize.authenticate()
    // 脱敏输出：只显示 host:port/database，不显示完整连接信息
    console.log('✅ 数据库连接成功:', config.host + ':' + config.port + '/' + config.database)
    return true
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message)
    return false
  }
}

// 🔴 数据库同步函数
/**
 * 同步数据库结构（仅用于开发环境调试）
 *
 * ⚠️ 重要警告：
 * - 生产环境禁止使用此方法，必须使用Sequelize迁移（migrations）
 * - force=true会删除所有表和数据，仅用于开发环境初始化
 * - 此方法不应在生产代码中调用，仅用于开发调试
 *
 * 业务场景：
 * - 开发环境快速初始化数据库结构
 * - 测试环境重置数据库
 * - 本地开发模型结构快速同步（不推荐，应使用迁移）
 *
 * 同步模式：
 * - force=true：删除现有表后重建（DROP TABLE + CREATE TABLE）
 * - force=false：仅修改表结构，保留数据（ALTER TABLE）
 *
 * 生产环境规范：
 * - 使用npm run migration:create创建迁移文件
 * - 使用npm run migrate执行迁移
 * - 使用npm run migrate:undo回滚迁移
 * - 参考：verify-migrations.js迁移验证规范
 *
 * @async
 * @param {boolean} [force=false] - 是否强制同步（删除表后重建）
 * @returns {Promise<boolean>} 同步成功返回true，失败返回false
 *
 * @example
 * // 开发环境：修改表结构（保留数据）
 * await syncDatabase(false)
 *
 * // 开发环境：重建所有表（删除数据）- 谨慎使用
 * await syncDatabase(true)
 *
 * // ❌ 禁止：生产环境使用此方法
 * // ✅ 正确：使用迁移 npm run migrate
 */
async function syncDatabase(force = false) {
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
  Sequelize, // 导出 Sequelize 类供 TransactionManager 等使用
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
