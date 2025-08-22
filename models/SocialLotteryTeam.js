/**
 * 🔥 社交抽奖组队模型 v3.0 - 队伍管理和协作功能
 */

'use strict'

module.exports = (sequelize, DataTypes) => {
  const SocialLotteryTeam = sequelize.define('SocialLotteryTeam', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: '组队ID'
    },
    team_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: '队伍唯一标识符'
    },
    campaign_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '所属活动ID'
    },
    leader_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '队长用户ID'
    },
    team_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '队伍名称'
    },
    current_members: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: '当前成员数'
    },
    max_members: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
      comment: '最大成员数'
    },
    is_public: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: '是否公开队伍'
    },
    invite_code: {
      type: DataTypes.STRING(20),
      allowNull: true,
      unique: true,
      comment: '邀请码'
    },
    team_status: {
      type: DataTypes.ENUM('forming', 'ready', 'playing', 'completed', 'disbanded'),
      allowNull: false,
      defaultValue: 'forming',
      comment: '队伍状态'
    },
    total_points_invested: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '团队总投入积分'
    },
    total_rewards_earned: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '团队总获得奖励'
    },
    config: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '队伍配置参数'
    },
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
    tableName: 'social_lottery_teams',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    comment: '社交抽奖组队表'
  })

  SocialLotteryTeam.associate = function (models) {
    SocialLotteryTeam.belongsTo(models.SocialLotteryCampaign, {
      foreignKey: 'campaign_id',
      targetKey: 'campaign_id',
      as: 'campaign'
    })

    SocialLotteryTeam.belongsTo(models.User, {
      foreignKey: 'leader_id',
      as: 'leader'
    })

    SocialLotteryTeam.hasMany(models.SocialLotteryMember, {
      foreignKey: 'team_id',
      sourceKey: 'team_id',
      as: 'members'
    })
  }

  return SocialLotteryTeam
}
