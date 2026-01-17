/**
 * 📋 抽奖活动配额赠送记录模型 - 统一抽奖架构核心组件
 * 创建时间：2026年01月18日 北京时间
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
      foreignKey: 'campaign_id',
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
   * 获取赠送类型显示名称
   * @returns {string} 赠送类型中文名称
   */
  getGrantTypeName() {
    const typeNames = {
      admin_grant: '管理员赠送',
      spending: '消费赠送',
      activity: '活动奖励',
      refund: '配额退还'
    }
    return typeNames[this.grant_type] || '未知类型'
  }

  /**
   * 获取赠送记录摘要
   * @returns {Object} 赠送记录摘要对象
   */
  toSummary() {
    return {
      grant_id: this.grant_id,
      campaign_id: this.campaign_id,
      user_id: this.user_id,
      grant_type: this.grant_type,
      grant_type_name: this.getGrantTypeName(),
      grant_amount: this.grant_amount,
      reason: this.reason,
      granted_by: this.granted_by,
      related_order_id: this.related_order_id,
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
      campaign_id,
      user_id,
      grant_type,
      grant_amount,
      reason,
      granted_by,
      related_order_id
    } = grantData

    if (!campaign_id || !user_id || !grant_type || !grant_amount) {
      throw new Error('缺少必要的赠送参数')
    }

    if (grant_amount <= 0) {
      throw new Error('赠送数量必须大于0')
    }

    const grant = await this.create(
      {
        campaign_id,
        user_id,
        grant_type,
        grant_amount,
        reason: reason || null,
        granted_by: granted_by || null,
        related_order_id: related_order_id || null
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
        campaign_id: campaignId,
        user_id: userId
      },
      order: [['created_at', 'DESC']],
      limit,
      offset,
      transaction
    })
  }

  /**
   * 按赠送类型统计活动配额
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 按类型分组的统计结果
   */
  static async getGrantStatsByType(campaignId, options = {}) {
    const { transaction } = options
    const { fn, col } = require('sequelize')

    return this.findAll({
      attributes: [
        'grant_type',
        [fn('COUNT', col('grant_id')), 'grant_count'],
        [fn('SUM', col('grant_amount')), 'total_amount']
      ],
      where: { campaign_id: campaignId },
      group: ['grant_type'],
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
      where: { campaign_id: campaignId },
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
        campaign_id: campaignId,
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
      grant_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '配额赠送记录主键ID'
      },

      /**
       * 活动ID
       */
      campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '活动ID（外键关联lottery_campaigns.campaign_id）'
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
       * 赠送类型
       */
      grant_type: {
        type: DataTypes.ENUM('admin_grant', 'spending', 'activity', 'refund'),
        allowNull: false,
        comment: '赠送类型：admin_grant=管理员赠送, spending=消费赠送, activity=活动奖励, refund=配额退还'
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
       * 赠送原因
       */
      reason: {
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
       * 关联订单ID
       */
      related_order_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '关联的订单ID（如消费订单ID，用于追溯）'
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
          fields: ['campaign_id', 'user_id', 'created_at'],
          name: 'idx_quota_grants_campaign_user_time'
        },
        // 查询索引：按赠送类型查询
        {
          fields: ['campaign_id', 'grant_type'],
          name: 'idx_quota_grants_campaign_type'
        },
        // 查询索引：按关联订单查询
        {
          fields: ['related_order_id'],
          name: 'idx_quota_grants_order'
        },
        // 查询索引：按赠送人查询
        {
          fields: ['granted_by', 'created_at'],
          name: 'idx_quota_grants_granter_time'
        }
      ]
    }
  )

  return LotteryCampaignQuotaGrant
}
