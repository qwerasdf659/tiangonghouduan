/**
 * Jest测试环境设置
 * 测试配置完全显式设置（单一真相源方案）
 *
 * 规范说明（docs/Devbox单环境统一配置方案.md）：
 * - 测试环境不加载dotenv（禁止创建.env.test）
 * - 所有测试需要的环境变量在此显式设置
 * - 测试必须连接Redis（不允许禁用）
 */

// 设置测试环境变量（显式设置，不依赖.env文件）
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret-key-for-development-only'
process.env.DB_HOST = 'test-db-mysql.ns-br0za7uc.svc'
process.env.DB_PORT = '3306'
process.env.DB_USER = 'root'
process.env.DB_PASSWORD = 'mc6r9cgb'
process.env.DB_NAME = 'restaurant_points_dev'

// Redis配置：统一使用REDIS_URL（必须配置，不允许禁用）
process.env.REDIS_URL = 'redis://localhost:6379'
// 不再使用DISABLE_REDIS和REDIS_HOST旧配置

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
