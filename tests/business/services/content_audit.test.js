/**
 * 内容审核引擎测试（原AuditService）
 *
 * 测试场景：
 * 1. 提交审核功能
 * 2. 审核通过流程
 * 3. 审核拒绝流程
 * 4. 审核记录查询
 * 5. 统计信息获取
 *
 * 创建时间：2025-10-11
 * 重命名时间：2025-10-12
 *
 * P1-9 J2-RepoWide 改造说明：
 * - ContentAuditEngine 通过 ServiceManager 获取（snake_case: content_audit）
 * - 模型直接引用用于测试数据准备/验证（业务测试场景合理）
 */

const { ContentReviewRecord, User, sequelize } = require('../../../models')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { TEST_DATA } = require('../../helpers/test-data')
const TransactionManager = require('../../../utils/TransactionManager')

// 🔴 P1-9：通过 ServiceManager 获取服务（替代直接 require）
let ContentAuditEngine

describe('ContentAuditEngine - 内容审核引擎测试', () => {
  let testUser, testContentReviewRecord

  beforeAll(async () => {
    // 🔴 P1-9：通过 ServiceManager 获取服务实例（snake_case key）
    ContentAuditEngine = global.getTestService('content_audit')

    // 创建测试用户（审核员） - 使用统一测试数据
    testUser = await User.findOne({
      where: { mobile: TEST_DATA.users.testUser.mobile }
    })

    if (!testUser) {
      throw new Error('测试用户不存在，请确保数据库有测试数据')
    }
  })

  describe('submitForAudit - 提交审核', () => {
    it('应该成功创建审核记录', async () => {
      const result = await ContentAuditEngine.submitForAudit('exchange', 1, {
        priority: 'high',
        auditData: { test: 'data' }
      })

      expect(result).toBeDefined()
      expect(result.auditable_type).toBe('exchange')
      expect(result.auditable_id).toBe(1)
      expect(result.audit_status).toBe('pending')
      expect(result.priority).toBe('high')

      testContentReviewRecord = result
    })

    it('应该防止重复提交审核', async () => {
      const result = await ContentAuditEngine.submitForAudit('exchange', 1)

      // 应该返回已存在的审核记录（BIGINT类型转换为字符串）
      expect(result.audit_id.toString()).toBe(testContentReviewRecord.audit_id.toString())
    })

    it('应该拒绝不支持的审核类型', async () => {
      await expect(ContentAuditEngine.submitForAudit('invalid_type', 1)).rejects.toThrow(
        '不支持的审核类型'
      )
    })
  })

  describe('approve - 审核通过', () => {
    let approveContentReviewRecord

    beforeAll(async () => {
      // 创建一个待审核记录用于测试审核通过
      approveContentReviewRecord = await ContentReviewRecord.create({
        auditable_type: 'feedback',
        auditable_id: 999,
        audit_status: 'pending',
        priority: 'medium',
        submitted_at: BeijingTimeHelper.createDatabaseTime()
      })
    })

    it('应该成功审核通过', async () => {
      const result = await TransactionManager.execute(async transaction => {
        return await ContentAuditEngine.approve(
          approveContentReviewRecord.audit_id,
          testUser.user_id,
          '测试审核通过',
          { transaction }
        )
      })

      expect(result.success).toBe(true)
      expect(result.audit_record.audit_status).toBe('approved')
      expect(result.audit_record.auditor_id).toBe(testUser.user_id)
      expect(result.audit_record.audit_reason).toBe('测试审核通过')
    })

    it('应该拒绝审核不存在的记录', async () => {
      await expect(
        TransactionManager.execute(async transaction => {
          return await ContentAuditEngine.approve(999999, testUser.user_id, '测试', { transaction })
        })
      ).rejects.toThrow('审核记录不存在')
    })

    it('应该拒绝审核已处理的记录', async () => {
      await expect(
        TransactionManager.execute(async transaction => {
          return await ContentAuditEngine.approve(
            approveContentReviewRecord.audit_id,
            testUser.user_id,
            '重复审核',
            { transaction }
          )
        })
      ).rejects.toThrow('审核记录状态不正确')
    })
  })

  describe('reject - 审核拒绝', () => {
    let rejectContentReviewRecord

    beforeAll(async () => {
      // 创建一个待审核记录用于测试审核拒绝
      rejectContentReviewRecord = await ContentReviewRecord.create({
        auditable_type: 'feedback',
        auditable_id: 998,
        audit_status: 'pending',
        priority: 'low',
        submitted_at: BeijingTimeHelper.createDatabaseTime()
      })
    })

    it('应该成功审核拒绝', async () => {
      const result = await TransactionManager.execute(async transaction => {
        return await ContentAuditEngine.reject(
          rejectContentReviewRecord.audit_id,
          testUser.user_id,
          '测试审核拒绝原因',
          { transaction }
        )
      })

      expect(result.success).toBe(true)
      expect(result.audit_record.audit_status).toBe('rejected')
      expect(result.audit_record.auditor_id).toBe(testUser.user_id)
      expect(result.audit_record.audit_reason).toBe('测试审核拒绝原因')
    })

    it('应该要求提供拒绝原因', async () => {
      const newRecord = await ContentReviewRecord.create({
        auditable_type: 'feedback',
        auditable_id: 997,
        audit_status: 'pending',
        submitted_at: BeijingTimeHelper.createDatabaseTime()
      })

      await expect(
        TransactionManager.execute(async transaction => {
          return await ContentAuditEngine.reject(newRecord.audit_id, testUser.user_id, '', {
            transaction
          })
        })
      ).rejects.toThrow('拒绝原因必须提供')
    })
  })

  describe('getPendingAudits - 获取待审核记录', () => {
    beforeAll(async () => {
      /*
       * 创建多个测试审核记录
       * 2026-01-08 修复：移除 auditable_type='image'（image 审核已废弃）
       */
      await ContentReviewRecord.bulkCreate([
        {
          auditable_type: 'exchange',
          auditable_id: 101,
          audit_status: 'pending',
          priority: 'high',
          submitted_at: BeijingTimeHelper.createDatabaseTime()
        },
        {
          auditable_type: 'feedback',
          auditable_id: 102,
          audit_status: 'pending',
          priority: 'medium',
          submitted_at: BeijingTimeHelper.createDatabaseTime()
        }
      ])
    })

    it('应该获取所有待审核记录', async () => {
      const audits = await ContentAuditEngine.getPendingAudits()

      expect(Array.isArray(audits)).toBe(true)
      expect(audits.length).toBeGreaterThan(0)
      expect(audits[0].audit_status).toBe('pending')
    })

    it('应该按类型过滤待审核记录', async () => {
      const audits = await ContentAuditEngine.getPendingAudits({
        auditableType: 'exchange'
      })

      expect(audits.every(a => a.auditable_type === 'exchange')).toBe(true)
    })

    it('应该支持分页查询', async () => {
      const audits = await ContentAuditEngine.getPendingAudits({
        limit: 2,
        offset: 0
      })

      expect(audits.length).toBeLessThanOrEqual(2)
    })
  })

  describe('getAuditStatistics - 获取统计信息', () => {
    it('应该获取全部统计信息', async () => {
      const stats = await ContentAuditEngine.getAuditStatistics()

      expect(stats).toHaveProperty('total')
      expect(stats).toHaveProperty('pending')
      expect(stats).toHaveProperty('approved')
      expect(stats).toHaveProperty('rejected')
      expect(stats).toHaveProperty('approval_rate')
    })

    it('应该按类型获取统计信息', async () => {
      const stats = await ContentAuditEngine.getAuditStatistics('exchange')

      expect(stats).toHaveProperty('total')
      expect(typeof stats.total).toBe('number')
    })
  })

  afterAll(async () => {
    /*
     * 清理测试数据
     * 2026-01-08 修复：移除 'image' 类型（image 审核已废弃）
     */
    try {
      await ContentReviewRecord.destroy({
        where: {
          auditable_type: ['exchange', 'feedback'],
          auditable_id: { [require('sequelize').Op.in]: [1, 999, 998, 997, 101, 102] }
        }
      })
    } catch (error) {
      console.error('清理测试数据失败:', error.message)
    }

    await sequelize.close()
  })
})
