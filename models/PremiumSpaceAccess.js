/**
 * 餐厅积分抽奖系统 v2.0 - 臻选空间访问模型
 * 管理用户臻选空间的解锁状态和访问权限
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const PremiumSpaceAccess = sequelize.define(
    'PremiumSpaceAccess',
    {
      // 基础信息
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '访问记录唯一ID'
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID'
      },

      // 解锁状态
      is_unlocked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '当前是否已解锁'
      },
      unlock_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '解锁时间戳'
      },
      expiry_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '过期时间戳'
      },

      // 解锁条件和成本
      required_cumulative_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 500000,
        comment: '需要的累计积分'
      },
      unlock_cost_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
        comment: '单次解锁消耗积分'
      },
      unlock_duration_hours: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 24,
        comment: '解锁有效时长（小时）'
      },

      // 统计信息
      unlock_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '历史解锁次数'
      },
      total_cost_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '总消耗积分'
      },

      // 客户端信息
      last_unlock_client: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '最后解锁的客户端信息'
      },

      // 备注
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '备注信息'
      }
    },
    {
      tableName: 'premium_space_access',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        {
          name: 'idx_premium_space_access_user_id',
          fields: ['user_id'],
          unique: true
        },
        {
          name: 'idx_premium_space_access_unlocked',
          fields: ['is_unlocked']
        },
        {
          name: 'idx_premium_space_access_expiry',
          fields: ['expiry_time']
        }
      ],
      comment: '臻选空间访问权限表 - 管理用户解锁状态'
    }
  )

  // 实例方法
  PremiumSpaceAccess.prototype.isCurrentlyUnlocked = function () {
    if (!this.is_unlocked || !this.expiry_time) {
      return false
    }
    return new Date() < this.expiry_time
  }

  PremiumSpaceAccess.prototype.getRemainingHours = function () {
    if (!this.isCurrentlyUnlocked()) {
      return 0
    }
    const remainingMs = this.expiry_time.getTime() - Date.now()
    return Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60)))
  }

  PremiumSpaceAccess.prototype.canUnlock = function (userCumulativePoints) {
    return userCumulativePoints >= this.required_cumulative_points
  }

  PremiumSpaceAccess.prototype.unlock = async function (clientInfo = null) {
    const now = new Date()
    const expiryTime = new Date(now.getTime() + this.unlock_duration_hours * 60 * 60 * 1000)

    this.is_unlocked = true
    this.unlock_time = now
    this.expiry_time = expiryTime
    this.unlock_count += 1
    this.total_cost_points += this.unlock_cost_points
    this.last_unlock_client = clientInfo

    await this.save()

    return {
      unlocked: true,
      unlock_time: Math.floor(now.getTime() / 1000),
      expiry_time: Math.floor(expiryTime.getTime() / 1000),
      remaining_hours: this.unlock_duration_hours
    }
  }

  // 类方法
  PremiumSpaceAccess.findOrCreateForUser = async function (userId) {
    const [access] = await PremiumSpaceAccess.findOrCreate({
      where: { user_id: userId },
      defaults: {
        user_id: userId,
        is_unlocked: false,
        required_cumulative_points: 500000,
        unlock_cost_points: 100,
        unlock_duration_hours: 24,
        unlock_count: 0,
        total_cost_points: 0
      }
    })

    return access
  }

  PremiumSpaceAccess.getAccessStatus = async function (userId, userCumulativePoints) {
    const access = await PremiumSpaceAccess.findOrCreateForUser(userId)
    const isCurrentlyUnlocked = access.isCurrentlyUnlocked()

    return {
      is_unlocked: isCurrentlyUnlocked,
      unlock_time: access.unlock_time ? Math.floor(access.unlock_time.getTime() / 1000) : null,
      expiry_time: access.expiry_time ? Math.floor(access.expiry_time.getTime() / 1000) : null,
      remaining_hours: access.getRemainingHours(),
      can_unlock: access.canUnlock(userCumulativePoints),
      required_cumulative: access.required_cumulative_points,
      unlock_cost: access.unlock_cost_points,
      unlock_duration: access.unlock_duration_hours,
      unlock_history_count: access.unlock_count,
      last_unlock_time: access.unlock_time ? access.unlock_time.toISOString() : null
    }
  }

  PremiumSpaceAccess.cleanupExpiredAccess = async function () {
    const expiredCount = await PremiumSpaceAccess.update(
      { is_unlocked: false },
      {
        where: {
          is_unlocked: true,
          expiry_time: {
            [sequelize.Sequelize.Op.lt]: new Date()
          }
        }
      }
    )

    return expiredCount[0]
  }

  return PremiumSpaceAccess
}
