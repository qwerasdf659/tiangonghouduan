/**
 * 统一资产转换规则模型 — AssetConversionRule
 *
 * 合并原 ExchangeRate（汇率兑换）和 MaterialConversionRule（材料转换）
 * 为统一的资产转换规则配置表。
 *
 * 业务场景：
 * - 所有资产间的转换规则配置（碎片→星石、碎片→碎片等）
 * - 支持比率转换、手续费、限额、时间窗、优先级
 * - 规则版本化管理（通过 effective_from/effective_until 控制）
 *
 * 转换公式：
 *   gross = FLOOR(from_amount × rate_numerator ÷ rate_denominator)  // rounding_mode 可选
 *   fee = MAX(FLOOR(gross × fee_rate), fee_min_amount)
 *   net = gross - fee
 *
 * 命名规范（snake_case）：
 * - 表名：asset_conversion_rules
 * - 主键：conversion_rule_id
 *
 * @module models/AssetConversionRule
 * @version 1.0.0
 * @date 2026-04-05
 */

'use strict'

const { Model, DataTypes: _DataTypes, Op } = require('sequelize')

/**
 * 统一资产转换规则模型类
 * 职责：管理所有资产间的转换规则配置
 * 设计模式：配置表模式 + 时间窗模式 + 优先级模式
 */
class AssetConversionRule extends Model {
  /**
   * 静态关联定义
   *
   * @param {Object} models - Sequelize所有模型的集合对象
   * @returns {void}
   */
  static associate(models) {
    /* 源资产类型关联 */
    AssetConversionRule.belongsTo(models.MaterialAssetType, {
      foreignKey: 'from_asset_code',
      targetKey: 'asset_code',
      as: 'fromAssetType',
      constraints: false
    })

    /* 目标资产类型关联 */
    AssetConversionRule.belongsTo(models.MaterialAssetType, {
      foreignKey: 'to_asset_code',
      targetKey: 'asset_code',
      as: 'toAssetType',
      constraints: false
    })
  }

  /**
   * 计算转换结果（实例方法）
   *
   * @param {number} fromAmount - 源资产数量
   * @returns {{ gross: number, fee: number, net: number }} 转换结果
   *   - gross: 转换产出总量（未扣手续费）
   *   - fee: 手续费数量
   *   - net: 实际到账数量（gross - fee）
   */
  calculateConversion(fromAmount) {
    const numerator = Number(this.rate_numerator)
    const denominator = Number(this.rate_denominator)
    const feeRate = Number(this.fee_rate) || 0
    const feeMin = Number(this.fee_min_amount) || 0

    /* 根据舍入模式计算产出总量 */
    const rawResult = (fromAmount * numerator) / denominator
    let gross
    switch (this.rounding_mode) {
      case 'ceil':
        gross = Math.ceil(rawResult)
        break
      case 'round':
        gross = Math.round(rawResult)
        break
      case 'floor':
      default:
        gross = Math.floor(rawResult)
        break
    }

    /* 计算手续费：取 fee_rate 计算值和 fee_min_amount 的较大值 */
    const feeByRate = Math.floor(gross * feeRate)
    const fee = Math.max(feeByRate, feeMin)

    /* 实际到账 = 产出 - 手续费 */
    const net = gross - fee

    return { gross, fee, net }
  }

  /**
   * 查询特定币对当前生效的规则（静态方法）
   *
   * 查询逻辑：
   * 1. from_asset_code + to_asset_code 匹配
   * 2. status = 'active'
   * 3. 当前时间在 effective_from ~ effective_until 窗口内
   * 4. 按 priority DESC 取最高优先级
   *
   * @param {string} fromAssetCode - 源资产代码
   * @param {string} toAssetCode - 目标资产代码
   * @param {Object} [options={}] - 查询选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<AssetConversionRule|null>} 生效的规则实例，无匹配返回 null
   */
  static async getEffectiveRule(fromAssetCode, toAssetCode, options = {}) {
    const now = new Date()

    const rule = await AssetConversionRule.findOne({
      where: {
        from_asset_code: fromAssetCode,
        to_asset_code: toAssetCode,
        status: 'active',
        [Op.and]: [
          {
            [Op.or]: [{ effective_from: null }, { effective_from: { [Op.lte]: now } }]
          },
          {
            [Op.or]: [{ effective_until: null }, { effective_until: { [Op.gte]: now } }]
          }
        ]
      },
      order: [
        ['priority', 'DESC'],
        ['conversion_rule_id', 'DESC']
      ],
      transaction: options.transaction || undefined
    })

    return rule
  }

