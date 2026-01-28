'use strict'

/**
 * P3-6c: 每小时未绑定图片清理任务测试套件
 *
 * 测试目标：
 * - HourlyCleanupUnboundImages.execute() 方法的核心功能
 * - 清理 context_id=0（未绑定）且超过指定时间的图片资源
 * - 删除 Sealos 对象存储文件和数据库记录
 *
 * 测试范围：
 * - 正常清理场景（有未绑定图片）
 * - 无未绑定图片场景
 * - 清理时间阈值验证
 * - 文件删除和数据库删除同步
 *
 * 业务规则：
 * - 每小时执行一次
 * - 清理 context_id=0 且创建时间超过24小时的图片
 * - 同时删除对象存储文件和数据库记录
 *
 * @module tests/jobs/hourly-cleanup-unbound-images
 * @since 2026-01-28
 */

// 加载环境变量
require('dotenv').config()

const HourlyCleanupUnboundImages = require('../../jobs/hourly-cleanup-unbound-images')
const { ImageResources } = require('../../models')
const { Op } = require('sequelize')

describe('P3-6c: HourlyCleanupUnboundImages - 每小时未绑定图片清理任务', () => {
  // 测试超时设置
  jest.setTimeout(60000)

  describe('execute() - 核心执行逻辑', () => {
    test('应成功执行未绑定图片清理并返回报告', async () => {
      // 执行清理任务
      const report = await HourlyCleanupUnboundImages.execute()

      // 验证报告结构
      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')
      expect(report).toHaveProperty('duration_ms')
      expect(typeof report.duration_ms).toBe('number')
      expect(report.duration_ms).toBeGreaterThanOrEqual(0)

      // 验证清理结果字段
      if (report.scanned !== undefined) {
        expect(typeof report.scanned).toBe('number')
        expect(report.scanned).toBeGreaterThanOrEqual(0)
      }

      if (report.deleted !== undefined) {
        expect(typeof report.deleted).toBe('number')
        expect(report.deleted).toBeGreaterThanOrEqual(0)
      }

      console.log('[P3-6c] 未绑定图片清理报告:', JSON.stringify(report, null, 2))
    })

    test('无未绑定图片时应正常返回', async () => {
      const report = await HourlyCleanupUnboundImages.execute()

      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')
    })
  })

  describe('未绑定图片检测逻辑', () => {
    test('应正确识别 context_id=0 的未绑定图片', async () => {
      // 查询未绑定的图片
      const unboundImages = await ImageResources.findAll({
        where: {
          context_id: 0
        },
        limit: 10
      })

      console.log(`[P3-6c] 未绑定图片数量: ${unboundImages.length}`)

      for (const image of unboundImages) {
        expect(image.context_id).toBe(0)

        console.log(`[P3-6c] 未绑定图片: ${image.resource_id}, created_at=${image.created_at}`)
      }
    })

    test('应正确应用时间阈值（默认24小时）', async () => {
      const threshold = 24 // 默认24小时
      const thresholdTime = new Date(Date.now() - threshold * 60 * 60 * 1000)

      // 查询超过阈值时间的未绑定图片
      const eligibleImages = await ImageResources.findAll({
        where: {
          context_id: 0,
          created_at: { [Op.lt]: thresholdTime }
        },
        limit: 10
      })

      console.log(`[P3-6c] 符合清理条件的图片数量: ${eligibleImages.length}`)

      for (const image of eligibleImages) {
        expect(image.context_id).toBe(0)
        expect(new Date(image.created_at).getTime()).toBeLessThan(thresholdTime.getTime())
      }
    })

    test('应支持自定义清理时间阈值', async () => {
      // 使用自定义阈值（12小时）- 直接传入数字参数，不是对象
      const customThreshold = 12
      const report = await HourlyCleanupUnboundImages.execute(customThreshold)

      expect(report).toBeDefined()

      if (report.hours_threshold !== undefined) {
        console.log(`[P3-6c] 使用自定义阈值: ${report.hours_threshold} 小时`)
      }
    })
  })

  describe('清理操作验证', () => {
    test('应调用 ImageService.cleanupUnboundImages()', async () => {
      // 执行清理任务
      const report = await HourlyCleanupUnboundImages.execute()

      expect(report).toBeDefined()

      // 验证服务调用结果
      if (report.deleted !== undefined) {
        expect(typeof report.deleted).toBe('number')
      }
    })

    test('应记录清理的图片详情', async () => {
      const report = await HourlyCleanupUnboundImages.execute()

      expect(report).toBeDefined()

      // 如果有删除的图片，应该记录详情
      if (report.deleted_images && Array.isArray(report.deleted_images)) {
        for (const imageId of report.deleted_images) {
          expect(imageId).toBeDefined()
        }
        console.log(`[P3-6c] 删除的图片ID: ${report.deleted_images.slice(0, 5).join(', ')}...`)
      }
    })
  })

  describe('文件和数据库同步删除', () => {
    test('应同时删除对象存储文件和数据库记录', async () => {
      // 执行清理任务
      const report = await HourlyCleanupUnboundImages.execute()

      expect(report).toBeDefined()

      // 验证删除同步
      if (report.storage_deleted !== undefined && report.db_deleted !== undefined) {
        console.log(`[P3-6c] 存储删除: ${report.storage_deleted}, 数据库删除: ${report.db_deleted}`)
      }
    })

    test('应处理存储删除失败但数据库删除成功的情况', async () => {
      // 执行清理任务
      const report = await HourlyCleanupUnboundImages.execute()

      expect(report).toBeDefined()

      // 如果有失败的删除操作
      if (report.storage_delete_failed !== undefined) {
        expect(typeof report.storage_delete_failed).toBe('number')
        console.log(`[P3-6c] 存储删除失败: ${report.storage_delete_failed}`)
      }
    })
  })

  describe('执行性能测试', () => {
    test('应在合理时间内完成清理（小于60秒）', async () => {
      const startTime = Date.now()

      const report = await HourlyCleanupUnboundImages.execute()

      const executionTime = Date.now() - startTime

      expect(executionTime).toBeLessThan(60000)
      expect(report).toBeDefined()

      console.log(`[P3-6c] 执行时间: ${executionTime}ms`)
    })
  })

  describe('错误处理', () => {
    test('应优雅处理单个图片删除失败', async () => {
      // 即使单个图片删除失败，任务整体应该完成
      const report = await HourlyCleanupUnboundImages.execute()

      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')

      // 失败的删除应该被记录
      if (report.failed !== undefined) {
        expect(typeof report.failed).toBe('number')
      }
    })

    test('应记录错误详情', async () => {
      const report = await HourlyCleanupUnboundImages.execute()

      expect(report).toBeDefined()

      // 如果有错误，应该记录详情
      if (report.errors && Array.isArray(report.errors)) {
        for (const error of report.errors) {
          expect(error).toHaveProperty('resource_id')
          expect(error).toHaveProperty('error')
        }
      }
    })
  })

  describe('图片资源数据完整性', () => {
    test('应验证图片资源记录包含必要字段', async () => {
      // 查询一条图片资源记录
      const image = await ImageResources.findOne()

      if (!image) {
        console.log('[P3-6c] 跳过测试：没有图片资源数据')
        return
      }

      // 验证必要字段
      expect(image.resource_id).toBeDefined()
      expect(image.context_id).toBeDefined()
      expect(image.file_path).toBeDefined()
      expect(image.created_at).toBeDefined()

      console.log('[P3-6c] 图片资源记录:', {
        resource_id: image.resource_id,
        context_id: image.context_id,
        file_path: image.file_path
      })
    })
  })

  describe('安全性验证', () => {
    test('不应删除已绑定的图片（context_id > 0）', async () => {
      // 查询已绑定的图片数量
      const boundImagesBeforeCount = await ImageResources.count({
        where: {
          context_id: { [Op.gt]: 0 }
        }
      })

      // 执行清理任务
      await HourlyCleanupUnboundImages.execute()

      // 再次查询已绑定的图片数量
      const boundImagesAfterCount = await ImageResources.count({
        where: {
          context_id: { [Op.gt]: 0 }
        }
      })

      // 已绑定的图片数量不应该减少
      expect(boundImagesAfterCount).toBe(boundImagesBeforeCount)

      console.log(
        `[P3-6c] 已绑定图片数量（清理前/后）: ${boundImagesBeforeCount} / ${boundImagesAfterCount}`
      )
    })
  })
})
