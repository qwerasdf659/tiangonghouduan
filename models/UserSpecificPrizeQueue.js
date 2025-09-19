/**
 * 用户特定奖品队列模型
 * 支持管理员为特定用户设置预定义的奖品序列
 * 功能：个性化奖品分配、队列式奖品发放
 *
 * @description 实现"用户抽奖时优先获得管理员预设的特定奖品"功能
 * @version 4.0.0
 * @date 2025-01-13
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const UserSpecificPrizeQueue = sequelize.define(
    'UserSpecificPrizeQueue',
    {
      // 队列记录ID（主键）
      queue_id: {
        type: DataTypes.STRING(50),
        primaryKey: true,
        defaultValue: () => {
          // 生成格式：queue_时间戳_随机字符串
          const timestamp = Date.now().toString()
          const random = Math.random().toString(36).substr(2, 8)
          return `queue_${timestamp}_${random}`
        },
        comment: '队列记录唯一ID'
      },

      // 用户ID
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '目标用户ID',
        references: {
          model: 'users',
          key: 'user_id'
        },
        index: true
      },

      // 活动ID
      campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '关联的抽奖活动ID',
        references: {
          model: 'lottery_campaigns',
          key: 'campaign_id'
        }
      },

      // 奖品ID（1号到10号奖品的具体奖品ID）
      prize_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '预设奖品ID（对应1号到10号奖品）',
        references: {
          model: 'lottery_prizes',
          key: 'prize_id'
        }
      },

      // 奖品编号（1-10号）
      prize_number: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '奖品编号（1-10号），便于管理识别',
        validate: {
          min: 1,
          max: 10
        }
      },

      // 队列顺序
      queue_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '在用户队列中的顺序（1,2,3,4,5...）'
      },

      // 状态
      status: {
        type: DataTypes.ENUM('pending', 'distributed', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '队列状态：待发放/已分发/已过期/已取消'
      },

      // 分发时间 - 业务语义统一修复
      distributed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '实际分发时间（业务语义与distributed状态保持一致）'
      },

      // 管理员信息
      admin_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '设置此队列的管理员ID',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      admin_note: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '管理员备注说明'
      },

      // 过期时间
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '队列过期时间，过期后自动失效'
      },

      // 时间戳
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
      },

      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间'
      }
    },
    {
      tableName: 'user_specific_prize_queue',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        {
          unique: false,
          fields: ['user_id', 'campaign_id', 'status']
        },
        {
          unique: false,
          fields: ['user_id', 'queue_order']
        },
        {
          unique: false,
          fields: ['status', 'created_at']
        }
      ],
      comment: '用户特定奖品队列表 - 管理员为特定用户预设的奖品序列'
    }
  )

  // 关联关系
  UserSpecificPrizeQueue.associate = function (models) {
    // 关联用户
    UserSpecificPrizeQueue.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      comment: '目标用户'
    })

    // 关联活动
    UserSpecificPrizeQueue.belongsTo(models.LotteryCampaign, {
      foreignKey: 'campaign_id',
      as: 'campaign',
      comment: '关联抽奖活动'
    })

    // 关联奖品
    UserSpecificPrizeQueue.belongsTo(models.LotteryPrize, {
      foreignKey: 'prize_id',
      as: 'prize',
      comment: '预设奖品'
    })

    // 关联管理员
    UserSpecificPrizeQueue.belongsTo(models.User, {
      foreignKey: 'admin_id',
      as: 'admin',
      comment: '设置队列的管理员'
    })
  }

  // 静态方法

  /**
   * 获取用户的下一个待发放奖品
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID
   * @returns {Object|null} 下一个奖品或null
   */
  UserSpecificPrizeQueue.getNextPrizeForUser = async function (userId, campaignId) {
    const nextPrize = await UserSpecificPrizeQueue.findOne({
      where: {
        user_id: userId,
        campaign_id: campaignId,
        status: 'pending'
      },
      include: [
        {
          model: sequelize.models.LotteryPrize,
          as: 'prize',
          attributes: ['prize_id', 'prize_name', 'prize_type', 'prize_value']
        }
      ],
      order: [['queue_order', 'ASC']]
    })

    return nextPrize
  }

  /**
   * 标记奖品为已发放
   * @param {number} queueId - 队列记录ID
   * @returns {Promise<boolean>} 操作结果
   */
  UserSpecificPrizeQueue.markAsAwarded = async function (queueId) {
    const [updatedRows] = await UserSpecificPrizeQueue.update(
      {
        status: 'distributed',
        distributed_at: new Date(),
        updated_at: new Date()
      },
      {
        where: { queue_id: queueId }
      }
    )

    return updatedRows > 0
  }

  /**
   * 批量创建用户特定奖品队列
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID
   * @param {Array} prizeQueue - 奖品队列配置
   * @param {number} adminId - 管理员ID
   * @param {string} adminNote - 管理员备注
   * @returns {Promise<Array>} 创建的队列记录
   */
  UserSpecificPrizeQueue.createUserQueue = async function (
    userId,
    campaignId,
    prizeQueue,
    adminId,
    adminNote = ''
  ) {
    const queueRecords = prizeQueue.map((prizeInfo, index) => ({
      user_id: userId,
      campaign_id: campaignId,
      prize_id: prizeInfo.prize_id,
      prize_number: prizeInfo.prize_number,
      queue_order: index + 1,
      admin_id: adminId,
      admin_note: adminNote,
      expires_at: prizeInfo.expires_at || null,
      created_at: new Date(),
      updated_at: new Date()
    }))

    const createdRecords = await UserSpecificPrizeQueue.bulkCreate(queueRecords)

    console.log(`✅ 为用户${userId}创建特定奖品队列，共${createdRecords.length}个奖品`)

    return createdRecords
  }

  /**
   * 获取用户队列统计
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID
   * @returns {Object} 队列统计信息
   */
  UserSpecificPrizeQueue.getUserQueueStats = async function (userId, campaignId) {
    const stats = await UserSpecificPrizeQueue.findAll({
      where: {
        user_id: userId,
        campaign_id: campaignId
      },
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('queue_id')), 'count']],
      group: ['status'],
      raw: true
    })

    const result = {
      total: 0,
      pending: 0,
      distributed: 0, // 🔥 修复：使用distributed而非completed，与枚举值保持一致
      expired: 0,
      cancelled: 0
    }

    stats.forEach(stat => {
      result[stat.status] = parseInt(stat.count)
      result.total += parseInt(stat.count)
    })

    return result
  }

  return UserSpecificPrizeQueue
}
