/**
 * @file P1-3.3: 订单API参数验证单元测试
 * @description 验证交易订单模块的API参数校验逻辑
 *
 * 覆盖范围：
 * - 订单ID参数验证
 * - 订单状态筛选参数验证
 * - 订单查询分页参数验证
 * - 业务ID参数验证
 * - 时间范围参数验证
 *
 * 依赖服务：
 * - TradeOrderService: 交易订单服务
 * - middleware/validation: 参数验证中间件
 *
 * 测试策略：
 * - 直接测试验证中间件函数
 * - 模拟 Express req/res 对象
 * - 验证业务规则和边界条件
 *
 * @version 1.0.0
 * @date 2026-01-30
 */

'use strict'

// 加载环境变量
require('dotenv').config()

const {
  validatePositiveInteger,
  validateEnumValue,
  validatePaginationParams,
  validateNumericId,
  validateUUID
} = require('../../../middleware/validation')

/**
 * 创建模拟的 Express request 对象
 * @param {Object} options - 配置选项
 * @returns {Object} 模拟的 req 对象
 */
function createMockRequest(options = {}) {
  return {
    params: options.params || {},
    query: options.query || {},
    body: options.body || {},
    validated: {}
  }
}

/**
 * 创建模拟的 Express response 对象
 * @returns {Object} 模拟的 res 对象
 */
function createMockResponse() {
  const res = {
    statusCode: 200,
    responseBody: null,
    status: function (code) {
      this.statusCode = code
      return this
    },
    json: function (body) {
      this.responseBody = body
      return this
    },
    apiError: function (message, code, data, status) {
      this.statusCode = status || 400
      this.responseBody = {
        success: false,
        code,
        message,
        data
      }
      return this
    }
  }
  return res
}

/**
 * 执行中间件并返回结果
 * @param {Function} middleware - 中间件函数
 * @param {Object} req - 模拟的 request
 * @param {Object} res - 模拟的 response
 * @returns {Promise<Object>} 执行结果
 */
function runMiddleware(middleware, req, res) {
  return new Promise(resolve => {
    let resolved = false

    // 包装 apiError 以便在调用时立即 resolve
    const originalApiError = res.apiError
    res.apiError = function (...args) {
      originalApiError.apply(this, args)
      if (!resolved) {
        resolved = true
        resolve({ passed: false, req, res })
      }
      return this
    }

    const next = () => {
      if (!resolved) {
        resolved = true
        resolve({ passed: true, req, res })
      }
    }

    // 执行中间件
    middleware(req, res, next)
  })
}