  /**
   * 查询所有可用的转换规则（用户端列表）
   *
   * 返回结果包含 fromAssetType / toAssetType 关联，
   * 前端可通过 form 字段组合推导 conversion_type（分解/合成/兑换）
   *
   * @param {Object} [options={}] - 查询选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<AssetConversionRule[]>} 可用规则列表（含关联）
   */
  static async getAvailableRules(options = {}) {
    const now = new Date()
    const { sequelize } = AssetConversionRule

    return AssetConversionRule.findAll({
      where: {
        status: 'active',
        is_visible: true,
        [Op.and]: [
          {
            [Op.or]: [{ effective_from: null }, { effective_from: { [Op.lte]: now } }]
          },
          {
            [Op.or]: [{ effective_until: null }, { effective_until: { [Op.gte]: now } }]
          }
        ]
      },
      include: [
        {
          model: sequelize.models.MaterialAssetType,
          as: 'fromAssetType',
          attributes: ['asset_code', 'display_name', 'form', 'tier', 'group_code'],
          required: false
        },
        {
          model: sequelize.models.MaterialAssetType,
          as: 'toAssetType',
          attributes: ['asset_code', 'display_name', 'form', 'tier', 'group_code'],
          required: false
        }
      ],
      order: [
        ['from_asset_code', 'ASC'],
        ['to_asset_code', 'ASC'],
        ['priority', 'DESC']
      ],
      transaction: options.transaction || undefined
    })
  }
}

module.exports = (sequelize, DataTypes) => {
  AssetConversionRule.init(
    {
      conversion_rule_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '转换规则ID（主键）'
      },
      from_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '源资产代码（转换输入）：如 red_core_shard'
      },
      to_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '目标资产代码（转换输出）：如 star_stone'
      },
      rate_numerator: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '转换比率分子'
      },
      rate_denominator: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '转换比率分母'
      },
      rounding_mode: {
        type: DataTypes.ENUM('floor', 'ceil', 'round'),
        allowNull: false,
        defaultValue: 'floor',
        comment: '舍入模式：floor-向下取整 / ceil-向上取整 / round-四舍五入'
      },
      fee_rate: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: '0.0000',
        comment: '手续费费率（如 0.0500 = 5%）'
      },
      fee_min_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: '最低手续费（保底值）'
      },
      fee_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '手续费资产代码（NULL 表示从产出资产扣除）'
      },
      min_from_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 1,
        comment: '最小转换数量'
      },
      max_from_amount: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '最大转换数量（NULL表示无上限）'
      },
      daily_user_limit: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '每用户每日转换限额（源资产数量）'
      },
      daily_global_limit: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '全局每日转换限额（源资产数量）'
      },
      status: {
        type: DataTypes.ENUM('active', 'paused', 'disabled'),
        allowNull: false,
        defaultValue: 'active',
        comment: '状态：active-生效中 / paused-暂停 / disabled-已禁用'
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '优先级（同一币对多条规则时取最高）'
      },
      effective_from: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效开始时间（NULL表示立即生效）'
      },
      effective_until: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效结束时间（NULL表示永不过期）'
      },
      title: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '规则标题（管理后台展示用）'
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '规则描述（运营备注）'
      },
      display_icon: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '展示图标URL'
      },
      risk_level: {
        type: DataTypes.ENUM('low', 'medium', 'high'),
        allowNull: false,
        defaultValue: 'low',
        comment: '风控等级'
      },
      is_visible: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否对用户可见'
      },
      display_category: {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: null,
        comment: '展示分类（运营覆盖）：compose/decompose/exchange，NULL=自动推导'
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '创建人用户ID'
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '最后修改人用户ID'
      }
    },
    {
      sequelize,
      modelName: 'AssetConversionRule',
      tableName: 'asset_conversion_rules',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '统一资产转换规则表 — 合并汇率兑换与材料转换'
    }
  )

  return AssetConversionRule
}
