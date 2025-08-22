/**
 * 用户信息管理模型
 * 解决核心用户数据管理和认证问题
 * 创建时间：2025年01月28日
 * 更新时间：2025年08月20日 - 移除冗余积分字段，统一使用UserPointsAccount管理
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const User = sequelize.define(
    'User',
    {
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

      // 🔧 新增：历史累计总积分字段（用于臻选空间解锁条件检查）
      history_total_points: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '历史累计总积分（只增不减，用于解锁条件）'
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
      },

      // 🔧 修复抽奖功能：添加连续未中奖次数字段（保底机制）
      consecutive_fail_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '连续未中奖次数（用于保底机制）'
      }
    },
    {
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
          fields: ['history_total_points']
        },
        {
          fields: ['last_login']
        }
      ],
      comment: '用户信息表'
    }
  )

  // 定义关联关系
  User.associate = function (models) {
    // 用户上传的图片资源
    User.hasMany(models.ImageResources, {
      foreignKey: 'user_id',
      as: 'uploadedImages'
    })

    // 🔥 用户的积分账户（一对一关系）
    User.hasOne(models.UserPointsAccount, {
      foreignKey: 'user_id',
      as: 'pointsAccount',
      comment: '用户积分账户'
    })

    // 🔥 用户的积分交易记录（一对多关系）
    User.hasMany(models.PointsTransaction, {
      foreignKey: 'user_id',
      as: 'pointsTransactions',
      comment: '积分交易记录'
    })

    // 用户的抽奖记录
    if (models.LotteryDraw) {
      User.hasMany(models.LotteryDraw, {
        foreignKey: 'user_id',
        as: 'lotteryDraws'
      })
    }

    // 用户的业务事件
    if (models.BusinessEvent) {
      User.hasMany(models.BusinessEvent, {
        foreignKey: 'user_id',
        as: 'businessEvents'
      })
    }

    // 用户的行为分析
    if (models.AnalyticsBehavior) {
      User.hasMany(models.AnalyticsBehavior, {
        foreignKey: 'user_id',
        as: 'behaviors'
      })
    }

    // 用户画像
    if (models.AnalyticsUserProfile) {
      User.hasOne(models.AnalyticsUserProfile, {
        foreignKey: 'user_id',
        as: 'profile'
      })
    }

    // 用户推荐
    if (models.AnalyticsRecommendation) {
      User.hasMany(models.AnalyticsRecommendation, {
        foreignKey: 'user_id',
        as: 'recommendations'
      })
    }

    // 用户库存
    if (models.UserInventory) {
      User.hasOne(models.UserInventory, {
        foreignKey: 'user_id',
        as: 'inventory'
      })
    }

    // 客户服务会话
    if (models.CustomerSession) {
      User.hasMany(models.CustomerSession, {
        foreignKey: 'user_id',
        as: 'customerSessions'
      })
    }

    // 臻选空间访问记录
    if (models.PremiumSpaceAccess) {
      User.hasMany(models.PremiumSpaceAccess, {
        foreignKey: 'user_id',
        as: 'premiumAccess'
      })
    }

    // 产品相关
    if (models.Product) {
      User.hasMany(models.Product, {
        foreignKey: 'creator_id',
        as: 'createdProducts'
      })
    }

    // 交易记录
    if (models.TradeRecord) {
      User.hasMany(models.TradeRecord, {
        foreignKey: 'from_user_id',
        as: 'sentTrades'
      })

      User.hasMany(models.TradeRecord, {
        foreignKey: 'to_user_id',
        as: 'receivedTrades'
      })
    }

    // 上传审核
    if (models.UploadReview) {
      User.hasMany(models.UploadReview, {
        foreignKey: 'user_id',
        as: 'uploadReviews'
      })

      User.hasMany(models.UploadReview, {
        foreignKey: 'reviewer_id',
        as: 'reviewedUploads'
      })
    }

    // 用户图片
    if (models.ImageResources) {
      User.hasOne(models.ImageResources, {
        foreignKey: 'user_id',
        as: 'userImage',
        scope: {
          image_type: 'user_avatar'
        }
      })
    }
  }

  return User
}
