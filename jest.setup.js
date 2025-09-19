/**
 * Jest测试环境设置
 * 确保测试前正确加载环境变量
 */

require('dotenv').config()

// 设置测试环境变量
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret-key-for-development-only'
process.env.DB_HOST = 'test-db-mysql.ns-br0za7uc.svc'
process.env.DB_PORT = '3306'
process.env.DB_USER = 'root'
process.env.DB_PASSWORD = 'mc6r9cgb'
process.env.DB_NAME = 'restaurant_points_dev'

// 🔧 禁用Redis连接（测试环境）
process.env.DISABLE_REDIS = 'true'
process.env.REDIS_HOST = 'disabled'

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
