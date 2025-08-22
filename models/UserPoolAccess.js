/**
 * 🔥 用户池访问记录模型 v3.0
 */

'use strict'

module.exports = (sequelize, DataTypes) => {
  const UserPoolAccess = sequelize.define('UserPoolAccess', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: '访问记录ID'
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '用户ID'
    },
    pool_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '池ID'
    },
    access_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: '访问日期'
    },
    daily_draws: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '当日抽取次数'
    },
    total_draws: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '总抽取次数'
    },
    total_spent: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '总消耗积分'
    },
    total_rewards: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '总获得奖励'
    },
    last_draw_time: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '最后抽取时间'
    },
    access_level: {
      type: DataTypes.ENUM('basic', 'premium', 'vip', 'unlimited'),
      allowNull: false,
      defaultValue: 'basic',
      comment: '访问等级'
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: '首次访问时间'
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: '更新时间'
    }
  }, {
    tableName: 'user_pool_access',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    comment: '用户池访问记录表'
  })

  UserPoolAccess.associate = function (models) {
    UserPoolAccess.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    UserPoolAccess.belongsTo(models.LotteryPoolConfig, {
      foreignKey: 'pool_id',
      targetKey: 'pool_id',
      as: 'poolConfig'
    })
  }

  return UserPoolAccess
}
