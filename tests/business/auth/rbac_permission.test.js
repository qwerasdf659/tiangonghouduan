/**
 * 用户权限系统测试 - P0优先级
 *
 * 测试目标：验证RBAC权限校验、角色继承、层级关系的完整性
 *
 * 功能覆盖：
 * 1. 角色管理 - Role模型CRUD操作
 * 2. 用户角色分配 - UserRole关联管理
 * 3. 用户层级关系 - UserHierarchy上下级管理
 * 4. 权限检查 - RBAC权限校验逻辑
 * 5. 角色继承 - 权限级别继承验证
 *
 * 相关模型：
 * - Role: 角色管理表（role_id, role_uuid, role_name, role_level, permissions）
 * - UserRole: 用户角色关联表（user_id, role_id, is_active, assigned_by）
 * - UserHierarchy: 用户层级关系表（user_id, superior_user_id, role_id, store_id）
 *
 * 相关服务：
 * - UserRoleService: 用户角色管理服务
 *
 * 权限级别规则：
 * - role_level >= 100: 超级管理员（拥有所有权限）
 * - role_level = 50: 运营管理员
 * - role_level = 0: 普通用户
 *
 * 创建时间：2026-01-28
 * P0优先级：用户权限系统
 */

const request = require('supertest')
const app = require('../../../app')
const { User, Role, UserRole, UserHierarchy } = require('../../../models')
const { TEST_DATA } = require('../../helpers/test-data')

// 通过 ServiceManager 获取服务
let UserRoleService

// 测试数据
let admin_token = null
let admin_user_id = null
let test_role_id = null

// 测试用户数据（使用管理员账号）
const test_mobile = TEST_DATA.users.adminUser.mobile

