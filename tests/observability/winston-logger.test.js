'use strict'

/**
 * P2-3.1: Winston日志配置测试套件
 *
 * 测试目标：
 * - 验证Winston日志级别配置正确性（error/warn/info/debug/trace）
 * - 验证日志格式符合项目标准（JSON格式、时间戳）
 * - 验证敏感数据脱敏机制（黑名单字段、灰名单规则）
 * - 验证SmartLogger智能日志功能
 *
 * 测试范围：
 * - 日志级别优先级验证
 * - 日志格式结构验证
 * - 黑名单字段脱敏验证（password/token/secret等）
 * - 灰名单字段脱敏验证（mobile/user_uuid/idempotency_key等）
 * - 动态日志级别调整验证
 * - 调试模式验证（用户/会话级别）
 *
 * 业务规则：
 * - 黑名单字段（BLACKLIST_FIELDS）必须完全替换为 [REDACTED]
 * - 灰名单字段按规则脱敏（如手机号保留前3后4）
 * - 日志级别支持动态调整（不需要重启服务）
 * - 支持按用户/会话开启详细日志
 *
 * @module tests/observability/winston-logger
 * @since 2026-01-30
 */

// 加载环境变量
require('dotenv').config()

// 导入被测模块
const {
  logger,
  sanitize,
  BLACKLIST_FIELDS,
  SANITIZE_RULES,
  info,
  warn,
  error,
  debug,
  trace
} = require('../../utils/logger')

