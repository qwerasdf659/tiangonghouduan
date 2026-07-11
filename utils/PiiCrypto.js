/**
 * 个人信息保护加解密工具 — PiiCrypto
 *
 * 文件路径：utils/PiiCrypto.js
 *
 * 业务场景（路线B 合规改造 模块B / 第九节）：
 * - 手机号、收货信息等 PII 应用层加密存储 + HMAC 盲索引，解决"加密后仍能按手机号查/判重/登录"。
 * - 选型（决策 17.2，中小公司主流）：应用层 AES-256-GCM + HMAC-SHA256 双列，密钥来自 .env。
 *
 * 两类能力：
 * 1. encrypt/decrypt：AES-256-GCM 可逆加密（密钥 ENCRYPTION_KEY），用于存储/展示时解密。
 *    - 输出格式：v1:{iv_hex}:{authTag_hex}:{cipher_hex}（带版本前缀，便于未来算法升级）
 * 2. blindHash：HMAC-SHA256 不可逆盲索引（密钥 PII_HASH_SECRET），用于唯一约束/登录/判重查询。
 *    - 同输入恒定输出（可建唯一索引），不同密钥结果不同（防彩虹表）。
 *
 * 🔴 安全约束：
 * - 密钥只从 process.env 读取，禁止硬编码；缺失时 fail-closed（抛错）。
 * - GCM 模式自带完整性校验（authTag），防密文篡改。
 * - 盲索引仅用于等值查询，不可用于模糊匹配（这是设计取舍，非缺陷）。
 *
 * @module utils/PiiCrypto
 * @created 2026-06-08（路线B 合规改造 模块B）
 */

'use strict'

const crypto = require('crypto')

/** AES-256-GCM 算法标识 */
const ALGORITHM = 'aes-256-gcm'
/** 密文版本前缀（便于未来算法/密钥轮换识别） */
const CIPHER_VERSION = 'v1'
/** GCM 推荐 IV 长度（12 字节） */
const IV_LENGTH = 12

/**
 * 从环境变量派生 32 字节 AES 密钥
 *
 * ENCRYPTION_KEY 实测为 32 字符串；用 sha256 派生确保恒为 32 字节（兼容任意长度配置）。
 *
 * @returns {Buffer} 32 字节密钥
 * @throws {Error} ENCRYPTION_KEY 未配置时抛出（fail-closed）
 */
function getAesKey() {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error('PiiCrypto: ENCRYPTION_KEY 环境变量未配置，拒绝加解密（fail-closed）')
  }
  return crypto.createHash('sha256').update(String(key)).digest()
}

/**
 * 获取 HMAC 盲索引密钥
 *
 * @returns {string} HMAC 密钥
 * @throws {Error} PII_HASH_SECRET 未配置时抛出（fail-closed）
 */
function getHmacSecret() {
  const secret = process.env.PII_HASH_SECRET
  if (!secret) {
    throw new Error('PiiCrypto: PII_HASH_SECRET 环境变量未配置，拒绝生成盲索引（fail-closed）')
  }
  return String(secret)
}

/**
 * 个人信息加解密工具类（静态，无状态）
 *
 * @class PiiCrypto
 */
