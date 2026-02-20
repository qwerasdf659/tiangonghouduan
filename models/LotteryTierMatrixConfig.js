'use strict'

/**
 * LotteryTierMatrixConfig 模型 - BxPx矩阵配置表
 *
 * 存储 Budget Tier × Pressure Tier 组合的乘数配置：
 * - cap_multiplier: 预算上限乘数（控制单次抽奖最大消耗）
 * - empty_weight_multiplier: 空奖权重乘数（<1抑制空奖，>1增强空奖）
 *
 * 矩阵说明（12种组合）：
 * +------+------+------+------+
 * |      | P0   | P1   | P2   |
 * +------+------+------+------+
 * | B0   | 全空 | 全空 | 全空 |  <- 预算不足，强制空奖
 * | B1   | 略增 | 正常 | 抑制 |  <- 低预算档位
 * | B2   | 正常 | 略抑 | 抑制 |  <- 中预算档位
 * | B3   | 抑制 | 显抑 | 强抑 |  <- 高预算档位
 * +------+------+------+------+
 *
 * 使用场景：
 * - 根据用户预算和活动压力动态调整奖品分布
 * - 运营人员可通过后台调整矩阵参数
 * - 支持 A/B 测试不同的策略配置
 *
 * @module models/LotteryTierMatrixConfig
 * @author 抽奖模块策略引擎
 * @since 2026-01-20
 */

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  /**
   * BxPx矩阵配置模型类
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
      // 创建人关联
      if (models.User) {
        LotteryTierMatrixConfig.belongsTo(models.User, {
          as: 'creator',
          foreignKey: 'created_by'
        })

        // 更新人关联
        LotteryTierMatrixConfig.belongsTo(models.User, {
          as: 'updater',
          foreignKey: 'updated_by'
        })
      }
    }

    /* ========== 静态查询方法 ========== */

    /**
     * 获取完整的矩阵配置
     *
     * @returns {Promise<Object>} 矩阵配置对象
     *
     * @example
     * const matrix = await LotteryTierMatrixConfig.getFullMatrix()
     * // 返回: {
     * //   B0: { P0: { cap: 0, empty: 10.0 }, P1: {...}, P2: {...} },
     * //   B1: { P0: {...}, P1: {...}, P2: {...} },
     * //   B2: { P0: {...}, P1: {...}, P2: {...} },
     * //   B3: { P0: {...}, P1: {...}, P2: {...} }
     * // }
     */
    static async getFullMatrix() {
      const configs = await this.findAll({
        where: { is_active: true },
        order: [
          ['budget_tier', 'ASC'],
          ['pressure_tier', 'ASC']
        ]
      })

      const matrix = {}

      for (const config of configs) {
        const bt = config.budget_tier
        const pt = config.pressure_tier

        if (!matrix[bt]) {
          matrix[bt] = {}
        }

        matrix[bt][pt] = {
          cap_multiplier: parseFloat(config.cap_multiplier),
          empty_weight_multiplier: parseFloat(config.empty_weight_multiplier),
          // 新增档位权重字段（P0修复 - 2026-01-30）
          high_multiplier: parseFloat(config.high_multiplier),
          mid_multiplier: parseFloat(config.mid_multiplier),
          low_multiplier: parseFloat(config.low_multiplier),
          fallback_multiplier: parseFloat(config.fallback_multiplier)
        }
      }

      return matrix
    }

    /**
     * 获取特定组合的配置
     *
     * @param {string} budget_tier - Budget Tier（B0/B1/B2/B3）
     * @param {string} pressure_tier - Pressure Tier（P0/P1/P2）
     * @returns {Promise<Object|null>} 配置对象或null
     *
     * @example
     * const config = await LotteryTierMatrixConfig.getMatrixValue('B2', 'P1')
     * // 返回: { cap_multiplier: 1.0, empty_weight_multiplier: 0.9 }
     */
    static async getMatrixValue(budget_tier, pressure_tier) {
      const config = await this.findOne({
        where: {
          budget_tier,
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
        // 新增档位权重字段（P0修复 - 2026-01-30）
        high_multiplier: parseFloat(config.high_multiplier),
        mid_multiplier: parseFloat(config.mid_multiplier),
        low_multiplier: parseFloat(config.low_multiplier),
        fallback_multiplier: parseFloat(config.fallback_multiplier)
      }
    }

    /**
     * 批量更新矩阵配置
     *
     * @param {Object} matrix_data - 矩阵数据对象
     * @param {number} updated_by - 更新人ID
     * @param {Object} options - 额外选项
     * @returns {Promise<number>} 更新的记录数
     *
     * @example
     * await LotteryTierMatrixConfig.updateMatrix({
     *   B2: {
     *     P1: { cap_multiplier: 1.0, empty_weight_multiplier: 0.85 }
     *   }
     * }, admin_id)
     */
    static async updateMatrix(matrix_data, updated_by, options = {}) {
      const { transaction } = options

      // 构建所有更新操作的 Promise 数组（避免 await-in-loop 警告）
      const update_promises = []

      for (const [budget_tier, pressure_configs] of Object.entries(matrix_data)) {
        for (const [pressure_tier, values] of Object.entries(pressure_configs)) {
          // 将每个更新操作添加到 Promise 数组
          update_promises.push(
            this.update(
              {
                cap_multiplier: values.cap_multiplier,
                empty_weight_multiplier: values.empty_weight_multiplier,
                updated_by
              },
              {
                where: {
                  budget_tier,
                  pressure_tier
                },
                transaction
              }
            )
          )
        }
      }

      // 并行执行所有更新操作
      const results = await Promise.all(update_promises)

      // 计算总更新数量（每个 result 是 [rows_affected] 数组）
      const updated_count = results.reduce((sum, [rows_affected]) => sum + rows_affected, 0)

      return updated_count
    }

    /**
     * 获取指定 Budget Tier 的所有配置
     *
     * @param {string} budget_tier - Budget Tier（B0/B1/B2/B3）
     * @returns {Promise<Object>} 该 Budget Tier 的所有 Pressure Tier 配置
     */
    static async getConfigsByBudgetTier(budget_tier) {
      const configs = await this.findAll({
        where: {
          budget_tier,
          is_active: true
        },
        order: [['pressure_tier', 'ASC']]
      })

      const result = {}
      for (const config of configs) {
        result[config.pressure_tier] = {
          cap_multiplier: parseFloat(config.cap_multiplier),
          empty_weight_multiplier: parseFloat(config.empty_weight_multiplier),
          // 新增档位权重字段（P0修复 - 2026-01-30）
          high_multiplier: parseFloat(config.high_multiplier),
          mid_multiplier: parseFloat(config.mid_multiplier),
          low_multiplier: parseFloat(config.low_multiplier),
          fallback_multiplier: parseFloat(config.fallback_multiplier)
        }
      }

      return result
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
      /**
       * 矩阵配置ID（自增主键）
       */
      lottery_tier_matrix_config_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '矩阵配置ID'
      },

      /**
       * Budget Tier 预算层级
       * - B0: 预算极低（仅 fallback）
       * - B1: 预算低（low + fallback）
       * - B2: 预算中（mid + low + fallback）
       * - B3: 预算高（all tiers）
       */
      budget_tier: {
        type: DataTypes.ENUM('B0', 'B1', 'B2', 'B3'),
        allowNull: false,
        comment: 'Budget Tier 预算层级'
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
       * - 0: 强制空奖（用于 B0 场景）
       * - 1.0: 正常（可用全部 EffectiveBudget）
       * - < 1.0: 收紧（限制最大消耗）
       */
      cap_multiplier: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 1.0,
        comment: '预算上限乘数（0=强制空奖）',
        /**
         * 获取预算上限乘数，将DECIMAL转换为浮点数
         * @returns {number} 预算上限乘数
         */
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
        /**
         * 获取空奖权重乘数，将DECIMAL转换为浮点数
         * @returns {number} 空奖权重乘数
         */
        get() {
          const value = this.getDataValue('empty_weight_multiplier')
          return value ? parseFloat(value) : 1.0
        }
      },

      /**
       * high档位权重乘数（P0修复新增 - 2026-01-30）
       * 用于 TierMatrixCalculator 计算档位概率调整
       * - 0: 不允许该档位
       * - 1.0: 保持原权重
       * - > 1.0: 提高该档位概率
       */
      high_multiplier: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'high档位权重乘数',
        /**
         * 获取high档位权重乘数，将DECIMAL转换为浮点数
         * @returns {number} high档位权重乘数
         */
        get() {
          const value = this.getDataValue('high_multiplier')
          return value ? parseFloat(value) : 0.0
        }
      },

      /**
       * mid档位权重乘数（P0修复新增 - 2026-01-30）
       */
      mid_multiplier: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'mid档位权重乘数',
        /**
         * 获取mid档位权重乘数，将DECIMAL转换为浮点数
         * @returns {number} mid档位权重乘数
         */
        get() {
          const value = this.getDataValue('mid_multiplier')
          return value ? parseFloat(value) : 0.0
        }
      },

      /**
       * low档位权重乘数（P0修复新增 - 2026-01-30）
       */
      low_multiplier: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: 'low档位权重乘数',
        /**
         * 获取low档位权重乘数，将DECIMAL转换为浮点数
         * @returns {number} low档位权重乘数
         */
        get() {
          const value = this.getDataValue('low_multiplier')
          return value ? parseFloat(value) : 0.0
        }
      },

      /**
       * fallback档位权重乘数（P0修复新增 - 2026-01-30）
       */
      fallback_multiplier: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 1.0,
        comment: 'fallback档位权重乘数',
        /**
         * 获取fallback档位权重乘数，将DECIMAL转换为浮点数
         * @returns {number} fallback档位权重乘数
         */
        get() {
          const value = this.getDataValue('fallback_multiplier')
          return value ? parseFloat(value) : 1.0
        }
      },

      /**
       * 配置描述
       */
      description: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '配置描述'
      },

      /**
       * 是否启用
       */
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用'
      },

      /**
       * 创建人ID
       */
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '创建人ID'
      },

      /**
       * 更新人ID
       */
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
      comment: 'BxPx矩阵配置表',
      indexes: [
        {
          unique: true,
          fields: ['budget_tier', 'pressure_tier'],
          name: 'uk_tier_matrix_budget_pressure'
        }
      ]
    }
  )

  return LotteryTierMatrixConfig
}
