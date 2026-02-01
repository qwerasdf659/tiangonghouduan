/**
 * 📋 抽奖活动用户配额模型 - 统一抽奖架构核心组件
 * 创建时间：2026年01月18日 北京时间
 *
 * 业务职责：
 * - 管理用户在活动中的抽奖配额
 * - 支持池+配额(pool_quota)预算模式
 * - 记录配额的来源和使用情况
 *
 * 核心规则（DR-06/DR-14）：
 * - 池+配额模式下，用户需要拥有配额才能参与抽奖
 * - 配额可以通过赠送(grant)或消费(spend)获得
 * - 用于记录当前剩余可抽次数
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 抽奖活动用户配额模型
 * 业务场景：池+配额预算模式下的用户抽奖次数管理
 */
class LotteryCampaignUserQuota extends Model {
  /**
   * 模型关联定义
   * @param {Object} models - 所有模型的引用
   * @returns {void}
   */
  static associate(models) {
    // 多对一：配额属于某个活动
    LotteryCampaignUserQuota.belongsTo(models.LotteryCampaign, {
      foreignKey: 'lottery_campaign_id',
      as: 'campaign',
      onDelete: 'CASCADE',
      comment: '所属活动'
    })

    // 多对一：配额属于某个用户
    LotteryCampaignUserQuota.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      comment: '配额拥有者'
    })
  }

  /**
   * 检查用户是否有可用配额
   * @returns {boolean} 是否有可用配额
   */
  hasAvailableQuota() {
    return this.quota_remaining > 0
  }

  /**
   * 消耗一次配额
   * @param {Object} options - 事务选项
   * @returns {Promise<boolean>} 是否消耗成功
   */
  async consumeQuota(options = {}) {
    const { transaction } = options

    if (!this.hasAvailableQuota()) {
      throw new Error('无可用配额')
    }

    await this.update(
      {
        quota_remaining: this.quota_remaining - 1,
        quota_used: this.quota_used + 1,
        last_used_at: new Date()
      },
      { transaction }
    )

    return true
  }

  /**
   * 增加配额
   * @param {number} amount - 增加数量
   * @param {Object} options - 事务选项
   * @returns {Promise<void>} 无返回值
   */
  async addQuota(amount, options = {}) {
    const { transaction } = options

    if (amount <= 0) {
      throw new Error('增加配额数量必须大于0')
    }

    await this.update(
      {
        quota_remaining: this.quota_remaining + amount,
        quota_total: this.quota_total + amount
      },
      { transaction }
    )
  }

  /**
   * 获取配额摘要
   * @returns {Object} 配额摘要对象
   */
  toSummary() {
    return {
      lottery_campaign_user_quota_id: this.lottery_campaign_user_quota_id,
      lottery_campaign_id: this.lottery_campaign_id,
      user_id: this.user_id,
      quota_remaining: this.quota_remaining,
      quota_total: this.quota_total,
      quota_used: this.quota_used,
      has_available: this.hasAvailableQuota(),
      last_used_at: this.last_used_at,
      created_at: this.created_at
    }
  }

  /**
   * 获取或创建用户配额记录
   * @param {number} campaignId - 活动ID
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Promise<LotteryCampaignUserQuota>} 用户配额记录
   */
  static async getOrCreate(campaignId, userId, options = {}) {
    const { transaction, initialQuota = 0 } = options

    const [quota, created] = await this.findOrCreate({
      where: {
        lottery_campaign_id: campaignId,
        user_id: userId
      },
      defaults: {
        lottery_campaign_id: campaignId,
        user_id: userId,
        quota_remaining: initialQuota,
        quota_total: initialQuota,
        quota_used: 0,
        status: 'active'
      },
      transaction
    })

    if (created) {
      console.log(`[LotteryCampaignUserQuota] 为用户 ${userId} 在活动 ${campaignId} 创建配额记录`)
    }

    return quota
  }

  /**
   * 批量赠送配额给多个用户
   * @param {number} campaignId - 活动ID
   * @param {Array<number>} userIds - 用户ID列表
   * @param {number} amount - 赠送数量
   * @param {Object} options - 事务选项
   * @returns {Promise<Object>} 赠送结果统计
   */
  static async batchGrantQuota(campaignId, userIds, amount, options = {}) {
    const { transaction } = options
    let successCount = 0
    const failedUsers = []

    for (const userId of userIds) {
      try {
        // 顺序执行以正确捕获单个用户的失败
        // eslint-disable-next-line no-await-in-loop
        const quota = await this.getOrCreate(campaignId, userId, { transaction })
        // eslint-disable-next-line no-await-in-loop
        await quota.addQuota(amount, { transaction })
        successCount++
      } catch (error) {
        failedUsers.push({ user_id: userId, error: error.message })
      }
    }

    return {
      total_users: userIds.length,
      success_count: successCount,
      failed_count: failedUsers.length,
      failed_users: failedUsers
    }
  }

  /**
   * 获取活动的配额统计
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 统计结果
   */
  static async getCampaignQuotaStats(campaignId, options = {}) {
    const { transaction } = options
    const { fn, col, Op } = require('sequelize')

    const result = await this.findOne({
      attributes: [
        [fn('COUNT', col('quota_id')), 'total_users'],
        [fn('SUM', col('quota_total')), 'total_granted'],
        [fn('SUM', col('quota_used')), 'total_used'],
        [fn('SUM', col('quota_remaining')), 'total_remaining']
      ],
      where: { lottery_campaign_id: campaignId },
      raw: true,
      transaction
    })

    // 统计有配额的用户数
    const usersWithQuota = await this.count({
      where: {
        lottery_campaign_id: campaignId,
        quota_remaining: { [Op.gt]: 0 }
      },
      transaction
    })

    return {
      total_users: parseInt(result.total_users) || 0,
      users_with_quota: usersWithQuota,
      total_granted: parseInt(result.total_granted) || 0,
      total_used: parseInt(result.total_used) || 0,
      total_remaining: parseInt(result.total_remaining) || 0
    }
  }

  /**
   * 查询有配额的用户列表
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 有配额的用户列表
   */
  static async findUsersWithQuota(campaignId, options = {}) {
    const { limit = 100, offset = 0, transaction } = options
    const { Op } = require('sequelize')

    return this.findAll({
      where: {
        lottery_campaign_id: campaignId,
        quota_remaining: { [Op.gt]: 0 }
      },
      order: [['quota_remaining', 'DESC']],
      limit,
      offset,
      transaction
    })
  }
}

