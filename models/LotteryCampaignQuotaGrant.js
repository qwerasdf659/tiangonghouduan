/**
 * 📋 抽奖活动配额赠送记录模型 - 统一抽奖架构核心组件
 *
 * 业务职责：
 * - 记录配额的赠送流水
 * - 追溯配额来源（管理员赠送、消费赠送、活动奖励、退还）
 * - 支持配额审计和统计
 *
 * 核心规则（DR-14）：
 * - 每次配额变动都需要记录流水
 * - 配额来源可追溯
 * - 支持多种赠送类型
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 抽奖活动配额赠送记录模型
 * 业务场景：配额流水记录和审计
 */
class LotteryCampaignQuotaGrant extends Model {
  /**
   * 模型关联定义
   * @param {Object} models - 所有模型的引用
   * @returns {void}
   */
  static associate(models) {
    // 多对一：赠送记录属于某个活动
    LotteryCampaignQuotaGrant.belongsTo(models.LotteryCampaign, {
      foreignKey: 'lottery_campaign_id',
      as: 'campaign',
      onDelete: 'CASCADE',
      comment: '所属活动'
    })

    // 多对一：赠送记录属于某个用户
    LotteryCampaignQuotaGrant.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      comment: '配额接收者'
    })

    // 多对一：关联赠送操作者（管理员）
    LotteryCampaignQuotaGrant.belongsTo(models.User, {
      foreignKey: 'granted_by',
      as: 'granter',
      onDelete: 'SET NULL',
      comment: '配额赠送者（管理员）'
    })
  }

  /**
   * 获取赠送来源显示名称
   * @returns {string} 赠送来源中文名称
   */
  getGrantSourceName() {
    const sourceNames = {
      admin_grant: '管理员赠送',
      spending: '消费赠送',
      activity: '活动奖励',
      refund: '配额退还',
      system: '系统赠送'
    }
    return sourceNames[this.grant_source] || '未知来源'
  }

  /**
   * 获取赠送记录摘要
   * @returns {Object} 赠送记录摘要对象
   */
  toSummary() {
    return {
      lottery_campaign_quota_grant_id: this.lottery_campaign_quota_grant_id,
      quota_id: this.quota_id,
      lottery_campaign_id: this.lottery_campaign_id,
      user_id: this.user_id,
      grant_source: this.grant_source,
      grant_source_name: this.getGrantSourceName(),
      grant_amount: this.grant_amount,
      grant_reason: this.grant_reason,
      granted_by: this.granted_by,
      source_reference_id: this.source_reference_id,
      balance_after: this.balance_after,
      created_at: this.created_at
    }
  }

  /**
   * 创建配额赠送记录
   * @param {Object} grantData - 赠送数据
   * @param {Object} options - 事务选项
   * @returns {Promise<LotteryCampaignQuotaGrant>} 创建的赠送记录
   */
  static async createGrant(grantData, options = {}) {
    const { transaction } = options

    const {
      quota_id,
      lottery_campaign_id,
      user_id,
      grant_source,
      grant_amount,
      grant_reason,
      granted_by,
      source_reference_id,
      balance_after
    } = grantData

    if (!user_id || !lottery_campaign_id || !grant_source || !grant_amount) {
      throw new Error('缺少必要的赠送参数')
    }

    if (grant_amount <= 0) {
      throw new Error('赠送数量必须大于0')
    }

    const grant = await this.create(
      {
        quota_id: quota_id || null,
        lottery_campaign_id,
        user_id,
        grant_source,
        grant_amount,
        grant_reason: grant_reason || null,
        granted_by: granted_by || null,
        source_reference_id: source_reference_id || null,
        balance_after: balance_after || null
      },
      { transaction }
    )

    return grant
  }

  /**
   * 获取用户在活动中的配额赠送历史
   * @param {number} campaignId - 活动ID
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 赠送历史列表
   */
  static async getUserGrantHistory(campaignId, userId, options = {}) {
    const { limit = 50, offset = 0, transaction } = options

    return this.findAll({
      where: {
        lottery_campaign_id: campaignId,
        user_id: userId
      },
      order: [['created_at', 'DESC']],
      limit,
      offset,
      transaction
    })
  }

  /**
   * 按赠送来源统计活动配额
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 按来源分组的统计结果
   */
  static async getGrantStatsBySource(campaignId, options = {}) {
    const { transaction } = options
    const { fn, col } = require('sequelize')

    return this.findAll({
      attributes: [
        'grant_source',
        [fn('COUNT', col('grant_id')), 'grant_count'],
        [fn('SUM', col('grant_amount')), 'total_amount']
      ],
      where: { lottery_campaign_id: campaignId },
      group: ['grant_source'],
      transaction
    })
  }

  /**
   * 获取活动配额赠送统计
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 统计结果
   */
  static async getCampaignGrantStats(campaignId, options = {}) {
    const { transaction } = options
    const { fn, col } = require('sequelize')

    const result = await this.findOne({
      attributes: [
        [fn('COUNT', col('grant_id')), 'total_grants'],
        [fn('SUM', col('grant_amount')), 'total_amount'],
        [fn('COUNT', fn('DISTINCT', col('user_id'))), 'unique_users']
      ],
      where: { lottery_campaign_id: campaignId },
      raw: true,
      transaction
    })

    return {
      total_grants: parseInt(result.total_grants) || 0,
      total_amount: parseInt(result.total_amount) || 0,
      unique_users: parseInt(result.unique_users) || 0
    }
  }

  /**
   * 按日期范围查询赠送记录
   * @param {number} campaignId - 活动ID
   * @param {Date} startDate - 开始日期
   * @param {Date} endDate - 结束日期
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 赠送记录列表
   */
  static async findByDateRange(campaignId, startDate, endDate, options = {}) {
    const { limit = 100, offset = 0, transaction } = options
    const { Op } = require('sequelize')

    return this.findAll({
      where: {
        lottery_campaign_id: campaignId,
        created_at: {
          [Op.between]: [startDate, endDate]
        }
      },
      order: [['created_at', 'DESC']],
      limit,
      offset,
      transaction
    })
  }
}

