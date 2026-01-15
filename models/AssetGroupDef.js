/**
 * 资产分组字典模型
 *
 * 业务场景：
 * - 定义可交易资产的分组（如货币、积分、红色材料、蓝色材料等）
 * - 为材料资产类型和市场挂牌提供标准化分组
 * - 控制分组级别的交易开关
 *
 * 硬约束：
 * - group_code 为主键，使用语义化业务代码（如 currency、red、blue）
 * - 所有分组必须来自此表，禁止硬编码
 * - material_asset_types.group_code 外键引用此表
 *
 * 命名规范（snake_case）：
 * - 表名：asset_group_defs
 * - 主键：group_code（字符串主键）
 *
 * @version 1.0.0
 * @date 2026-01-15
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 资产分组字典模型类
 * 职责：资产分组定义和管理
 * 设计模式：字典表模式
 */
class AssetGroupDef extends Model {
  /**
   * 静态关联定义
   *
   * @param {Object} models - Sequelize所有模型的集合对象
   * @returns {void} 无返回值，仅定义关联关系
   */
  static associate(models) {
    // 关联材料资产类型（一个分组有多个材料类型）
    if (models.MaterialAssetType) {
      AssetGroupDef.hasMany(models.MaterialAssetType, {
        foreignKey: 'group_code',
        sourceKey: 'group_code',
        as: 'material_asset_types'
      })
    }

    // 关联市场挂牌（一个分组有多个挂牌记录）
    if (models.MarketListing) {
      AssetGroupDef.hasMany(models.MarketListing, {
        foreignKey: 'offer_asset_group_code',
        sourceKey: 'group_code',
        as: 'market_listings'
      })
    }
  }

  /**
   * 获取所有启用的分组（按排序）
   *
   * @returns {Promise<Array>} 启用的分组列表
   */
  static async getEnabled() {
    return this.findAll({
      where: { is_enabled: true },
      order: [['sort_order', 'ASC']]
    })
  }

  /**
   * 获取所有可交易的分组
   *
   * @returns {Promise<Array>} 可交易的分组列表
   */
  static async getTradable() {
    return this.findAll({
      where: {
        is_enabled: true,
        is_tradable: true
      },
      order: [['sort_order', 'ASC']]
    })
  }

  /**
   * 按分组类型获取分组
   *
   * @param {string} groupType - 分组类型：system/material/custom
   * @returns {Promise<Array>} 符合条件的分组列表
   */
  static async getByType(groupType) {
    return this.findAll({
      where: {
        is_enabled: true,
        group_type: groupType
      },
      order: [['sort_order', 'ASC']]
    })
  }
}

/**
 * 模型初始化
 *
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {AssetGroupDef} 初始化后的模型
 */
module.exports = sequelize => {
  AssetGroupDef.init(
    {
      // 分组代码（主键，语义化业务标识）
      group_code: {
        type: DataTypes.STRING(50),
        primaryKey: true,
        allowNull: false,
        comment: '分组代码（主键）：如 currency, points, red, orange, yellow, green, blue, purple'
      },

      // 显示名称（用户可见）
      display_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '显示名称（UI展示）'
      },

      // 分组描述
      description: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '分组描述'
      },

      // 分组类型
      group_type: {
        type: DataTypes.ENUM('system', 'material', 'custom'),
        allowNull: false,
        defaultValue: 'material',
        comment: '分组类型：system=系统级（积分/货币）, material=材料组, custom=自定义'
      },

      // 主题颜色（HEX格式）
      color_hex: {
        type: DataTypes.STRING(7),
        allowNull: true,
        comment: '主题颜色（HEX格式）：如 #FF0000'
      },

      // 排序顺序
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序顺序（升序）'
      },

      // 是否启用
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用'
      },

      // 是否可交易
      is_tradable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '该分组资产是否允许交易'
      }
    },
    {
      sequelize,
      modelName: 'AssetGroupDef',
      tableName: 'asset_group_defs',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '资产分组字典表（Asset Group Definitions - 可交易资产分组定义）'
    }
  )

  return AssetGroupDef
}
