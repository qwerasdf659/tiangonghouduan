'use strict'

/**
 * 数据自动清理定时任务测试套件
 *
 * 测试目标：
 * - DataManagementService.runAutoCleanup() 核心清理逻辑
 * - DataManagementService.getStats() 数据统计
 * - DataManagementService.getPolicies() 策略配置读取
 * - DataManagementService.previewCleanup() 影响预览
 * - L0 保护机制验证（accounts 系统账户不被误删）
 * - L2 清理类目完整性验证（含 monitoring_metrics）
 * - 筛选条件验证（user_id / lottery_campaign_id / business_type_prefix）
 * - Preview Token Redis 存储验证
 *
 * 业务规则：
 * - L0 表（sequelizemeta / administrative_regions / accounts / roles 等）永远不可删
 * - accounts 表 system 类型账户必须被保护
 * - L3 表按 retention_days 策略自动清理
 * - 清理操作通过 AuditLogService 记录审计日志
 *
 * @module tests/jobs/daily-data-cleanup
 * @since 2026-03-14
 */

require('dotenv').config()

const DataManagementService = require('../../services/DataManagementService')
const models = require('../../models')

describe('DataManagementService - 数据管理核心服务', () => {
  jest.setTimeout(60000)

  let service

  beforeAll(() => {
    service = new DataManagementService(models)
  })

  describe('getStats() - 数据量统计', () => {
    test('应返回完整的数据库统计信息', async () => {
      const stats = await service.getStats()

      expect(stats).toBeDefined()
      expect(stats).toHaveProperty('database_size_mb')
      expect(stats).toHaveProperty('table_count')
      expect(stats).toHaveProperty('by_level')
      expect(stats).toHaveProperty('top_tables')
      expect(stats).toHaveProperty('categories')

      expect(Number(stats.database_size_mb)).toBeGreaterThan(0)
      expect(stats.table_count).toBeGreaterThan(0)

      console.log(
        `[数据统计] 数据库大小: ${stats.database_size_mb} MB, 表数量: ${stats.table_count}`
      )
    })

    test('应按安全等级正确分类所有表', async () => {
      const stats = await service.getStats()
      const { by_level } = stats

      expect(by_level).toHaveProperty('L0')
      expect(by_level).toHaveProperty('L1')
      expect(by_level).toHaveProperty('L2')
      expect(by_level).toHaveProperty('L3')

      expect(by_level.L0.count).toBeGreaterThan(0)

      const l0TableNames = by_level.L0.tables.map(t => t.table_name)
      expect(l0TableNames).toContain('accounts')
      expect(l0TableNames).toContain('roles')
      expect(l0TableNames).toContain('sequelizemeta')

      console.log(
        `[安全等级] L0: ${by_level.L0.count}, L1: ${by_level.L1.count}, ` +
          `L2: ${by_level.L2.count}, L3: ${by_level.L3.count}`
      )
    })

    test('应包含 monitoring_metrics 清理类目', async () => {
      const stats = await service.getStats()
      const categoryKeys = stats.categories.map(c => c.key)

      expect(categoryKeys).toContain('monitoring_metrics')
      expect(categoryKeys).toContain('lottery_monitoring')
      expect(categoryKeys).toContain('lottery_records')
      expect(categoryKeys).toContain('consumption_records')
      expect(categoryKeys).toContain('customer_service')
      expect(categoryKeys).toContain('notifications')
      expect(categoryKeys).toContain('feedbacks')

      const metricsCategory = stats.categories.find(c => c.key === 'monitoring_metrics')
      expect(metricsCategory.label).toBe('监控指标')
      expect(metricsCategory.table_count).toBe(2)
    })
  })

  describe('getPolicies() - 自动清理策略', () => {
    test('应返回策略配置', async () => {
      const policies = await service.getPolicies()

      expect(policies).toBeDefined()
      expect(policies).toHaveProperty('policies')
      expect(Array.isArray(policies.policies)).toBe(true)

      if (policies.policies.length > 0) {
        const firstPolicy = policies.policies[0]
        expect(firstPolicy).toHaveProperty('table')
        expect(firstPolicy).toHaveProperty('retention_days')
        expect(firstPolicy).toHaveProperty('enabled')
        expect(typeof firstPolicy.retention_days).toBe('number')
        expect(typeof firstPolicy.enabled).toBe('boolean')

        console.log(`[策略配置] 共 ${policies.policies.length} 条策略`)
      }
    })
  })

  describe('previewCleanup() - 影响预览', () => {
    test('手动模式预览应返回预览令牌和影响详情', async () => {
      const result = await service.previewCleanup({
        mode: 'manual',
        categories: ['notifications'],
        time_range: {
          start: '2020-01-01T00:00:00+08:00',
          end: '2099-12-31T23:59:59+08:00'
        }
      })

      expect(result).toHaveProperty('preview_token')
      expect(result.preview_token).toMatch(/^pv_/)
      expect(result).toHaveProperty('expires_at')
      expect(result).toHaveProperty('summary')
      expect(result.summary).toHaveProperty('total_rows_to_delete')
      expect(result.summary).toHaveProperty('tables_affected')

      console.log(
        `[手动预览] 令牌: ${result.preview_token}, ` +
          `影响: ${result.summary.total_rows_to_delete} 行 / ${result.summary.tables_affected} 表`
      )
    })

    test('预览令牌应存储在 Redis 中', async () => {
      const result = await service.previewCleanup({
        mode: 'manual',
        categories: ['feedbacks']
      })

      const { getRawClient } = require('../../utils/UnifiedRedisClient')
      const redis = await getRawClient()
      const stored = await redis.get(`data_mgmt:preview_token:${result.preview_token}`)

      expect(stored).not.toBeNull()
      const parsed = JSON.parse(stored)
      expect(parsed).toHaveProperty('options')
      expect(parsed).toHaveProperty('details')
      expect(parsed.options.mode).toBe('manual')

      await redis.del(`data_mgmt:preview_token:${result.preview_token}`)
    })

    test('自动模式预览应返回 L3 表的清理预估', async () => {
      const result = await service.previewCleanup({ mode: 'auto' })

      expect(result).toHaveProperty('preview_token')
      expect(result).toHaveProperty('summary')

      if (result.details.length > 0) {
        const firstDetail = result.details[0]
        expect(firstDetail).toHaveProperty('table_name')
        expect(firstDetail).toHaveProperty('rows_to_delete')
        expect(firstDetail).toHaveProperty('safety_level')
        expect(firstDetail.safety_level).toBe('L3')
      }

      const { getRawClient } = require('../../utils/UnifiedRedisClient')
      const redis = await getRawClient()
      await redis.del(`data_mgmt:preview_token:${result.preview_token}`)
    })

    test('monitoring_metrics 类目预览应包含 lottery_hourly_metrics 和 lottery_daily_metrics', async () => {
      const result = await service.previewCleanup({
        mode: 'manual',
        categories: ['monitoring_metrics']
      })

      const tableNames = result.details.map(d => d.table_name)
      if (result.summary.total_rows_to_delete > 0) {
        const possibleTables = ['lottery_hourly_metrics', 'lottery_daily_metrics']
        const found = tableNames.some(t => possibleTables.includes(t))
        expect(found).toBe(true)
      }

      const { getRawClient } = require('../../utils/UnifiedRedisClient')
      const redis = await getRawClient()
      await redis.del(`data_mgmt:preview_token:${result.preview_token}`)
    })
  })

  describe('L0 保护机制', () => {
    test('accounts 表应在 L0 保护列表中', async () => {
      const stats = await service.getStats()
      const l0Tables = stats.by_level.L0.tables.map(t => t.table_name)
      expect(l0Tables).toContain('accounts')
    })

    test('pre_launch 预览应保护 accounts 系统账户或被 feature_flag 阻断', async () => {
      const result = await service.previewCleanup({ mode: 'pre_launch' })

      if (result.blocked && result.blocked.length > 0) {
        /*
         * feature_flag data_pre_launch_wipe 未启用时，pre_launch 被阻断
         * 这是正确的安全行为（双重保险机制）
         */
        expect(result.blocked[0]).toMatch(/清档功能未启用|生产环境/)
        console.log('[L0保护] pre_launch 被阻断:', result.blocked[0])
      } else {
        const accountsDetail = result.details.find(d => d.table_name === 'accounts')
        if (accountsDetail) {
          expect(accountsDetail.where_clause).toContain('account_type')
          expect(accountsDetail.cascade_effects).toEqual(
            expect.arrayContaining([expect.stringContaining('系统账户')])
          )
        }

        expect(result.warnings).toEqual(
          expect.arrayContaining([expect.stringContaining('系统账户')])
        )
      }

      const { getRawClient } = require('../../utils/UnifiedRedisClient')
      const redis = await getRawClient()
      await redis.del(`data_mgmt:preview_token:${result.preview_token}`)
    })
  })

  describe('runAutoCleanup() - 自动清理执行', () => {
    test('应成功执行自动清理并返回结果', async () => {
      const result = await service.runAutoCleanup(60)

      expect(result).toBeDefined()

      if (result.skipped) {
        expect(result.reason).toBe('no_policies')
        console.log('[自动清理] 无策略配置，跳过')
      } else {
        expect(result).toHaveProperty('total_deleted')
        expect(result).toHaveProperty('duration_seconds')
        expect(result).toHaveProperty('results')
        expect(typeof result.total_deleted).toBe('number')
        expect(result.total_deleted).toBeGreaterThanOrEqual(0)

        console.log(
          `[自动清理] 删除 ${result.total_deleted} 行, ` +
            `耗时 ${result.duration_seconds}s, ` +
            `处理 ${result.results.length} 个表`
        )
      }
    })
  })

  describe('筛选条件验证', () => {
    test('lottery_campaign_id 筛选应限定到抽奖相关表', async () => {
      const result = await service.previewCleanup({
        mode: 'manual',
        categories: ['lottery_records'],
        filters: { lottery_campaign_id: 1 }
      })

      const lotteryTables = result.details.filter(d => d.table_name.startsWith('lottery_'))

      for (const detail of lotteryTables) {
        if (detail.where_replacements?.filter_campaign_id) {
          expect(detail.where_clause).toContain('lottery_campaign_id')
          expect(detail.where_replacements.filter_campaign_id).toBe(1)
        }
      }

      const { getRawClient } = require('../../utils/UnifiedRedisClient')
      const redis = await getRawClient()
      await redis.del(`data_mgmt:preview_token:${result.preview_token}`)
    })

    test('user_id 筛选应正确应用', async () => {
      const result = await service.previewCleanup({
        mode: 'manual',
        categories: ['notifications'],
        filters: { user_id: 31 }
      })

      for (const detail of result.details) {
        if (detail.where_replacements?.filter_user_id) {
          expect(detail.where_clause).toContain('user_id')
          expect(detail.where_replacements.filter_user_id).toBe(31)
        }
      }

      const { getRawClient } = require('../../utils/UnifiedRedisClient')
      const redis = await getRawClient()
      await redis.del(`data_mgmt:preview_token:${result.preview_token}`)
    })

    test('business_type_prefix 筛选应仅应用于含 business_type 字段的表', async () => {
      /*
       * 数据库中仅 asset_transactions 和 item_ledger 有 business_type 字段
       * consumption_records / exchange_records 没有该字段，不应被筛选
       */
      const result = await service.previewCleanup({
        mode: 'manual',
        categories: ['lottery_records'],
        filters: { business_type_prefix: 'test_' }
      })

      for (const detail of result.details) {
        if (detail.where_replacements?.filter_biz_prefix) {
          expect(detail.where_clause).toContain('business_type LIKE')
          expect(detail.where_replacements.filter_biz_prefix).toBe('test_%')
          expect(['asset_transactions', 'item_ledger']).toContain(detail.table_name)
        }
      }

      const { getRawClient } = require('../../utils/UnifiedRedisClient')
      const redis = await getRawClient()
      await redis.del(`data_mgmt:preview_token:${result.preview_token}`)
    })
  })
})
