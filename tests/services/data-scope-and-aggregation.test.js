'use strict'

/**
 * 数据范围隔离 + 消费多店聚合 + 低库存筛选 测试套件
 *
 * 兑现文档《权限与数据范围体系》§12.4 步骤6 / §15 承诺的验证用例：
 * - DataScopeService.getAccessibleStoreIds：admin=all、店长本店、店员本店、区域负责人辖区递归
 * - 消费列表多视角查询（MerchantService.getMerchantRecords 的 view: self/store/staff/all 口径）
 * - 低库存筛选（ExchangeItemService.listExchangeItems 的 low_stock_only）
 *
 * 测试原则（与项目既有约定一致）：
 * - 连真实库 `restaurant_points_dev`，不使用 mock；
 * - 「区域负责人递归」因真实库 user_hierarchy 为 0 行，测试内临时插入一条层级关系
 *   （regional_manager → 在职店员所在门店的递归可达），断言后在 afterAll 清理，绝不留脏数据。
 *
 * @module tests/services/data-scope-and-aggregation
 * @since 2026-06-24
 */

require('dotenv').config()

const DataScopeService = require('../../services/DataScopeService')
const MerchantService = require('../../services/consumption/MerchantService')
const ExchangeItemService = require('../../services/exchange/ExchangeItemService')
const { UserHierarchy } = require('../../models')

// 真实库锚点（连库实测）：user 32=admin(110)、12796=merchant_staff(20) 在 store 7、stores 仅 store 7
const ADMIN_USER_ID = 32
const STAFF_USER_ID = 12796
const STORE_ID = 7
// regional_manager 角色 role_id（连库实测）
const REGIONAL_ROLE_ID = 6

