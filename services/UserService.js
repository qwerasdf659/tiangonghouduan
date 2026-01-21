/**
 * 餐厅积分抽奖系统 V4.0 - 用户服务（UserService）
 *
 * 业务场景：管理用户注册、角色分配、积分账户初始化等核心用户业务
 *
 * 核心功能：
 * 1. 用户注册（创建用户 + 积分账户 + 角色分配，事务保护）
 * 2. 用户信息查询和更新
 * 3. 用户状态管理（激活、禁用、删除）
 *
 * 设计原则：
 * - **事务安全保障**：所有写操作支持外部事务传入，确保原子性
 * - **业务规则集中**：用户注册流程的所有步骤集中在Service层
 * - **依赖服务协调**：协调 AssetService、UserRoleService 等服务
 *
 * 事务边界治理（2026-01-05 决策）：
 * - 所有写操作 **强制要求** 外部事务传入（options.transaction）
 * - 未提供事务时直接报错（使用 assertAndGetTransaction）
 * - 服务层禁止自建事务，由入口层统一使用 TransactionManager.execute()
 *
 * 创建时间：2025年12月09日
 * 最后更新：2026年01月05日（事务边界治理改造）
 */

const { User, Role, UserRole } = require('../models')
const AssetService = require('./AssetService')
const BeijingTimeHelper = require('../utils/timeHelper')
const logger = require('../utils/logger')
const { BusinessCacheHelper } = require('../utils/BusinessCacheHelper')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')

// 引用中文显示名称辅助函数（V4.7 中文化显示名称系统 - 2026-01-22）
const { attachDisplayNames, DICT_TYPES } = require('../utils/displayNameHelper')

/**
 * 用户服务类
 */
class UserService {
  /**
   * 注册新用户（完整流程：创建用户 + 积分账户 + 角色分配）
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {string} mobile - 手机号
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - 外部事务对象（必填）
   * @param {string} options.nickname - 用户昵称（可选，默认"用户+后4位"）
   * @param {string} options.status - 账户状态（可选，默认"active"）
   * @returns {Object} 创建的用户对象
   * @throws {Error} 业务错误（手机号已存在、角色不存在等）
   */
  static async registerUser(mobile, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'UserService.registerUser')

    const { nickname, status = 'active' } = options

    // 步骤1: 检查手机号是否已存在
    const existingUser = await User.findOne({
      where: { mobile },
      transaction
    })

    if (existingUser) {
      const error = new Error('该手机号已注册')
      error.code = 'MOBILE_EXISTS'
      error.statusCode = 400
      error.data = { user_id: existingUser.user_id }
      throw error
    }

    // 步骤2: 创建用户账户
    const user = await User.create(
      {
        mobile,
        nickname: nickname || `用户${mobile.slice(-4)}`,
        status,
        consecutive_fail_count: 0,
        history_total_points: 0,
        login_count: 0
      },
      { transaction }
    )

    logger.info('用户注册成功', {
      user_id: user.user_id,
      mobile: mobile.substring(0, 3) + '****' + mobile.substring(7)
    })

    // 步骤3: 创建资产账户（AssetService 会自动创建关联的余额记录）
    await AssetService.getOrCreateAccount({ user_id: user.user_id }, { transaction })

    logger.info('用户资产账户创建成功', { user_id: user.user_id })

    // 步骤4: 分配普通用户角色
    const userRole = await Role.findOne({
      where: { role_name: 'user' },
      transaction
    })

    if (userRole) {
      // 检查角色是否已分配（避免重复分配）
      const existingUserRole = await UserRole.findOne({
        where: {
          user_id: user.user_id,
          role_id: userRole.role_id
        },
        transaction
      })

      if (!existingUserRole) {
        await UserRole.create(
          {
            user_id: user.user_id,
            role_id: userRole.role_id,
            is_active: true,
            assigned_at: BeijingTimeHelper.createBeijingTime()
          },
          { transaction }
        )
        logger.info('用户角色分配成功', { user_id: user.user_id, role: 'user' })
      }
    } else {
      logger.warn('普通用户角色不存在，无法分配角色', { user_id: user.user_id })
    }

    logger.info('用户注册流程完成', {
      user_id: user.user_id,
      mobile: mobile.substring(0, 3) + '****' + mobile.substring(7)
    })

