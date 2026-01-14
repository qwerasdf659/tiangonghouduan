/**
 * 数据类型转换工具 - DECIMAL字段转数字类型
 *
 * 业务场景：解决MySQL DECIMAL类型通过Sequelize返回字符串的问题
 *
 * 根本原因：
 * - MySQL驱动返回DECIMAL类型为字符串（保证精度）
 * - 前端调用.toFixed()等数字方法时报错
 * - TypeError: (prize.prize_value || 0).toFixed is not a function
 *
 * 解决方案：
 * - 在API返回数据前统一转换DECIMAL字段为数字类型
 * - 使用parseFloat()保留小数精度
 * - 处理null/undefined情况，返回默认值0
 *
 * 适用字段：
 * - prize_value (DECIMAL(10,2)) - 奖品价值
 * - probability (DECIMAL(6,4)) - 概率
 * - win_probability (DECIMAL(8,6)) - 中奖概率
 * - amount (DECIMAL(10,2)) - 金额
 * - available_amount (DECIMAL(10,2)) - 可用余额（新资产账本）
 * - frozen_amount (DECIMAL(10,2)) - 冻结余额（新资产账本）
 *
 * 创建时间：2025年11月23日
 * 创建原因：修复前端TypeError错误，确保数字类型字段返回真正的数字
 */
class DecimalConverter {
  /**
   * 转换单个DECIMAL字段为数字
   * @param {string|number|null|undefined} value - DECIMAL字段值
   * @param {number} defaultValue - 默认值（默认0）
   * @returns {number} 转换后的数字
   *
   * @example
   * DecimalConverter.toNumber("100.50")  // 返回: 100.5
   * DecimalConverter.toNumber(null)      // 返回: 0
   * DecimalConverter.toNumber(undefined) // 返回: 0
   */
  static toNumber(value, defaultValue = 0) {
    if (value === null || value === undefined || value === '') {
      return defaultValue
    }

    const num = parseFloat(value)
    return isNaN(num) ? defaultValue : num
  }

  /**
   * 转换对象中的DECIMAL字段为数字
   * @param {Object} obj - 需要转换的对象
   * @param {Array<string>} fields - 需要转换的字段名数组
   * @returns {Object} 转换后的对象（不修改原对象）
   *
   * @example
   * const prize = { prize_value: "100.50", name: "奖品" }
   * DecimalConverter.convertFields(prize, ['prize_value'])
   * // 返回: { prize_value: 100.5, name: "奖品" }
   */
  static convertFields(obj, fields) {
    if (!obj || typeof obj !== 'object') {
      return obj
    }

    const converted = { ...obj }
    fields.forEach(field => {
      if (field in converted) {
        converted[field] = this.toNumber(converted[field])
      }
    })

    return converted
  }

  /**
   * 批量转换数组中对象的DECIMAL字段
   * @param {Array<Object>} array - 对象数组
   * @param {Array<string>} fields - 需要转换的字段名数组
   * @returns {Array<Object>} 转换后的数组
   *
   * @example
   * const prizes = [
   *   { prize_value: "100.50", name: "奖品1" },
   *   { prize_value: "200.00", name: "奖品2" }
   * ]
   * DecimalConverter.convertArray(prizes, ['prize_value'])
   */
  static convertArray(array, fields) {
    if (!Array.isArray(array)) {
      return array
    }

    return array.map(item => this.convertFields(item, fields))
  }

  /**
   * 转换奖品数据 - 专用方法
   * @param {Object|Array} data - 奖品数据（单个对象或数组）
   * @returns {Object|Array} 转换后的奖品数据
   *
   * @example
   * const prize = { prize_value: "100.50", probability: "0.1000" }
   * DecimalConverter.convertPrizeData(prize)
   * // 返回: { prize_value: 100.5, probability: 0.1 }
   */
  static convertPrizeData(data) {
    const prizeFields = [
      'prize_value', // 奖品价值
      'win_probability', // 中奖概率
      'cost_points' // 消耗积分
    ]

    if (Array.isArray(data)) {
      return this.convertArray(data, prizeFields)
    } else {
      return this.convertFields(data, prizeFields)
    }
  }

