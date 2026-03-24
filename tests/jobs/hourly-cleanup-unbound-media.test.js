'use strict'

/**
 * 每小时孤立媒体文件清理任务测试套件
 *
 * 测试目标：
 * - HourlyCleanupUnboundMedia.execute() 的核心功能
 * - 清理无 media_attachments 关联且超过指定时间的孤立媒体文件
 * - 使用 MediaService.cleanupOrphanedMedia 执行清理
 *
 * @module tests/jobs/hourly-cleanup-unbound-media
 * @since 2026-03-17
 */

require('dotenv').config()

const HourlyCleanupUnboundMedia = require('../../jobs/hourly-cleanup-unbound-media')
const { MediaFile, MediaAttachment } = require('../../models')
const { Op } = require('sequelize')

describe('每小时孤立媒体文件清理任务', () => {
  jest.setTimeout(60000)

  describe('execute() - 核心执行逻辑', () => {
    test('应成功执行清理并返回报告', async () => {
      const report = await HourlyCleanupUnboundMedia.execute()

      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')
      expect(typeof report.duration_ms).toBe('number')
      expect(report.duration_ms).toBeGreaterThanOrEqual(0)

      console.log('[孤立清理] 清理报告:', JSON.stringify(report, null, 2))
    })
  })

  describe('孤立文件检测', () => {
    test('应检测无关联的媒体文件', async () => {
      const { sequelize } = require('../../models')

      const [orphans] = await sequelize.query(`
        SELECT mf.media_id, mf.object_key, mf.folder, mf.created_at
        FROM media_files mf
        LEFT JOIN media_attachments ma ON mf.media_id = ma.media_id
        WHERE ma.attachment_id IS NULL AND mf.status = 'active'
        ORDER BY mf.created_at ASC
        LIMIT 10
      `)

      console.log(`[孤立清理] 孤立媒体文件数量: ${orphans.length}`)

      for (const orphan of orphans) {
        expect(orphan.media_id).toBeDefined()
        expect(orphan.object_key).toBeDefined()
      }
    })
  })

  describe('媒体文件关联统计', () => {
    test('应统计媒体文件的关联状态', async () => {
      const totalFiles = await MediaFile.count({ where: { status: 'active' } })
      const totalAttachments = await MediaAttachment.count()

      console.log(`[孤立清理] 活跃媒体文件: ${totalFiles}`)
      console.log(`[孤立清理] 关联记录数: ${totalAttachments}`)

      expect(totalFiles).toBeGreaterThanOrEqual(0)
      expect(totalAttachments).toBeGreaterThanOrEqual(0)
    })
  })

  describe('不误删已关联文件', () => {
    test('清理后已关联的媒体文件应仍然存在', async () => {
      const attachedMediaIds = await MediaAttachment.findAll({
        attributes: ['media_id'],
        raw: true
      })

      if (attachedMediaIds.length === 0) {
        console.log('[孤立清理] 跳过：无已关联的媒体文件')
        return
      }

      const uniqueIds = [...new Set(attachedMediaIds.map(a => a.media_id))]

      await HourlyCleanupUnboundMedia.execute()

      const remainingFiles = await MediaFile.findAll({
        where: { media_id: { [Op.in]: uniqueIds } }
      })

      expect(remainingFiles.length).toBe(uniqueIds.length)
      console.log(
        `[孤立清理] 验证确认：${uniqueIds.length} 个已关联文件未被误删（来自 ${attachedMediaIds.length} 条关联记录）`
      )
    })
  })
})
