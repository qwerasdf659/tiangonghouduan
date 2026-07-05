/**
 * 商品编码生成器（ProductCodeGenerator）
 *
 * 业务场景：
 * - 为商品 SPU（exchange_items.item_code，前缀 SP）与 SKU（exchange_item_skus.sku_code，前缀 SK）
 *   生成「无意义随机码」：编码本身不携带任何业务语义，业务含义一律落在 EAV 属性表，编码永不"说谎"。
 * - 供线下产品手册印刷、管理后台展示、小程序照手册输码搜索定位商品（防枚举、不泄露经营数据）。
 *
 * 编码规范（详见 docs/商品编码体系设计方案.md §3）：
 * - 字符集：Base32 去易混淆字符（0/O/I/L/1），共 30 字符，与 RedemptionCodeGenerator 完全统一。
 * - 存储规范形：{prefix} + 12 位随机（如 SP7K9MQ3RWX2NV），无连字符，落库 + 唯一索引。
 * - 展示形：{prefix}-XXXX-XXXX-XXXX（如 SP-7K9M-Q3RW-X2NV），4+4+4 分组，用于手册/后台展示。
 * - 输入归一化：用户输入无论大小写/横线/空格，先归一化为规范形再匹配。
 *
 * 技术设计：
 * - 使用 crypto.randomInt（非 Math.random），密码学随机不可预测，防竞品顺序爬取。
 * - 唯一性由 generateUnique + 数据库唯一索引兜底，撞码重试，超限显式抛错（不静默兜底）。
 * - 与 RedemptionCodeGenerator 同字符集、同 crypto 范式；扩展点：支持前缀参数（SP/SK）。
 *
 * @module utils/ProductCodeGenerator
 */

'use strict'

const crypto = require('crypto')

/**
 * Base32 字符集（去除易混淆字符 0/O/I/L/1，共 30 字符）
 *
 * 与 utils/RedemptionCodeGenerator.js 的 BASE32_CHARS 完全一致：
 * 全大写、不区分大小写、无形近字符，便于用户照手册手工录入。
 * @type {string}
 */
const BASE32_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

/** 随机体长度（12 位，可被 4 整除 → 4+4+4 分组工整；30^12 ≈ 5.3×10^17 容量） */
const RANDOM_LENGTH = 12

/**
 * 商品编码生成器（静态类，职责单一：生成/格式化/归一化/校验商品编码）
 * @class ProductCodeGenerator
 */
class ProductCodeGenerator {
  /**
   * 生成规范形商品编码：{prefix} + 12 位随机字符（无连字符）
   *
   * @param {string} prefix - 层级前缀（SPU 用 'SP'，SKU 用 'SK'；仅标识层级，不含业务语义）
   * @returns {string} 规范形编码（如 'SP7K9MQ3RWX2NV'）
   * @throws {Error} prefix 为空时抛错
   *
   * @example
   * ProductCodeGenerator.generate('SP') // 'SP7K9MQ3RWX2NV'
   */
  static generate(prefix) {
    if (!prefix || typeof prefix !== 'string') {
      throw new Error('ProductCodeGenerator.generate 需要有效的 prefix（如 SP/SK）')
    }

    let body = ''
    for (let i = 0; i < RANDOM_LENGTH; i++) {
      const randomIndex = crypto.randomInt(0, BASE32_CHARS.length)
      body += BASE32_CHARS[randomIndex]
    }

    return `${prefix.toUpperCase()}${body}`
  }

  /**
   * 规范形 → 展示形（前缀 + 4+4+4 分组，便于手册对照逐段录入）
   *
   * @param {string} code - 规范形编码（如 'SP7K9MQ3RWX2NV'）
   * @returns {string} 展示形编码（如 'SP-7K9M-Q3RW-X2NV'）；入参为空时返回原值
   *
   * @example
   * ProductCodeGenerator.format('SP7K9MQ3RWX2NV') // 'SP-7K9M-Q3RW-X2NV'
   */
  static format(code) {
    if (!code || typeof code !== 'string') return code
    const clean = ProductCodeGenerator.normalize(code)
    // 末尾 12 位为随机体，其余为前缀（前缀长度可变，默认 SP/SK 两位）
    if (clean.length <= RANDOM_LENGTH) return clean
    const prefix = clean.slice(0, clean.length - RANDOM_LENGTH)
    const body = clean.slice(-RANDOM_LENGTH)
    return `${prefix}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`
  }