  /**
   * 转换用户积分账户数据 - 专用方法
   * 处理 points_account 嵌套结构中的 DECIMAL 字段转数字
   *
   * @param {Object|Array} data - 用户数据（单个对象或数组）
   * @returns {Object|Array} 转换后的用户数据
   *
   * @example
   * const user = { points_account: { available_points: "1500.00", frozen_points: "0.00" } }
   * DecimalConverter.convertUserData(user)
   * // 返回: { points_account: { available_points: 1500, frozen_points: 0, total_points: 1500 } }
   */
  static convertUserData(data) {
    const pointsAccountFields = [
      'available_points', // 可用积分
      'frozen_points', // 冻结积分
      'total_points' // 总积分
    ]

    if (Array.isArray(data)) {
      return data.map(item => this._convertPointsAccount(item, pointsAccountFields))
    } else {
      return this._convertPointsAccount(data, pointsAccountFields)
    }
  }

  /**
   * 内部方法：转换 points_account 嵌套结构的数字字段
   * @param {Object} item - 包含 points_account 的对象
   * @param {Array<string>} fields - 需要转换的字段名数组
   * @returns {Object} 转换后的对象
   * @private
   */
  static _convertPointsAccount(item, fields) {
    if (!item) return item

    const result = { ...item }
    if (result.points_account && typeof result.points_account === 'object') {
      result.points_account = { ...result.points_account }
      fields.forEach(field => {
        if (result.points_account[field] !== undefined) {
          result.points_account[field] = this.toNumber(result.points_account[field])
        }
      })
    }
    return result
  }

  /**
   * 转换交易记录数据 - 专用方法
   * @param {Object|Array} data - 交易记录数据
   * @returns {Object|Array} 转换后的交易记录数据
   */
  static convertTransactionData(data) {
    const transactionFields = [
      'amount', // 金额
      'points_before', // 交易前积分
      'points_after', // 交易后积分
      'points_change' // 积分变化
    ]

    if (Array.isArray(data)) {
      return this.convertArray(data, transactionFields)
    } else {
      return this.convertFields(data, transactionFields)
    }
  }

  /**
   * 转换商品数据 - 专用方法
   * @param {Object|Array} data - 商品数据
   * @returns {Object|Array} 转换后的商品数据
   */
  static convertProductData(data) {
    const productFields = [
      'price', // 价格
      'original_price', // 原价
      'points_price' // 积分价格
    ]

    if (Array.isArray(data)) {
      return this.convertArray(data, productFields)
    } else {
      return this.convertFields(data, productFields)
    }
  }

  /**
   * 智能转换 - 根据对象类型自动选择转换方法
   * @param {Object|Array} data - 需要转换的数据
   * @param {string} dataType - 数据类型标识（'prize'/'user'/'transaction'/'product'/'custom'）
   * @param {Array<string>} customFields - 自定义字段（dataType为'custom'时使用）
   * @returns {Object|Array} 转换后的数据
   *
   * @example
   * DecimalConverter.convert(prizeData, 'prize')
   * DecimalConverter.convert(userData, 'user')
   * DecimalConverter.convert(customData, 'custom', ['field1', 'field2'])
   */
  static convert(data, dataType = 'prize', customFields = []) {
    switch (dataType) {
      case 'prize':
        return this.convertPrizeData(data)
      case 'user':
        return this.convertUserData(data)
      case 'transaction':
        return this.convertTransactionData(data)
      case 'product':
        return this.convertProductData(data)
      case 'custom':
        if (Array.isArray(data)) {
          return this.convertArray(data, customFields)
        } else {
          return this.convertFields(data, customFields)
        }
      default:
        console.warn(`未知数据类型: ${dataType}，返回原始数据`)
        return data
    }
  }
}

module.exports = DecimalConverter
