/**
 * 用户信息管理模型 - V4.0 统一架构版本
 * 🛡️ 完全基于UUID角色系统的用户权限管理
 *
 * 🔧 V4.0 UUID角色系统优化内容：
 * ⭐⭐⭐⭐⭐ 核心字段（5个）：
 * - user_id: 核心主键，必需，极高优先级
 * - mobile: 唯一标识+登录，必需，极高优先级
 * - consecutive_fail_count: 保底机制核心，必需，高优先级
 * - history_total_points: 臻选空间解锁，必需，高优先级
 * - nickname: 用户昵称，可选，中优先级
 *
 * 🛡️ 权限管理：通过UUID角色系统实现（role_level >= 100 为管理员）
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

      // ⭐⭐⭐⭐⭐ 外部UUID标识 - 必需，极高优先级（用于QR码，隐私保护）
      user_uuid: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        defaultValue: DataTypes.UUIDV4,
        comment: '用户UUID（用于外部标识和QR码，UUIDv4格式，防止用户ID枚举攻击）'
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

      // 用户昵称 - 可选，中优先级
      nickname: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '用户昵称'
      },

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
      },

      // 🔥 用户等级（多币种风控扩展 - 2026-01-14）
      user_level: {
        type: DataTypes.ENUM('normal', 'vip', 'merchant'),
        allowNull: false,
        defaultValue: 'normal',
        comment: '用户等级（normal-普通用户，vip-VIP用户，merchant-商户）'
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
          unique: true,
          fields: ['user_uuid'],
          name: 'idx_users_user_uuid_unique'
        },
        {
          fields: ['status']
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
    // 🛡️ UUID角色系统关联 - 用户与角色的多对多关系
    User.belongsToMany(models.Role, {
      through: models.UserRole,
      foreignKey: 'user_id',
      otherKey: 'role_id',
      as: 'roles'
    })

    // 用户上传的图片资源
    User.hasMany(models.ImageResources, {
      foreignKey: 'user_id',
      as: 'uploadedImages'
    })

    /**
     * 用户资产系统关联
     *
     * 架构说明：
     * - Account（账户主体）
     * - AccountAssetBalance（账户资产余额）
     * - AssetTransaction（资产流水）
     */

    // 🔥 用户的高级空间状态（一对一关系）
    User.hasOne(models.UserPremiumStatus, {
      foreignKey: 'user_id',
      as: 'premiumStatus',
      comment: '用户高级空间解锁状态（100积分解锁，24小时有效期）'
    })

    /**
     * 当前关联路径：
     * - C2C交易：User → TradeOrder (buyer_user_id / seller_user_id)
     * - 资产变动：User → Account → AssetTransaction
     * - 物品事件：User → ItemInstance → ItemInstanceEvent
     */

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

    // 用户会话
    if (models.AuthenticationSession) {
      User.hasMany(models.AuthenticationSession, {
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

    // VIP等级关联
    if (models.VipLevel) {
      User.belongsTo(models.VipLevel, {
        foreignKey: 'vip_level_id',
        as: 'vipLevel'
      })
    }
  }

  // 🛡️ UUID角色系统方法 - 检查用户是否拥有指定角色
  User.prototype.hasRole = async function (roleName) {
    const userRoles = await this.getRoles({
      where: { is_active: true },
      include: [
        {
          model: sequelize.models.Role,
          where: { role_name: roleName, is_active: true }
        }
      ]
    })
    return userRoles.length > 0
  }

  User.prototype.hasPermission = async function (resource, action = 'read') {
    const userRoles = await this.getRoles({
      where: { is_active: true },
      include: [
        {
          model: sequelize.models.Role,
          where: { is_active: true }
        }
      ]
    })

    for (const userRole of userRoles) {
      const role = userRole.Role

      // 超级管理员拥有所有权限
      if (role.role_level >= 100) return true

      // 检查具体权限
      const permissions = role.permissions || {}
      if (permissions['*'] && permissions['*'].includes('*')) return true
      if (
        permissions[resource] &&
        (permissions[resource].includes(action) || permissions[resource].includes('*'))
      ) {
        return true
      }
    }

    return false
  }

  User.prototype.canAccess = async function (resource) {
    // 检查用户状态
    if (this.status !== 'active') return false

    // 管理员资源需要admin角色
    const adminResources = ['admin', 'statistics', 'management', 'users']
    if (adminResources.includes(resource)) {
      return await this.hasRole('admin')
    }

    // 普通资源只需要活跃状态
    return true
  }

  User.prototype.isActive = function () {
    return this.status === 'active'
  }

  // 🔥 类方法 - 常用查询方法（更新为UUID角色系统）
  User.findByMobile = function (mobile) {
    return this.findOne({
      where: { mobile, status: 'active' }
    })
  }

  // 🔥 根据UUID查找用户（用于QR码验证）
  User.findByUuid = function (userUuid) {
    return this.findOne({
      where: { user_uuid: userUuid, status: 'active' }
    })
  }

  User.findAdmins = function () {
    return this.findAll({
      where: { status: 'active' },
      include: [
        {
          model: sequelize.models.Role,
          as: 'roles',
          where: { role_name: 'admin', is_active: true },
          through: { where: { is_active: true } }
        }
      ]
    })
  }

  User.findActiveUsers = function (limit = 50) {
    return this.findAll({
      where: { status: 'active' },
      order: [['last_login', 'DESC']],
      limit
    })
  }

  // 🛡️ 根据角色查找用户
  User.findByRole = function (roleName, limit = 50) {
    return this.findAll({
      where: { status: 'active' },
      include: [
        {
          model: sequelize.models.Role,
          as: 'roles',
          where: { role_name: roleName, is_active: true },
          through: { where: { is_active: true } }
        }
      ],
      limit
    })
  }

  return User
}
