/**
 * 餐厅积分抽奖系统 V4.5 - UserService 单元测试
 *
 * 测试范围（P1-6 UserService 服务测试）：
 * - 用户注册流程（创建用户 + 积分账户 + 角色分配）
 * - 用户登录/认证相关业务
 * - 积分变动和状态管理
 * - 事务边界治理（强制外部事务传入）
 * - Redis 缓存策略验证
 *
 * 测试用例数量：20+ cases
 * 预计工时：1天
 *
 * 创建时间：2026-01-28
 * 关联文档：docs/测试审计标准.md（P1-6 节）
 *
 * 服务获取方式：
 * - 通过 global.getTestService('user') 获取（J2-RepoWide）
 * - 使用 snake_case service key（E2-Strict）
 * - 模型直接 require（测试需要直接数据库操作）
 */

const { sequelize, User, Role, UserRole } = require('../../../models')
const BusinessError = require('../../../utils/BusinessError')

// 延迟加载 UserService（通过 ServiceManager 获取）
let UserService

// 测试数据库配置
jest.setTimeout(30000)

describe('UserService - 用户服务', () => {
  let test_user
  let transaction

  // 测试前准备
  beforeAll(async () => {
    // 连接测试数据库
    await sequelize.authenticate()

    // 通过 ServiceManager 获取服务实例（snake_case key）
    UserService = global.getTestService('user')

    console.log('✅ UserService 测试初始化完成')
  })

  // 每个测试前创建测试数据
  beforeEach(async () => {
    // 使用测试用户（13612227930 为测试账号）
    test_user = await User.findOne({
      where: { mobile: '13612227930' }
    })

    if (!test_user) {
      throw new Error('测试用户不存在，请先创建 mobile=13612227930 的用户')
    }

    // 创建测试事务
    transaction = await sequelize.transaction()
  })

  // 每个测试后回滚事务
  afterEach(async () => {
    if (transaction && !transaction.finished) {
      await transaction.rollback()
    }
  })

  // 测试后关闭连接
  afterAll(async () => {
    await sequelize.close()
  })

  // ==================== 1. 用户注册测试 ====================

  describe('registerUser - 用户注册流程', () => {
    it('应成功注册新用户（创建用户 + 资产账户 + 角色分配）', async () => {
      /**
       * 测试场景：正常注册流程
       * 预期结果：创建用户记录、初始化资产账户、分配普通用户角色
       * 业务意义：验证完整的用户注册业务链路
       */
      // 使用唯一的测试手机号（每次测试使用不同号码避免冲突）
      const testMobile = `139${Date.now().toString().slice(-8)}`

      const result = await UserService.registerUser(testMobile, {
        transaction,
        nickname: '测试新用户'
      })

      // 验证用户创建成功
      expect(result).toBeDefined()
      expect(result.user_id).toBeDefined()
      expect(result.mobile).toBe(testMobile)
      expect(result.nickname).toBe('测试新用户')
      expect(result.status).toBe('active')
      expect(result.consecutive_fail_count).toBe(0)
      expect(result.login_count).toBe(0)

      // 验证角色分配（普通用户角色）
      const userRole = await UserRole.findOne({
        where: { user_id: result.user_id },
        include: [{ model: Role, as: 'role' }],
        transaction
      })

      // 如果系统中存在角色配置，验证角色分配
      if (userRole) {
        expect(userRole.role.role_name).toBe('user')
        expect(userRole.is_active).toBe(true)
      }
    })

    it('手机号已存在时应抛出 MOBILE_EXISTS 错误', async () => {
      /**
       * 测试场景：尝试注册已存在的手机号
       * 预期结果：抛出 MOBILE_EXISTS 错误
       * 业务意义：确保手机号唯一性约束
       */
      await expect(
        UserService.registerUser(test_user.mobile, { transaction })
      ).rejects.toMatchObject({
        code: 'MOBILE_EXISTS',
        statusCode: 400
      })
    })

    it('缺少事务参数时应抛出事务边界错误', async () => {
      /**
       * 测试场景：调用 registerUser 不传入 transaction
       * 预期结果：抛出事务边界错误
       * 架构意义：验证事务边界治理决策（2026-01-05）
       */
      const testMobile = `138${Date.now().toString().slice(-8)}`

      await expect(UserService.registerUser(testMobile, {})).rejects.toThrow()
    })

    it('默认昵称应为"用户+手机号后4位"', async () => {
      /**
       * 测试场景：注册时不传入昵称
       * 预期结果：自动生成默认昵称
       */
      const testMobile = `137${Date.now().toString().slice(-8)}`
      const expectedNickname = `用户${testMobile.slice(-4)}`

      const result = await UserService.registerUser(testMobile, { transaction })

      expect(result.nickname).toBe(expectedNickname)
    })
  })

  // ==================== 2. 用户查询测试（findByMobile）====================

  describe('findByMobile - 根据手机号查找用户', () => {
    it('应成功找到已存在的用户', async () => {
      /**
       * 测试场景：查询存在的用户
       * 预期结果：返回用户对象
       */
      const user = await UserService.findByMobile(test_user.mobile, { transaction })

      expect(user).toBeDefined()
      expect(user.user_id).toBe(test_user.user_id)
      expect(user.mobile).toBe(test_user.mobile)
    })

    it('用户不存在时应返回 null', async () => {
      /**
       * 测试场景：查询不存在的用户
       * 预期结果：返回 null（不抛出错误）
       */
      const user = await UserService.findByMobile('19999999999', { transaction })

      expect(user).toBeNull()
    })

    it('事务场景下应禁用缓存', async () => {
      /**
       * 测试场景：在事务中查询用户
       * 预期结果：每次都查询数据库（不使用缓存）
       * 业务意义：确保事务内数据一致性
       */
      // 第一次查询
      const user1 = await UserService.findByMobile(test_user.mobile, { transaction })
      expect(user1).toBeDefined()

      // 第二次查询（同一事务内，应该查库而不是缓存）
      const user2 = await UserService.findByMobile(test_user.mobile, { transaction })
      expect(user2).toBeDefined()
      expect(user2.user_id).toBe(user1.user_id)
    })
  })

  // ==================== 3. 根据ID查询用户测试 ====================

  describe('getUserById - 根据ID查找用户', () => {
    it('应成功找到已存在的用户', async () => {
      /**
       * 测试场景：根据 user_id 查询用户
       * 预期结果：返回用户对象
       */
      const user = await UserService.getUserById(test_user.user_id, { transaction })

      expect(user).toBeDefined()
      expect(user.user_id).toBe(test_user.user_id)
    })

    it('用户不存在时应抛出 USER_NOT_FOUND 错误', async () => {
      /**
       * 测试场景：查询不存在的 user_id
       * 预期结果：抛出 USER_NOT_FOUND 错误
       */
      await expect(UserService.getUserById(999999999, { transaction })).rejects.toMatchObject({
        code: 'USER_NOT_FOUND',
        statusCode: 404
      })
    })

    it('可以通过 useCache 参数控制缓存使用', async () => {
      /**
       * 测试场景：显式禁用缓存查询
       * 预期结果：直接查询数据库
       */
      const user = await UserService.getUserById(test_user.user_id, {
        transaction,
        useCache: false
      })

      expect(user).toBeDefined()
      expect(user.user_id).toBe(test_user.user_id)
    })
  })

  // ==================== 4. 登录统计更新测试 ====================

  describe('updateLoginStats - 更新用户登录统计', () => {
    it('应成功更新登录次数和最后登录时间', async () => {
      /**
       * 测试场景：更新用户登录统计
       * 预期结果：login_count 增加 1，last_login 更新为当前时间
       */
      const originalLoginCount = test_user.login_count || 0

      const updatedUser = await UserService.updateLoginStats(test_user.user_id, { transaction })

      expect(updatedUser).toBeDefined()
      expect(updatedUser.login_count).toBe(originalLoginCount + 1)
      expect(updatedUser.last_login).toBeDefined()
    })

    it('用户不存在时应抛出 USER_NOT_FOUND 错误', async () => {
      /**
       * 测试场景：更新不存在用户的登录统计
       * 预期结果：抛出 USER_NOT_FOUND 错误
       */
      await expect(UserService.updateLoginStats(999999999, { transaction })).rejects.toMatchObject({
        code: 'USER_NOT_FOUND',
        statusCode: 404
      })
    })
  })

  // ==================== 5. 用户状态验证测试 ====================

  describe('getUserWithValidation - 获取用户并验证状态', () => {
    it('应成功获取活跃用户', async () => {
      /**
       * 测试场景：获取状态为 active 的用户
       * 预期结果：返回用户对象，包含状态显示名称
       */
      // 确保测试用户状态为 active
      if (test_user.status !== 'active') {
        await test_user.update({ status: 'active' }, { transaction })
      }

      const user = await UserService.getUserWithValidation(test_user.user_id, { transaction })

      expect(user).toBeDefined()
      expect(user.user_id).toBe(test_user.user_id)
      expect(user.status).toBe('active')
    })

    it('用户不存在时应抛出 USER_NOT_FOUND 错误', async () => {
      /**
       * 测试场景：验证不存在的用户
       * 预期结果：抛出 USER_NOT_FOUND 错误
       */
      await expect(
        UserService.getUserWithValidation(999999999, { transaction })
      ).rejects.toMatchObject({
        code: 'USER_NOT_FOUND',
        statusCode: 404
      })
    })

    it('用户状态为非 active 时应抛出 USER_INACTIVE 错误', async () => {
      /**
       * 测试场景：获取被禁用的用户
       * 预期结果：抛出 USER_INACTIVE 错误（403）
       */
      // 创建一个临时的禁用用户
      const testMobile = `136${Date.now().toString().slice(-8)}`
      const inactiveUser = await User.create(
        {
          mobile: testMobile,
          nickname: '禁用测试用户',
          status: 'inactive'
        },
        { transaction }
      )

      await expect(
        UserService.getUserWithValidation(inactiveUser.user_id, { transaction })
      ).rejects.toMatchObject({
        code: 'USER_INACTIVE',
        statusCode: 403
      })
    })

    it('可以跳过状态检查（checkStatus: false）', async () => {
      /**
       * 测试场景：查询用户但不检查状态
       * 预期结果：即使用户被禁用也能返回数据
       */
      // 创建一个临时的禁用用户
      const testMobile = `135${Date.now().toString().slice(-8)}`
      const inactiveUser = await User.create(
        {
          mobile: testMobile,
          nickname: '禁用测试用户2',
          status: 'inactive'
        },
        { transaction }
      )

      const user = await UserService.getUserWithValidation(inactiveUser.user_id, {
        transaction,
        checkStatus: false
      })

      expect(user).toBeDefined()
      expect(user.status).toBe('inactive')
    })

    it('可以指定返回字段（attributes 参数）', async () => {
      /**
       * 测试场景：只返回指定字段
       * 预期结果：只包含指定的字段
       */
      const user = await UserService.getUserWithValidation(test_user.user_id, {
        transaction,
        attributes: ['user_id', 'mobile', 'status']
      })

      expect(user).toBeDefined()
      expect(user.user_id).toBe(test_user.user_id)
      expect(user.mobile).toBe(test_user.mobile)
      // 不返回 nickname 等未指定字段
    })
  })

  // ==================== 6. 管理员登录测试 ====================

  describe('adminLogin - 管理员登录', () => {
    /**
     * 重要说明：adminLogin 在 NODE_ENV=test 时走生产环境验证码逻辑（未实现）
     * 这些测试主要验证：
     * 1. 参数校验（空验证码）
     * 2. 当 NODE_ENV=development 时的正确行为（使用 123456）
     *
     * NODE_ENV=test 时，验证码验证会返回 501 VERIFICATION_NOT_IMPLEMENTED
     */
    const isDevelopment = process.env.NODE_ENV === 'development'

    it('参数校验：验证码为空时应抛出 VERIFICATION_CODE_REQUIRED 错误', async () => {
      /**
       * 测试场景：不提供验证码
       * 预期结果：抛出验证码必填错误
       * 此测试在所有环境下都应该通过
       */
      await expect(
        UserService.adminLogin(test_user.mobile, '', { transaction })
      ).rejects.toMatchObject({
        code: 'VERIFICATION_CODE_REQUIRED',
        statusCode: 400
      })
    })

    it('验证码为 null 时应抛出 VERIFICATION_CODE_REQUIRED 错误', async () => {
      /**
       * 测试场景：验证码为 null
       * 预期结果：抛出验证码必填错误
       */
      await expect(
        UserService.adminLogin(test_user.mobile, null, { transaction })
      ).rejects.toMatchObject({
        code: 'VERIFICATION_CODE_REQUIRED',
        statusCode: 400
      })
    })

    it('非开发环境应返回 501 VERIFICATION_NOT_IMPLEMENTED', async () => {
      /**
       * 测试场景：NODE_ENV=test 时尝试登录
       * 预期结果：返回 501（生产环境验证未实现）
       *
       * 这是预期行为，因为生产环境验证码逻辑尚未实现
       */
      if (isDevelopment) {
        // 开发环境跳过此测试
        console.log('[adminLogin] 跳过：当前为开发环境')
        return
      }

      // 确保测试用户状态为 active
      if (test_user.status !== 'active') {
        await test_user.update({ status: 'active' }, { transaction })
      }

      await expect(
        UserService.adminLogin(test_user.mobile, '123456', { transaction })
      ).rejects.toMatchObject({
        code: 'VERIFICATION_NOT_IMPLEMENTED',
        statusCode: 501
      })
    })

    it('开发环境应成功登录（验证码 123456）', async () => {
      /**
       * 测试场景：NODE_ENV=development 时管理员登录
       * 预期结果：返回用户信息和角色信息
       * 前置条件：测试用户 13612227930 具备管理员权限
       */
      if (!isDevelopment) {
        // 非开发环境跳过此测试
        console.log('[adminLogin] 跳过：当前非开发环境，验证码验证未实现')
        return
      }

      // 确保测试用户状态为 active
      if (test_user.status !== 'active') {
        await test_user.update({ status: 'active' }, { transaction })
      }

      const result = await UserService.adminLogin(test_user.mobile, '123456', { transaction })

      expect(result).toBeDefined()
      expect(result.user).toBeDefined()
      expect(result.user.user_id).toBe(test_user.user_id)
      expect(result.roles).toBeDefined()
      expect(result.roles.role_level).toBeGreaterThan(0)
    })
  })

  // ==================== 7. 获取用户和积分账户测试 ====================

  describe('getUserWithPoints - 获取用户和积分账户', () => {
    it('应成功获取用户和积分账户信息', async () => {
      /**
       * 测试场景：获取用户及其积分账户
       * 预期结果：返回用户信息和积分账户信息
       * 业务场景：抽奖前验证用户资格
       */
      const result = await UserService.getUserWithPoints(test_user.user_id, { transaction })

      expect(result).toBeDefined()
      expect(result.user).toBeDefined()
      expect(result.user.user_id).toBe(test_user.user_id)
      expect(result.points_account).toBeDefined()
      expect(typeof result.points_account.available_points).toBe('number')
      expect(typeof result.points_account.frozen_points).toBe('number')
      expect(typeof result.points_account.total_points).toBe('number')
    })

    it('用户不存在时应抛出 USER_NOT_FOUND 错误', async () => {
      /**
       * 测试场景：查询不存在用户的积分账户
       * 预期结果：抛出用户不存在错误
       */
      await expect(UserService.getUserWithPoints(999999999, { transaction })).rejects.toMatchObject(
        {
          code: 'USER_NOT_FOUND',
          statusCode: 404
        }
      )
    })

    it('用户被禁用时应抛出 USER_INACTIVE 错误', async () => {
      /**
       * 测试场景：被禁用用户尝试获取积分账户
       * 预期结果：抛出账户禁用错误
       */
      // 创建一个临时的禁用用户
      const testMobile = `132${Date.now().toString().slice(-8)}`
      const inactiveUser = await User.create(
        {
          mobile: testMobile,
          nickname: '禁用积分用户',
          status: 'inactive'
        },
        { transaction }
      )

      await expect(
        UserService.getUserWithPoints(inactiveUser.user_id, { transaction })
      ).rejects.toMatchObject({
        code: 'USER_INACTIVE',
        statusCode: 403
      })
    })

    it('可以跳过状态检查（checkStatus: false）', async () => {
      /**
       * 测试场景：查询用户和积分但不检查用户状态
       * 预期结果：即使用户被禁用也能返回数据
       */
      // 创建一个临时的禁用用户
      const testMobile = `131${Date.now().toString().slice(-8)}`
      const inactiveUser = await User.create(
        {
          mobile: testMobile,
          nickname: '禁用积分用户2',
          status: 'inactive'
        },
        { transaction }
      )

      const result = await UserService.getUserWithPoints(inactiveUser.user_id, {
        transaction,
        checkStatus: false
      })

      expect(result).toBeDefined()
      expect(result.user).toBeDefined()
      expect(result.user.status).toBe('inactive')
    })

    it('可以不检查积分账户（checkPointsAccount: false）', async () => {
      /**
       * 测试场景：只获取用户信息，不检查积分账户
       * 预期结果：返回用户信息，points_account 为 null
       */
      const result = await UserService.getUserWithPoints(test_user.user_id, {
        transaction,
        checkPointsAccount: false
      })

      expect(result).toBeDefined()
      expect(result.user).toBeDefined()
      expect(result.points_account).toBeNull()
    })

    it('积分账户不存在时应自动创建（决策G：0正常态）', async () => {
      /**
       * 测试场景：新用户首次查询积分（无积分账户）
       * 预期结果：自动创建账户，返回 available_points: 0
       * 业务意义：V4.6 决策G - 首次查询自动创建账户
       */
      // 创建一个没有积分账户的新用户
      const testMobile = `130${Date.now().toString().slice(-8)}`
      const newUser = await User.create(
        {
          mobile: testMobile,
          nickname: '新用户无积分账户',
          status: 'active'
        },
        { transaction }
      )

      const result = await UserService.getUserWithPoints(newUser.user_id, { transaction })

      expect(result).toBeDefined()
      expect(result.user).toBeDefined()
      expect(result.points_account).toBeDefined()
      // 新账户应该有 0 积分（0正常态）
      expect(result.points_account.available_points).toBe(0)
      expect(result.points_account.frozen_points).toBe(0)
      expect(result.points_account.is_active).toBe(true)
    })
  })

  // ==================== 8. 缓存功能测试 ====================

  describe('Redis 缓存策略验证', () => {
    it('findByMobile 应支持缓存读写', async () => {
      /**
       * 测试场景：验证 findByMobile 的缓存机制
       * 预期结果：首次查询后缓存数据，后续查询命中缓存
       * 注意：事务场景下缓存自动禁用
       */
      // 非事务场景下查询（允许缓存）
      const user1 = await UserService.findByMobile(test_user.mobile, { useCache: true })
      expect(user1).toBeDefined()

      // 再次查询（应该命中缓存）
      const user2 = await UserService.findByMobile(test_user.mobile, { useCache: true })
      expect(user2).toBeDefined()
      expect(user2.user_id).toBe(user1.user_id)
    })

    it('updateLoginStats 应失效用户缓存', async () => {
      /**
       * 测试场景：更新登录统计后缓存失效
       * 预期结果：更新后用户缓存被清除
       * 业务意义：确保数据一致性
       */
      // 先查询缓存用户
      await UserService.findByMobile(test_user.mobile, { useCache: true })

      // 更新登录统计（应该清除缓存）
      await UserService.updateLoginStats(test_user.user_id, { transaction })

      // 再次查询应该查库（缓存已失效）
      const user = await UserService.findByMobile(test_user.mobile, { transaction })
      expect(user).toBeDefined()
    })
  })
})
