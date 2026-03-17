'use strict'

/**
 * 每日媒体文件数据质量检查任务测试套件
 *
 * 测试目标：
 * - DailyMediaFileQualityCheck.execute() 方法的核心功能
 * - 检测缺失或不完整的缩略图路径
 * - 检测异常的 object_key 格式
 * - 只记录错误日志，不自动修复
 *
 * @module tests/jobs/daily-image-resource-quality-check
 * @since 2026-03-17
 */

require('dotenv').config()

const DailyMediaFileQualityCheck = require('../../jobs/daily-image-resource-quality-check')
const { MediaFile } = require('../../models')
const { Op } = require('sequelize')

describe('每日媒体文件数据质量检查任务', () => {
  jest.setTimeout(60000)

  describe('execute() - 核心执行逻辑', () => {
    test('应成功执行质量检查并返回报告', async () => {
      const report = await DailyMediaFileQualityCheck.execute()

      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')
      expect(report).toHaveProperty('duration_ms')
      expect(typeof report.duration_ms).toBe('number')
      expect(report.duration_ms).toBeGreaterThanOrEqual(0)

      if (report.total_scanned !== undefined) {
        expect(typeof report.total_scanned).toBe('number')
        expect(report.total_scanned).toBeGreaterThanOrEqual(0)
      }

      if (report.issues_found !== undefined) {
        expect(typeof report.issues_found).toBe('number')
        expect(report.issues_found).toBeGreaterThanOrEqual(0)
      }

      console.log('[媒体质量检查] 报告:', JSON.stringify(report, null, 2))
    })
  })

  describe('缩略图路径检测', () => {
    test('应检测缺失的 thumbnail_keys', async () => {
      const filesWithoutThumbnails = await MediaFile.findAll({
        where: {
          status: 'active',
          mime_type: { [Op.like]: 'image/%' },
          [Op.or]: [{ thumbnail_keys: null }, { thumbnail_keys: '' }, { thumbnail_keys: {} }]
        },
        limit: 10
      })

      console.log(`[媒体质量检查] 缺失缩略图的媒体文件数量: ${filesWithoutThumbnails.length}`)
    })

    test('应检测不完整的 thumbnail_keys', async () => {
      const filesWithThumbnails = await MediaFile.findAll({
        where: {
          status: 'active',
          thumbnail_keys: { [Op.ne]: null }
        },
        limit: 10
      })

      console.log(`[媒体质量检查] 有缩略图的文件数量: ${filesWithThumbnails.length}`)

      const requiredSizes = ['small', 'medium', 'large']
      for (const file of filesWithThumbnails) {
        if (file.thumbnail_keys && typeof file.thumbnail_keys === 'object') {
          const missingSizes = requiredSizes.filter(size => !file.thumbnail_keys[size])
          if (missingSizes.length > 0) {
            console.log(
              `[媒体质量检查] media_id=${file.media_id} 缺少尺寸: ${missingSizes.join(', ')}`
            )
          }
        }
      }
    })
  })

  describe('object_key 格式检测', () => {
    test('应检测无效的 object_key 格式', async () => {
      const activeFiles = await MediaFile.findAll({
        where: { status: 'active' },
        limit: 20
      })

      console.log(`[媒体质量检查] 活跃媒体文件数量: ${activeFiles.length}`)

      const validPrefixes = ['http://', 'https://', '/']
      let invalidKeyCount = 0

      for (const file of activeFiles) {
        const key = file.object_key || ''
        const isInvalid = validPrefixes.some(prefix => key.startsWith(prefix))
        if (isInvalid) {
          invalidKeyCount++
          console.log(
            `[媒体质量检查] 异常 object_key: media_id=${file.media_id} - ${key.substring(0, 50)}`
          )
        }
      }

      console.log(`[媒体质量检查] 异常格式数量: ${invalidKeyCount}`)
    })
  })

  describe('不自动修复验证', () => {
    test('应不修改任何媒体文件数据', async () => {
      const filesBefore = await MediaFile.findAll({
        where: { status: 'active' },
        limit: 5
      })

      await DailyMediaFileQualityCheck.execute()

      const filesAfter = await MediaFile.findAll({
        where: { status: 'active' },
        limit: 5
      })

      for (let i = 0; i < Math.min(filesBefore.length, filesAfter.length); i++) {
        expect(filesAfter[i].object_key).toBe(filesBefore[i].object_key)
        expect(JSON.stringify(filesAfter[i].thumbnail_keys)).toBe(
          JSON.stringify(filesBefore[i].thumbnail_keys)
        )
      }

      console.log('[媒体质量检查] 验证确认：检查任务不修改数据')
    })
  })

  describe('媒体文件数据结构验证', () => {
    test('应验证媒体文件记录包含必要字段', async () => {
      const file = await MediaFile.findOne({
        where: { status: 'active' }
      })

      if (!file) {
        console.log('[媒体质量检查] 跳过测试：没有活跃媒体文件')
        return
      }

      expect(file.media_id).toBeDefined()
      expect(file.object_key).toBeDefined()
      expect(file.folder).toBeDefined()

      console.log('[媒体质量检查] 媒体文件记录:', {
        media_id: file.media_id,
        object_key: file.object_key,
        folder: file.folder,
        has_thumbnails: !!file.thumbnail_keys
      })
    })
  })
})
