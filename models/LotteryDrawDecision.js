/**
 * 📋 抽奖决策快照模型 - 统一抽奖架构核心组件
 * 创建时间：2026年01月18日 北京时间
 *
 * 业务职责：
 * - 记录每次抽奖的完整决策路径
 * - 提供审计和问题排查能力
 * - 支持决策过程的可追溯性
 *
 * 设计原则：
 * - 一次抽奖一条记录（1:1 with lottery_draws）
 * - 完整记录决策上下文
 * - 支持多种Pipeline类型
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 抽奖决策快照模型
 * 业务场景：审计、问题排查、决策复现
 */
class LotteryDrawDecision extends Model {
  /**
   * 模型关联定义
   * @param {Object} models - 所有模型的引用
   * @returns {void}
   */
  static associate(models) {
    // 一对一：决策快照属于某次抽奖
    LotteryDrawDecision.belongsTo(models.LotteryDraw, {
      foreignKey: 'draw_id',
      targetKey: 'draw_id',
      as: 'draw',
      onDelete: 'CASCADE',
      comment: '关联的抽奖记录'
    })

    // 多对一：关联的预设（如果是预设发放）
    LotteryDrawDecision.belongsTo(models.LotteryPreset, {
      foreignKey: 'preset_id',
      targetKey: 'preset_id',
      as: 'preset',
      onDelete: 'SET NULL',
      comment: '使用的预设（如果是预设发放）'
    })
  }

  /**
   * 获取Pipeline类型显示名称
   * @returns {string} Pipeline类型中文名称
   */
  getPipelineTypeName() {
    const typeNames = {
      normal: '普通抽奖',
      preset: '预设发放',
      override: '管理覆盖'
    }
    return typeNames[this.pipeline_type] || '未知类型'
  }

  /**
   * 获取档位显示名称
   * @returns {string} 档位中文名称
   */
  getTierDisplayName() {
    const tierNames = {
      high: '高档位',
      mid: '中档位',
      low: '低档位',
      fallback: '保底档位'
    }
    return tierNames[this.selected_tier] || '未选择档位'
  }

  /**
   * 获取保底类型显示名称
   * @returns {string} 保底类型中文名称
   */
  getGuaranteeTypeName() {
    const typeNames = {
      consecutive: '连续失败保底',
      probability: '概率保底',
      none: '未触发'
    }
    return typeNames[this.guarantee_type] || '未知类型'
  }

  /**
   * 获取预算提供者类型显示名称
   * @returns {string} 预算提供者类型中文名称
   */
  getBudgetProviderTypeName() {
    const typeNames = {
      user: '用户预算',
      pool: '活动池预算',
      pool_quota: '池+配额',
      none: '无预算限制'
    }
    return typeNames[this.budget_provider_type] || '未知类型'
  }

  /**
   * 检查是否触发了任何系统垫付
   * @returns {boolean} 是否触发垫付
   */
  hasSystemAdvance() {
    return (
      this.system_advance_triggered ||
      this.inventory_debt_created > 0 ||
      this.budget_debt_created > 0
    )
  }

  /**
   * 获取决策摘要
   * @returns {Object} 决策摘要对象
   */
  toSummary() {
    return {
      decision_id: this.decision_id,
      draw_id: this.draw_id,
      pipeline_type: this.pipeline_type,
      pipeline_type_name: this.getPipelineTypeName(),
      segment_key: this.segment_key,
      selected_tier: this.selected_tier,
      tier_name: this.getTierDisplayName(),
      tier_downgrade_triggered: this.tier_downgrade_triggered,
      budget_provider_type: this.budget_provider_type,
      budget_provider_name: this.getBudgetProviderTypeName(),
      budget_deducted: this.budget_deducted,
      preset_used: this.preset_used,
      system_advance: this.hasSystemAdvance(),
      guarantee_triggered: this.guarantee_triggered,
      guarantee_type: this.guarantee_type_name,
      processing_time_ms: this.processing_time_ms,
      decision_at: this.decision_at
    }
  }

  /**
   * 查询需要审计关注的决策记录
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 需要关注的决策记录列表
   */
  static async findAuditConcerns(options = {}) {
    const { transaction, limit = 100 } = options
    const { Op } = require('sequelize')

    return this.findAll({
      where: {
        [Op.or]: [
          { system_advance_triggered: true },
          { tier_downgrade_triggered: true },
          { guarantee_triggered: true },
          { inventory_debt_created: { [Op.gt]: 0 } },
          { budget_debt_created: { [Op.gt]: 0 } }
        ]
      },
      order: [['decision_at', 'DESC']],
      limit,
      transaction
    })
  }

