/**
 * 餐厅积分抽奖系统 V4.2 - StoreService 单元测试
 *
 * 测试范围：
 * - 门店查询（列表、详情）
 * - 门店创建
 * - 门店更新
 * - 门店状态管理（启用/禁用）
 * - 门店删除（软删除/硬删除）
 * - 门店统计
 *
 * 业务场景：
 * - 平台管理员通过 /api/v4/console/stores 管理门店
 * - 门店需要关联省市区街道四级行政区划
 *
 * @since 2026-01-29
 */

'use strict'

const { sequelize, AdministrativeRegion, Store } = require('../../models')

/**
 * 通过 ServiceManager 获取服务实例
 * 注意：在 beforeAll 中获取，确保 ServiceManager 已初始化
 */
let StoreService

// 测试超时设置
jest.setTimeout(30000)

/**
 * 测试数据：用于创建测试门店的行政区划代码
 * 注意：这些代码必须在数据库 administrative_regions 表中真实存在
 */
const testRegionCodes = {
  province_code: null,
  city_code: null,
  district_code: null,
  street_code: null
}

/**
 * 测试过程中创建的门店ID列表（用于清理）
 */
const createdStoreIds = []

/**
 * 测试用户ID（从 global.testData 获取）
 */
let testUserId = null

describe('StoreService - 门店管理服务', () => {
  // ==================== 测试前准备 ====================

  beforeAll(async () => {
    // 1. 连接数据库
    await sequelize.authenticate()

    // 2. 通过 ServiceManager 获取服务实例（snake_case key）
    StoreService = global.getTestService('store')

    // 验证服务获取成功
    if (!StoreService) {
      throw new Error('StoreService 未注册到 ServiceManager')
    }

    // 3. 获取测试用户ID
    testUserId = global.testData?.testUser?.user_id
    if (!testUserId) {
      console.warn('⚠️ 测试用户未找到，部分测试可能失败')
    }

    /*
     * 4. 获取真实的行政区划代码用于测试
     *    查询北京市的行政区划层级：省 → 市 → 区 → 街道
     */
    try {
      // 省级：北京市
      const province = await AdministrativeRegion.findOne({
        where: { region_code: '110000', status: 'active' },
        attributes: ['region_code', 'region_name']
      })

      if (province) {
        testRegionCodes.province_code = province.region_code

        // 市级：北京市下的市辖区
        const city = await AdministrativeRegion.findOne({
          where: { parent_code: '110000', level: 2, status: 'active' },
          attributes: ['region_code', 'region_name']
        })

        if (city) {
          testRegionCodes.city_code = city.region_code

          // 区县级：市辖区下的区县
          const district = await AdministrativeRegion.findOne({
            where: { parent_code: city.region_code, level: 3, status: 'active' },
            attributes: ['region_code', 'region_name']
          })

          if (district) {
            testRegionCodes.district_code = district.region_code

            // 街道级：区县下的街道
            const street = await AdministrativeRegion.findOne({
              where: { parent_code: district.region_code, level: 4, status: 'active' },
              attributes: ['region_code', 'region_name']
            })

            if (street) {
              testRegionCodes.street_code = street.region_code
            }
          }
        }
      }

      // 验证行政区划数据完整性
      const hasCompleteRegion = Object.values(testRegionCodes).every(code => code !== null)
      if (hasCompleteRegion) {
        console.log('✅ 测试行政区划代码加载完成:', testRegionCodes)
      } else {
        console.warn('⚠️ 行政区划数据不完整，部分测试可能跳过:', testRegionCodes)
      }
    } catch (error) {
      console.error('❌ 加载行政区划数据失败:', error.message)
    }
  })

  // ==================== 测试后清理 ====================

  afterAll(async () => {
    // 清理测试过程中创建的门店
    if (createdStoreIds.length > 0) {
      try {
        await Store.destroy({
          where: { store_id: createdStoreIds },
          force: true // 物理删除
        })
        console.log(`🧹 清理测试门店: ${createdStoreIds.length} 个`)
      } catch (error) {
        console.warn('⚠️ 清理测试门店失败:', error.message)
      }
    }

    // 关闭数据库连接
    await sequelize.close()
  })

  // ==================== P2-3-2: 门店查询测试 ====================

  describe('getStoreList - 获取门店列表', () => {
    it('应该返回分页的门店列表', async () => {
      // 执行查询（默认参数）
      const result = await StoreService.getStoreList()

      // 验证返回结构
      expect(result).toHaveProperty('total')
      expect(result).toHaveProperty('page')
      expect(result).toHaveProperty('page_size')
      expect(result).toHaveProperty('total_pages')
      expect(result).toHaveProperty('items')

      // 验证分页参数
      expect(result.page).toBe(1)
      expect(result.page_size).toBe(20)
      expect(Array.isArray(result.items)).toBe(true)

      // 验证总数和分页计算
      expect(typeof result.total).toBe('number')
      expect(result.total_pages).toBe(Math.ceil(result.total / result.page_size))
    })

    it('应该支持自定义分页参数', async () => {
      // 使用自定义分页参数
      const result = await StoreService.getStoreList({
        page: 1,
        page_size: 5
      })

      // 验证分页参数生效
      expect(result.page).toBe(1)
      expect(result.page_size).toBe(5)
      expect(result.items.length).toBeLessThanOrEqual(5)
    })

    it('应该支持按状态筛选', async () => {
      // 按状态筛选活跃门店
      const result = await StoreService.getStoreList({
        status: 'active'
      })

      // 验证所有返回的门店状态都是 active
      result.items.forEach(store => {
        expect(store.status).toBe('active')
      })
    })

    it('应该支持关键词搜索', async () => {
      // 先获取一个已存在的门店名称
      const allStores = await StoreService.getStoreList({ page_size: 1 })

      if (allStores.items.length > 0) {
        const storeName = allStores.items[0].store_name
        const keyword = storeName.substring(0, 2) // 取前两个字符

        // 使用关键词搜索
        const result = await StoreService.getStoreList({ keyword })

        // 验证搜索结果包含关键词
        expect(result.items.length).toBeGreaterThan(0)
        // 搜索结果应该在门店名称、编号、联系人或地址中包含关键词
        const hasKeyword = result.items.some(
          store =>
            store.store_name?.includes(keyword) ||
            store.store_code?.includes(keyword) ||
            store.contact_name?.includes(keyword) ||
            store.store_address?.includes(keyword)
        )
        expect(hasKeyword).toBe(true)
      } else {
        // 没有门店数据，跳过验证
        console.warn('⚠️ 没有门店数据，跳过关键词搜索测试')
      }
    })

    it('门店列表项应包含完整字段', async () => {
      const result = await StoreService.getStoreList({ page_size: 1 })

      if (result.items.length > 0) {
        const store = result.items[0]

        // 验证必需字段存在
        expect(store).toHaveProperty('store_id')
        expect(store).toHaveProperty('store_name')
        expect(store).toHaveProperty('store_code')
        expect(store).toHaveProperty('status')
        expect(store).toHaveProperty('status_display') // 中文显示名称（来自字典表）
        expect(store).toHaveProperty('status_color') // 颜色样式类（来自字典表）
        expect(store).toHaveProperty('created_at')
        expect(store).toHaveProperty('updated_at')

        // 验证行政区划字段
        expect(store).toHaveProperty('province_code')
        expect(store).toHaveProperty('province_name')
        expect(store).toHaveProperty('city_code')
        expect(store).toHaveProperty('city_name')
        expect(store).toHaveProperty('district_code')
        expect(store).toHaveProperty('district_name')
        expect(store).toHaveProperty('street_code')
        expect(store).toHaveProperty('street_name')

        // 验证组合字段
        expect(store).toHaveProperty('full_region_name')
        expect(store).toHaveProperty('region_codes')
        expect(Array.isArray(store.region_codes)).toBe(true)
      }
    })
  })

  describe('getStoreById - 获取门店详情', () => {
    it('应该返回存在的门店详情', async () => {
      // 从 global.testData 获取测试门店ID
      const testStoreId = global.testData?.testStore?.store_id

      if (!testStoreId) {
        console.warn('⚠️ 测试门店不存在，跳过此测试')
        return
      }

      // 获取门店详情
      const store = await StoreService.getStoreById(testStoreId)

      // 验证返回数据
      expect(store).not.toBeNull()
      expect(store.store_id).toBe(testStoreId)
      expect(store).toHaveProperty('store_name')
      expect(store).toHaveProperty('status')

      // 验证员工统计信息（详情特有字段）
      expect(store).toHaveProperty('staff_counts')
      expect(store).toHaveProperty('total_staff')
    })

    it('应该返回 null 对于不存在的门店', async () => {
      // 使用一个不存在的门店ID
      const result = await StoreService.getStoreById(999999)

      expect(result).toBeNull()
    })
  })

  // ==================== P2-3-3: 门店创建测试 ====================

  describe('createStore - 创建新门店', () => {
    // 检查是否有完整的行政区划数据
    const hasCompleteRegion = () => Object.values(testRegionCodes).every(code => code !== null)

    it('应该成功创建门店（完整数据）', async () => {
      if (!hasCompleteRegion()) {
        console.warn('⚠️ 行政区划数据不完整，跳过此测试')
        return
      }

      // 生成唯一的门店名称
      const timestamp = Date.now()
      const storeData = {
        store_name: `测试门店_${timestamp}`,
        store_address: '测试地址123号',
        contact_name: '测试联系人',
        contact_mobile: '13800138000',
        province_code: testRegionCodes.province_code,
        city_code: testRegionCodes.city_code,
        district_code: testRegionCodes.district_code,
        street_code: testRegionCodes.street_code,
        status: 'pending',
        notes: '这是一个测试门店'
      }

      // 创建门店
      const result = await StoreService.createStore(storeData, {
        operator_id: testUserId || 1
      })

      // 验证创建结果
      expect(result.success).toBe(true)
      expect(result.store).toHaveProperty('store_id')
      expect(result.store.store_name).toBe(storeData.store_name)
      expect(result.store.status).toBe('pending')

      // 验证门店编号自动生成
      expect(result.store.store_code).toBeDefined()
      expect(result.store.store_code).toMatch(/^ST\d{8}\d{3}$/) // ST + 8位日期 + 3位序号

      // 验证行政区划名称自动填充
      expect(result.store.province_name).toBeDefined()
      expect(result.store.city_name).toBeDefined()
      expect(result.store.district_name).toBeDefined()
      expect(result.store.street_name).toBeDefined()

      // 记录创建的门店ID用于清理
      createdStoreIds.push(result.store.store_id)
    })

    it('应该拒绝创建门店（缺少必填字段-门店名称）', async () => {
      if (!hasCompleteRegion()) {
        console.warn('⚠️ 行政区划数据不完整，跳过此测试')
        return
      }

      const storeData = {
        store_name: '', // 空名称
        province_code: testRegionCodes.province_code,
        city_code: testRegionCodes.city_code,
        district_code: testRegionCodes.district_code,
        street_code: testRegionCodes.street_code
      }

      // 应该抛出错误
      await expect(
        StoreService.createStore(storeData, { operator_id: testUserId || 1 })
      ).rejects.toThrow('门店名称不能为空')
    })

    it('应该拒绝创建门店（缺少行政区划）', async () => {
      const storeData = {
        store_name: `测试门店_${Date.now()}`
        // 缺少行政区划代码
      }

      // 应该抛出错误
      await expect(
        StoreService.createStore(storeData, { operator_id: testUserId || 1 })
      ).rejects.toThrow('行政区划校验失败')
    })

    it('应该拒绝创建门店（无效的行政区划代码）', async () => {
      const storeData = {
        store_name: `测试门店_${Date.now()}`,
        province_code: '999999', // 不存在的省级代码
        city_code: '999999',
        district_code: '999999',
        street_code: '999999999'
      }

      // 应该抛出错误
      await expect(
        StoreService.createStore(storeData, { operator_id: testUserId || 1 })
      ).rejects.toThrow('行政区划校验失败')
    })

    it('应该拒绝创建门店（门店编号重复）', async () => {
      if (!hasCompleteRegion()) {
        console.warn('⚠️ 行政区划数据不完整，跳过此测试')
        return
      }

      // 先创建一个门店
      const timestamp = Date.now()
      const storeCode = `ST_TEST_${timestamp}`
      const storeData1 = {
        store_name: `测试门店1_${timestamp}`,
        store_code: storeCode,
        province_code: testRegionCodes.province_code,
        city_code: testRegionCodes.city_code,
        district_code: testRegionCodes.district_code,
        street_code: testRegionCodes.street_code
      }

      const result1 = await StoreService.createStore(storeData1, {
        operator_id: testUserId || 1
      })
      createdStoreIds.push(result1.store.store_id)

      // 尝试使用相同的编号创建第二个门店
      const storeData2 = {
        store_name: `测试门店2_${timestamp}`,
        store_code: storeCode, // 重复的编号
        province_code: testRegionCodes.province_code,
        city_code: testRegionCodes.city_code,
        district_code: testRegionCodes.district_code,
        street_code: testRegionCodes.street_code
      }

      // 应该抛出错误
      await expect(
        StoreService.createStore(storeData2, { operator_id: testUserId || 1 })
      ).rejects.toThrow(/门店编号.*已存在/)
    })
  })

  // ==================== P2-3-4: 门店更新测试 ====================

  describe('updateStore - 更新门店信息', () => {
    let testStoreId = null

    beforeAll(async () => {
      // 创建一个用于更新测试的门店
      const hasCompleteRegion = Object.values(testRegionCodes).every(code => code !== null)

      if (hasCompleteRegion && testUserId) {
        const timestamp = Date.now()
        const storeData = {
          store_name: `更新测试门店_${timestamp}`,
          province_code: testRegionCodes.province_code,
          city_code: testRegionCodes.city_code,
          district_code: testRegionCodes.district_code,
          street_code: testRegionCodes.street_code,
          status: 'pending'
        }

        try {
          const result = await StoreService.createStore(storeData, {
            operator_id: testUserId
          })
          testStoreId = result.store.store_id
          createdStoreIds.push(testStoreId)
          console.log(`✅ 创建更新测试门店: store_id=${testStoreId}`)
        } catch (error) {
          console.warn('⚠️ 创建更新测试门店失败:', error.message)
        }
      }
    })

    it('应该成功更新门店基本信息', async () => {
      if (!testStoreId) {
        console.warn('⚠️ 测试门店不存在，跳过此测试')
        return
      }

      const updateData = {
        store_name: `更新后的门店名称_${Date.now()}`,
        contact_name: '新联系人',
        contact_mobile: '13900139000',
        notes: '更新后的备注'
      }

      // 执行更新
      const result = await StoreService.updateStore(testStoreId, updateData, {
        operator_id: testUserId
      })

      // 验证更新结果
      expect(result.success).toBe(true)
      expect(result.store.store_name).toBe(updateData.store_name)
      expect(result.store.contact_name).toBe(updateData.contact_name)
      expect(result.store.contact_mobile).toBe(updateData.contact_mobile)
      expect(result.store.notes).toBe(updateData.notes)
    })

    it('应该拒绝更新不存在的门店', async () => {
      const updateData = {
        store_name: '新名称'
      }

      // 使用不存在的门店ID
      await expect(
        StoreService.updateStore(999999, updateData, { operator_id: testUserId || 1 })
      ).rejects.toThrow(/门店 ID.*不存在/)
    })

    it('应该拒绝更新门店编号为已存在的编号', async () => {
      if (!testStoreId) {
        console.warn('⚠️ 测试门店不存在，跳过此测试')
        return
      }

      // 获取另一个已存在的门店编号
      const existingStores = await StoreService.getStoreList({ page_size: 10 })
      const otherStore = existingStores.items.find(s => s.store_id !== testStoreId && s.store_code)

      if (otherStore) {
        // 尝试将门店编号更新为已存在的编号
        await expect(
          StoreService.updateStore(
            testStoreId,
            { store_code: otherStore.store_code },
            { operator_id: testUserId }
          )
        ).rejects.toThrow(/门店编号.*已被其他门店使用/)
      } else {
        console.warn('⚠️ 没有其他门店可用于测试编号冲突')
      }
    })
  })

  // ==================== P2-3-5: 门店状态测试 ====================

  describe('门店状态管理', () => {
    let statusTestStoreId = null

    beforeAll(async () => {
      // 创建一个用于状态测试的门店
      const hasCompleteRegion = Object.values(testRegionCodes).every(code => code !== null)

      if (hasCompleteRegion && testUserId) {
        const timestamp = Date.now()
        const storeData = {
          store_name: `状态测试门店_${timestamp}`,
          province_code: testRegionCodes.province_code,
          city_code: testRegionCodes.city_code,
          district_code: testRegionCodes.district_code,
          street_code: testRegionCodes.street_code,
          status: 'active'
        }

        try {
          const result = await StoreService.createStore(storeData, {
            operator_id: testUserId
          })
          statusTestStoreId = result.store.store_id
          createdStoreIds.push(statusTestStoreId)
          console.log(`✅ 创建状态测试门店: store_id=${statusTestStoreId}`)
        } catch (error) {
          console.warn('⚠️ 创建状态测试门店失败:', error.message)
        }
      }
    })

    it('应该成功将门店状态从 active 更新为 inactive', async () => {
      if (!statusTestStoreId) {
        console.warn('⚠️ 状态测试门店不存在，跳过此测试')
        return
      }

      // 更新状态为 inactive
      const result = await StoreService.updateStore(
        statusTestStoreId,
        { status: 'inactive' },
        { operator_id: testUserId }
      )

      expect(result.success).toBe(true)
      expect(result.store.status).toBe('inactive')
      // 中文显示名称由 attachDisplayNames 从字典表统一提供
      expect(result.store.status_display).toBe('已停用')
    })

    it('应该成功将门店状态从 inactive 更新为 active', async () => {
      if (!statusTestStoreId) {
        console.warn('⚠️ 状态测试门店不存在，跳过此测试')
        return
      }

      // 先确保状态是 inactive
      await StoreService.updateStore(
        statusTestStoreId,
        { status: 'inactive' },
        { operator_id: testUserId }
      )

      // 更新状态为 active
      const result = await StoreService.updateStore(
        statusTestStoreId,
        { status: 'active' },
        { operator_id: testUserId }
      )

      expect(result.success).toBe(true)
      expect(result.store.status).toBe('active')
      // 中文显示名称由 attachDisplayNames 从字典表统一提供
      expect(result.store.status_display).toBe('正常营业')
    })

    it('应该成功将门店状态更新为 pending', async () => {
      if (!statusTestStoreId) {
        console.warn('⚠️ 状态测试门店不存在，跳过此测试')
        return
      }

      // 更新状态为 pending
      const result = await StoreService.updateStore(
        statusTestStoreId,
        { status: 'pending' },
        { operator_id: testUserId }
      )

      expect(result.success).toBe(true)
      expect(result.store.status).toBe('pending')
      // 中文显示名称由 attachDisplayNames 从字典表统一提供
      expect(result.store.status_display).toBe('待审核')
    })
  })

  // ==================== 门店删除测试 ====================

  describe('deleteStore - 删除门店', () => {
    let deleteTestStoreId = null

    beforeEach(async () => {
      // 每个测试前创建一个新门店用于删除测试
      const hasCompleteRegion = Object.values(testRegionCodes).every(code => code !== null)

      if (hasCompleteRegion && testUserId) {
        const timestamp = Date.now()
        const storeData = {
          store_name: `删除测试门店_${timestamp}`,
          province_code: testRegionCodes.province_code,
          city_code: testRegionCodes.city_code,
          district_code: testRegionCodes.district_code,
          street_code: testRegionCodes.street_code,
          status: 'pending'
        }

        try {
          const result = await StoreService.createStore(storeData, {
            operator_id: testUserId
          })
          deleteTestStoreId = result.store.store_id
          // 注意：不加入 createdStoreIds，因为这些门店会被测试删除
        } catch (error) {
          console.warn('⚠️ 创建删除测试门店失败:', error.message)
        }
      }
    })

    afterEach(async () => {
      // 清理可能遗留的删除测试门店
      if (deleteTestStoreId) {
        try {
          await Store.destroy({
            where: { store_id: deleteTestStoreId },
            force: true
          })
        } catch (error) {
          // 忽略删除错误（可能已被测试删除）
        }
        deleteTestStoreId = null
      }
    })

    it('应该成功软删除门店（设置状态为 inactive）', async () => {
      if (!deleteTestStoreId) {
        console.warn('⚠️ 删除测试门店不存在，跳过此测试')
        return
      }

      // 软删除门店
      const result = await StoreService.deleteStore(deleteTestStoreId, {
        operator_id: testUserId,
        force: false
      })

      // 验证软删除结果
      expect(result.success).toBe(true)
      expect(result.message).toBe('门店已停用')
      expect(result.store.status).toBe('inactive')

      // 验证门店仍然存在
      const store = await StoreService.getStoreById(deleteTestStoreId)
      expect(store).not.toBeNull()
      expect(store.status).toBe('inactive')
    })

    it('应该成功硬删除门店', async () => {
      if (!deleteTestStoreId) {
        console.warn('⚠️ 删除测试门店不存在，跳过此测试')
        return
      }

      // 硬删除门店
      const result = await StoreService.deleteStore(deleteTestStoreId, {
        operator_id: testUserId,
        force: true
      })

      // 验证硬删除结果
      expect(result.success).toBe(true)
      expect(result.message).toBe('门店已永久删除')
      expect(result.deleted_store_id).toBe(deleteTestStoreId)

      // 验证门店已不存在
      const store = await StoreService.getStoreById(deleteTestStoreId)
      expect(store).toBeNull()

      // 清除引用，避免 afterEach 再次尝试删除
      deleteTestStoreId = null
    })

    it('应该拒绝删除不存在的门店', async () => {
      await expect(
        StoreService.deleteStore(999999, { operator_id: testUserId || 1 })
      ).rejects.toThrow(/门店 ID.*不存在/)
    })
  })

  // ==================== 门店统计测试 ====================

  describe('getStoreStats - 门店统计', () => {
    it('应该返回门店统计数据', async () => {
      // 获取统计数据
      const stats = await StoreService.getStoreStats()

      // 验证返回结构
      expect(stats).toHaveProperty('total')
      expect(stats).toHaveProperty('active')
      expect(stats).toHaveProperty('inactive')
      expect(stats).toHaveProperty('pending')
      expect(stats).toHaveProperty('total_staff')
      expect(stats).toHaveProperty('cities')

      // 验证数据类型
      expect(typeof stats.total).toBe('number')
      expect(typeof stats.active).toBe('number')
      expect(typeof stats.inactive).toBe('number')
      expect(typeof stats.pending).toBe('number')
      expect(typeof stats.total_staff).toBe('number')
      expect(typeof stats.cities).toBe('number')

      // 验证总数等于各状态之和
      expect(stats.total).toBe(stats.active + stats.inactive + stats.pending)
    })
  })

  describe('getStoreStatsByRegion - 按区域统计', () => {
    it('应该返回按省级区域的门店统计', async () => {
      const stats = await StoreService.getStoreStatsByRegion('province')

      // 验证返回类型
      expect(Array.isArray(stats)).toBe(true)

      // 验证数据结构
      if (stats.length > 0) {
        const item = stats[0]
        expect(item).toHaveProperty('code')
        expect(item).toHaveProperty('name')
        expect(item).toHaveProperty('count')
        expect(typeof item.count).toBe('number')
      }
    })

    it('应该返回按城市级别的门店统计', async () => {
      const stats = await StoreService.getStoreStatsByRegion('city')

      // 验证返回类型
      expect(Array.isArray(stats)).toBe(true)
    })
  })

  // ==================== 性能测试 ====================

  describe('性能测试', () => {
    it('门店列表查询应该在 1 秒内完成', async () => {
      const start = Date.now()
      await StoreService.getStoreList({ page_size: 100 })
      const duration = Date.now() - start

      expect(duration).toBeLessThan(1000)
    })

    it('门店详情查询应该在 500ms 内完成', async () => {
      const testStoreId = global.testData?.testStore?.store_id

      if (!testStoreId) {
        console.warn('⚠️ 测试门店不存在，跳过此测试')
        return
      }

      const start = Date.now()
      await StoreService.getStoreById(testStoreId)
      const duration = Date.now() - start

      expect(duration).toBeLessThan(500)
    })

    it('门店统计查询应该在 1 秒内完成', async () => {
      const start = Date.now()
      await StoreService.getStoreStats()
      const duration = Date.now() - start

      expect(duration).toBeLessThan(1000)
    })
  })
})
