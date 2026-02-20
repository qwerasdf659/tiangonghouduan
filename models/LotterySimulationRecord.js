'use strict'

/**
 * LotterySimulationRecord 模型 - 策略效果模拟记录表
 *
 * 保存策略模拟分析页面的模拟参数、结果、对比和风险评估数据：
 * - proposed_config: 提议参数快照（tier_rules + matrix_config + strategy_config）
 * - scenario: 场景配置（budget/pressure/segment 分布）
 * - simulation_result: 模拟结果（档位分布、三维成本指标、体验机制指标）
 * - comparison: 与当前真实数据的对比 delta
 * - risk_assessment: 风险评估（红绿灯指标）
 * - actual_result + drift_metrics: 偏差追踪（模拟预测 vs 实际数据）
 *
 * 状态流转：draft → applied / archived
 *
 * @module models/LotterySimulationRecord
 * @see docs/策略效果模拟分析页面-设计方案.md Section 八
 * @since 2026-02-20
 */

const { Model } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = (sequelize, DataTypes) => {
  /**
   * 策略模拟记录模型 — 保存 Monte Carlo 模拟的参数快照和结果
   */
  class LotterySimulationRecord extends Model {
    /**
     * 定义模型关联关系
     *
     * @param {Object} models - 所有已加载的模型
     * @returns {void}
     */
    static associate(models) {
      /** 关联抽奖活动 */
      if (models.LotteryCampaign) {
        LotterySimulationRecord.belongsTo(models.LotteryCampaign, {
          as: 'campaign',
          foreignKey: 'lottery_campaign_id'
        })
      }

      /** 创建者 */
      if (models.User) {
        LotterySimulationRecord.belongsTo(models.User, {
          as: 'creator',
          foreignKey: 'created_by'
        })

        /** 应用操作者 */
        LotterySimulationRecord.belongsTo(models.User, {
          as: 'applier',
          foreignKey: 'applied_by'
        })
      }
    }

    /* ========== 静态查询方法 ========== */

    /**
     * 获取指定活动的模拟历史列表
     *
     * @param {number} lottery_campaign_id - 活动ID
     * @param {Object} options - 查询选项
     * @param {number} options.limit - 返回条数，默认20
     * @param {number} options.offset - 偏移量，默认0
     * @returns {Promise<Object>} 分页查询结果 { rows, count }
     */
    static async getHistoryByCampaign(lottery_campaign_id, options = {}) {
      const { limit = 20, offset = 0 } = options
      return this.findAndCountAll({
        where: { lottery_campaign_id },
        order: [['created_at', 'DESC']],
        limit,
        offset,
        attributes: [
          'lottery_simulation_record_id',
          'simulation_name',
          'simulation_count',
          'status',
          'created_by',
          'created_at',
          'applied_at',
          'drift_calculated_at'
        ]
      })
    }

    /* ========== 实例方法 ========== */

    /**
     * 标记为已应用到线上
     *
     * @param {number} applied_by_user_id - 执行应用的用户ID
     * @param {Object} options - 额外选项（如 transaction）
     * @returns {Promise<void>} 无返回值
     */
    async markAsApplied(applied_by_user_id, options = {}) {
      await this.update(
        {
          status: 'applied',
          applied_at: BeijingTimeHelper.createDatabaseTime(),
          applied_by: applied_by_user_id
        },
        options
      )
    }

    /**
     * 填充偏差追踪数据
     *
     * @param {Object} actual_result - 实际数据统计结果
     * @param {Object} drift_metrics - 各维度偏差百分比
     * @param {Object} options - 额外选项（如 transaction）
     * @returns {Promise<void>} 无返回值
     */
    async fillDriftData(actual_result, drift_metrics, options = {}) {
      await this.update(
        {
          actual_result,
          drift_metrics,
          drift_calculated_at: BeijingTimeHelper.createDatabaseTime()
        },
        options
      )
    }
  }

  /* ========== 模型初始化 ========== */

  LotterySimulationRecord.init(
    {
      lottery_simulation_record_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '模拟记录ID'
      },

      lottery_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '关联的抽奖活动ID',
        references: {
          model: 'lottery_campaigns',
          key: 'lottery_campaign_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      simulation_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '模拟名称（运营者自定义）'
      },

      simulation_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '模拟迭代次数（1000/5000/10000/50000）'
      },

      proposed_config: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '提议参数快照（tier_rules + matrix_config + strategy_config）'
      },

      scenario: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '场景配置（budget_distribution + pressure_distribution + segment_distribution）'
      },

      simulation_result: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '模拟结果（tier_distribution + cost_metrics + experience_metrics）'
      },

      comparison: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '对比分析（tier_delta + cost_delta）'
      },

      risk_assessment: {
        type: DataTypes.JSON,
        allowNull: true,
        comment:
          '风险评估（high_tier_risk + empty_rate_risk + budget_depletion_risk + prize_cost_rate_risk）'
      },

      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '创建者用户ID',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'draft',
        comment: '状态：draft=草稿 | applied=已应用到线上 | scheduled=待定时生效 | archived=已归档',
        validate: {
          isIn: [['draft', 'applied', 'scheduled', 'archived']]
        }
      },

      scheduled_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '计划生效时间（定时应用功能，Phase 7 运维闭环）'
      },

      applied_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '配置应用到线上的时间'
      },

      applied_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '执行应用操作的用户ID',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      actual_result: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '偏差追踪：实际数据统计结果'
      },

      drift_metrics: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '偏差追踪：各维度偏差百分比'
      },

      drift_calculated_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '偏差计算时间'
      }
    },
    {
      sequelize,
      modelName: 'LotterySimulationRecord',
      tableName: 'lottery_simulation_records',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '策略效果模拟记录表',
      indexes: [
        { fields: ['lottery_campaign_id'], name: 'idx_simulation_records_campaign' },
        { fields: ['created_by'], name: 'idx_simulation_records_creator' },
        { fields: ['status'], name: 'idx_simulation_records_status' },
        { fields: ['created_at'], name: 'idx_simulation_records_created' }
      ]
    }
  )

  return LotterySimulationRecord
}
