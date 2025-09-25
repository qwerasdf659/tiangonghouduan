/**
 * 用户信息管理模型 - V4.2最终版本
 * 合并AdminUser功能，保留核心字段，专注抽奖业务需求
 * 创建时间：2025年01月28日
 * 最终优化时间：2025年09月21日 20:26:04 UTC - 按需求保留7个核心字段
 *
 * 🔧 V4.2最终优化内容：
 * ⭐⭐⭐⭐⭐ 核心字段（6个）：
 * - user_id: 核心主键，必需，极高优先级
 * - mobile: 唯一标识+登录，必需，极高优先级
 * - consecutive_fail_count: 保底机制核心，必需，高优先级
  * - history_total_points: 臻选空间解锁，必需，高优先级
 * - is_admin: 权限控制，必需，高优先级
 * - nickname: 用户昵称，可选，中优先级
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const User = sequelize.define(
    'User',
    {
      // ⭐⭐⭐⭐⭐ 核心主键 - 必需，极高优先级
      user_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        comment: '用户唯一标识'
      },

      // ⭐⭐⭐⭐⭐ 唯一标识+登录 - 必需，极高优先级
      mobile: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        comment: '手机号，唯一标识+登录凭证'
      },

      // ⭐⭐⭐⭐⭐ 保底机制核心 - 必需，高优先级
      consecutive_fail_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '连续未中奖次数（保底机制核心）'
      },

      // ⭐⭐⭐⭐⭐ 臻选空间解锁 - 必需，高优先级
      history_total_points: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '历史累计总积分（臻选空间解锁条件）'
      },

      // ⭐⭐⭐⭐ 权限控制 - 必需，高优先级
      is_admin: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: '是否管理员 - 统一权限控制'
      },

      // 用户昵称 - 可选，中优先级
      nickname: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '用户昵称'
      },

      // 🗑️ password_hash 字段已删除 - 使用手机号验证码登录，不需要密码哈希 - 2025年01月21日

      // 🗑️ pool_access_level 字段已删除 - 数据库中不存在此字段，简化奖池访问控制 - 2025年01月21日

      // 🔧 保留的业务辅助字段
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
        comment: '登录次数统计'
      }
    },
    {
      tableName: 'users',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
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

    // 🔥 用户的抽奖记录（LotteryRecord已合并到LotteryDraw）
    if (models.LotteryDraw) {
      User.hasMany(models.LotteryDraw, {
        foreignKey: 'user_id',
        as: 'lotteryDraws',
        comment: '用户抽奖记录（合并版）'
      })
    }

    // 🔥 用户的奖品分发记录
    if (models.PrizeDistribution) {
      User.hasMany(models.PrizeDistribution, {
        foreignKey: 'user_id',
        as: 'prizeDistributions',
        comment: '用户奖品分发记录'
      })
    }

    // 🗑️ 用户的业务事件关联已删除 - BusinessEvent模型已删除 - 2025年01月21日

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

    // 💾 关联关系优化 - 必要的关联关系，支持联查需求
    // ⚠️ 注意：仅保留核心业务需要的关联，避免过度复杂化
    // 💡 pointsAccount关联已在前面定义（第139-143行），此处不重复定义

    // 用户会话
    if (models.UserSession) {
      User.hasMany(models.UserSession, {
        foreignKey: 'user_id',
        as: 'sessions'
      })
    }

    // 社交抽奖参与记录
    if (models.SocialLotteryMember) {
      User.hasMany(models.SocialLotteryMember, {
        foreignKey: 'user_id',
        as: 'socialLotteryMembers'
      })
    }

    // 用户库存
    if (models.UserInventory) {
      User.hasMany(models.UserInventory, {
        foreignKey: 'user_id',
        as: 'inventory'
      })
    }

    // 用户任务模型已删除 - UserTask与抽奖系统无关

    // VIP等级关联
    if (models.VipLevel) {
      User.belongsTo(models.VipLevel, {
        foreignKey: 'vip_level_id',
        as: 'vipLevel'
      })
    }
  }

  // 🔥 实例方法 - V4.1优化版本的简化权限检查
  User.prototype.isAdmin = function () {
    return this.is_admin === true || this.is_admin === 1
  }

  User.prototype.canAccess = function (resource) {
    // 简单权限检查逻辑，替代复杂的AdminUser权限系统
    const adminResources = ['admin', 'statistics', 'management', 'users']
    if (adminResources.includes(resource)) {
      return this.isAdmin()
    }
    return this.status === 'active'
  }

  User.prototype.isActive = function () {
    return this.status === 'active'
  }

  // 🔥 类方法 - 常用查询方法
  User.findByMobile = function (mobile) {
    return this.findOne({
      where: { mobile, status: 'active' }
    })
  }

  User.findAdmins = function () {
    return this.findAll({
      where: { is_admin: true, status: 'active' }
    })
  }

  User.findActiveUsers = function (limit = 50) {
    return this.findAll({
      where: { status: 'active' },
      order: [['last_login', 'DESC']],
      limit
    })
  }

  return User
}