    return user
  }

  /**
   * 根据手机号查找用户
   *
   * @description 支持 Redis 缓存（P2 缓存优化），提升登录场景性能
   *
   * @param {string} mobile - 手机号
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - 外部事务对象（可选）
   * @param {boolean} options.useCache - 是否使用缓存（默认 true，事务场景自动禁用）
   * @returns {Object|null} 用户对象或null
   */
  static async findByMobile(mobile, options = {}) {
    const { transaction, useCache = true } = options

    // 事务场景下禁用缓存（确保数据一致性）
    const shouldUseCache = useCache && !transaction

    try {
      // ========== Redis 缓存读取（2026-01-03 P2 缓存优化）==========
      if (shouldUseCache) {
        const cached = await BusinessCacheHelper.getUserByMobile(mobile)
        if (cached) {
          logger.debug('[用户服务] 缓存命中', {
            mobile: mobile.substring(0, 3) + '****' + mobile.substring(7)
          })
          // 返回普通对象（与数据库查询结果结构一致）
          return cached
        }
      }

      const user = await User.findOne({
        where: { mobile },
        transaction
      })

      // ========== 写入 Redis 缓存（120s TTL）==========
      if (shouldUseCache && user) {
        // 转换为普通对象（Sequelize 实例不可序列化）
        const userData = user.get({ plain: true })
        await BusinessCacheHelper.setUserByMobile(mobile, userData)
        // 同时按 ID 维度缓存（双向索引，提升后续查询效率）
        await BusinessCacheHelper.setUserById(user.user_id, userData)
      }

      return user
    } catch (error) {
      logger.error('查找用户失败', {
        mobile: mobile.substring(0, 3) + '****' + mobile.substring(7),
        error: error.message
      })

      const wrappedError = new Error('查找用户失败')
      wrappedError.code = 'USER_FIND_FAILED'
      wrappedError.statusCode = 500
      throw wrappedError
    }
  }

  /**
   * 更新用户登录统计
   *
   * @description 更新后自动失效用户缓存（P2 缓存优化）
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - 外部事务对象（可选）
   * @returns {Object} 更新后的用户对象
   */
  static async updateLoginStats(user_id, options = {}) {
    const { transaction } = options

    try {
      const user = await User.findByPk(user_id, { transaction })

      if (!user) {
        const error = new Error('用户不存在')
        error.code = 'USER_NOT_FOUND'
        error.statusCode = 404
        throw error
      }

      await user.update(
        {
          last_login: BeijingTimeHelper.createBeijingTime(),
          login_count: (user.login_count || 0) + 1
        },
        { transaction }
      )

      // ========== 失效用户缓存（登录统计已更新）==========
      await BusinessCacheHelper.invalidateUser(
        { user_id, mobile: user.mobile },
        'login_stats_updated'
      )

      return user
    } catch (error) {
      logger.error('更新登录统计失败', {
        user_id,
        error: error.message
      })

      if (error.code) {
        throw error
      }

      const wrappedError = new Error('更新登录统计失败')
      wrappedError.code = 'UPDATE_LOGIN_STATS_FAILED'
      wrappedError.statusCode = 500
      throw wrappedError
    }
  }

  /**
   * 根据用户ID查找用户
   *
   * @description 支持 Redis 缓存（P2 缓存优化），提升认证后场景性能
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - 外部事务对象（可选）
   * @param {boolean} options.useCache - 是否使用缓存（默认 true，事务场景自动禁用）
   * @returns {Object|null} 用户对象或null
   * @throws {Error} 业务错误（用户不存在等）
   */
  static async getUserById(user_id, options = {}) {
    const { transaction, useCache = true } = options

    // 事务场景下禁用缓存（确保数据一致性）
    const shouldUseCache = useCache && !transaction

    try {
      // ========== Redis 缓存读取（2026-01-03 P2 缓存优化）==========
      if (shouldUseCache) {
        const cached = await BusinessCacheHelper.getUserById(user_id)
        if (cached) {
          logger.debug('[用户服务] ID 缓存命中', { user_id })
          return cached
        }
      }

      const user = await User.findByPk(user_id, { transaction })

      if (!user) {
        const error = new Error('用户不存在')
        error.code = 'USER_NOT_FOUND'
        error.statusCode = 404
        throw error
      }

      // ========== 写入 Redis 缓存（120s TTL）==========
      if (shouldUseCache) {
        const userData = user.get({ plain: true })
        await BusinessCacheHelper.setUserById(user_id, userData)
        // 同时按手机号维度缓存
        if (user.mobile) {
          await BusinessCacheHelper.setUserByMobile(user.mobile, userData)
        }
      }

      return user
    } catch (error) {
      logger.error('查找用户失败', {
        user_id,
        error: error.message
      })

      if (error.code) {
        throw error
      }

      const wrappedError = new Error('查找用户失败')
      wrappedError.code = 'USER_FIND_FAILED'
      wrappedError.statusCode = 500
      throw wrappedError
    }
  }

  /**
   * 获取用户信息（含状态验证）- 用于认证路由
   *
   * @description 支持 Redis 缓存（决策10 P0 优化），提升认证链路性能
   *              每次请求只查一次 users 表，缓存命中率目标 >85%
   *
   * 决策依据（2026-01-06 Redis缓存策略报告）：
   * - 准则1：认证接口 QPS 高 + 结果重复度高 → 必须上缓存
   * - 决策10 A+B 方案：登录禁缓存（findByMobile useCache:false）+ 其他走缓存
   * - TTL = 120s（DEFAULT_TTL.USER）
   * - 注意：当传入自定义 attributes 时禁用缓存（避免缓存不完整数据）
   *
   * @param {number} userId - 用户ID
   * @param {Object} options - 选项参数
   * @param {Array<string>} options.attributes - 需要返回的字段列表（可选）
   * @param {boolean} options.checkStatus - 是否检查用户状态（默认 true）
   * @param {boolean} options.useCache - 是否使用缓存（默认 true，事务场景自动禁用）
   * @param {Object} options.transaction - 外部事务对象（可选）
   * @returns {Object} 用户对象
   * @throws {Error} 业务错误（用户不存在、账户已被禁用等）
   */
  static async getUserWithValidation(userId, options = {}) {
    const { attributes, checkStatus = true, useCache = true, transaction } = options

    /*
     * 缓存策略（决策10 P0 认证链路优化）：
     * - 事务场景禁用缓存（确保数据一致性）
     * - 自定义属性场景禁用缓存（避免缓存不完整数据污染后续请求）
     */
    const shouldUseCache = useCache && !transaction && !attributes

    try {
      // ========== Redis 缓存读取（决策10 P0 认证链路优化）==========
      if (shouldUseCache) {
        const cached = await BusinessCacheHelper.getUserById(userId)
        if (cached) {
          logger.debug('[用户服务] getUserWithValidation 缓存命中', { user_id: userId })

          // 缓存命中后检查用户状态（状态变更时会失效缓存，所以缓存数据可信）
          if (checkStatus && cached.status !== 'active') {
            logger.warn('用户账户状态异常（缓存）', {
              user_id: userId,
              status: cached.status
            })

            const error = new Error('用户账户已被禁用')
            error.code = 'USER_INACTIVE'
            error.statusCode = 403
            throw error
          }

          // 添加中文显示名称（V4.7 中文化显示名称系统 - 2026-01-22）
          await attachDisplayNames(cached, [
            { field: 'status', dictType: DICT_TYPES.USER_STATUS },
            { field: 'user_level', dictType: DICT_TYPES.USER_LEVEL }
          ])

          // 返回缓存数据（普通对象）
          return cached
        }
      }

      /*
       * 缓存未命中，查库
       * 默认返回字段（用户视图）
       */
      const defaultAttributes = [
        'user_id',
        'mobile',
        'nickname',
        'status',
        'history_total_points',
        'created_at',
        'last_login',
        'login_count',
        'consecutive_fail_count'
      ]

      const user = await User.findByPk(userId, {
        attributes: attributes || defaultAttributes,
        transaction
      })

      if (!user) {
        const error = new Error('用户不存在')
        error.code = 'USER_NOT_FOUND'
        error.statusCode = 404
        throw error
      }

      // 检查用户状态
      if (checkStatus && user.status !== 'active') {
        logger.warn('用户账户状态异常', {
          user_id: userId,
          status: user.status
        })

        const error = new Error('用户账户已被禁用')
        error.code = 'USER_INACTIVE'
        error.statusCode = 403
        throw error
      }

      // ========== 写入 Redis 缓存（120s TTL）==========
      if (shouldUseCache) {
        const userData = user.get({ plain: true })
        await BusinessCacheHelper.setUserById(userId, userData)
        // 同时按手机号维度缓存（双向索引）
        if (user.mobile) {
          await BusinessCacheHelper.setUserByMobile(user.mobile, userData)
        }
        logger.debug('[用户服务] getUserWithValidation 缓存写入', { user_id: userId })
      }

      /*
       * 统一返回普通对象（与缓存命中时保持一致）
       * 避免路由层通过 Sequelize getter 访问属性时返回 undefined
       */
      const userData = user.get({ plain: true })

      // 添加中文显示名称（V4.7 中文化显示名称系统 - 2026-01-22）
      await attachDisplayNames(userData, [
        { field: 'status', dictType: DICT_TYPES.USER_STATUS },
        { field: 'user_level', dictType: DICT_TYPES.USER_LEVEL }
      ])

      return userData
    } catch (error) {
      // 如果是业务错误，直接抛出
      if (error.code) {
        throw error
      }

      // 其他错误包装后抛出
      logger.error('获取用户信息失败', {
        user_id: userId,
        error: error.message,
        stack: error.stack
      })

      const wrappedError = new Error('获取用户信息失败')
      wrappedError.code = 'USER_GET_FAILED'
      wrappedError.statusCode = 500
      wrappedError.originalError = error
      throw wrappedError
    }
  }

  /**
   * 管理员登录（含权限验证）- 用于管理员认证路由
   *
   * @param {string} mobile - 手机号
   * @param {string} verificationCode - 验证码
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - 外部事务对象（可选）
   * @returns {Object} 包含用户和角色信息的对象
   * @throws {Error} 业务错误（验证码错误、用户不存在、权限不足等）
   */
  static async adminLogin(mobile, verificationCode, options = {}) {
    const { transaction } = options

    try {
      // 步骤1: 验证码校验
      if (!verificationCode || verificationCode.trim() === '') {
        const error = new Error('验证码不能为空')
        error.code = 'VERIFICATION_CODE_REQUIRED'
        error.statusCode = 400
        throw error
      }

      // 开发环境万能验证码
      if (process.env.NODE_ENV === 'development') {
        if (verificationCode !== '123456') {
          const error = new Error('验证码错误（开发环境使用123456）')
          error.code = 'INVALID_VERIFICATION_CODE'
          error.statusCode = 400
          throw error
        }
      } else {
        // 生产环境验证码验证（待实现）
        const error = new Error('生产环境验证码验证未实现')
        error.code = 'VERIFICATION_NOT_IMPLEMENTED'
        error.statusCode = 501
        throw error
      }

      // 步骤2: 查找用户（复用现有方法）
      const user = await this.findByMobile(mobile, { transaction })

      if (!user) {
        const error = new Error('用户不存在')
        error.code = 'USER_NOT_FOUND'
        error.statusCode = 404
        throw error
      }

      // 步骤3: 检查用户状态
      if (user.status !== 'active') {
        logger.warn('用户账户状态异常', {
          user_id: user.user_id,
          status: user.status,
          mobile: mobile.substring(0, 3) + '****' + mobile.substring(7)
        })

        const error = new Error('用户账户已被禁用')
        error.code = 'USER_INACTIVE'
        error.statusCode = 403
        throw error
      }

      // 步骤4: 管理员权限检查（role_level >= 100 为管理员）
      const { getUserRoles } = require('../middleware/auth')
      const userRoles = await getUserRoles(user.user_id)

      if (userRoles.role_level < 100) {
        logger.warn('用户不具备管理员权限', {
          user_id: user.user_id,
          role_level: userRoles.role_level,
          mobile: mobile.substring(0, 3) + '****' + mobile.substring(7)
        })

        const error = new Error('用户不具备管理员权限')
        error.code = 'INSUFFICIENT_PERMISSION'
        error.statusCode = 403
        throw error
      }

      // 步骤5: 更新登录统计（复用现有方法）
      await this.updateLoginStats(user.user_id, { transaction })

      logger.info('管理员登录成功', {
        user_id: user.user_id,
        mobile: mobile.substring(0, 3) + '****' + mobile.substring(7),
        role_level: userRoles.role_level
      })

      return {
        user,
        roles: userRoles
      }
    } catch (error) {
      // 如果是业务错误，直接抛出
      if (error.code) {
        throw error
      }

      // 其他错误包装后抛出
      logger.error('管理员登录失败', {
        mobile: mobile.substring(0, 3) + '****' + mobile.substring(7),
        error: error.message,
        stack: error.stack
      })

      const wrappedError = new Error('登录失败')
      wrappedError.code = 'LOGIN_FAILED'
      wrappedError.statusCode = 500
      wrappedError.originalError = error
      throw wrappedError
    }
  }

  /**
   * 获取用户并检查积分账户（用于抽奖等业务场景）
   *
   * 业务场景：抽奖等业务需要同时验证用户存在性和积分账户状态
   *
   * @param {number} userId - 用户ID
   * @param {Object} options - 选项参数
   * @param {boolean} options.checkPointsAccount - 是否检查积分账户（默认true）
   * @param {boolean} options.checkStatus - 是否检查用户状态（默认true）
   * @param {Object} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} 包含用户信息和积分账户信息的对象
   * @throws {Error} 用户不存在、用户被禁用、积分账户不存在、积分账户被冻结
   */
  static async getUserWithPoints(userId, options = {}) {
    const { checkPointsAccount = true, checkStatus = true, transaction = null } = options

    try {
      // 步骤1：验证用户存在性
      const user = await User.findByPk(userId, {
        attributes: ['user_id', 'mobile', 'nickname', 'status'],
        transaction
      })

      if (!user) {
        const error = new Error('用户不存在')
        error.code = 'USER_NOT_FOUND'
        error.statusCode = 404
        error.data = { user_id: userId }
        throw error
      }

      // 步骤2：检查用户状态
      if (checkStatus && user.status !== 'active') {
        const error = new Error('用户账户已被禁用')
        error.code = 'USER_INACTIVE'
        error.statusCode = 403
        error.data = { user_id: userId, status: user.status }
        throw error
      }

      /**
       * 步骤3：获取积分账户（如果需要）
       * V4.6决策G：首次查询积分就自动创建账户
       * - 使用 getOrCreateAccount + getOrCreateBalance 自动创建
       * - 账户不存在时返回 available_points: 0（0正常态）
       * - 账户冻结时抛出 403 错误（决策H）
       */
      let pointsAccount = null
      if (checkPointsAccount) {
        const AssetService = require('./AssetService')
        try {
          // 获取或创建用户资产账户（决策G：自动创建）
          const account = await AssetService.getOrCreateAccount(
            { user_id: userId },
            { transaction }
          )

          // 获取或创建 POINTS 余额记录（决策G：自动创建）
          const balance = await AssetService.getOrCreateBalance(account.account_id, 'POINTS', {
            transaction
          })

          // 决策H：账户冻结时返回 403
          if (account.status !== 'active') {
            const error = new Error('积分账户已被冻结，请联系客服')
            error.code = 'ACCOUNT_FROZEN'
            error.statusCode = 403
            error.data = {
              user_id: userId,
              account_status: account.status,
              message: '您的积分账户已被冻结，如有疑问请联系客服'
            }
            throw error
          }

          pointsAccount = {
            account_id: account.account_id,
            user_id: userId,
            available_points: Number(balance.available_amount) || 0,
            frozen_points: Number(balance.frozen_amount) || 0,
            total_points:
              (Number(balance.available_amount) || 0) + (Number(balance.frozen_amount) || 0),
            is_active: account.status === 'active'
          }
        } catch (accountError) {
          // 业务错误（ACCOUNT_FROZEN 等）直接向上抛出
          if (accountError.code) {
            throw accountError
          }
          // 其他错误（数据库异常）记录日志，返回默认 0 值结构（决策G：0正常态）
          logger.warn('获取积分账户时发生异常，使用默认值', {
            user_id: userId,
            error: accountError.message
          })
          pointsAccount = {
            account_id: null,
            user_id: userId,
            available_points: 0,
            frozen_points: 0,
            total_points: 0,
            is_active: true
          }
        }
      }

      logger.info('获取用户和积分账户信息成功', {
        user_id: userId,
        has_points_account: !!pointsAccount
      })

      // 转换用户数据为普通对象（便于添加显示名称）
      const userData = user.get ? user.get({ plain: true }) : user

      // 添加中文显示名称（V4.7 中文化显示名称系统 - 2026-01-22）
      await attachDisplayNames(userData, [
        { field: 'status', dictType: DICT_TYPES.USER_STATUS },
        { field: 'user_level', dictType: DICT_TYPES.USER_LEVEL }
      ])

      return {
        user: userData,
        points_account: pointsAccount
      }
    } catch (error) {
      // 如果是业务错误，直接抛出
      if (error.code) {
        throw error
      }

      // 其他错误包装后抛出
      logger.error('获取用户和积分账户信息失败', {
        user_id: userId,
        error: error.message,
        stack: error.stack
      })

      const wrappedError = new Error('获取用户信息失败')
      wrappedError.code = 'USER_GET_FAILED'
      wrappedError.statusCode = 500
      wrappedError.originalError = error
      throw wrappedError
    }
  }
}

module.exports = UserService
