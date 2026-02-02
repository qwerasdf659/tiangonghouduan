/**
 * 抽奖记录模型
 * 专注于数据定义、关联关系和基础实例方法
 *
 * V4.0 抽奖语义：
 * - reward_tier: 奖励档位（low/mid/high，配置驱动）
 * - 100%中奖：每次抽奖必定从奖品池选择一个奖品
 */

const { DataTypes, Model } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')
const LotteryDrawFormatter = require('../utils/formatters/LotteryDrawFormatter')

/**
 * 抽奖记录模型（重构版 - V4.0语义清理）
 * 职责：记录用户的每次抽奖行为和结果
 * 设计模式：数据模型分离 - 业务逻辑在Service层，数据定义在Model层
 * 业务含义：每次抽奖100%从奖品池选择一个奖品（只是价值不同）
 */
class LotteryDraw extends Model {
  /**
   * 静态关联定义
   * 业务关系：抽奖记录关联用户、抽奖活动、奖品
   * @param {Object} models - 所有模型的引用
   * @returns {void}
   */
  static associate(models) {
    // 关联到用户
    LotteryDraw.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      comment: '抽奖用户'
    })

    // 关联到抽奖活动
    LotteryDraw.belongsTo(models.LotteryCampaign, {
      foreignKey: 'lottery_campaign_id',
      as: 'campaign',
      comment: '关联的抽奖活动'
    })

    // 关联到奖品
    LotteryDraw.belongsTo(models.LotteryPrize, {
      foreignKey: 'lottery_prize_id',
      as: 'prize',
      comment: '获得的奖品'
    })

    /*
     * 🔴 统一抽奖架构新增关联（2026-01-18）
     * 一对一：每次抽奖有一个决策快照
     */
    LotteryDraw.hasOne(models.LotteryDrawDecision, {
      foreignKey: 'lottery_draw_id',
      sourceKey: 'lottery_draw_id',
      as: 'decision',
      onDelete: 'CASCADE',
      comment: '抽奖决策快照（审计用）'
    })
  }

  /**
   * 获取奖励档位显示文本
   * @returns {string} 奖励档位文本（如"低档奖励"、"中档奖励"、"高档奖励"）
   */
  getRewardTierName() {
    return LotteryDrawFormatter.getRewardTierText(this.reward_tier)
  }

  /**
   * 获取奖品发放状态名称
   * @returns {string} 奖品发放状态文本（如"待发放"、"已发放"）
   */
  getPrizeStatusName() {
    return LotteryDrawFormatter.getPrizeStatusText(this.prize_status)
  }

  /**
   * 检查奖品是否已发放
   * @returns {boolean} 奖品是否已发放
   */
  isPrizeDelivered() {
    return LotteryDrawFormatter.isPrizeDelivered(this.prize_status)
  }

  /**
   * 检查奖品是否可领取
   * @returns {boolean} 奖品是否可领取
   */
  isPrizeClaimable() {
    // V4.0：每次都获得奖品，根据档位判断是否需要领取流程
    return this.reward_tier === 'high' && !LotteryDrawFormatter.isPrizeDelivered(this.prize_status)
  }

  /**
   * 输出摘要格式（使用Formatter）
   * @returns {Object} 抽奖记录摘要对象
   */
  toSummary() {
    return LotteryDrawFormatter.formatToSummary(this)
  }

  /**
   * 重写toJSON方法（使用Formatter）
   * 业务场景：API响应数据格式化
   * @returns {Object} JSON格式的抽奖记录
   */
  toJSON() {
    return LotteryDrawFormatter.formatToJSON(this)
  }

  /**
   * 静态方法 - 保留基础验证方法
   */

  /**
   * 基础数据验证
   * 业务场景：创建抽奖记录前验证必需字段
   * @param {Object} data - 抽奖记录数据
   * @param {number} data.user_id - 用户ID
   * @param {number} data.lottery_campaign_id - 抽奖活动ID
   * @param {string} data.reward_tier - 奖励档位
   * @returns {Array<string>} 错误信息数组（为空表示验证通过）
   */
  static validateBasicData(data) {
    const errors = []

    if (!data.user_id || data.user_id <= 0) {
      errors.push('用户ID无效')
    }

    if (!data.lottery_campaign_id || data.lottery_campaign_id <= 0) {
      errors.push('抽奖活动ID无效')
    }

    if (!data.reward_tier || !['low', 'mid', 'high'].includes(data.reward_tier)) {
      errors.push('奖励档位无效，必须是 low/mid/high 之一')
    }

    return errors
  }
}

