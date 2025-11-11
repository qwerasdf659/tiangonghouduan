/**
 * 测试认证辅助工具
 *
 * 功能：
 * - 生成测试用JWT Token
 * - 模拟认证中间件行为
 *
 * 使用模型：Claude Sonnet 4.5
 * 创建时间：2025-11-08
 */

const jwt = require('jsonwebtoken')

/**
 * 生成测试用JWT Token
 * @param {number} userId - 用户ID
 * @param {string} role - 用户角色 ('admin' | 'user')
 * @param {Object} additionalPayload - 额外的payload数据
 * @returns {string} JWT Token
 */
function generateTestToken (userId, role = 'user', additionalPayload = {}) {
  const payload = {
    user_id: userId,
    role,
    mobile: '13612227930', // 测试账号
    ...additionalPayload
  }

  // 使用与实际应用相同的JWT_SECRET
  const secret = process.env.JWT_SECRET || 'restaurant_lottery_secret_key_2024'

  return jwt.sign(payload, secret, {
    expiresIn: '24h' // 测试token有效期24小时
  })
}

/**
 * 生成管理员测试Token
 * @param {number} userId - 用户ID
 * @returns {string} JWT Token
 */
function generateAdminToken (userId) {
  return generateTestToken(userId, 'admin')
}

/**
 * 生成普通用户测试Token
 * @param {number} userId - 用户ID
 * @returns {string} JWT Token
 */
function generateUserToken (userId) {
  return generateTestToken(userId, 'user')
}

module.exports = {
  generateTestToken,
  generateAdminToken,
  generateUserToken
}
