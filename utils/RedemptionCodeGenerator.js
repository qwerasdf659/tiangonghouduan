/**
 * 餐厅积分抽奖系统 V4.2 - 兑换核销码生成器（RedemptionCodeGenerator）
 *
 * 业务场景：为物品实例生成唯一的12位Base32核销码
 *
 * 核心功能：
 * 1. 生成12位Base32核销码（格式：XXXX-YYYY-ZZZZ）
 * 2. 计算核销码SHA-256哈希值
 * 3. 验证核销码格式
 * 4. 去除易混淆字符（0/O/I/L/1）
 *
 * 技术规范：
 * - 字符集：Base32（去除易混淆字符）
 * - 长度：12位（分3组，每组4位）
 * - 格式：3K7J-2MQP-WXYZ
 * - 哈希：SHA-256（64位hex）
 *
 * 安全设计：
 * - 明文码只返回一次（生成时）
 * - 数据库只存储哈希值（SHA-256）
 * - 验证时计算哈希对比
 *
 * 创建时间：2025-12-17
 * 使用模型：Claude Sonnet 4.5
 */

const crypto = require('crypto')

/**
 * Base32 字符集（去除易混淆字符 0/O/I/L/1）
 *
 * 原始Base32: ABCDEFGHIJKLMNOPQRSTUVWXYZ234567
 * 去除字符: 0(数字零), O(字母O), I(字母I), L(字母L), 1(数字1)
 * 最终字符集: 23456789ABCDEFGHJKMNPQRSTUVWXYZ (共30个字符)
 */
const BASE32_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

/**
 * 核销码生成器
 * @class RedemptionCodeGenerator
 */
class RedemptionCodeGenerator {
  /**
   * 生成12位Base32核销码
   *
   * 业务规则：
   * - 使用crypto.randomInt()生成随机数
   * - 从Base32字符集中随机选取12个字符
   * - 格式化为3组（XXXX-YYYY-ZZZZ）
   *
   * @returns {string} 核销码（格式：3K7J-2MQP-WXYZ）
   *
   * @example
   * const code = RedemptionCodeGenerator.generate()
   * console.log(code) // '3K7J-2MQP-WXYZ'
   */
  static generate() {
    let code = ''

    // 生成12个随机字符
    for (let i = 0; i < 12; i++) {
      const randomIndex = crypto.randomInt(0, BASE32_CHARS.length)
      code += BASE32_CHARS[randomIndex]
    }

    // 格式化为 XXXX-YYYY-ZZZZ
    return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`
  }

  /**
   * 计算核销码SHA-256哈希值
   *
   * 业务规则：
   * - 移除连字符（-）
   * - 转换为大写
   * - 计算SHA-256哈希
   * - 返回64位hex字符串
   *
   * @param {string} code - 核销码（带或不带连字符均可）
   * @returns {string} SHA-256哈希值（64位hex字符串）
   *
   * @example
   * const hash = RedemptionCodeGenerator.hash('3K7J-2MQP-WXYZ')
   * console.log(hash) // 'a1b2c3d4...'（64位hex）
   */
  static hash(code) {
    // 清理核销码：移除连字符并转大写
    const cleanCode = code.replace(/-/g, '').toUpperCase()

    // 计算SHA-256哈希
    return crypto.createHash('sha256').update(cleanCode).digest('hex')
  }

  /**
   * 验证核销码格式
   *
   * 业务规则：
   * - 格式：XXXX-YYYY-ZZZZ
   * - 字符：只允许Base32字符集（23456789ABCDEFGHJKMNPQRSTUVWXYZ）
   * - 长度：12位（不含连字符）
   *
   * @param {string} code - 待验证的核销码
   * @returns {boolean} true-格式正确，false-格式错误
   *
   * @example
   * RedemptionCodeGenerator.validate('3K7J-2MQP-WXYZ') // true
   * RedemptionCodeGenerator.validate('3K7J2MQPWXYZ')   // false (缺少连字符)
   * RedemptionCodeGenerator.validate('3K7J-2MQP-WX0Z') // false (包含数字0)
   */
  static validate(code) {
    // 正则表达式：4位-4位-4位，只允许Base32字符集
    const pattern = new RegExp(`^[${BASE32_CHARS}]{4}-[${BASE32_CHARS}]{4}-[${BASE32_CHARS}]{4}$`)
    return pattern.test(code)
  }

  /**
   * 生成带重试的唯一核销码
   *
   * 业务场景：生成核销码并确保唯一性（通过回调检查）
   *
   * @param {Function} checkUnique - 异步函数，检查核销码是否唯一
   * @param {number} maxRetries - 最大重试次数（默认3次）
   * @returns {Promise<string>} 唯一的核销码
   * @throws {Error} 超过最大重试次数
   *
   * @example
   * const code = await RedemptionCodeGenerator.generateUnique(async (code) => {
   *   const hash = RedemptionCodeGenerator.hash(code)
   *   const existing = await RedemptionOrder.findOne({ where: { code_hash: hash } })
   *   return !existing // 返回true表示唯一
   * })
   */
  static async generateUnique(checkUnique, maxRetries = 3) {
    let attempts = 0

    // eslint-disable-next-line no-await-in-loop
    while (attempts < maxRetries) {
      const code = this.generate()
      // eslint-disable-next-line no-await-in-loop
      const isUnique = await checkUnique(code)

      if (isUnique) {
        return code
      }

      attempts++
    }

    throw new Error(`核销码生成失败：重试${maxRetries}次仍有碰撞`)
  }

  /**
   * 批量生成核销码（用于测试）
   *
   * @param {number} count - 生成数量
   * @returns {Array<string>} 核销码数组
   *
   * @example
   * const codes = RedemptionCodeGenerator.generateBatch(10)
   * // ['3K7J-2MQP-WXYZ', '4N8K-3NRP-XYZW', ...]
   */
  static generateBatch(count) {
    const codes = []
    for (let i = 0; i < count; i++) {
      codes.push(this.generate())
    }
    return codes
  }

  /**
   * 格式化核销码（添加或移除连字符）
   *
   * @param {string} code - 原始核销码
   * @param {boolean} withHyphen - 是否包含连字符
   * @returns {string} 格式化后的核销码
   *
   * @example
   * RedemptionCodeGenerator.format('3K7J2MQPWXYZ', true)  // '3K7J-2MQP-WXYZ'
   * RedemptionCodeGenerator.format('3K7J-2MQP-WXYZ', false) // '3K7J2MQPWXYZ'
   */
  static format(code, withHyphen = true) {
    const cleanCode = code.replace(/-/g, '').toUpperCase()

    if (!withHyphen) {
      return cleanCode
    }

    return `${cleanCode.slice(0, 4)}-${cleanCode.slice(4, 8)}-${cleanCode.slice(8, 12)}`
  }
}

module.exports = RedemptionCodeGenerator
