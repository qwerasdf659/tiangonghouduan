/**
 * 🔐 认证测试辅助函数
 *
 * 创建时间: 2025年11月14日 北京时间
 * 用途: 统一管理测试环境的用户认证逻辑,避免重复编写登录代码
 *
 * 业务背景:
 * - 测试环境使用万能验证码 123456
 * - 所有测试共用测试用户 mobile: 13612227910
 * - 🔴 P0-1修复：user_id 从数据库动态获取，不再硬编码
 * - 需要真实的JWT token进行API测试
 *
 * 使用方式:
 * ```javascript
 * const { getTestUserToken, loginAsAdmin } = require('../../helpers/auth-helper')
 *
 * beforeAll(async () => {
 *   authToken = await getTestUserToken(app)
 * })
 * ```
 */

const request = require('supertest')
const { TEST_DATA, TEST_ACCOUNTS } = require('./test-data')

/**
 * 获取测试用户的认证Token
 *
 * @param {Object} app - Express应用实例
 * @param {string} mobile - 用户手机号 (默认使用测试用户)
 * @param {string} code - 验证码 (默认123456)
 * @returns {Promise<string>} JWT认证Token
 *
 * @example
 * const token = await getTestUserToken(app)
 * // 返回: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 */
async function getTestUserToken(app, mobile = TEST_DATA.users.testUser.mobile, code = '123456') {
  // 1. 发送登录请求
  const response = await request(app)
    .post('/api/v4/auth/login')
    .send({ mobile, verification_code: code }) // 修复：使用verification_code参数名

  // 2. 验证登录结果
  if (!response.body.success) {
    throw new Error(
      `❌ 登录失败: ${response.body.message || '未知错误'}\n` +
        `手机号: ${mobile}\n` +
        `响应状态: ${response.status}\n` +
        `完整响应: ${JSON.stringify(response.body, null, 2)}`
    )
  }

  // 3. 提取并验证token（后端返回access_token）
  const token = response.body.data?.token || response.body.data?.access_token
  if (!token) {
    throw new Error(
      '❌ 登录成功但未返回token\n' + `响应数据: ${JSON.stringify(response.body.data, null, 2)}`
    )
  }

  console.log(`✅ 获取认证Token成功: ${mobile}`)
  return token
}

/**
 * 以管理员身份登录（supertest 风格）
 *
 * 2026-06-14 修正：管理员账号从角色契约表 TEST_ACCOUNTS.admin 取（13612227910，role_level>=100），
 * 不再依赖各文件硬编码。历史上曾误用 13612227910（regional_manager:80）导致 403。
 *
 * @param {Object} app - Express应用实例
 * @returns {Promise<string>} 管理员JWT认证Token
 *
 * @example
 * const adminToken = await loginAsAdmin(app)
 */
async function loginAsAdmin(app) {
  const token = await getTestUserToken(app, TEST_ACCOUNTS.admin.mobile, '123456')

  console.log('✅ 管理员登录成功')
  return token
}

/**
 * 🔐 按角色语义登录（supertest 风格，推荐统一入口）
 *
 * 所有测试统一通过本方法登录，只声明角色，不关心具体手机号。
 * 换账号只需改 tests/helpers/test-data.js 的 TEST_ACCOUNTS 契约表。
 *
 * @param {Object} app - Express应用实例
 * @param {('admin'|'regional_manager'|'user')} role - 角色语义键
 * @returns {Promise<string>} 对应角色的 JWT Token
 *
 * @example
 * const adminToken = await loginAs(app, 'admin')           // 管理员（role_level>=100）
 * const userToken = await loginAs(app, 'user')             // 普通用户
 */
async function loginAs(app, role) {
  const account = TEST_ACCOUNTS[role]
  if (!account) {
    throw new Error(
      `❌ 未知角色: ${role}。可用角色: ${Object.keys(TEST_ACCOUNTS).join(', ')}\n` +
        '请在 tests/helpers/test-data.js 的 TEST_ACCOUNTS 契约表中定义该角色'
    )
  }
  return getTestUserToken(app, account.mobile, '123456')
}

