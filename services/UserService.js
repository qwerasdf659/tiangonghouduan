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
 * - **依赖服务协调**：协调 PointsService、UserRoleService 等服务
 *
 * 创建时间：2025年12月09日
 * 使用模型：Claude Sonnet 4.5
 */

const { User, Role, UserRole } = require('../models')
const PointsService = require('./PointsService')
const BeijingTimeHelper = require('../utils/timeHelper')
const logger = require('../utils/logger')

/**
 * 用户服务类
 */
class UserService {
  /**
   * 注册新用户（完整流程：创建用户 + 积分账户 + 角色分配）
   *
   * @param {string} mobile - 手机号
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - 外部事务对象（可选）
   * @param {string} options.nickname - 用户昵称（可选，默认"用户+后4位"）
   * @param {string} options.status - 账户状态（可选，默认"active"）
   * @returns {Object} 创建的用户对象
   * @throws {Error} 业务错误（手机号已存在、角色不存在等）
   */
  static async registerUser (mobile, options = {}) {
    const { transaction: externalTransaction, nickname, status = 'active' } = options

    // 如果没有外部事务，创建内部事务
    const sequelize = require('../config/database')
    const transaction = externalTransaction || (await sequelize.transaction())
    const isInternalTransaction = !externalTransaction

    try {
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

      // 步骤3: 创建积分账户
      await PointsService.createPointsAccount(user.user_id, transaction)

      logger.info('用户积分账户创建成功', { user_id: user.user_id })

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

      // 提交内部事务
      if (isInternalTransaction) {
        await transaction.commit()
      }

      logger.info('用户注册流程完成', {
        user_id: user.user_id,
        mobile: mobile.substring(0, 3) + '****' + mobile.substring(7)
      })

      return user
    } catch (error) {
      // 回滚内部事务
      if (isInternalTransaction && transaction) {
        await transaction.rollback()
      }

      // 如果是业务错误，直接抛出
      if (error.code) {
        throw error
      }

      // 其他错误包装后抛出
      logger.error('用户注册失败', {
        mobile: mobile.substring(0, 3) + '****' + mobile.substring(7),
        error: error.message,
        stack: error.stack
      })

      const wrappedError = new Error('用户注册失败')
      wrappedError.code = 'REGISTRATION_FAILED'
      wrappedError.statusCode = 500
      wrappedError.originalError = error
      throw wrappedError
    }
  }

  /**
   * 根据手机号查找用户
   *
   * @param {string} mobile - 手机号
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - 外部事务对象（可选）
   * @returns {Object|null} 用户对象或null
   */
  static async findByMobile (mobile, options = {}) {
    const { transaction } = options

    try {
      const user = await User.findOne({
        where: { mobile },
        transaction
      })

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
   * @param {number} user_id - 用户ID
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - 外部事务对象（可选）
   * @returns {Object} 更新后的用户对象
   */
  static async updateLoginStats (user_id, options = {}) {
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
   * @param {number} user_id - 用户ID
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - 外部事务对象（可选）
   * @returns {Object|null} 用户对象或null
   * @throws {Error} 业务错误（用户不存在等）
   */
  static async getUserById (user_id, options = {}) {
    const { transaction } = options

    try {
      const user = await User.findByPk(user_id, { transaction })

      if (!user) {
        const error = new Error('用户不存在')
        error.code = 'USER_NOT_FOUND'
        error.statusCode = 404
        throw error
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
   * @param {number} userId - 用户ID
   * @param {Object} options - 选项参数
   * @param {Array<string>} options.attributes - 需要返回的字段列表（可选）
   * @param {boolean} options.checkStatus - 是否检查用户状态（默认 true）
   * @param {Object} options.transaction - 外部事务对象（可选）
   * @returns {Object} 用户对象
   * @throws {Error} 业务错误（用户不存在、账户已被禁用等）
   */
  static async getUserWithValidation (userId, options = {}) {
    const { attributes, checkStatus = true, transaction } = options

    try {
      // 默认返回字段（用户视图）
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

      return user
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
  static async adminLogin (mobile, verificationCode, options = {}) {
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

      // 步骤4: 管理员权限检查
      const { getUserRoles } = require('../middleware/auth')
      const userRoles = await getUserRoles(user.user_id)

      if (!userRoles.isAdmin) {
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
  static async getUserWithPoints (userId, options = {}) {
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

      // 步骤3：检查积分账户（如果需要）
      let pointsAccount = null
      if (checkPointsAccount) {
        const { UserPointsAccount } = require('../models')
        pointsAccount = await UserPointsAccount.findOne({
          where: { user_id: userId },
          attributes: [
            'account_id',
            'user_id',
            'available_points',
            'total_earned',
            'total_consumed',
            'is_active'
          ],
          transaction
        })

        if (!pointsAccount) {
          const error = new Error('该用户尚未开通积分账户')
          error.code = 'POINTS_ACCOUNT_NOT_FOUND'
          error.statusCode = 404
          error.data = {
            user_id: userId,
            suggestion: '用户需要先进行消费或参与活动才会开通积分账户'
          }
          throw error
        }

        if (!pointsAccount.is_active) {
          const error = new Error('积分账户已被冻结')
          error.code = 'ACCOUNT_FROZEN'
          error.statusCode = 403
          error.data = { user_id: userId }
          throw error
        }
      }

      logger.info('获取用户和积分账户信息成功', {
        user_id: userId,
        has_points_account: !!pointsAccount
      })

      return {
        user,
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
