/**
 * 材料转换规则模型
 *
 * Phase 2 - P1-2：材料转换规则配置表模型
 *
 * 业务场景：
 * - 材料合成/分解/逐级转换规则配置
 * - 材料→DIAMOND 显式分解规则（固定比例 1 red_shard = 20 DIAMOND）
 * - 规则版本化管理（effective_at 生效时间）
 *
 * 硬约束（来自文档）：
 * - **版本化强约束**：改比例/费率必须新增规则（禁止 UPDATE 覆盖历史）
 * - 通过 effective_at 生效时间控制规则切换
 * - 历史流水可通过 effective_at 回放计算依据，确保可审计/可解释
 * - **风控校验（保存/启用时触发）**：
 *   - 循环拦截：不得出现 A→B→...→A 的闭环路径
 *   - 套利拦截：不得出现"沿环路换一圈资产数量不减反增"（负环检测）
 *
 * 命名规范（snake_case）：
 * - 表名：material_conversion_rules
 * - 主键：rule_id
 *
 * 创建时间：2025-12-15
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 材料转换规则模型类
 * 职责：材料转换规则配置管理
 * 设计模式：配置表模式 + 版本化模式
 */
class MaterialConversionRule extends Model {
  /**
   * 静态关联定义
   *
   * @param {Object} models - Sequelize所有模型的集合对象
   * @returns {void} 无返回值，仅定义关联关系
   */
  static associate(models) {
    // 材料转换规则与创建人的关联（可选）
    MaterialConversionRule.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
      comment: '关联创建人（用于审计）'
    })

    // 🔴 P1-1 新增：关联源材料类型（用于按 group_code 过滤规则）
    MaterialConversionRule.belongsTo(models.MaterialAssetType, {
      foreignKey: 'from_asset_code',
      targetKey: 'asset_code',
      as: 'fromMaterial',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
      comment: '关联源材料类型（用于按 group_code 过滤规则）'
    })

    // 🔴 P1-1 新增：关联目标材料类型（用于按 group_code 过滤规则）
    MaterialConversionRule.belongsTo(models.MaterialAssetType, {
      foreignKey: 'to_asset_code',
      targetKey: 'asset_code',
      as: 'toMaterial',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
      comment: '关联目标材料类型（用于按 group_code 过滤规则）'
    })
  }

  /**
   * 获取当前生效的转换规则
   *
   * @param {string} from_asset_code - 源资产代码
   * @param {string} to_asset_code - 目标资产代码
   * @param {Date} asOf - 查询时间点（默认为当前时间）
   * @param {Object} options - Sequelize查询选项
   * @returns {Promise<MaterialConversionRule|null>} 生效的转换规则或null
   */
  static async getEffectiveRule(from_asset_code, to_asset_code, asOf = new Date(), options = {}) {
    return await MaterialConversionRule.findOne({
      where: {
        from_asset_code,
        to_asset_code,
        is_enabled: true,
        effective_at: {
          [require('sequelize').Op.lte]: asOf
        }
      },
      order: [['effective_at', 'DESC']],
      limit: 1,
      ...options
    })
  }
}

/**
 * 模型初始化
 *
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {MaterialConversionRule} 初始化后的模型
 */
module.exports = sequelize => {
  MaterialConversionRule.init(
    {
      // 主键ID（Conversion Rule ID）
      rule_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '转换规则ID（主键）'
      },

      // 源资产代码（From Asset Code - 转换源）
      from_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '源资产代码（From Asset Code - 转换源）：如 red_shard，表示从哪种资产转换出去'
      },

      // 目标资产代码（To Asset Code - 转换目标）
      to_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment:
          '目标资产代码（To Asset Code - 转换目标）：如 DIAMOND/red_crystal，表示转换成哪种资产'
      },

      // 源资产数量（From Amount - 转换输入数量）
      from_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment:
          '源资产数量（From Amount - 转换输入数量）：如 1，表示消耗 1 个源资产（如 1 red_shard）'
      },

      // 目标资产数量（To Amount - 转换输出数量）
      to_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment:
          '目标资产数量（To Amount - 转换输出数量）：如 20，表示获得 20 个目标资产（如 20 DIAMOND），比例 = to_amount / from_amount'
      },

      // 生效时间（Effective At - 版本化关键字段）
      effective_at: {
        type: DataTypes.DATE,
        allowNull: false,
        comment:
          '生效时间（Effective At - 版本化关键字段）：规则从此时间开始生效，查询时取当前时间前的最新已启用规则（WHERE effective_at <= NOW() AND is_enabled=true ORDER BY effective_at DESC LIMIT 1），确保历史流水可回放'
      },

      // 是否启用（Is Enabled - 启用状态）
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment:
          '是否启用（Is Enabled - 启用状态）：true-启用（规则生效），false-禁用（规则不生效）'
      },

      // 创建人（Created By - 操作记录）
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '创建人（Created By - 操作记录）：记录规则创建者的 user_id，用于审计'
      }
    },
    {
      sequelize,
      modelName: 'MaterialConversionRule',
      tableName: 'material_conversion_rules',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '材料转换规则表（Material Conversion Rules - 材料转换规则配置真相源）'
    }
  )

  return MaterialConversionRule
}
