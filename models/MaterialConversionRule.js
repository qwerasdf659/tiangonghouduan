/**
 * 材料转换规则模型 - 材料系统转换配置表
 * 创建时间：2025-12-15 16:56:22 (北京时间)
 * 版本号：v4.5.0-material-system
 *
 * 功能描述：
 * - 定义"从哪种材料按什么比例换到哪种材料"
 * - 支持动态调整兑换比例（通过新增未来生效规则实现版本化）
 * - 支持启用/禁用规则
 * - 支持历史追溯（通过effective_at字段记录生效时间）
 *
 * 架构设计：
 * - Model层只负责：字段定义、关联、基础校验
 * - 业务逻辑在Service层处理（MaterialService）
 * - 符合领域驱动设计（DDD）原则
 *
 * 关联关系：
 * - MaterialAssetType：多对一（from_asset_code、to_asset_code）
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 材料转换规则模型类
 * @class MaterialConversionRule
 * @extends {Model}
 */
class MaterialConversionRule extends Model {
  /**
   * 定义模型关联关系
   * @param {Object} models - 所有Sequelize模型的集合
   * @returns {void}
   */
  static associate (models) {
    // 多对一：多个规则可以有相同的源资产
    MaterialConversionRule.belongsTo(models.MaterialAssetType, {
      foreignKey: 'from_asset_code',
      as: 'from_asset',
      comment: '源材料资产类型'
    })

    // 多对一：多个规则可以有相同的目标资产
    MaterialConversionRule.belongsTo(models.MaterialAssetType, {
      foreignKey: 'to_asset_code',
      as: 'to_asset',
      comment: '目标材料资产类型'
    })
  }
}

/**
 * 初始化材料转换规则模型
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {typeof MaterialConversionRule} 初始化后的模型类
 */
module.exports = sequelize => {
  MaterialConversionRule.init(
    {
      // 主键：规则ID
      rule_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        comment: '规则ID（主键，自增）'
      },

      // 源资产代码（外键）
      from_asset_code: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: '源资产代码（从哪种材料转换）'
      },

      // 目标资产代码（外键）
      to_asset_code: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: '目标资产代码（转换成哪种材料）'
      },

      // 源材料数量
      from_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '源材料数量（需要消耗的源材料数量）'
      },

      // 目标材料数量
      to_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '目标材料数量（转换后获得的目标材料数量）'
      },

      // 生效时间
      effective_at: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '生效时间（北京时间），用于版本化管理'
      },

      // 是否启用
      is_enabled: {
        type: DataTypes.TINYINT(1),
        allowNull: false,
        defaultValue: 1,
        comment: '是否启用（1=启用，0=禁用）'
      },

      // 规则描述
      description: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '规则描述（可选），如：合成规则、分解规则、逐级分解规则'
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
      modelName: 'MaterialConversionRule',
      tableName: 'material_conversion_rules',
      timestamps: true,
      underscored: true,
      comment: '材料转换规则表（定义材料间的转换关系和比例）',
      indexes: [
        {
          name: 'uk_from_to_effective',
          unique: true,
          fields: ['from_asset_code', 'to_asset_code', 'effective_at']
        },
        {
          name: 'idx_from_to_enabled_effective',
          fields: ['from_asset_code', 'to_asset_code', 'is_enabled', 'effective_at']
        },
        {
          name: 'idx_is_enabled',
          fields: ['is_enabled']
        }
      ]
    }
  )

  return MaterialConversionRule
}
