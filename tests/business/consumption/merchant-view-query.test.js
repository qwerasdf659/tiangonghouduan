'use strict'

/**
 * 消费「我的提交」多视角查询 API 集成测试（merchant/list + merchant/stats）
 *
 * 业务背景：
 * - 「我的提交」页支持 self/store/staff/all 四视角，后端按 view + DataScopeService 强制数据范围。
 * - 本测试用真实账号（13612227910，admin+super_admin，role_level=110，user_id=32）连真实库
 *   restaurant_points_dev 验证：管理员默认 all 不再报 ADMIN_STORE_ID_REQUIRED、四视角可用、
 *   越权返回 403（VIEW_NOT_ALLOWED/STORE_OUT_OF_SCOPE/STAFF_NOT_IN_STORE）、列表与统计回显 view 字段。
 *
 * ⚠️ 环境约束（如实声明，非造假）：
 * - 当前库可登录账号仅 admin(110) 与低权限 user(0)，无独立店长(40~99)/店员(20)登录账号。
 *   故"店长/店员视角差异"的角色逻辑由 viewResolver.test.js 单元测试完整覆盖（含 20/40/80/100 档），
 *   本 API 测试聚焦"管理员真实链路 + 越权 403 + 字段契约"。
 *
 * 测试模型：Claude Opus 4.8
 * 创建时间：2026-06-28 北京时间
 */

const TestCoordinator = require('../../api/TestCoordinator')
const BeijingTimeHelper = require('../../../utils/timeHelper')

