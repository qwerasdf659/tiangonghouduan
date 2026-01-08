/**
 * 材料资产类型模型
 *
 * Phase 2 - P1-1：材料配置表模型
 *
 * 业务场景：
 * - 材料类型配置（展示名称/分组/形态/层级）
 * - 价值口径配置（visible_value_points/budget_value_points）
 * - 材料展示与转换规则配置真相源
 *
 * 硬约束（来自文档）：
 * - **禁止硬编码**：所有材料类型必须来自配置表，便于运营动态调整
 * - 配置表真相：material_asset_types 为材料配置真相源
 * - 余额真相：account_asset_balances 为余额真相源（不在本表）
 *
 * 命名规范（snake_case）：
 * - 表名：material_asset_types
 * - 主键：material_asset_type_id
 *
 * 创建时间：2025-12-15
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 材料资产类型模型类
 * 职责：材料类型配置管理
 * 设计模式：配置表模式
 */
class MaterialAssetType extends Model {
  /**
   * 静态关联定义
   *
   * @param {Object} _models - Sequelize所有模型的集合对象（当前未使用）
   * @returns {void} 无返回值，仅定义关联关系
   */
  static associate(_models) {
    /*
     * 材料资产类型与材料转换规则的关联说明：
     * - 本表只存“材料展示与分组配置”
     * - 转换规则表以 from_asset_code/to_asset_code（字符串）引用 asset_code，因此不做 ORM 外键关联
     */
  }
}

/**
 * 模型初始化
 *
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {MaterialAssetType} 初始化后的模型
 */
module.exports = sequelize => {
  MaterialAssetType.init(
    {
      // 主键ID（Material Asset Type ID）
      material_asset_type_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '材料资产类型ID（主键）'
      },

      // 资产代码（Asset Code - 唯一标识）
      asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment:
          '资产代码（Asset Code - 唯一标识）：如 red_shard/red_crystal/orange_shard，必须唯一，与 account_asset_balances.asset_code 关联'
      },

      // 展示名称（Display Name - 用户可见名称）
      display_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '展示名称（Display Name - 用户可见名称）：如"红色碎片""红色水晶"'
      },

      // 分组代码（Group Code - 材料分组）
      group_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment:
          '分组代码（Group Code - 材料分组）：如 red/orange/yellow/green/blue/purple，用于材料逐级转换的层级归类'
      },

      // 形态（Form - 碎片/水晶）
      form: {
        type: DataTypes.ENUM('shard', 'crystal'),
        allowNull: false,
        comment: '形态（Form - 碎片/水晶）：shard-碎片（低级形态），crystal-水晶（高级形态）'
      },

      // 层级（Tier - 材料层级）
      tier: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment:
          '层级（Tier - 材料层级）：数字越大层级越高，如 1-碎片层级，2-水晶层级，用于转换规则校验'
      },

      // 排序权重（Sort Order - 展示排序）
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序权重（Sort Order - 展示排序）：数字越小越靠前，用于材料列表展示排序'
      },

      // 可见价值锚点（Visible Value Points - 展示口径）
      visible_value_points: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment:
          '可见价值锚点（Visible Value Points - 展示口径）：用户可见的材料价值锚点，如 1 red_shard = 10 visible_value_points，用于展示与比较，可选'
      },

      // 预算价值锚点（Budget Value Points - 系统口径）
      budget_value_points: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment:
          '预算价值锚点（Budget Value Points - 系统口径）：系统内部预算计算口径，用于成本核算与风控，可选'
      },

      // 是否启用（Is Enabled - 启用状态）
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment:
          '是否启用（Is Enabled - 启用状态）：true-启用（可展示可转换），false-禁用（不可展示不可转换）'
      },

      // 是否可交易（Is Tradable - C2C市场交易开关）
      is_tradable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment:
          '是否可交易（Is Tradable - C2C市场交易开关）：true-可在市场挂牌交易，false-禁止市场交易'
      }
    },
    {
      sequelize,
      modelName: 'MaterialAssetType',
      tableName: 'material_asset_types',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '材料资产类型表（Material Asset Types - 材料配置真相源）'
    }
  )

  return MaterialAssetType
}
