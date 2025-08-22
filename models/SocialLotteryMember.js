/**
 * 🔥 社交抽奖队员模型 v3.0
 */

'use strict'

module.exports = (sequelize, DataTypes) => {
  const SocialLotteryMember = sequelize.define('SocialLotteryMember', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: '成员记录ID'
    },
    team_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '队伍ID'
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '用户ID'
    },
    role: {
      type: DataTypes.ENUM('leader', 'member', 'invited'),
      allowNull: false,
      defaultValue: 'member',
      comment: '角色：队长/成员/邀请中'
    },
    join_time: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: '加入时间'
    },
    invite_source: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: '邀请来源'
    },
    points_contributed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '贡献积分'
    },
    rewards_received: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '获得奖励'
    },
    member_status: {
      type: DataTypes.ENUM('active', 'inactive', 'left', 'kicked'),
      allowNull: false,
      defaultValue: 'active',
      comment: '成员状态'
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
    tableName: 'social_lottery_members',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    comment: '社交抽奖队员表'
  })

  SocialLotteryMember.associate = function (models) {
    SocialLotteryMember.belongsTo(models.SocialLotteryTeam, {
      foreignKey: 'team_id',
      targetKey: 'team_id',
      as: 'team'
    })

    SocialLotteryMember.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })
  }

  return SocialLotteryMember
}
