/**
 * IP 归属地解析工具（IpLocationHelper）
 *
 * 业务场景（决策E，docs/会话认证体系最终方案-设备级多会话.md 14.2/14.4）：
 * - 用户端/管理端"设备列表"把 login_ip 翻译为登录地（如"中国·江苏省·南京市"），用于账号安全自查。
 * - 登录地为纯展示字段，不参与任何安全判定。
 *
 * 技术选型：
 * - 使用 ip2region（纯本地离线库，~5MB，毫秒级内存查询，不调任何第三方 API、无网络依赖、无隐私外发）。
 * - 单例缓存 Searcher 实例，避免重复加载离线数据文件。
 * - 任何异常/内网IP/空值均降级为 null（不抛错，不阻塞业务）。
 *
 * @module utils/IpLocationHelper
 */

const logger = require('./logger').logger

/** ip2region Searcher 单例（懒加载） */
let _searcher = null
/** 标记初始化是否失败，失败后不再重复尝试，直接降级 */
let _initFailed = false

/**
 * 获取 ip2region Searcher 单例
 * @returns {Object|null} Searcher 实例或 null（加载失败时）
 */
function getSearcher() {
  if (_searcher) return _searcher
  if (_initFailed) return null
  try {
    const Searcher = require('ip2region').default || require('ip2region')
    _searcher = new Searcher()
    return _searcher
  } catch (error) {
    _initFailed = true
    logger.warn(`⚠️ [IpLocation] ip2region 初始化失败，登录地解析降级为 null: ${error.message}`)
    return null
  }
}

/**
 * 判断是否为内网/保留地址（无归属地意义，直接跳过查询）
 * @param {string} ip - IP 地址
 * @returns {boolean} 是否为内网/保留地址
 */
function isPrivateIp(ip) {
  if (!ip) return true
  // IPv6 本地回环 / IPv4 回环、私有段、链路本地
  return (
    ip === '::1' ||
    ip === '127.0.0.1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith('fe80:') ||
    ip.startsWith('fc') ||
    ip.startsWith('fd')
  )
}

/**
 * 将 IP 解析为可读登录地字符串
 *
 * @param {string|null} ip - 登录IP（IPv4）
 * @returns {Promise<string|null>} 登录地（如"中国·江苏省·南京市"）或 null（无法解析时）
 *
 * @example
 * await IpLocationHelper.resolve('114.114.114.114') // → '中国·江苏省·南京市'
 * await IpLocationHelper.resolve('127.0.0.1')        // → null（内网）
 */
async function resolve(ip) {
  if (!ip || isPrivateIp(ip)) {
    return null
  }

  const searcher = getSearcher()
  if (!searcher) {
    return null
  }

  try {
    const result = await searcher.search(ip)
    if (!result) return null

    // ip2region 返回 { country, province, city, isp }，组装为可读字符串（去空段）
    const parts = [result.country, result.province, result.city].filter(
      seg => seg && seg !== '0' && seg.trim() !== ''
    )
    return parts.length > 0 ? parts.join('·') : null
  } catch (error) {
    logger.debug(`[IpLocation] 解析失败 ip=${ip}: ${error.message}`)
    return null
  }
}

module.exports = { resolve, isPrivateIp }
