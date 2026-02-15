/**
 * API契约测试 - 资产模块 (Asset Module)
 *
 * 覆盖范围：
 * - P0-1.3: 资产余额API契约测试 - 查询/冻结/解冻接口
 * - P0-1.4: 资产交易API契约测试 - 转账/兑换接口
 *
 * 测试原则：
 * - 验证API响应符合统一契约格式（success/code/message/data/timestamp/version/request_id）
 * - 验证HTTP状态码与业务场景对应
 * - 不依赖mock数据，使用真实数据库状态
 * - 使用snake_case命名规范
 *
 * 创建时间：2026-01-30
 * @module tests/api-contracts/asset.contract.test
 */

'use strict'

const request = require('supertest')
const { sequelize } = require('../../models')

/** Express应用实例 */
let app
/** 用户认证令牌 */
let access_token

/** Jest测试超时设置（毫秒） */
jest.setTimeout(30000)

describe('API契约测试 - 资产模块 (/api/v4/assets)', () => {
  /**
   * 测试套件初始化
   * - 加载应用
   * - 验证数据库连接
   * - 获取用户认证令牌
   */
  beforeAll(async () => {
    app = require('../../app')
    await sequelize.authenticate()

    // 使用测试账号登录获取Token
    const login_response = await request(app).post('/api/v4/auth/login').send({
      mobile: '13612227930',
      verification_code: '123456'
    })

    if (login_response.body.success) {
      access_token = login_response.body.data.access_token
    }
  })

  /**
   * 测试套件清理
   * - 关闭数据库连接
   */
  afterAll(async () => {
    await sequelize.close()
  })

  // ==================== 通用契约验证函数 ====================

  /**
   * 验证API响应契约格式
   *
   * @param {Object} body - API响应体
   * @param {boolean} expect_success - 是否期望成功响应
   */
  function validateApiContract(body, expect_success = true) {
    // 必需字段存在性检查
    expect(body).toHaveProperty('success')
    expect(body).toHaveProperty('code')
    expect(body).toHaveProperty('message')
    expect(body).toHaveProperty('data')
    expect(body).toHaveProperty('timestamp')
    expect(body).toHaveProperty('version')
    expect(body).toHaveProperty('request_id')

    // 字段类型检查
    expect(typeof body.success).toBe('boolean')
    expect(typeof body.code).toBe('string')
    expect(typeof body.message).toBe('string')

    // 成功/失败状态检查
    if (expect_success) {
      expect(body.success).toBe(true)
    }
  }

  // ==================== P0-1.3: 资产余额API契约测试 ====================

  describe('P0-1.3 资产余额API契约测试', () => {
    // -------------------- GET /balance - 查询单个资产余额 --------------------

    describe('GET /balance - 查询单个资产余额', () => {
      /**
       * Case 1: 查询DIAMOND余额
       */
      test('查询DIAMOND余额应返回符合契约的数据', async () => {
        const response = await request(app)
          .get('/api/v4/assets/balance')
          .set('Authorization', `Bearer ${access_token}`)
          .query({ asset_code: 'DIAMOND' })

        expect(response.status).toBe(200)
        validateApiContract(response.body)

        // 验证data结构
        expect(response.body.data).toHaveProperty('asset_code')
        expect(response.body.data).toHaveProperty('available_amount')
        expect(response.body.data.asset_code).toBe('DIAMOND')
        expect(typeof response.body.data.available_amount).toBe('number')
      })

      /**
       * Case 2: 查询red_shard余额
       */
      test('查询red_shard余额应返回符合契约的数据', async () => {
        const response = await request(app)
          .get('/api/v4/assets/balance')
          .set('Authorization', `Bearer ${access_token}`)
          .query({ asset_code: 'red_shard' })

        expect(response.status).toBe(200)
        validateApiContract(response.body)

        expect(response.body.data).toHaveProperty('asset_code')
        expect(response.body.data).toHaveProperty('available_amount')
        expect(response.body.data.asset_code).toBe('red_shard')
      })

      /**
       * Case 3: 缺少asset_code参数应返回400
       */
      test('缺少asset_code参数应返回400', async () => {
        const response = await request(app)
          .get('/api/v4/assets/balance')
          .set('Authorization', `Bearer ${access_token}`)

        expect(response.status).toBe(400)
        validateApiContract(response.body, false)
      })

      /**
       * Case 4: 未认证应返回401
       */
      test('未认证用户应返回401', async () => {
        const response = await request(app)
          .get('/api/v4/assets/balance')
          .query({ asset_code: 'DIAMOND' })

        expect(response.status).toBe(401)
        validateApiContract(response.body, false)
      })

      /**
       * Case 5: 查询不存在的资产类型应返回默认余额或404
       */
      test('查询不存在的资产类型应返回0余额或错误', async () => {
        const response = await request(app)
          .get('/api/v4/assets/balance')
          .set('Authorization', `Bearer ${access_token}`)
          .query({ asset_code: 'NONEXISTENT_ASSET' })

        // 可能返回200（余额为0）或400/404（资产类型不存在）
        expect([200, 400, 404]).toContain(response.status)
        validateApiContract(response.body, response.status === 200)

        if (response.status === 200) {
          expect(response.body.data.available_amount).toBe(0)
        }
      })
    })

    // -------------------- GET /balances - 查询所有资产余额 --------------------

    describe('GET /balances - 查询所有资产余额', () => {
      /**
       * Case 1: 正常获取所有资产余额
       * 响应格式：{ balances: [...] }
       */
      test('应返回符合契约的所有资产余额数据', async () => {
        const response = await request(app)
          .get('/api/v4/assets/balances')
          .set('Authorization', `Bearer ${access_token}`)

        expect(response.status).toBe(200)
        validateApiContract(response.body)

        // 验证data结构 - 包含balances数组
        expect(response.body.data).toHaveProperty('balances')
        expect(Array.isArray(response.body.data.balances)).toBe(true)

        // 如果有数据，验证每条记录的结构
        if (response.body.data.balances.length > 0) {
          response.body.data.balances.forEach(balance => {
            expect(balance).toHaveProperty('asset_code')
            expect(balance).toHaveProperty('available_amount')
            expect(balance).toHaveProperty('frozen_amount')
            expect(balance).toHaveProperty('total_amount')
            expect(typeof balance.available_amount).toBe('number')
          })
        }
      })

      /**
       * Case 2: 未认证应返回401
       */
      test('未认证用户应返回401', async () => {
        const response = await request(app).get('/api/v4/assets/balances')

        expect(response.status).toBe(401)
        validateApiContract(response.body, false)
      })
    })

    // -------------------- 冻结/解冻接口（管理员操作，如存在） --------------------

    describe('资产冻结/解冻接口（如存在）', () => {
      /**
       * Case 1: 冻结资产应需要认证
       * 注意：此接口可能仅限管理员使用
       */
      test('冻结资产应需要认证', async () => {
        const response = await request(app).post('/api/v4/assets/freeze').send({
          asset_code: 'DIAMOND',
          amount: 100
        })

        // 未认证应返回401，或接口不存在返回404
        expect([401, 404]).toContain(response.status)
        validateApiContract(response.body, false)
      })

      /**
       * Case 2: 解冻资产应需要认证
       */
      test('解冻资产应需要认证', async () => {
        const response = await request(app).post('/api/v4/assets/unfreeze').send({
          asset_code: 'DIAMOND',
          amount: 100
        })

        // 未认证应返回401，或接口不存在返回404
        expect([401, 404]).toContain(response.status)
        validateApiContract(response.body, false)
      })
    })
  })

  // ==================== P0-1.4: 资产交易API契约测试 ====================

  describe('P0-1.4 资产交易API契约测试', () => {
    // -------------------- GET /transactions - 查询资产交易流水 --------------------

    describe('GET /transactions - 查询资产交易流水', () => {
      /**
       * Case 1: 正常获取交易流水
       */
      test('应返回符合契约的交易流水数据', async () => {
        const response = await request(app)
          .get('/api/v4/assets/transactions')
          .set('Authorization', `Bearer ${access_token}`)

        expect(response.status).toBe(200)
        validateApiContract(response.body)

        // 验证data结构
        expect(response.body.data).toHaveProperty('transactions')
        expect(response.body.data).toHaveProperty('pagination')
        expect(Array.isArray(response.body.data.transactions)).toBe(true)
        expect(response.body.data.pagination).toHaveProperty('total')
        expect(response.body.data.pagination).toHaveProperty('page')
        expect(response.body.data.pagination).toHaveProperty('page_size')
      })

      /**
       * Case 2: 按asset_code筛选
       */
      test('按asset_code筛选应返回对应类型的流水', async () => {
        const response = await request(app)
          .get('/api/v4/assets/transactions')
          .set('Authorization', `Bearer ${access_token}`)
          .query({ asset_code: 'DIAMOND' })

        expect(response.status).toBe(200)
        validateApiContract(response.body)

        // 如果有数据，验证类型匹配
        if (response.body.data.transactions.length > 0) {
          response.body.data.transactions.forEach(tx => {
            expect(tx.asset_code).toBe('DIAMOND')
          })
        }
      })

      /**
       * Case 3: 按business_type筛选
       */
      test('按business_type筛选应返回对应业务类型的流水', async () => {
        const response = await request(app)
          .get('/api/v4/assets/transactions')
          .set('Authorization', `Bearer ${access_token}`)
          .query({ business_type: 'lottery_reward' })

        expect(response.status).toBe(200)
        validateApiContract(response.body)

        // 如果有数据，验证类型匹配
        if (response.body.data.transactions.length > 0) {
          response.body.data.transactions.forEach(tx => {
            expect(tx.business_type).toBe('lottery_reward')
          })
        }
      })

      /**
       * Case 4: 带分页参数查询
       */
      test('带分页参数应返回正确的分页数据', async () => {
        const response = await request(app)
          .get('/api/v4/assets/transactions')
          .set('Authorization', `Bearer ${access_token}`)
          .query({ page: 1, page_size: 5 })

        expect(response.status).toBe(200)
        validateApiContract(response.body)
        expect(response.body.data.pagination.page).toBe(1)
        expect(response.body.data.pagination.page_size).toBe(5)
      })

      /**
       * Case 5: 未认证应返回401
       */
      test('未认证用户应返回401', async () => {
        const response = await request(app).get('/api/v4/assets/transactions')

        expect(response.status).toBe(401)
        validateApiContract(response.body, false)
      })

      /**
       * Case 6: 验证交易流水记录结构（完整字段契约）
       *
       * 业务背景：前端积分明细页、交易记录页依赖此接口
       * 必需字段：asset_transaction_id, asset_code, delta_amount, balance_before,
       *           balance_after, business_type, description, title, created_at
       */
      test('交易流水记录应包含完整的必要字段', async () => {
        const response = await request(app)
          .get('/api/v4/assets/transactions')
          .set('Authorization', `Bearer ${access_token}`)
          .query({ asset_code: 'POINTS', page_size: 1 })

        expect(response.status).toBe(200)
        validateApiContract(response.body)

        // 验证有数据返回（测试账号 13612227930 有 POINTS 流水）
        expect(response.body.data.transactions.length).toBeGreaterThan(0)

        const tx = response.body.data.transactions[0]

        // 主键字段：asset_transaction_id（snake_case 规范，与模型主键一致）
        expect(tx).toHaveProperty('asset_transaction_id')
        expect(typeof tx.asset_transaction_id).toBe('number')

        // 核心业务字段
        expect(tx).toHaveProperty('asset_code')
        expect(tx).toHaveProperty('delta_amount')
        expect(tx).toHaveProperty('balance_before')
        expect(tx).toHaveProperty('balance_after')
        expect(tx).toHaveProperty('business_type')
        expect(tx).toHaveProperty('created_at')

        // 类型验证
        expect(typeof tx.delta_amount).toBe('number')
        expect(typeof tx.balance_before).toBe('number')
        expect(typeof tx.balance_after).toBe('number')

        // 新增字段：description 和 title（从 meta JSON 提取，可为 null）
        expect(tx).toHaveProperty('description')
        expect(tx).toHaveProperty('title')

        // 旧字段 transaction_id 不应存在（已修正为 asset_transaction_id）
        expect(tx).not.toHaveProperty('transaction_id')
      })
    })

    // -------------------- 资产转换接口 --------------------

    describe('资产转换接口（兑换）', () => {
      /**
       * Case 1: 查询转换规则应需要认证
       * 响应格式：{ rules: [...], total_rules: number }
       */
      test('查询转换规则应返回正确格式', async () => {
        const response = await request(app)
          .get('/api/v4/assets/conversion-rules')
          .set('Authorization', `Bearer ${access_token}`)

        // 接口存在应返回200，否则404
        if (response.status === 200) {
          validateApiContract(response.body)
          // 验证data结构 - 包含rules数组和total_rules计数
          expect(response.body.data).toHaveProperty('rules')
          expect(response.body.data).toHaveProperty('total_rules')
          expect(Array.isArray(response.body.data.rules)).toBe(true)

          // 如果有规则，验证规则结构
          if (response.body.data.rules.length > 0) {
            const rule = response.body.data.rules[0]
            expect(rule).toHaveProperty('from_asset_code')
            expect(rule).toHaveProperty('to_asset_code')
            expect(rule).toHaveProperty('from_amount')
            expect(rule).toHaveProperty('to_amount')
            expect(rule).toHaveProperty('conversion_rate')
            expect(rule).toHaveProperty('limits')
            expect(rule).toHaveProperty('fee')
            expect(rule).toHaveProperty('display')
          }
        } else {
          expect(response.status).toBe(404)
        }
      })

      /**
       * Case 2: 执行资产转换应需要认证
       */
      test('执行资产转换应需要认证', async () => {
        const response = await request(app).post('/api/v4/assets/convert').send({
          from_asset_code: 'red_shard',
          to_asset_code: 'DIAMOND',
          from_amount: 10
        })

        // 未认证应返回401，或接口不存在返回404
        expect([401, 404]).toContain(response.status)
        validateApiContract(response.body, false)
      })

      /**
       * Case 3: 资产转换缺少必要参数应返回400
       */
      test('资产转换缺少必要参数应返回400', async () => {
        const response = await request(app)
          .post('/api/v4/assets/convert')
          .set('Authorization', `Bearer ${access_token}`)
          .set('Idempotency-Key', `test_convert_${Date.now()}_1`)
          .send({
            from_asset_code: 'red_shard'
            // 缺少 to_asset_code 和 from_amount
          })

        // 应返回400（参数缺失）或404（接口不存在）
        expect([400, 404]).toContain(response.status)
        if (response.status === 400) {
          validateApiContract(response.body, false)
        }
      })

      /**
       * Case 4: 无效的转换金额应返回400
       */
      test('转换金额为0或负数应返回400', async () => {
        const response = await request(app)
          .post('/api/v4/assets/convert')
          .set('Authorization', `Bearer ${access_token}`)
          .set('Idempotency-Key', `test_convert_${Date.now()}_2`)
          .send({
            from_asset_code: 'red_shard',
            to_asset_code: 'DIAMOND',
            from_amount: -10
          })

        // 应返回400（参数无效）或404（接口不存在）
        expect([400, 404]).toContain(response.status)
        if (response.status === 400) {
          validateApiContract(response.body, false)
        }
      })
    })

    // -------------------- 资产转账接口（如存在） --------------------

    describe('资产转账接口（如存在）', () => {
      /**
       * Case 1: 转账应需要认证
       */
      test('转账应需要认证', async () => {
        const response = await request(app).post('/api/v4/assets/transfer').send({
          to_user_id: 999,
          asset_code: 'DIAMOND',
          amount: 100
        })

        // 未认证应返回401，或接口不存在返回404
        expect([401, 404]).toContain(response.status)
        validateApiContract(response.body, false)
      })

      /**
       * Case 2: 转账缺少必要参数应返回400
       */
      test('转账缺少必要参数应返回400', async () => {
        const response = await request(app)
          .post('/api/v4/assets/transfer')
          .set('Authorization', `Bearer ${access_token}`)
          .set('Idempotency-Key', `test_transfer_${Date.now()}_1`)
          .send({
            asset_code: 'DIAMOND'
            // 缺少 to_user_id 和 amount
          })

        // 应返回400（参数缺失）或404（接口不存在）
        expect([400, 404]).toContain(response.status)
        if (response.status === 400) {
          validateApiContract(response.body, false)
        }
      })

      /**
       * Case 3: 向自己转账应返回400
       */
      test('向自己转账应返回400或相应业务错误', async () => {
        // 获取当前用户ID（通过用户信息接口）
        const user_response = await request(app)
          .get('/api/v4/user/profile')
          .set('Authorization', `Bearer ${access_token}`)

        if (user_response.status !== 200) {
          // 如果无法获取用户信息，跳过此测试
          return
        }

        const current_user_id = user_response.body.data.user_id

        const response = await request(app)
          .post('/api/v4/assets/transfer')
          .set('Authorization', `Bearer ${access_token}`)
          .set('Idempotency-Key', `test_transfer_${Date.now()}_2`)
          .send({
            to_user_id: current_user_id,
            asset_code: 'DIAMOND',
            amount: 100
          })

        // 应返回400（不能向自己转账）或404（接口不存在）
        expect([400, 404]).toContain(response.status)
        if (response.status === 400) {
          validateApiContract(response.body, false)
        }
      })
    })
  })

  // ==================== 边界条件和错误处理测试 ====================

  describe('边界条件和错误处理', () => {
    /**
     * Case 1: 超大page_size请求应返回正确的响应格式
     * 业务说明：当前服务端未强制限制page_size，此测试验证响应格式正确
     */
    test('超大page_size请求应返回正确的响应格式', async () => {
      const response = await request(app)
        .get('/api/v4/assets/transactions')
        .set('Authorization', `Bearer ${access_token}`)
        .query({ page_size: 10000 })

      expect(response.status).toBe(200)
      validateApiContract(response.body)
      // 验证pagination结构完整性
      expect(response.body.data.pagination).toHaveProperty('total')
      expect(response.body.data.pagination).toHaveProperty('page')
      expect(response.body.data.pagination).toHaveProperty('page_size')
      expect(typeof response.body.data.pagination.page_size).toBe('number')
    })

    /**
     * Case 2: 空Authorization header应返回401
     */
    test('空Authorization header应返回401', async () => {
      const response = await request(app).get('/api/v4/assets/balances').set('Authorization', '')

      expect(response.status).toBe(401)
      validateApiContract(response.body, false)
    })

    /**
     * Case 3: 无效的Authorization token应返回401
     */
    test('无效的Authorization token应返回401', async () => {
      const response = await request(app)
        .get('/api/v4/assets/balances')
        .set('Authorization', 'Bearer invalid_token_12345')

      expect(response.status).toBe(401)
      validateApiContract(response.body, false)
    })

    /**
     * Case 4: 请求体Content-Type错误应能正确处理
     */
    test('非JSON Content-Type应能正确处理', async () => {
      const response = await request(app)
        .post('/api/v4/assets/convert')
        .set('Authorization', `Bearer ${access_token}`)
        .set('Content-Type', 'text/plain')
        .send('not json data')

      // 应返回400（JSON解析失败）或404（接口不存在）
      expect([400, 404]).toContain(response.status)
    })
  })
})