/**
 * 模型初始化
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {LotteryCampaignQuotaGrant} 初始化后的模型
 */
module.exports = sequelize => {
  LotteryCampaignQuotaGrant.init(
    {
      /**
       * 赠送记录ID - 主键
       */
      lottery_campaign_quota_grant_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '配额赠送记录主键ID'
      },

      /**
       * 配额ID - 外键关联 lottery_campaign_user_quota
       */
      quota_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '关联的配额ID（外键关联lottery_campaign_user_quota.quota_id）'
      },

      /**
       * 用户ID
       */
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID（外键关联users.user_id）'
      },

      /**
       * 活动ID
       */
      lottery_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '抽奖活动ID（外键关联lottery_campaigns.lottery_campaign_id）'
      },

      /**
       * 赠送数量
       */
      grant_amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '赠送的配额数量'
      },

      /**
       * 赠送来源
       */
      grant_source: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment:
          '赠送来源：admin_grant=管理员赠送, spending=消费赠送, activity=活动奖励, refund=配额退还, system=系统赠送'
      },

      /**
       * 来源引用ID
       */
      source_reference_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '来源引用ID（如消费订单ID、活动奖励ID，用于追溯）'
      },

      /**
       * 赠送原因
       */
      grant_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '赠送原因说明'
      },

      /**
       * 赠送人ID
       */
      granted_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '赠送人ID（管理员user_id，系统自动赠送时为null）'
      },

      /**
       * 操作后余额
       */
      balance_after: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '赠送操作后的配额余额'
      },

      /**
       * 创建时间
       */
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '赠送时间'
      }
    },
    {
      sequelize,
      modelName: 'LotteryCampaignQuotaGrant',
      tableName: 'lottery_campaign_quota_grants',
      timestamps: false, // 只有created_at，不需要updated_at
      underscored: true,
      comment: '抽奖活动配额赠送记录表 - 记录配额赠送流水用于审计',
      indexes: [
        // 查询索引：按活动和用户查询赠送历史
        {
          fields: ['lottery_campaign_id', 'user_id', 'created_at'],
          name: 'idx_quota_grants_campaign_user_time'
        },
        // 查询索引：按赠送来源查询
        {
          fields: ['lottery_campaign_id', 'grant_source'],
          name: 'idx_quota_grants_campaign_source'
        },
        // 查询索引：按来源引用ID查询
        {
          fields: ['source_reference_id'],
          name: 'idx_quota_grants_source_ref'
        },
        // 查询索引：按赠送人查询
        {
          fields: ['granted_by', 'created_at'],
          name: 'idx_quota_grants_granter_time'
        },
        // 查询索引：按配额ID查询
        {
          fields: ['quota_id'],
          name: 'idx_quota_grants_quota'
        }
      ]
    }
  )

  return LotteryCampaignQuotaGrant
}
