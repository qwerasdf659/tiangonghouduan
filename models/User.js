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
const PiiCrypto = require('../utils/PiiCrypto')

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
      /* 🔐 PII 加密改造（模块B）：mobile 改为虚拟字段，密文存 mobile_encrypted，盲索引存 mobile_hash */
      mobile: {
        type: DataTypes.VIRTUAL(DataTypes.STRING, ['mobile_encrypted']),
        /**
         * 读取手机号明文：优先解密 mobile_encrypted；过渡期兼容残留明文
         * @returns {string|null} 手机号明文
         */
        get() {
          const enc = this.getDataValue('mobile_encrypted')
          if (enc) {
            return PiiCrypto.decrypt(enc)
          }
          return null
        },
        /**
         * 设置手机号：同时写入密文 mobile_encrypted 与盲索引 mobile_hash
         * @param {string} value - 手机号明文
         * @returns {void}
         */
        set(value) {
          if (value === null || value === undefined || value === '') {
            this.setDataValue('mobile_encrypted', null)
            this.setDataValue('mobile_hash', null)
            this.setDataValue('mobile_prefix_hash', null)
            this.setDataValue('mobile_suffix_hash', null)
            return
          }
          this.setDataValue('mobile_encrypted', PiiCrypto.encrypt(value))
          this.setDataValue('mobile_hash', PiiCrypto.blindHash(value))
          // 方案二完整版：同步号段(前3)/尾号(后4)盲索引，支持管理端按号段/尾号搜
          this.setDataValue('mobile_prefix_hash', PiiCrypto.prefixHash(value, 3))
          this.setDataValue('mobile_suffix_hash', PiiCrypto.suffixHash(value, 4))
        },
        comment: '手机号（虚拟字段：读时解密 mobile_encrypted，写时同步密文+盲索引）'
      },

      // 🔐 手机号密文列（AES-256-GCM）
      mobile_encrypted: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '手机号密文（AES-256-GCM，格式 v1:iv:tag:cipher）'
      },

      // 🔐 手机号盲索引列（HMAC-SHA256，唯一约束/登录/判重）
      mobile_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        unique: true,
        comment: '手机号盲索引（HMAC-SHA256），不可逆，用于唯一性与等值查询'
      },

      // 🔐 手机号号段盲索引（前3位，管理端按号段搜，非唯一）
      mobile_prefix_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '手机号前3位号段盲索引（HMAC-SHA256），管理端按号段搜，非唯一'
      },

      // 🔐 手机号尾号盲索引（后4位，管理端按尾号搜，非唯一）
      mobile_suffix_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '手机号后4位尾号盲索引（HMAC-SHA256），管理端按尾号搜，非唯一'
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

      // 用户头像URL - 可选，中优先级（V4.7.0 新增）
      avatar_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        defaultValue: null,
        comment: '用户头像URL（微信头像或自定义头像）'
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

      // 🔐 PII 流程合规：隐私政策/用户协议首次同意时间戳
      privacy_consent_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '隐私政策/用户协议首次同意时间（北京时间，NULL=未记录）'
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
      },

      /*
       * 🔥 用户最后活跃时间（P1级警告修复 - 2026-01-28）
       * 用于用户分群规则（segment_rules.js v4 版本）区分活跃度
       */
      last_active_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '用户最后活跃时间（登录、抽奖等操作时更新，用于用户分群）'
      },

      /**
       * 微信小程序 openid（7.20 拍板：微信静默登录）
       * wx.login → code → 后端调 jscode2session → 获取 openid
       * 首次绑定后，后续打开小程序可直接静默登录，无需再输手机号
       */
      wx_openid: {
        type: DataTypes.STRING(64),
        allowNull: true,
        unique: true,
        defaultValue: null,
        comment: '微信小程序 openid，用于静默登录'
      }
    },
    {
      tableName: 'users',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      hooks: {
        /**
         * 🔐 PII 透明查询：将 where.mobile 等值查询自动改写为盲索引 where.mobile_hash
         *
         * mobile 是加密虚拟字段（存 mobile_encrypted），无法直接 WHERE。
         * 本钩子让既有 `where: { mobile }` 写法透明走盲索引，模型自洽地维护"明文查询→密文存储"映射，
         * 属模型对自身存储的封装（非前后端字段映射），保证全项目按手机号等值查询正确工作。
         * 仅支持等值（字符串）与 IN（数组）；不支持模糊匹配（盲索引设计取舍）。
         *
         * @param {Object} options - Sequelize 查询选项
         * @returns {void}
         */
        beforeFind(options) {
          if (!options || !options.where) return
          const where = options.where
          if (Object.prototype.hasOwnProperty.call(where, 'mobile')) {
            const val = where.mobile
            const PiiCryptoLocal = require('../utils/PiiCrypto')
            if (typeof val === 'string') {
              where.mobile_hash = PiiCryptoLocal.blindHash(val)
              delete where.mobile
            } else if (Array.isArray(val)) {
              where.mobile_hash = val.map(v => PiiCryptoLocal.blindHash(v))
              delete where.mobile
            }
            // 其他形态（如 Op 模糊匹配）不改写：盲索引不支持，交由调用方显式处理
          }
        }
      },
      indexes: [
        {
          unique: true,
          fields: ['mobile_hash'],
          name: 'uk_users_mobile_hash'
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
     * - 交易市场交易：User → TradeOrder (buyer_user_id / seller_user_id)
     * - 资产变动：User → Account → AssetTransaction
     * - 物品事件：User → Item → ItemLedger
     */

    // 🔥 用户的抽奖记录（LotteryRecord已合并到LotteryDraw）
    if (models.LotteryDraw) {
      User.hasMany(models.LotteryDraw, {
        foreignKey: 'user_id',
        as: 'lotteryDraws',
        comment: '用户抽奖记录（合并版）'
      })
    }

    // 用户会话
    if (models.AuthenticationSession) {
      User.hasMany(models.AuthenticationSession, {
        foreignKey: 'user_id',
        as: 'sessions'
      })
    }
  }

  /**
   * 🛡️ UUID角色系统方法 - 检查用户是否拥有指定角色
   * 🔧 2026-01-19 修复：移除错误的 include，getRoles() 已返回 Role 实例
   * @param {string} roleName - 角色名称
   * @returns {Promise<boolean>} 是否拥有指定角色
   */
  User.prototype.hasRole = async function (roleName) {
    const roles = await this.getRoles({
      where: { role_name: roleName, is_active: true },
      through: { where: { is_active: true } }
    })
    return roles.length > 0
  }

  /**
   * 🛡️ UUID角色系统方法 - 检查用户是否拥有指定资源的权限
   * 🔧 2026-01-19 修复：移除错误的 include，getRoles() 已返回 Role 实例
   * @param {string} resource - 资源名称（如 lottery、user 等）
   * @param {string} [action='read'] - 操作类型（read、write、delete 等）
   * @returns {Promise<boolean>} 是否拥有权限
   */
  User.prototype.hasPermission = async function (resource, action = 'read') {
    const roles = await this.getRoles({
      where: { is_active: true },
      through: { where: { is_active: true } }
    })

    for (const role of roles) {
      // 超级管理员拥有所有权限（role_level >= 100）
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
  /* 🔐 PII 改造：按手机号查询统一走盲索引 mobile_hash（明文不落库查询条件） */
  User.findByMobile = function (mobile) {
    return this.findOne({
      where: { mobile_hash: PiiCrypto.blindHash(mobile), status: 'active' }
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
