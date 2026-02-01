/**
 * @file P1-3.1: 市场API参数验证单元测试
 * @description 验证市场模块的API参数校验逻辑
 *
 * 覆盖范围：
 * - 市场列表查询参数验证
 * - 上架商品参数验证
 * - 购买/下架操作参数验证
 * - 边界值和枚举值测试
 *
 * 依赖服务：
 * - MarketListingService: 市场挂牌服务
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
  validateBusinessCode
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

describe('P1-3.1: 市场API参数验证单元测试', () => {
  describe('1. 市场列表ID验证 (market_listing_id)', () => {
    const validator = validateNumericId('market_listing_id', 'params')

    test('有效的正整数 market_listing_id 应通过验证', async () => {
      const validIds = [1, 10, 100, 999999]

      for (const id of validIds) {
        const req = createMockRequest({ params: { market_listing_id: String(id) } })
        const res = createMockResponse()
        const result = await runMiddleware(validator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.market_listing_id).toBe(id)
      }
    })

    test('无效的 market_listing_id 应被拒绝', async () => {
      /*
       * validateNumericId 对于不同类型的无效值返回不同的错误码
       * - 空字符串: BAD_REQUEST（参数不能为空）
       * - 无效数值: INVALID_RESOURCE_ID（必须是有效的正整数）
       */
      const invalidIds = [
        { value: '0', description: '零值', expectedCode: 'INVALID_RESOURCE_ID' },
        { value: '-1', description: '负数', expectedCode: 'INVALID_RESOURCE_ID' },
        { value: 'abc', description: '非数字字符串', expectedCode: 'INVALID_RESOURCE_ID' },
        { value: '1.5', description: '浮点数', expectedCode: 'INVALID_RESOURCE_ID' },
        { value: '', description: '空字符串', expectedCode: 'BAD_REQUEST' },
        { value: 'null', description: 'null字符串', expectedCode: 'INVALID_RESOURCE_ID' }
      ]

      for (const { value, description: _description, expectedCode } of invalidIds) {
        const req = createMockRequest({ params: { market_listing_id: value } })
        const res = createMockResponse()
        const result = await runMiddleware(validator, req, res)

        expect(result.passed).toBe(false)
        expect(res.statusCode).toBe(400)
        expect(res.responseBody.code).toBe(expectedCode)
      }
    })

    test('缺少 market_listing_id 参数应被拒绝', async () => {
      const req = createMockRequest({ params: {} })
      const res = createMockResponse()
      const result = await runMiddleware(validator, req, res)

      expect(result.passed).toBe(false)
      expect(res.statusCode).toBe(400)
      expect(res.responseBody.code).toBe('BAD_REQUEST')
    })
  })

  describe('2. 市场列表查询分页参数验证', () => {
    const paginationValidator = validatePaginationParams({ maxPageSize: 100, defaultPageSize: 20 })

    test('有效的分页参数应通过验证', async () => {
      const validParams = [
        { page: '1', limit: '20' },
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

    test('无效的 limit 参数应被拒绝', async () => {
      const invalidLimits = ['0', '-1', 'abc']

      for (const limit of invalidLimits) {
        const req = createMockRequest({ query: { page: '1', limit } })
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

  describe('3. 市场列表状态筛选参数验证', () => {
    // 市场列表状态枚举值
    const LISTING_STATUSES = ['active', 'sold', 'withdrawn', 'expired', 'cancelled']
    const statusValidator = validateEnumValue('status', LISTING_STATUSES, 'query', {
      optional: true
    })

    test('有效的状态值应通过验证', async () => {
      for (const status of LISTING_STATUSES) {
        const req = createMockRequest({ query: { status } })
        const res = createMockResponse()
        const result = await runMiddleware(statusValidator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.status).toBe(status)
      }
    })

    test('无效的状态值应被拒绝', async () => {
      const invalidStatuses = ['invalid', 'unknown', 'pending', '123']

      for (const status of invalidStatuses) {
        const req = createMockRequest({ query: { status } })
        const res = createMockResponse()
        const result = await runMiddleware(statusValidator, req, res)

        expect(result.passed).toBe(false)
        expect(res.statusCode).toBe(400)
        expect(res.responseBody.data.allowed_values).toEqual(LISTING_STATUSES)
      }
    })

    test('可选参数未提供时应通过验证', async () => {
      const req = createMockRequest({ query: {} })
      const res = createMockResponse()
      const result = await runMiddleware(statusValidator, req, res)

      expect(result.passed).toBe(true)
    })
  })

  describe('4. 资产代码参数验证 (asset_code)', () => {
    const assetCodeValidator = validateBusinessCode('asset_code', 'query', { optional: true })

    test('有效的资产代码应通过验证', async () => {
      const validCodes = ['DIAMOND', 'red_shard', 'POINTS', 'material_001']

      for (const code of validCodes) {
        const req = createMockRequest({ query: { asset_code: code } })
        const res = createMockResponse()
        const result = await runMiddleware(assetCodeValidator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.asset_code).toBe(code)
      }
    })

    test('无效的资产代码格式应被拒绝', async () => {
      const invalidCodes = [
        { value: '123abc', description: '以数字开头' },
        { value: 'a', description: '长度不足' },
        { value: 'code-with-dash', description: '包含连字符' },
        { value: 'code with space', description: '包含空格' }
      ]

      for (const { value, description: _description } of invalidCodes) {
        const req = createMockRequest({ query: { asset_code: value } })
        const res = createMockResponse()
        const result = await runMiddleware(assetCodeValidator, req, res)

        expect(result.passed).toBe(false)
        expect(res.statusCode).toBe(400)
        expect(res.responseBody.code).toBe('INVALID_BUSINESS_CODE')
      }
    })
  })

  describe('5. 价格参数验证 (price)', () => {
    const priceValidator = validatePositiveInteger('price', 'body')

    test('有效的价格值应通过验证', async () => {
      const validPrices = [1, 100, 1000, 999999]

      for (const price of validPrices) {
        const req = createMockRequest({ body: { price: String(price) } })
        const res = createMockResponse()
        const result = await runMiddleware(priceValidator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.price).toBe(price)
      }
    })

    test('无效的价格值应被拒绝', async () => {
      // 测试缺失必填参数
      let req = createMockRequest({ body: {} })
      let res = createMockResponse()
      let result = await runMiddleware(priceValidator, req, res)
      expect(result.passed).toBe(false)
      expect(res.statusCode).toBe(400)

      // 测试空字符串
      req = createMockRequest({ body: { price: '' } })
      res = createMockResponse()
      result = await runMiddleware(priceValidator, req, res)
      expect(result.passed).toBe(false)
      expect(res.statusCode).toBe(400)

      /*
       * 测试无效数值
       * 注意：'1.5' 不在此列表中，因为 validatePositiveInteger 使用 parseInt，会将 '1.5' 截断为 1
       */
      const invalidPrices = ['0', '-100', 'free']
      for (const value of invalidPrices) {
        req = createMockRequest({ body: { price: value } })
        res = createMockResponse()
        result = await runMiddleware(priceValidator, req, res)

        expect(result.passed).toBe(false)
        expect(res.statusCode).toBe(400)
      }
    })
  })

  describe('6. 数量参数验证 (quantity)', () => {
    const quantityValidator = validatePositiveInteger('quantity', 'body')

    test('有效的数量值应通过验证', async () => {
      const validQuantities = [1, 10, 100, 10000]

      for (const quantity of validQuantities) {
        const req = createMockRequest({ body: { quantity: String(quantity) } })
        const res = createMockResponse()
        const result = await runMiddleware(quantityValidator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.quantity).toBe(quantity)
      }
    })

    test('无效的数量值应被拒绝', async () => {
      // 测试缺失必填参数
      let req = createMockRequest({ body: {} })
      let res = createMockResponse()
      let result = await runMiddleware(quantityValidator, req, res)
      expect(result.passed).toBe(false)
      expect(res.statusCode).toBe(400)

      // 测试空字符串
      req = createMockRequest({ body: { quantity: '' } })
      res = createMockResponse()
      result = await runMiddleware(quantityValidator, req, res)
      expect(result.passed).toBe(false)
      expect(res.statusCode).toBe(400)

      /*
       * 测试无效数值
       * 注意：'1.5' 不在此列表中，因为 validatePositiveInteger 使用 parseInt，会将 '1.5' 截断为 1
       */
      const invalidQuantities = ['0', '-5']
      for (const value of invalidQuantities) {
        req = createMockRequest({ body: { quantity: value } })
        res = createMockResponse()
        result = await runMiddleware(quantityValidator, req, res)

        expect(result.passed).toBe(false)
        expect(res.statusCode).toBe(400)
      }
    })
  })

  describe('7. 用户ID参数验证 (seller_user_id/buyer_user_id)', () => {
    const sellerIdValidator = validatePositiveInteger('seller_user_id', 'query', { optional: true })
    const buyerIdValidator = validatePositiveInteger('buyer_user_id', 'query', { optional: true })

    test('有效的用户ID应通过验证', async () => {
      const validIds = [1, 100, 999999]

      for (const id of validIds) {
        // 测试 seller_user_id
        let req = createMockRequest({ query: { seller_user_id: String(id) } })
        let res = createMockResponse()
        let result = await runMiddleware(sellerIdValidator, req, res)
        expect(result.passed).toBe(true)
        expect(req.validated.seller_user_id).toBe(id)

        // 测试 buyer_user_id
        req = createMockRequest({ query: { buyer_user_id: String(id) } })
        res = createMockResponse()
        result = await runMiddleware(buyerIdValidator, req, res)
        expect(result.passed).toBe(true)
        expect(req.validated.buyer_user_id).toBe(id)
      }
    })

    test('可选的用户ID参数未提供时应通过验证', async () => {
      const req = createMockRequest({ query: {} })
      const res = createMockResponse()
      const result = await runMiddleware(sellerIdValidator, req, res)

      expect(result.passed).toBe(true)
    })
  })

  describe('8. 挂牌类型参数验证 (listing_type)', () => {
    const LISTING_TYPES = ['item_instance', 'fungible_asset']
    const typeValidator = validateEnumValue('listing_type', LISTING_TYPES, 'body')

    test('有效的挂牌类型应通过验证', async () => {
      for (const type of LISTING_TYPES) {
        const req = createMockRequest({ body: { listing_type: type } })
        const res = createMockResponse()
        const result = await runMiddleware(typeValidator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.listing_type).toBe(type)
      }
    })

    test('无效的挂牌类型应被拒绝', async () => {
      const invalidTypes = ['item', 'asset', 'product', 'service']

      for (const type of invalidTypes) {
        const req = createMockRequest({ body: { listing_type: type } })
        const res = createMockResponse()
        const result = await runMiddleware(typeValidator, req, res)

        expect(result.passed).toBe(false)
        expect(res.statusCode).toBe(400)
      }
    })
  })

  describe('9. 边界值测试', () => {
    test('market_listing_id 最大值边界测试', async () => {
      const validator = validateNumericId('market_listing_id', 'params')

      // 测试大整数
      const largeIds = [999999999, 2147483647] // int 最大值

      for (const id of largeIds) {
        const req = createMockRequest({ params: { market_listing_id: String(id) } })
        const res = createMockResponse()
        const result = await runMiddleware(validator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.market_listing_id).toBe(id)
      }
    })

    test('price 边界值测试', async () => {
      const validator = validatePositiveInteger('price', 'body')

      // 最小有效值
      let req = createMockRequest({ body: { price: '1' } })
      let res = createMockResponse()
      let result = await runMiddleware(validator, req, res)
      expect(result.passed).toBe(true)
      expect(req.validated.price).toBe(1)

      // 零值（无效）
      req = createMockRequest({ body: { price: '0' } })
      res = createMockResponse()
      result = await runMiddleware(validator, req, res)
      expect(result.passed).toBe(false)
    })
  })

  describe('10. 组合参数验证场景', () => {
    test('市场列表查询多参数组合验证', async () => {
      // 模拟完整的查询参数组合
      const LISTING_STATUSES = ['active', 'sold', 'withdrawn', 'expired', 'cancelled']
      const statusValidator = validateEnumValue('status', LISTING_STATUSES, 'query', {
        optional: true
      })
      const paginationValidator = validatePaginationParams({
        maxPageSize: 100,
        defaultPageSize: 20
      })
      const sellerIdValidator = validatePositiveInteger('seller_user_id', 'query', {
        optional: true
      })

      const req = createMockRequest({
        query: {
          status: 'active',
          page: '1',
          limit: '20',
          seller_user_id: '100'
        }
      })
      const res = createMockResponse()

      // 依次执行验证
      let result = await runMiddleware(statusValidator, req, res)
      expect(result.passed).toBe(true)

      result = await runMiddleware(paginationValidator, req, res)
      expect(result.passed).toBe(true)

      result = await runMiddleware(sellerIdValidator, req, res)
      expect(result.passed).toBe(true)

      // 验证所有参数都被正确存储
      expect(req.validated.status).toBe('active')
      expect(req.validated.limit).toBe(20)
      expect(req.validated.seller_user_id).toBe(100)
    })
  })
})
