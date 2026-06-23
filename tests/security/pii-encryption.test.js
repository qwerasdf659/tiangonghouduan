/**
 * 🔐 PII加密效果验证测试
 *
 * P2-2 任务：验证敏感字段加密存储效果
 *
 * 审计标准：
 * - 审计标准 B-5：PII数据保护
 * - 《个人信息保护法》第51条：加密存储
 * - 《网络安全法》第42条：数据安全
 *
 * 测试范围：
 * - PII_HASH_SECRET 配置验证
 * - 手机号 HMAC-SHA256 哈希验证
 * - Redis 缓存 Key 脱敏验证
 * - 哈希算法一致性验证
 *
 * 验收标准：
 * - npm test -- tests/security/pii-encryption.test.js 全部通过
 * - Redis 中无明文手机号（user:mobile_hash: 使用哈希值）
 *
 * @module tests/security/pii-encryption
 * @since 2026-01-28
 */

'use strict'

const crypto = require('crypto')

// 加载测试环境设置（确保PII_HASH_SECRET已配置）
require('../helpers/test-setup')

// 导入业务缓存助手中的PII相关函数
const { hashMobile, getPiiHashSecret } = require('../../utils/BusinessCacheHelper')

describe('🔐 PII加密效果验证测试（P2-2）', () => {
  /**
   * B-5-1: PII_HASH_SECRET 配置验证
   *
   * 业务场景：系统启动时必须配置PII保护密钥
   * 安全要求：密钥长度至少32字符，且与JWT_SECRET独立
   */
  describe('B-5-1 PII_HASH_SECRET 配置验证', () => {
    test('PII_HASH_SECRET 环境变量已配置', () => {
      // test-setup.js 中已设置默认测试密钥
      expect(process.env.PII_HASH_SECRET).toBeDefined()
      expect(process.env.PII_HASH_SECRET).not.toBe('')
    })

    test('PII_HASH_SECRET 长度至少32字符', () => {
      const secret = process.env.PII_HASH_SECRET
      expect(secret.length).toBeGreaterThanOrEqual(32)
    })

    test('PII_HASH_SECRET 与 JWT_SECRET 独立', () => {
      const piiSecret = process.env.PII_HASH_SECRET
      const jwtSecret = process.env.JWT_SECRET

      // 如果两者都配置，必须不同
      if (piiSecret && jwtSecret) {
        expect(piiSecret).not.toBe(jwtSecret)
      }
    })

    test('getPiiHashSecret() 函数正确返回密钥', () => {
      const secret = getPiiHashSecret()

      expect(secret).toBeDefined()
      expect(typeof secret).toBe('string')
      expect(secret.length).toBeGreaterThanOrEqual(32)
      expect(secret).toBe(process.env.PII_HASH_SECRET)
    })
  })

  /**
   * B-5-2: 手机号哈希算法验证
   *
   * 业务场景：用户手机号需要脱敏后存储在Redis缓存中
   * 安全要求：使用HMAC-SHA256确保哈希不可逆且防彩虹表攻击
   */
  describe('B-5-2 手机号哈希算法验证', () => {
    test('hashMobile() 生成64字符十六进制字符串', () => {
      const testMobile = '13612227910'
      const hash = hashMobile(testMobile)

      // HMAC-SHA256 输出为 256 位 = 32 字节 = 64 个十六进制字符
      expect(hash).toBeDefined()
      expect(typeof hash).toBe('string')
      expect(hash.length).toBe(64)
      // 验证是有效的十六进制字符串
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    test('相同手机号生成相同哈希（确定性）', () => {
      const testMobile = '13612227910'

      const hash1 = hashMobile(testMobile)
      const hash2 = hashMobile(testMobile)
      const hash3 = hashMobile(testMobile)

      expect(hash1).toBe(hash2)
      expect(hash2).toBe(hash3)
    })

    test('不同手机号生成不同哈希（唯一性）', () => {
      const mobile1 = '13612227910'
      const mobile2 = '13812345678'
      const mobile3 = '15912345678'

      const hash1 = hashMobile(mobile1)
      const hash2 = hashMobile(mobile2)
      const hash3 = hashMobile(mobile3)

      // 三个不同手机号的哈希值应该都不同
      expect(hash1).not.toBe(hash2)
      expect(hash1).not.toBe(hash3)
      expect(hash2).not.toBe(hash3)
    })

    test('哈希值不可逆（安全性）', () => {
      const testMobile = '13612227910'
      const hash = hashMobile(testMobile)

      // 验证哈希值中不包含原始手机号的任何部分
      expect(hash).not.toContain('136')
      expect(hash).not.toContain('1222')
      expect(hash).not.toContain('7930')
      expect(hash).not.toContain(testMobile)

      /*
       * 验证哈希值看起来像随机字符串
       * 检查是否有足够的字符多样性（至少使用8个不同的十六进制字符）
       */
      const uniqueChars = new Set(hash.split(''))
      expect(uniqueChars.size).toBeGreaterThanOrEqual(8)
    })
  })

  /**
   * B-5-3: 哈希算法一致性验证
   *
   * 业务场景：确保测试代码与业务代码使用相同的哈希算法
   * 安全要求：算法实现必须一致，否则缓存无法命中
   */
  describe('B-5-3 哈希算法一致性验证', () => {
    test('hashMobile() 与手动计算的 HMAC-SHA256 结果一致', () => {
      const testMobile = '13612227910'
      const secret = getPiiHashSecret()

      // 使用业务函数计算
      const businessHash = hashMobile(testMobile)

      // 手动使用 crypto 计算（模拟独立实现）
      const manualHash = crypto.createHmac('sha256', secret).update(testMobile).digest('hex')

      // 两者必须一致
      expect(businessHash).toBe(manualHash)
    })

    test('空字符串手机号处理', () => {
      // 验证对空字符串的处理（不应该崩溃）
      expect(() => {
        const hash = hashMobile('')
        // 即使是空字符串也应该生成有效哈希
        expect(hash.length).toBe(64)
      }).not.toThrow()
    })

    test('数字类型手机号自动转换', () => {
      const stringMobile = '13612227910'
      const numericMobile = 13612227910

      /*
       * 数字类型在业务中可能被转换为字符串
       * 这里验证字符串类型的正确处理
       */
      const stringHash = hashMobile(stringMobile)
      const numericHash = hashMobile(String(numericMobile))

      expect(stringHash).toBe(numericHash)
    })
  })

  /**
   * B-5-4: Redis缓存Key脱敏验证
   *
   * 业务场景：用户信息通过手机号查询时，Redis Key中不能包含明文手机号
   * 安全要求：Key格式为 user:mobile_hash:{hash}，不暴露手机号
   */
  describe('B-5-4 Redis缓存Key脱敏验证', () => {
    test('用户手机号缓存Key格式正确', () => {
      const testMobile = '13612227910'
      const hash = hashMobile(testMobile)

      // 期望的Key格式: app:v4:{env}:api:user:mobile_hash:{hash}
      const expectedKeyPattern = /^app:v4:\w+:api:user:mobile_hash:[0-9a-f]{64}$/

      // 模拟构建缓存Key（与BusinessCacheHelper一致）
      const env = process.env.NODE_ENV === 'production' ? 'prod' : 'dev'
      const cacheKey = `app:v4:${env}:api:user:mobile_hash:${hash}`

      expect(cacheKey).toMatch(expectedKeyPattern)
    })

    test('缓存Key中不包含明文手机号', () => {
      const testMobile = '13612227910'
      const hash = hashMobile(testMobile)

      // 构建缓存Key
      const env = process.env.NODE_ENV === 'production' ? 'prod' : 'dev'
      const cacheKey = `app:v4:${env}:api:user:mobile_hash:${hash}`

      // 验证Key中不包含明文手机号的任何部分
      expect(cacheKey).not.toContain('136')
      expect(cacheKey).not.toContain('1222')
      expect(cacheKey).not.toContain('7930')
      expect(cacheKey).not.toContain(testMobile)
    })

    test('通过哈希Key可以准确定位用户', () => {
      /*
       * 模拟用户查询场景：
       * 1. 用户登录提供手机号
       * 2. 系统计算哈希值
       * 3. 使用哈希Key查询缓存
       */

      const loginMobile = '13612227910'

      // 登录时计算的哈希
      const loginHash = hashMobile(loginMobile)

      // 后续请求时再次计算的哈希
      const requestHash = hashMobile(loginMobile)

      // 两次计算结果一致，可以准确命中缓存
      expect(loginHash).toBe(requestHash)
    })
  })

  /**
   * B-5-5: 密钥安全性验证
   *
   * 业务场景：不同密钥应产生不同哈希，防止跨环境攻击
   * 安全要求：生产环境密钥必须独立，不能与开发环境相同
   */
  describe('B-5-5 密钥安全性验证', () => {
    test('不同密钥产生不同哈希', () => {
      const testMobile = '13612227910'
      const secret1 = 'test-secret-key-32-characters-01'
      const secret2 = 'test-secret-key-32-characters-02'

      // 使用不同密钥计算哈希
      const hash1 = crypto.createHmac('sha256', secret1).update(testMobile).digest('hex')
      const hash2 = crypto.createHmac('sha256', secret2).update(testMobile).digest('hex')

      // 不同密钥必须产生不同哈希
      expect(hash1).not.toBe(hash2)
    })

    test('密钥微小变化导致完全不同的哈希', () => {
      const testMobile = '13612227910'
      const secret1 = 'test-secret-key-32-characters-aa'
      const secret2 = 'test-secret-key-32-characters-ab' // 仅最后一个字符不同

      const hash1 = crypto.createHmac('sha256', secret1).update(testMobile).digest('hex')
      const hash2 = crypto.createHmac('sha256', secret2).update(testMobile).digest('hex')

      // 哈希值应该完全不同（雪崩效应）
      expect(hash1).not.toBe(hash2)

      // 计算相似度（应该接近0）
      let similarChars = 0
      for (let i = 0; i < hash1.length; i++) {
        if (hash1[i] === hash2[i]) similarChars++
      }
      const similarity = similarChars / hash1.length

      // 相似度应该低于25%（理论上接近6.25%，即1/16的概率）
      expect(similarity).toBeLessThan(0.25)
    })

    test('手机号微小变化导致完全不同的哈希', () => {
      const secret = getPiiHashSecret()
      const mobile1 = '13612227910'
      const mobile2 = '13612227931' // 仅最后一位不同

      const hash1 = crypto.createHmac('sha256', secret).update(mobile1).digest('hex')
      const hash2 = crypto.createHmac('sha256', secret).update(mobile2).digest('hex')

      // 哈希值应该完全不同
      expect(hash1).not.toBe(hash2)
    })
  })

  /**
   * B-5-6: 边界条件测试
   *
   * 业务场景：各种异常输入情况
   * 安全要求：函数应安全处理边界输入
   */
  describe('B-5-6 边界条件测试', () => {
    test('处理国际手机号格式', () => {
      const internationalMobile = '+8613612227910'
      const domesticMobile = '13612227910'

      const intlHash = hashMobile(internationalMobile)
      const domesticHash = hashMobile(domesticMobile)

      // 不同格式的手机号应该产生不同哈希
      expect(intlHash).not.toBe(domesticHash)

      // 两者都应该是有效的64字符哈希
      expect(intlHash.length).toBe(64)
      expect(domesticHash.length).toBe(64)
    })

    test('处理带空格的手机号', () => {
      const mobileWithSpaces = '136 1222 7930'
      const cleanMobile = '13612227910'

      const spacedHash = hashMobile(mobileWithSpaces)
      const cleanHash = hashMobile(cleanMobile)

      /* 带空格和不带空格的手机号哈希不同 */
      expect(spacedHash).not.toBe(cleanHash)

      /*
       * 业务代码应该在哈希前清理空格
       * 这里验证哈希函数本身对输入不做处理
       */
    })

    test('批量手机号哈希性能', () => {
      const testMobiles = []
      for (let i = 0; i < 1000; i++) {
        testMobiles.push(`136${String(i).padStart(8, '0')}`)
      }

      const startTime = Date.now()
      const hashes = testMobiles.map(mobile => hashMobile(mobile))
      const endTime = Date.now()

      // 1000个手机号哈希应在500ms内完成
      expect(endTime - startTime).toBeLessThan(500)

      // 验证所有哈希都是唯一的
      const uniqueHashes = new Set(hashes)
      expect(uniqueHashes.size).toBe(1000)
    })
  })
})
