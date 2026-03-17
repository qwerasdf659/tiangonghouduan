/**
 * 每日媒体文件数据质量检查任务
 *
 * @description
 *   数据质量门禁任务，检查 media_files 表中的数据完整性问题
 *   仅记录 ERROR 日志，不写数据库、不接告警系统
 *
 * 检查项：
 *   - 缺失 thumbnail_keys：记录 ERROR 日志
 *   - thumbnail_keys 不完整（缺少 small/medium/large）：记录 ERROR 日志
 *   - object_key 格式异常：记录 ERROR 日志
 *   - 仅监控，不自动修复，不影响业务
 *
 * 执行策略：
 *   - 定时执行：每天凌晨 4 点（Cron: 0 4 * * *）
 *   - 扫描条件：status='active'
 *   - 输出策略：仅 ERROR 日志，供后续分析和手工修复
 *
 * @version 2.0.0
 * @date 2026-03-17
 */

const { logger } = require('../utils/logger')

/**
 * 每日媒体文件数据质量检查任务类
 */
class DailyMediaFileQualityCheck {
  /**
   * 执行数据质量检查任务
   *
   * @returns {Promise<Object>} 检查报告
   */
  static async execute() {
    const startTime = Date.now()
    logger.info('[数据质量门禁] 开始每日媒体文件数据质量检查')

    try {
      const { MediaFile, sequelize } = require('../models')
      const { Op } = sequelize.Sequelize

      let totalChecked = 0
      let missingThumbnailsCount = 0
      let incompleteThumbnailsCount = 0
      let invalidObjectKeyCount = 0

      const batchSize = 1000
      let offset = 0
      let hasMore = true

      const missingThumbnailsSamples = []
      const incompleteThumbnailsSamples = []
      const invalidObjectKeySamples = []

      while (hasMore) {
        // eslint-disable-next-line no-await-in-loop
        const batch = await MediaFile.findAll({
          where: { status: 'active' },
          attributes: ['media_id', 'object_key', 'thumbnail_keys', 'folder', 'mime_type'],
          limit: batchSize,
          offset,
          raw: true
        })

        if (batch.length < batchSize) {
          hasMore = false
        }

        for (const record of batch) {
          totalChecked++

          // 检查 1: 缺失 thumbnail_keys（图片类型应有缩略图）
          const isImage = record.mime_type && record.mime_type.startsWith('image/')
          if (isImage && !record.thumbnail_keys) {
            missingThumbnailsCount++
            if (missingThumbnailsSamples.length < 10) {
              missingThumbnailsSamples.push({
                media_id: record.media_id,
                folder: record.folder,
                object_key: record.object_key
              })
            }
          } else if (isImage && record.thumbnail_keys) {
            let thumbnails
            try {
              thumbnails =
                typeof record.thumbnail_keys === 'string'
                  ? JSON.parse(record.thumbnail_keys)
                  : record.thumbnail_keys
            } catch {
              missingThumbnailsCount++
              if (missingThumbnailsSamples.length < 10) {
                missingThumbnailsSamples.push({
                  media_id: record.media_id,
                  folder: record.folder,
                  reason: 'thumbnail_keys JSON 解析失败'
                })
              }
              continue
            }

            // 检查 2: thumbnail_keys 不完整
            const requiredSizes = ['small', 'medium', 'large']
            const missingSizes = requiredSizes.filter(size => !thumbnails[size])

            if (missingSizes.length > 0) {
              incompleteThumbnailsCount++
              if (incompleteThumbnailsSamples.length < 10) {
                incompleteThumbnailsSamples.push({
                  media_id: record.media_id,
                  folder: record.folder,
                  missing_sizes: missingSizes
                })
              }
            }
          }

          // 检查 3: object_key 格式异常（不应以 http/https/绝对路径开头）
          if (record.object_key) {
            const key = record.object_key
            const isInvalidFormat =
              key.startsWith('http://') || key.startsWith('https://') || key.startsWith('/')

            if (isInvalidFormat) {
              invalidObjectKeyCount++
              if (invalidObjectKeySamples.length < 10) {
                invalidObjectKeySamples.push({
                  media_id: record.media_id,
                  folder: record.folder,
                  object_key: key.substring(0, 100)
                })
              }
            }
          }
        }

        offset += batchSize
      }

      // 输出问题详情
      if (missingThumbnailsCount > 0) {
        logger.error('[数据质量门禁] 发现缺失 thumbnail_keys 的媒体文件', {
          count: missingThumbnailsCount,
          samples: missingThumbnailsSamples
        })
      }

      if (incompleteThumbnailsCount > 0) {
        logger.error('[数据质量门禁] 发现 thumbnail_keys 不完整的媒体文件', {
          count: incompleteThumbnailsCount,
          samples: incompleteThumbnailsSamples
        })
      }

      if (invalidObjectKeyCount > 0) {
        logger.error('[数据质量门禁] 发现 object_key 格式异常的媒体文件', {
          count: invalidObjectKeyCount,
          samples: invalidObjectKeySamples
        })
      }

      const totalIssues = missingThumbnailsCount + incompleteThumbnailsCount + invalidObjectKeyCount
      const duration_ms = Date.now() - startTime

      const report = {
        timestamp: new Date().toISOString(),
        total_checked: totalChecked,
        total_scanned: totalChecked,
        total_issues: totalIssues,
        issues_found: totalIssues,
        missing_thumbnails_count: missingThumbnailsCount,
        incomplete_thumbnails_count: incompleteThumbnailsCount,
        invalid_object_key_count: invalidObjectKeyCount,
        duration_ms,
        status: 'SUCCESS',
        summary: {
          missing_thumbnails: missingThumbnailsCount,
          incomplete_thumbnails: incompleteThumbnailsCount,
          invalid_file_paths: invalidObjectKeyCount
        }
      }

      DailyMediaFileQualityCheck._outputReport(report)

      if (totalIssues > 0) {
        logger.warn('[数据质量门禁] 检查完成，发现数据质量问题', {
          total_checked: totalChecked,
          total_issues: totalIssues,
          duration_ms
        })
      } else {
        logger.info('[数据质量门禁] 检查完成，数据质量良好', {
          total_checked: totalChecked,
          duration_ms
        })
      }

      return report
    } catch (error) {
      logger.error('[数据质量门禁] 媒体文件数据质量检查失败', {
        error_message: error.message,
        error_stack: error.stack
      })

      const report = {
        timestamp: new Date().toISOString(),
        total_checked: 0,
        total_scanned: 0,
        total_issues: 0,
        issues_found: 0,
        missing_thumbnails_count: 0,
        incomplete_thumbnails_count: 0,
        invalid_object_key_count: 0,
        duration_ms: Date.now() - startTime,
        status: 'ERROR',
        error: error.message
      }

      DailyMediaFileQualityCheck._outputReport(report)
      throw error
    }
  }

