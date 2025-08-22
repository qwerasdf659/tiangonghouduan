/**
 * 餐厅积分抽奖系统 - 时间处理工具
 * 🕐 中国区域北京时间 (Asia/Shanghai) 专用工具
 * 创建时间：2025年08月22日 北京时间
 */

'use strict'

/**
 * 北京时间工具类
 * 所有时间相关的操作都使用北京时间 (UTC+8)
 */
class BeijingTimeHelper {
  /**
   * 获取当前北京时间的ISO字符串
   * @returns {string} 北京时间的ISO格式字符串
   */
  static now () {
    const now = new Date()
    // 转换为北京时间
    const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000))
    return beijingTime.toISOString()
  }

  /**
   * 获取当前北京时间的本地化字符串
   * @returns {string} 北京时间的本地化字符串
   */
  static nowLocale () {
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
  static timestamp () {
    return Date.now()
  }

  /**
   * 将UTC时间转换为北京时间字符串
   * @param {Date|string} date - 输入时间
   * @returns {string} 北京时间字符串
   */
  static toBeijingTime (date) {
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
  static apiTimestamp () {
    // 对于API响应，我们返回带有时区信息的ISO字符串
    // 但实际上是北京时间
    const now = new Date()
    const beijingOffset = 8 * 60 // 北京时间偏移量（分钟）
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000)
    const beijingTime = new Date(utc + (beijingOffset * 60000))

    // 返回符合ISO格式但显示北京时间的字符串
    return beijingTime.toISOString().replace('Z', '+08:00')
  }

  /**
   * 格式化时间为中文显示
   * @param {Date|string} date - 输入时间
   * @returns {string} 中文时间格式
   */
  static formatChinese (date = new Date()) {
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
   * 获取今日开始时间（北京时间）
   * @returns {Date} 今日00:00:00的Date对象
   */
  static todayStart () {
    const now = new Date()
    const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
    today.setHours(0, 0, 0, 0)
    return today
  }

  /**
   * 获取今日结束时间（北京时间）
   * @returns {Date} 今日23:59:59的Date对象
   */
  static todayEnd () {
    const now = new Date()
    const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
    today.setHours(23, 59, 59, 999)
    return today
  }

  /**
   * 获取指定天数前的时间（北京时间）
   * @param {number} days - 天数
   * @returns {Date} 指定天数前的Date对象
   */
  static daysAgo (days) {
    const now = new Date()
    const past = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000))
    return new Date(past.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
  }

  /**
   * 检查是否为今天（北京时间）
   * @param {Date|string} date - 要检查的时间
   * @returns {boolean} 是否为今天
   */
  static isToday (date) {
    const inputDate = new Date(date)
    const today = new Date()

    const inputDateBeijing = inputDate.toLocaleDateString('en-US', { timeZone: 'Asia/Shanghai' })
    const todayBeijing = today.toLocaleDateString('en-US', { timeZone: 'Asia/Shanghai' })

    return inputDateBeijing === todayBeijing
  }
}

module.exports = BeijingTimeHelper 