module.exports = sequelize => {
  LotteryDraw.init(
    {
      // 记录标识
      lottery_draw_id: {
        type: DataTypes.STRING(50),
        primaryKey: true,
        comment: '抽奖记录唯一ID'
      },
      /**
       * 幂等键（业界标准形态 - 2026-01-02）
       *
       * 业务含义：
       * - 用于防止重复提交创建多条抽奖记录
       * - 实现永久幂等保护
       * - 支持业务操作追溯
       *
       * 技术规范：
       * - 格式：lottery_draw_用户ID_活动ID_时间戳
       * - 同一 idempotency_key 只能创建一条记录
       * - 重复提交返回已有记录（幂等）
       *
       * 使用场景：
       * - 用户抽奖时生成 idempotency_key，防止重复提交
       * - 通过 idempotency_key 查询是否已存在记录
       * - 实现幂等性保护，避免数据重复
       */
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '幂等键（业界标准命名），用于防止重复提交，客户端通过 Header Idempotency-Key 传入'
      },
      /**
       * 业务唯一键（business_id）- 事务边界治理（2026-01-05）
       *
       * 与 idempotency_key 的区别：
       * - idempotency_key：请求级幂等（防止同一请求重复提交）
       * - business_id：业务级幂等（防止同一业务操作从不同请求重复执行）
       *
       * 格式：lottery_draw_{user_id}_{session_id}_{draw_index}
       *
       * @see docs/事务边界治理现状核查报告.md 建议9.1
       */
      business_id: {
        type: DataTypes.STRING(150),
        allowNull: false, // 业务唯一键必填（历史数据已回填完成 - 2026-01-05）
        unique: true,
        comment: '业务唯一键（格式：lottery_draw_{user_id}_{session_id}_{draw_index}）- 必填'
      },
      /**
       * 抽奖会话ID（lottery_session_id）
       *
       * 事务边界治理（2026-01-05）：
       * - 一个 lottery_session_id 对应一条扣款流水（批量抽奖一次性扣 N×cost）
       * - 多条 lottery_draws 允许指向同一个 lottery_session_id
       * - 用于定时对账脚本检查数据一致性
       * - 格式：lottery_tx_{timestamp}_{random}_{user_id}
       *
       * 强制约束（2026-01-05 迁移）：
       * - 必填字段（NOT NULL）
       * - 历史数据已清理/回填
       */
      lottery_session_id: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '抽奖会话ID（必填，关联扣款流水，用于对账）'
      },
      /**
       * 关联资产流水ID（逻辑外键，用于对账）
       *
       * 事务边界治理（2026-01-05）：
       * - 每次抽奖扣减积分时，记录对应的 asset_transactions.transaction_id
       * - 用于定时对账脚本检查数据一致性
       * - 不使用物理外键约束，支持未来分库分表
       *
       * 强制约束（2026-01-05 迁移）：
       * - 必填字段（NOT NULL）
       * - 历史数据已清理/回填
       */
      asset_transaction_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '关联资产流水ID（必填，逻辑外键，用于对账）'
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '参与抽奖的用户ID',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },
      lottery_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 2,
        comment: '关联的抽奖活动ID'
      },
      lottery_id: {
        type: DataTypes.CHAR(36),
        allowNull: true,
        comment: '抽奖标识ID'
      },

      // 奖品信息
      lottery_prize_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '获得的奖品ID',
        references: {
          model: 'lottery_prizes',
          key: 'lottery_prize_id'
        }
      },
      prize_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '奖品名称'
      },
      prize_type: {
        type: DataTypes.ENUM('points', 'product', 'coupon', 'special'),
        allowNull: true,
        comment: '奖品类型'
      },
      prize_value: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '奖品价值'
      },
      prize_description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '奖品详细描述'
      },
      prize_image: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '奖品图片URL'
      },

      // 抽奖行为
      draw_type: {
        type: DataTypes.ENUM('single', 'triple', 'five', 'ten', 'multi'),
        allowNull: true,
        comment: '抽奖类型：single=单抽，triple=3连，five=5连，ten=10连，multi=其他连抽'
      },
      draw_sequence: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '抽奖序号'
      },
      draw_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '本次抽奖包含的次数'
      },
      /**
       * 抽奖批次ID（P5迁移重命名：batch_id → lottery_batch_id）
       * @业务含义 用于关联同一批次的多次抽奖（如10连抽）
       * @格式 batch_<timestamp>_<user_id>
       */
      lottery_batch_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '抽奖批次ID（用于关联同一批次的多次抽奖）'
      },
      /**
       * 批次内抽奖序号ID（P5迁移重命名：batch_draw_id → lottery_batch_draw_id）
       *
       * 业务含义：
       * - 用于关联同一批次（10连抽）的多条抽奖记录
       * - 格式：batch_<timestamp>_<user_id>
       * - 示例：batch_l8k9j2_123
       *
       * 使用场景：
       * - 查询"我的10连抽历史"
       * - 统计"本批次中奖情况"
       * - 支持批次级别的业务分析
       *
       * 技术特征：
       * - 允许NULL（单次抽奖没有批次ID）
       * - 有索引支持（快速查询）
       * - 不是外键（避免额外约束）
       */
      lottery_batch_draw_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '批次内抽奖序号ID（连抽时区分同一批次内的每次抽奖）'
      },

      // 核心业务字段（V4.0语义清理版）
      /**
       * 奖励档位（V4.0新增，替代原 is_winner 字段）
       *
       * 业务含义：
       * - 每次抽奖100%从奖品池选择一个奖品，根据奖品价值判定档位
       * - 不再区分"中没中"，只讨论"抽到了什么及其价值层级"
       *
       * 档位规则（配置驱动，可通过 LotteryManagementSetting 调整）：
       * - low: 低档奖励（prize_value_points < 300）
       * - mid: 中档奖励（300 <= prize_value_points < 700）
       * - high: 高档奖励（prize_value_points >= 700）
       *
       * 使用场景：
       * - 前端展示：根据档位显示不同动画效果
       * - 统计分析：奖励档位分布统计（替代原"中奖率"统计）
       * - 客服话术：统一对外承诺"每次必得奖励"
       */
      reward_tier: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'mid',
        comment: '奖励档位code（配置驱动，如 low/mid/high 或 tier_1..tier_n）'
      },
      guarantee_triggered: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        comment: '是否触发保底'
      },
      remaining_guarantee: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: '抽奖后剩余的保底次数'
      },

      // 成本和技术数据
      cost_points: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '消耗积分'
      },
      stop_angle: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        comment: '转盘停止角度',
        /**
         * 获取转盘停止角度，将DECIMAL转换为浮点数
         * @returns {number|null} 停止角度或null
         */
        get() {
          const value = this.getDataValue('stop_angle')
          return value ? parseFloat(value) : null
        }
      },
      draw_config: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '抽奖配置参数'
      },
      result_metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '抽奖结果元数据'
      },

      // ========== 统一抽奖架构字段（2026-01-18） ==========

      /**
       * 管线类型
       * @业务含义 标识本次抽奖走的是哪条管线
       * @枚举值
       * - normal：正常抽奖管线
       * - preset：预设发放管线
       * - override：管理干预管线
       */
      pipeline_type: {
        type: DataTypes.ENUM('normal', 'preset', 'override'),
        allowNull: false,
        defaultValue: 'normal',
        comment: '管线类型：normal-正常抽奖, preset-预设发放, override-管理干预'
      },

      /**
       * 选奖方法
       * @业务含义 记录本次抽奖使用的选奖方法
       */
      pick_method: {
        type: DataTypes.STRING(32),
        allowNull: true,
        comment: '选奖方法：normalize/fallback/tier_first'
      },

      /**
       * 原始命中档位
       * @业务含义 tier_first模式下，随机抽中的初始档位
       */
      original_tier: {
        type: DataTypes.ENUM('high', 'mid', 'low'),
        allowNull: true,
        comment: '原始命中档位（tier_first模式下抽中的档位）'
      },

      /**
       * 最终发放档位
       * @业务含义 经过降级处理后的最终发放档位，可能是fallback
       */
      final_tier: {
        type: DataTypes.ENUM('high', 'mid', 'low', 'fallback'),
        allowNull: true,
        comment: '最终发放档位（降级后的档位，可能是fallback）'
      },

      /**
       * 降级次数
       * @业务含义 从原始档位降级的次数，0表示未降级
       */
      downgrade_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '降级次数（0=未降级，便于快速统计）'
      },

      /**
       * 是否触发fallback兜底
       * @业务含义 所有档位都无可用奖品时触发fallback
       */
      fallback_triggered: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否触发fallback兜底'
      },

      /**
       * 是否为预设发放
       * @业务含义 标识本次抽奖是否来自预设
       */
      is_preset: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否为预设发放'
      },

      /**
       * 关联预设ID（P1迁移重命名：preset_id → lottery_preset_id）
       * @业务含义 预设发放时关联的预设记录
       * @外键关联 lottery_presets.lottery_preset_id
       */
      lottery_preset_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联预设ID（外键关联 lottery_presets.lottery_preset_id）'
      },

      /**
       * 关联库存欠账ID（P4迁移重命名：inventory_debt_id → preset_inventory_debt_id）
       * @业务含义 预设发放产生库存欠账时的关联ID
       * @外键关联 preset_inventory_debt.preset_inventory_debt_id
       */
      preset_inventory_debt_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联库存欠账ID（外键关联 preset_inventory_debt.preset_inventory_debt_id）'
      },

      /**
       * 关联预算欠账ID（P4迁移重命名：budget_debt_id → preset_budget_debt_id）
       * @业务含义 预设发放产生预算欠账时的关联ID
       * @外键关联 preset_budget_debt.preset_budget_debt_id
       */
      preset_budget_debt_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联预算欠账ID（外键关联 preset_budget_debt.preset_budget_debt_id）'
      },

      /**
       * 是否产生了欠账
       * @业务含义 便于快速筛选有欠账的抽奖记录
       */
      has_debt: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否产生了欠账（便于快速筛选）'
      },

      /**
       * 关联决策快照ID（P4迁移重命名：decision_id → lottery_draw_decision_id）
       * @业务含义 关联lottery_draw_decisions表，用于审计追溯
       * @外键关联 lottery_draw_decisions.lottery_draw_decision_id
       */
      lottery_draw_decision_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '关联决策快照ID（外键关联 lottery_draw_decisions.lottery_draw_decision_id）'
      },

      // ========== 双账户模型预算审计字段 ==========
      /**
       * 奖品价值积分消耗（双账户模型审计字段）
       * 记录本次抽奖消耗的预算积分
       */
      prize_value_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '奖品价值积分消耗'
      },
      /**
       * 抽奖前预算积分（审计字段）
       * 记录抽奖前用户的剩余预算积分
       */
      budget_points_before: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '抽奖前预算积分'
      },
      /**
       * 抽奖后预算积分（审计字段）
       * 记录抽奖后用户的剩余预算积分
       */
      budget_points_after: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '抽奖后预算积分'
      },

      // 审计信息
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: '用户IP地址'
      },

      // 时间戳
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '抽奖时间'
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '记录更新时间'
      }
    },
    {
      sequelize,
      modelName: 'LotteryDraw',
      tableName: 'lottery_draws', // 表名和模型名保持一致
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      underscored: true,
      comment: '抽奖记录表（V4.0语义清理版 - 删除is_winner，使用reward_tier）',
      indexes: [
        {
          name: 'idx_user_id',
          fields: ['user_id']
        },
        {
          name: 'uk_lottery_draws_idempotency_key',
          fields: ['idempotency_key'],
          unique: true,
          comment: '幂等键唯一索引（业界标准形态）'
        },
        {
          name: 'uk_lottery_draws_business_id',
          fields: ['business_id'],
          unique: true,
          comment: '业务唯一键索引（用于业务级幂等保护）'
        },
        {
          name: 'idx_lottery_prize_id',
          fields: ['lottery_prize_id']
        },
        {
          name: 'idx_prize_type',
          fields: ['prize_type']
        },
        {
          name: 'idx_draw_type',
          fields: ['draw_type']
        },
        {
          name: 'idx_draws_lottery_batch',
          fields: ['lottery_batch_id'],
          comment: '抽奖批次ID索引（P5迁移更新）'
        },
        {
          name: 'idx_created_at',
          fields: ['created_at']
        },
        {
          name: 'idx_user_created',
          fields: ['user_id', 'created_at']
        },
        // V4.0语义清理：用 reward_tier 替代原 is_winner 索引
        {
          name: 'idx_reward_tier',
          fields: ['reward_tier'],
          comment: '奖励档位索引（用于档位分布统计）'
        },
        {
          name: 'idx_user_reward_tier',
          fields: ['user_id', 'reward_tier'],
          comment: '用户档位索引（查询用户各档位奖励）'
        },
        {
          name: 'idx_created_reward_tier',
          fields: ['created_at', 'reward_tier'],
          comment: '时间档位索引（按时间查询档位分布）'
        },
        // 事务边界治理：对账关联字段索引（2026-01-05）
        {
          name: 'idx_lottery_draws_session_id',
          fields: ['lottery_session_id'],
          comment: '抽奖会话ID索引（用于对账查询）'
        },
        {
          name: 'idx_lottery_draws_asset_tx_id',
          fields: ['asset_transaction_id'],
          comment: '资产流水ID索引（用于对账查询）'
        }
      ]
    }
  )

  return LotteryDraw
}
