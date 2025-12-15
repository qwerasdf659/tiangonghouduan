/**
 * 材料资产类型模型 - 材料系统核心配置表
 * 创建时间：2025-12-15 16:56:20 (北京时间)
 * 版本号：v4.5.0-material-system
 *
 * 功能描述：
 * - 定义系统中存在的材料种类（碎红水晶、完整红水晶、橙碎片、完整橙水晶等）
 * - 支持动态新增材料类型，无需修改表结构
 * - 支持材料价值配置（可见价值、预算价值）
 * - 支持材料分组、形态、层级管理
 *
 * 架构设计：
 * - Model层只负责：字段定义、关联、基础校验
 * - 业务逻辑在Service层处理（MaterialService）
 * - 符合领域驱动设计（DDD）原则
 *
 * 关联关系：
 * - UserMaterialBalance：一对多（一个资产类型可被多个用户持有）
 * - MaterialConversionRule：一对多（一个资产类型可参与多个转换规则）
 * - MaterialTransaction：一对多（一个资产类型有多条流水记录）
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 材料资产类型模型类
 * @class MaterialAssetType
 * @extends {Model}
 */
class MaterialAssetType extends Model {
  /**
   * 定义模型关联关系
   * @param {Object} models - 所有Sequelize模型的集合
   * @returns {void}
   */
  static associate (models) {
    // 一对多：一个资产类型可被多个用户持有
    MaterialAssetType.hasMany(models.UserMaterialBalance, {
      foreignKey: 'asset_code',
      as: 'balances',
      comment: '用户材料余额'
    })

    // 一对多：一个资产类型可作为转换规则的源资产
    MaterialAssetType.hasMany(models.MaterialConversionRule, {
      foreignKey: 'from_asset_code',
      as: 'conversion_rules_from',
      comment: '作为源资产的转换规则'
    })

    // 一对多：一个资产类型可作为转换规则的目标资产
    MaterialAssetType.hasMany(models.MaterialConversionRule, {
      foreignKey: 'to_asset_code',
      as: 'conversion_rules_to',
      comment: '作为目标资产的转换规则'
    })

    // 一对多：一个资产类型有多条流水记录
    MaterialAssetType.hasMany(models.MaterialTransaction, {
      foreignKey: 'asset_code',
      as: 'transactions',
      comment: '材料流水记录'
    })
  }
}

/**
 * 初始化材料资产类型模型
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {typeof MaterialAssetType} 初始化后的模型类
 */
module.exports = sequelize => {
  MaterialAssetType.init(
    {
      // 主键：资产代码
      asset_code: {
        type: DataTypes.STRING(32),
        primaryKey: true,
        allowNull: false,
        comment: '资产代码（主键），如：red_shard（碎红水晶）、red_crystal（完整红水晶）'
      },

      // 展示名称
      display_name: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: '展示名称（用于前端显示），如：碎红水晶、完整红水晶'
      },

      // 材料组代码
      group_code: {
        type: DataTypes.STRING(16),
        allowNull: false,
        comment: '材料组代码（用于分组管理），如：red（红系）、orange（橙系）'
      },

      // 形态（碎片或完整体）
      form: {
        type: DataTypes.ENUM('shard', 'crystal'),
        allowNull: false,
        comment: '形态：shard（碎片）、crystal（完整体/水晶）'
      },

      // 层级
      tier: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '层级（红=1、橙=2、紫=3...），用于限制升级方向，避免循环转换'
      },

      // 可见价值（积分口径）
      visible_value_points: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: '可见价值（积分口径），用于展示、对齐门票单位、解释成本'
      },

      // 预算价值（积分口径）
      budget_value_points: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: '预算价值（积分口径），用于预算控奖、系统成本口径'
      },

      // 排序顺序
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序顺序（数字越小越靠前），用于前端展示排序'
      },

      // 是否启用
      is_enabled: {
        type: DataTypes.TINYINT(1),
        allowNull: false,
        defaultValue: 1,
        comment: '是否启用（1=启用，0=禁用）'
      },

      // 创建时间
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间（北京时间）'
      },

      // 更新时间
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间（北京时间）'
      }
    },
    {
      sequelize,
      modelName: 'MaterialAssetType',
      tableName: 'material_asset_types',
      timestamps: true,
      underscored: true,
      comment: '材料资产类型表（定义系统中存在的材料种类）',
      indexes: [
        {
          name: 'idx_group_form_tier',
          fields: ['group_code', 'form', 'tier']
        },
        {
          name: 'idx_is_enabled',
          fields: ['is_enabled']
        },
        {
          name: 'idx_sort_order',
          fields: ['sort_order']
        }
      ]
    }
  )

  return MaterialAssetType
}