  /**
   * @param {Object} report - 检查报告
   * @returns {void}
   * @private
   */
  static _outputReport(report) {
    console.log('\n' + '='.repeat(80))
    console.log('📊 每日媒体文件数据质量检查报告')
    console.log('='.repeat(80))
    console.log(`时间: ${report.timestamp}`)
    console.log(`耗时: ${report.duration_ms}ms`)
    console.log(`检查媒体文件总数: ${report.total_checked}`)
    console.log('-'.repeat(40))
    console.log(`问题总数: ${report.total_issues}`)
    console.log(`  - 缺失 thumbnail_keys: ${report.missing_thumbnails_count}`)
    console.log(`  - thumbnail_keys 不完整: ${report.incomplete_thumbnails_count}`)
    console.log(`  - object_key 格式异常: ${report.invalid_object_key_count}`)
    console.log('-'.repeat(40))
    console.log(`状态: ${report.status === 'SUCCESS' ? '✅ SUCCESS' : '❌ ERROR'}`)
    if (report.error) {
      console.log(`错误: ${report.error}`)
    }
    console.log('='.repeat(80) + '\n')
  }
}

if (require.main === module) {
  require('dotenv').config()
  ;(async () => {
    try {
      console.log('执行每日媒体文件数据质量检查...')
      const report = await DailyMediaFileQualityCheck.execute()
      process.exit(report.status === 'SUCCESS' ? 0 : 1)
    } catch (error) {
      console.error('数据质量检查任务执行失败:', error)
      process.exit(1)
    }
  })()
}

module.exports = DailyMediaFileQualityCheck
