/**
 * 用户认证会话模型（AuthenticationSession）- V4统一架构版本
 *
 * ⚠️⚠️⚠️ 重要区分说明 ⚠️⚠️⚠️
 * 本模型是 AuthenticationSession（用户认证会话），不是 CustomerServiceSession（客服聊天会话）
 *
 * 📋 AuthenticationSession vs CustomerServiceSession 核心区别：
 *
 * ✅ AuthenticationSession（本模型）：用户认证会话 - 管理JWT Token
 *    - 概念：记录用户的登录认证会话和Token生命周期
 *    - 用途：用户登录验证、Token管理、会话控制、安全管理
 *    - 特点：存储JWT Token、记录登录IP、支持过期和失效管理
 *    - 状态特点：is_active（是否活跃）、expires_at（过期时间）
 *    - 典型字段：session_token（JWT Token）、user_id、user_type、is_active、expires_at
 *    - 表名：authentication_sessions，主键：authentication_session_id
 *
 * ❌ CustomerServiceSession（另一个模型）：客服聊天会话 - 管理用户与客服的对话
 *    - 概念：记录用户与客服之间的聊天对话会话
 *    - 用途：客服系统、用户咨询、在线客服、消息收发
 *    - 特点：包含多条聊天消息（ChatMessage）、有客服分配、有满意度评分
 *    - 状态流转：waiting（等待客服）→ assigned（已分配）→ active（活跃）→ closed（已关闭）
 *    - 典型字段：user_id（咨询用户）、admin_id（接入客服）、status（会话状态）、satisfaction_score（满意度）
 *    - 表名：customer_service_sessions，主键：customer_service_session_id
 *
 * 📌 记忆口诀：
 * - AuthenticationSession = 用户认证会话 = 登录Token = 权限验证 = 用户登录系统
 * - CustomerServiceSession = 客服聊天会话 = 客服对话 = 消息收发 = 用户咨询客服
 *
 * 💡 实际业务示例：
 * - 用户登录系统 → 创建AuthenticationSession（存储Token，验证登录状态）
 * - 用户咨询客服 → 创建CustomerServiceSession（开启聊天对话）
 * - 即：AuthenticationSession管理"是否登录"，CustomerServiceSession管理"聊天对话"
 *
 * 功能说明：
 * - 管理JWT Token的生命周期
 * - 支持会话控制和安全管理
 * - 支持会话延期和失效管理
 * - 记录登录IP和最后活动时间
 *
 * 最后更新：2025-10-12（添加与CustomerSession的详细区分说明）
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const { DataTypes } = require('sequelize')
const logger = require('../utils/logger').logger

module.exports = sequelize => {
  const AuthenticationSession = sequelize.define(
    'AuthenticationSession',
    {
      authentication_session_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键ID'
      },

      session_token: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        comment: '会话令牌（JWT Token的jti）'
      },

      user_type: {
        type: DataTypes.ENUM('user', 'admin'),
        allowNull: false,
        comment: '用户类型'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID'
      },

      login_ip: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: '登录IP'
      },

      login_platform: {
        type: DataTypes.ENUM('web', 'wechat_mp', 'douyin_mp', 'alipay_mp', 'app', 'unknown'),
        allowNull: false,
        defaultValue: 'unknown',
        comment:
          '登录平台：web=浏览器, wechat_mp=微信小程序, douyin_mp=抖音小程序, alipay_mp=支付宝小程序, app=原生App(预留), unknown=旧数据兜底'
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '是否活跃'
      },

      last_activity: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '最后活动时间'
      },

      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '过期时间'
      }
    },
    {
      tableName: 'authentication_sessions',
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['session_token']
        },
        {
          name: 'idx_user_sessions_platform',
          fields: ['user_type', 'user_id', 'login_platform', 'is_active']
        },
        {
          fields: ['expires_at', 'is_active']
        },
        {
          fields: ['last_activity']
        }
      ],
      comment: '用户会话管理表'
    }
  )

  // 实例方法
  AuthenticationSession.prototype.isExpired = function () {
    return BeijingTimeHelper.isExpired(this.expires_at)
  }

  AuthenticationSession.prototype.isValid = function () {
    return this.is_active && !this.isExpired()
  }

  /**
   * 🔄 更新会话活动时间
   * @returns {Promise<AuthenticationSession>} 更新后的会话实例
   */
  AuthenticationSession.prototype.updateActivity = function () {
    return this.update({
      last_activity: new Date() // ✅ 使用 UTC 时间戳，Sequelize 自动转换为北京时间
    })
  }

  AuthenticationSession.prototype.deactivate = function (reason = null) {
    logger.info(`🔒 会话失效: ${this.session_token}, 原因: ${reason || '未指定'}`)
    return this.update({
      is_active: false
    })
  }

  /**
   * ⏰ 延长会话过期时间
   * @param {number} additionalMinutes - 延长的分钟数，默认30分钟
   * @returns {Promise<AuthenticationSession>} 更新后的会话实例
   */
  AuthenticationSession.prototype.extendExpiry = function (additionalMinutes = 30) {
    const newExpiry = BeijingTimeHelper.futureTime(additionalMinutes * 60 * 1000)
    return this.update({
      expires_at: newExpiry,
      last_activity: new Date() // ✅ 使用 UTC 时间戳，Sequelize 自动转换为北京时间
    })
  }

  // 类方法
  /**
   * 🆕 创建新会话
   * @param {Object} sessionData - 会话数据
   * @param {string} sessionData.session_token - 会话令牌
   * @param {string} sessionData.user_type - 用户类型 (user/admin)
   * @param {number} sessionData.user_id - 用户ID
   * @param {string} [sessionData.login_ip] - 登录IP地址
   * @param {string} [sessionData.login_platform='unknown'] - 登录平台（web/wechat_mp/douyin_mp/alipay_mp/app/unknown）
   * @param {number} [sessionData.expires_in_minutes=120] - 过期时间（分钟），默认2小时
   * @param {Object} [options] - Sequelize 选项（支持 transaction）
   * @returns {Promise<AuthenticationSession>} 新创建的会话实例
   */
  AuthenticationSession.createSession = async function (sessionData, options = {}) {
    const {
      session_token,
      user_type,
      user_id,
      login_ip,
      login_platform = 'unknown',
      expires_in_minutes = 120 // 默认2小时
    } = sessionData

    // ✅ futureTime 使用 Date.now()，与 new Date() 时间基准一致
    const expires_at = BeijingTimeHelper.futureTime(expires_in_minutes * 60 * 1000)

    return this.create(
      {
        session_token,
        user_type,
        user_id,
        login_ip,
        login_platform,
        expires_at,
        is_active: true,
        last_activity: new Date() // ✅ 使用 UTC 时间戳，Sequelize 自动转换为北京时间
      },
      options
    )
  }

  AuthenticationSession.findByToken = function (session_token) {
    return this.findOne({
      where: {
        session_token,
        is_active: true
      }
    })
  }

  /**
   * 🔐 查找有效会话（活跃 + 未过期）
   * 使用 new Date() 而不是 createBeijingTime()，因为：
   * - 数据库配置了 timezone: '+08:00'，Sequelize 自动处理时区转换
   * - expires_at 使用 futureTime() (基于 Date.now()) 创建
   * - 比较时必须使用相同的时间基准 (UTC 时间戳)
   * @param {string} session_token - 会话令牌
   * @returns {Promise<AuthenticationSession|null>} 有效会话实例或null
   */
  AuthenticationSession.findValidByToken = function (session_token) {
    return this.findOne({
      where: {
        session_token,
        is_active: true,
        expires_at: {
          [sequelize.Sequelize.Op.gt]: new Date() // ✅ 使用 UTC 时间戳比较
        }
      }
    })
  }

  /**
   * 🔐 查找用户的所有活跃会话
   * @param {string} user_type - 用户类型 (user/admin)
   * @param {number} user_id - 用户ID
   * @returns {Promise<AuthenticationSession[]>} 活跃会话列表（按最后活动时间降序）
   */
  AuthenticationSession.findUserActiveSessions = function (user_type, user_id) {
    return this.findAll({
      where: {
        user_type,
        user_id,
        is_active: true,
        expires_at: {
          [sequelize.Sequelize.Op.gt]: new Date() // ✅ 使用 UTC 时间戳比较
        }
      },
      order: [['last_activity', 'DESC']]
    })
  }

  /**
   * 🔒 批量失效用户会话
   *
   * 多平台会话隔离策略：
   *   - 传入 login_platform 时：仅失效该平台的会话（跨平台共存）
   *   - 不传 login_platform 时：失效所有平台的会话（兼容清理任务、强制登出等场景）
   *
   * @param {string} user_type - 用户类型 (user/admin)
   * @param {number} user_id - 用户ID
   * @param {string|null} [excludeToken=null] - 排除的会话令牌（不失效该 Token 对应的会话）
   * @param {string|null} [login_platform=null] - 登录平台（传入时仅失效该平台会话）
   * @returns {Promise<number>} 被失效的会话数量
   */
  /**
   * @param {string} user_type - 用户类型 (user/admin)
   * @param {number} user_id - 用户ID
   * @param {string|null} [excludeToken=null] - 排除的会话令牌
   * @param {string|null} [login_platform=null] - 登录平台
   * @param {Object} [options] - Sequelize 选项（支持 transaction）
   * @returns {Promise<number>} 被失效的会话数量
   */
  AuthenticationSession.deactivateUserSessions = async function (
    user_type,
    user_id,
    excludeToken = null,
    login_platform = null,
    options = {}
  ) {
    const whereCondition = {
      user_type,
      user_id,
      is_active: true
    }

    if (excludeToken) {
      whereCondition.session_token = {
        [sequelize.Sequelize.Op.ne]: excludeToken
      }
    }

    if (login_platform) {
      whereCondition.login_platform = login_platform
    }

    const affectedCount = await this.update(
      { is_active: false },
      { where: whereCondition, ...options }
    )

    const platformInfo = login_platform ? `:${login_platform}` : '(全平台)'
    logger.info(`🔒 已失效 ${affectedCount[0]} 个用户会话: ${user_type}:${user_id}${platformInfo}`)
    return affectedCount[0]
  }

  /**
   * 🗑️ 清理过期会话
   * @returns {Promise<number>} 删除的会话数量
   */
  AuthenticationSession.cleanupExpiredSessions = async function () {
    const deletedCount = await this.destroy({
      where: {
        expires_at: {
          [sequelize.Sequelize.Op.lt]: new Date() // ✅ 使用 UTC 时间戳比较
        }
      }
    })

    logger.info(`🗑️ 清理过期会话: ${deletedCount} 个`)
    return deletedCount
  }

  /**
   * 📊 获取活跃会话统计信息
   * @returns {Promise<Object>} 按用户类型分组的统计数据
   */
  AuthenticationSession.getActiveSessionStats = async function () {
    const stats = await this.findAll({
      where: {
        is_active: true,
        expires_at: {
          [sequelize.Sequelize.Op.gt]: new Date() // ✅ 使用 UTC 时间戳比较
        }
      },
      attributes: [
        'user_type',
        [sequelize.fn('COUNT', '*'), 'active_sessions'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('user_id'))), 'unique_users']
      ],
      group: ['user_type']
    })

    return stats.reduce((acc, stat) => {
      acc[stat.user_type] = {
        active_sessions: parseInt(stat.dataValues.active_sessions),
        unique_users: parseInt(stat.dataValues.unique_users)
      }
      return acc
    }, {})
  }

  // 关联关系
  AuthenticationSession.associate = function (models) {
    /*
     * 关联用户表（统一关联，不区分user_type）
     *
     * 🔴 注意：不使用 scope 限制 user_type
     *    - user_type 是 authentication_sessions 表的字段，不是 users 表的字段
     *    - 如需按 user_type 区分，应在查询时手动添加条件
     *
     * V4.0简化权限：所有会话都关联到 users 表
     * 管理员/用户身份通过 user_type 字段和 roles 表区分
     */
    AuthenticationSession.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      constraints: false
    })
  }

  return AuthenticationSession
}
