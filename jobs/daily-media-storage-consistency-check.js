/**
 * 餐厅积分抽奖系统 V4.2 - 每日媒体存储一致性检测任务
 *
 * @description
 *   通过 HEAD 请求验证 media_files 表中记录的媒体文件在 Sealos 对象存储中真实存在
 *   发现"数据库有记录但存储文件缺失"的不一致情况，记录告警日志
 *
 * @architecture 2026-03-16 媒体体系迁移
 *   - 针对 media_files 表
 *   - 定时执行：每天凌晨 5:00（Cron: 0 5 * * *）
 *   - 检测方式：SealosStorageService.fileExists()（S3 HEAD 请求）
 *   - 分批处理：每批 50 条，避免瞬时大量 HEAD 请求
 *   - 告警策略：仅记录 WARN 日志，不自动删除记录（防误删）
 *
 * @version 2.0.0
 * @date 2026-03-16
 */

const logger = require('../utils/logger').logger

/**
 * 每日媒体存储一致性检测任务类
 *
 * @class DailyMediaStorageConsistencyCheck
 * @description 验证 media_files 数据库记录与 Sealos 存储文件的一致性
 */
class DailyMediaStorageConsistencyCheck {
  /**
   * 执行一致性检测任务
   *
   * @param {Object} [options] - 检测选项
   * @param {number} [options.batchSize=50] - 每批检测的图片数量
   * @param {number} [options.concurrency=5] - 每批内并发 HEAD 请求数
   * @returns {Promise<Object>} 检测报告
   */
  static async execute(options = {}) {
    const { batchSize = 50, concurrency = 5 } = options
    const startTime = Date.now()

    logger.info('开始每日媒体存储一致性检测', { batch_size: batchSize, concurrency })

    try {
      const { MediaFile } = require('../models')
      const SealosStorageService = require('../services/sealosStorage')
      const storageService = new SealosStorageService()

      let offset = 0
      let totalChecked = 0
      const missingFiles = []
      const errorRecords = []

      // 分批查询并检测（media_files 表）
      while (true) {
        const mediaFiles = await MediaFile.findAll({
          where: { status: 'active' },
          attributes: ['media_id', 'object_key', 'folder'],
          order: [['media_id', 'ASC']],
          limit: batchSize,
          offset
        })

        if (mediaFiles.length === 0) break

        // 批内并发检测（限制并发数避免压垮存储服务）
        const results = await DailyMediaStorageConsistencyCheck._checkBatch(
          storageService,
          mediaFiles,
          concurrency
        )

        totalChecked += mediaFiles.length
        missingFiles.push(...results.missing)
        errorRecords.push(...results.errors)

        offset += batchSize

        // 进度日志（每 200 条输出一次）
        if (totalChecked % 200 === 0 && totalChecked > 0) {
          logger.info(`媒体存储一致性检测进度: ${totalChecked} 条已检查`, {
            missing_so_far: missingFiles.length
          })
        }
      }

      const durationMs = Date.now() - startTime
      const report = {
        timestamp: new Date().toISOString(),
        total_checked: totalChecked,
        missing_count: missingFiles.length,
        error_count: errorRecords.length,
        consistent_count: totalChecked - missingFiles.length - errorRecords.length,
        missing_files: missingFiles.slice(0, 100), // 最多记录 100 条明细
        error_records: errorRecords.slice(0, 20),
        duration_ms: durationMs,
        status: 'SUCCESS'
      }

      this._outputReport(report)

      // 有缺失文件时输出 WARN 级别日志
      if (missingFiles.length > 0) {
        logger.warn('媒体存储一致性检测发现缺失文件', {
          total_checked: totalChecked,
          missing_count: missingFiles.length,
          missing_ids: missingFiles.map(m => m.media_id)
        })
      }

      return report
    } catch (error) {
      logger.error('媒体存储一致性检测失败', {
        error_message: error.message,
        error_stack: error.stack
      })

      const report = {
        timestamp: new Date().toISOString(),
        total_checked: 0,
        missing_count: 0,
        error_count: 0,
        consistent_count: 0,
        missing_files: [],
        error_records: [],
        duration_ms: Date.now() - startTime,
        status: 'ERROR',
        error: error.message
      }

      this._outputReport(report)
      throw error
    }
  }

  /**
   * 批量检测媒体文件存在性（控制并发数）
   *
   * @param {Object} storageService - SealosStorageService 实例
   * @param {Array} mediaFiles - media_files 记录数组
   * @param {number} concurrency - 并发数
   * @returns {Promise<Object>} { missing: [], errors: [] }
   * @private
   */
  static async _checkBatch(storageService, mediaFiles, concurrency) {
    const missing = []
    const errors = []

    // 分组并发执行
    for (let i = 0; i < mediaFiles.length; i += concurrency) {
      const chunk = mediaFiles.slice(i, i + concurrency)
      const results = await Promise.allSettled(
        chunk.map(async m => {
          if (!m.object_key) {
            missing.push({
              media_id: m.media_id,
              object_key: null,
              reason: 'object_key 为空'
            })
            return
          }

          const exists = await storageService.fileExists(m.object_key)
          if (!exists) {
            missing.push({
              media_id: m.media_id,
              object_key: m.object_key,
              folder: m.folder,
              reason: 'Sealos 文件不存在'
            })
          }
        })
      )

      // 收集异常（网络错误等）
      results.forEach((r, idx) => {
        if (r.status === 'rejected') {
          const m = chunk[idx]
          errors.push({
            media_id: m.media_id,
            object_key: m.object_key,
            error: r.reason?.message || String(r.reason)
          })
        }
      })
    }

    return { missing, errors }
  }

  /**
   * 输出检测报告
   *
   * @param {Object} report - 检测报告
   * @returns {void}
   * @private
   */
  static _outputReport(report) {
    console.log('\n' + '='.repeat(80))
    console.log('🔍 每日媒体存储一致性检测报告')
    console.log('='.repeat(80))
    console.log(`时间: ${report.timestamp}`)
    console.log(`耗时: ${report.duration_ms}ms`)
    console.log(`总检测数: ${report.total_checked}`)
    console.log(`一致数: ${report.consistent_count}`)
    console.log(`缺失数: ${report.missing_count}`)
    console.log(`异常数: ${report.error_count}`)
    console.log(`状态: ${report.status === 'SUCCESS' ? '✅ SUCCESS' : '❌ ERROR'}`)

    if (report.missing_count > 0) {
      console.log('\n--- 缺失文件明细（前 10 条）---')
      report.missing_files.slice(0, 10).forEach(m => {
        console.log(`  media_id=${m.media_id} | object_key=${m.object_key} | ${m.reason}`)
      })
    }

    if (report.error) {
      console.log(`错误: ${report.error}`)
    }

    console.log('='.repeat(80) + '\n')
  }
}

// 支持直接执行（供命令行或测试调用）
if (require.main === module) {
  require('dotenv').config()
  ;(async () => {
    try {
      const report = await DailyMediaStorageConsistencyCheck.execute()
      process.exit(report.status === 'SUCCESS' ? 0 : 1)
    } catch (error) {
      console.error('一致性检测任务执行失败:', error)
      process.exit(1)
    }
  })()
}

module.exports = DailyMediaStorageConsistencyCheck
