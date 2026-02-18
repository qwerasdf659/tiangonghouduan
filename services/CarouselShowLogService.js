/**
 * 轮播图展示日志服务层
 *
 * 业务场景：
 * - 记录用户每次看到轮播图的详细信息
 * - 统计轮播图展示效果、点击率、曝光时长
 * - 支持轮播图效果分析和优化
 *
 * 服务对象：
 * - /api/v4/carousel/show-log（小程序端 - 上报轮播图展示日志）
 * - /api/v4/console/carousel/stats（管理端 - 查看轮播图统计数据）
 *
 * 创建时间：2026-02-18
 */

const logger = require('../utils/logger').logger
const { CarouselShowLog } = require('../models')
const { Op } = require('sequelize')
const { sequelize } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 轮播图展示日志服务类
 *
 * @class CarouselShowLogService
 * @description 提供轮播图展示日志的创建、查询、统计等操作
 */
class CarouselShowLogService {
  /**
   * 创建轮播图展示日志记录
   *
   * @param {Object} data - 日志数据
   * @param {number} data.carousel_item_id - 轮播图ID
   * @param {number} data.user_id - 用户ID
   * @param {number|null} data.exposure_duration_ms - 曝光时长（毫秒）
   * @param {boolean} data.is_manual_swipe - 是否手动滑动
   * @param {boolean} data.is_clicked - 是否点击
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 创建的日志记录
   */
  static async createLog(data, options = {}) {
    const { carousel_item_id, user_id, exposure_duration_ms, is_manual_swipe, is_clicked } = data
    const { transaction } = options

    try {
      const log = await CarouselShowLog.create(
        {
          carousel_item_id: parseInt(carousel_item_id),
          user_id: parseInt(user_id),
          exposure_duration_ms: exposure_duration_ms ? parseInt(exposure_duration_ms) : null,
          is_manual_swipe: Boolean(is_manual_swipe),
          is_clicked: Boolean(is_clicked),
          created_at: BeijingTimeHelper.createBeijingTime()
        },
        { transaction }
      )

      logger.info('创建轮播图展示日志成功', {
        carousel_show_log_id: log.carousel_show_log_id,
        carousel_item_id,
        user_id,
        is_manual_swipe: Boolean(is_manual_swipe),
        is_clicked: Boolean(is_clicked)
      })

      return log.toJSON()
    } catch (error) {
      logger.error('创建轮播图展示日志失败', {
        error: error.message,
        carousel_item_id,
        user_id
      })
      throw error
    }
  }

