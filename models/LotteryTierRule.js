/**
 * 📊 抽奖档位规则模型 - 统一抽奖架构核心组件
 * 创建时间：2026年01月18日 北京时间
 *
 * 业务职责：
 * - 定义各活动下不同用户分层的档位概率规则
 * - 实现整数权重制的档位概率配置
 * - 支持多分层（new_user/vip/default等）的差异化概率
 *
 * 设计原则：
 * - 整数权重制：三个档位权重之和必须等于1,000,000
 * - 固定三档位：high/mid/low，不支持动态档位
 * - 分层独立：每个segment_key有独立的三档位配置
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 抽奖档位规则模型
 * 业务场景：tier_first选奖法中，决定用户命中哪个档位
 */
class LotteryTierRule extends Model {
  /**
   * 模型关联定义
   * @param {Object} models - 所有模型的引用
   * @returns {void}
   */
  static associate(models) {
    // 多对一：档位规则属于某个活动
    LotteryTierRule.belongsTo(models.LotteryCampaign, {
      foreignKey: 'campaign_id',
      as: 'campaign',
      onDelete: 'CASCADE',
      comment: '所属抽奖活动'
    })

    // 多对一：规则创建者
    LotteryTierRule.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator',
      onDelete: 'SET NULL',
      comment: '规则创建者'
    })

    // 多对一：规则更新者
    LotteryTierRule.belongsTo(models.User, {
      foreignKey: 'updated_by',
      as: 'updater',
      onDelete: 'SET NULL',
      comment: '规则更新者'
    })
  }

  /**
   * 获取档位显示名称
   * @returns {string} 档位中文名称
   */
  getTierDisplayName() {
    const tierNames = {
      high: '高档位（大奖）',
      mid: '中档位（中奖）',
      low: '低档位（小奖）'
    }
    return tierNames[this.tier_name] || '未知档位'
  }

  /**
   * 计算档位概率百分比
   * @param {number} scale - 权重比例因子，默认1,000,000
   * @returns {string} 概率百分比字符串
   */
  getProbabilityPercentage(scale = 1000000) {
    const probability = (this.tier_weight / scale) * 100
    return probability.toFixed(4) + '%'
  }

  /**
   * 验证三档位权重配置完整性
   * @param {number} campaignId - 活动ID
   * @param {string} segmentKey - 用户分层标识
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 验证结果
   */
  static async validateTierWeights(campaignId, segmentKey = 'default', options = {}) {
    const { transaction } = options
    const SCALE = 1000000

    // 查询该活动和分层下的所有档位规则
    const rules = await this.findAll({
      where: {
        campaign_id: campaignId,
        segment_key: segmentKey,
        status: 'active'
      },
      order: [['tier_name', 'ASC']],
      transaction
    })

    // 检查是否配置了三个档位
    const configuredTiers = rules.map(r => r.tier_name)
    const requiredTiers = ['high', 'mid', 'low']
    const missingTiers = requiredTiers.filter(t => !configuredTiers.includes(t))

    if (missingTiers.length > 0) {
      return {
        valid: false,
        error: `分层 ${segmentKey} 缺少档位配置: ${missingTiers.join(', ')}`,
        rules: rules.map(r => r.toJSON()),
        missing_tiers: missingTiers
      }
    }

    // 检查权重之和是否等于SCALE
    const totalWeight = rules.reduce((sum, r) => sum + r.tier_weight, 0)
    if (totalWeight !== SCALE) {
      return {
        valid: false,
        error: `分层 ${segmentKey} 权重之和(${totalWeight})不等于${SCALE}`,
        rules: rules.map(r => r.toJSON()),
        total_weight: totalWeight,
        expected_weight: SCALE
      }
    }

    return {
      valid: true,
      rules: rules.map(r => ({
        tier_name: r.tier_name,
        tier_weight: r.tier_weight,
        probability: r.getProbabilityPercentage(SCALE)
      })),
      total_weight: totalWeight,
      segment_key: segmentKey
    }
  }

  /**
   * 批量创建三档位规则（便捷方法）
   * @param {number} campaignId - 活动ID
   * @param {string} segmentKey - 用户分层标识
   * @param {Object} weights - 各档位权重 {high: number, mid: number, low: number}
   * @param {Object} options - 选项（包含transaction、created_by等）
   * @returns {Promise<Array>} 创建的规则列表
   */
  static async createTierRulesForSegment(campaignId, segmentKey, weights, options = {}) {
    const { transaction, created_by } = options
    const SCALE = 1000000

    // 验证权重之和
    const totalWeight = weights.high + weights.mid + weights.low
    if (totalWeight !== SCALE) {
      throw new Error(`权重之和(${totalWeight})必须等于${SCALE}`)
    }

    const rules = await Promise.all([
      this.create({
        campaign_id: campaignId,
        segment_key: segmentKey,
        tier_name: 'high',
        tier_weight: weights.high,
        status: 'active',
        created_by
      }, { transaction }),
      this.create({
        campaign_id: campaignId,
        segment_key: segmentKey,
        tier_name: 'mid',
        tier_weight: weights.mid,
        status: 'active',
        created_by
      }, { transaction }),
      this.create({
        campaign_id: campaignId,
        segment_key: segmentKey,
        tier_name: 'low',
        tier_weight: weights.low,
        status: 'active',
        created_by
      }, { transaction })
    ])

    return rules
  }
}

