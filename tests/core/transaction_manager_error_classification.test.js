/**
 * TransactionManager 错误分类测试
 *
 * 文件路径：tests/core/transaction_manager_error_classification.test.js
 *
 * **业务场景**：验证 TransactionManager 的智能重试策略
 * **技术规范**：
 *   - P0-3已拍板决策：
 *     - 4xx/业务码：永不重试（attemptCount = 1）
 *     - 死锁/超时类：重试3次（attemptCount = 3）
 *     - 未知错误：最多重试1次（attemptCount = 2）
 *
 * 创建时间：2026-01-09
 * 版本：V4.0.0
 */

'use strict'

const { ErrorCodes } = require('../../constants')
const { getRetryStrategy } = ErrorCodes

describe('TransactionManager 错误分类测试 (P0-3)', () => {
  describe('ErrorCodes.getRetryStrategy - 错误重试策略判定', () => {
    describe('1. 业务错误 - 永不重试 (maxRetries=0)', () => {
      test('PERMISSION_DENIED 权限不足错误不重试', () => {
        const error = new Error('权限不足')
        error.code = 'PERMISSION_DENIED'
        error.statusCode = 403

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(false)
        expect(strategy.maxRetries).toBe(0)
        expect(strategy.reason).toBe('non_retryable_error_code')
        expect(strategy.code).toBe('PERMISSION_DENIED')
      })

      test('INSUFFICIENT_BALANCE 余额不足错误不重试', () => {
        const error = new Error('余额不足')
        error.code = 'INSUFFICIENT_BALANCE'
        error.statusCode = 400

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(false)
        expect(strategy.maxRetries).toBe(0)
        expect(strategy.reason).toBe('non_retryable_error_code')
        expect(strategy.code).toBe('INSUFFICIENT_BALANCE')
      })

      test('DUPLICATE_REQUEST 重复请求错误不重试', () => {
        const error = new Error('重复请求')
        error.code = 'DUPLICATE_REQUEST'
        error.statusCode = 409

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(false)
        expect(strategy.maxRetries).toBe(0)
        expect(strategy.reason).toBe('non_retryable_error_code')
      })

      test('ASSET_NOT_TRADABLE 资产不可交易错误不重试 (P0-4)', () => {
        const error = new Error('该资产类型不可交易')
        error.code = 'ASSET_NOT_TRADABLE'
        error.statusCode = 400

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(false)
        expect(strategy.maxRetries).toBe(0)
        expect(strategy.reason).toBe('non_retryable_error_code')
        expect(strategy.code).toBe('ASSET_NOT_TRADABLE')
      })

      test('RESOURCE_NOT_FOUND 资源不存在错误不重试', () => {
        const error = new Error('资源不存在')
        error.code = 'RESOURCE_NOT_FOUND'
        error.statusCode = 404

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(false)
        expect(strategy.maxRetries).toBe(0)
      })

      test('INVALID_PARAMS 参数错误不重试', () => {
        const error = new Error('参数错误')
        error.code = 'INVALID_PARAMS'
        error.statusCode = 400

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(false)
        expect(strategy.maxRetries).toBe(0)
      })

      test('HTTP 4xx 状态码错误不重试', () => {
        const error = new Error('客户端错误')
        error.statusCode = 400

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(false)
        expect(strategy.maxRetries).toBe(0)
        expect(strategy.reason).toBe('client_error_status_code')
        expect(strategy.code).toBe('HTTP_400')
      })

      test('HTTP 401 未授权错误不重试', () => {
        const error = new Error('未授权')
        error.statusCode = 401

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(false)
        expect(strategy.maxRetries).toBe(0)
        expect(strategy.code).toBe('HTTP_401')
      })

      test('HTTP 403 禁止访问错误不重试', () => {
        const error = new Error('禁止访问')
        error.statusCode = 403

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(false)
        expect(strategy.maxRetries).toBe(0)
        expect(strategy.code).toBe('HTTP_403')
      })

      test('业务错误关键词 "余额不足" 不重试', () => {
        const error = new Error('用户余额不足，无法完成交易')

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(false)
        expect(strategy.maxRetries).toBe(0)
        expect(strategy.reason).toBe('business_error_keyword')
        expect(strategy.code).toBe('BUSINESS_ERROR')
      })

      test('业务错误关键词 "权限不足" 不重试', () => {
        const error = new Error('当前用户权限不足，无法执行此操作')

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(false)
        expect(strategy.maxRetries).toBe(0)
        expect(strategy.reason).toBe('business_error_keyword')
      })

      test('业务错误关键词 "不存在" 不重试', () => {
        const error = new Error('该商品不存在')

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(false)
        expect(strategy.maxRetries).toBe(0)
        expect(strategy.reason).toBe('business_error_keyword')
      })

      test('业务错误关键词 "不可交易" 不重试', () => {
        const error = new Error('该资产类型不可交易')

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(false)
        expect(strategy.maxRetries).toBe(0)
        expect(strategy.reason).toBe('business_error_keyword')
      })
    })

    describe('2. 可重试错误 - 重试3次 (maxRetries=3)', () => {
      test('DATABASE_DEADLOCK 数据库死锁错误重试3次', () => {
        const error = new Error('Deadlock found')
        error.code = 'DATABASE_DEADLOCK'

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(true)
        expect(strategy.maxRetries).toBe(3)
        expect(strategy.reason).toBe('retryable_error_code')
        expect(strategy.code).toBe('DATABASE_DEADLOCK')
      })

      test('DATABASE_TIMEOUT 数据库超时错误重试3次', () => {
        const error = new Error('Query timeout')
        error.code = 'DATABASE_TIMEOUT'

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(true)
        expect(strategy.maxRetries).toBe(3)
        expect(strategy.reason).toBe('retryable_error_code')
      })

      test('REDIS_CONNECTION_ERROR Redis连接错误重试3次', () => {
        const error = new Error('Redis connection failed')
        error.code = 'REDIS_CONNECTION_ERROR'

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(true)
        expect(strategy.maxRetries).toBe(3)
      })

      test('EXTERNAL_SERVICE_ERROR 外部服务错误重试3次', () => {
        const error = new Error('External service unavailable')
        error.code = 'EXTERNAL_SERVICE_ERROR'

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(true)
        expect(strategy.maxRetries).toBe(3)
      })

      test('可重试错误关键词 "deadlock" 重试3次', () => {
        const error = new Error('Deadlock found when trying to get lock')

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(true)
        expect(strategy.maxRetries).toBe(3)
        expect(strategy.reason).toBe('retryable_error_keyword')
        expect(strategy.code).toBe('RETRYABLE_ERROR')
      })

      test('可重试错误关键词 "lock wait timeout" 重试3次', () => {
        const error = new Error('Lock wait timeout exceeded')

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(true)
        expect(strategy.maxRetries).toBe(3)
        expect(strategy.reason).toBe('retryable_error_keyword')
      })

      test('可重试错误关键词 "connection" 重试3次', () => {
        const error = new Error('Connection refused')

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(true)
        expect(strategy.maxRetries).toBe(3)
        expect(strategy.reason).toBe('retryable_error_keyword')
      })

      test('可重试错误关键词 "timeout" 重试3次', () => {
        const error = new Error('Operation timeout after 30000ms')

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(true)
        expect(strategy.maxRetries).toBe(3)
        expect(strategy.reason).toBe('retryable_error_keyword')
      })
    })

    describe('3. 未知错误 - 重试1次 (maxRetries=1)', () => {
      test('无错误码的普通错误重试1次', () => {
        const error = new Error('Something went wrong')

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(true)
        expect(strategy.maxRetries).toBe(1)
        expect(strategy.reason).toBe('unknown_error')
        expect(strategy.code).toBe('UNKNOWN')
      })

      test('未知错误码的错误重试1次', () => {
        const error = new Error('Unknown error')
        error.code = 'SOME_UNKNOWN_CODE'

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(true)
        expect(strategy.maxRetries).toBe(1)
        expect(strategy.reason).toBe('unknown_error')
      })

      test('HTTP 5xx 但无特殊关键词的错误重试1次', () => {
        const error = new Error('Internal server error')
        error.statusCode = 500

        const strategy = getRetryStrategy(error)

        // 5xx 不在 4xx 范围内，没有特殊关键词，属于未知错误
        expect(strategy.retryable).toBe(true)
        expect(strategy.maxRetries).toBe(1)
        expect(strategy.reason).toBe('unknown_error')
      })
    })

    describe('4. 边界情况测试', () => {
      test('空错误消息不应崩溃', () => {
        const error = new Error('')

        const strategy = getRetryStrategy(error)

        expect(strategy).toBeDefined()
        expect(typeof strategy.retryable).toBe('boolean')
        expect(typeof strategy.maxRetries).toBe('number')
      })

      test('null错误消息不应崩溃', () => {
        const error = new Error()
        error.message = null

        const strategy = getRetryStrategy(error)

        expect(strategy).toBeDefined()
      })

      test('错误码优先于HTTP状态码', () => {
        const error = new Error('业务错误')
        error.code = 'INSUFFICIENT_BALANCE'
        error.statusCode = 500 // 即使是5xx，有明确业务码仍不重试

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(false)
        expect(strategy.maxRetries).toBe(0)
        expect(strategy.reason).toBe('non_retryable_error_code')
      })

      test('错误码优先于错误消息关键词', () => {
        const error = new Error('Deadlock found') // 消息包含可重试关键词
        error.code = 'PERMISSION_DENIED' // 但错误码是不可重试的

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(false)
        expect(strategy.maxRetries).toBe(0)
        expect(strategy.reason).toBe('non_retryable_error_code')
      })

      test('HTTP状态码优先于消息关键词', () => {
        const error = new Error('timeout') // 消息包含可重试关键词
        error.statusCode = 400 // 但状态码是4xx

        const strategy = getRetryStrategy(error)

        expect(strategy.retryable).toBe(false)
        expect(strategy.maxRetries).toBe(0)
        expect(strategy.reason).toBe('client_error_status_code')
      })
    })
  })

  describe('ErrorCodes 辅助函数测试', () => {
    test('isNonRetryableError 正确识别不可重试错误码', () => {
      expect(ErrorCodes.isNonRetryableError('PERMISSION_DENIED')).toBe(true)
      expect(ErrorCodes.isNonRetryableError('INSUFFICIENT_BALANCE')).toBe(true)
      expect(ErrorCodes.isNonRetryableError('ASSET_NOT_TRADABLE')).toBe(true)
      expect(ErrorCodes.isNonRetryableError('DATABASE_DEADLOCK')).toBe(false)
      expect(ErrorCodes.isNonRetryableError('UNKNOWN_CODE')).toBe(false)
    })

    test('isRetryableError 正确识别可重试错误码', () => {
      expect(ErrorCodes.isRetryableError('DATABASE_DEADLOCK')).toBe(true)
      expect(ErrorCodes.isRetryableError('DATABASE_TIMEOUT')).toBe(true)
      expect(ErrorCodes.isRetryableError('REDIS_CONNECTION_ERROR')).toBe(true)
      expect(ErrorCodes.isRetryableError('PERMISSION_DENIED')).toBe(false)
      expect(ErrorCodes.isRetryableError('UNKNOWN_CODE')).toBe(false)
    })

    test('isBusinessErrorByMessage 正确识别业务错误消息', () => {
      expect(ErrorCodes.isBusinessErrorByMessage('余额不足')).toBe(true)
      expect(ErrorCodes.isBusinessErrorByMessage('权限不足')).toBe(true)
      expect(ErrorCodes.isBusinessErrorByMessage('资源不存在')).toBe(true)
      expect(ErrorCodes.isBusinessErrorByMessage('不可交易')).toBe(true)
      expect(ErrorCodes.isBusinessErrorByMessage('Deadlock found')).toBe(false)
      expect(ErrorCodes.isBusinessErrorByMessage(null)).toBe(false)
      expect(ErrorCodes.isBusinessErrorByMessage('')).toBe(false)
    })

    test('isRetryableErrorByMessage 正确识别可重试错误消息', () => {
      expect(ErrorCodes.isRetryableErrorByMessage('Deadlock found')).toBe(true)
      expect(ErrorCodes.isRetryableErrorByMessage('Lock wait timeout')).toBe(true)
      expect(ErrorCodes.isRetryableErrorByMessage('Connection refused')).toBe(true)
      expect(ErrorCodes.isRetryableErrorByMessage('余额不足')).toBe(false)
      expect(ErrorCodes.isRetryableErrorByMessage(null)).toBe(false)
      expect(ErrorCodes.isRetryableErrorByMessage('')).toBe(false)
    })
  })

  describe('常量导出验证', () => {
    test('NON_RETRYABLE_ERROR_CODES 包含所有预期的业务错误码', () => {
      const expectedCodes = [
        'PERMISSION_DENIED',
        'INVALID_PARAMS',
        'RESOURCE_NOT_FOUND',
        'INSUFFICIENT_BALANCE',
        'DUPLICATE_REQUEST',
        'BUSINESS_RULE_VIOLATION',
        'ASSET_NOT_TRADABLE'
      ]

      expectedCodes.forEach(code => {
        expect(ErrorCodes.NON_RETRYABLE_ERROR_CODES).toContain(code)
      })
    })

    test('RETRYABLE_ERROR_CODES 包含所有预期的系统错误码', () => {
      const expectedCodes = [
        'DATABASE_DEADLOCK',
        'DATABASE_TIMEOUT',
        'REDIS_CONNECTION_ERROR',
        'EXTERNAL_SERVICE_ERROR'
      ]

      expectedCodes.forEach(code => {
        expect(ErrorCodes.RETRYABLE_ERROR_CODES).toContain(code)
      })
    })

    test('BUSINESS_ERROR_KEYWORDS 包含中文业务错误关键词', () => {
      expect(ErrorCodes.BUSINESS_ERROR_KEYWORDS).toContain('余额不足')
      expect(ErrorCodes.BUSINESS_ERROR_KEYWORDS).toContain('权限不足')
      expect(ErrorCodes.BUSINESS_ERROR_KEYWORDS).toContain('不存在')
      expect(ErrorCodes.BUSINESS_ERROR_KEYWORDS).toContain('不可交易')
    })

    test('RETRYABLE_ERROR_KEYWORDS 包含系统错误关键词', () => {
      expect(ErrorCodes.RETRYABLE_ERROR_KEYWORDS).toContain('deadlock')
      expect(ErrorCodes.RETRYABLE_ERROR_KEYWORDS).toContain('timeout')
      expect(ErrorCodes.RETRYABLE_ERROR_KEYWORDS).toContain('connection')
    })
  })
})
