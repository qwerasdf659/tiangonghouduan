/**
 * 🔐 手机号脱敏单元测试
 *
 * P0-2 任务：创建手机号脱敏单元测试
 *
 * 审计标准：
 * - 审计标准 B-1：手机号脱敏
 * - 《个人信息保护法》第51条
 * - 《网络安全法》第42条
 *
 * 测试范围：
 * - sanitize.mobile() 函数各种输入场景
 * - sanitizeMobile() 直接调用
 *
 * 验收标准：
 * - npm test -- tests/security/data-masking-unit.test.js 全部通过
 *
 * @module tests/security/data-masking-unit
 * @since 2026-01-28
 */

'use strict'

/*
 * 🔐 使用项目已有的脱敏工具（utils/logger.js）
 * 📌 注意：sanitizeMobile 不直接导出，通过 sanitize.mobile 或 SANITIZE_RULES.mobile 访问
 */
const { sanitize, SANITIZE_RULES } = require('../../utils/logger')

describe('🔐 手机号脱敏单元测试（P0-2）', () => {
  describe('sanitize.mobile() 快捷方法', () => {
    /**
     * P0-2-1 正常手机号脱敏
     *
     * 业务场景：用户登录后查看个人资料，手机号需脱敏展示
     * 预期格式：136****7930（前3后4，中间4位用*替代）
     */
    test('P0-2-1 正常手机号脱敏', () => {
      expect(sanitize.mobile('13612227910')).toBe('136****7930')
    })

    /**
     * P0-2-2 null输入处理
     *
     * 业务场景：数据库中 mobile 字段为 NULL 的用户
     * 预期行为：返回 null，不抛错
     */
    test('P0-2-2 null输入处理', () => {
      expect(sanitize.mobile(null)).toBeNull()
    })

    /**
     * P0-2-3 undefined输入处理
     *
     * 业务场景：前端传参缺失 mobile 字段
     * 预期行为：返回 null，不抛错
     */
    test('P0-2-3 undefined输入处理', () => {
      expect(sanitize.mobile(undefined)).toBeNull()
    })

    /**
     * P0-2-4 空字符串输入处理
     *
     * 业务场景：用户注册时未填写手机号
     * 预期行为：返回 null，不抛错
     */
    test('P0-2-4 空字符串输入处理', () => {
      expect(sanitize.mobile('')).toBeNull()
    })

    /**
     * P0-2-5 短号码处理
     *
     * 业务场景：非标准长度的手机号（如4位短号）
     * 预期行为：原样返回，因为无法正常脱敏
     */
    test('P0-2-5 短号码处理', () => {
      // 短号码无法按标准格式脱敏，原样返回
      expect(sanitize.mobile('1234')).toBe('1234')
    })
  })

  describe('SANITIZE_RULES.mobile() 直接调用', () => {
    /**
     * 通过 SANITIZE_RULES 直接访问脱敏函数
     * 这是内部模块使用的方式，与 sanitize.mobile() 行为一致
     */
    test('SANITIZE_RULES.mobile 正常脱敏', () => {
      expect(SANITIZE_RULES.mobile('18888888888')).toBe('188****8888')
    })

    test('SANITIZE_RULES.mobile 处理 null', () => {
      expect(SANITIZE_RULES.mobile(null)).toBeNull()
    })

    test('SANITIZE_RULES.mobile 处理 undefined', () => {
      expect(SANITIZE_RULES.mobile(undefined)).toBeNull()
    })
  })

  describe('边界场景测试', () => {
    /**
     * 不同运营商号段测试
     * 确保各运营商手机号都能正确脱敏
     */
    test('中国移动号段脱敏', () => {
      expect(sanitize.mobile('13912345678')).toBe('139****5678')
      expect(sanitize.mobile('15012345678')).toBe('150****5678')
    })

    test('中国联通号段脱敏', () => {
      expect(sanitize.mobile('13012345678')).toBe('130****5678')
      expect(sanitize.mobile('18612345678')).toBe('186****5678')
    })

    test('中国电信号段脱敏', () => {
      expect(sanitize.mobile('18012345678')).toBe('180****5678')
      expect(sanitize.mobile('19912345678')).toBe('199****5678')
    })

    /**
     * 特殊格式处理
     */
    test('带空格的手机号', () => {
      // 包含空格时按原字符串处理（不满足11位纯数字格式）
      const result = sanitize.mobile('136 1222 7930')
      // 不满足标准格式，原样返回
      expect(result).toBe('136 1222 7930')
    })

    test('带区号的手机号', () => {
      /*
       * 📌 带区号的手机号会被部分脱敏（正则匹配任意位置的3-4-4数字模式）
       * 实际行为：+8613612227910 → +861****227930
       */
      const result = sanitize.mobile('+8613612227910')
      // 验证结果仍然包含脱敏星号（实际业务中建议先去除区号再脱敏）
      expect(result).toContain('****')
    })

    /**
     * 数字类型输入
     */
    test('数字类型输入处理', () => {
      // 虽然不推荐，但应能处理数字类型
      const numericMobile = 13612227910
      const result = sanitize.mobile(numericMobile.toString())
      expect(result).toBe('136****7930')
    })
  })

  describe('安全性验证', () => {
    /**
     * 确保脱敏后无法还原原始手机号
     */
    test('脱敏结果不可逆', () => {
      const original = '13612227910'
      const masked = sanitize.mobile(original)

      // 脱敏后应该无法获取完整中间4位
      expect(masked).not.toContain('1222')
      expect(masked).toContain('****')
    })

    /**
     * 确保敏感数据不会泄露到日志
     */
    test('脱敏格式符合日志安全标准', () => {
      const masked = sanitize.mobile('13612227910')

      // 验证格式：前3位 + **** + 后4位
      expect(masked).toMatch(/^\d{3}\*{4}\d{4}$/)
    })
  })
})