describe('数据范围隔离 + 多店聚合 + 低库存筛选（连真实库，无 mock）', () => {
  jest.setTimeout(60000)

  describe('DataScopeService.getAccessibleStoreIds', () => {
    test('管理员（role_level≥100）应返回 { scope: "all" }', async () => {
      const result = await DataScopeService.getAccessibleStoreIds(ADMIN_USER_ID)
      expect(result.scope).toBe('all')
    })

    test('店员应返回其在职门店集合（store_staff 在职门店）', async () => {
      const result = await DataScopeService.getAccessibleStoreIds(STAFF_USER_ID)
      expect(result.scope).toBe('stores')
      expect(result.store_ids).toContain(STORE_ID)
    })

    test('buildStoreWhere：管理员不加门店过滤（空 where），受限用户用 Op.in', () => {
      const adminWhere = DataScopeService.buildStoreWhere({ scope: 'all' })
      expect(Object.keys(adminWhere)).toHaveLength(0)

      const limitedWhere = DataScopeService.buildStoreWhere({ scope: 'stores', store_ids: [7] })
      expect(limitedWhere).toHaveProperty('store_id')
    })

    test('buildStoreWhere：可见门店为空时下发 [0]（防越权兜底，查不到任何记录）', () => {
      const emptyWhere = DataScopeService.buildStoreWhere({ scope: 'stores', store_ids: [] })
      const { Op } = require('sequelize')
      expect(emptyWhere.store_id[Op.in]).toEqual([0])
    })
  })

  describe('区域负责人辖区递归（临时层级数据，测试后清理）', () => {
    let tempHierarchyId = null

    beforeAll(async () => {
      /*
       * 临时构造一条层级关系，验证「上级 → 下级门店」的递归可达：
       * 让普通用户 12797 作为上级，在职店员 12796（挂在 STORE_ID）作为其下级，
       * 断言 getAccessibleStoreIds(12797) 经 getAllSubordinates 递归后能收到 STORE_ID。
       * （admin 走 scope='all' 不经递归，故用非管理员上级更贴近真实区域负责人场景）
       */
      const SUP_USER_ID = 12797
      // 先清理可能存在的同键记录（user_id+role_id 唯一）
      await UserHierarchy.destroy({
        where: { user_id: STAFF_USER_ID, role_id: REGIONAL_ROLE_ID }
      })
      const row = await UserHierarchy.create({
        user_id: STAFF_USER_ID,
        superior_user_id: SUP_USER_ID,
        role_id: REGIONAL_ROLE_ID,
        store_id: STORE_ID,
        is_active: true,
        activated_at: new Date()
      })
      tempHierarchyId = row.user_hierarchy_id
    })

    afterAll(async () => {
      if (tempHierarchyId) {
        await UserHierarchy.destroy({ where: { user_hierarchy_id: tempHierarchyId } })
      }
    })

    test('上级用户的可见范围应递归包含下级管辖门店', async () => {
      // SUP_USER_ID=12797 作为上级，其下级 12796 挂在 STORE_ID
      const result = await DataScopeService.getAccessibleStoreIds(12797)
      expect(result.scope).toBe('stores')
      // 递归（getAllSubordinates）应把下级门店 STORE_ID 纳入上级可见范围
      expect(result.store_ids).toContain(STORE_ID)
    })

    test('清理后该临时层级不再影响范围（验证无脏数据残留）', async () => {
      await UserHierarchy.destroy({ where: { user_hierarchy_id: tempHierarchyId } })
      tempHierarchyId = null
      const result = await DataScopeService.getAccessibleStoreIds(12797)
      // 12797 本身无 store_staff、无 hierarchy → 可见门店为空
      expect(result.scope).toBe('stores')
      expect(result.store_ids).not.toContain(STORE_ID)
    })
  })

  describe('消费列表多视角查询（MerchantService.getMerchantRecords，view 契约）', () => {
    test('管理员 view=all 查询不抛错且回显 view=all', async () => {
      const r = await MerchantService.getMerchantRecords({
        user_id: ADMIN_USER_ID,
        view: 'all',
        store_scope: 'all',
        page: 1,
        page_size: 10
      })
      expect(r.view).toBe('all')
      expect(Array.isArray(r.records)).toBe(true)
    })

    test('store 视角按可见门店集合聚合，回显 view=store', async () => {
      const r = await MerchantService.getMerchantRecords({
        user_id: STAFF_USER_ID,
        view: 'store',
        store_scope: 'stores',
        store_ids: [STORE_ID],
        page: 1,
        page_size: 10
      })
      expect(r.view).toBe('store')
      // 返回记录的门店应都在可见集合内
      r.records.forEach(rec => {
        if (rec.store_id != null) expect([STORE_ID]).toContain(rec.store_id)
      })
    })

    test('self 视角只看本人经手，回显 view=self', async () => {
      const r = await MerchantService.getMerchantRecords({
        user_id: STAFF_USER_ID,
        view: 'self',
        store_scope: 'stores',
        store_ids: [STORE_ID],
        page: 1,
        page_size: 10
      })
      expect(r.view).toBe('self')
      // self 模式：返回记录的经手人应都是本人
      r.records.forEach(rec => {
        if (rec.merchant_id != null) expect(rec.merchant_id).toBe(STAFF_USER_ID)
      })
    })

    test('store 视角可见门店为空集合时查不到任何记录（防越权兜底）', async () => {
      const r = await MerchantService.getMerchantRecords({
        user_id: STAFF_USER_ID,
        view: 'store',
        store_scope: 'stores',
        store_ids: [],
        page: 1,
        page_size: 10
      })
      expect(r.pagination.total).toBe(0)
    })
  })

  describe('低库存筛选（ExchangeItemService.listExchangeItems）', () => {
    const exchangeItemService = new ExchangeItemService(require('../../models'))

    test('low_stock_only=true 返回的商品库存均 ≤ 预警阈值（默认5）', async () => {
      const r = await exchangeItemService.listExchangeItems(
        { low_stock_only: 'true' },
        { page: 1, page_size: 50 }
      )
      const items = r.items || []
      items.forEach(it => {
        const stock = it.stock == null ? 0 : Number(it.stock)
        const threshold = it.stock_alert_threshold == null ? 5 : Number(it.stock_alert_threshold)
        expect(stock).toBeLessThanOrEqual(threshold)
      })
    })

    test('low_stock_only 不传时不施加低库存过滤（返回数 ≥ 低库存数）', async () => {
      const all = await exchangeItemService.listExchangeItems({}, { page: 1, page_size: 50 })
      const low = await exchangeItemService.listExchangeItems(
        { low_stock_only: 'true' },
        { page: 1, page_size: 50 }
      )
      expect(all.total).toBeGreaterThanOrEqual(low.total)
    })
  })

  describe('核销跨店订单列表（RedemptionService.getStoreScopedOrders）', () => {
    const RedemptionService = require('../../services/RedemptionService')

    test('管理员（store_scope=all）不抛错且 query_scope=all', async () => {
      const r = await RedemptionService.getStoreScopedOrders({
        store_scope: 'all',
        status: 'fulfilled',
        page: 1,
        page_size: 10
      })
      expect(r.query_scope).toBe('all')
      expect(Array.isArray(r.records)).toBe(true)
    })

    test('按可见门店集合聚合（query_scope=stores），返回订单核销门店在集合内', async () => {
      const r = await RedemptionService.getStoreScopedOrders({
        store_scope: 'stores',
        store_ids: [STORE_ID],
        status: 'fulfilled',
        page: 1,
        page_size: 10
      })
      expect(r.query_scope).toBe('stores')
      r.records.forEach(rec => {
        if (rec.fulfilled_store_id != null) {
          expect([STORE_ID]).toContain(rec.fulfilled_store_id)
        }
      })
    })

    test('可见门店为空集合时查不到任何核销订单（防越权兜底）', async () => {
      const r = await RedemptionService.getStoreScopedOrders({
        store_scope: 'stores',
        store_ids: [],
        status: 'fulfilled',
        page: 1,
        page_size: 10
      })
      expect(r.pagination.total).toBe(0)
    })
  })
})