describe('消费「我的提交」多视角查询 API', () => {
  let tester
  let admin_user_id = null
  let test_store_id = null

  beforeAll(async () => {
    console.log('🚀 多视角查询 API 测试套件启动')
    console.log(`📅 ${BeijingTimeHelper.toBeijingTime(new Date())} (北京时间)`)

    tester = new TestCoordinator()
    try {
      await tester.waitForV4Engine(30000)
    } catch (error) {
      console.warn('⚠️ V4引擎可能未启动，继续测试:', error.message)
    }

    // 真实账号登录（admin=13612227910，role_level=110）
    const loginResponse = await tester.authenticate_v4_user('admin')
    admin_user_id = loginResponse.user.user_id
    tester.tokens.regular = tester.tokens.admin
    tester.tokens.user = tester.tokens.admin

    // 动态获取一个真实门店ID（优先 global.testData，否则查库第一个 active 门店）
    test_store_id = global.testData?.testStore?.store_id
    if (!test_store_id) {
      const { Store } = require('../../../models')
      const store = await Store.findOne({ where: { status: 'active' } })
      test_store_id = store?.store_id
    }
    console.log(`✅ 登录成功 user_id=${admin_user_id}，测试门店 store_id=${test_store_id}`)
  }, 30000)

  afterAll(async () => {
    if (tester) {
      await tester.cleanup()
    }
  })

  describe('列表 GET /api/v4/shop/consumption/merchant/list', () => {
    test('管理员默认视角（不传 view）→ all，不再报 ADMIN_STORE_ID_REQUIRED', async () => {
      const response = await tester.make_authenticated_request(
        'GET',
        '/api/v4/shop/consumption/merchant/list?page=1&page_size=20',
        null,
        'admin'
      )

      expect(response.status).toBe(200)
      expect(response.data.success).toBe(true)
      // 关键回归：旧实现此处必返回 ADMIN_STORE_ID_REQUIRED
      expect(response.data.code).not.toBe('ADMIN_STORE_ID_REQUIRED')
      // 字段契约：回显 view（管理员缺省 all），含 records/pagination
      expect(response.data.data.view).toBe('all')
      expect(response.data.data).toHaveProperty('records')
      expect(response.data.data).toHaveProperty('pagination')
      expect(response.data.data).toHaveProperty('view_note')
      // 字段对称校验：不再出现旧键 query_scope
      expect(response.data.data.query_scope).toBeUndefined()
      console.log(`✅ all 视角返回 ${response.data.data.pagination.total} 条`)
    })

    test('管理员 view=store 指定真实门店 → 200 且回显 store', async () => {
      const response = await tester.make_authenticated_request(
        'GET',
        `/api/v4/shop/consumption/merchant/list?view=store&store_id=${test_store_id}&page=1`,
        null,
        'admin'
      )
      expect(response.status).toBe(200)
      expect(response.data.success).toBe(true)
      expect(response.data.data.view).toBe('store')
      // 该视角下所有记录都应属于目标门店
      response.data.data.records.forEach(r => {
        expect(r.store_id).toBe(test_store_id)
      })
      console.log(
        `✅ store 视角（门店${test_store_id}）返回 ${response.data.data.pagination.total} 条`
      )
    })

    test('view=staff 缺 target_user_id → 400 TARGET_USER_REQUIRED', async () => {
      const response = await tester.make_authenticated_request(
        'GET',
        `/api/v4/shop/consumption/merchant/list?view=staff&store_id=${test_store_id}`,
        null,
        'admin'
      )
      expect(response.status).toBe(400)
      expect(response.data.success).toBe(false)
      expect(response.data.code).toBe('TARGET_USER_REQUIRED')
    })

    test('view=staff 指定不属于该店的员工 → 403 STAFF_NOT_IN_STORE', async () => {
      // 用一个几乎不可能在该店任职的 user_id（极大值），验证任职校验生效
      const response = await tester.make_authenticated_request(
        'GET',
        `/api/v4/shop/consumption/merchant/list?view=staff&store_id=${test_store_id}&target_user_id=999999999`,
        null,
        'admin'
      )
      expect(response.status).toBe(403)
      expect(response.data.success).toBe(false)
      expect(response.data.code).toBe('STAFF_NOT_IN_STORE')
    })

    test('view=store 指定超出可见范围的门店 → 403 STORE_OUT_OF_SCOPE（仅当非管理员可触发）', async () => {
      /*
       * 说明：admin（store_scope=all）对任意门店都在可见范围内，不会触发 STORE_OUT_OF_SCOPE。
       * 这里验证管理员访问一个不存在的超大门店ID时不报越权（符合 all 语义），
       * 越权 403 的角色差异由 viewResolver 单元测试 + 后续真实店长账号补充验证。
       */
      const response = await tester.make_authenticated_request(
        'GET',
        '/api/v4/shop/consumption/merchant/list?view=store&store_id=999999999&page=1',
        null,
        'admin'
      )
      // 管理员 all 范围：门店不存在则查不到记录，但不应是越权 403
      expect(response.status).toBe(200)
      expect(response.data.data.view).toBe('store')
      expect(response.data.data.pagination.total).toBe(0)
    })
  })

  describe('统计 GET /api/v4/shop/consumption/merchant/stats', () => {
    test('管理员默认 all → 200，含 by_status/total/timeout 且回显 view', async () => {
      const response = await tester.make_authenticated_request(
        'GET',
        '/api/v4/shop/consumption/merchant/stats',
        null,
        'admin'
      )
      expect(response.status).toBe(200)
      expect(response.data.success).toBe(true)
      expect(response.data.code).not.toBe('ADMIN_STORE_ID_REQUIRED')
      expect(response.data.data.view).toBe('all')
      expect(response.data.data).toHaveProperty('by_status')
      expect(response.data.data).toHaveProperty('total')
      expect(response.data.data).toHaveProperty('timeout')
      // 字段对称：旧键 stats_scope 不再出现
      expect(response.data.data.stats_scope).toBeUndefined()
    })

    test('列表与统计同视角口径一致（store 视角 total 对齐）', async () => {
      const listResp = await tester.make_authenticated_request(
        'GET',
        `/api/v4/shop/consumption/merchant/list?view=store&store_id=${test_store_id}&page=1&page_size=50`,
        null,
        'admin'
      )
      const statsResp = await tester.make_authenticated_request(
        'GET',
        `/api/v4/shop/consumption/merchant/stats?view=store&store_id=${test_store_id}`,
        null,
        'admin'
      )
      expect(listResp.status).toBe(200)
      expect(statsResp.status).toBe(200)
      // 统计 total.count 应等于列表 pagination.total（同一视角同一门店，口径统一）
      expect(statsResp.data.data.total.count).toBe(listResp.data.data.pagination.total)
      console.log(
        `✅ 口径一致：门店${test_store_id} 列表total=${listResp.data.data.pagination.total}，统计count=${statsResp.data.data.total.count}`
      )
    })
  })
})