/**
 * 模型初始化
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {LotteryCampaignUserQuota} 初始化后的模型
 */
module.exports = sequelize => {
  LotteryCampaignUserQuota.init(
    {
      /**
       * 配额记录ID - 主键
       */
      lottery_campaign_user_quota_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '用户配额主键ID'
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
       * 用户ID
       */
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID（外键关联users.user_id）'
      },

      /**
       * 配额总量
       */
      quota_total: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '配额总量'
      },

      /**
       * 已使用配额
       */
      quota_used: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '已使用配额'
      },

      /**
       * 剩余配额
       */
      quota_remaining: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '当前剩余可抽次数'
      },

      /**
       * 过期时间
       */
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '配额过期时间'
      },

      /**
       * 状态
       */
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'active',
        comment: '状态（active/expired/disabled）'
      },

      /**
       * 最后使用时间
       */
      last_used_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最后一次使用配额的时间'
      },

      /**
       * 创建时间
       */
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '记录创建时间'
      },

      /**
       * 更新时间
       */
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '最后更新时间'
      }
    },
    {
      sequelize,
      modelName: 'LotteryCampaignUserQuota',
      tableName: 'lottery_campaign_user_quota',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '抽奖活动用户配额表 - 管理pool_quota模式下用户的抽奖配额',
      indexes: [
        // 唯一索引：一个用户在一个活动中只有一条配额记录
        {
          fields: ['lottery_campaign_id', 'user_id'],
          unique: true,
          name: 'uk_user_quota_campaign_user'
        },
        // 查询索引：按用户查询所有活动配额
        {
          fields: ['user_id', 'quota_remaining'],
          name: 'idx_user_quota_user_remaining'
        },
        // 查询索引：按活动查询有配额的用户
        {
          fields: ['lottery_campaign_id', 'quota_remaining'],
          name: 'idx_user_quota_campaign_remaining'
        }
      ]
    }
  )

  return LotteryCampaignUserQuota
}