/**
 * 模型初始化
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {LotteryTierRule} 初始化后的模型
 */
module.exports = sequelize => {
  LotteryTierRule.init(
    {
      /**
       * 规则ID - 主键
       */
      tier_rule_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '档位规则主键ID'
      },

      /**
       * 活动ID - 外键关联lottery_campaigns
       */
      campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '所属活动ID（外键关联lottery_campaigns.campaign_id）',
        references: {
          model: 'lottery_campaigns',
          key: 'campaign_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      /**
       * 用户分层标识
       * 由SegmentResolver根据用户特征解析获得
       * 如：new_user（新用户）、vip（VIP用户）、default（默认）
       */
      segment_key: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: 'default',
        comment: '用户分层标识（如new_user/vip/default），由SegmentResolver解析获得'
      },

      /**
       * 档位名称 - 固定三档位
       * high: 高档位（大奖概率）
       * mid: 中档位（中奖概率）
       * low: 低档位（小奖概率）
       */
      tier_name: {
        type: DataTypes.ENUM('high', 'mid', 'low'),
        allowNull: false,
        comment: '档位名称：high=高档位, mid=中档位, low=低档位（固定三档）'
      },

      /**
       * 档位权重 - 整数权重值
       * 三个档位权重之和必须等于SCALE（默认1,000,000）
       */
      tier_weight: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        comment: '档位权重（整数，三个档位权重之和必须=1000000）'
      },

      /**
       * 规则状态
       */
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: '规则状态：active=启用, inactive=停用'
      },

      /**
       * 创建人ID
       */
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '创建人ID（管理员user_id）',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },

      /**
       * 更新人ID
       */
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '更新人ID（管理员user_id）',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      }
    },
    {
      sequelize,
      modelName: 'LotteryTierRule',
      tableName: 'lottery_tier_rules',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '抽奖档位规则表 - 定义各分层用户的档位概率（整数权重制）',
      indexes: [
        // 唯一索引：同一活动+分层+档位只能有一条规则
        {
          fields: ['campaign_id', 'segment_key', 'tier_name'],
          unique: true,
          name: 'uk_campaign_segment_tier'
        },
        // 查询索引：按活动和状态查询
        {
          fields: ['campaign_id', 'status'],
          name: 'idx_tier_rules_campaign_status'
        }
      ]
    }
  )

  return LotteryTierRule
}