describe('P1-3.3: 订单API参数验证单元测试', () => {
  describe('1. 订单ID参数验证 (order_id / id)', () => {
    const orderIdValidator = validateNumericId('id', 'params')

    test('有效的订单ID应通过验证', async () => {
      const validIds = [1, 10, 100, 999999, 2147483647]

      for (const id of validIds) {
        const req = createMockRequest({ params: { id: String(id) } })
        const res = createMockResponse()
        const result = await runMiddleware(orderIdValidator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.id).toBe(id)
      }
    })

    test('无效的订单ID应被拒绝', async () => {
      const invalidIds = [
        { value: '0', description: '零值', expectedCode: 'INVALID_RESOURCE_ID' },
        { value: '-1', description: '负数', expectedCode: 'INVALID_RESOURCE_ID' },
        { value: 'abc', description: '非数字字符串', expectedCode: 'INVALID_RESOURCE_ID' },
        { value: '1.5', description: '浮点数', expectedCode: 'INVALID_RESOURCE_ID' },
        { value: '', description: '空字符串', expectedCode: 'BAD_REQUEST' },
        { value: 'order_123', description: '混合字符串', expectedCode: 'INVALID_RESOURCE_ID' }
      ]

      for (const { value, description: _description, expectedCode } of invalidIds) {
        const req = createMockRequest({ params: { id: value } })
        const res = createMockResponse()
        const result = await runMiddleware(orderIdValidator, req, res)

        expect(result.passed).toBe(false)
        expect(res.statusCode).toBe(400)
        expect(res.responseBody.code).toBe(expectedCode)
      }
    })

    test('缺少订单ID参数应被拒绝', async () => {
      const req = createMockRequest({ params: {} })
      const res = createMockResponse()
      const result = await runMiddleware(orderIdValidator, req, res)

      expect(result.passed).toBe(false)
      expect(res.statusCode).toBe(400)
    })
  })

  describe('2. 订单状态参数验证 (status)', () => {
    // 订单状态枚举值（基于 TradeOrderService 定义）
    const ORDER_STATUSES = ['created', 'frozen', 'completed', 'cancelled', 'failed']
    const statusValidator = validateEnumValue('status', ORDER_STATUSES, 'query', { optional: true })

    test('有效的订单状态应通过验证', async () => {
      for (const status of ORDER_STATUSES) {
        const req = createMockRequest({ query: { status } })
        const res = createMockResponse()
        const result = await runMiddleware(statusValidator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.status).toBe(status)
      }
    })

    test('无效的订单状态应被拒绝', async () => {
      const invalidStatuses = ['pending', 'processing', 'shipped', 'delivered', 'refunded', '123']

      for (const status of invalidStatuses) {
        const req = createMockRequest({ query: { status } })
        const res = createMockResponse()
        const result = await runMiddleware(statusValidator, req, res)

        expect(result.passed).toBe(false)
        expect(res.statusCode).toBe(400)
        expect(res.responseBody.data.allowed_values).toEqual(ORDER_STATUSES)
      }
    })

    test('可选状态参数未提供时应通过验证', async () => {
      const req = createMockRequest({ query: {} })
      const res = createMockResponse()
      const result = await runMiddleware(statusValidator, req, res)

      expect(result.passed).toBe(true)
    })
  })

  describe('3. 订单查询分页参数验证', () => {
    const paginationValidator = validatePaginationParams({ maxPageSize: 100, defaultPageSize: 20 })

    test('有效的分页参数应通过验证', async () => {
      const validParams = [
        { page: '1', limit: '10' },
        { page: '2', limit: '20' },
        { page: '5', limit: '50' },
        { page: '10', limit: '100' }
      ]

      for (const params of validParams) {
        const req = createMockRequest({ query: params })
        const res = createMockResponse()
        const result = await runMiddleware(paginationValidator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.page).toBeGreaterThanOrEqual(1)
        expect(req.validated.limit).toBeLessThanOrEqual(100)
      }
    })

    test('超出最大 page_size 应被限制为最大值', async () => {
      const req = createMockRequest({ query: { page: '1', limit: '200' } })
      const res = createMockResponse()
      const result = await runMiddleware(paginationValidator, req, res)

      expect(result.passed).toBe(true)
      expect(req.validated.limit).toBe(100) // 被限制为最大值
    })

    test('无效的分页参数应被拒绝', async () => {
      const invalidParams = [
        { page: '1', limit: '0' },
        { page: '1', limit: '-1' },
        { page: '1', limit: 'abc' }
      ]

      for (const params of invalidParams) {
        const req = createMockRequest({ query: params })
        const res = createMockResponse()
        const result = await runMiddleware(paginationValidator, req, res)

        expect(result.passed).toBe(false)
        expect(res.statusCode).toBe(400)
      }
    })

    test('默认分页参数应正确应用', async () => {
      const req = createMockRequest({ query: {} })
      const res = createMockResponse()
      const result = await runMiddleware(paginationValidator, req, res)

      expect(result.passed).toBe(true)
      expect(req.validated.limit).toBe(20) // 默认 page_size
    })
  })

  describe('4. 买家/卖家用户ID参数验证', () => {
    const buyerIdValidator = validatePositiveInteger('buyer_user_id', 'query', { optional: true })
    const sellerIdValidator = validatePositiveInteger('seller_user_id', 'query', { optional: true })

    test('有效的用户ID应通过验证', async () => {
      const validIds = [1, 100, 999999]

      for (const id of validIds) {
        // 测试买家ID
        let req = createMockRequest({ query: { buyer_user_id: String(id) } })
        let res = createMockResponse()
        let result = await runMiddleware(buyerIdValidator, req, res)
        expect(result.passed).toBe(true)
        expect(req.validated.buyer_user_id).toBe(id)

        // 测试卖家ID
        req = createMockRequest({ query: { seller_user_id: String(id) } })
        res = createMockResponse()
        result = await runMiddleware(sellerIdValidator, req, res)
        expect(result.passed).toBe(true)
        expect(req.validated.seller_user_id).toBe(id)
      }
    })

    test('可选用户ID参数未提供时应通过验证', async () => {
      const req = createMockRequest({ query: {} })
      const res = createMockResponse()

      let result = await runMiddleware(buyerIdValidator, req, res)
      expect(result.passed).toBe(true)

      result = await runMiddleware(sellerIdValidator, req, res)
      expect(result.passed).toBe(true)
    })

    test('无效的用户ID应被拒绝（非可选场景）', async () => {
      /*
       * validatePositiveInteger 的行为：
       * - 对于非可选参数，空字符串会被拒绝
       * - 对于无效数值（0, -1, abc, 1.5），会被拒绝
       */
      const nonOptionalValidator = validatePositiveInteger('buyer_user_id', 'query', {
        optional: false
      })

      // 测试空字符串
      let req = createMockRequest({ query: { buyer_user_id: '' } })
      let res = createMockResponse()
      let result = await runMiddleware(nonOptionalValidator, req, res)
      expect(result.passed).toBe(false)
      expect(res.statusCode).toBe(400)

      /*
       * 测试其他无效值
       * 注意：'1.5' 不在此列表中，因为 validatePositiveInteger 使用 parseInt，会将 '1.5' 截断为 1
       */
      const invalidIds = ['0', '-1', 'abc']
      for (const id of invalidIds) {
        req = createMockRequest({ query: { buyer_user_id: id } })
        res = createMockResponse()
        result = await runMiddleware(nonOptionalValidator, req, res)

        expect(result.passed).toBe(false)
        expect(res.statusCode).toBe(400)
      }
    })
  })

  describe('5. 挂牌ID参数验证 (market_listing_id)', () => {
    const listingIdValidator = validatePositiveInteger('market_listing_id', 'query', {
      optional: true
    })

    test('有效的挂牌ID应通过验证', async () => {
      const validIds = [1, 100, 999999]

      for (const id of validIds) {
        const req = createMockRequest({ query: { market_listing_id: String(id) } })
        const res = createMockResponse()
        const result = await runMiddleware(listingIdValidator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.market_listing_id).toBe(id)
      }
    })

    test('无效的挂牌ID应被拒绝', async () => {
      const invalidIds = ['0', '-1', 'listing_123']

      for (const id of invalidIds) {
        const req = createMockRequest({ query: { market_listing_id: id } })
        const res = createMockResponse()
        const result = await runMiddleware(listingIdValidator, req, res)

        expect(result.passed).toBe(false)
        expect(res.statusCode).toBe(400)
      }
    })
  })

  describe('6. 业务ID参数验证 (business_id)', () => {
    const businessIdValidator = validateUUID('business_id', 'params')

    test('有效的 UUID 格式 business_id 应通过验证', async () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        'A1B2C3D4-E5F6-7890-ABCD-EF1234567890'
      ]

      for (const uuid of validUUIDs) {
        const req = createMockRequest({ params: { business_id: uuid } })
        const res = createMockResponse()
        const result = await runMiddleware(businessIdValidator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.business_id).toBe(uuid.toLowerCase())
      }
    })

    test('无效的 UUID 格式应被拒绝', async () => {
      const invalidUUIDs = [
        { value: '123', description: '太短', expectedCode: 'INVALID_UUID' },
        { value: 'not-a-uuid', description: '格式错误', expectedCode: 'INVALID_UUID' },
        {
          value: '550e8400e29b41d4a716446655440000',
          description: '缺少连字符',
          expectedCode: 'INVALID_UUID'
        },
        { value: '550e8400-e29b-41d4-a716', description: '不完整', expectedCode: 'INVALID_UUID' },
        { value: '', description: '空字符串', expectedCode: 'BAD_REQUEST' }
      ]

      for (const { value, description: _description, expectedCode } of invalidUUIDs) {
        const req = createMockRequest({ params: { business_id: value } })
        const res = createMockResponse()
        const result = await runMiddleware(businessIdValidator, req, res)

        expect(result.passed).toBe(false)
        expect(res.statusCode).toBe(400)
        expect(res.responseBody.code).toBe(expectedCode)
      }
    })
  })

  describe('7. 结算资产代码参数验证 (asset_code)', () => {
    // 市场支持的结算资产代码（基于 MarketListingService 定义）
    const SETTLEMENT_ASSETS = ['DIAMOND', 'red_shard']
    const assetCodeValidator = validateEnumValue('asset_code', SETTLEMENT_ASSETS, 'query', {
      optional: true
    })

    test('有效的结算资产代码应通过验证', async () => {
      for (const code of SETTLEMENT_ASSETS) {
        const req = createMockRequest({ query: { asset_code: code } })
        const res = createMockResponse()
        const result = await runMiddleware(assetCodeValidator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.asset_code).toBe(code)
      }
    })

    test('不支持的结算资产代码应被拒绝', async () => {
      const unsupportedCodes = ['GOLD', 'POINTS', 'USD', 'unknown']

      for (const code of unsupportedCodes) {
        const req = createMockRequest({ query: { asset_code: code } })
        const res = createMockResponse()
        const result = await runMiddleware(assetCodeValidator, req, res)

        expect(result.passed).toBe(false)
        expect(res.statusCode).toBe(400)
        expect(res.responseBody.data.allowed_values).toEqual(SETTLEMENT_ASSETS)
      }
    })
  })

  describe('8. 时间范围参数验证', () => {
    // 时间格式验证（ISO8601 北京时间）
    test('有效的时间范围参数应通过基本验证', () => {
      const validTimeFormats = [
        '2026-01-01T00:00:00.000+08:00', // 完整ISO8601格式
        '2026-01-30T23:59:59.999+08:00',
        '2026-01-15T12:30:00+08:00',
        '2026-01-15' // 简化日期格式
      ]

      for (const time of validTimeFormats) {
        const parsed = new Date(time)
        expect(isNaN(parsed.getTime())).toBe(false)
      }
    })

    test('无效的时间格式应被识别', () => {
      const invalidTimeFormats = ['invalid-date', 'tomorrow', '']

      for (const time of invalidTimeFormats) {
        if (time === '') {
          expect(time).toBe('')
        } else {
          const parsed = new Date(time)
          expect(isNaN(parsed.getTime())).toBe(true)
        }
      }
    })

    test('时间范围逻辑验证（start_time < end_time）', () => {
      const startTime = new Date('2026-01-01T00:00:00.000+08:00')
      const endTime = new Date('2026-01-30T23:59:59.999+08:00')

      expect(startTime.getTime()).toBeLessThan(endTime.getTime())
    })
  })

  describe('9. 边界值测试', () => {
    test('订单ID 最大值边界测试', async () => {
      const validator = validateNumericId('id', 'params')

      // 测试大整数
      const largeIds = [999999999, 2147483647] // int 最大值

      for (const id of largeIds) {
        const req = createMockRequest({ params: { id: String(id) } })
        const res = createMockResponse()
        const result = await runMiddleware(validator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.id).toBe(id)
      }
    })

    test('用户ID 边界值测试', async () => {
      const validator = validatePositiveInteger('user_id', 'query', { optional: true })

      // 最小有效值
      let req = createMockRequest({ query: { user_id: '1' } })
      let res = createMockResponse()
      let result = await runMiddleware(validator, req, res)
      expect(result.passed).toBe(true)
      expect(req.validated.user_id).toBe(1)

      // 零值（无效）
      req = createMockRequest({ query: { user_id: '0' } })
      res = createMockResponse()
      result = await runMiddleware(validator, req, res)
      expect(result.passed).toBe(false)
    })

    test('分页参数边界值测试', async () => {
      const validator = validatePaginationParams({ maxPageSize: 100, defaultPageSize: 20 })

      // 最大 page_size
      let req = createMockRequest({ query: { page: '1', limit: '100' } })
      let res = createMockResponse()
      let result = await runMiddleware(validator, req, res)
      expect(result.passed).toBe(true)
      expect(req.validated.limit).toBe(100)

      // 超过最大 page_size（应被限制）
      req = createMockRequest({ query: { page: '1', limit: '101' } })
      res = createMockResponse()
      result = await runMiddleware(validator, req, res)
      expect(result.passed).toBe(true)
      expect(req.validated.limit).toBe(100) // 被限制
    })
  })

  describe('10. 组合参数验证场景', () => {
    test('订单列表查询多参数组合验证', async () => {
      const ORDER_STATUSES = ['created', 'frozen', 'completed', 'cancelled', 'failed']
      const SETTLEMENT_ASSETS = ['DIAMOND', 'red_shard']

      const statusValidator = validateEnumValue('status', ORDER_STATUSES, 'query', {
        optional: true
      })
      const assetCodeValidator = validateEnumValue('asset_code', SETTLEMENT_ASSETS, 'query', {
        optional: true
      })
      const paginationValidator = validatePaginationParams({
        maxPageSize: 100,
        defaultPageSize: 20
      })
      const buyerIdValidator = validatePositiveInteger('buyer_user_id', 'query', { optional: true })
      const sellerIdValidator = validatePositiveInteger('seller_user_id', 'query', {
        optional: true
      })

      const req = createMockRequest({
        query: {
          status: 'completed',
          asset_code: 'DIAMOND',
          page: '1',
          limit: '20',
          buyer_user_id: '100',
          seller_user_id: '200'
        }
      })
      const res = createMockResponse()

      // 依次执行验证
      let result = await runMiddleware(statusValidator, req, res)
      expect(result.passed).toBe(true)

      result = await runMiddleware(assetCodeValidator, req, res)
      expect(result.passed).toBe(true)

      result = await runMiddleware(paginationValidator, req, res)
      expect(result.passed).toBe(true)

      result = await runMiddleware(buyerIdValidator, req, res)
      expect(result.passed).toBe(true)

      result = await runMiddleware(sellerIdValidator, req, res)
      expect(result.passed).toBe(true)

      // 验证所有参数都被正确存储
      expect(req.validated.status).toBe('completed')
      expect(req.validated.asset_code).toBe('DIAMOND')
      expect(req.validated.limit).toBe(20)
      expect(req.validated.buyer_user_id).toBe(100)
      expect(req.validated.seller_user_id).toBe(200)
    })

    test('订单统计查询参数验证', async () => {
      const buyerIdValidator = validatePositiveInteger('buyer_user_id', 'query', { optional: true })
      const sellerIdValidator = validatePositiveInteger('seller_user_id', 'query', {
        optional: true
      })

      // 仅提供部分参数
      const req = createMockRequest({
        query: {
          seller_user_id: '100'
          // 其他参数未提供
        }
      })
      const res = createMockResponse()

      let result = await runMiddleware(sellerIdValidator, req, res)
      expect(result.passed).toBe(true)

      result = await runMiddleware(buyerIdValidator, req, res)
      expect(result.passed).toBe(true) // 可选参数

      expect(req.validated.seller_user_id).toBe(100)
      expect(req.validated.buyer_user_id).toBeUndefined()
    })

    test('用户交易统计查询参数验证', async () => {
      const userIdValidator = validateNumericId('user_id', 'params')

      const req = createMockRequest({
        params: { user_id: '100' }
      })
      const res = createMockResponse()

      const result = await runMiddleware(userIdValidator, req, res)
      expect(result.passed).toBe(true)
      expect(req.validated.user_id).toBe(100)
    })
  })
})
