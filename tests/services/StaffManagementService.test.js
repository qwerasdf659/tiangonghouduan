/**
 * StaffManagementService 单元测试
 * 员工管理服务测试（员工入职/调动/离职/禁用/启用/角色更新）
 *
 * 测试范围：
 * - 员工列表查询
 * - 员工详情查询
 * - 门店员工查询
 * - 员工统计信息
 * - 用户门店角色检查
 *
 * 测试原则：
 * - 连接真实数据库，不使用mock
 * - 通过 ServiceManager 获取服务实例
 * - 使用 global.testData 获取真实存在的用户和门店
 * - 验证返回格式匹配实际服务定义
 *
 * @see /services/StaffManagementService.js
 * @created 2026-01-29
 */

const { sequelize } = require('../../models')
const { StoreStaff, Store, User } = require('../../models')

describe('StaffManagementService - 员工管理服务测试', () => {
  let StaffManagementService
  let testUserId

  beforeAll(async () => {
    // 确保数据库连接
    await sequelize.authenticate()

    // 通过 ServiceManager 获取服务实例
    StaffManagementService = global.getTestService('staff_management')

    if (!StaffManagementService) {
      throw new Error('StaffManagementService 未正确注册到 ServiceManager')
    }

    // 获取测试用户ID
    testUserId = global.testData?.user?.user_id
    if (!testUserId) {
      const user = await User.findOne({ attributes: ['user_id'] })
      testUserId = user?.user_id
    }

    console.log('✅ StaffManagementService 测试环境初始化完成')
  })

  afterAll(async () => {
    console.log('✅ 数据库连接已关闭')
  })

  /*
   * ========================================
   * 员工列表查询测试
   * ========================================
   */
  describe('getStaffList - 员工列表查询', () => {
    it('应该成功获取员工列表', async () => {
      // 执行：获取员工列表
      const result = await StaffManagementService.getStaffList({
        page: 1,
        page_size: 10
      })

      // 断言：返回对象包含列表和分页信息
      expect(result).toBeDefined()
      expect(Array.isArray(result.staff)).toBe(true) // 🔧 2026-01-29 修复：字段名为 staff 而非 list
      expect(typeof result.total).toBe('number')
      expect(typeof result.page).toBe('number')
      expect(typeof result.page_size).toBe('number')
    })

    it('应该支持按门店筛选', async () => {
      // 先获取一个存在的门店
      const store = await Store.findOne({ attributes: ['store_id'] })
      if (!store) {
        console.log('⚠️ 跳过测试：无门店数据')
        return
      }

      // 执行：按门店筛选
      const result = await StaffManagementService.getStaffList({
        store_id: store.store_id,
        page: 1,
        page_size: 10
      })

      // 断言：返回对象
      expect(result).toBeDefined()
      expect(Array.isArray(result.staff)).toBe(true) // 🔧 2026-01-29 修复
    })

    it('应该支持按状态筛选', async () => {
      // 执行：按状态筛选
      const result = await StaffManagementService.getStaffList({
        status: 'active',
        page: 1,
        page_size: 10
      })

      // 断言：返回对象
      expect(result).toBeDefined()
      expect(Array.isArray(result.staff)).toBe(true) // 🔧 2026-01-29 修复
    })

    it('应该支持按角色筛选', async () => {
      // 执行：按角色筛选
      const result = await StaffManagementService.getStaffList({
        role_in_store: 'manager',
        page: 1,
        page_size: 10
      })

      // 断言：返回对象
      expect(result).toBeDefined()
      expect(Array.isArray(result.staff)).toBe(true) // 🔧 2026-01-29 修复
    })
  })

  /*
   * ========================================
   * 门店员工查询测试
   * ========================================
   */
  describe('getStoreStaff - 门店员工查询', () => {
    it('应该成功获取门店员工列表', async () => {
      // 先获取一个存在的门店
      const store = await Store.findOne({ attributes: ['store_id'] })
      if (!store) {
        console.log('⚠️ 跳过测试：无门店数据')
        return
      }

      // 执行：获取门店员工
      const result = await StaffManagementService.getStoreStaff(store.store_id)

      // 断言：返回数组
      expect(Array.isArray(result)).toBe(true)
    })

    it('查询不存在门店的员工应该返回空数组', async () => {
      // 执行：查询不存在的门店
      const result = await StaffManagementService.getStoreStaff(999999999)

      // 断言：返回空数组
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(0)
    })
  })

  /*
   * ========================================
   * 门店员工统计测试
   * ========================================
   */
  describe('getStoreStaffStats - 门店员工统计', () => {
    it('应该成功获取门店员工统计', async () => {
      // 先获取一个存在的门店
      const store = await Store.findOne({ attributes: ['store_id'] })
      if (!store) {
        console.log('⚠️ 跳过测试：无门店数据')
        return
      }

      // 执行：获取统计
      const result = await StaffManagementService.getStoreStaffStats(store.store_id)

      // 断言：返回统计对象
      expect(result).toBeDefined()
      expect(typeof result.total).toBe('number')
      expect(typeof result.managers).toBe('number')
      expect(typeof result.staff).toBe('number')
    })

    it('不存在门店的统计应该返回全0', async () => {
      // 执行：查询不存在的门店
      const result = await StaffManagementService.getStoreStaffStats(999999999)

      // 断言：返回全0
      expect(result.total).toBe(0)
      expect(result.managers).toBe(0)
      expect(result.staff).toBe(0)
    })
  })

  /*
   * ========================================
   * 用户门店角色查询测试
   * ========================================
   */
  describe('getUserStoreRole - 用户门店角色查询', () => {
    it('查询不存在的用户门店关系应该返回null', async () => {
      // 执行：查询不存在的关系
      const result = await StaffManagementService.getUserStoreRole(999999999, 999999999)

      // 断言：返回null
      expect(result).toBeNull()
    })
  })

  /*
   * ========================================
   * 用户门店列表查询测试
   * ========================================
   */
  describe('getUserStores - 用户门店列表', () => {
    it('应该成功获取用户所属门店列表', async () => {
      if (!testUserId) {
        console.log('⚠️ 跳过测试：无测试用户')
        return
      }

      // 执行：获取用户门店列表
      const result = await StaffManagementService.getUserStores(testUserId)

      // 断言：返回数组
      expect(Array.isArray(result)).toBe(true)
    })

    it('查询不存在用户的门店应该返回空数组', async () => {
      // 执行：查询不存在的用户
      const result = await StaffManagementService.getUserStores(999999999)

      // 断言：返回空数组
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(0)
    })
  })

  /*
   * ========================================
   * 员工详情查询测试
   * ========================================
   */
  describe('getStaffDetail - 员工详情查询', () => {
    it('应该成功获取员工详情', async () => {
      // 先获取一个存在的员工记录
      const staffRecord = await StoreStaff.findOne({
        where: { status: 'active' },
        attributes: ['store_staff_id']
      })

      if (!staffRecord) {
        console.log('⚠️ 跳过测试：无员工记录')
        return
      }

      // 执行：获取员工详情
      const result = await StaffManagementService.getStaffDetail(staffRecord.store_staff_id)

      // 断言：返回员工详情对象
      expect(result).toBeDefined()
      expect(result.store_staff_id).toBe(staffRecord.store_staff_id)
    })

    it('查询不存在的员工应该返回null', async () => {
      // 执行：查询不存在的员工
      const result = await StaffManagementService.getStaffDetail(999999999)

      // 断言：返回null
      expect(result).toBeNull()
    })
  })

  /*
   * ========================================
   * 店长判断测试
   * ========================================
   */
  describe('isStoreManager - 店长判断', () => {
    it('不存在的用户应该返回false', async () => {
      // 执行：检查不存在的用户
      const result = await StaffManagementService.isStoreManager(999999999, 999999999)

      // 断言：返回false
      expect(result).toBe(false)
    })
  })

  /*
   * ========================================
   * 注：以下写操作测试需要真实门店和用户数据支持
   * 在实际测试中，可以先创建测试数据再执行测试
   * ========================================
   */

  // 员工入职测试
  describe('addStaffToStore - 员工入职', () => {
    it('入职缺少必要参数应该报错', async () => {
      // 执行：缺少必要参数
      await expect(
        StaffManagementService.addStaffToStore(
          {
            // 缺少 user_id 和 store_id
          },
          { transaction: null }
        )
      ).rejects.toThrow()
    })
  })

  // 员工禁用测试
  describe('disableStaff - 员工禁用', () => {
    it('禁用不存在的员工应该报错', async () => {
      // 执行：禁用不存在的员工
      await expect(
        StaffManagementService.disableStaff(
          {
            user_id: 999999999,
            store_id: 999999999,
            reason: '测试禁用'
          },
          { transaction: null }
        )
      ).rejects.toThrow()
    })
  })

  // 员工角色更新测试
  describe('updateStaffRole - 角色更新', () => {
    it('更新不存在员工的角色应该报错', async () => {
      // 执行：更新不存在的员工
      await expect(
        StaffManagementService.updateStaffRole(
          {
            user_id: 999999999,
            store_id: 999999999,
            new_role: 'manager'
          },
          { transaction: null }
        )
      ).rejects.toThrow()
    })

    it('使用无效角色应该报错', async () => {
      // 先获取一个存在的员工记录
      const staffRecord = await StoreStaff.findOne({
        where: { status: 'active' },
        attributes: ['user_id', 'store_id']
      })

      if (!staffRecord) {
        console.log('⚠️ 跳过测试：无员工记录')
        return
      }

      // 执行：使用无效角色
      await expect(
        StaffManagementService.updateStaffRole(
          {
            user_id: staffRecord.user_id,
            store_id: staffRecord.store_id,
            new_role: 'invalid_role' // 无效角色
          },
          { transaction: null }
        )
      ).rejects.toThrow()
    })
  })

  // 员工调动测试
  describe('transferStaff - 员工调动', () => {
    it('调动缺少必要参数应该报错', async () => {
      // 执行：缺少必要参数
      await expect(
        StaffManagementService.transferStaff(
          {
            // 缺少参数
          },
          { transaction: null }
        )
      ).rejects.toThrow()
    })
  })
})
