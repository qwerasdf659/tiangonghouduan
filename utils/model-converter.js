/**
 * Sequelize模型转换工具
 *
 * 功能：安全地将Sequelize模型实例转换为普通JavaScript对象
 * 用途：解决直接展开Sequelize对象导致字段丢失的问题
 *
 * 业务场景：
 * - map()转换数组时保留所有字段
 * - 添加计算字段时不丢失原始数据
 * - API返回数据时确保完整性
 *
 * 创建时间：2025年11月23日
 */

/**
 * 模型转换工具类
 *
 * @class ModelConverter
 */
class ModelConverter {
  /**
   * 安全转换Sequelize模型为普通对象
   *
   * @description
   * Sequelize模型实例的字段存储在dataValues中，直接展开会丢失字段。
   * 此方法确保所有字段都被正确转换为普通对象。
   *
   * @param {Object|Array} model - Sequelize模型实例或数组
   * @param {Object} options - 转换选项
   * @param {Array<string>} options.fields - 字段白名单（只返回指定字段）
   * @param {boolean} options.removeInternalFields - 是否移除Sequelize内部字段
   * @returns {Object|Array} 普通对象或对象数组
   *
   * @example
   * // 基础转换
   * const plain = ModelConverter.toPlainObject(prizeModel)
   *
   * // 批量转换
   * const plains = ModelConverter.toPlainObject(prizeModels)
   *
   * // 字段过滤
   * const filtered = ModelConverter.toPlainObject(prizeModel, {
   *   fields: ['prize_id', 'prize_name', 'win_probability']
   * })
   */
  static toPlainObject(model, options = {}) {
    // 处理null/undefined
    if (!model) return null

    // 处理数组：递归转换每个元素
    if (Array.isArray(model)) {
      return model.map(m => this.toPlainObject(m, options))
    }

    // 转换Sequelize实例为普通对象
    let plainObject

    if (model.dataValues) {
      // Sequelize模型实例（最常见）
      plainObject = { ...model.dataValues }
    } else if (model.toJSON && typeof model.toJSON === 'function') {
      // 有toJSON方法的对象
      plainObject = model.toJSON()
    } else {
      // 已经是普通对象
      plainObject = { ...model }
    }

    // 可选：移除Sequelize内部字段
    if (options.removeInternalFields) {
      delete plainObject._previousDataValues
      delete plainObject._changed
      delete plainObject._options
      delete plainObject.isNewRecord
      delete plainObject.dataValues
    }

    // 可选：字段白名单过滤
    if (options.fields && Array.isArray(options.fields)) {
      const filtered = {}
      options.fields.forEach(field => {
        if (plainObject[field] !== undefined) {
          filtered[field] = plainObject[field]
        }
      })
      return filtered
    }

    return plainObject
  }

  /**
   * 批量转换（性能优化版本）
   *
   * @param {Array} models - Sequelize模型实例数组
   * @param {Object} options - 转换选项
   * @returns {Array} 普通对象数组
   *
   * @example
   * const plains = ModelConverter.bulkConvert(prizes, {
   *   fields: ['prize_id', 'prize_name'],
   *   removeInternalFields: true
   * })
   */
  static bulkConvert(models, options = {}) {
    if (!Array.isArray(models)) {
      throw new Error('bulkConvert需要数组参数')
    }

    return models.map(model => this.toPlainObject(model, options))
  }

  /**
   * 检查对象是否为Sequelize模型实例
   *
   * @param {Object} obj - 要检查的对象
   * @returns {boolean} 是否为Sequelize模型
   *
   * @example
   * if (ModelConverter.isSequelizeModel(prize)) {
   *   const plain = ModelConverter.toPlainObject(prize)
   * }
   */
  static isSequelizeModel(obj) {
    return obj && (obj.dataValues !== undefined || (obj.toJSON && typeof obj.toJSON === 'function'))
  }
}

module.exports = ModelConverter
