/**
 * 餐厅积分抽奖系统 V4.2 - 每日图片资源数据质量检查任务
 *
 * @description
 *   数据质量门禁任务，检查 image_resources 表中的数据完整性问题
 *   仅记录 ERROR 日志，不写数据库、不接告警系统
 *
 * @architecture 架构决策（2026-01-14 拍板）
 *   - 缺失 thumbnail_paths：记录 ERROR 日志
 *   - thumbnail_paths 不完整（缺少 small/medium/large）：记录 ERROR 日志
 *   - file_path 格式异常（http://、https://、/ 开头）：记录 ERROR 日志
 *   - 仅监控，不自动修复，不影响业务
 *
 * 执行策略：
 *   - 定时执行：每天凌晨 4 点（Cron: 0 4 * * *）
 *   - 扫描条件：status='active' 且 context_id > 0（已绑定）
 *   - 输出策略：仅 ERROR 日志，供后续分析和手工修复
 *
 * @version 1.0.0
 * @date 2026-01-14
 * @see docs/图片缩略图架构兼容残留核查报告-2026-01-13.md - 7.2 执行方案
 */

const logger = require('../utils/logger').logger

/**
 * 每日图片资源数据质量检查任务类
 *
 * @class DailyImageResourceQualityCheck
 * @description 检查 image_resources 表数据完整性，记录问题到日志
 */
