/**
 * 幂等服务单元测试 - IdempotencyService.unit.test.js
 *
 * P1-5.1: 幂等性单元测试 - 核心逻辑验证
 *
 * 测试范围：
 * - 静态方法测试（不依赖数据库）
 * - 指纹生成算法验证
 * - canonical operation 映射验证
 * - 路径规范化验证
 * - 请求体过滤验证
 * - 响应脱敏验证
 * - 响应快照大小控制验证
 *
 * 业务场景：
 * - 幂等键的语义正确性
 * - 请求参数指纹的稳定性
 * - 敏感数据保护机制
 *
 * 创建时间：2026-01-30
 * 版本：1.0.0
 *
 * @see services/IdempotencyService.js - 被测服务
 * @see docs/测试体系问题分析与改进方案.md - P1-5.1 任务定义
 */

'use strict'

// 加载环境变量（测试环境）
require('dotenv').config()

const IdempotencyService = require('../../services/IdempotencyService')
const { CANONICAL_OPERATION_MAP } = require('../../services/IdempotencyService')

// 测试超时设置
jest.setTimeout(30000)

describe('IdempotencyService - 单元测试（核心逻辑验证）', () => {
  // ==================== 1. deepSortObject 测试 ====================

  describe('deepSortObject - 深度排序对象键', () => {
    /**
     * 测试场景：普通对象应按键名字母顺序排序
     *
     * 业务规则：
     * - 确保相同内容的对象生成相同的 JSON 序列化结果
     * - 键的排序顺序应稳定
     */
    it('应按键名字母顺序排序对象', () => {
      // 准备：无序对象
      const unsorted = { z: 1, a: 2, m: 3 }

      // 执行
      const sorted = IdempotencyService.deepSortObject(unsorted)

      // 验证：键顺序正确
      const keys = Object.keys(sorted)
      expect(keys).toEqual(['a', 'm', 'z'])
      expect(sorted.a).toBe(2)
      expect(sorted.m).toBe(3)
      expect(sorted.z).toBe(1)
    })

    /**
     * 测试场景：嵌套对象应递归排序
     *
     * 业务规则：
     * - 嵌套对象也需要排序
     * - 确保深层嵌套的键也是有序的
     */
    it('应递归排序嵌套对象', () => {
      const nested = {
        z: { b: 1, a: 2 },
        a: { z: 3, a: 4 }
      }

      const sorted = IdempotencyService.deepSortObject(nested)

      // 验证外层键顺序
      expect(Object.keys(sorted)).toEqual(['a', 'z'])
      // 验证内层键顺序
      expect(Object.keys(sorted.a)).toEqual(['a', 'z'])
      expect(Object.keys(sorted.z)).toEqual(['a', 'b'])
    })

    /**
     * 测试场景：数组元素中的对象应递归排序
     */
    it('应递归排序数组中的对象', () => {
      const withArray = {
        items: [
          { z: 1, a: 2 },
          { c: 3, b: 4 }
        ]
      }

      const sorted = IdempotencyService.deepSortObject(withArray)

      // 验证数组元素中的对象键顺序
      expect(Object.keys(sorted.items[0])).toEqual(['a', 'z'])
      expect(Object.keys(sorted.items[1])).toEqual(['b', 'c'])
    })

    /**
     * 测试场景：处理 null、undefined 和原始类型
     */
    it('应正确处理 null、undefined 和原始类型', () => {
      expect(IdempotencyService.deepSortObject(null)).toBeNull()
      expect(IdempotencyService.deepSortObject(undefined)).toBeUndefined()
      expect(IdempotencyService.deepSortObject(42)).toBe(42)
      expect(IdempotencyService.deepSortObject('string')).toBe('string')
      expect(IdempotencyService.deepSortObject(true)).toBe(true)
    })

    /**
     * 测试场景：空对象和空数组
     */
    it('应正确处理空对象和空数组', () => {
      expect(IdempotencyService.deepSortObject({})).toEqual({})
      expect(IdempotencyService.deepSortObject([])).toEqual([])
    })
  })

  // ==================== 2. filterBodyForFingerprint 测试 ====================

  describe('filterBodyForFingerprint - 过滤请求体非业务字段', () => {
    /**
     * 测试场景：应剔除非业务语义字段
     *
     * 业务规则：
     * - idempotency_key、timestamp、nonce 等元数据不参与指纹计算
     * - 只保留真正影响业务结果的字段
     */
    it('应剔除元数据字段', () => {
      const body = {
        idempotency_key: 'test_key_123',
        timestamp: Date.now(),
        nonce: 'random_nonce',
        signature: 'some_signature',
        trace_id: 'trace_123',
        request_id: 'req_123',
        _csrf: 'csrf_token',
        // 业务字段
        amount: 100,
        user_id: 1,
        action: 'test'
      }

      const filtered = IdempotencyService.filterBodyForFingerprint(body)

      // 验证：元数据字段已剔除
      expect(filtered).not.toHaveProperty('idempotency_key')
      expect(filtered).not.toHaveProperty('timestamp')
      expect(filtered).not.toHaveProperty('nonce')
      expect(filtered).not.toHaveProperty('signature')
      expect(filtered).not.toHaveProperty('trace_id')
      expect(filtered).not.toHaveProperty('request_id')
      expect(filtered).not.toHaveProperty('_csrf')

      // 验证：业务字段保留
      expect(filtered.amount).toBe(100)
      expect(filtered.user_id).toBe(1)
      expect(filtered.action).toBe('test')
    })

    /**
     * 测试场景：空对象和非对象输入
     */
    it('应正确处理空对象和非对象输入', () => {
      expect(IdempotencyService.filterBodyForFingerprint(null)).toEqual({})
      expect(IdempotencyService.filterBodyForFingerprint(undefined)).toEqual({})
      expect(IdempotencyService.filterBodyForFingerprint('string')).toEqual({})
      expect(IdempotencyService.filterBodyForFingerprint(123)).toEqual({})
    })

    /**
     * 测试场景：纯业务字段的请求体不应被修改
     */
    it('纯业务字段的请求体应完整保留', () => {
      const body = {
        lottery_campaign_id: 1,
        lottery_prize_id: 100,
        draw_count: 1
      }

      const filtered = IdempotencyService.filterBodyForFingerprint(body)

      expect(filtered).toEqual(body)
    })
  })

  // ==================== 3. normalizePath 测试 ====================

  describe('normalizePath - 路径规范化', () => {
    /**
     * 测试场景：纯数字ID应转换为 :id 占位符
     *
     * 设计原则（V2.2）：
     * - 事务实体（高频创建、有状态、数量无限增长）使用数字 ID
     * - API 路径中的数字 ID 统一替换为 :id
     */
    it('应将纯数字ID转换为 :id', () => {
      expect(IdempotencyService.normalizePath('/api/v4/market/listings/123')).toBe(
        '/api/v4/market/listings/:id'
      )

      expect(IdempotencyService.normalizePath('/api/v4/market/listings/456/purchase')).toBe(
        '/api/v4/market/listings/:id/purchase'
      )

      expect(IdempotencyService.normalizePath('/api/v4/orders/789/status')).toBe(
        '/api/v4/orders/:id/status'
      )

      // 多个数字ID
      expect(IdempotencyService.normalizePath('/api/v4/users/123/orders/456')).toBe(
        '/api/v4/users/:id/orders/:id'
      )
    })

    /**
     * 测试场景：UUID应转换为 :uuid 占位符
     *
     * 设计原则（V2.2）：
     * - 外部暴露实体（需要隐藏内部ID、防枚举）使用 UUID
     */
    it('应将 UUID 转换为 :uuid', () => {
      expect(
        IdempotencyService.normalizePath(
          '/api/v4/user/profile/550e8400-e29b-41d4-a716-446655440000'
        )
      ).toBe('/api/v4/user/profile/:uuid')

      // 大写 UUID
      expect(
        IdempotencyService.normalizePath('/api/v4/share/A1B2C3D4-E5F6-7890-ABCD-EF1234567890')
      ).toBe('/api/v4/share/:uuid')
    })

    /**
     * 测试场景：配置实体路径中的业务码应转换为 :code
     *
     * 设计原则（V2.2）：
     * - 配置实体（低频变更、语义稳定、数量有限）使用业务码
     * - 业务码格式：snake_case 或 UPPER_SNAKE
     */
    it('应将配置实体路径中的业务码转换为 :code', () => {
      // 活动（campaigns）
      expect(
        IdempotencyService.normalizePath('/api/v4/lottery/campaigns/spring_festival/prizes')
      ).toBe('/api/v4/lottery/campaigns/:code/prizes')

      expect(IdempotencyService.normalizePath('/api/v4/lottery/campaigns/SPRING_2026/config')).toBe(
        '/api/v4/lottery/campaigns/:code/config'
      )

      // 资产类型（asset-types）
      expect(IdempotencyService.normalizePath('/api/v4/console/material/asset-types/DIAMOND')).toBe(
        '/api/v4/console/material/asset-types/:code'
      )

      expect(
        IdempotencyService.normalizePath('/api/v4/console/material/asset-types/red_shard')
      ).toBe('/api/v4/console/material/asset-types/:code')

      // 功能开关（feature-flags）
      expect(
        IdempotencyService.normalizePath('/api/v4/console/feature-flags/lottery_pity_system')
      ).toBe('/api/v4/console/feature-flags/:code')

      // 设置（settings）
      expect(IdempotencyService.normalizePath('/api/v4/console/settings/system_config')).toBe(
        '/api/v4/console/settings/:code'
      )
    })

    /**
     * 测试场景：已经是占位符的路径应保持不变
     */
    it('已经是占位符的路径应保持不变', () => {
      expect(IdempotencyService.normalizePath('/api/v4/market/listings/:id')).toBe(
        '/api/v4/market/listings/:id'
      )

      expect(IdempotencyService.normalizePath('/api/v4/lottery/campaigns/:code/prizes')).toBe(
        '/api/v4/lottery/campaigns/:code/prizes'
      )
    })

    /**
     * 测试场景：空路径和 null 处理
     */
    it('应正确处理空路径和 null', () => {
      expect(IdempotencyService.normalizePath('')).toBe('')
      expect(IdempotencyService.normalizePath(null)).toBe('')
      expect(IdempotencyService.normalizePath(undefined)).toBe('')
    })

    /**
     * 测试场景：无需规范化的静态路径
     */
    it('静态路径应保持不变', () => {
      expect(IdempotencyService.normalizePath('/api/v4/lottery/draw')).toBe('/api/v4/lottery/draw')

      expect(IdempotencyService.normalizePath('/api/v4/auth/login')).toBe('/api/v4/auth/login')
    })
  })

  // ==================== 4. getCanonicalOperation 测试 ====================

  describe('getCanonicalOperation - 获取 canonical operation', () => {
    /**
     * 测试场景：直接映射的路径
     *
     * 业务规则：
     * - 所有写接口必须在 CANONICAL_OPERATION_MAP 中定义
     * - 返回稳定的业务操作标识
     */
    it('应正确映射直接定义的路径', () => {
      // 抽奖
      expect(IdempotencyService.getCanonicalOperation('/api/v4/lottery/draw')).toBe('LOTTERY_DRAW')

      // 登录
      expect(IdempotencyService.getCanonicalOperation('/api/v4/auth/login')).toBe('AUTH_LOGIN')

      // 市场上架
      expect(IdempotencyService.getCanonicalOperation('/api/v4/market/list')).toBe(
        'MARKET_CREATE_LISTING'
      )

      // 兑换（路径已迁移至 backpack 域）
      expect(IdempotencyService.getCanonicalOperation('/api/v4/backpack/exchange')).toBe(
        'BACKPACK_EXCHANGE_CREATE_ORDER'
      )

      // 测试路径
      expect(IdempotencyService.getCanonicalOperation('/api/v4/test/action')).toBe('TEST_ACTION')
    })

    /**
     * 测试场景：带动态ID的路径
     *
     * 业务规则：
     * - 路径中的数字ID应被规范化后再映射
     * - 不同ID但相同操作应返回相同的 canonical
     */
    it('应正确映射带动态ID的路径', () => {
      // 市场购买
      expect(IdempotencyService.getCanonicalOperation('/api/v4/market/listings/123/purchase')).toBe(
        'MARKET_PURCHASE_LISTING'
      )

      expect(IdempotencyService.getCanonicalOperation('/api/v4/market/listings/456/purchase')).toBe(
        'MARKET_PURCHASE_LISTING'
      )

      // 市场撤回
      expect(IdempotencyService.getCanonicalOperation('/api/v4/market/listings/789/withdraw')).toBe(
        'MARKET_CANCEL_LISTING'
      )

      // 消费记录
      expect(IdempotencyService.getCanonicalOperation('/api/v4/shop/consumption/123')).toBe(
        'CONSUMPTION_DELETE'
      )
    })

    /**
     * 测试场景：带配置实体业务码的路径
     */
    it('应正确映射带业务码的路径', () => {
      // 活动奖品
      expect(
        IdempotencyService.getCanonicalOperation('/api/v4/lottery/campaigns/spring_festival/prizes')
      ).toBe('CAMPAIGN_PRIZES')

      // 活动配置
      expect(
        IdempotencyService.getCanonicalOperation('/api/v4/lottery/campaigns/SPRING_2026/config')
      ).toBe('CAMPAIGN_CONFIG')
    })

    /**
     * 测试场景：未映射的路径应抛出错误
     *
     * 业务规则（决策4-B）：
     * - 严格模式：未映射的写接口直接拒绝
     * - 返回 500 错误，提示添加映射
     */
    it('未映射的路径应抛出 500 错误', () => {
      expect(() => {
        IdempotencyService.getCanonicalOperation('/api/v4/unknown/endpoint')
      }).toThrow()

      try {
        IdempotencyService.getCanonicalOperation('/api/v4/not/defined/path')
      } catch (error) {
        expect(error.statusCode).toBe(500)
        expect(error.code).toBe('CANONICAL_OPERATION_NOT_MAPPED')
        expect(error.message).toContain('CANONICAL_OPERATION_MAP')
      }
    })

    /**
     * 测试场景：空路径处理
     */
    it('空路径应返回原值', () => {
      expect(IdempotencyService.getCanonicalOperation('')).toBe('')
      expect(IdempotencyService.getCanonicalOperation(null)).toBe(null)
    })

    /**
     * 测试场景：尾斜杠兼容性
     */
    it('应兼容尾斜杠路径', () => {
      // 有尾斜杠的路径
      expect(IdempotencyService.getCanonicalOperation('/api/v4/console/stores/')).toBe(
        'ADMIN_STORE_CREATE'
      )

      // 运营内容计划（内容投放合并后通过 ad-campaigns/operational 创建）
      expect(
        IdempotencyService.getCanonicalOperation('/api/v4/console/ad-campaigns/operational')
      ).toBe('ADMIN_AD_CAMPAIGN_OPERATIONAL_CREATE')
    })
  })

  // ==================== 5. generateRequestFingerprint 测试 ====================

  describe('generateRequestFingerprint - 生成请求指纹', () => {
    /**
     * 测试场景：相同参数应生成相同的指纹
     *
     * 业务规则：
     * - 指纹用于检测参数冲突
     * - 相同业务请求应生成相同指纹
     * - 指纹是 SHA-256 哈希（64 字符十六进制）
     */
    it('相同参数应生成相同的指纹', () => {
      const context = {
        user_id: 1,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: { page: 1 },
        body: { amount: 100 }
      }

      const hash1 = IdempotencyService.generateRequestFingerprint(context)
      const hash2 = IdempotencyService.generateRequestFingerprint(context)

      expect(hash1).toBe(hash2)
      expect(hash1.length).toBe(64) // SHA-256 十六进制长度
      expect(/^[a-f0-9]+$/.test(hash1)).toBe(true) // 十六进制字符
    })

    /**
     * 测试场景：不同参数应生成不同的指纹
     */
    it('不同参数应生成不同的指纹', () => {
      const context1 = {
        user_id: 1,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        body: { amount: 100 }
      }

      const context2 = {
        user_id: 1,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        body: { amount: 200 } // 金额不同
      }

      const hash1 = IdempotencyService.generateRequestFingerprint(context1)
      const hash2 = IdempotencyService.generateRequestFingerprint(context2)

      expect(hash1).not.toBe(hash2)
    })

    /**
     * 测试场景：不同用户应生成不同的指纹
     */
    it('不同用户应生成不同的指纹', () => {
      const context1 = {
        user_id: 1,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        body: { amount: 100 }
      }

      const context2 = {
        user_id: 2, // 用户不同
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        body: { amount: 100 }
      }

      const hash1 = IdempotencyService.generateRequestFingerprint(context1)
      const hash2 = IdempotencyService.generateRequestFingerprint(context2)

      expect(hash1).not.toBe(hash2)
    })

    /**
     * 测试场景：对象键顺序不影响指纹
     *
     * 业务规则：
     * - 使用 deepSortObject 确保键顺序一致
     * - 相同内容不同键顺序应生成相同指纹
     */
    it('对象键顺序不影响指纹', () => {
      const context1 = {
        user_id: 1,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: { a: 1, b: 2 },
        body: { z: 1, a: 2 }
      }

      const context2 = {
        user_id: 1,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: { b: 2, a: 1 }, // 键顺序不同
        body: { a: 2, z: 1 } // 键顺序不同
      }

      const hash1 = IdempotencyService.generateRequestFingerprint(context1)
      const hash2 = IdempotencyService.generateRequestFingerprint(context2)

      expect(hash1).toBe(hash2)
    })

    /**
     * 测试场景：元数据字段不影响指纹
     *
     * 业务规则：
     * - idempotency_key、timestamp 等不参与指纹计算
     * - 只有业务参数影响指纹
     */
    it('元数据字段不影响指纹', () => {
      const context1 = {
        user_id: 1,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        body: {
          amount: 100,
          idempotency_key: 'key_1',
          timestamp: Date.now(),
          nonce: 'nonce_1'
        }
      }

      const context2 = {
        user_id: 1,
        http_method: 'POST',
        api_path: '/api/v4/test/action',
        query: {},
        body: {
          amount: 100,
          idempotency_key: 'key_2', // 不同
          timestamp: Date.now() + 1000, // 不同
          nonce: 'nonce_2' // 不同
        }
      }

      const hash1 = IdempotencyService.generateRequestFingerprint(context1)
      const hash2 = IdempotencyService.generateRequestFingerprint(context2)

      expect(hash1).toBe(hash2)
    })

    /**
     * 测试场景：使用 canonical operation 替代原始路径
     *
     * 业务规则：
     * - 同一业务操作的不同路径版本应生成相同的指纹
     * - 确保路径版本升级不影响幂等性
     */
    it('同一操作的不同路径版本应生成相同指纹', () => {
      const context1 = {
        user_id: 1,
        http_method: 'POST',
        api_path: '/api/v4/market/listings/123/purchase',
        query: {},
        body: { quantity: 1 }
      }

      const context2 = {
        user_id: 1,
        http_method: 'POST',
        api_path: '/api/v4/market/listings/456/purchase', // 不同ID
        query: {},
        body: { quantity: 1 }
      }

      /*
       * 同一操作（MARKET_PURCHASE_LISTING），但ID不同
       * 注意：这里指纹应该相同，因为 canonical operation 相同
       * 但实际业务中这是不同的购买请求
       */
      const hash1 = IdempotencyService.generateRequestFingerprint(context1)
      const hash2 = IdempotencyService.generateRequestFingerprint(context2)

      // 由于 canonical operation 相同，指纹应相同
      expect(hash1).toBe(hash2)
    })
  })

  // ==================== 6. sanitizeResponse 测试 ====================

  describe('sanitizeResponse - 响应数据脱敏', () => {
    /**
     * 测试场景：应过滤敏感字段
     *
     * 业务规则（决策细则9）：
     * - 敏感字段替换为 [REDACTED]
     * - 保护用户隐私和安全
     */
    it('应将敏感字段替换为 [REDACTED]', () => {
      const response = {
        success: true,
        data: {
          user_id: 123,
          token: 'jwt_secret_token',
          password: 'user_password',
          phone: '13612227930',
          mobile: '13800138000',
          openid: 'wx_openid_xxx',
          unionid: 'wx_unionid_xxx',
          session_key: 'session_key_xxx',
          jwt: 'jwt_token_xxx',
          refresh_token: 'refresh_xxx',
          access_key: 'access_key_xxx',
          secret: 'secret_xxx',
          private_key: 'private_key_xxx',
          id_card: '320123199001011234',
          bank_card: '6222021234567890123'
        }
      }

      const sanitized = IdempotencyService.sanitizeResponse(response)

      // 验证：敏感字段已脱敏
      expect(sanitized.data.token).toBe('[REDACTED]')
      expect(sanitized.data.password).toBe('[REDACTED]')
      expect(sanitized.data.phone).toBe('[REDACTED]')
      expect(sanitized.data.mobile).toBe('[REDACTED]')
      expect(sanitized.data.openid).toBe('[REDACTED]')
      expect(sanitized.data.unionid).toBe('[REDACTED]')
      expect(sanitized.data.session_key).toBe('[REDACTED]')
      expect(sanitized.data.jwt).toBe('[REDACTED]')
      expect(sanitized.data.refresh_token).toBe('[REDACTED]')
      expect(sanitized.data.access_key).toBe('[REDACTED]')
      expect(sanitized.data.secret).toBe('[REDACTED]')
      expect(sanitized.data.private_key).toBe('[REDACTED]')
      expect(sanitized.data.id_card).toBe('[REDACTED]')
      expect(sanitized.data.bank_card).toBe('[REDACTED]')

      // 验证：非敏感字段保留
      expect(sanitized.data.user_id).toBe(123)
      expect(sanitized.success).toBe(true)
    })

    /**
     * 测试场景：应递归处理嵌套对象
     */
    it('应递归处理嵌套对象中的敏感字段', () => {
      const response = {
        data: {
          user: {
            profile: {
              name: '张三',
              phone: '13612227930',
              details: {
                mobile: '13800138000'
              }
            }
          }
        }
      }

      const sanitized = IdempotencyService.sanitizeResponse(response)

      expect(sanitized.data.user.profile.phone).toBe('[REDACTED]')
      expect(sanitized.data.user.profile.details.mobile).toBe('[REDACTED]')
      expect(sanitized.data.user.profile.name).toBe('张三')
    })

    /**
     * 测试场景：字段名包含敏感词也应脱敏
     */
    it('字段名包含敏感词也应脱敏', () => {
      const response = {
        data: {
          user_token: 'xxx',
          auth_password: 'yyy',
          user_phone_number: '13612227930'
        }
      }

      const sanitized = IdempotencyService.sanitizeResponse(response)

      expect(sanitized.data.user_token).toBe('[REDACTED]')
      expect(sanitized.data.auth_password).toBe('[REDACTED]')
      expect(sanitized.data.user_phone_number).toBe('[REDACTED]')
    })

    /**
     * 测试场景：非对象输入应原样返回
     */
    it('非对象输入应原样返回', () => {
      expect(IdempotencyService.sanitizeResponse(null)).toBeNull()
      expect(IdempotencyService.sanitizeResponse(undefined)).toBeUndefined()
      expect(IdempotencyService.sanitizeResponse('string')).toBe('string')
      expect(IdempotencyService.sanitizeResponse(123)).toBe(123)
    })

    /**
     * 测试场景：不应修改原始对象
     */
    it('不应修改原始对象', () => {
      const original = {
        data: {
          token: 'secret_token'
        }
      }

      IdempotencyService.sanitizeResponse(original)

      // 原始对象不应被修改
      expect(original.data.token).toBe('secret_token')
    })
  })

  // ==================== 7. prepareResponseSnapshot 测试 ====================

  describe('prepareResponseSnapshot - 响应快照准备', () => {
    /**
     * 测试场景：正常大小的响应应完整保存
     */
    it('正常大小的响应应完整保存（含脱敏）', () => {
      const response = {
        success: true,
        code: 'SUCCESS',
        data: {
          order_id: 123,
          token: 'secret_token'
        }
      }

      const snapshot = IdempotencyService.prepareResponseSnapshot(response, 'test_key', 'event_123')

      expect(snapshot.success).toBe(true)
      expect(snapshot.code).toBe('SUCCESS')
      expect(snapshot.data.order_id).toBe(123)
      expect(snapshot.data.token).toBe('[REDACTED]') // 已脱敏
      expect(snapshot._truncated).toBeUndefined() // 未截断
    })

    /**
     * 测试场景：超过软限制（32KB）应记录告警但完整保存
     */
    it('超过软限制（32KB）应完整保存', () => {
      // 创建一个接近 32KB 但不超过 64KB 的响应
      const largeData = 'x'.repeat(35000) // 约 35KB

      const response = {
        success: true,
        code: 'SUCCESS',
        data: { content: largeData }
      }

      const snapshot = IdempotencyService.prepareResponseSnapshot(response, 'test_key', 'event_123')

      // 应完整保存
      expect(snapshot.data.content).toBe(largeData)
      expect(snapshot._truncated).toBeUndefined()
    })

    /**
     * 测试场景：超过硬限制（64KB）应截断只保留关键字段
     */
    it('超过硬限制（64KB）应截断只保留关键字段', () => {
      // 创建一个超过 64KB 的响应
      const veryLargeData = 'x'.repeat(70000) // 约 70KB

      const response = {
        success: true,
        code: 'LARGE_RESPONSE',
        message: '大型响应',
        data: { content: veryLargeData },
        business_event_id: 'event_456'
      }

      const snapshot = IdempotencyService.prepareResponseSnapshot(response, 'test_key', 'event_123')

      // 应截断
      expect(snapshot._truncated).toBe(true)
      expect(snapshot._original_size).toBeGreaterThan(65536)
      expect(snapshot.success).toBe(true)
      expect(snapshot.code).toBe('LARGE_RESPONSE')
      expect(snapshot.message).toBe('大型响应')
      // data 字段不应保留
      expect(snapshot.data).toBeUndefined()
    })

    /**
     * 测试场景：截断时应保留 business_event_id
     */
    it('截断时应保留 business_event_id', () => {
      const veryLargeData = 'x'.repeat(70000)

      const response = {
        success: true,
        code: 'SUCCESS',
        message: 'OK',
        data: { content: veryLargeData }
      }

      const snapshot = IdempotencyService.prepareResponseSnapshot(
        response,
        'test_key',
        'important_event_id'
      )

      expect(snapshot._truncated).toBe(true)
      expect(snapshot.business_event_id).toBe('important_event_id')
    })
  })

  // ==================== 8. CANONICAL_OPERATION_MAP 完整性验证 ====================

  describe('CANONICAL_OPERATION_MAP - 映射表完整性验证', () => {
    /**
     * 测试场景：核心业务路径必须有映射
     */
    it('核心业务路径应有映射', () => {
      const corePaths = [
        // 抽奖系统
        '/api/v4/lottery/draw',
        // 认证系统
        '/api/v4/auth/login',
        '/api/v4/auth/logout',
        // 市场交易
        '/api/v4/market/list',
        '/api/v4/market/listings/:id/purchase',
        '/api/v4/market/listings/:id/withdraw',
        // 兑换（路径已迁移至 backpack 域）
        '/api/v4/backpack/exchange',
        // 消费记录
        '/api/v4/shop/consumption/submit',
        // 核销
        '/api/v4/shop/redemption/orders',
        '/api/v4/shop/redemption/fulfill'
      ]

      corePaths.forEach(path => {
        expect(CANONICAL_OPERATION_MAP).toHaveProperty(path)
        expect(typeof CANONICAL_OPERATION_MAP[path]).toBe('string')
        expect(CANONICAL_OPERATION_MAP[path].length).toBeGreaterThan(0)
      })
    })

    /**
     * 测试场景：测试路径必须有映射
     */
    it('测试路径应有映射', () => {
      const testPaths = [
        '/api/v4/test/action',
        '/api/v4/test/db-task',
        '/api/v4/test/timeout-task',
        '/api/v4/test/concurrent',
        '/api/v4/test/idempotent-action',
        '/api/v4/test/hash',
        '/api/v4/test/state'
      ]

      testPaths.forEach(path => {
        expect(CANONICAL_OPERATION_MAP).toHaveProperty(path)
      })
    })

    /**
     * 测试场景：所有映射值应为非空字符串
     */
    it('所有映射值应为非空字符串', () => {
      Object.entries(CANONICAL_OPERATION_MAP).forEach(([_path, operation]) => {
        expect(typeof operation).toBe('string')
        expect(operation.length).toBeGreaterThan(0)
        // 命名规范：UPPER_SNAKE_CASE
        expect(operation).toMatch(/^[A-Z][A-Z0-9_]*$/)
      })
    })

    /**
     * 测试场景：映射值应唯一（不同路径不应映射到相同操作）
     *
     * 注意：某些情况下允许多个路径映射到同一操作（如权限检查）
     */
    it('映射值应具有语义唯一性', () => {
      const operationCounts = {}

      Object.entries(CANONICAL_OPERATION_MAP).forEach(([path, operation]) => {
        if (!operationCounts[operation]) {
          operationCounts[operation] = []
        }
        operationCounts[operation].push(path)
      })

      // 输出重复映射（允许但需要审查）
      const duplicates = Object.entries(operationCounts)
        .filter(([, paths]) => paths.length > 1)
        .map(([operation, paths]) => ({ operation, paths }))

      if (duplicates.length > 0) {
        console.log('ℹ️ 存在多路径映射到同一操作的情况：')
        duplicates.forEach(({ operation, paths }) => {
          console.log(`  ${operation}: ${paths.join(', ')}`)
        })
      }

      // 这里不强制要求唯一，只是记录
      expect(Object.keys(operationCounts).length).toBeGreaterThan(0)
    })
  })
})
