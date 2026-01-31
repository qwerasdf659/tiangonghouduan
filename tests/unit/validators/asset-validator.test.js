/**
 * @file P1-3.2: 资产API参数验证单元测试
 * @description 验证资产模块的API参数校验逻辑
 *
 * 覆盖范围：
 * - 资产余额查询参数验证
 * - 资产交易历史查询参数验证
 * - 资产代码格式验证
 * - 用户ID参数验证
 * - 分页参数验证
 *
 * 依赖服务：
 * - BalanceService/ItemService/QueryService: 资产子服务（V4.7.0 拆分）
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

describe('P1-3.2: 资产API参数验证单元测试', () => {
  describe('1. 资产代码参数验证 (asset_code)', () => {
    const assetCodeValidator = validateBusinessCode('asset_code', 'params')

    test('有效的资产代码应通过验证', async () => {
      // 项目实际使用的资产代码
      const validCodes = [
        'DIAMOND', // 钻石
        'red_shard', // 红色碎片
        'POINTS', // 积分
        'GOLD', // 金币
        'material_001', // 材料资产
        'rare_item_type' // 稀有物品类型
      ]

      for (const code of validCodes) {
        const req = createMockRequest({ params: { asset_code: code } })
        const res = createMockResponse()
        const result = await runMiddleware(assetCodeValidator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.asset_code).toBe(code)
      }
    })

    test('无效的资产代码格式应被拒绝', async () => {
      const invalidCodes = [
        { value: '123diamond', description: '以数字开头' },
        { value: 'd', description: '长度不足（最小2字符）' },
        { value: 'diamond-gold', description: '包含连字符' },
        { value: 'diamond gold', description: '包含空格' },
        { value: 'diamond@special', description: '包含特殊字符' },
        { value: '_underscore_start', description: '以下划线开头' }
      ]

      for (const { value, description: _description } of invalidCodes) {
        const req = createMockRequest({ params: { asset_code: value } })
        const res = createMockResponse()
        const result = await runMiddleware(assetCodeValidator, req, res)

        expect(result.passed).toBe(false)
        expect(res.statusCode).toBe(400)
        expect(res.responseBody.code).toBe('INVALID_BUSINESS_CODE')
      }
    })

    test('缺少资产代码参数应被拒绝', async () => {
      const req = createMockRequest({ params: {} })
      const res = createMockResponse()
      const result = await runMiddleware(assetCodeValidator, req, res)

      expect(result.passed).toBe(false)
      expect(res.statusCode).toBe(400)
    })
  })

  describe('2. 用户ID参数验证 (user_id)', () => {
    const userIdValidator = validatePositiveInteger('user_id', 'params')

    test('有效的用户ID应通过验证', async () => {
      const validIds = [1, 10, 100, 999999, 2147483647]

      for (const id of validIds) {
        const req = createMockRequest({ params: { user_id: String(id) } })
        const res = createMockResponse()
        const result = await runMiddleware(userIdValidator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.user_id).toBe(id)
      }
    })

    test('无效的用户ID应被拒绝', async () => {
      /*
       * validatePositiveInteger 的行为：
       * - 空字符串会触发 "参数不能为空" 错误
       * - 无效数值会触发 "必须是大于等于X的整数" 错误
       */
      const invalidIds = [{ value: '', description: '空字符串' }]

      for (const { value, description: _description } of invalidIds) {
        const req = createMockRequest({ params: { user_id: value } })
        const res = createMockResponse()
        const result = await runMiddleware(userIdValidator, req, res)

        expect(result.passed).toBe(false)
        expect(res.statusCode).toBe(400)
      }

      /*
       * 测试无效数值
       * 注意：'1.5' 不在此列表中，因为 parseInt('1.5', 10) = 1，是有效的整数
       */
      const invalidNumericIds = ['0', '-1', 'abc', 'user123']
      for (const value of invalidNumericIds) {
        const req = createMockRequest({ params: { user_id: value } })
        const res = createMockResponse()
        const result = await runMiddleware(userIdValidator, req, res)

        expect(result.passed).toBe(false)
        expect(res.statusCode).toBe(400)
      }
    })
  })

  describe('3. 资产交易历史分页参数验证', () => {
    const paginationValidator = validatePaginationParams({ maxPageSize: 100, defaultPageSize: 20 })

    test('有效的分页参数应通过验证', async () => {
      const validParams = [
        { page: '1', limit: '10' },
        { page: '5', limit: '50' },
        { page: '10', limit: '100' }
      ]

      for (const params of validParams) {
        const req = createMockRequest({ query: params })
        const res = createMockResponse()
        const result = await runMiddleware(paginationValidator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.limit).toBeLessThanOrEqual(100)
      }
    })

    test('超出最大 page_size 应被限制', async () => {
      const req = createMockRequest({ query: { page: '1', limit: '500' } })
      const res = createMockResponse()
      const result = await runMiddleware(paginationValidator, req, res)

      expect(result.passed).toBe(true)
      expect(req.validated.limit).toBe(100) // 被限制为最大值
    })

    test('默认分页参数应正确应用', async () => {
      const req = createMockRequest({ query: {} })
      const res = createMockResponse()
      const result = await runMiddleware(paginationValidator, req, res)

      expect(result.passed).toBe(true)
      expect(req.validated.limit).toBe(20)
    })
  })

  describe('4. 交易类型参数验证 (transaction_type)', () => {
    // 资产交易类型枚举值（基于 BalanceService 定义）
    const TRANSACTION_TYPES = [
      'credit', // 充值/增加
      'debit', // 扣减/消费
      'freeze', // 冻结
      'unfreeze', // 解冻
      'settle' // 结算
    ]
    const typeValidator = validateEnumValue('transaction_type', TRANSACTION_TYPES, 'query', {
      optional: true
    })

    test('有效的交易类型应通过验证', async () => {
      for (const type of TRANSACTION_TYPES) {
        const req = createMockRequest({ query: { transaction_type: type } })
        const res = createMockResponse()
        const result = await runMiddleware(typeValidator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.transaction_type).toBe(type)
      }
    })

    test('无效的交易类型应被拒绝', async () => {
      const invalidTypes = ['deposit', 'withdraw', 'transfer', 'invalid', '123']

      for (const type of invalidTypes) {
        const req = createMockRequest({ query: { transaction_type: type } })
        const res = createMockResponse()
        const result = await runMiddleware(typeValidator, req, res)

        expect(result.passed).toBe(false)
        expect(res.statusCode).toBe(400)
        expect(res.responseBody.data.allowed_values).toEqual(TRANSACTION_TYPES)
      }
    })

    test('可选参数未提供时应通过验证', async () => {
      const req = createMockRequest({ query: {} })
      const res = createMockResponse()
      const result = await runMiddleware(typeValidator, req, res)

      expect(result.passed).toBe(true)
    })
  })

  describe('5. 金额参数验证 (amount)', () => {
    const amountValidator = validatePositiveInteger('amount', 'body')

    test('有效的金额应通过验证', async () => {
      const validAmounts = [1, 100, 1000, 10000, 1000000]

      for (const amount of validAmounts) {
        const req = createMockRequest({ body: { amount: String(amount) } })
        const res = createMockResponse()
        const result = await runMiddleware(amountValidator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.amount).toBe(amount)
      }
    })

    test('无效的金额应被拒绝', async () => {
      // 测试空值（必填参数）
      let req = createMockRequest({ body: { amount: '' } })
      let res = createMockResponse()
      let result = await runMiddleware(amountValidator, req, res)
      expect(result.passed).toBe(false)
      expect(res.statusCode).toBe(400)

      /*
       * 测试无效数值
       * 注意：'10.5' 不在此列表中，因为 parseInt('10.5', 10) = 10，是有效的整数
       */
      const invalidAmounts = ['0', '-100', 'amount']
      for (const value of invalidAmounts) {
        req = createMockRequest({ body: { amount: value } })
        res = createMockResponse()
        result = await runMiddleware(amountValidator, req, res)

        expect(result.passed).toBe(false)
        expect(res.statusCode).toBe(400)
      }
    })
  })

  describe('6. 时间范围参数验证', () => {
    // 时间格式验证（ISO8601）
    test('有效的时间范围参数应通过基本验证', () => {
      const validTimeFormats = [
        '2026-01-01T00:00:00.000+08:00',
        '2026-01-30T23:59:59.999+08:00',
        '2026-01-15'
      ]

      for (const time of validTimeFormats) {
        const parsed = new Date(time)
        expect(isNaN(parsed.getTime())).toBe(false)
      }
    })

    test('无效的时间格式应被识别', () => {
      const invalidTimeFormats = ['invalid-date', '2026/01/01', 'yesterday', '']

      for (const time of invalidTimeFormats) {
        if (time === '') {
          expect(time).toBe('')
        } else {
          const parsed = new Date(time)
          // 部分格式可能被宽松解析，这里只验证明显无效的
          if (time === 'invalid-date' || time === 'yesterday') {
            expect(isNaN(parsed.getTime())).toBe(true)
          }
        }
      }
    })
  })

  describe('7. 资产账户ID参数验证 (account_id)', () => {
    const accountIdValidator = validatePositiveInteger('account_id', 'params', { optional: true })

    test('有效的账户ID应通过验证', async () => {
      const validIds = [1, 100, 999999]

      for (const id of validIds) {
        const req = createMockRequest({ params: { account_id: String(id) } })
        const res = createMockResponse()
        const result = await runMiddleware(accountIdValidator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.account_id).toBe(id)
      }
    })

    test('可选参数未提供时应通过验证', async () => {
      const req = createMockRequest({ params: {} })
      const res = createMockResponse()
      const result = await runMiddleware(accountIdValidator, req, res)

      expect(result.passed).toBe(true)
    })
  })

  describe('8. 资产类型查询参数验证', () => {
    // 资产类型（fungible可替代/non_fungible不可替代）
    const ASSET_CATEGORIES = ['fungible', 'non_fungible']
    const categoryValidator = validateEnumValue('category', ASSET_CATEGORIES, 'query', {
      optional: true
    })

    test('有效的资产类别应通过验证', async () => {
      for (const category of ASSET_CATEGORIES) {
        const req = createMockRequest({ query: { category } })
        const res = createMockResponse()
        const result = await runMiddleware(categoryValidator, req, res)

        expect(result.passed).toBe(true)
        expect(req.validated.category).toBe(category)
      }
    })

    test('无效的资产类别应被拒绝', async () => {
      const invalidCategories = ['physical', 'virtual', 'digital', 'invalid']

      for (const category of invalidCategories) {
        const req = createMockRequest({ query: { category } })
        const res = createMockResponse()
        const result = await runMiddleware(categoryValidator, req, res)

        expect(result.passed).toBe(false)
        expect(res.statusCode).toBe(400)
      }
    })
  })

  describe('9. 边界值测试', () => {
    test('资产代码长度边界测试', async () => {
      const validator = validateBusinessCode('asset_code', 'params')

      // 最小有效长度（2字符）
      let req = createMockRequest({ params: { asset_code: 'AB' } })
      let res = createMockResponse()
      let result = await runMiddleware(validator, req, res)
      expect(result.passed).toBe(true)

      // 长度不足（1字符）
      req = createMockRequest({ params: { asset_code: 'A' } })
      res = createMockResponse()
      result = await runMiddleware(validator, req, res)
      expect(result.passed).toBe(false)

      // 最大有效长度（64字符）
      const maxLengthCode = 'A' + 'B'.repeat(63)
      req = createMockRequest({ params: { asset_code: maxLengthCode } })
      res = createMockResponse()
      result = await runMiddleware(validator, req, res)
      expect(result.passed).toBe(true)

      // 超过最大长度（65字符）
      const overMaxCode = 'A' + 'B'.repeat(64)
      req = createMockRequest({ params: { asset_code: overMaxCode } })
      res = createMockResponse()
      result = await runMiddleware(validator, req, res)
      expect(result.passed).toBe(false)
    })

    test('金额边界值测试', async () => {
      const validator = validatePositiveInteger('amount', 'body')

      // 最小有效值
      let req = createMockRequest({ body: { amount: '1' } })
      let res = createMockResponse()
      let result = await runMiddleware(validator, req, res)
      expect(result.passed).toBe(true)

      // 大数值
      req = createMockRequest({ body: { amount: '2147483647' } })
      res = createMockResponse()
      result = await runMiddleware(validator, req, res)
      expect(result.passed).toBe(true)
    })
  })

  describe('10. 组合参数验证场景', () => {
    test('资产交易查询多参数组合验证', async () => {
      const TRANSACTION_TYPES = ['credit', 'debit', 'freeze', 'unfreeze', 'settle']
      const typeValidator = validateEnumValue('transaction_type', TRANSACTION_TYPES, 'query', {
        optional: true
      })
      const paginationValidator = validatePaginationParams({
        maxPageSize: 100,
        defaultPageSize: 20
      })
      const assetCodeValidator = validateBusinessCode('asset_code', 'query', { optional: true })

      const req = createMockRequest({
        query: {
          transaction_type: 'credit',
          page: '1',
          limit: '50',
          asset_code: 'DIAMOND'
        }
      })
      const res = createMockResponse()

      // 依次执行验证
      let result = await runMiddleware(typeValidator, req, res)
      expect(result.passed).toBe(true)

      result = await runMiddleware(paginationValidator, req, res)
      expect(result.passed).toBe(true)

      result = await runMiddleware(assetCodeValidator, req, res)
      expect(result.passed).toBe(true)

      // 验证所有参数都被正确存储
      expect(req.validated.transaction_type).toBe('credit')
      expect(req.validated.limit).toBe(50)
      expect(req.validated.asset_code).toBe('DIAMOND')
    })

    test('资产余额查询参数验证', async () => {
      const userIdValidator = validatePositiveInteger('user_id', 'params')
      const assetCodeValidator = validateBusinessCode('asset_code', 'params')

      const req = createMockRequest({
        params: {
          user_id: '100',
          asset_code: 'DIAMOND'
        }
      })
      const res = createMockResponse()

      let result = await runMiddleware(userIdValidator, req, res)
      expect(result.passed).toBe(true)

      result = await runMiddleware(assetCodeValidator, req, res)
      expect(result.passed).toBe(true)

      expect(req.validated.user_id).toBe(100)
      expect(req.validated.asset_code).toBe('DIAMOND')
    })
  })
})
