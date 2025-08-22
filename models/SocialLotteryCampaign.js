/**
 * 🔥 社交抽奖活动模型 v3.0
 * 创建时间：2025年08月22日 11:38 UTC
 * 功能：社交抽奖活动管理 - 组队抽奖、邀请分享、团队协作
 * 特点：多种社交类型 + 动态奖励机制 + 灵活配置
 */

'use strict'

module.exports = (sequelize, DataTypes) => {
  const SocialLotteryCampaign = sequelize.define('SocialLotteryCampaign', {
    // 基础信息
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: '社交抽奖活动ID'
    },
    campaign_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: '活动唯一标识符'
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
      comment: '活动标题'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '活动描述'
    },

    // 社交配置
    social_type: {
      type: DataTypes.ENUM('group', 'team', 'invite', 'share', 'collaborate'),
      allowNull: false,
      comment: '社交类型：组队/团队/邀请/分享/协作'
    },
    min_participants: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 2,
      comment: '最少参与人数'
    },
    max_participants: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
      comment: '最多参与人数'
    },

    // 经济配置
    entry_cost: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '参与消耗积分'
    },
    reward_pool: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '奖励池总积分'
    },
    sharing_bonus: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '分享奖励积分'
    },
    invitation_bonus: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '邀请奖励积分'
    },
    team_bonus_multiplier: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: false,
      defaultValue: 1.0,
      comment: '团队奖励倍数'
    },

    // 状态管理
    status: {
      type: DataTypes.ENUM('draft', 'active', 'paused', 'completed', 'cancelled'),
      allowNull: false,
      defaultValue: 'draft',
      comment: '活动状态'
    },
    start_time: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: '开始时间'
    },
    end_time: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: '结束时间'
    },

    // 配置参数
    config: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '活动配置参数'
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
  }, {
    tableName: 'social_lottery_campaigns',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    comment: '社交抽奖活动表',

    // 数据验证
    validate: {
      // 验证时间范围
      timeRangeValid () {
        if (this.start_time && this.end_time && this.start_time >= this.end_time) {
          throw new Error('开始时间必须早于结束时间')
        }
      },
      // 验证参与人数
      participantsValid () {
        if (this.min_participants > this.max_participants) {
          throw new Error('最少参与人数不能大于最多参与人数')
        }
      }
    },

    // 实例方法
    instanceMethods: {
      // 检查活动是否进行中
      isActive () {
        const now = new Date()
        return this.status === 'active' &&
               this.start_time <= now &&
               this.end_time > now
      },

      // 计算剩余时间
      getTimeRemaining () {
        const now = new Date()
        if (this.end_time <= now) return 0
        return Math.floor((this.end_time - now) / 1000)
      },

      // 获取活动配置
      getConfigValue (key, defaultValue = null) {
        return this.config && this.config[key] ? this.config[key] : defaultValue
      }
    }
  })

  // 关联关系
  SocialLotteryCampaign.associate = function (models) {
    // 关联到队伍
    SocialLotteryCampaign.hasMany(models.SocialLotteryTeam, {
      foreignKey: 'campaign_id',
      sourceKey: 'campaign_id',
      as: 'teams'
    })
  }

  return SocialLotteryCampaign
}
