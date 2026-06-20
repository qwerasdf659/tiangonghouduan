/**
 * ApprovalChainService - 分级审核链升级单元测试（2026-06-20）
 *
 * 测试范围（只读，不写库，避免污染真实库 restaurant_points_dev）：
 * - getApprovalStats：按门店/区域聚合的审核统计（待审/已审/超时/通过率/金额/积分）
 * - _getUserScopedStoreIds：用户"可审门店集合"计算（store_staff + user_hierarchy）
 * - _sumStatsRows：统计行汇总（通过率口径）
 *
 * 业务背景：
 * - 这些方法支撑"门店/区域隔离"与 Web 管理端数据看板（第八/十一章方案）
 * - 验证统计口径与业务一致：通过率 = 已通过 /（已通过 + 已拒绝），超时为独立维度
 *
 * @since 2026-06-20
 */

'use strict'

const { sequelize } = require('../../models')

// 通过 ServiceManager 获取服务实例（snake_case key）
let ApprovalChainService

jest.setTimeout(30000)

describe('ApprovalChainService - 分级审核链升级（门店/区域隔离 + 统计看板）', () => {
  beforeAll(async () => {
    await sequelize.authenticate()
    ApprovalChainService = global.getTestService('approval_chain')
    if (!ApprovalChainService) {
      throw new Error('ApprovalChainService 未注册到 ServiceManager')
    }
  })

  afterAll(async () => {
    await sequelize.close()
  })

  // ==================== getApprovalStats - 审核统计聚合 ====================

  describe('getApprovalStats - 审核数据统计聚合', () => {
    it('按门店维度应返回统计行与汇总，且字段齐全', async () => {
      const result = await ApprovalChainService.getApprovalStats({ dimension: 'store' })

      expect(result).toBeDefined()
      expect(result.dimension).toBe('store')
      expect(Array.isArray(result.rows)).toBe(true)
      expect(result.summary).toBeDefined()

      // 汇总字段齐全（看板必需）
      const s = result.summary
      for (const key of [
        'pending',
        'approved',
        'rejected',
        'expired',
        'timeout',
        'total',
        'amount',
        'points',
        'pass_rate',
        'avg_duration_seconds',
        'avg_duration_text',
        'timeout_rate'
      ]) {
        expect(s[key]).toBeDefined()
      }

      // 每个门店行包含门店标识 + 状态分布 + 时效字段
      result.rows.forEach(row => {
        expect(row.store_id).toBeDefined()
        expect(typeof row.pending).toBe('number')
        expect(typeof row.approved).toBe('number')
        expect(typeof row.timeout).toBe('number')
        // 审核时效字段（9.3）
        expect(typeof row.avg_duration_seconds).toBe('number')
        expect(typeof row.timeout_rate).toBe('number')
        expect(typeof row.avg_duration_text).toBe('string')
        // total 应等于各状态之和（业务一致性）
        expect(row.total).toBe(row.pending + row.approved + row.rejected + row.expired)
      })
    })

    it('通过率口径应为 已通过/(已通过+已拒绝)，无已审结时为 0', async () => {
      const result = await ApprovalChainService.getApprovalStats({ dimension: 'store' })
      result.rows.forEach(row => {
        const finished = row.approved + row.rejected
        const expected = finished > 0 ? Math.round((row.approved / finished) * 10000) / 100 : 0
        expect(row.pass_rate).toBe(expected)
      })
    })

    it('按区域维度应返回区域聚合行（经 user_hierarchy 聚合门店）', async () => {
      const result = await ApprovalChainService.getApprovalStats({ dimension: 'region' })
      expect(result.dimension).toBe('region')
      expect(Array.isArray(result.rows)).toBe(true)
      result.rows.forEach(row => {
        expect(row.region_key).toBeDefined()
        expect(typeof row.store_count).toBe('number')
        expect(row.store_count).toBeGreaterThanOrEqual(1)
      })
    })

    it('无效维度参数应回退为 store 维度', async () => {
      const result = await ApprovalChainService.getApprovalStats({ dimension: 'invalid' })
      expect(result.dimension).toBe('store')
    })
  })

  // ==================== getOperationAnalytics - 运营分析（8.4.3）====================

  describe('getOperationAnalytics - 运营分析看板', () => {
    it('应返回 4 类分析且结构完整（员工排行/趋势/拒绝原因/复购活跃）', async () => {
      const result = await ApprovalChainService.getOperationAnalytics({ days: 365 })
      expect(result.window_days).toBe(365)
      expect(Array.isArray(result.staff_ranking)).toBe(true)
      expect(Array.isArray(result.trend)).toBe(true)
      expect(Array.isArray(result.reject_reasons)).toBe(true)
      expect(result.user_activity).toBeDefined()
      // 复购口径：回头客 + 新客 = 总消费用户
      const ua = result.user_activity
      expect(ua.repeat_customers + ua.single_customers).toBe(ua.total_customers)
    })

    it('用户复购活跃只返回聚合数字，不含 PII（user_id/mobile/nickname）', async () => {
      const result = await ApprovalChainService.getOperationAnalytics({ days: 365 })
      const uaKeys = Object.keys(result.user_activity)
      expect(uaKeys).not.toContain('user_id')
      expect(uaKeys).not.toContain('mobile')
      expect(uaKeys).not.toContain('nickname')
      expect(uaKeys).toContain('repeat_rate')
    })

    it('days 参数应被限制在 1~365 范围内', async () => {
      const result = await ApprovalChainService.getOperationAnalytics({ days: 99999 })
      expect(result.window_days).toBe(365)
    })

    it('应返回审核人时效（平均审核耗时+超时率，9.3）', async () => {
      const result = await ApprovalChainService.getOperationAnalytics({ days: 365 })
      expect(Array.isArray(result.reviewer_duration)).toBe(true)
      result.reviewer_duration.forEach(rv => {
        expect(typeof rv.reviewer_id).toBe('number')
        expect(typeof rv.avg_duration_seconds).toBe('number')
        expect(typeof rv.avg_duration_text).toBe('string')
        expect(typeof rv.timeout_rate).toBe('number')
        expect(rv.timeout_rate).toBeGreaterThanOrEqual(0)
        expect(rv.timeout_rate).toBeLessThanOrEqual(100)
      })
    })
  })

  // ==================== _formatDurationSeconds - 耗时文案 ====================

  describe('_formatDurationSeconds - 审核耗时友好文案', () => {
    it('应正确格式化各量级耗时', () => {
      expect(ApprovalChainService._formatDurationSeconds(0)).toBe('0秒')
      expect(ApprovalChainService._formatDurationSeconds(45)).toBe('45秒')
      expect(ApprovalChainService._formatDurationSeconds(120)).toBe('2分钟')
      expect(ApprovalChainService._formatDurationSeconds(8950)).toBe('2小时29分')
      expect(ApprovalChainService._formatDurationSeconds(90000)).toBe('1天1小时')
    })
  })

  // ==================== _sumStatsRows - 统计汇总 ====================

  describe('_sumStatsRows - 统计行汇总', () => {
    it('应正确累加各状态并计算通过率', () => {
      const rows = [
        {
          pending: 1,
          approved: 8,
          rejected: 2,
          expired: 0,
          timeout: 1,
          total: 11,
          amount: 100,
          points: 50
        },
        {
          pending: 2,
          approved: 2,
          rejected: 0,
          expired: 1,
          timeout: 0,
          total: 5,
          amount: 50.5,
          points: 20
        }
      ]
      const summary = ApprovalChainService._sumStatsRows(rows)
      expect(summary.pending).toBe(3)
      expect(summary.approved).toBe(10)
      expect(summary.rejected).toBe(2)
      expect(summary.timeout).toBe(1)
      expect(summary.amount).toBeCloseTo(150.5, 2)
      expect(summary.points).toBe(70)
      // 通过率 = 10 / (10 + 2) = 83.33%
      expect(summary.pass_rate).toBe(83.33)
    })

    it('空数据时通过率应为 0', () => {
      const summary = ApprovalChainService._sumStatsRows([])
      expect(summary.total).toBe(0)
      expect(summary.pass_rate).toBe(0)
    })
  })

  // ==================== _getUserScopedStoreIds - 可审门店集合 ====================

  describe('_getUserScopedStoreIds - 用户可审门店集合', () => {
    it('应返回 Set 类型（门店/区域隔离基础）', async () => {
      // 用管理员测试账号 user_id（不存在任职/层级时返回空集合，合法）
      const adminUserId =
        (global.testData && global.testData.adminUser && global.testData.adminUser.user_id) || 1
      const storeIds = await ApprovalChainService._getUserScopedStoreIds(adminUserId)
      expect(storeIds instanceof Set).toBe(true)
      // 集合内元素应均为数字门店ID
      storeIds.forEach(id => expect(typeof id).toBe('number'))
    })
  })

  // ==================== batchAssignNodeReviewer - 批量配置审核人（9.3③）====================

  describe('batchAssignNodeReviewer - 批量配置审核人参数校验', () => {
    const TransactionManager = require('../../utils/TransactionManager')

    it('template_ids 为空应抛 APPROVAL_INVALID', async () => {
      await expect(
        TransactionManager.execute(
          async transaction =>
            ApprovalChainService.batchAssignNodeReviewer(
              { template_ids: [], assignee_type: 'submitter_manager' },
              { transaction }
            ),
          { description: 'test' }
        )
      ).rejects.toMatchObject({ code: 'APPROVAL_INVALID' })
    })

    it('非法 assignee_type 应抛 APPROVAL_INVALID', async () => {
      await expect(
        TransactionManager.execute(
          async transaction =>
            ApprovalChainService.batchAssignNodeReviewer(
              { template_ids: [1], assignee_type: 'bad_type' },
              { transaction }
            ),
          { description: 'test' }
        )
      ).rejects.toMatchObject({ code: 'APPROVAL_INVALID' })
    })

    it('role 模式缺 assignee_role_id 应抛 APPROVAL_INVALID', async () => {
      await expect(
        TransactionManager.execute(
          async transaction =>
            ApprovalChainService.batchAssignNodeReviewer(
              { template_ids: [1], assignee_type: 'role' },
              { transaction }
            ),
          { description: 'test' }
        )
      ).rejects.toMatchObject({ code: 'APPROVAL_INVALID' })
    })

    it('不存在的模板ID应返回 failed（不抛错，部分成功语义）', async () => {
      const result = await TransactionManager.execute(
        async transaction =>
          ApprovalChainService.batchAssignNodeReviewer(
            { template_ids: [99999999], assignee_type: 'submitter_manager' },
            { transaction }
          ),
        { description: 'test' }
      )
      expect(result.stats.total).toBe(1)
      expect(result.stats.failed_count).toBe(1)
      expect(result.results[0].success).toBe(false)
    })
  })
})
