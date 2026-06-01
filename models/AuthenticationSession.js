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
const { VALID_PLATFORMS } = require('../utils/platformDetector')

/** 落库允许的平台白名单（前端可声明的平台 + unknown 兜底），用于堵住空串等非法值入库 */
const PLATFORM_WHITELIST = new Set([...VALID_PLATFORMS, 'unknown'])

module.exports = sequelize => {
  const AuthenticationSession = sequelize.define(
    'AuthenticationSession',
    {
      authentication_session_id: {
        // 真实库主键为 BIGINT（实测），模型与库对齐，避免大表自增溢出
        type: DataTypes.BIGINT,
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

      device_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '设备标识（前端生成的UUID）。NULL=未知设备(legacy存量数据)。设备级多会话隔离key'
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
          // 设备级多会话隔离索引：支持"某用户某设备活跃会话"查找/替换/踢设备
          name: 'idx_user_device',
          fields: ['user_type', 'user_id', 'device_id', 'is_active']
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
   * @param {string} [sessionData.device_id] - 设备标识（前端生成的UUID）。缺失则为 NULL（未知设备）
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
      device_id = null,
      expires_in_minutes = 120 // 默认2小时
    } = sessionData

    // 平台白名单兜底：非法值（如空串）统一落库为 unknown，从机制上堵住"僵尸会话"
    const safePlatform = PLATFORM_WHITELIST.has(login_platform) ? login_platform : 'unknown'

    // ✅ futureTime 使用 Date.now()，与 new Date() 时间基准一致
    const expires_at = BeijingTimeHelper.futureTime(expires_in_minutes * 60 * 1000)

    return this.create(
      {
        session_token,
        user_type,
        user_id,
        login_ip,
        login_platform: safePlatform,
        device_id,
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
   * 🔒 批量失效用户的全部活跃会话
   *
   * 设备级多会话语义下，本方法用于"失效该用户某 user_type 下的所有会话"，
   * 典型场景：管理员强制登出某用户全部设备、账号封禁、强制清理。
   * （平台维度互斥已废弃；按设备替换走 deactivateDeviceSessions。）
   *
   * @param {string} user_type - 用户类型 (user/admin)
   * @param {number} user_id - 用户ID
   * @param {string|null} [excludeToken=null] - 排除的会话令牌（不失效该 Token 对应的会话）
   * @param {Object} [options] - Sequelize 选项（支持 transaction）
   * @returns {Promise<number>} 被失效的会话数量
   */
  AuthenticationSession.deactivateUserSessions = async function (
    user_type,
    user_id,
    excludeToken = null,
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

    const affectedCount = await this.update(
      { is_active: false },
      { where: whereCondition, ...options }
    )

    logger.info(`🔒 已失效 ${affectedCount[0]} 个用户会话: ${user_type}:${user_id}(全部)`)
    return affectedCount[0]
  }

  /**
   * 🔒 失效"同一用户同一设备"的旧活跃会话（设备级登录替换）
   *
   * 设备级多会话隔离的核心：同 device_id 再次登录 = 替换自己这台设备的旧会话（token 轮换），
   * 不同 device_id = 新会话并存，不互踢。device_id 为空（legacy）时不做替换，避免误伤存量。
   *
   * @param {string} user_type - 用户类型 (user/admin)
   * @param {number} user_id - 用户ID
   * @param {string|null} device_id - 设备标识（为空则不替换，直接返回0）
   * @param {string|null} [excludeToken=null] - 排除的会话令牌（保留新建会话）
   * @param {Object} [options] - Sequelize 选项（支持 transaction）
   * @returns {Promise<number>} 被失效的会话数量
   */
  AuthenticationSession.deactivateDeviceSessions = async function (
    user_type,
    user_id,
    device_id,
    excludeToken = null,
    options = {}
  ) {
    // device_id 为空时不替换（legacy 设备无法精确定位，避免误伤）
    if (!device_id) {
      return 0
    }

    const whereCondition = {
      user_type,
      user_id,
      device_id,
      is_active: true
    }

    if (excludeToken) {
      whereCondition.session_token = {
        [sequelize.Sequelize.Op.ne]: excludeToken
      }
    }

    const affectedCount = await this.update(
      { is_active: false },
      { where: whereCondition, ...options }
    )

    logger.info(
      `🔒 已失效 ${affectedCount[0]} 个同设备旧会话: ${user_type}:${user_id} device=${device_id}`
    )
    return affectedCount[0]
  }

  /**
   * 🔐 查找单个用户在指定设备上的活跃会话
   *
   * @param {string} user_type - 用户类型 (user/admin)
   * @param {number} user_id - 用户ID
   * @param {string} device_id - 设备标识
   * @returns {Promise<AuthenticationSession|null>} 活跃会话或null
   */
  AuthenticationSession.findActiveByDevice = function (user_type, user_id, device_id) {
    if (!device_id) {
      return Promise.resolve(null)
    }
    return this.findOne({
      where: {
        user_type,
        user_id,
        device_id,
        is_active: true,
        expires_at: {
          [sequelize.Sequelize.Op.gt]: new Date()
        }
      },
      order: [['last_activity', 'DESC']]
    })
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

  /**
   * 📊 获取活跃会话的"设备维度"统计（设备级多会话）
   *
   * 与 getActiveSessionStats（按 user_type 维度）互补，统计活跃且未过期会话中：
   * - total_devices：去重后的真实设备数（device_id 非空，按 user_type+user_id+device_id 去重）
   * - legacy_sessions：device_id 为 NULL 的存量会话数（旧客户端/未带 X-Device-Id）
   * - multi_device_users：拥有 >1 台真实设备的用户数（盗号/工作室异常的观测信号，对齐决策B软上限思路）
   *
   * @returns {Promise<Object>} { total_devices, legacy_sessions, multi_device_users }
   */
  AuthenticationSession.getActiveDeviceStats = async function () {
    const Sequelize = sequelize.Sequelize
    const activeWhere = {
      is_active: true,
      expires_at: { [Sequelize.Op.gt]: new Date() }
    }

    // 去重真实设备数：DISTINCT (user_type, user_id, device_id)，仅统计 device_id 非空
    const [deviceRows] = await sequelize.query(
      `SELECT COUNT(DISTINCT user_type, user_id, device_id) AS total_devices
       FROM authentication_sessions
       WHERE is_active = 1 AND expires_at > NOW() AND device_id IS NOT NULL`
    )
    const totalDevices = parseInt(deviceRows?.[0]?.total_devices || 0, 10)

    // 存量 legacy 会话数（device_id 为 NULL）
    const legacySessions = await this.count({
      where: { ...activeWhere, device_id: { [Sequelize.Op.is]: null } }
    })

    // 多设备用户数：同一 (user_type,user_id) 下去重设备数 > 1 的用户个数
    const [multiRows] = await sequelize.query(
      `SELECT COUNT(*) AS multi_device_users FROM (
         SELECT user_type, user_id
         FROM authentication_sessions
         WHERE is_active = 1 AND expires_at > NOW() AND device_id IS NOT NULL
         GROUP BY user_type, user_id
         HAVING COUNT(DISTINCT device_id) > 1
       ) AS t`
    )
    const multiDeviceUsers = parseInt(multiRows?.[0]?.multi_device_users || 0, 10)

    return {
      total_devices: totalDevices,
      legacy_sessions: legacySessions,
      multi_device_users: multiDeviceUsers
    }
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
