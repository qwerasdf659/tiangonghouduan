/**
 * 用户信息管理模型
 * 解决核心用户数据管理和认证问题
 * 创建时间：2025年01月28日
 */

const { DataTypes } = require('sequelize')

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    user_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: '用户唯一标识'
    },

    mobile: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      comment: '手机号'
    },

    nickname: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: '用户昵称'
    },

    avatar_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: '头像URL'
    },

    is_admin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: '是否管理员'
    },

    total_points: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: '总积分'
    },

    available_points: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: '可用积分'
    },

    used_points: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: '已使用积分'
    },

    status: {
      type: DataTypes.ENUM('active', 'inactive', 'banned'),
      defaultValue: 'active',
      comment: '用户状态'
    },

    last_login: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '最后登录时间'
    },

    login_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: '登录次数'
    },

    registration_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: '注册时间'
    },

    preferences: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '用户偏好设置'
    }
  }, {
    tableName: 'users',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['mobile']
      },
      {
        fields: ['status', 'is_admin']
      },
      {
        fields: ['total_points']
      },
      {
        fields: ['last_login']
      }
    ],
    comment: '用户信息表'
  })

  // 定义关联关系
  User.associate = function (models) {
    // 用户上传的图片资源
    User.hasMany(models.ImageResources, {
      foreignKey: 'user_id',
      as: 'uploadedImages'
    })

    // 用户的积分记录
    if (models.PointsRecord) {
      User.hasMany(models.PointsRecord, {
        foreignKey: 'user_id',
        as: 'pointsRecords'
      })
    }

    // 用户的抽奖记录
    if (models.LotteryRecord) {
      User.hasMany(models.LotteryRecord, {
        foreignKey: 'user_id',
        as: 'lotteryRecords'
      })
    }

    // 用户的兑换订单
    if (models.ExchangeOrder) {
      User.hasMany(models.ExchangeOrder, {
        foreignKey: 'user_id',
        as: 'exchangeOrders'
      })
    }
  }

  return User
}