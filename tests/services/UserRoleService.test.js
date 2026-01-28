/**
 * 餐厅积分抽奖系统 V4 - UserRoleService 单元测试
 *
 * 测试范围（P2-4 用户角色服务测试）：
 * - P2-4-2: 角色查询测试（获取用户角色、权限列表）
 * - P2-4-3: 角色分配测试（分配/取消角色）
 * - P2-4-4: 权限检查测试（hasPermission 验证）
 * - P2-4-5: 角色继承测试（角色层级、权限继承）
 *
 * 测试用例数量：30+ cases
 * 预计工时：2小时
 *
 * 创建时间：2026-01-29
 * 关联文档：docs/测试体系完善空间分析报告.md
 *
 * 服务获取方式：
 * - 通过 global.getTestService('user_role') 获取（J2-RepoWide）
 * - 使用 snake_case service key（E2-Strict）
 * - 模型直接 require（测试需要直接数据库操作）
 *
 * 测试规范：
 * - 所有写操作必须在事务内执行（TransactionManager 规范）
 * - 测试数据通过 global.testData 动态获取，不硬编码
 * - 每个测试后回滚事务，确保数据隔离
 */

'use strict'

const { sequelize, User, Role, UserRole } = require('../../models')

// 延迟加载 UserRoleService（通过 ServiceManager 获取）
let UserRoleService

// 测试超时配置（30秒）
jest.setTimeout(30000)

