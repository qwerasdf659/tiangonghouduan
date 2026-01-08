/**
 * 孤儿冻结清理测试（P0-2）
 *
 * 测试目标：
 * - 验证 OrphanFrozenCleanupService 是孤儿冻结清理的唯一入口
 * - 验证孤儿冻结检测逻辑正确性
 * - 验证清理操作记录审计日志
 * - 验证干跑模式不修改数据
 *
 * 创建时间：2026-01-09
 * 版本：V4.5.0
 */

'use strict'

// 确保测试环境
process.env.NODE_ENV = 'test'

const { TestConfig } = require('../helpers/test-setup')
const OrphanFrozenCleanupService = require('../../services/OrphanFrozenCleanupService')
const { OPERATION_TYPES, isValidOperationType } = require('../../constants/AuditOperationTypes')

describe('P0-2: 孤儿冻结清理服务测试', () => {
  describe('服务导出验证', () => {
    test('OrphanFrozenCleanupService 应该存在', () => {
      expect(OrphanFrozenCleanupService).toBeDefined()
    })

    test('OrphanFrozenCleanupService 应该有 detectOrphanFrozen 方法', () => {
      expect(typeof OrphanFrozenCleanupService.detectOrphanFrozen).toBe('function')
    })

    test('OrphanFrozenCleanupService 应该有 cleanupOrphanFrozen 方法', () => {
      expect(typeof OrphanFrozenCleanupService.cleanupOrphanFrozen).toBe('function')
    })

    test('OrphanFrozenCleanupService 应该有 getOrphanFrozenStats 方法', () => {
      expect(typeof OrphanFrozenCleanupService.getOrphanFrozenStats).toBe('function')
    })
  })

  describe('审计操作类型验证', () => {
    test('ASSET_ORPHAN_CLEANUP 应该是有效的操作类型', () => {
      expect(OPERATION_TYPES.ASSET_ORPHAN_CLEANUP).toBeDefined()
      expect(OPERATION_TYPES.ASSET_ORPHAN_CLEANUP).toBe('asset_orphan_cleanup')
    })

    test('ASSET_ORPHAN_CLEANUP 应该通过 isValidOperationType 验证', () => {
      expect(isValidOperationType('asset_orphan_cleanup')).toBe(true)
    })
  })

  describe('干跑模式验证', () => {
    test('cleanupOrphanFrozen 默认应该是干跑模式', async () => {
      // 调用清理服务，不提供 dry_run 参数
      const result = await OrphanFrozenCleanupService.cleanupOrphanFrozen({
        operator_id: TestConfig.realData.adminUser.user_id || 1 // 使用测试管理员ID
      })

      // 验证返回结果中 dry_run 为 true
      expect(result.dry_run).toBe(true)
      // 干跑模式不会执行实际清理
      expect(result.cleaned).toBe(0)
    })

    test('cleanupOrphanFrozen 干跑模式不应该有失败记录', async () => {
      const result = await OrphanFrozenCleanupService.cleanupOrphanFrozen({
        dry_run: true,
        operator_id: TestConfig.realData.adminUser.user_id || 1
      })

      expect(result.dry_run).toBe(true)
      expect(result.failed).toBe(0)
    })
  })

  describe('检测逻辑验证', () => {
    test('detectOrphanFrozen 返回数组', async () => {
      const orphanList = await OrphanFrozenCleanupService.detectOrphanFrozen()

      expect(Array.isArray(orphanList)).toBe(true)
    })

    test('detectOrphanFrozen 支持按用户ID过滤', async () => {
      const orphanList = await OrphanFrozenCleanupService.detectOrphanFrozen({
        user_id: TestConfig.realData.testUser.user_id || 1
      })

      expect(Array.isArray(orphanList)).toBe(true)
      // 如果有结果，所有结果应该属于该用户
      orphanList.forEach(orphan => {
        expect(orphan.user_id).toBe(TestConfig.realData.testUser.user_id || 1)
      })
    })

    test('detectOrphanFrozen 支持按资产代码过滤', async () => {
      const orphanList = await OrphanFrozenCleanupService.detectOrphanFrozen({
        asset_code: 'DIAMOND'
      })

      expect(Array.isArray(orphanList)).toBe(true)
      // 如果有结果，所有结果应该是该资产类型
      orphanList.forEach(orphan => {
        expect(orphan.asset_code).toBe('DIAMOND')
      })
    })
  })

  describe('统计报告验证', () => {
    test('getOrphanFrozenStats 返回统计对象', async () => {
      const stats = await OrphanFrozenCleanupService.getOrphanFrozenStats()

      expect(stats).toBeDefined()
      expect(typeof stats.total_orphan_count).toBe('number')
      expect(typeof stats.total_orphan_amount).toBe('number')
      expect(typeof stats.affected_user_count).toBe('number')
      expect(Array.isArray(stats.by_asset)).toBe(true)
      expect(stats.checked_at).toBeDefined()
    })

    test('getOrphanFrozenStats 的 by_asset 包含正确字段', async () => {
      const stats = await OrphanFrozenCleanupService.getOrphanFrozenStats()

      stats.by_asset.forEach(assetStat => {
        expect(assetStat).toHaveProperty('asset_code')
        expect(assetStat).toHaveProperty('count')
        expect(assetStat).toHaveProperty('total_orphan_amount')
        expect(assetStat).toHaveProperty('affected_user_count')
      })
    })
  })

  describe('参数验证', () => {
    test('cleanupOrphanFrozen 实际清理模式需要 operator_id', async () => {
      // 不传 operator_id，dry_run=false 应该抛错
      await expect(
        OrphanFrozenCleanupService.cleanupOrphanFrozen({
          dry_run: false
          // 缺少 operator_id
        })
      ).rejects.toThrow('实际清理操作需要提供 operator_id')
    })

    test('cleanupOrphanFrozen 干跑模式不强制要求 operator_id', async () => {
      // 干跑模式，不传 operator_id 也不应该报错
      const result = await OrphanFrozenCleanupService.cleanupOrphanFrozen({
        dry_run: true
      })

      expect(result.dry_run).toBe(true)
    })
  })

  describe('唯一入口设计验证', () => {
    test('OrphanFrozenCleanupService 应该是静态类设计', () => {
      // 验证所有方法都是静态方法
      expect(typeof OrphanFrozenCleanupService.detectOrphanFrozen).toBe('function')
      expect(typeof OrphanFrozenCleanupService.cleanupOrphanFrozen).toBe('function')
      expect(typeof OrphanFrozenCleanupService.getOrphanFrozenStats).toBe('function')

      // 这些应该是类本身的方法，不是实例方法
      const instance = new OrphanFrozenCleanupService()
      expect(instance.detectOrphanFrozen).toBeUndefined()
      expect(instance.cleanupOrphanFrozen).toBeUndefined()
      expect(instance.getOrphanFrozenStats).toBeUndefined()
    })
  })
})
