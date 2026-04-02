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
 * 更新时间：2026-01-09（P1-9 ServiceManager 集成）
 * 版本：V4.5.0
 *
 * P1-9 重构说明：
 * - 服务通过 global.getTestService() 获取（J2-RepoWide）
 * - 使用 snake_case service key（E2-Strict）
 */

'use strict'

// 确保测试环境
process.env.NODE_ENV = 'test'

const { TestConfig } = require('../helpers/test-setup')
const { OPERATION_TYPES, isValidOperationType } = require('../../constants/AuditOperationTypes')

// 🔴 P1-9：通过 ServiceManager 获取服务（替代直接 require）
let OrphanFrozenCleanupService

describe('P0-2: 孤儿冻结清理服务测试', () => {
  // 🔴 P1-9：在测试前获取服务实例
  beforeAll(() => {
    OrphanFrozenCleanupService = global.getTestService('orphan_frozen_cleanup')
  })

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
      // 干跑模式不会执行实际清理（P0 DTO 契约：cleaned_count）
      expect(result.cleaned_count).toBe(0)
    })

    test('cleanupOrphanFrozen 干跑模式不应该有失败记录', async () => {
      const result = await OrphanFrozenCleanupService.cleanupOrphanFrozen({
        dry_run: true,
        operator_id: TestConfig.realData.adminUser.user_id || 1
      })

      expect(result.dry_run).toBe(true)
      // P0 DTO 契约：failed_count
      expect(result.failed_count).toBe(0)
    })
  })

  describe('检测逻辑验证', () => {
    /**
     * P0 DTO 契约（2026-01-15）：
     * detectOrphanFrozen 返回稳定 DTO 对象，包含：
     * - orphan_count: 孤儿冻结数量
     * - total_orphan_amount: 孤儿冻结总额
     * - orphan_items: 孤儿冻结详情数组
     * - checked_count: 检测账户数
     * - generated_at: 生成时间
     * - affected_user_count: 受影响用户数
     * - affected_asset_codes: 受影响资产代码
     * - items_truncated: 是否截断
     */
    test('detectOrphanFrozen 返回 DTO 对象', async () => {
      const dto = await OrphanFrozenCleanupService.detectOrphanFrozen()

      // 验证 DTO 结构
      expect(dto).toBeDefined()
      expect(typeof dto.orphan_count).toBe('number')
      expect(typeof dto.total_orphan_amount).toBe('number')
      expect(Array.isArray(dto.orphan_items)).toBe(true)
      expect(typeof dto.checked_count).toBe('number')
      expect(dto.generated_at).toBeDefined()
      expect(typeof dto.affected_user_count).toBe('number')
      expect(Array.isArray(dto.affected_asset_codes)).toBe(true)
      expect(typeof dto.items_truncated).toBe('boolean')
    })

    test('detectOrphanFrozen 支持按用户ID过滤', async () => {
      const dto = await OrphanFrozenCleanupService.detectOrphanFrozen({
        user_id: TestConfig.realData.testUser.user_id || 1
      })

      // 验证返回 DTO 对象
      expect(dto).toBeDefined()
      expect(Array.isArray(dto.orphan_items)).toBe(true)
      // 如果有结果，所有结果应该属于该用户
      dto.orphan_items.forEach(orphan => {
        expect(orphan.user_id).toBe(TestConfig.realData.testUser.user_id || 1)
      })
    })

    test('detectOrphanFrozen 支持按资产代码过滤', async () => {
      const dto = await OrphanFrozenCleanupService.detectOrphanFrozen({
        asset_code: 'star_stone'
      })

      // 验证返回 DTO 对象
      expect(dto).toBeDefined()
      expect(Array.isArray(dto.orphan_items)).toBe(true)
      // 如果有结果，所有结果应该是该资产类型
      dto.orphan_items.forEach(orphan => {
        expect(orphan.asset_code).toBe('star_stone')
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