/**
 * 🔐 按角色语义登录（fetch 风格，供直连 PM2 实时服务的页面 API 测试使用）
 *
 * 背景：少数页面 API 测试用 fetch 打 http://localhost:3000（依赖 PM2 实时服务），
 * 而非 in-process supertest。这类测试无法传入 app 实例，故提供独立的 fetch 版登录。
 *
 * @param {('admin'|'regional_manager'|'user')} role - 角色语义键
 * @param {string} [apiBase] - API 基地址，默认取 process.env.API_BASE_URL 或 http://localhost:3000
 * @returns {Promise<string>} 对应角色的 access_token
 *
 * @example
 * accessToken = await loginAsViaFetch('admin')
 */
async function loginAsViaFetch(role, apiBase) {
  const account = TEST_ACCOUNTS[role]
  if (!account) {
    throw new Error(`❌ 未知角色: ${role}。可用角色: ${Object.keys(TEST_ACCOUNTS).join(', ')}`)
  }
  const base = apiBase || process.env.API_BASE_URL || 'http://localhost:3000'
  const response = await fetch(`${base}/api/v4/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile: account.mobile, verification_code: '123456' })
  })
  const data = await response.json()
  if (!data.success) {
    throw new Error(
      `❌ fetch 登录失败 (role=${role}, mobile=${account.mobile}): ` +
        `${data.message || '未知错误'} [HTTP ${response.status}]`
    )
  }
  const token = data.data?.access_token || data.data?.token
  if (!token) {
    throw new Error(`❌ fetch 登录成功但未返回 token (role=${role})`)
  }
  return token
}

/**
 * 验证Token是否有效
 *
 * @param {Object} app - Express应用实例
 * @param {string} token - JWT Token
 * @returns {Promise<boolean>} Token是否有效
 *
 * @example
 * const isValid = await verifyToken(app, token)
 * if (!isValid) throw new Error('Token已失效')
 */
async function verifyToken(app, token) {
  try {
    const response = await request(app)
      .get('/api/v4/user/profile')
      .set('Authorization', `Bearer ${token}`)

    return response.status === 200 && response.body.success === true
  } catch (error) {
    console.error('❌ Token验证失败:', error.message)
    return false
  }
}

/**
 * 获取测试用户的用户信息
 *
 * @param {Object} app - Express应用实例
 * @param {string} token - JWT Token
 * @returns {Promise<Object>} 用户信息对象
 *
 * @example
 * const userInfo = await getUserInfo(app, token)
 * console.log(userInfo.user_id, userInfo.mobile)
 */
async function getUserInfo(app, token) {
  const response = await request(app)
    .get('/api/v4/user/profile')
    .set('Authorization', `Bearer ${token}`)

  if (!response.body.success) {
    throw new Error(`获取用户信息失败: ${response.body.message}`)
  }

  return response.body.data
}

/**
 * 批量登录多个测试用户
 *
 * @param {Object} app - Express应用实例
 * @param {Array<string>} mobiles - 手机号数组
 * @returns {Promise<Map>} 手机号到Token的映射
 *
 * @example
 * const tokens = await batchLogin(app, ['13612227910', '13800138000'])
 * const token1 = tokens.get('13612227910')
 */
async function batchLogin(app, mobiles) {
  const tokenMap = new Map()

  for (const mobile of mobiles) {
    try {
      const token = await getTestUserToken(app, mobile)
      tokenMap.set(mobile, token)
    } catch (error) {
      console.warn(`⚠️ 登录失败: ${mobile} - ${error.message}`)
      tokenMap.set(mobile, null)
    }
  }

  console.log(`✅ 批量登录完成: ${tokenMap.size}个用户`)
  return tokenMap
}

/**
 * 登出测试用户 (清理会话)
 *
 * @param {Object} app - Express应用实例
 * @param {string} token - JWT Token
 * @returns {Promise<void>}
 *
 * @example
 * await logout(app, token)
 */
async function logout(app, token) {
  try {
    await request(app).post('/api/v4/auth/logout').set('Authorization', `Bearer ${token}`)

    console.log('✅ 登出成功')
  } catch (error) {
    console.warn('⚠️ 登出失败 (可能token已失效):', error.message)
  }
}

// 导出认证辅助函数
module.exports = {
  getTestUserToken, // 主要方法: 获取测试用户token
  loginAs, // 🔐 推荐：按角色语义登录（supertest 风格）
  loginAsViaFetch, // 🔐 按角色语义登录（fetch 风格，直连 PM2 实时服务）
  loginAsAdmin, // 管理员登录（= loginAs(app, 'admin')）
  verifyToken, // 验证token有效性
  getUserInfo, // 获取用户信息
  batchLogin, // 批量登录
  logout // 登出
}