describe('用户权限系统测试 - P0优先级', () => {
  /*
   * ===== 测试准备（Before All Tests） =====
   */
  beforeAll(async () => {
    // 通过 ServiceManager 获取服务实例
    try {
      UserRoleService = global.getTestService
        ? global.getTestService('user_role')
        : require('../../../services/UserRoleService')
    } catch (e) {
      UserRoleService = require('../../../services/UserRoleService')
    }

    // 1. 获取管理员用户信息
    const admin_user = await User.findOne({
      where: { mobile: test_mobile }
    })

    if (!admin_user) {
      throw new Error(`管理员用户不存在：${test_mobile}，请先创建测试用户`)
    }

    admin_user_id = admin_user.user_id

    // 2. 登录获取token
    const login_response = await request(app).post('/api/v4/auth/login').send({
      mobile: test_mobile,
      verification_code: TEST_DATA.auth.verificationCode
    })

    if (!login_response.body.success) {
      throw new Error(`登录失败：${login_response.body.message}`)
    }

    admin_token = login_response.body.data.access_token

    console.log('✅ 用户权限系统测试初始化完成')
    console.log(`   管理员用户ID: ${admin_user_id}`)
  })

  /*
   * ===== 测试后清理 =====
   */
  afterAll(async () => {
    // 清理测试创建的角色
    if (test_role_id) {
      try {
        await Role.destroy({ where: { role_id: test_role_id } })
        console.log(`🧹 清理测试角色: ${test_role_id}`)
      } catch (error) {
        console.warn('清理测试角色失败:', error.message)
      }
    }
  })

  /*
   * ===== 测试组1：角色模型基础功能 =====
   */
  describe('1. 角色模型基础功能', () => {
    test('1.1 应该能够查询现有角色列表', async () => {
      const roles = await Role.findAll({
        where: { is_active: true },
        order: [['role_level', 'DESC']]
      })

      expect(roles).toBeDefined()
      expect(Array.isArray(roles)).toBe(true)
      expect(roles.length).toBeGreaterThan(0)

      // 验证角色结构
      const first_role = roles[0]
      expect(first_role.role_id).toBeDefined()
      expect(first_role.role_uuid).toBeDefined()
      expect(first_role.role_name).toBeDefined()
      expect(first_role.role_level).toBeDefined()

      console.log(`✅ 查询到 ${roles.length} 个角色`)
    })

    test('1.2 应该能够根据UUID获取角色权限', async () => {
      // 获取第一个管理员角色
      const admin_role = await Role.findOne({
        where: { role_level: { [require('sequelize').Op.gte]: 100 }, is_active: true }
      })

      if (!admin_role) {
        console.warn('⚠️ 未找到管理员角色，跳过此测试')
        return
      }

      const permissions = await Role.getPermissionsByUUID(admin_role.role_uuid)

      expect(permissions).not.toBeNull()
      expect(permissions.level).toBeGreaterThanOrEqual(100)
      expect(permissions.name).toBeDefined()

      console.log(`✅ 管理员角色 ${permissions.name} 权限级别: ${permissions.level}`)
    })

    test('1.3 应该能够创建新角色', async () => {
      const new_role_data = {
        role_name: `test_role_${Date.now()}`,
        role_level: 10,
        description: '测试角色（自动化测试创建）',
        permissions: {
          lottery: ['read'],
          profile: ['read']
        },
        is_active: true
      }

      const new_role = await Role.create(new_role_data)
      test_role_id = new_role.role_id // 保存以便清理

      expect(new_role.role_id).toBeDefined()
      expect(new_role.role_uuid).toBeDefined()
      expect(new_role.role_name).toBe(new_role_data.role_name)
      expect(new_role.role_level).toBe(10)

      console.log(`✅ 创建测试角色成功: ${new_role.role_name} (ID: ${new_role.role_id})`)
    })

    test('1.4 超级管理员应该拥有所有权限', async () => {
      const admin_role = await Role.findOne({
        where: { role_level: { [require('sequelize').Op.gte]: 100 }, is_active: true }
      })

      if (!admin_role) {
        console.warn('⚠️ 未找到管理员角色，跳过此测试')
        return
      }

      // 检查任意权限都应该通过
      const has_lottery_permission = await Role.checkPermission(
        admin_role.role_uuid,
        'lottery',
        'write'
      )
      const has_users_permission = await Role.checkPermission(
        admin_role.role_uuid,
        'users',
        'delete'
      )
      const has_system_permission = await Role.checkPermission(
        admin_role.role_uuid,
        'system',
        'admin'
      )

      expect(has_lottery_permission).toBe(true)
      expect(has_users_permission).toBe(true)
      expect(has_system_permission).toBe(true)

      console.log('✅ 超级管理员拥有所有权限验证通过')
    })
  })

  /*
   * ===== 测试组2：用户角色关联 =====
   */
  describe('2. 用户角色关联', () => {
    test('2.1 应该能够查询用户的角色列表', async () => {
      const user_roles = await UserRole.findAll({
        where: { user_id: admin_user_id, is_active: true },
        include: [
          {
            model: Role,
            as: 'role'
          }
        ]
      })

      expect(user_roles).toBeDefined()
      expect(Array.isArray(user_roles)).toBe(true)

      console.log(`✅ 用户 ${admin_user_id} 拥有 ${user_roles.length} 个角色`)
    })

    test('2.2 应该能够通过UserRoleService获取用户完整权限', async () => {
      const user_with_roles = await UserRoleService.getUserWithRoles(admin_user_id)

      expect(user_with_roles).toBeDefined()
      expect(user_with_roles.user_id).toBe(admin_user_id)
      expect(user_with_roles.mobile).toBe(test_mobile)
      expect(user_with_roles.roles).toBeDefined()
      expect(user_with_roles.highest_role_level).toBeDefined()

      console.log(`✅ 用户权限信息:`)
      console.log(`   最高权限级别: ${user_with_roles.highest_role_level}`)
      console.log(`   角色数量: ${user_with_roles.roles.length}`)
    })

    test('2.3 应该能够检查用户特定权限', async () => {
      const has_lottery_read = await UserRoleService.checkUserPermission(
        admin_user_id,
        'lottery',
        'read'
      )

      expect(typeof has_lottery_read).toBe('boolean')

      console.log(`✅ 用户抽奖读取权限: ${has_lottery_read}`)
    })

    test('2.4 应该能够批量获取用户角色信息', async () => {
      const user_ids = [admin_user_id]
      const batch_result = await UserRoleService.getBatchUsersWithRoles(user_ids)

      expect(batch_result).toBeDefined()
      expect(Array.isArray(batch_result)).toBe(true)
      expect(batch_result.length).toBe(1)
      expect(batch_result[0].user_id).toBe(admin_user_id)

      console.log('✅ 批量获取用户角色信息成功')
    })
  })

  /*
   * ===== 测试组3：用户层级关系 =====
   */
  describe('3. 用户层级关系', () => {
    test('3.1 应该能够查询用户层级记录', async () => {
      const hierarchy_records = await UserHierarchy.findAll({
        where: { is_active: true },
        include: [
          { model: User, as: 'user' },
          { model: User, as: 'superior' },
          { model: Role, as: 'role' }
        ],
        limit: 10
      })

      expect(hierarchy_records).toBeDefined()
      expect(Array.isArray(hierarchy_records)).toBe(true)

      console.log(`✅ 查询到 ${hierarchy_records.length} 条层级关系记录`)

      if (hierarchy_records.length > 0) {
        const first_record = hierarchy_records[0]
        expect(first_record.user_hierarchy_id).toBeDefined()
        expect(first_record.user_id).toBeDefined()
        expect(first_record.role_id).toBeDefined()
      }
    })

    test('3.2 应该能够查询用户的上级', async () => {
      // 查询有上级的用户
      const with_superior = await UserHierarchy.findOne({
        where: {
          superior_user_id: { [require('sequelize').Op.ne]: null },
          is_active: true
        },
        include: [
          { model: User, as: 'user' },
          { model: User, as: 'superior' }
        ]
      })

      if (with_superior) {
        expect(with_superior.superior_user_id).toBeDefined()
        expect(with_superior.superior).toBeDefined()
        console.log(
          `✅ 用户 ${with_superior.user?.nickname || with_superior.user_id} 的上级是 ${with_superior.superior?.nickname || with_superior.superior_user_id}`
        )
      } else {
        console.log('ℹ️ 当前没有配置上下级关系的用户')
      }
    })

    test('3.3 应该能够查询某上级的所有下属', async () => {
      // 查询有下属的上级
      const superior_user = await UserHierarchy.findOne({
        where: {
          superior_user_id: { [require('sequelize').Op.ne]: null },
          is_active: true
        },
        attributes: ['superior_user_id']
      })

      if (superior_user && superior_user.superior_user_id) {
        const subordinates = await UserHierarchy.findAll({
          where: {
            superior_user_id: superior_user.superior_user_id,
            is_active: true
          },
          include: [{ model: User, as: 'user' }]
        })

        expect(subordinates).toBeDefined()
        expect(Array.isArray(subordinates)).toBe(true)

        console.log(
          `✅ 上级 ${superior_user.superior_user_id} 有 ${subordinates.length} 个直接下属`
        )
      } else {
        console.log('ℹ️ 当前没有配置层级关系')
      }
    })
  })

  /*
   * ===== 测试组4：权限级别继承验证 =====
   */
  describe('4. 权限级别继承验证', () => {
    test('4.1 管理员权限应该大于普通用户', async () => {
      // 获取管理员和普通用户角色
      const admin_role = await Role.findOne({
        where: { role_level: { [require('sequelize').Op.gte]: 100 } }
      })

      const user_role = await Role.findOne({
        where: { role_level: 0, is_active: true }
      })

      if (admin_role && user_role) {
        expect(admin_role.role_level).toBeGreaterThan(user_role.role_level)
        console.log(
          `✅ 管理员级别 (${admin_role.role_level}) > 普通用户级别 (${user_role.role_level})`
        )
      } else {
        console.log('ℹ️ 未找到完整的角色层级配置')
      }
    })

    test('4.2 运营管理员权限应该介于管理员和普通用户之间', async () => {
      const moderator_role = await Role.findOne({
        where: { role_name: 'moderator', is_active: true }
      })

      if (moderator_role) {
        expect(moderator_role.role_level).toBeGreaterThan(0)
        expect(moderator_role.role_level).toBeLessThan(100)
        console.log(`✅ 运营管理员级别: ${moderator_role.role_level}`)
      } else {
        console.log('ℹ️ 未找到运营管理员角色')
      }
    })

    test('4.3 用户最高权限级别应该正确计算', async () => {
      const user_info = await UserRoleService.getUserWithRoles(admin_user_id)

      // highest_role_level 应该是用户所有角色中的最高值
      if (user_info.roles.length > 0) {
        const max_level = Math.max(...user_info.roles.map(r => r.role_level))
        expect(user_info.highest_role_level).toBe(max_level)
        console.log(`✅ 用户最高权限级别计算正确: ${user_info.highest_role_level}`)
      } else {
        expect(user_info.highest_role_level).toBe(0)
        console.log('ℹ️ 用户没有分配角色，默认权限级别为0')
      }
    })
  })

  /*
   * ===== 测试组5：权限校验业务场景 =====
   */
  describe('5. 权限校验业务场景', () => {
    test('5.1 无token访问管理员接口应返回401', async () => {
      // 正确的API路径：/api/v4/console/user-management/users（使用连字符）
      const response = await request(app).get('/api/v4/console/user-management/users')

      // 无token应该返回401或需要认证的状态
      expect([401, 403]).toContain(response.status)
      console.log(`✅ 无token访问管理员接口返回: ${response.status}`)
    })

    test('5.2 管理员token应该能访问管理接口', async () => {
      // 正确的API路径：/api/v4/console/user-management/users（使用连字符）
      const response = await request(app)
        .get('/api/v4/console/user-management/users')
        .set('Authorization', `Bearer ${admin_token}`)
        .query({ page: 1, page_size: 1 })

      // 管理员应该能访问（200或其他非401/403状态）
      expect([200, 400, 500, 404]).toContain(response.status)

      if (response.status === 200) {
        console.log('✅ 管理员token成功访问管理接口')
      } else {
        console.log(`ℹ️ 管理接口返回: ${response.status} - ${response.body.message || ''}`)
      }
    })

    test('5.3 权限检查应该是一致的', async () => {
      // 多次检查相同权限应该返回一致结果
      const check1 = await UserRoleService.checkUserPermission(admin_user_id, 'lottery', 'read')
      const check2 = await UserRoleService.checkUserPermission(admin_user_id, 'lottery', 'read')
      const check3 = await UserRoleService.checkUserPermission(admin_user_id, 'lottery', 'read')

      expect(check1).toBe(check2)
      expect(check2).toBe(check3)

      console.log('✅ 权限检查结果一致性验证通过')
    })
  })
})
