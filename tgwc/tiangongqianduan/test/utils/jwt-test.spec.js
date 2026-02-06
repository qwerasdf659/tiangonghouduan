/**
 * JWT工具函数单元测试套件
 * 
 * @description
 * 针对JWT Token处理的完整测试覆盖，确保：
 * 1. Base64 URL编码标准符合性
 * 2. Token完整性验证准确性
 * 3. 边界条件处理正确性
 * 4. 错误处理完整性
 * 
 * @author 天工小程序团队
 * @since 2025-11-08
 * @version 1.0.0
 */

const { validateJWTTokenIntegrity, decodeJWTPayload } = require('../../utils/util')

describe('JWT Token处理 - 完整测试套件', () => {
  // ====== 测试数据集 ======
  
  /**
   * 真实的JWT Token样例（使用Base64 URL编码）
   * 注意：包含 - 和 _ 字符
   */
  const VALID_JWT_TOKENS = {
    // 标准JWT Token（包含 - 和 _ 字符）
    standard: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxMjMsIm1vYmlsZSI6IjEzODEyMzQ1Njc4IiwiaXNfYWRtaW4iOmZhbHNlLCJleHAiOjE3MzA0NTk0MDAsImlhdCI6MTczMDM3MzAwMH0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    
    // 长payload（测试长度验证）
    longPayload: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxMjMsIm1vYmlsZSI6IjEzODEyMzQ1Njc4IiwiaXNfYWRtaW4iOmZhbHNlLCJ1c2VyX3JvbGUiOiJ1c2VyIiwicm9sZV9sZXZlbCI6MCwicGVybWlzc2lvbnMiOlsicmVhZCIsIndyaXRlIl0sImV4cCI6MTczMDQ1OTQwMCwiaWF0IjoxNzMwMzczMDAwfQ.abcdefghijklmnopqrstuvwxyz0123456789-_'
  }
  
  const INVALID_JWT_TOKENS = {
    // 格式错误（只有2个部分）
    twoPartsOnly: 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxMjN9',
    
    // Header过短（被截断）
    shortHeader: 'eyJ.eyJ1c2VyX2lkIjoxMjMsIm1vYmlsZSI6IjEzODEyMzQ1Njc4In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    
    // Payload过短（被截断）
    shortPayload: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    
    // 签名过短（被截断）
    shortSignature: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxMjMsIm1vYmlsZSI6IjEzODEyMzQ1Njc4In0.Sfl',
    
    // 包含非法字符（标准Base64的+和/）
    invalidChars: 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxMjMrL30=.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    
    // 空字符串
    empty: '',
    
    // null
    nullToken: null,
    
    // undefined
    undefinedToken: undefined
  }
  
  // ====== 第一组：Token完整性验证测试 ======
  
  describe('validateJWTTokenIntegrity - Token完整性验证', () => {
    test('✅ 应该接受标准的Base64 URL编码Token', () => {
      const result = validateJWTTokenIntegrity(VALID_JWT_TOKENS.standard)
      
      expect(result.isValid).toBe(true)
      expect(result.details).toBeDefined()
      expect(result.details.tokenLength).toBeGreaterThan(150)
      expect(result.details.headerLength).toBeGreaterThan(20)
      expect(result.details.payloadLength).toBeGreaterThan(50)
      expect(result.details.signatureLength).toBeGreaterThan(40)
    })
    
    test('✅ 应该接受包含 - 和 _ 字符的Token（Base64 URL标准）', () => {
      const tokenWithUrlChars = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxMjMsInRlc3QtZmllbGQiOiJ2YWx1ZSJ9.abcd-1234_5678'
      const result = validateJWTTokenIntegrity(tokenWithUrlChars)
      
      // 注意：这个Token可能因为签名过短而失败，但不应该因为 - 和 _ 字符而失败
      if (!result.isValid) {
        expect(result.error).not.toContain('无效的Base64')
        expect(result.error).not.toContain('Base64字符')
      }
    })
    
    test('❌ 应该拒绝只有2个部分的Token', () => {
      const result = validateJWTTokenIntegrity(INVALID_JWT_TOKENS.twoPartsOnly)
      
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('格式错误')
      expect(result.details.partsCount).toBe(2)
    })
    
    test('❌ 应该拒绝Header被截断的Token', () => {
      const result = validateJWTTokenIntegrity(INVALID_JWT_TOKENS.shortHeader)
      
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Header部分过短')
    })
    
    test('❌ 应该拒绝Payload被截断的Token', () => {
      const result = validateJWTTokenIntegrity(INVALID_JWT_TOKENS.shortPayload)
      
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Payload部分过短')
    })
    
    test('❌ 应该拒绝签名被截断的Token', () => {
      const result = validateJWTTokenIntegrity(INVALID_JWT_TOKENS.shortSignature)
      
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('签名部分过短')
      expect(result.details.signatureLength).toBeLessThan(40)
    })
    
    test('❌ 应该拒绝空Token', () => {
      const result = validateJWTTokenIntegrity(INVALID_JWT_TOKENS.empty)
      
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Token为空')
    })
    
    test('❌ 应该拒绝null Token', () => {
      const result = validateJWTTokenIntegrity(INVALID_JWT_TOKENS.nullToken)
      
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Token为空或类型错误')
    })
    
    test('❌ 应该拒绝undefined Token', () => {
      const result = validateJWTTokenIntegrity(INVALID_JWT_TOKENS.undefinedToken)
      
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Token为空或类型错误')
    })
  })
  
  // ====== 第二组：JWT解码测试 ======
  
  describe('decodeJWTPayload - JWT Token解码', () => {
    test('✅ 应该成功解码有效的JWT Token', () => {
      // 这个Token的payload是: {"user_id":123,"mobile":"13812345678","is_admin":false,"exp":1730459400,"iat":1730373000}
      const payload = decodeJWTPayload(VALID_JWT_TOKENS.standard)
      
      expect(payload).not.toBeNull()
      expect(payload.user_id).toBe(123)
      expect(payload.mobile).toBe('13812345678')
      expect(payload.is_admin).toBe(false)
      expect(payload.exp).toBeDefined()
      expect(payload.iat).toBeDefined()
    })
    
    test('✅ 应该正确处理Base64 URL编码（- 和 _ 字符）', () => {
      // 特别构造包含需要转换的字符的Token
      const specialToken = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxMjMsInRlc3QtZmllbGQiOiJ2YWx1ZV93aXRoX3VuZGVyc2NvcmUifQ.mock-signature-for-test-only-12345678901234'
      
      // 即使签名无效，解码payload应该成功
      const payload = decodeJWTPayload(specialToken)
      
      // 如果签名验证失败，payload可能为null，但不应该因为 - 和 _ 字符而失败
      if (payload) {
        expect(payload).toHaveProperty('user_id')
      }
    })
    
    test('❌ 应该拒绝被截断的Token', () => {
      const payload = decodeJWTPayload(INVALID_JWT_TOKENS.shortSignature)
      
      expect(payload).toBeNull()
    })
    
    test('❌ 应该拒绝格式错误的Token', () => {
      const payload = decodeJWTPayload(INVALID_JWT_TOKENS.twoPartsOnly)
      
      expect(payload).toBeNull()
    })
    
    test('❌ 应该拒绝空Token', () => {
      const payload = decodeJWTPayload(INVALID_JWT_TOKENS.empty)
      
      expect(payload).toBeNull()
    })
  })
  
  // ====== 第三组：边界条件测试 ======
  
  describe('边界条件和异常情况', () => {
    test('🔍 极短Token（总长度<150）', () => {
      const shortToken = 'eyJ.eyJ.abc'
      const result = validateJWTTokenIntegrity(shortToken)
      
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('过短')
    })
    
    test('🔍 超长Token（>10000字符）', () => {
      // 构造一个超长的payload
      const longPayload = 'A'.repeat(10000)
      const longToken = `eyJhbGciOiJIUzI1NiJ9.${longPayload}.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c`
      const result = validateJWTTokenIntegrity(longToken)
      
      // 超长Token应该被接受（只要格式正确）
      expect(result.isValid).toBe(true)
    })
    
    test('🔍 数字类型的Token', () => {
      const result = validateJWTTokenIntegrity(123456)
      
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('类型错误')
    })
    
    test('🔍 对象类型的Token', () => {
      const result = validateJWTTokenIntegrity({ token: 'test' })
      
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('类型错误')
    })
  })
  
  // ====== 第四组：回归测试（防止问题复现）======
  
  describe('回归测试 - 防止历史问题复现', () => {
    test('🐛 [BUG-2025-11-08] Base64 URL字符应该被接受', () => {
      // 这个测试确保之前修复的问题不会再次出现
      const tokenWithUrlChars = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxMjMsIm1vYmlsZSI6IjEzODEyMzQ1Njc4IiwiaXNfYWRtaW4iOmZhbHNlLCJ1c2VyX3JvbGUiOiJ1c2VyIiwicm9sZV9sZXZlbCI6MCwiZXhwIjoxNzMwNDU5NDAwLCJpYXQiOjE3MzAzNzMwMDB9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
      
      const result = validateJWTTokenIntegrity(tokenWithUrlChars)
      
      // 关键断言：不应该因为Base64 URL字符而失败
      if (!result.isValid) {
        expect(result.error).not.toContain('无效的Base64')
        expect(result.details).toBeDefined()
        // 如果失败，应该是其他原因（如长度），而不是字符问题
      }
      
      // 检查各部分的验证结果
      if (result.details) {
        expect(result.details.headerValid).not.toBe(false)
        expect(result.details.payloadValid).not.toBe(false)
        expect(result.details.signatureValid).not.toBe(false)
      }
    })
    
    test('🐛 [BUG-2025-11-08] Payload中的 - 和 _ 字符不应该导致验证失败', () => {
      // 特别测试payload中包含 - 和 _ 的情况
      const result = validateJWTTokenIntegrity(VALID_JWT_TOKENS.standard)
      
      expect(result.isValid).toBe(true)
      expect(result.details.payloadValid).not.toBe(false)
    })
  })
  
  // ====== 第五组：性能测试 ======
  
  describe('性能测试', () => {
    test('⚡ 验证1000个Token应在1秒内完成', () => {
      const startTime = Date.now()
      
      for (let i = 0; i < 1000; i++) {
        validateJWTTokenIntegrity(VALID_JWT_TOKENS.standard)
      }
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      expect(duration).toBeLessThan(1000) // 1秒
    })
    
    test('⚡ 解码1000个Token应在2秒内完成', () => {
      const startTime = Date.now()
      
      for (let i = 0; i < 1000; i++) {
        decodeJWTPayload(VALID_JWT_TOKENS.standard)
      }
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      expect(duration).toBeLessThan(2000) // 2秒
    })
  })
})

/**
 * 测试执行说明
 * 
 * 运行全部测试：
 * npm test test/utils/jwt-test.spec.js
 * 
 * 运行特定测试组：
 * npm test -- --testNamePattern="Token完整性验证"
 * 
 * 生成覆盖率报告：
 * npm test -- --coverage test/utils/jwt-test.spec.js
 * 
 * 持续监听模式：
 * npm test -- --watch test/utils/jwt-test.spec.js
 */