class DailyImageResourceQualityCheck {
  /**
   * 执行数据质量检查任务
   *
   * @returns {Promise<Object>} 检查报告
   * @returns {Object} report - 检查报告
   * @returns {number} report.total_checked - 检查的图片总数
   * @returns {number} report.missing_thumbnails_count - 缺失 thumbnail_paths 的数量
   * @returns {number} report.incomplete_thumbnails_count - thumbnail_paths 不完整的数量
   * @returns {number} report.invalid_file_path_count - file_path 格式异常的数量
   * @returns {string} report.timestamp - 执行时间
   * @returns {number} report.duration_ms - 执行耗时(毫秒)
   * @returns {string} report.status - 执行状态（SUCCESS/ERROR）
   */
  static async execute() {
    const startTime = Date.now()
    logger.info('[数据质量门禁] 开始每日图片资源数据质量检查')

    try {
      // 动态导入模型，避免循环依赖
      const { ImageResources, sequelize } = require('../models')
      const { Op } = sequelize.Sequelize

      // 统计计数器
      let totalChecked = 0
      let missingThumbnailsCount = 0
      let incompleteThumbnailsCount = 0
      let invalidFilePathCount = 0

      // 分批处理（每批 1000 条，避免内存问题）
      const batchSize = 1000
      let offset = 0
      let hasMore = true

      // 收集问题记录（用于汇总日志）
      const missingThumbnailsRecords = []
      const incompleteThumbnailsRecords = []
      const invalidFilePathRecords = []

      while (hasMore) {
        // 查询已绑定且激活的图片资源（分页查询必须顺序执行）
        // eslint-disable-next-line no-await-in-loop
        const batch = await ImageResources.findAll({
          where: {
            status: 'active',
            context_id: {
              [Op.gt]: 0 // 已绑定的图片
            }
          },
          attributes: [
            'image_id',
            'file_path',
            'thumbnail_paths',
            'business_type',
            'category',
            'context_id'
          ],
          limit: batchSize,
          offset,
          raw: true
        })

        if (batch.length < batchSize) {
          hasMore = false
        }

        // 检查每条记录
        for (const record of batch) {
          totalChecked++

          // 检查 1: 缺失 thumbnail_paths
          if (!record.thumbnail_paths) {
            missingThumbnailsCount++
            if (missingThumbnailsRecords.length < 10) {
              // 只记录前 10 条示例
              missingThumbnailsRecords.push({
                image_id: record.image_id,
                business_type: record.business_type,
                category: record.category,
                context_id: record.context_id
              })
            }
          } else {
            // 解析 thumbnail_paths（可能是 JSON 字符串或对象）
            let thumbnails
            try {
              thumbnails =
                typeof record.thumbnail_paths === 'string'
                  ? JSON.parse(record.thumbnail_paths)
                  : record.thumbnail_paths
            } catch {
              // JSON 解析失败，视为缺失
              missingThumbnailsCount++
              if (missingThumbnailsRecords.length < 10) {
                missingThumbnailsRecords.push({
                  image_id: record.image_id,
                  business_type: record.business_type,
                  category: record.category,
                  context_id: record.context_id,
                  reason: 'thumbnail_paths JSON 解析失败'
                })
              }
              continue
            }

            // 检查 2: thumbnail_paths 不完整（缺少 small/medium/large）
            const requiredSizes = ['small', 'medium', 'large']
            const missingSizes = requiredSizes.filter(size => !thumbnails[size])

            if (missingSizes.length > 0) {
              incompleteThumbnailsCount++
              if (incompleteThumbnailsRecords.length < 10) {
                incompleteThumbnailsRecords.push({
                  image_id: record.image_id,
                  business_type: record.business_type,
                  category: record.category,
                  context_id: record.context_id,
                  missing_sizes: missingSizes
                })
              }
            }
          }

          // 检查 3: file_path 格式异常
          if (record.file_path) {
            const filePath = record.file_path
            const isInvalidFormat =
              filePath.startsWith('http://') ||
              filePath.startsWith('https://') ||
              filePath.startsWith('/')

            if (isInvalidFormat) {
              invalidFilePathCount++
              if (invalidFilePathRecords.length < 10) {
                invalidFilePathRecords.push({
                  image_id: record.image_id,
                  business_type: record.business_type,
                  category: record.category,
                  context_id: record.context_id,
                  file_path: filePath.substring(0, 100) // 截断避免日志过长
                })
              }
            }
          }
        }

        offset += batchSize

        // 每处理 5 批次输出一次进度
        if (offset % (batchSize * 5) === 0) {
          logger.info('[数据质量门禁] 处理进度', {
            checked: totalChecked,
            offset
          })
        }
      }

      // 输出问题详情（ERROR 级别日志）
      if (missingThumbnailsCount > 0) {
        logger.error('[数据质量门禁] 发现缺失 thumbnail_paths 的图片资源', {
          count: missingThumbnailsCount,
          samples: missingThumbnailsRecords
        })
      }

      if (incompleteThumbnailsCount > 0) {
        logger.error('[数据质量门禁] 发现 thumbnail_paths 不完整的图片资源', {
          count: incompleteThumbnailsCount,
          samples: incompleteThumbnailsRecords
        })
      }

      if (invalidFilePathCount > 0) {
        logger.error('[数据质量门禁] 发现 file_path 格式异常的图片资源', {
          count: invalidFilePathCount,
          samples: invalidFilePathRecords
        })
      }

      // 生成报告
      const totalIssues = missingThumbnailsCount + incompleteThumbnailsCount + invalidFilePathCount
      const duration_ms = Date.now() - startTime

      const report = {
        timestamp: new Date().toISOString(),
        total_checked: totalChecked,
        total_issues: totalIssues,
        missing_thumbnails_count: missingThumbnailsCount,
        incomplete_thumbnails_count: incompleteThumbnailsCount,
        invalid_file_path_count: invalidFilePathCount,
        duration_ms,
        status: 'SUCCESS'
      }

      // 输出报告
      this._outputReport(report)

      // 汇总日志
      if (totalIssues > 0) {
        logger.warn('[数据质量门禁] 检查完成，发现数据质量问题', {
          total_checked: totalChecked,
          total_issues: totalIssues,
          missing_thumbnails: missingThumbnailsCount,
          incomplete_thumbnails: incompleteThumbnailsCount,
          invalid_file_paths: invalidFilePathCount,
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
      logger.error('[数据质量门禁] 图片资源数据质量检查失败', {
        error_message: error.message,
        error_stack: error.stack
      })

      const report = {
        timestamp: new Date().toISOString(),
        total_checked: 0,
        total_issues: 0,
        missing_thumbnails_count: 0,
        incomplete_thumbnails_count: 0,
        invalid_file_path_count: 0,
        duration_ms: Date.now() - startTime,
        status: 'ERROR',
        error: error.message
      }

      // 即使失败也输出报告
      this._outputReport(report)

      throw error
    }
  }

  /**
   * 输出检查报告
   *
   * @param {Object} report - 检查报告
   * @returns {void}
   * @private
   */
  static _outputReport(report) {
    console.log('\n' + '='.repeat(80))
    console.log('📊 每日图片资源数据质量检查报告')
    console.log('='.repeat(80))
    console.log(`时间: ${report.timestamp}`)
    console.log(`耗时: ${report.duration_ms}ms`)
    console.log(`检查图片总数: ${report.total_checked}`)
    console.log('-'.repeat(40))
    console.log(`问题总数: ${report.total_issues}`)
    console.log(`  - 缺失 thumbnail_paths: ${report.missing_thumbnails_count}`)
    console.log(`  - thumbnail_paths 不完整: ${report.incomplete_thumbnails_count}`)
    console.log(`  - file_path 格式异常: ${report.invalid_file_path_count}`)
    console.log('-'.repeat(40))
    console.log(`状态: ${report.status === 'SUCCESS' ? '✅ SUCCESS' : '❌ ERROR'}`)

    if (report.error) {
      console.log(`错误: ${report.error}`)
    }

    if (report.total_issues > 0) {
      console.log('\n⚠️ 建议：请检查日志中的详细问题记录，必要时手工修复')
    }

    console.log('='.repeat(80) + '\n')
  }
}

// 支持直接执行（供命令行或测试调用）
if (require.main === module) {
  // 加载环境变量
  require('dotenv').config()
  ;(async () => {
    try {
      console.log('执行每日图片资源数据质量检查...')
      const report = await DailyImageResourceQualityCheck.execute()
      process.exit(report.status === 'SUCCESS' ? 0 : 1)
    } catch (error) {
      console.error('数据质量检查任务执行失败:', error)
      process.exit(1)
    }
  })()
}

module.exports = DailyImageResourceQualityCheck