  /**
   * 输入归一化：用户输入 → 规范形（转大写 + 去除连字符/空格/所有非字母数字字符）
   *
   * 业务价值：用户从手册照抄编码时，无论输入 'sp-7k9m...' / 'sp 7k9m...' / 'SP7K9M...' 均命中同一规范形。
   *
   * @param {string} input - 用户原始输入
   * @returns {string} 归一化后的规范形（如 'SP7K9MQ3RWX2NV'）；入参非字符串时返回空串
   *
   * @example
   * ProductCodeGenerator.normalize('sp-7k9m-q3rw-x2nv') // 'SP7K9MQ3RWX2NV'
   */
  static normalize(input) {
    if (input === null || input === undefined) return ''
    return String(input)
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '')
  }

  /**
   * 校验编码格式：{prefix} + 12 位 Base32 字符（对规范形校验）
   *
   * @param {string} code - 待校验编码（会先归一化）
   * @param {string} prefix - 期望前缀（如 'SP'/'SK'）
   * @returns {boolean} 格式正确返回 true
   *
   * @example
   * ProductCodeGenerator.validate('SP-7K9M-Q3RW-X2NV', 'SP') // true
   * ProductCodeGenerator.validate('SK7K9MQ3RWX2NV', 'SP')     // false（前缀不符）
   */
  static validate(code, prefix) {
    if (!code || !prefix) return false
    const clean = ProductCodeGenerator.normalize(code)
    const pattern = new RegExp(`^${prefix.toUpperCase()}[${BASE32_CHARS}]{${RANDOM_LENGTH}}$`)
    return pattern.test(clean)
  }

  /**
   * 判断输入是否命中商品编码格式（SP/SK 前缀 + 12 位 Base32），用于搜索入口分流
   *
   * @param {string} input - 用户输入（会先归一化）
   * @returns {Object} 分流结果 { matched, prefix, normalized }：
   *   matched（是否命中编码格式）、prefix（命中的前缀 SP/SK，未命中为 null）、normalized（归一化规范形）
   *
   * @example
   * ProductCodeGenerator.detect('sp-7k9m-q3rw-x2nv')
   * // { matched: true, prefix: 'SP', normalized: 'SP7K9MQ3RWX2NV' }
   */
  static detect(input) {
    const normalized = ProductCodeGenerator.normalize(input)
    for (const prefix of ['SP', 'SK']) {
      if (ProductCodeGenerator.validate(normalized, prefix)) {
        return { matched: true, prefix, normalized }
      }
    }
    return { matched: false, prefix: null, normalized }
  }

  /**
   * 生成带唯一性校验的商品编码（撞码重试，超限显式抛错）
   *
   * 业务规则：
   * - 在事务内调用 checkUnique 校验编码是否唯一（通常查询对应表的唯一索引列）。
   * - 撞码则重试，最多 maxRetries 次仍冲突则抛错（显式失败，不静默兜底），由唯一索引兜底。
   *
   * @param {string} prefix - 层级前缀（'SP'/'SK'）
   * @param {Function} checkUnique - 异步回调：async (code) => boolean，返回 true 表示该码唯一可用
   * @param {number} [maxRetries=5] - 最大重试次数（默认 5）
   * @returns {Promise<string>} 唯一的规范形编码
   * @throws {Error} 超过最大重试次数仍冲突
   *
   * @example
   * const code = await ProductCodeGenerator.generateUnique('SP', async (c) => {
   *   const existing = await ExchangeItem.findOne({ where: { item_code: c }, transaction })
   *   return !existing
   * })
   */
  static async generateUnique(prefix, checkUnique, maxRetries = 5) {
    let attempts = 0

    while (attempts < maxRetries) {
      const code = ProductCodeGenerator.generate(prefix)
      // eslint-disable-next-line no-await-in-loop
      const isUnique = await checkUnique(code)
      if (isUnique) {
        return code
      }
      attempts++
    }

    throw new Error(`商品编码生成失败：前缀 ${prefix} 重试 ${maxRetries} 次仍有碰撞`)
  }
}

// 导出字符集常量供单测与系列号发号器等复用（避免多处硬编码字符集）
ProductCodeGenerator.BASE32_CHARS = BASE32_CHARS
ProductCodeGenerator.RANDOM_LENGTH = RANDOM_LENGTH

module.exports = ProductCodeGenerator
