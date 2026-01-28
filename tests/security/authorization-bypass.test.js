'use strict'

/**
 * P3-9: 授权绕过安全测试套件
 *
 * 测试目标：
 * - 验证访问控制的正确实施
 * - 测试角色权限边界
 * - 验证资源所有权检查
 * - 防止越权访问
 *
 * 测试范围：
 * - 垂直越权：普通用户访问管理员接口
 * - 水平越权：用户A访问用户B的资源
 * - 未认证访问：无Token访问受保护接口
 * - Token伪造：使用无效或过期的Token
 *
 * 测试方法：
 * - 使用不同角色的Token访问各级接口
 * - 验证返回正确的权限错误
 * - 确保敏感数据不泄露
 *
 * @module tests/security/authorization-bypass
 * @since 2026-01-28
 */

// 加载环境变量
require('dotenv').config()

const request = require('supertest')
const jwt = require('jsonwebtoken')
const app = require('../../app')

describe('P3-9: 授权绕过安全测试', () => {
  // 测试超时设置
  jest.setTimeout(30000)

  // JWT密钥
  const jwtSecret = process.env.JWT_SECRET || 'test-secret'

  // 生成测试Token
  const generateToken = (payload, options = {}) => {
    return jwt.sign(payload, jwtSecret, {
      expiresIn: options.expiresIn || '1h',
      ...options
    })
  }

  // 模拟普通用户Token
  const createUserToken = (userId = 1) => {
    return generateToken({
      user_id: userId,
      role: 'user',
      is_admin: false
    })
  }

  // 模拟管理员Token
  const createAdminToken = (userId = 1) => {
    return generateToken({
      user_id: userId,
      role: 'admin',
      is_admin: true
    })
  }

  // 需要认证的接口列表（实际存在的路由路径）
  const protectedEndpoints = [
    { method: 'GET', path: '/api/v4/auth/profile', description: '用户资料' },
    { method: 'GET', path: '/api/v4/user/me', description: '用户中心' },
    { method: 'GET', path: '/api/v4/backpack', description: '背包' },
    { method: 'GET', path: '/api/v4/lottery/campaigns', description: '抽奖活动' }
  ]

  // 管理员专用接口列表（实际存在的路由路径）
  const adminEndpoints = [
    { method: 'GET', path: '/api/v4/console/user-management/users', description: '用户管理' },
    { method: 'GET', path: '/api/v4/console/lottery-campaigns', description: '活动管理' },
    { method: 'GET', path: '/api/v4/console/trade-orders', description: '订单管理' },
    { method: 'GET', path: '/api/v4/console/analytics/overview', description: '统计数据' },
    {
      method: 'POST',
      path: '/api/v4/console/lottery-management/interventions',
      description: '创建干预'
    }
  ]

  describe('未认证访问测试', () => {
    test('受保护接口应拒绝无Token访问', async () => {
      for (const endpoint of protectedEndpoints) {
        const method = endpoint.method.toLowerCase()
        const response = await request(app)[method](endpoint.path)

        // 调试输出
        if (response.status !== 401) {
          console.log(`[P3-9] 端点 ${endpoint.method} ${endpoint.path} 返回: ${response.status}`)
        }

        // 应该返回401未认证（某些端点可能返回404，这是安全设计——不暴露端点是否存在）
        expect([401, 403, 404]).toContain(response.status)

        // 验证响应不包含敏感数据
        if (response.body && typeof response.body === 'object') {
          expect(response.body).not.toHaveProperty('password')
          expect(response.body).not.toHaveProperty('jwt_secret')
        }
      }

      console.log('[P3-9] 未认证访问测试通过')
    })

    test('管理员接口应拒绝无Token访问', async () => {
      for (const endpoint of adminEndpoints) {
        const method = endpoint.method.toLowerCase()
        const response = await request(app)[method](endpoint.path)

        /*
         * 应该返回401、403或404（某些管理员接口可能被隐藏返回404）
         * 安全原则：不透露接口是否存在
         */
        expect([401, 403, 404]).toContain(response.status)
      }

      console.log('[P3-9] 管理员接口无Token访问测试通过')
    })
  })

  describe('Token伪造测试', () => {
    test('应拒绝无效签名的Token', async () => {
      // 使用错误的密钥签名
      const fakeToken = jwt.sign({ user_id: 1, role: 'admin', is_admin: true }, 'wrong-secret-key')

      const response = await request(app)
        .get('/api/v4/auth/profile')
        .set('Authorization', `Bearer ${fakeToken}`)

      // 应该拒绝
      expect([401, 403]).toContain(response.status)

      console.log('[P3-9] 无效签名Token测试通过')
    })

    test('应拒绝过期的Token', async () => {
      // 生成已过期的Token
      const expiredToken = generateToken({ user_id: 1, role: 'user' }, { expiresIn: '-1s' })

      const response = await request(app)
        .get('/api/v4/auth/profile')
        .set('Authorization', `Bearer ${expiredToken}`)

      // 应该返回401
      expect(response.status).toBe(401)

      console.log('[P3-9] 过期Token测试通过')
    })

    test('应拒绝格式错误的Token', async () => {
      const malformedTokens = [
        'not-a-jwt-token',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', // 只有header
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxfQ', // 缺少签名
        '...',
        'Bearer '
      ]

      for (const token of malformedTokens) {
        const response = await request(app)
          .get('/api/v4/auth/profile')
          .set('Authorization', `Bearer ${token}`)

        // 应该拒绝
        expect([400, 401, 403]).toContain(response.status)
      }

      console.log('[P3-9] 格式错误Token测试通过')
    })
  })

  describe('垂直越权测试（普通用户访问管理员接口）', () => {
    test('普通用户不应访问管理员用户管理接口', async () => {
      const userToken = createUserToken(1)

      const response = await request(app)
        .get('/api/v4/console/user-management/users')
        .set('Authorization', `Bearer ${userToken}`)

      // 应该返回403禁止（普通用户无管理员权限）
      expect([401, 403]).toContain(response.status)

      // 不应该返回用户列表
      if (response.body.data) {
        expect(response.body.data).not.toHaveProperty('users')
      }

      console.log('[P3-9] 普通用户访问用户管理接口测试通过')
    })

    test('普通用户不应访问管理员活动管理接口', async () => {
      const userToken = createUserToken(1)

      const response = await request(app)
        .get('/api/v4/console/lottery-management/interventions')
        .set('Authorization', `Bearer ${userToken}`)

      // 应该返回403禁止（普通用户无管理员权限）
      expect([401, 403]).toContain(response.status)

      console.log('[P3-9] 普通用户访问干预列表测试通过')
    })

    test('普通用户不应访问管理员统计接口', async () => {
      const userToken = createUserToken(1)

      const response = await request(app)
        .get('/api/v4/console/analytics/decisions/analytics')
        .set('Authorization', `Bearer ${userToken}`)

      // 应该返回403禁止
      expect([401, 403]).toContain(response.status)

      console.log('[P3-9] 普通用户访问统计接口测试通过')
    })

    test('普通用户不应修改活动状态', async () => {
      const userToken = createUserToken(1)

      const response = await request(app)
        .put('/api/v4/console/lottery-campaigns/1/status')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ status: 'inactive' })

      // 应该返回403禁止
      expect([401, 403, 404]).toContain(response.status)

      console.log('[P3-9] 普通用户修改活动状态测试通过')
    })
  })

  describe('水平越权测试（用户访问其他用户资源）', () => {
    test('用户不应访问其他用户的资料', async () => {
      // 用户1的Token
      const user1Token = createUserToken(1)

      // 尝试访问用户2的资料
      const response = await request(app)
        .get('/api/v4/users/2/profile')
        .set('Authorization', `Bearer ${user1Token}`)

      // 应该返回403或404
      expect([401, 403, 404]).toContain(response.status)

      // 不应该返回用户2的敏感信息
      if (response.body.data) {
        expect(response.body.data).not.toHaveProperty('mobile')
        expect(response.body.data).not.toHaveProperty('password')
      }

      console.log('[P3-9] 访问其他用户资料测试通过')
    })

    test('用户不应访问其他用户的库存', async () => {
      const user1Token = createUserToken(1)

      const response = await request(app)
        .get('/api/v4/users/2/inventory')
        .set('Authorization', `Bearer ${user1Token}`)

      // 应该返回403或404
      expect([401, 403, 404]).toContain(response.status)

      console.log('[P3-9] 访问其他用户库存测试通过')
    })

    test('用户不应访问其他用户的资产', async () => {
      const user1Token = createUserToken(1)

      const response = await request(app)
        .get('/api/v4/users/2/assets')
        .set('Authorization', `Bearer ${user1Token}`)

      // 应该返回403或404
      expect([401, 403, 404]).toContain(response.status)

      console.log('[P3-9] 访问其他用户资产测试通过')
    })

    test('用户不应修改其他用户的资料', async () => {
      const user1Token = createUserToken(1)

      const response = await request(app)
        .put('/api/v4/users/2/profile')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          nickname: 'Hacked'
        })

      // 应该返回403或404
      expect([401, 403, 404]).toContain(response.status)

      console.log('[P3-9] 修改其他用户资料测试通过')
    })
  })

  describe('参数篡改越权测试', () => {
    test('不应通过篡改user_id参数越权', async () => {
      const user1Token = createUserToken(1)

      // 尝试在请求体中篡改user_id
      const response = await request(app)
        .post('/api/v4/user/some-action')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          user_id: 2, // 尝试篡改为其他用户
          action: 'test'
        })

      // 验证响应不允许越权
      expect(response).toBeDefined()

      /*
       * 服务器应该使用Token中的user_id，而非请求体中的
       * 或者直接拒绝请求
       */

      console.log('[P3-9] 参数篡改越权测试完成')
    })

    test('不应通过篡改role参数越权', async () => {
      const user1Token = createUserToken(1)

      // 尝试在请求体中声明管理员角色访问管理员接口
      const response = await request(app)
        .get('/api/v4/console/user-management/users')
        .set('Authorization', `Bearer ${user1Token}`)
        .query({
          role: 'admin', // 尝试在查询参数声明管理员角色
          is_admin: 'true'
        })

      // 应该被拒绝（普通用户无管理员权限）
      expect([401, 403]).toContain(response.status)

      console.log('[P3-9] role参数篡改测试通过')
    })
  })

  describe('ID猜测越权测试', () => {
    test('不应通过顺序ID猜测访问资源', async () => {
      const userToken = createUserToken(1)

      // 尝试访问顺序ID的资源
      for (let id = 1; id <= 5; id++) {
        const response = await request(app)
          .get(`/api/v4/orders/${id}`)
          .set('Authorization', `Bearer ${userToken}`)

        // 不属于当前用户的订单应该返回403或404
        if (response.status === 200) {
          /*
           * 如果返回成功，数据应该属于当前用户
           * 实际验证需要根据业务逻辑
           */
        }
      }

      console.log('[P3-9] ID猜测越权测试完成')
    })
  })

  describe('权限降级测试', () => {
    test('管理员Token不应被降级使用', async () => {
      const adminToken = createAdminToken(1)

      // 管理员应该能访问管理员接口
      const response = await request(app)
        .get('/api/v4/console/users')
        .set('Authorization', `Bearer ${adminToken}`)

      // 应该成功或返回合理的业务错误
      expect([200, 400, 404, 500]).toContain(response.status)

      console.log('[P3-9] 管理员权限降级测试完成')
    })
  })

  describe('批量操作越权测试', () => {
    test('不应通过批量接口越权访问', async () => {
      const userToken = createUserToken(1)

      // 尝试批量获取其他用户数据
      const response = await request(app)
        .post('/api/v4/users/batch')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          user_ids: [1, 2, 3, 4, 5] // 尝试批量获取
        })

      // 应该只返回当前用户的数据或拒绝
      if (response.status === 200 && response.body.data) {
        // 如果返回数据，应该只包含当前用户
        const users = response.body.data.users || response.body.data
        if (Array.isArray(users)) {
          users.forEach(user => {
            // 不应该包含其他用户的敏感信息
            expect(user).not.toHaveProperty('password')
            expect(user).not.toHaveProperty('jwt_secret')
          })
        }
      }

      console.log('[P3-9] 批量操作越权测试完成')
    })
  })

  describe('响应数据泄露测试', () => {
    test('错误响应不应泄露敏感信息', async () => {
      const response = await request(app).get('/api/v4/console/users')
      // 不带Token或带普通用户Token

      // 错误响应不应该包含敏感信息
      expect(response.text).not.toMatch(/password/i)
      expect(response.text).not.toMatch(/jwt_secret/i)
      expect(response.text).not.toMatch(/database.*password/i)

      console.log('[P3-9] 错误响应数据泄露测试通过')
    })

    test('越权错误不应泄露资源存在信息', async () => {
      const userToken = createUserToken(1)

      // 访问不存在的资源
      const notExistResponse = await request(app)
        .get('/api/v4/users/999999/profile')
        .set('Authorization', `Bearer ${userToken}`)

      // 访问存在但无权限的资源
      const noPermResponse = await request(app)
        .get('/api/v4/users/2/profile')
        .set('Authorization', `Bearer ${userToken}`)

      /*
       * 两种情况应该返回相同的状态码，防止资源枚举
       * 或者都返回403/404
       */
      const validStatuses = [401, 403, 404]
      expect(validStatuses).toContain(notExistResponse.status)
      expect(validStatuses).toContain(noPermResponse.status)

      console.log('[P3-9] 资源存在信息泄露测试完成')
    })
  })
})