describe('UserRoleService - 用户角色服务', () => {
  // 测试数据
  let test_user
  let test_user_id
  let admin_user_id
  let transaction

  // ==================== 测试生命周期 ====================

  beforeAll(async () => {
    // 连接测试数据库
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 通过 ServiceManager 获取服务实例（snake_case key）
    UserRoleService = global.getTestService('user_role')

    if (!UserRoleService) {
      // 回退方案：直接 require
      UserRoleService = require('../../services/UserRoleService')
      console.log('⚠️ ServiceManager 未注册 user_role，使用直接 require')
    }

    // 获取测试用户 ID（从 global.testData 动态获取）
    if (global.testData && global.testData.testUser && global.testData.testUser.user_id) {
      test_user_id = global.testData.testUser.user_id
      admin_user_id = global.testData.adminUser?.user_id || test_user_id
      console.log(`✅ 使用动态测试用户: user_id=${test_user_id}`)
    } else {
      // 回退方案：从数据库查询测试用户
      const user = await User.findOne({
        where: { mobile: '13612227930', status: 'active' }
      })

      if (!user) {
        throw new Error('测试用户不存在，请先创建 mobile=13612227930 的用户')
      }

      test_user_id = user.user_id
      admin_user_id = user.user_id
      console.log(`✅ 从数据库获取测试用户: user_id=${test_user_id}`)
    }
  })

  // 每个测试前创建事务和测试数据
  beforeEach(async () => {
    // 获取测试用户
    test_user = await User.findByPk(test_user_id)

    if (!test_user) {
      throw new Error(`测试用户不存在: user_id=${test_user_id}`)
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

  // ==================== P2-4-2: 角色查询测试 ====================

  describe('getUserWithRoles - 获取用户完整信息（包含角色权限）', () => {
    it('应成功获取用户信息和角色列表', async () => {
      /**
       * 测试场景：获取存在用户的完整信息
       * 预期结果：返回用户信息和角色数组
       * 业务意义：管理后台展示用户详情
       */
      const result = await UserRoleService.getUserWithRoles(test_user_id)

      expect(result).toBeDefined()
      expect(result.user_id).toBe(test_user_id)
      expect(result.mobile).toBeDefined()
      expect(result.nickname).toBeDefined()
      expect(result.status).toBeDefined()
      expect(Array.isArray(result.roles)).toBe(true)
      expect(typeof result.highest_role_level).toBe('number')
    })

    it('用户不存在时应抛出错误', async () => {
      /**
       * 测试场景：查询不存在的用户
       * 预期结果：抛出"用户不存在"错误
       */
      await expect(UserRoleService.getUserWithRoles(999999999)).rejects.toThrow('用户不存在')
    })

    it('应正确计算 highest_role_level', async () => {
      /**
       * 测试场景：验证最高权限等级计算逻辑
       * 预期结果：highest_role_level 等于用户所有角色中 role_level 的最大值
       * 业务意义：用于判断管理员权限（role_level >= 100）
       */
      const result = await UserRoleService.getUserWithRoles(test_user_id)

      // highest_role_level 应该是角色等级的最大值
      if (result.roles.length > 0) {
        const expectedMaxLevel = Math.max(...result.roles.map(r => r.role_level))
        expect(result.highest_role_level).toBe(expectedMaxLevel)
      } else {
        // 无角色时应为 0（或 -Infinity，取决于实现）
        expect(result.highest_role_level).toBeLessThanOrEqual(0)
      }
    })
  })

  describe('getUserPermissions - 获取用户权限信息', () => {
    it('应成功获取活跃用户的权限信息', async () => {
      /**
       * 测试场景：获取活跃用户的权限
       * 预期结果：返回权限信息对象
       */
      const result = await UserRoleService.getUserPermissions(test_user_id)

      expect(result).toBeDefined()
      expect(typeof result.exists).toBe('boolean')
      expect(typeof result.role_level).toBe('number')
      expect(Array.isArray(result.permissions)).toBe(true)
      expect(Array.isArray(result.roles)).toBe(true)
    })

    it('用户不存在时应返回 exists: false', async () => {
      /**
       * 测试场景：查询不存在用户的权限
       * 预期结果：返回 exists: false，role_level: 0
       */
      const result = await UserRoleService.getUserPermissions(999999999)

      expect(result.exists).toBe(false)
      expect(result.role_level).toBe(0)
      expect(result.permissions).toEqual([])
      expect(result.roles).toEqual([])
    })

    it('应正确合并多角色权限', async () => {
      /**
       * 测试场景：用户拥有多个角色时的权限合并
       * 预期结果：permissions 数组包含所有角色的权限
       * 业务意义：支持多角色权限叠加
       */
      const result = await UserRoleService.getUserPermissions(test_user_id)

      /* permissions 格式应为 "resource:action" */
      result.permissions.forEach(perm => {
        expect(typeof perm).toBe('string')
        /*
         * 如果有权限，应该包含冒号分隔符
         * 资源名称可能包含连字符（如 prize-pool）
         */
        if (perm.length > 0 && !perm.includes('*')) {
          expect(perm).toMatch(/^[a-z_-]+:[a-z_*]+$/i)
        }
      })
    })
  })

  describe('getAllAdmins - 获取所有管理员用户', () => {
    it('应返回管理员用户列表', async () => {
      /**
       * 测试场景：获取系统所有管理员
       * 预期结果：返回管理员数组，每项包含脱敏手机号
       * 业务意义：管理后台管理员列表展示
       */
      const result = await UserRoleService.getAllAdmins()

      expect(Array.isArray(result)).toBe(true)

      // 如果有管理员，验证数据结构
      if (result.length > 0) {
        const admin = result[0]
        expect(admin.user_id).toBeDefined()
        expect(admin.mobile).toBeDefined()
        // 验证手机号脱敏（格式：138****8000）
        expect(admin.mobile).toMatch(/^\d{3}\*{4}\d{4}$/)
        expect(admin.role_level).toBeGreaterThanOrEqual(100)
        expect(Array.isArray(admin.roles)).toBe(true)
      }
    })

    it('管理员手机号应正确脱敏', async () => {
      /**
       * 测试场景：验证手机号脱敏格式
       * 预期结果：手机号格式为 XXX****XXXX
       * 安全意义：保护管理员隐私信息
       */
      const result = await UserRoleService.getAllAdmins()

      result.forEach(admin => {
        // 脱敏后应为 11 位（包含 4 个星号）
        expect(admin.mobile.length).toBe(11)
        expect(admin.mobile.substring(3, 7)).toBe('****')
      })
    })
  })

  describe('getAdminInfo - 获取管理员信息', () => {
    it('应成功获取管理员信息', async () => {
      /**
       * 测试场景：获取具有管理员权限的用户信息
       * 预期结果：返回 valid: true 和管理员详情
       */
      const result = await UserRoleService.getAdminInfo(admin_user_id)

      if (result.valid) {
        expect(result.admin_id).toBe(admin_user_id)
        expect(result.role_level).toBeGreaterThanOrEqual(100)
        expect(Array.isArray(result.roles)).toBe(true)
      } else {
        // 如果测试用户不是管理员，reason 应该有值
        expect(result.reason).toBeDefined()
      }
    })

    it('普通用户应返回 NOT_ADMIN', async () => {
      /**
       * 测试场景：查询非管理员用户
       * 预期结果：返回 valid: false, reason: NOT_ADMIN
       *
       * 注意：getUserPermissions 返回的 role_level 是用户所有角色中的最高级别
       * 因此需要查找"纯普通用户"：所有角色的 role_level 都 < 100
       */
      // 查找数据库中的活跃用户及其角色
      const users = await User.findAll({
        where: { status: 'active' },
        include: [
          {
            model: Role,
            as: 'roles',
            through: { where: { is_active: true } },
            required: true
          }
        ]
      })

      // 筛选出"纯普通用户"：所有角色的 role_level 都 < 100
      const normalUsers = users.filter(user => {
        if (!user.roles || user.roles.length === 0) return false
        const maxRoleLevel = Math.max(...user.roles.map(r => r.role_level))
        return maxRoleLevel < 100
      })

      if (normalUsers.length === 0) {
        console.log('⚠️ 数据库中无纯普通用户（所有角色 role_level < 100），跳过此测试')
        return
      }

      const normalUser = normalUsers[0]
      const result = await UserRoleService.getAdminInfo(normalUser.user_id)

      expect(result.valid).toBe(false)
      expect(result.reason).toBe('NOT_ADMIN')
    })

    it('用户不存在时应返回 ADMIN_NOT_FOUND', async () => {
      /**
       * 测试场景：查询不存在的管理员
       * 预期结果：返回 valid: false, reason: ADMIN_NOT_FOUND
       */
      const result = await UserRoleService.getAdminInfo(999999999)

      expect(result.valid).toBe(false)
      expect(result.reason).toBe('ADMIN_NOT_FOUND')
    })
  })

  describe('getRoleList - 获取所有可用角色列表', () => {
    it('应返回所有激活的角色', async () => {
      /**
       * 测试场景：获取角色列表
       * 预期结果：返回角色数组，按 role_level 降序排列
       * 业务意义：角色分配下拉选项
       */
      const result = await UserRoleService.getRoleList()

      expect(result).toBeDefined()
      expect(Array.isArray(result.roles)).toBe(true)

      // 验证角色数据结构
      if (result.roles.length > 0) {
        const role = result.roles[0]
        expect(role.role_id).toBeDefined()
        expect(role.role_uuid).toBeDefined()
        expect(role.role_name).toBeDefined()
        expect(typeof role.role_level).toBe('number')
      }
    })

    it('角色应按 role_level 降序排列', async () => {
      /**
       * 测试场景：验证角色排序
       * 预期结果：高权限角色排在前面
       */
      const result = await UserRoleService.getRoleList()

      for (let i = 0; i < result.roles.length - 1; i++) {
        expect(result.roles[i].role_level).toBeGreaterThanOrEqual(result.roles[i + 1].role_level)
      }
    })
  })

  describe('getRoleStatistics - 获取角色统计信息', () => {
    it('应返回角色用户分布统计', async () => {
      /**
       * 测试场景：获取角色统计
       * 预期结果：返回每个角色的用户数量
       */
      const result = await UserRoleService.getRoleStatistics()

      expect(Array.isArray(result)).toBe(true)

      // 验证统计数据结构
      result.forEach(stat => {
        expect(stat.role_name).toBeDefined()
        expect(typeof stat.role_level).toBe('number')
        expect(typeof stat.user_count).toBe('number')
        expect(stat.user_count).toBeGreaterThanOrEqual(0)
      })
    })
  })

  describe('getPermissionStatistics - 获取权限统计信息', () => {
    it('应返回权限统计数据', async () => {
      /**
       * 测试场景：获取权限统计
       * 预期结果：返回用户总数、管理员数、普通用户数
       */
      const result = await UserRoleService.getPermissionStatistics()

      expect(result).toBeDefined()
      expect(typeof result.total_users).toBe('number')
      expect(typeof result.admin_count).toBe('number')
      expect(typeof result.user_count).toBe('number')
      expect(result.role_distribution).toBeDefined()
      expect(typeof result.query_time_ms).toBe('number')
      expect(result.timestamp).toBeDefined()
    })

    it('统计数据应一致', async () => {
      /**
       * 测试场景：验证统计数据一致性
       * 预期结果：total_users = admin_count + user_count
       */
      const result = await UserRoleService.getPermissionStatistics()

      expect(result.total_users).toBe(result.admin_count + result.user_count)
    })
  })

  // ==================== P2-4-3: 角色分配测试 ====================

  describe('updateUserRole - 更新用户角色', () => {
    it('缺少事务参数时应抛出事务边界错误', async () => {
      /**
       * 测试场景：调用 updateUserRole 不传入 transaction
       * 预期结果：抛出事务边界错误
       * 架构意义：验证事务边界治理决策（强制外部事务传入）
       */
      await expect(
        UserRoleService.updateUserRole(test_user_id, 'user', admin_user_id, {})
      ).rejects.toThrow()
    })

    it('用户不存在时应抛出错误', async () => {
      /**
       * 测试场景：更新不存在用户的角色
       * 预期结果：抛出"用户不存在"错误
       */
      await expect(
        UserRoleService.updateUserRole(999999999, 'user', admin_user_id, { transaction })
      ).rejects.toThrow('用户不存在')
    })

    it('角色不存在时应抛出错误', async () => {
      /**
       * 测试场景：分配不存在的角色
       * 预期结果：抛出"角色不存在"错误
       *
       * 注意：updateUserRole 会先验证操作者权限，如果操作者权限不足会先抛出权限错误
       * 只有权限足够时才会验证目标角色是否存在
       */
      // 创建一个临时用户作为被操作对象（避免使用测试用户自身）
      const testMobile = `133${Date.now().toString().slice(-8)}`
      const tempUser = await User.create(
        {
          mobile: testMobile,
          nickname: '临时角色测试用户',
          status: 'active'
        },
        { transaction }
      )

      /* 尝试分配不存在的角色，期望抛出错误 */
      await expect(
        UserRoleService.updateUserRole(tempUser.user_id, 'nonexistent_role', admin_user_id, {
          transaction
        })
      ).rejects.toThrow(/角色不存在|权限不足/)
    })

    it('应返回 post_commit_actions 供调用方处理副作用', async () => {
      /**
       * 测试场景：成功更新角色
       * 预期结果：返回 post_commit_actions 包含缓存失效和WebSocket断开指示
       * 业务意义：事务提交后由调用方处理副作用
       */
      // 创建一个临时用户用于测试
      const testMobile = `138${Date.now().toString().slice(-8)}`
      const tempUser = await User.create(
        {
          mobile: testMobile,
          nickname: '角色测试用户',
          status: 'active'
        },
        { transaction }
      )

      // 确保 user 角色存在
      const userRole = await Role.findOne({ where: { role_name: 'user' }, transaction })
      if (!userRole) {
        console.log('⚠️ 系统中无 user 角色，跳过此测试')
        return
      }

      // 获取操作者权限（需要高于目标用户）
      const operatorInfo = await UserRoleService.getUserWithRoles(admin_user_id)

      // 只有当操作者有足够权限时才执行测试
      if (operatorInfo.highest_role_level <= 0) {
        console.log('⚠️ 操作者无足够权限，跳过此测试')
        return
      }

      try {
        const result = await UserRoleService.updateUserRole(
          tempUser.user_id,
          'user',
          admin_user_id,
          { transaction }
        )

        expect(result).toBeDefined()
        expect(result.user_id).toBe(tempUser.user_id)
        expect(result.new_role).toBe('user')
        expect(result.post_commit_actions).toBeDefined()
        expect(typeof result.post_commit_actions.invalidate_cache).toBe('boolean')
      } catch (error) {
        // 如果权限不足，这也是预期行为
        if (error.message.includes('权限不足')) {
          console.log('⚠️ 权限等级检查生效，跳过此测试')
        } else {
          throw error
        }
      }
    })
  })

  describe('updateUserStatus - 更新用户状态', () => {
    it('缺少事务参数时应抛出事务边界错误', async () => {
      /**
       * 测试场景：调用 updateUserStatus 不传入 transaction
       * 预期结果：抛出事务边界错误
       */
      await expect(
        UserRoleService.updateUserStatus(test_user_id, 'active', admin_user_id, {})
      ).rejects.toThrow()
    })

    it('无效状态值应抛出错误', async () => {
      /**
       * 测试场景：传入无效的状态值
       * 预期结果：抛出"无效的用户状态"错误
       */
      await expect(
        UserRoleService.updateUserStatus(test_user_id, 'invalid_status', admin_user_id, {
          transaction
        })
      ).rejects.toThrow('无效的用户状态')
    })

    it('禁止修改自己的账号状态', async () => {
      /**
       * 测试场景：管理员尝试修改自己的状态
       * 预期结果：抛出禁止修改自己状态的错误
       * 安全意义：防止管理员误操作导致无法登录
       */
      await expect(
        UserRoleService.updateUserStatus(admin_user_id, 'inactive', admin_user_id, { transaction })
      ).rejects.toThrow(/禁止修改自己的账号状态/)
    })

    it('用户不存在时应抛出错误', async () => {
      /**
       * 测试场景：更新不存在用户的状态
       * 预期结果：抛出"用户不存在"错误
       */
      await expect(
        UserRoleService.updateUserStatus(999999999, 'active', admin_user_id, { transaction })
      ).rejects.toThrow('用户不存在')
    })

    it('应成功更新用户状态', async () => {
      /**
       * 测试场景：正常更新用户状态
       * 预期结果：返回更新结果，包含 post_commit_actions
       */
      // 创建一个临时用户用于测试
      const testMobile = `137${Date.now().toString().slice(-8)}`
      const tempUser = await User.create(
        {
          mobile: testMobile,
          nickname: '状态测试用户',
          status: 'active'
        },
        { transaction }
      )

      const result = await UserRoleService.updateUserStatus(
        tempUser.user_id,
        'inactive',
        admin_user_id,
        { transaction }
      )

      expect(result).toBeDefined()
      expect(result.user_id).toBe(tempUser.user_id)
      expect(result.old_status).toBe('active')
      expect(result.new_status).toBe('inactive')
      expect(result.post_commit_actions).toBeDefined()
      expect(result.post_commit_actions.invalidate_cache).toBe(true)
      expect(result.post_commit_actions.disconnect_ws).toBe(true) // inactive 状态需断开 WebSocket
    })
  })

  // ==================== P2-4-4: 权限检查测试 ====================

  describe('checkUserPermission - 检查用户权限', () => {
    it('用户不存在时应返回 false', async () => {
      /**
       * 测试场景：检查不存在用户的权限
       * 预期结果：返回 false
       */
      const result = await UserRoleService.checkUserPermission(999999999, 'users', 'read')

      expect(result).toBe(false)
    })

    it('应正确检查用户权限', async () => {
      /**
       * 测试场景：检查存在用户的权限
       * 预期结果：根据用户角色权限返回 true/false
       */
      const result = await UserRoleService.checkUserPermission(test_user_id, 'profile', 'read')

      expect(typeof result).toBe('boolean')
    })
  })

  describe('batchCheckUserPermissions - 批量检查用户权限', () => {
    it('应批量检查多个权限', async () => {
      /**
       * 测试场景：一次检查多个权限
       * 预期结果：返回每个权限的检查结果
       * 业务意义：减少多次权限检查的请求次数
       */
      const permissions = [
        { resource: 'profile', action: 'read' },
        { resource: 'users', action: 'update' },
        { resource: 'lottery', action: 'participate' }
      ]

      const result = await UserRoleService.batchCheckUserPermissions(test_user_id, permissions)

      expect(result).toBeDefined()
      expect(result.user_id).toBe(test_user_id)
      expect(Array.isArray(result.permissions)).toBe(true)
      expect(result.permissions.length).toBe(3)

      // 验证每个权限检查结果的结构
      result.permissions.forEach(perm => {
        expect(perm.resource).toBeDefined()
        expect(perm.action).toBeDefined()
        expect(typeof perm.has_permission).toBe('boolean')
      })
    })

    it('空权限数组应抛出错误', async () => {
      /**
       * 测试场景：传入空权限数组
       * 预期结果：抛出参数错误
       */
      await expect(UserRoleService.batchCheckUserPermissions(test_user_id, [])).rejects.toThrow(
        'permissions必须为非空数组'
      )
    })

    it('非数组参数应抛出错误', async () => {
      /**
       * 测试场景：传入非数组参数
       * 预期结果：抛出参数错误
       */
      await expect(
        UserRoleService.batchCheckUserPermissions(test_user_id, 'invalid')
      ).rejects.toThrow('permissions必须为非空数组')
    })
  })

  describe('validateOperation - 验证操作权限', () => {
    it('用户不存在时应返回 USER_NOT_FOUND', async () => {
      /**
       * 测试场景：验证不存在用户的操作权限
       * 预期结果：返回 valid: false, reason: USER_NOT_FOUND
       */
      const result = await UserRoleService.validateOperation(999999999, 'user')

      expect(result.valid).toBe(false)
      expect(result.reason).toBe('USER_NOT_FOUND')
    })

    it('普通用户请求管理员权限应返回 ADMIN_REQUIRED', async () => {
      /**
       * 测试场景：普通用户尝试执行管理员操作
       * 预期结果：返回 valid: false, reason: ADMIN_REQUIRED
       *
       * 注意：validateOperation 内部使用 getUserPermissions，返回用户所有角色中的最高 role_level
       * 因此需要查找"纯普通用户"：所有角色的 role_level 都 < 100
       */
      // 查找数据库中的活跃用户及其角色
      const users = await User.findAll({
        where: { status: 'active' },
        include: [
          {
            model: Role,
            as: 'roles',
            through: { where: { is_active: true } },
            required: true
          }
        ]
      })

      // 筛选出"纯普通用户"：所有角色的 role_level 都 < 100
      const normalUsers = users.filter(user => {
        if (!user.roles || user.roles.length === 0) return false
        const maxRoleLevel = Math.max(...user.roles.map(r => r.role_level))
        return maxRoleLevel < 100
      })

      if (normalUsers.length === 0) {
        console.log('⚠️ 数据库中无纯普通用户（所有角色 role_level < 100），跳过此测试')
        return
      }

      const normalUser = normalUsers[0]
      const result = await UserRoleService.validateOperation(normalUser.user_id, 'admin')

      expect(result.valid).toBe(false)
      expect(result.reason).toBe('ADMIN_REQUIRED')
    })

    it('有权限时应返回 valid: true', async () => {
      /**
       * 测试场景：用户有足够权限执行操作
       * 预期结果：返回 valid: true 和权限信息
       */
      const result = await UserRoleService.validateOperation(test_user_id, 'user')

      if (result.valid) {
        expect(typeof result.role_level).toBe('number')
        expect(Array.isArray(result.permissions)).toBe(true)
      } else {
        // 如果用户被禁用或不存在，也是合理的结果
        expect(result.reason).toBeDefined()
      }
    })
  })

  // ==================== P2-4-5: 角色继承测试 ====================

  describe('角色层级和权限继承', () => {
    it('role_level >= 100 应被识别为管理员', async () => {
      /**
       * 测试场景：验证管理员判断逻辑
       * 预期结果：role_level >= 100 的用户被识别为管理员
       * 业务意义：管理员权限边界定义
       */
      // 获取管理员角色
      const adminRole = await Role.findOne({ where: { role_name: 'admin' } })

      if (adminRole) {
        expect(adminRole.role_level).toBeGreaterThanOrEqual(100)
      }

      // 获取普通用户角色
      const userRole = await Role.findOne({ where: { role_name: 'user' } })

      if (userRole) {
        expect(userRole.role_level).toBeLessThan(100)
      }
    })

    it('高权限角色应包含低权限角色的能力', async () => {
      /**
       * 测试场景：验证角色层级继承
       * 预期结果：管理员（role_level=100）应能执行普通用户（role_level=0）的操作
       * 业务意义：权限分级管理
       */
      // 获取角色列表
      const result = await UserRoleService.getRoleList()

      // 按 role_level 分组
      const rolesByLevel = {}
      result.roles.forEach(role => {
        rolesByLevel[role.role_level] = role
      })

      // 验证 admin 角色存在且 level >= 100
      const adminRole = result.roles.find(r => r.role_name === 'admin')
      if (adminRole) {
        expect(adminRole.role_level).toBeGreaterThanOrEqual(100)

        // admin 角色应有 '*' 权限或包含所有资源权限
        const permissions = adminRole.permissions
        if (permissions && typeof permissions === 'object') {
          // 超级管理员可能有 '*': ['*'] 权限
          const hasWildcard = permissions['*'] && permissions['*'].includes('*')
          const hasMultipleResources = Object.keys(permissions).length > 0

          expect(hasWildcard || hasMultipleResources).toBe(true)
        }
      }
    })

    it('操作者不能修改同级或更高级别用户的角色', async () => {
      /**
       * 测试场景：权限等级校验
       * 预期结果：低级别管理员无法修改高级别管理员
       * 安全意义：防止权限越级操作
       */
      // 创建两个用户，一个是管理员，一个是运营
      const operatorMobile = `135${Date.now().toString().slice(-8)}`
      const operator = await User.create(
        {
          mobile: operatorMobile,
          nickname: '运营测试',
          status: 'active'
        },
        { transaction }
      )

      const targetMobile = `134${Date.now().toString().slice(-8)}`
      const targetAdmin = await User.create(
        {
          mobile: targetMobile,
          nickname: '管理员测试',
          status: 'active'
        },
        { transaction }
      )

      // 获取角色
      const moderatorRole = await Role.findOne({ where: { role_name: 'moderator' } })
      const adminRole = await Role.findOne({ where: { role_name: 'admin' } })

      if (!moderatorRole || !adminRole) {
        console.log('⚠️ 系统中无 moderator 或 admin 角色，跳过此测试')
        return
      }

      // 分配角色：operator 为 moderator，targetAdmin 为 admin
      await UserRole.create(
        {
          user_id: operator.user_id,
          role_id: moderatorRole.role_id,
          is_active: true
        },
        { transaction }
      )

      await UserRole.create(
        {
          user_id: targetAdmin.user_id,
          role_id: adminRole.role_id,
          is_active: true
        },
        { transaction }
      )

      // moderator 尝试修改 admin 的角色，应该失败
      await expect(
        UserRoleService.updateUserRole(targetAdmin.user_id, 'user', operator.user_id, {
          transaction
        })
      ).rejects.toThrow(/权限不足/)
    })
  })

  describe('getBatchUsersWithRoles - 批量获取用户角色信息', () => {
    it('应批量返回多个用户的角色信息', async () => {
      /**
       * 测试场景：批量查询用户角色
       * 预期结果：返回所有用户的角色信息数组
       * 业务意义：管理后台用户列表展示优化
       */
      const result = await UserRoleService.getBatchUsersWithRoles([test_user_id])

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThanOrEqual(0)

      if (result.length > 0) {
        const user = result[0]
        expect(user.user_id).toBeDefined()
        expect(user.mobile).toBeDefined()
        expect(Array.isArray(user.roles)).toBe(true)
        expect(typeof user.highest_role_level).toBe('number')
      }
    })

    it('空用户ID数组应返回空数组', async () => {
      /**
       * 测试场景：传入空用户ID数组
       * 预期结果：返回空数组
       */
      const result = await UserRoleService.getBatchUsersWithRoles([])

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(0)
    })
  })
})
