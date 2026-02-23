/**
 * 固定汇率兑换规则模型
 *
 * 业务场景：
 * - 平台设定的资产间固定汇率兑换配置
 * - 支持多币对、优先级、生效时间窗、每日限额
 * - 与材料转换（MaterialConversionRule）语义分离：材料转换是"合成"，汇率兑换是"货币兑换"
 *
 * 汇率计算公式：
 *   to_amount = FLOOR(from_amount × rate_numerator ÷ rate_denominator)
 *   使用整数分子/分母避免浮点精度问题
 *
 * 命名规范（snake_case）：
 * - 表名：exchange_rates
 * - 主键：exchange_rate_id
 *
 * 创建时间：2026-02-23
 */

'use strict'

const { Model, DataTypes, Op } = require('sequelize')

/**
 * 固定汇率兑换规则模型类
 * 职责：管理资产间的固定汇率兑换配置
 * 设计模式：配置表模式 + 时间窗模式 + 优先级模式
 */
class ExchangeRate extends Model {
  /**
   * 静态关联定义
   *
   * @param {Object} models - Sequelize所有模型的集合对象
   * @returns {void} 无返回值，仅定义关联关系
   */
  static associate(models) {
    ExchangeRate.belongsTo(models.MaterialAssetType, {
      foreignKey: 'from_asset_code',
      targetKey: 'asset_code',
      as: 'fromAsset',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
      comment: '关联源资产类型'
    })

    ExchangeRate.belongsTo(models.MaterialAssetType, {
      foreignKey: 'to_asset_code',
      targetKey: 'asset_code',
      as: 'toAsset',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
      comment: '关联目标资产类型'
    })

    ExchangeRate.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
      comment: '关联创建人（用于审计）'
    })
  }

  /**
   * 获取当前生效的汇率规则
   *
   * 查询逻辑：
   * 1. status = 'active'
   * 2. effective_from IS NULL OR effective_from <= NOW()
   * 3. effective_until IS NULL OR effective_until > NOW()
   * 4. ORDER BY priority DESC LIMIT 1（取优先级最高的）
   *
   * @param {string} from_asset_code - 源资产代码
   * @param {string} to_asset_code - 目标资产代码
   * @param {Object} options - Sequelize查询选项
   * @returns {Promise<ExchangeRate|null>} 生效的汇率规则或null
   */
  static async getEffectiveRate(from_asset_code, to_asset_code, options = {}) {
    const now = new Date()

    return await ExchangeRate.findOne({
      where: {
        from_asset_code,
        to_asset_code,
        status: 'active',
        [Op.and]: [
          {
            [Op.or]: [{ effective_from: null }, { effective_from: { [Op.lte]: now } }]
          },
          {
            [Op.or]: [{ effective_until: null }, { effective_until: { [Op.gt]: now } }]
          }
        ]
      },
      order: [['priority', 'DESC']],
      ...options
    })
  }

  /**
   * 获取所有活跃的汇率规则
   *
   * @param {Object} options - Sequelize查询选项
   * @returns {Promise<ExchangeRate[]>} 所有活跃的汇率规则列表
   */
  static async getAllActiveRates(options = {}) {
    const now = new Date()

    return await ExchangeRate.findAll({
      where: {
        status: 'active',
        [Op.and]: [
          {
            [Op.or]: [{ effective_from: null }, { effective_from: { [Op.lte]: now } }]
          },
          {
            [Op.or]: [{ effective_until: null }, { effective_until: { [Op.gt]: now } }]
          }
        ]
      },
      order: [
        ['from_asset_code', 'ASC'],
        ['priority', 'DESC']
      ],
      ...options
    })
  }

  /**
   * 计算兑换结果
   *
   * @param {number} from_amount - 源资产数量
   * @returns {Object} 兑换计算结果（gross_to_amount, fee_amount, net_to_amount）
   */
  calculateConversion(from_amount) {
    const gross = Math.floor((from_amount * this.rate_numerator) / this.rate_denominator)
    const feeRate = parseFloat(this.fee_rate) || 0
    const fee = Math.floor(gross * feeRate)
    return {
      gross_to_amount: gross,
      fee_amount: fee,
      net_to_amount: gross - fee
    }
  }
}

/**
 * 模型初始化
 *
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {ExchangeRate} 初始化后的模型
 */
module.exports = sequelize => {
  ExchangeRate.init(
    {
      exchange_rate_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '汇率规则ID（主键）'
      },

      from_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '源资产代码（兑换输入）：如 red_shard'
      },

      to_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '目标资产代码（兑换输出）：如 DIAMOND'
      },

      rate_numerator: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '汇率分子：to_amount = FLOOR(from_amount × numerator ÷ denominator)'
      },

      rate_denominator: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '汇率分母：使用整数避免浮点精度问题'
      },

      min_from_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 1,
        comment: '最小兑换数量'
      },

      max_from_amount: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: '最大兑换数量（NULL表示无上限）'
      },

      daily_user_limit: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: '每用户每日兑换限额（源资产数量，NULL表示无限制）'
      },

      daily_global_limit: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: '全局每日兑换限额（源资产数量，NULL表示无限制）'
      },

      fee_rate: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 0.0,
        comment: '手续费费率（如0.0500=5%）',
        /** @returns {number} 手续费费率浮点数 */
        get() {
          const value = this.getDataValue('fee_rate')
          return value ? parseFloat(value) : 0
        }
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
        comment: '优先级：同一币对取最高优先级的活跃规则'
      },

      effective_from: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        comment: '生效起始时间（NULL表示立即生效）'
      },

      effective_until: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        comment: '生效截止时间（NULL表示永不过期）'
      },

      description: {
        type: DataTypes.STRING(200),
        allowNull: true,
        defaultValue: null,
        comment: '规则描述（运营备注）'
      },

      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: '创建人 user_id'
      }
    },
    {
      sequelize,
      modelName: 'ExchangeRate',
      tableName: 'exchange_rates',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '固定汇率兑换规则表 — 平台设定的资产间兑换汇率配置'
    }
  )

  return ExchangeRate
}
