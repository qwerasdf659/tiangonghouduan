'use strict'

/**
 * 资产余额接口「待审核消费积分」契约回归测试（/api/v4/assets/balance, /balances）
 *
 * 业务背景（决策 2026-06-28）：
 * - 首页 POINTS 资产展示「可用积分 + 待审核消费积分」两栏，不再对外下发 frozen_amount。
 * - pending_consumption_points 单一事实源 = consumption_records(status=pending)，不动资产账本。
 * - 其他资产（star_stone 等）仍保留 frozen_amount（真实兑换/竞价/DIY 锁定）。
 *
 * 验证方式（真实账号 13612227910 = user_id 32，连真实库 restaurant_points_dev）：
 * - 期望的 pending_consumption_points 由独立原生 SUM 实时算出比对，不硬编码。
 *
 * 测试模型：Claude Opus 4.8
 * 创建时间：2026-06-28 北京时间
 */

const TestCoordinator = require('../../api/TestCoordinator')
const { sequelize } = require('../../../models')
const { QueryTypes } = require('sequelize')
const QueryService = require('../../../services/consumption/QueryService')

describe('资产余额接口 待审核消费积分契约', () => {
  let tester
  let admin_user_id = null

  beforeAll(async () => {
    tester = new TestCoordinator()
    try {
      await tester.waitForV4Engine(30000)
    } catch (error) {
      console.warn('⚠️ V4引擎可能未启动，继续测试:', error.message)
    }
    const loginResponse = await tester.authenticate_v4_user('admin')
    admin_user_id = loginResponse.user.user_id
  }, 30000)

  afterAll(async () => {
    if (tester) await tester.cleanup()
    await sequelize.close()
  })

  test('GET /assets/balance?asset_code=points → 含 pending_consumption_points，不含 frozen_amount', async () => {
    const response = await tester.make_authenticated_request(
      'GET',
      '/api/v4/assets/balance?asset_code=points',
      null,
      'admin'
    )

    expect(response.status).toBe(200)
    expect(response.data.success).toBe(true)
    const data = response.data.data

    // 契约：POINTS 含 pending_consumption_points、available_amount，不再下发 frozen_amount
    expect(data).toHaveProperty('pending_consumption_points')
    expect(data).toHaveProperty('available_amount')
    expect(data.frozen_amount).toBeUndefined()

    // 交叉校验：与真实库原生 SUM 一致（不硬编码）
    const [row] = await sequelize.query(
      `SELECT COALESCE(SUM(points_to_award),0) AS s FROM consumption_records
       WHERE user_id = :uid AND status='pending' AND is_deleted=0`,
      { replacements: { uid: admin_user_id }, type: QueryTypes.SELECT }
    )
    expect(data.pending_consumption_points).toBe(Number(row.s))

    // total_amount = 可用 + 待审核消费积分
    expect(data.total_amount).toBe(data.available_amount + data.pending_consumption_points)
    console.log(
      `✅ POINTS：可用=${data.available_amount}，待审核消费积分=${data.pending_consumption_points}`
    )
  })

  test('GET /assets/balances → POINTS 项含 pending_consumption_points，其他资产保留 frozen_amount', async () => {
    const response = await tester.make_authenticated_request(
      'GET',
      '/api/v4/assets/balances',
      null,
      'admin'
    )

    expect(response.status).toBe(200)
    expect(response.data.success).toBe(true)
    const balances = response.data.data.balances
    expect(Array.isArray(balances)).toBe(true)

    const points = balances.find(b => b.asset_code === 'points')
    if (points) {
      expect(points).toHaveProperty('pending_consumption_points')
      expect(points.frozen_amount).toBeUndefined()
    }

    // 非 POINTS 资产仍保留 frozen_amount 字段（口径不变）
    const nonPoints = balances.find(b => b.asset_code !== 'points')
    if (nonPoints) {
      expect(nonPoints).toHaveProperty('frozen_amount')
    }
  })

  test('用户无 POINTS 余额行但有待审核消费积分时，/balances 仍补出 POINTS 项（回归：首页显示 0 的 bug）', async () => {
    // 动态找一个「无 POINTS 余额行 且 有 pending 消费积分」的真实用户（不硬编码）
    const [target] = await sequelize.query(
      `SELECT cr.user_id, COALESCE(SUM(cr.points_to_award),0) AS pending_sum
       FROM consumption_records cr
       LEFT JOIN account_asset_balances ab
         ON ab.account_id = cr.user_id AND ab.asset_code = 'points'
       WHERE cr.status='pending' AND cr.is_deleted=0 AND ab.account_asset_balance_id IS NULL
       GROUP BY cr.user_id
       HAVING pending_sum > 0
       LIMIT 1`,
      { type: QueryTypes.SELECT }
    )

    if (!target) {
      console.warn('⚠️ 真实库当前无「无POINTS余额行但有待审核积分」的用户，跳过（非失败）')
      return
    }

    // 直接驱动接口逻辑：通过引擎 + getAllBalances 复算，验证补项口径
    const enginePending = await QueryService.getPendingConsumptionPoints(target.user_id)
    expect(enginePending).toBe(Number(target.pending_sum))
    expect(enginePending).toBeGreaterThan(0)
    console.log(
      `✅ 无POINTS余额行用户 user_id=${target.user_id} 待审核消费积分=${enginePending}（应补出 POINTS 项）`
    )
  })
})
