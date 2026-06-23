/**
 * 天工商户营销平台 - 时间处理工具
 * 🕐 中国区域北京时间 (Asia/Shanghai) 专用工具
 * 创建时间：2025年08月22日 23:22 北京时间
 * 最后更新：2025年08月22日 23:22 北京时间
 */

'use strict'

/**
 * 北京时间工具类
 * 所有时间相关的操作都使用北京时间 (UTC+8)
 */
class BeijingTimeHelper {
  /**
   * 获取当前北京时间的ISO字符串
   * @returns {string} 北京时间的ISO格式字符串 (格式: 2025-10-01T23:49:00.000+08:00)
   */
  static now() {
    return BeijingTimeHelper._toBeijingISO(new Date())
  }

  /**
   * 获取当前北京时间的本地化字符串
   * @returns {string} 北京时间的本地化字符串
   */
  static nowLocale() {
    return new Date().toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  /**
   * 获取当前北京时间戳
   * @returns {number} 时间戳
   */
  static timestamp() {
    return Date.now()
  }

  /**
   * 获取当前北京时间的 Date 对象
   * 用于数据库操作（Sequelize 会自动处理时区）
   * @returns {Date} 当前时间的 Date 对象
   */
  static nowDate() {
    return new Date()
  }

  /**
   * 将UTC时间转换为北京时间字符串
   * @param {Date|string} date - 输入时间
   * @returns {string} 北京时间字符串
   */
  static toBeijingTime(date) {
    const inputDate = new Date(date)
    return inputDate.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  /**
   * 获取API响应用的标准时间戳
   * 使用北京时间，但保持ISO格式便于前端处理
   * @returns {string} 标准时间戳
   */
  static apiTimestamp() {
    /*
     * 对于API响应，返回带 +08:00 时区信息的北京时间 ISO 字符串。
     * 该实现与进程时区无关（不依赖 getTimezoneOffset），无论进程 TZ 为 UTC 还是 Asia/Shanghai
     * 结果都表示同一真实时刻，避免双重偏移导致相差 8 小时的 BUG。
     */
    return BeijingTimeHelper._toBeijingISO(new Date())
  }

  /**
   * 将任意时刻转换为"北京时间墙钟 + +08:00 后缀"的 ISO 字符串（进程时区无关）
   *
   * 原理：absolute UTC 毫秒数 + 8 小时，再用 toISOString() 读取其 UTC 字段即为北京墙钟，
   * 然后把 Z 替换为 +08:00。无论进程 TZ 如何，同一真实时刻得到同一结果。
   *
   * @param {Date} date - 输入时刻（绝对时刻，与时区无关）
   * @returns {string} 形如 2025-10-01T23:49:00.000+08:00
   * @private
   */
  static _toBeijingISO(date) {
    const beijingMs = date.getTime() + 8 * 60 * 60 * 1000
    return new Date(beijingMs).toISOString().replace('Z', '+08:00')
  }

  /**
   * 格式化时间为中文显示
   * @param {Date|string} date - 输入时间
   * @returns {string} 中文时间格式
   */
  static formatChinese(date = new Date()) {
    const inputDate = new Date(date)
    return inputDate.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'long'
    })
  }

  /**
   * 格式化时间为指定格式（北京时间）
   * 支持格式：YYYY-MM-DD, YYYY-MM-DD HH:mm:ss, YYYY-MM-DD HH:00:00 等
   * @param {Date|string} date - 输入时间
   * @param {string} formatStr - 格式字符串（默认 'YYYY-MM-DD HH:mm:ss'）
   * @returns {string} 格式化后的时间字符串
   */
  static format(date = new Date(), formatStr = 'YYYY-MM-DD HH:mm:ss') {
    const inputDate = new Date(date)
    // 转换为北京时间
    const beijingDate = new Date(inputDate.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))

    const year = beijingDate.getFullYear()
    const month = String(beijingDate.getMonth() + 1).padStart(2, '0')
    const day = String(beijingDate.getDate()).padStart(2, '0')
    const hours = String(beijingDate.getHours()).padStart(2, '0')
    const minutes = String(beijingDate.getMinutes()).padStart(2, '0')
    const seconds = String(beijingDate.getSeconds()).padStart(2, '0')