  /**
   * 按Pipeline类型统计决策记录
   * @param {Date} startDate - 开始日期
   * @param {Date} endDate - 结束日期
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 统计结果
   */
  static async getStatsByPipelineType(startDate, endDate, options = {}) {
    const { transaction } = options
    const { Op, fn, col } = require('sequelize')

    return this.findAll({
      attributes: [
        'pipeline_type',
        [fn('COUNT', col('decision_id')), 'count'],
        [fn('SUM', col('budget_deducted')), 'total_budget_deducted'],
        [fn('AVG', col('processing_time_ms')), 'avg_processing_time_ms']
      ],
      where: {
        decision_at: {
          [Op.between]: [startDate, endDate]
        }
      },
      group: ['pipeline_type'],
      transaction
    })
  }
}

/**
 * 模型初始化
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {LotteryDrawDecision} 初始化后的模型
 */
module.exports = sequelize => {
  LotteryDrawDecision.init(
    {
      /**
       * 决策ID - 主键
       */
      decision_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '决策记录主键ID'
      },

      /**
       * 关联的抽奖记录ID
       */
      draw_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '关联的抽奖记录ID（外键关联lottery_draws.draw_id）'
      },

      /**
       * 抽奖幂等键
       */
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '抽奖幂等键（与lottery_draws.idempotency_key对应）'
      },

      /**
       * Pipeline类型
       */
      pipeline_type: {
        type: DataTypes.ENUM('normal', 'preset', 'override'),
        allowNull: false,
        defaultValue: 'normal',
        comment: 'Pipeline类型：normal=普通抽奖, preset=预设发放, override=管理覆盖'
      },

      /**
       * 用户分层标识
       */
      segment_key: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '用户分层标识（由SegmentResolver解析获得）'
      },

      /**
       * 分层规则版本
       * 记录解析时使用的分层规则版本，便于审计
       */
      segment_version: {
        type: DataTypes.STRING(32),
        allowNull: true,
        comment: '分层规则版本（如v1/v2，对应config/segment_rules.js）'
      },

      /**
       * 匹配的规则ID
       * 记录最终匹配的档位规则ID，便于审计追溯
       */
      matched_rule_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '匹配的档位规则ID（lottery_tier_rules.tier_rule_id）'
      },

      /**
       * 匹配原因
       * 简要说明为什么命中此规则/档位
       */
      match_reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '匹配原因说明（如："new_user分层命中high档位"）'
      },

      /**
       * 原始命中档位
       * 档位抽选时最初命中的档位（降级前）
       */
      original_tier: {
        type: DataTypes.ENUM('high', 'mid', 'low'),
        allowNull: true,
        comment: '原始命中档位（降级前）'
      },

      /**
       * 最终发放档位
       * 降级后的最终档位（可能是fallback）
       */
      final_tier: {
        type: DataTypes.ENUM('high', 'mid', 'low', 'fallback'),
        allowNull: true,
        comment: '最终发放档位（降级后）'
      },

      /**
       * 降级次数
       * 记录经历了多少次降级（0=未降级）
       */
      downgrade_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '降级次数（0=未降级，便于统计分析）'
      },

      /**
       * 是否触发fallback兜底
       * 当所有档位都无可用奖品时触发
       */
      fallback_triggered: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否触发了fallback兜底'
      },

      /**
       * 选中的档位（兼容旧字段）
       */
      selected_tier: {
        type: DataTypes.ENUM('high', 'mid', 'low', 'fallback'),
        allowNull: true,
        comment: '选中的档位（包含fallback保底档位）'
      },

      /**
       * 是否触发档位降级
       */
      tier_downgrade_triggered: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否触发了档位降级（如high无可用奖品降级到mid）'
      },

      /**
       * 原始随机数（用于审计验证）
       */
      random_seed: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: '原始随机数值（0-999999范围，用于审计复现）'
      },

      /**
       * 预算提供者类型
       */
      budget_provider_type: {
        type: DataTypes.ENUM('user', 'pool', 'pool_quota', 'none'),
        allowNull: true,
        comment: '预算提供者类型：user=用户预算, pool=活动池, pool_quota=池+配额, none=无预算限制'
      },

      /**
       * 预算扣减金额
       */
      budget_deducted: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: '本次抽奖扣减的预算金额'
      },

      /**
       * 是否使用预设奖品
       */
      preset_used: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否使用了预设奖品'
      },

      /**
       * 关联的预设ID
       */
      preset_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '使用的预设ID（如果是预设发放）'
      },

      /**
       * 是否触发系统垫付
       */
      system_advance_triggered: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否触发了系统垫付（库存或预算垫付）'
      },

      /**
       * 库存垫付数量
       */
      inventory_debt_created: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '本次产生的库存欠账数量'
      },

      /**
       * 预算垫付金额
       */
      budget_debt_created: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '本次产生的预算欠账金额'
      },

      /**
       * 保底机制触发
       */
      guarantee_triggered: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否触发了保底机制'
      },

      /**
       * 保底类型
       */
      guarantee_type: {
        type: DataTypes.ENUM('consecutive', 'probability', 'none'),
        allowNull: false,
        defaultValue: 'none',
        comment: '保底类型：consecutive=连续失败保底, probability=概率保底, none=未触发'
      },

      /**
       * 完整的决策上下文
       */
      decision_context: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '完整决策上下文JSON（包含候选奖品列表、权重计算过程等）'
      },

      /**
       * 决策时间戳
       */
      decision_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '决策时间戳'
      },

      /**
       * 处理耗时（毫秒）
       */
      processing_time_ms: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '决策处理耗时（毫秒）'
      },

      // ============== 策略引擎审计字段 ==============

      /**
       * 有效预算（统一计算口径）
       */
      effective_budget: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '有效预算（统一计算口径，来自 StrategyEngine.computeBudgetContext）'
      },

      /**
       * 预算分层（B0/B1/B2/B3）
       */
      budget_tier: {
        type: DataTypes.STRING(10),
        allowNull: true,
        comment: '预算分层（B0/B1/B2/B3，来自 BudgetTierCalculator）'
      },

      /**
       * 活动压力分层（P0/P1/P2）
       */
      pressure_tier: {
        type: DataTypes.STRING(10),
        allowNull: true,
        comment: '活动压力分层（P0/P1/P2，来自 PressureTierCalculator）'
      },

      /**
       * 预算上限值
       */
      cap_value: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '预算上限值（该 BxPx 组合允许的最大奖品积分价值）'
      },

      /**
       * Pity 系统决策信息
       */
      pity_decision: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Pity 系统决策信息（包含 empty_streak, boost_multiplier, triggered）'
      },

      /**
       * 运气债务决策信息
       */
      luck_debt_decision: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '运气债务决策信息（包含 debt_level, multiplier, historical_empty_rate）'
      },

      /**
       * 体验平滑机制应用记录
       */
      experience_smoothing: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '体验平滑机制应用记录（包含 Pity/AntiEmpty/AntiHigh 应用结果）'
      },

      /**
       * BxPx 矩阵权重调整信息
       */
      weight_adjustment: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'BxPx 矩阵权重调整信息（包含 base_weights, adjusted_weights, multiplier）'
      },

      /**
       * 可用档位列表
       */
      available_tiers: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '可用档位列表（基于预算和库存过滤后的档位）'
      }
    },
    {
      sequelize,
      modelName: 'LotteryDrawDecision',
      tableName: 'lottery_draw_decisions',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false, // 决策记录不需要更新时间
      underscored: true,
      comment: '抽奖决策快照表 - 记录每次抽奖的完整决策路径用于审计',
      indexes: [
        // 唯一索引：一次抽奖一条决策记录
        {
          fields: ['draw_id'],
          unique: true,
          name: 'uk_decisions_draw_id'
        },
        // 查询索引：按幂等键查询
        {
          fields: ['idempotency_key'],
          name: 'idx_decisions_idempotency_key'
        },
        // 查询索引：按Pipeline类型和时间查询
        {
          fields: ['pipeline_type', 'decision_at'],
          name: 'idx_decisions_pipeline_time'
        },
        // 查询索引：按系统垫付和时间查询
        {
          fields: ['system_advance_triggered', 'decision_at'],
          name: 'idx_decisions_advance_time'
        }
      ]
    }
  )

  return LotteryDrawDecision
}