class PiiCrypto {
  /**
   * AES-256-GCM 加密
   *
   * @param {string} plain - 明文（如手机号）。空值（null/undefined/''）原样返回，不加密。
   * @returns {string|null} 密文 v1:{iv}:{tag}:{cipher}，或空值时返回原值
   */
  static encrypt(plain) {
    if (plain === null || plain === undefined || plain === '') {
      return plain
    }
    const key = getAesKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    return `${CIPHER_VERSION}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
  }

  /**
   * AES-256-GCM 解密（fail-fast：只接受 v1: 密文格式）
   *
   * 2026-07-11 技术债务收口：PII 加密回填已全量完成
   * （users.mobile_encrypted / user_addresses 加密列 100% 覆盖，明文 0 条），
   * 原「非 v1: 格式原样返回」的明文兜底分支已删除——
   * 遇到非法格式说明数据被篡改或回填遗漏，必须立刻暴露而不是静默放行。
   *
   * @param {string} cipherText - encrypt() 产出的密文。空值原样返回。
   * @returns {string|null} 明文，或空值时返回原值
   * @throws {Error} 密文格式非法或被篡改（authTag 校验失败）时抛出
   */
  static decrypt(cipherText) {
    if (cipherText === null || cipherText === undefined || cipherText === '') {
      return cipherText
    }
    const text = String(cipherText)
    if (!text.startsWith(`${CIPHER_VERSION}:`)) {
      throw new Error(
        `PII 密文格式非法（期望 ${CIPHER_VERSION}: 前缀）：数据可能被篡改或加密回填遗漏，拒绝解密`
      )
    }
    const parts = text.split(':')
    if (parts.length !== 4) {
      throw new Error('PII 密文结构非法（期望 v1:{iv}:{tag}:{cipher} 四段格式），拒绝解密')
    }
    const [, ivHex, tagHex, dataHex] = parts
    const key = getAesKey()
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final()
    ])
    return decrypted.toString('utf8')
  }

  /**
   * HMAC-SHA256 盲索引（不可逆，用于唯一约束/等值查询）
   *
   * @param {string} plain - 明文（如手机号）。空值返回 null。
   * @returns {string|null} 64 位十六进制哈希，或 null
   */
  static blindHash(plain) {
    if (plain === null || plain === undefined || plain === '') {
      return null
    }
    return crypto.createHmac('sha256', getHmacSecret()).update(String(plain)).digest('hex')
  }

  /**
   * 手机号前缀（号段）盲索引：对前 N 位（默认 3 位号段）做 HMAC
   *
   * 用途：管理端「按号段搜用户」（如输入 136 命中该号段全部用户）。
   * 注意：号段有限、区分度低，可被反推号段分布，但不暴露完整号（风险可接受）。
   *
   * @param {string} mobile - 手机号明文。长度不足 N 位或空值返回 null。
   * @param {number} [len=3] - 前缀位数
   * @returns {string|null} 前缀盲索引，或 null
   */
  static prefixHash(mobile, len = 3) {
    if (mobile === null || mobile === undefined || mobile === '') {
      return null
    }
    const s = String(mobile)
    if (s.length < len) return null
    return PiiCrypto.blindHash(s.substring(0, len))
  }

  /**
   * 手机号尾号盲索引：对后 N 位（默认 4 位尾号）做 HMAC
   *
   * 用途：管理端「按尾号搜用户」（如输入 7930 命中该尾号用户），区分度较高、运营常用。
   *
   * @param {string} mobile - 手机号明文。长度不足 N 位或空值返回 null。
   * @param {number} [len=4] - 尾号位数
   * @returns {string|null} 尾号盲索引，或 null
   */
  static suffixHash(mobile, len = 4) {
    if (mobile === null || mobile === undefined || mobile === '') {
      return null
    }
    const s = String(mobile)
    if (s.length < len) return null
    return PiiCrypto.blindHash(s.substring(s.length - len))
  }

  /**
   * 判断字符串是否为本工具产出的密文格式
   *
   * @param {string} value - 待判断值
   * @returns {boolean} true=是 v1 密文格式
   */
  static isEncrypted(value) {
    return (
      typeof value === 'string' &&
      value.startsWith(`${CIPHER_VERSION}:`) &&
      value.split(':').length === 4
    )
  }

  /**
   * 构建「手机号搜索」的 where 片段（方案二完整版：完整号/号段/尾号 三态分派）
   *
   * 加密手机号无法 LIKE 模糊搜，按运营输入的形态分派到对应盲索引列：
   * - 11 位纯数字 → mobile_hash 精确命中
   * - 3 位纯数字  → mobile_prefix_hash 号段命中
   * - 4 位纯数字  → mobile_suffix_hash 尾号命中
   * - 其余（中间片段/非数字）→ 返回 null（调用方应转为按昵称/用户ID搜，不对 mobile 做 LIKE）
   *
   * @param {string} input - 运营输入的搜索词
   * @returns {Object|null} 形如 { mobile_hash: '...' } 的 where 片段；不可按手机号搜时返回 null
   */
  static buildMobileSearchWhere(input) {
    if (input === null || input === undefined) return null
    const s = String(input).trim()
    if (s === '' || !/^\d+$/.test(s)) return null
    if (s.length === 11) {
      return { mobile_hash: PiiCrypto.blindHash(s) }
    }
    if (s.length === 3) {
      return { mobile_prefix_hash: PiiCrypto.blindHash(s) }
    }
    if (s.length === 4) {
      return { mobile_suffix_hash: PiiCrypto.blindHash(s) }
    }
    return null
  }
}

module.exports = PiiCrypto