    return formatStr
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds)
  }

  /**
   * 获取今日开始时间（北京时间）
   * @returns {Date} 今日00:00:00的Date对象
   */
  static todayStart() {
    const now = new Date()
    const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
    today.setHours(0, 0, 0, 0)
    return today
  }

  /**
   * 获取今日结束时间（北京时间）
   * @returns {Date} 今日23:59:59的Date对象
   */
  static todayEnd() {
    const now = new Date()
    const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
    today.setHours(23, 59, 59, 999)
    return today
  }

  /**
   * 获取今日时间范围（北京时间）
   * 返回今日开始和结束时间的对象，用于数据库查询过滤
   * @returns {{ start: Date, end: Date }} 今日时间范围对象
   */
  static todayRange() {
    return {
      start: this.todayStart(),
      end: this.todayEnd()
    }
  }

  /**
   * 获取指定日期的开始时间（北京时间 00:00:00）
   * @param {Date|string} date - 输入日期
   * @returns {Date} 该日期 00:00:00 的 Date 对象
   */
  static startOfDay(date = new Date()) {
    const inputDate = new Date(date)
    const beijingDate = new Date(inputDate.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
    beijingDate.setHours(0, 0, 0, 0)
    return beijingDate
  }

  /**
   * 获取指定日期的结束时间（北京时间 23:59:59.999）
   * @param {Date|string} date - 输入日期
   * @returns {Date} 该日期 23:59:59.999 的 Date 对象
   */
  static endOfDay(date = new Date()) {
    const inputDate = new Date(date)
    const beijingDate = new Date(inputDate.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
    beijingDate.setHours(23, 59, 59, 999)
    return beijingDate
  }

  /**
   * 获取指定天数前的时间（北京时间）
   * @param {number} days - 天数
   * @returns {Date} 指定天数前的Date对象
   */
  static daysAgo(days) {
    const now = new Date()
    const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    return new Date(past.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
  }

  /**
   * 检查是否为今天（北京时间）
   * @param {Date|string} date - 要检查的时间
   * @returns {boolean} 是否为今天
   */
  static isToday(date) {
    const inputDate = new Date(date)
    const today = new Date()

    const inputDateBeijing = inputDate.toLocaleDateString('en-US', { timeZone: 'Asia/Shanghai' })
    const todayBeijing = today.toLocaleDateString('en-US', { timeZone: 'Asia/Shanghai' })

    return inputDateBeijing === todayBeijing
  }

  /**
   * 获取中文星期显示
   * @param {Date|string} date - 输入时间
   * @returns {string} 中文星期
   */
  static getChineseWeekday(date = new Date()) {
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    const inputDate = new Date(date)
    const beijingDate = new Date(inputDate.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
    return `星期${weekdays[beijingDate.getDay()]}`
  }

  /**
   * 格式化为数据库存储格式（保持UTC但基于北京时间逻辑）
   * @param {Date|string} date - 输入时间
   * @returns {string} 数据库时间格式
   */
  static toDatabaseFormat(date = new Date()) {
    const inputDate = new Date(date)
    return inputDate.toISOString()
  }

  /**
   * 创建北京时间的Date对象
   * @returns {Date} 北京时间的Date对象
   */
  static createBeijingTime() {
    const now = new Date()
    const beijingTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
    return beijingTime
  }

  /**
   * 解析时间字符串为Date对象（用于数据库查询）
   * 支持 ISO 格式、北京时间格式等各种时间字符串
   * @param {string|Date} timeStr - 时间字符串或Date对象
   * @returns {Date} 解析后的Date对象
   */
  static parseBeijingTime(timeStr) {
    if (!timeStr) {
      return null
    }
    // 如果已经是 Date 对象，直接返回
    if (timeStr instanceof Date) {
      return timeStr
    }
    // 解析字符串为 Date 对象
    const parsed = new Date(timeStr)
    if (isNaN(parsed.getTime())) {
      console.warn(`[BeijingTimeHelper] 无法解析时间字符串: ${timeStr}`)
      return null
    }
    return parsed
  }

  /**
   * 格式化为友好的相对时间显示（中文）
   * @param {Date|string} date - 输入时间
   * @returns {string} 相对时间字符串
   */
  static formatRelativeTime(date) {
    const inputDate = new Date(date)
    const now = BeijingTimeHelper.createBeijingTime()
    const diffMs = now - inputDate
    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffSeconds / 60)
    const diffHours = Math.floor(diffMinutes / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffDays > 0) {
      return `${diffDays}天前`
    } else if (diffHours > 0) {
      return `${diffHours}小时前`
    } else if (diffMinutes > 0) {
      return `${diffMinutes}分钟前`
    } else if (diffSeconds > 0) {
      return `${diffSeconds}秒前`
    } else {
      return '刚刚'
    }
  }

  /**
   * 获取当前是上午还是下午
   * @returns {string} AM/PM的中文表示
   */
  static getAmPm() {
    const beijingTime = BeijingTimeHelper.createBeijingTime()
    const hour = beijingTime.getHours()
    return hour < 12 ? '上午' : '下午'
  }

  /**
   * 格式化为完整的中文日期时间
   * @param {Date|string} date - 输入时间
   * @returns {string} 完整的中文日期时间
   */
  static formatFullChinese(date = new Date()) {
    const inputDate = new Date(date)
    const beijingTime = inputDate.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'long'
    })
    return `${beijingTime} (北京时间)`
  }

  /**
   * 🔧 扩展现有功能：验证时间戳格式是否有效
   * @param {string} timestamp - 时间戳字符串
   * @returns {boolean} 是否为有效的时间戳格式
   */
  static isValid(timestamp) {
    if (!timestamp || typeof timestamp !== 'string') {
      return false
    }

    try {
      const date = new Date(timestamp)
      // 检查是否为有效日期
      if (isNaN(date.getTime())) {
        return false
      }

      // 检查是否符合ISO格式（包括北京时间格式）
      const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/
      return isoPattern.test(timestamp)
    } catch (error) {
      return false
    }
  }

  /**
   * 🆕 创建数据库存储用的Date对象（北京时间）
   * 替代 new Date() 和 DataTypes.NOW
   * @returns {Date} 当前北京时间的Date对象
   */
  static createDatabaseTime() {
    /*
     * 返回当前时间的Date对象，数据库会自动处理时区
     * 由于数据库配置了timezone: '+08:00'，会正确存储为北京时间
     */
    return new Date()
  }

  /**
   * 🆕 获取未来某个时间点（北京时间）
   * 用于设置过期时间等场景
   * @param {number} milliseconds - 毫秒数
   * @returns {Date} 未来时间的Date对象
   */
  static futureTime(milliseconds) {
    return new Date(Date.now() + milliseconds)
  }

  /**
   * 🆕 检查时间是否已过期（北京时间）
   * @param {Date|string} expiryTime - 过期时间
   * @returns {boolean} 是否已过期
   */
  static isExpired(expiryTime) {
    if (!expiryTime) return false
    const expiry = new Date(expiryTime)
    return new Date() > expiry
  }

  /**
   * 🆕 计算时间差（毫秒）
   * @param {Date|string} startTime - 开始时间
   * @param {Date|string} endTime - 结束时间（默认当前时间）
   * @returns {number} 时间差（毫秒）
   */
  static timeDiff(startTime, endTime = new Date()) {
    const start = new Date(startTime)
    const end = new Date(endTime)
    return end.getTime() - start.getTime()
  }

  /**
   * 🆕 格式化时间差为友好显示
   * @param {number} milliseconds - 毫秒数
   * @returns {string} 友好的时间差显示
   */
  static formatDuration(milliseconds) {
    if (milliseconds < 1000) {
      return `${milliseconds}毫秒`
    }
    const seconds = Math.floor(milliseconds / 1000)
    if (seconds < 60) {
      return `${seconds}秒`
    }
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) {
      return `${minutes}分钟${seconds % 60}秒`
    }
    const hours = Math.floor(minutes / 60)
    if (hours < 24) {
      return `${hours}小时${minutes % 60}分钟`
    }
    const days = Math.floor(hours / 24)
    return `${days}天${hours % 24}小时`
  }

  /**
   * 🔧 将任意时间转换为ISO8601格式（带+08:00时区）
   * 用于API响应中的时间字段标准化
   * @param {Date|string|null} date - 输入时间（支持Date对象、时间字符串、null）
   * @returns {string|null} ISO8601格式的时间字符串，如果输入为null则返回null
   * @example
   * // 输入: '2025-07-07 00:11:11'
   * // 输出: '2025-07-07T00:11:11.000+08:00'
   */
  static formatToISO(date) {
    if (!date) return null

    /*
     * 输入分两类，需区别处理（否则会产生 8 小时偏移）：
     * 1) 无时区信息的"北京墙钟字符串"（项目 DB dateStrings:true 的返回，如 '2025-07-07 00:11:11'
     *    或 '2025-07-07T00:11:11'）：它已经是北京时间，只需补 +08:00 后缀，不做任何时移。
     * 2) Date 对象 / 带时区的字符串（绝对时刻）：转换为北京墙钟（与进程时区无关）。
     */
    if (typeof date === 'string') {
      const hasTimezone = /([Zz]|[+-]\d{2}:?\d{2})$/.test(date.trim())
      if (!hasTimezone) {
        // 北京墙钟字符串：规范化为 ISO，补 .000 毫秒与 +08:00，不时移
        const m = date
          .trim()
          .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/)
        if (m) {
          const ms = (m[7] || '0').padEnd(3, '0')
          return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${ms}+08:00`
        }
      }
    }

    // Date 对象或带时区字符串：按绝对时刻转北京时间（进程时区无关）
    const inputDate = new Date(date)
    if (isNaN(inputDate.getTime())) return null
    return BeijingTimeHelper._toBeijingISO(inputDate)
  }

  /**
   * 🆕 生成唯一ID用的时间戳字符串
   * @returns {string} 36进制时间戳字符串
   */
  static generateIdTimestamp() {
    return Date.now().toString(36)
  }

  /**
   * 🆕 格式化日期为指定格式（北京时间）
   * 支持格式：YYYY-MM-DD、YYYYMMDD、YYYY/MM/DD、HH:mm:ss 等
   * @param {Date|string} date - 输入时间
   * @param {string} format - 格式模板
   * @returns {string} 格式化后的时间字符串
   */
  static formatDate(date = new Date(), format = 'YYYY-MM-DD') {
    const inputDate = new Date(date)

    // 转换为北京时间
    const beijingDate = new Date(inputDate.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))

    const year = beijingDate.getFullYear()
    const month = String(beijingDate.getMonth() + 1).padStart(2, '0')
    const day = String(beijingDate.getDate()).padStart(2, '0')
    const hours = String(beijingDate.getHours()).padStart(2, '0')
    const minutes = String(beijingDate.getMinutes()).padStart(2, '0')
    const seconds = String(beijingDate.getSeconds()).padStart(2, '0')

    return format
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds)
  }

  /**
   * 🆕 标准化API响应时间格式
   * 确保所有API返回的时间格式一致
   * @param {Date|string} date - 输入时间
   * @returns {Object} 包含多种格式的时间对象
   */
  static formatForAPI(date = new Date()) {
    /*
     * 判空修复（2026-06-24）：date 为 null/undefined/空串/无效日期时返回 null，
     * 不再 new Date(null) 落到 epoch 0 而错误显示为 1970-01-01。
     * 典型场景：审核链未完成时 completed_at/actioned_at 为 null，前端据 null 显示"—/未完成"。
     */
    if (date === null || date === undefined || date === '') return null
    const inputDate = new Date(date)
    if (isNaN(inputDate.getTime())) return null
    return {
      iso: inputDate.toISOString(),
      beijing: BeijingTimeHelper.toBeijingTime(inputDate),
      timestamp: inputDate.getTime(),
      relative: BeijingTimeHelper.formatRelativeTime(inputDate)
    }
  }

  /**
   * 🔧 扩展现有功能：解析时间戳，返回可验证的日期对象
   * @param {string} timestamp - 时间戳字符串
   * @returns {Object} 包含isValid方法的日期解析结果
   */
  static parse(timestamp) {
    return {
      originalTimestamp: timestamp,
      parsedDate: new Date(timestamp),

      /**
       * 验证解析结果是否有效
       * @returns {boolean} 解析是否成功
       */
      isValid() {
        return BeijingTimeHelper.isValid(timestamp) && !isNaN(this.parsedDate.getTime())
      },

      /**
       * 获取北京时间格式
       * @returns {string} 北京时间字符串
       */
      toBeijingString() {
        if (!this.isValid()) return 'Invalid Date'
        return BeijingTimeHelper.toBeijingTime(this.parsedDate)
      },

      /**
       * 获取ISO格式字符串
       * @returns {string} ISO格式时间字符串
       */
      toISOString() {
        if (!this.isValid()) return 'Invalid Date'
        return this.parsedDate.toISOString()
      }
    }
  }
}

module.exports = BeijingTimeHelper