  /**
   * 获取指定轮播图的曝光统计数据
   *
   * @param {number} carouselItemId - 轮播图ID
   * @param {Object} options - 查询选项
   * @param {Date|string|null} options.startDate - 开始日期
   * @param {Date|string|null} options.endDate - 结束日期
   * @returns {Promise<Object>} 统计数据
   */
  static async getShowStats(carouselItemId, options = {}) {
    const { startDate = null, endDate = null } = options

    try {
      // 构建查询条件
      const whereClause = {
        carousel_item_id: parseInt(carouselItemId)
      }

      if (startDate || endDate) {
        whereClause.created_at = {}
        if (startDate) {
          whereClause.created_at[Op.gte] = new Date(startDate)
        }
        if (endDate) {
          whereClause.created_at[Op.lte] = new Date(endDate)
        }
      }

      // 并行执行多个统计查询
      const [totalExposuresResult, avgExposureResult, clickCountResult, manualSwipeCountResult] =
        await Promise.all([
          // 总曝光次数
          CarouselShowLog.count({
            where: whereClause
          }),

          // 平均曝光时长
          CarouselShowLog.findAll({
            attributes: [
              [sequelize.fn('AVG', sequelize.col('exposure_duration_ms')), 'avg_exposure_ms']
            ],
            where: {
              ...whereClause,
              exposure_duration_ms: { [Op.ne]: null }
            },
            raw: true
          }),

          // 点击次数
          CarouselShowLog.count({
            where: {
              ...whereClause,
              is_clicked: true
            }
          }),

          // 手动滑动次数
          CarouselShowLog.count({
            where: {
              ...whereClause,
              is_manual_swipe: true
            }
          })
        ])

      // 处理统计数据
      const totalExposures = totalExposuresResult || 0
      const avgExposureMs =
        avgExposureResult && avgExposureResult[0]
          ? Math.round(parseFloat(avgExposureResult[0].avg_exposure_ms) || 0)
          : 0
      const clickCount = clickCountResult || 0
      const manualSwipeCount = manualSwipeCountResult || 0

      // 计算比率
      const clickRate =
        totalExposures > 0 ? Math.round((clickCount / totalExposures) * 10000) / 100 : 0 // 保留两位小数
      const manualSwipeRate =
        totalExposures > 0 ? Math.round((manualSwipeCount / totalExposures) * 10000) / 100 : 0 // 保留两位小数

      const stats = {
        total_exposures: totalExposures,
        avg_exposure_ms: avgExposureMs,
        click_count: clickCount,
        click_rate: clickRate,
        manual_swipe_count: manualSwipeCount,
        manual_swipe_rate: manualSwipeRate
      }

      logger.info('获取轮播图曝光统计数据成功', {
        carousel_item_id: carouselItemId,
        total_exposures: totalExposures,
        click_count: clickCount,
        click_rate: clickRate,
        start_date: startDate,
        end_date: endDate
      })

      return stats
    } catch (error) {
      logger.error('获取轮播图曝光统计数据失败', {
        error: error.message,
        carousel_item_id: carouselItemId
      })
      throw error
    }
  }

  /**
   * 获取每日聚合统计数据
   *
   * @param {Object} options - 查询选项
   * @param {Date|string|null} options.startDate - 开始日期
   * @param {Date|string|null} options.endDate - 结束日期
   * @returns {Promise<Array>} 每日统计数据数组
   */
  static async getDailyStats(options = {}) {
    const { startDate = null, endDate = null } = options

    try {
      // 构建查询条件
      const whereClause = {}
      if (startDate || endDate) {
        whereClause.created_at = {}
        if (startDate) {
          whereClause.created_at[Op.gte] = new Date(startDate)
        }
        if (endDate) {
          whereClause.created_at[Op.lte] = new Date(endDate)
        }
      }

      // 按日期分组统计
      const dailyStats = await CarouselShowLog.findAll({
        attributes: [
          [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('carousel_show_log_id')), 'total_exposures'],
          [
            sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('user_id'))),
            'unique_users'
          ],
          [
            sequelize.fn('SUM', sequelize.literal('CASE WHEN is_clicked = true THEN 1 ELSE 0 END')),
            'clicks'
          ],
          [sequelize.fn('AVG', sequelize.col('exposure_duration_ms')), 'avg_exposure_ms']
        ],
        where: whereClause,
        group: [sequelize.fn('DATE', sequelize.col('created_at'))],
        order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'DESC']],
        raw: true
      })

      // 格式化结果
      const formattedStats = dailyStats.map(stat => ({
        date: stat.date ? stat.date.toISOString().split('T')[0] : null,
        total_exposures: parseInt(stat.total_exposures) || 0,
        unique_users: parseInt(stat.unique_users) || 0,
        clicks: parseInt(stat.clicks) || 0,
        avg_exposure_ms: Math.round(parseFloat(stat.avg_exposure_ms) || 0)
      }))

      logger.info('获取每日轮播图统计数据成功', {
        record_count: formattedStats.length,
        start_date: startDate,
        end_date: endDate
      })

      return formattedStats
    } catch (error) {
      logger.error('获取每日轮播图统计数据失败', {
        error: error.message,
        start_date: startDate,
        end_date: endDate
      })
      throw error
    }
  }
}

module.exports = CarouselShowLogService
