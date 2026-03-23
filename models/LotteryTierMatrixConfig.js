'use strict'

/**
 * LotteryTierMatrixConfig 模型 - Pressure-Only 矩阵配置表
 *
 * 存储 Pressure Tier 维度的乘数配置（budget_tier 固定为 'ALL'）：
 * - cap_multiplier: 预算上限乘数（控制单次抽奖最大消耗）
 * - empty_weight_multiplier: 空奖权重乘数（<1抑制空奖，>1增强空奖）
 * - high_multiplier: high 档位权重乘数
 * - mid_multiplier: mid 档位权重乘数
 * - low_multiplier: low 档位权重乘数
 * - fallback_multiplier: fallback 档位权重乘数
 *
 * 矩阵说明（Pressure-Only，3 种组合）：
 * +------+--------+--------+--------+
 * |      | P0     | P1     | P2     |
 * +------+--------+--------+--------+
 * | ALL  | 略提高 | 正常   | 压低高 |  <- 不区分 Budget Tier
 * +------+--------+--------+--------+
 *
 * 架构重构说明：
 * Budget Tier 降级为纯监控指标，不再参与概率决策。
 * 概率调整只保留 Pressure Tier 维度（活动消耗压力）。
 * 资格控制由 BuildPrizePoolStage._filterByResourceEligibility 唯一负责。
 *
 * @module models/LotteryTierMatrixConfig
 * @author 抽奖模块策略引擎
 * @since 2026
 */

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  /**
   * Pressure-Only 矩阵配置模型类
   *
   * @class LotteryTierMatrixConfig
   * @extends Model
   */
  class LotteryTierMatrixConfig extends Model {
    /**
     * 定义模型关联关系
     *
     * @param {Object} models - 所有已加载的模型
     * @returns {void}
     */
    static associate(models) {
      /** 关联抽奖活动（多活动策略隔离） */
      if (models.LotteryCampaign) {
        LotteryTierMatrixConfig.belongsTo(models.LotteryCampaign, {
          as: 'campaign',
          foreignKey: 'lottery_campaign_id'
        })
      }

      /** 创建人关联 */
      if (models.User) {
        LotteryTierMatrixConfig.belongsTo(models.User, {
          as: 'creator',
          foreignKey: 'created_by'
        })

        /** 更新人关联 */
        LotteryTierMatrixConfig.belongsTo(models.User, {
          as: 'updater',
          foreignKey: 'updated_by'
        })
      }
    }

    /* ========== 静态查询方法 ========== */

    /**
     * 获取完整的 Pressure-Only 矩阵配置
     *
     * 返回以 pressure_tier 为键的扁平结构（不再有 budget_tier 嵌套）。
     *
     * @param {number} [lottery_campaign_id] - 活动ID（可选）
     * @returns {Promise<Object>} 矩阵配置对象
     *
     * @example
     * const matrix = await LotteryTierMatrixConfig.getFullMatrix(1)
     * // 返回: {
     * //   P0: { cap_multiplier: 1.0, empty_weight_multiplier: 1.0, high_multiplier: 1.3, ... },
     * //   P1: { ... },
     * //   P2: { ... }
     * // }
     */
    static async getFullMatrix(lottery_campaign_id) {
      const where = { is_active: true, budget_tier: 'ALL' }
      if (lottery_campaign_id) {
        where.lottery_campaign_id = lottery_campaign_id
      }
      const configs = await this.findAll({
        where,
        order: [['pressure_tier', 'ASC']]
      })

      const matrix = {}

      for (const config of configs) {
        const pt = config.pressure_tier

        matrix[pt] = {
          cap_multiplier: parseFloat(config.cap_multiplier),
          empty_weight_multiplier: parseFloat(config.empty_weight_multiplier),
          high_multiplier: parseFloat(config.high_multiplier),
          mid_multiplier: parseFloat(config.mid_multiplier),
          low_multiplier: parseFloat(config.low_multiplier),
          fallback_multiplier: parseFloat(config.fallback_multiplier)
        }
      }

      return matrix
    }

    /**
     * 获取特定 Pressure Tier 的配置（budget_tier 固定 'ALL'）
     *
     * @param {string} pressure_tier - Pressure Tier（P0/P1/P2）
     * @returns {Promise<Object|null>} 配置对象或null
     *
     * @example
     * const config = await LotteryTierMatrixConfig.getMatrixValue('P1')
     * // 返回: { cap_multiplier: 1.0, empty_weight_multiplier: 1.0, high_multiplier: 1.0, ... }
     */
    static async getMatrixValue(pressure_tier) {
      const config = await this.findOne({
        where: {
          budget_tier: 'ALL',
          pressure_tier,
          is_active: true
        }
      })

      if (!config) {
        return null
      }

      return {
        cap_multiplier: parseFloat(config.cap_multiplier),
        empty_weight_multiplier: parseFloat(config.empty_weight_multiplier),
        high_multiplier: parseFloat(config.high_multiplier),
        mid_multiplier: parseFloat(config.mid_multiplier),
        low_multiplier: parseFloat(config.low_multiplier),
        fallback_multiplier: parseFloat(config.fallback_multiplier)
      }
    }

    /**
     * 批量更新矩阵配置（全部 6 个乘数字段）
     *
     * 入参格式为 Pressure-Only 结构：{ P0: {...}, P1: {...}, P2: {...} }
     * 每个 P 对象包含全部 6 字段：cap/empty/high/mid/low/fallback_multiplier
     *
     * @param {Object} matrix_data - 矩阵数据对象（以 pressure_tier 为键）
     * @param {number} updated_by - 更新人ID
     * @param {Object} options - 额外选项
     * @returns {Promise<number>} 更新的记录数
     *
     * @example
     * await LotteryTierMatrixConfig.updateMatrix({
     *   P1: {
     *     cap_multiplier: 1.0, empty_weight_multiplier: 1.0,
     *     high_multiplier: 1.0, mid_multiplier: 1.0,
     *     low_multiplier: 1.0, fallback_multiplier: 1.0
     *   }
     * }, admin_id)
     */
    static async updateMatrix(matrix_data, updated_by, options = {}) {
      const { transaction } = options

      const update_promises = []

      for (const [pressure_tier, values] of Object.entries(matrix_data)) {
        update_promises.push(
          this.update(
            {
              cap_multiplier: values.cap_multiplier,
              empty_weight_multiplier: values.empty_weight_multiplier,
              high_multiplier: values.high_multiplier,
              mid_multiplier: values.mid_multiplier,
              low_multiplier: values.low_multiplier,
              fallback_multiplier: values.fallback_multiplier,
              updated_by
            },
            {
              where: {
                budget_tier: 'ALL',
                pressure_tier
              },
              transaction
            }
          )
        )
      }

      const results = await Promise.all(update_promises)
      const updated_count = results.reduce((sum, [rows_affected]) => sum + rows_affected, 0)

      return updated_count
    }

    /* ========== 实例方法 ========== */

    /**
     * 获取格式化的配置对象
     *
     * @returns {Object} 格式化的配置
     */
    getFormattedConfig() {
      return {
        lottery_tier_matrix_config_id: this.lottery_tier_matrix_config_id,
        budget_tier: this.budget_tier,
        pressure_tier: this.pressure_tier,
        cap_multiplier: parseFloat(this.cap_multiplier),
        empty_weight_multiplier: parseFloat(this.empty_weight_multiplier),
        high_multiplier: parseFloat(this.high_multiplier),
        mid_multiplier: parseFloat(this.mid_multiplier),
        low_multiplier: parseFloat(this.low_multiplier),
        fallback_multiplier: parseFloat(this.fallback_multiplier),
        is_active: this.is_active,
        description: this.description
      }
    }

    /**
     * 检查是否为强制空奖配置（cap_multiplier = 0）
     *
     * @returns {boolean} 是否强制空奖
     */
    isForcedEmpty() {
      return parseFloat(this.cap_multiplier) === 0
    }

    /**
     * 检查是否抑制空奖（empty_weight_multiplier < 1）
     *
     * @returns {boolean} 是否抑制空奖
     */
    isEmptySuppressed() {
      return parseFloat(this.empty_weight_multiplier) < 1
    }
  }

  /* ========== 模型初始化 ========== */

  LotteryTierMatrixConfig.init(
    {
      /** 矩阵配置ID（自增主键） */
      lottery_tier_matrix_config_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '矩阵配置ID'
      },

      /** 关联的抽奖活动ID（支持多活动策略隔离） */
      lottery_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '关联的抽奖活动ID（支持多活动策略隔离）',
        references: {
          model: 'lottery_campaigns',
          key: 'lottery_campaign_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      /**
       * Budget Tier 预算层级（Pressure-Only 模式下固定为 'ALL'）
       *
       * 2026-03-04 架构重构：budget_tier 降级为纯监控指标，
       * 新数据固定 'ALL'，保留旧 ENUM 值用于迁移回滚兼容。
       */
      budget_tier: {
        type: DataTypes.ENUM('B0', 'B1', 'B2', 'B3', 'ALL'),
        allowNull: false,
        defaultValue: 'ALL',
        comment: 'Budget Tier 预算层级（Pressure-Only 模式固定 ALL）'
      },

      /**
       * Pressure Tier 活动压力层级
       * - P0: 低压（消耗慢，可以宽松）
       * - P1: 中压（正常）
       * - P2: 高压（消耗快，需要收紧）
       */
      pressure_tier: {
        type: DataTypes.ENUM('P0', 'P1', 'P2'),
        allowNull: false,
        comment: 'Pressure Tier 活动压力层级'
      },

      /**
       * 预算上限乘数
       * - 0: 强制空奖
       * - 1.0: 正常（可用全部 EffectiveBudget）
       * - < 1.0: 收紧（限制最大消耗）
       */
      cap_multiplier: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 1.0,
        comment: '预算上限乘数（0=强制空奖）',
        /** @returns {number} 预算上限乘数 */
        get() {
          const value = this.getDataValue('cap_multiplier')
          return value ? parseFloat(value) : 1.0
        }
      },

      /**
       * 空奖权重乘数
       * - < 1.0: 抑制空奖（提升用户体验）
       * - = 1.0: 正常
       * - > 1.0: 增强空奖（控制成本）
       */
      empty_weight_multiplier: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 1.0,
        comment: '空奖权重乘数',
        /** @returns {number} 空奖权重乘数 */
        get() {
          const value = this.getDataValue('empty_weight_multiplier')
          return value ? parseFloat(value) : 1.0
        }
      },

      /**
       * high 档位权重乘数
       * - 0: 不允许该档位
       * - 1.0: 保持原权重
       * - > 1.0: 提高该档位概率
       */
      high_multiplier: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'high档位权重乘数',
        /** @returns {number} high 档位权重乘数 */
        get() {
          const value = this.getDataValue('high_multiplier')
          return value ? parseFloat(value) : 0.0
        }
      },

      /** mid 档位权重乘数 */
      mid_multiplier: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'mid档位权重乘数',
        /** @returns {number} mid 档位权重乘数 */
        get() {
          const value = this.getDataValue('mid_multiplier')
          return value ? parseFloat(value) : 0.0
        }
      },

      /** low 档位权重乘数 */
      low_multiplier: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'low档位权重乘数',
        /** @returns {number} low 档位权重乘数 */
        get() {
          const value = this.getDataValue('low_multiplier')
          return value ? parseFloat(value) : 0.0
        }
      },

      /** fallback 档位权重乘数 */
      fallback_multiplier: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 1.0,
        comment: 'fallback档位权重乘数',
        /** @returns {number} fallback 档位权重乘数 */
        get() {
          const value = this.getDataValue('fallback_multiplier')
          return value ? parseFloat(value) : 1.0
        }
      },

      /** 配置描述 */
      description: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '配置描述'
      },

      /** 是否启用 */
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用'
      },

      /** 创建人ID */
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '创建人ID'
      },

      /** 更新人ID */
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '更新人ID'
      }
    },
    {
      sequelize,
      modelName: 'LotteryTierMatrixConfig',
      tableName: 'lottery_tier_matrix_config',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: 'Pressure-Only 矩阵配置表',
      indexes: [
        {
          unique: true,
          fields: ['lottery_campaign_id', 'budget_tier', 'pressure_tier'],
          name: 'uk_matrix_campaign_budget_pressure'
        },
        {
          fields: ['lottery_campaign_id'],
          name: 'idx_matrix_config_campaign'
        }
      ]
    }
  )

  return LotteryTierMatrixConfig
}
