/**
 * 抽奖结果预设模型（简化版）
 * 实现运营人员为特定用户预设抽奖结果的功能
 * 用户无感知，系统根据预设队列控制抽奖结果
 * 创建时间：2025年01月21日
 */

const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = (sequelize, DataTypes) => {
  const LotteryPreset = sequelize.define(
    'LotteryPreset',
    {
      // 主键：预设记录ID
      preset_id: {
        type: DataTypes.STRING(50),
        primaryKey: true,
        defaultValue: () => `preset_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        comment: '预设记录唯一标识'
      },

      // 目标用户ID
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '预设奖品的目标用户ID'
      },

      // 预设奖品ID
      prize_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'lottery_prizes',
          key: 'prize_id'
        },
        comment: '预设的奖品ID'
      },

      // 抽奖顺序
      queue_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '抽奖顺序（1为第一次抽奖，2为第二次抽奖，以此类推）'
      },

      // 预设状态
      status: {
        type: DataTypes.ENUM('pending', 'used'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '预设状态：pending-等待使用，used-已使用'
      },

      // 操作员ID
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '创建预设的管理员ID'
      },

      // 创建时间
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间',
        get () {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        }
      }
    },
    {
      tableName: 'lottery_presets',
      timestamps: false, // 使用自定义的created_at字段
      indexes: [
        {
          name: 'idx_user_status',
          fields: ['user_id', 'status']
        },
        {
          name: 'idx_queue_order',
          fields: ['queue_order']
        },
        {
          name: 'idx_created_by',
          fields: ['created_by']
        },
        {
          name: 'idx_created_at',
          fields: ['created_at']
        }
      ],
      comment: '抽奖结果预设表（简化版）'
    }
  )

  // 关联关系
  LotteryPreset.associate = function (models) {
    // 关联用户表（目标用户）
    LotteryPreset.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'targetUser'
    })

    // 关联奖品表
    LotteryPreset.belongsTo(models.LotteryPrize, {
      foreignKey: 'prize_id',
      as: 'prize'
    })

    // 关联管理员表
    LotteryPreset.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'admin'
    })
  }

  // 实例方法

  /**
   * 标记预设为已使用
   */
  LotteryPreset.prototype.markAsUsed = async function () {
    this.status = 'used'
    return await this.save()
  }

  // 静态方法

  /**
   * 获取用户的下一个未使用预设
   * @param {number} userId - 用户ID
   * @returns {Object|null} 下一个预设或null
   */
  LotteryPreset.getNextPreset = async function (userId) {
    return await LotteryPreset.findOne({
      where: {
        user_id: userId,
        status: 'pending'
      },
      order: [['queue_order', 'ASC']],
      include: [
        {
          model: sequelize.models.LotteryPrize,
          as: 'prize',
          attributes: ['prize_id', 'name', 'prize_type', 'prize_value', 'description']
        }
      ]
    })
  }

  /**
   * 为用户创建预设队列
   * @param {number} userId - 用户ID
   * @param {Array} presets - 预设配置数组 [{prize_id, queue_order}, ...]
   * @param {number} adminId - 管理员ID
   * @returns {Array} 创建的预设记录
   */
  LotteryPreset.createPresetQueue = async function (userId, presets, adminId) {
    const transaction = await sequelize.transaction()

    try {
      const createdPresets = []

      for (const preset of presets) {
        const newPreset = await LotteryPreset.create({
          user_id: userId,
          prize_id: preset.prize_id,
          queue_order: preset.queue_order,
          created_by: adminId
        }, { transaction })

        createdPresets.push(newPreset)
      }

      await transaction.commit()
      return createdPresets
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }

  /**
   * 获取用户的预设统计
   * @param {number} userId - 用户ID
   * @returns {Object} 统计信息
   */
  LotteryPreset.getUserPresetStats = async function (userId) {
    const [pendingCount, usedCount] = await Promise.all([
      LotteryPreset.count({
        where: { user_id: userId, status: 'pending' }
      }),
      LotteryPreset.count({
        where: { user_id: userId, status: 'used' }
      })
    ])

    return {
      total: pendingCount + usedCount,
      pending: pendingCount,
      used: usedCount
    }
  }

  /**
   * 清理用户的所有预设
   * @param {number} userId - 用户ID
   * @returns {number} 删除的记录数
   */
  LotteryPreset.clearUserPresets = async function (userId) {
    return await LotteryPreset.destroy({
      where: { user_id: userId }
    })
  }

  return LotteryPreset
}
