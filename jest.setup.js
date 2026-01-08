/**
 * Jest测试环境设置
 * 统一从.env文件加载配置（单一真相源方案 - 2026-01-09更新）
 *
 * 规范说明（docs/Devbox单环境统一配置方案.md）：
 * - .env 是唯一配置真相源，测试环境也必须从 .env 加载
 * - 禁止在此硬编码数据库密码等敏感信息
 * - 测试必须连接真实数据库和Redis（不允许禁用）
 */

// 🔧 2026-01-09：统一从 .env 加载配置（单一真相源）
require('dotenv').config()

// 设置测试环境标识（允许覆盖）
process.env.NODE_ENV = 'test'

// 🔧 仅在 .env 未配置时设置测试专用的JWT密钥（非敏感配置）
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-development-only'

/**
 * 🔧 Redis配置：优先使用 .env 中的 REDIS_URL
 * 如果 .env 中未配置，使用本地默认值（开发环境常见配置）
 */
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// 设置测试超时时间
jest.setTimeout(30000)

// 设置数据库连接参数以避免编码问题
process.env.DB_CHARSET = 'utf8mb4'
process.env.DB_COLLATE = 'utf8mb4_unicode_ci'

// 禁用数据库连接的console.log输出
const originalConsoleLog = console.log
console.log = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Executing (default):')) {
    return // 忽略Sequelize查询日志
  }
  originalConsoleLog.apply(console, args)
}

// 全局清理函数
global.afterAll(async () => {
  // 清理数据库连接
  if (global.sequelize) {
    await global.sequelize.close()
  }
})