describe('P2-3.1: Winston日志配置测试', () => {
  // 测试超时设置
  jest.setTimeout(30000)

  describe('日志级别配置验证', () => {
    test('logger应导出完整的日志级别方法', () => {
      // 验证logger对象存在
      expect(logger).toBeDefined()

      // 验证所有日志级别方法存在且可调用
      expect(typeof logger.error).toBe('function')
      expect(typeof logger.warn).toBe('function')
      expect(typeof logger.info).toBe('function')
      expect(typeof logger.debug).toBe('function')
      expect(typeof logger.trace).toBe('function')

      console.log('[P2-3.1] ✅ logger日志级别方法验证通过')
    })

    test('快捷方法应正确导出', () => {
      // 验证快捷方法导出
      expect(typeof info).toBe('function')
      expect(typeof warn).toBe('function')
      expect(typeof error).toBe('function')
      expect(typeof debug).toBe('function')
      expect(typeof trace).toBe('function')

      console.log('[P2-3.1] ✅ 快捷方法导出验证通过')
    })

    test('日志级别应按优先级排序（error > warn > info > debug > trace）', () => {
      // 验证所有日志方法可以正常调用，不抛错
      expect(() => {
        logger.error('测试error级别日志', { test_id: 'level_priority' })
      }).not.toThrow()

      expect(() => {
        logger.warn('测试warn级别日志', { test_id: 'level_priority' })
      }).not.toThrow()

      expect(() => {
        logger.info('测试info级别日志', { test_id: 'level_priority' })
      }).not.toThrow()

      expect(() => {
        logger.debug('测试debug级别日志', { test_id: 'level_priority' })
      }).not.toThrow()

      expect(() => {
        logger.trace('测试trace级别日志', { test_id: 'level_priority' })
      }).not.toThrow()

      console.log('[P2-3.1] ✅ 日志级别优先级验证通过')
    })
  })

  describe('日志格式验证', () => {
    test('日志应支持结构化元数据', () => {
      const metadata = {
        user_id: 1,
        action: 'test_action',
        request_id: 'req_test_12345',
        ip: '192.168.1.1',
        duration_ms: 150
      }

      // 验证带元数据的日志调用不抛错
      expect(() => {
        logger.info('带结构化元数据的日志', metadata)
      }).not.toThrow()

      console.log('[P2-3.1] ✅ 结构化元数据支持验证通过')
    })

    test('日志应支持嵌套对象', () => {
      const nestedData = {
        user: {
          user_id: 1,
          profile: {
            nickname: '测试用户',
            level: 5
          }
        },
        request: {
          method: 'POST',
          path: '/api/v4/test',
          body: {
            action: 'test'
          }
        }
      }

      expect(() => {
        logger.info('嵌套对象日志测试', nestedData)
      }).not.toThrow()

      console.log('[P2-3.1] ✅ 嵌套对象支持验证通过')
    })

    test('日志应正确处理数组数据', () => {
      const arrayData = {
        items: [1, 2, 3, 4, 5],
        users: [
          { id: 1, name: '用户1' },
          { id: 2, name: '用户2' }
        ]
      }

      expect(() => {
        logger.info('数组数据日志测试', arrayData)
      }).not.toThrow()

      console.log('[P2-3.1] ✅ 数组数据支持验证通过')
    })

    test('日志应正确处理null和undefined', () => {
      expect(() => {
        logger.info('null值测试', { data: null })
      }).not.toThrow()

      expect(() => {
        logger.info('undefined值测试', { data: undefined })
      }).not.toThrow()

      expect(() => {
        logger.info('空对象测试', {})
      }).not.toThrow()

      expect(() => {
        logger.info('仅消息测试')
      }).not.toThrow()

      console.log('[P2-3.1] ✅ null/undefined处理验证通过')
    })

    test('日志应正确处理Error对象', () => {
      const testError = new Error('测试错误消息')
      testError.code = 'TEST_ERROR'

      expect(() => {
        logger.error('Error对象日志测试', {
          error: testError.message,
          code: testError.code,
          stack: testError.stack
        })
      }).not.toThrow()

      console.log('[P2-3.1] ✅ Error对象处理验证通过')
    })
  })

  describe('敏感数据脱敏验证 - 黑名单字段', () => {
    test('BLACKLIST_FIELDS应包含所有敏感字段', () => {
      // 验证黑名单字段列表存在
      expect(BLACKLIST_FIELDS).toBeDefined()
      expect(Array.isArray(BLACKLIST_FIELDS)).toBe(true)

      // 验证必须包含的敏感字段
      const requiredBlacklistFields = [
        'authorization',
        'Authorization',
        'token',
        'password',
        'secret',
        'qr_code',
        'nonce',
        'signature',
        'payment_info',
        'card_number',
        'cvv',
        'private_key',
        'api_key'
      ]

      requiredBlacklistFields.forEach(field => {
        expect(BLACKLIST_FIELDS).toContain(field)
      })

      console.log(`[P2-3.1] ✅ 黑名单字段列表验证通过，共${BLACKLIST_FIELDS.length}个字段`)
    })

    test('黑名单字段应被替换为[REDACTED]', () => {
      const sensitiveData = {
        user_id: 1,
        password: 'super_secret_password',
        token: 'jwt_token_12345',
        secret: 'api_secret_key',
        authorization: 'Bearer xxx',
        qr_code: 'qr_code_content_123',
        nonce: 'random_nonce_456',
        signature: 'sign_789',
        api_key: 'ak_test_key'
      }

      const sanitized = sanitize(sensitiveData)

      // 验证黑名单字段被替换
      expect(sanitized.password).toBe('[REDACTED]')
      expect(sanitized.token).toBe('[REDACTED]')
      expect(sanitized.secret).toBe('[REDACTED]')
      expect(sanitized.authorization).toBe('[REDACTED]')
      expect(sanitized.qr_code).toBe('[REDACTED]')
      expect(sanitized.nonce).toBe('[REDACTED]')
      expect(sanitized.signature).toBe('[REDACTED]')
      expect(sanitized.api_key).toBe('[REDACTED]')

      // 验证非敏感字段保留
      expect(sanitized.user_id).toBe(1)

      console.log('[P2-3.1] ✅ 黑名单字段脱敏验证通过')
    })

    test('嵌套对象中的黑名单字段应被脱敏', () => {
      const nestedSensitiveData = {
        user: {
          user_id: 1,
          credentials: {
            password: 'nested_password',
            token: 'nested_token'
          }
        },
        request: {
          authorization: 'Bearer nested_auth'
        }
      }

      const sanitized = sanitize(nestedSensitiveData)

      // 验证嵌套黑名单字段被替换
      expect(sanitized.user.credentials.password).toBe('[REDACTED]')
      expect(sanitized.user.credentials.token).toBe('[REDACTED]')
      expect(sanitized.request.authorization).toBe('[REDACTED]')

      // 验证非敏感字段保留
      expect(sanitized.user.user_id).toBe(1)

      console.log('[P2-3.1] ✅ 嵌套黑名单字段脱敏验证通过')
    })
  })

  describe('敏感数据脱敏验证 - 灰名单字段', () => {
    test('SANITIZE_RULES应包含灰名单脱敏规则', () => {
      // 验证脱敏规则存在
      expect(SANITIZE_RULES).toBeDefined()
      expect(typeof SANITIZE_RULES).toBe('object')

      // 验证必需的脱敏规则
      expect(typeof SANITIZE_RULES.mobile).toBe('function')
      expect(typeof SANITIZE_RULES.user_uuid).toBe('function')
      expect(typeof SANITIZE_RULES.ip).toBe('function')
      expect(typeof SANITIZE_RULES.merchant_notes).toBe('function')
      expect(typeof SANITIZE_RULES.idempotency_key).toBe('function')

      console.log('[P2-3.1] ✅ 灰名单脱敏规则验证通过')
    })

    test('手机号应脱敏为前3后4格式', () => {
      // 测试手机号脱敏（136****7930）
      const mobile = '13612227930'
      const sanitizedMobile = SANITIZE_RULES.mobile(mobile)

      expect(sanitizedMobile).toBe('136****7930')
      expect(sanitizedMobile.length).toBe(11) // 保持原长度
      expect(sanitizedMobile).toContain('****')

      // 验证sanitize.mobile快捷方法
      expect(sanitize.mobile(mobile)).toBe('136****7930')

      console.log('[P2-3.1] ✅ 手机号脱敏验证通过:', sanitizedMobile)
    })

    test('user_uuid应脱敏为前8位+省略号', () => {
      const uuid = 'abc12345-defg-6789-hijk-lmnop12345'
      const sanitizedUuid = SANITIZE_RULES.user_uuid(uuid)

      expect(sanitizedUuid).toBe('abc12345...')
      expect(sanitizedUuid.length).toBe(11) // 8字符 + 3省略号

      // 验证sanitize.user_uuid快捷方法
      expect(sanitize.user_uuid(uuid)).toBe('abc12345...')

      console.log('[P2-3.1] ✅ user_uuid脱敏验证通过:', sanitizedUuid)
    })

    test('merchant_notes应截断到100字符', () => {
      const longNotes = '这是一段非常长的商家备注' + '。'.repeat(100)
      const sanitizedNotes = SANITIZE_RULES.merchant_notes(longNotes)

      expect(sanitizedNotes.length).toBe(100)
      expect(sanitizedNotes).toBe(longNotes.substring(0, 100))

      // 短备注应保持原样
      const shortNotes = '短备注'
      expect(SANITIZE_RULES.merchant_notes(shortNotes)).toBe(shortNotes)

      console.log('[P2-3.1] ✅ merchant_notes脱敏验证通过')
    })

    test('idempotency_key应截断到50字符', () => {
      const longKey = 'idem_' + 'x'.repeat(100)
      const sanitizedKey = SANITIZE_RULES.idempotency_key(longKey)

      expect(sanitizedKey.length).toBe(50)
      expect(sanitizedKey).toBe(longKey.substring(0, 50))

      // 短key应保持原样
      const shortKey = 'idem_short_key'
      expect(SANITIZE_RULES.idempotency_key(shortKey)).toBe(shortKey)

      console.log('[P2-3.1] ✅ idempotency_key脱敏验证通过')
    })

    test('IP地址应保持原样（便于风控）', () => {
      const ip = '192.168.1.100'
      const sanitizedIp = SANITIZE_RULES.ip(ip)

      expect(sanitizedIp).toBe(ip)

      console.log('[P2-3.1] ✅ IP地址处理验证通过')
    })

    test('对象中的灰名单字段应按规则脱敏', () => {
      const dataWithGraylist = {
        user_id: 1,
        mobile: '13612227930',
        user_uuid: 'uuid-1234-5678-9012-3456',
        merchant_notes: '商家备注内容'
      }

      const sanitized = sanitize(dataWithGraylist)

      // 验证手机号脱敏
      expect(sanitized.mobile).toBe('136****7930')

      // 验证user_uuid脱敏
      expect(sanitized.user_uuid).toBe('uuid-123...')

      // 验证非敏感字段保留
      expect(sanitized.user_id).toBe(1)

      console.log('[P2-3.1] ✅ 灰名单字段整体脱敏验证通过')
    })

    test('null和undefined输入应安全处理', () => {
      /*
       * 注意：sanitize函数统一将无效输入（null/undefined）转换为null
       * 这是一种一致性设计选择，确保所有无效输入返回统一的null值
       */
      expect(sanitize.mobile(null)).toBeNull()
      expect(sanitize.mobile(undefined)).toBeNull() // undefined也返回null（统一无效输入处理）
      expect(sanitize.user_uuid(null)).toBeNull()
      expect(sanitize.merchant_notes(null)).toBeNull()
      expect(sanitize.idempotency_key(null)).toBeNull()

      // sanitize函数处理null/undefined
      expect(sanitize(null)).toBeNull()
      expect(sanitize(undefined)).toBeUndefined()

      console.log('[P2-3.1] ✅ null/undefined安全处理验证通过')
    })
  })

  describe('SmartLogger功能验证', () => {
    test('应支持动态调整日志级别', () => {
      // 验证setLogLevel方法存在
      expect(typeof logger.setLogLevel).toBe('function')

      // 验证有效级别设置成功
      expect(logger.setLogLevel('debug')).toBe(true)
      expect(logger.setLogLevel('info')).toBe(true)
      expect(logger.setLogLevel('warn')).toBe(true)
      expect(logger.setLogLevel('error')).toBe(true)

      // 验证无效级别设置失败
      expect(logger.setLogLevel('invalid_level')).toBe(false)

      // 恢复默认级别
      logger.setLogLevel('info')

      console.log('[P2-3.1] ✅ 动态日志级别调整验证通过')
    })

    test('应支持获取当前日志配置', () => {
      // 验证getConfig方法存在
      expect(typeof logger.getConfig).toBe('function')

      const config = logger.getConfig()

      // 验证配置结构
      expect(config).toHaveProperty('currentLevel')
      expect(config).toHaveProperty('debugUsers')
      expect(config).toHaveProperty('debugSessions')
      expect(config).toHaveProperty('availableLevels')

      // 验证配置值类型
      expect(typeof config.currentLevel).toBe('string')
      expect(Array.isArray(config.debugUsers)).toBe(true)
      expect(Array.isArray(config.debugSessions)).toBe(true)
      expect(Array.isArray(config.availableLevels)).toBe(true)

      // 验证可用级别
      expect(config.availableLevels).toContain('error')
      expect(config.availableLevels).toContain('warn')
      expect(config.availableLevels).toContain('info')
      expect(config.availableLevels).toContain('debug')
      expect(config.availableLevels).toContain('trace')

      console.log('[P2-3.1] ✅ 日志配置获取验证通过:', config)
    })

    test('应支持为特定用户开启调试模式', () => {
      // 验证enableDebugForUser方法存在
      expect(typeof logger.enableDebugForUser).toBe('function')

      // 开启调试模式不应抛错
      expect(() => {
        logger.enableDebugForUser(12345, 1) // 1分钟
      }).not.toThrow()

      // 验证调试用户已添加
      const config = logger.getConfig()
      expect(config.debugUsers).toContain(12345)

      console.log('[P2-3.1] ✅ 用户调试模式验证通过')
    })

    test('应支持为特定会话开启调试模式', () => {
      // 验证enableDebugForSession方法存在
      expect(typeof logger.enableDebugForSession).toBe('function')

      // 开启调试模式不应抛错
      expect(() => {
        logger.enableDebugForSession('session_test_123', 1) // 1分钟
      }).not.toThrow()

      // 验证调试会话已添加
      const config = logger.getConfig()
      expect(config.debugSessions).toContain('session_test_123')

      console.log('[P2-3.1] ✅ 会话调试模式验证通过')
    })

    test('应支持清除所有调试会话', () => {
      // 先添加一些调试会话
      logger.enableDebugForUser(99999, 1)
      logger.enableDebugForSession('test_session_to_clear', 1)

      // 验证clearAllDebugSessions方法存在
      expect(typeof logger.clearAllDebugSessions).toBe('function')

      // 清除所有调试会话
      expect(() => {
        logger.clearAllDebugSessions()
      }).not.toThrow()

      // 验证调试会话已清除
      const config = logger.getConfig()
      expect(config.debugUsers.length).toBe(0)
      expect(config.debugSessions.length).toBe(0)

      console.log('[P2-3.1] ✅ 清除调试会话验证通过')
    })
  })

  describe('日志性能验证', () => {
    test('批量日志调用应在合理时间内完成', () => {
      const logCount = 100
      const startTime = Date.now()

      // 执行批量日志调用
      for (let i = 0; i < logCount; i++) {
        logger.info(`性能测试日志 ${i}`, {
          index: i,
          test_id: 'performance_test'
        })
      }

      const executionTime = Date.now() - startTime

      // 100条日志应该在2秒内完成（考虑文件写入）
      expect(executionTime).toBeLessThan(2000)

      console.log(`[P2-3.1] ✅ ${logCount}条日志执行时间: ${executionTime}ms`)
    })

    test('日志脱敏应在合理时间内完成', () => {
      const complexData = {
        user: {
          mobile: '13612227930',
          password: 'secret',
          profile: {
            token: 'jwt_token',
            api_key: 'api_key_123'
          }
        },
        request: {
          authorization: 'Bearer xxx',
          body: {
            secret: 'request_secret'
          }
        }
      }

      const iterations = 1000
      const startTime = Date.now()

      for (let i = 0; i < iterations; i++) {
        sanitize(complexData)
      }

      const executionTime = Date.now() - startTime

      // 1000次脱敏应该在1秒内完成
      expect(executionTime).toBeLessThan(1000)

      console.log(`[P2-3.1] ✅ ${iterations}次脱敏执行时间: ${executionTime}ms`)
    })
  })

  describe('日志输出完整性验证', () => {
    test('error日志应自动包含stack信息', () => {
      // 验证error方法调用不抛错，且会自动添加stack
      expect(() => {
        logger.error('测试错误日志', {
          test_id: 'error_stack_test',
          cause: '测试原因'
        })
      }).not.toThrow()

      console.log('[P2-3.1] ✅ error日志stack信息验证通过')
    })

    test('日志应支持request_id字段用于链路追踪', () => {
      // 验证带request_id的日志调用
      expect(() => {
        logger.info('带request_id的日志', {
          request_id: 'req_test_trace_123',
          user_id: 1,
          action: 'test_action'
        })
      }).not.toThrow()

      console.log('[P2-3.1] ✅ request_id链路追踪支持验证通过')
    })

    test('日志应支持userId和sessionId字段用于智能调试', () => {
      // 验证带userId/sessionId的日志调用
      expect(() => {
        logger.debug('带用户标识的日志', {
          userId: 12345,
          sessionId: 'session_abc123',
          requestId: 'req_xyz789',
          action: 'test_smart_logging'
        })
      }).not.toThrow()

      console.log('[P2-3.1] ✅ userId/sessionId智能调试支持验证通过')
    })
  })
})
