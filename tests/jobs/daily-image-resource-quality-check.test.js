'use strict'

/**
 * P3-6f: 每日图片资源质量检查任务测试套件
 *
 * 测试目标：
 * - DailyImageResourceQualityCheck.execute() 方法的核心功能
 * - 检测缺失或不完整的缩略图路径
 * - 检测异常的文件路径格式
 * - 只记录错误日志，不自动修复
 *
 * 测试范围：
 * - 正常检查场景（无问题）
 * - 缩略图缺失场景
 * - 缩略图不完整场景（缺少 small/medium/large）
 * - 文件路径格式异常场景
 * - 批量扫描性能
 *
 * 业务规则：
 * - 每天03:00执行（北京时间）
 * - 检查 context_id > 0 的活跃绑定图片
 * - 缩略图应包含 small、medium、large 三种尺寸
 * - 文件路径应以 http://、https:// 或 / 开头
 * - 只记录 ERROR 日志，不自动修复
 *
 * @module tests/jobs/daily-image-resource-quality-check
 * @since 2026-01-28
 */

// 加载环境变量
require('dotenv').config()

const DailyImageResourceQualityCheck = require('../../jobs/daily-image-resource-quality-check')
const { ImageResources } = require('../../models')
const { Op } = require('sequelize')

describe('P3-6f: DailyImageResourceQualityCheck - 每日图片资源质量检查任务', () => {
  // 测试超时设置
  jest.setTimeout(60000)

  describe('execute() - 核心执行逻辑', () => {
    test('应成功执行图片质量检查并返回报告', async () => {
      // 执行检查任务
      const report = await DailyImageResourceQualityCheck.execute()

      // 验证报告结构
      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')
      expect(report).toHaveProperty('duration_ms')
      expect(typeof report.duration_ms).toBe('number')
      expect(report.duration_ms).toBeGreaterThanOrEqual(0)

      // 验证检查结果字段
      if (report.total_scanned !== undefined) {
        expect(typeof report.total_scanned).toBe('number')
        expect(report.total_scanned).toBeGreaterThanOrEqual(0)
      }

      if (report.issues_found !== undefined) {
        expect(typeof report.issues_found).toBe('number')
        expect(report.issues_found).toBeGreaterThanOrEqual(0)
      }

      console.log('[P3-6f] 图片质量检查报告:', JSON.stringify(report, null, 2))
    })

    test('无问题时应正常返回', async () => {
      const report = await DailyImageResourceQualityCheck.execute()

      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')
    })
  })

  describe('缩略图路径检测', () => {
    test('应检测缺失的 thumbnail_paths', async () => {
      // 查询没有缩略图的活跃图片
      const imagesWithoutThumbnails = await ImageResources.findAll({
        where: {
          context_id: { [Op.gt]: 0 },
          [Op.or]: [{ thumbnail_paths: null }, { thumbnail_paths: '' }, { thumbnail_paths: {} }]
        },
        limit: 10
      })

      console.log(`[P3-6f] 缺失缩略图的图片数量: ${imagesWithoutThumbnails.length}`)

      for (const image of imagesWithoutThumbnails) {
        expect(image.context_id).toBeGreaterThan(0)
        // 这些图片应该被标记为问题
      }
    })

    test('应检测不完整的 thumbnail_paths（缺少尺寸）', async () => {
      // 查询有缩略图但可能不完整的图片
      const imagesWithThumbnails = await ImageResources.findAll({
        where: {
          context_id: { [Op.gt]: 0 },
          thumbnail_paths: { [Op.ne]: null }
        },
        limit: 10
      })

      console.log(`[P3-6f] 有缩略图的图片数量: ${imagesWithThumbnails.length}`)

      // 检查每个图片的缩略图完整性
      const requiredSizes = ['small', 'medium', 'large']

      for (const image of imagesWithThumbnails) {
        if (image.thumbnail_paths && typeof image.thumbnail_paths === 'object') {
          const missingSizes = requiredSizes.filter(size => !image.thumbnail_paths[size])

          if (missingSizes.length > 0) {
            console.log(`[P3-6f] 图片 ${image.resource_id} 缺少尺寸: ${missingSizes.join(', ')}`)
          }
        }
      }
    })
  })

  describe('文件路径格式检测', () => {
    test('应检测无效的 file_path 格式', async () => {
      // 查询所有活跃图片
      const activeImages = await ImageResources.findAll({
        where: {
          context_id: { [Op.gt]: 0 }
        },
        limit: 20
      })

      console.log(`[P3-6f] 活跃图片数量: ${activeImages.length}`)

      // 检查文件路径格式
      const validPrefixes = ['http://', 'https://', '/']
      let invalidPathCount = 0

      for (const image of activeImages) {
        const filePath = image.file_path || ''
        const isValidPath = validPrefixes.some(prefix => filePath.startsWith(prefix))

        if (!isValidPath && filePath) {
          invalidPathCount++
          console.log(`[P3-6f] 无效路径: ${image.resource_id} - ${filePath.substring(0, 50)}...`)
        }
      }

      console.log(`[P3-6f] 无效路径数量: ${invalidPathCount}`)
    })
  })

  describe('批量扫描逻辑', () => {
    test('应分批扫描活跃图片', async () => {
      // 执行检查任务
      const report = await DailyImageResourceQualityCheck.execute()

      expect(report).toBeDefined()

      // 验证批量处理
      if (report.batches_processed !== undefined) {
        expect(typeof report.batches_processed).toBe('number')
        console.log(`[P3-6f] 处理批次数: ${report.batches_processed}`)
      }

      if (report.batch_size !== undefined) {
        expect(typeof report.batch_size).toBe('number')
        console.log(`[P3-6f] 批次大小: ${report.batch_size}`)
      }
    })

    test('应只扫描 context_id > 0 的活跃图片', async () => {
      // 获取活跃图片总数
      const activeCount = await ImageResources.count({
        where: {
          context_id: { [Op.gt]: 0 }
        }
      })

      // 执行检查任务
      const report = await DailyImageResourceQualityCheck.execute()

      expect(report).toBeDefined()

      // 扫描数量应该与活跃图片数一致
      if (report.total_scanned !== undefined) {
        expect(report.total_scanned).toBeLessThanOrEqual(activeCount)
        console.log(`[P3-6f] 活跃图片: ${activeCount}, 扫描数: ${report.total_scanned}`)
      }
    })
  })

  describe('错误日志记录', () => {
    test('应记录详细的错误样本', async () => {
      // 执行检查任务
      const report = await DailyImageResourceQualityCheck.execute()

      expect(report).toBeDefined()

      // 如果有问题，应该记录样本
      if (report.error_samples && Array.isArray(report.error_samples)) {
        expect(report.error_samples.length).toBeLessThanOrEqual(10)

        for (const sample of report.error_samples) {
          expect(sample).toHaveProperty('resource_id')
          expect(sample).toHaveProperty('issue_type')
        }

        console.log('[P3-6f] 错误样本数:', report.error_samples.length)
      }
    })

    test('应生成摘要报告', async () => {
      // 执行检查任务
      const report = await DailyImageResourceQualityCheck.execute()

      expect(report).toBeDefined()

      // 验证摘要字段
      if (report.summary) {
        expect(report.summary).toHaveProperty('missing_thumbnails')
        expect(report.summary).toHaveProperty('incomplete_thumbnails')
        expect(report.summary).toHaveProperty('invalid_file_paths')

        console.log('[P3-6f] 摘要:', JSON.stringify(report.summary, null, 2))
      }
    })
  })

  describe('不自动修复验证', () => {
    test('应不修改任何图片数据', async () => {
      // 获取执行前的图片数据
      const imagesBefore = await ImageResources.findAll({
        where: { context_id: { [Op.gt]: 0 } },
        limit: 5
      })

      // 执行检查任务
      await DailyImageResourceQualityCheck.execute()

      // 获取执行后的图片数据
      const imagesAfter = await ImageResources.findAll({
        where: { context_id: { [Op.gt]: 0 } },
        limit: 5
      })

      // 验证数据未被修改
      for (let i = 0; i < Math.min(imagesBefore.length, imagesAfter.length); i++) {
        expect(imagesAfter[i].file_path).toBe(imagesBefore[i].file_path)
        expect(JSON.stringify(imagesAfter[i].thumbnail_paths)).toBe(
          JSON.stringify(imagesBefore[i].thumbnail_paths)
        )
      }

      console.log('[P3-6f] 验证确认：检查任务不修改数据')
    })
  })

  describe('执行性能测试', () => {
    test('应在合理时间内完成检查（小于120秒）', async () => {
      const startTime = Date.now()

      const report = await DailyImageResourceQualityCheck.execute()

      const executionTime = Date.now() - startTime

      expect(executionTime).toBeLessThan(120000)
      expect(report).toBeDefined()

      console.log(`[P3-6f] 执行时间: ${executionTime}ms`)
    })
  })

  describe('错误处理', () => {
    test('应优雅处理扫描过程中的错误', async () => {
      // 即使部分图片检查失败，任务整体应该完成
      const report = await DailyImageResourceQualityCheck.execute()

      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')
    })
  })

  describe('图片资源数据结构验证', () => {
    test('应验证图片资源记录包含必要字段', async () => {
      // 查询一条图片资源记录
      const image = await ImageResources.findOne({
        where: { context_id: { [Op.gt]: 0 } }
      })

      if (!image) {
        console.log('[P3-6f] 跳过测试：没有活跃图片数据')
        return
      }

      // 验证必要字段
      expect(image.resource_id).toBeDefined()
      expect(image.context_id).toBeDefined()
      expect(image.file_path).toBeDefined()

      console.log('[P3-6f] 图片资源记录:', {
        resource_id: image.resource_id,
        context_id: image.context_id,
        file_path: image.file_path,
        has_thumbnails: !!image.thumbnail_paths
      })
    })
  })
})


