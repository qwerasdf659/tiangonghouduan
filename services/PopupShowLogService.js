/**
 * 弹窗展示日志服务层
 *
 * 业务场景：
 * - 记录用户每次看到弹窗的详细信息
 * - 统计弹窗展示效果、用户行为分析
 * - 支持频率控制算法的数据基础
 *
 * 服务对象：
 * - /api/v4/popup/show-log（小程序端 - 上报弹窗展示日志）
 * - /api/v4/console/popup/stats（管理端 - 查看弹窗统计数据）
 *
 * 创建时间：2026-02-18
 */

const logger = require('../utils/logger').logger
const { PopupShowLog } = require('../models')
const { Op } = require('sequelize')
const { sequelize } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 关闭方式有效值
 * @constant {string[]}
 */
const VALID_CLOSE_METHODS = ['close_btn', 'overlay', 'confirm_btn', 'auto_timeout']

/**
 * 弹窗展示日志服务类
 *
 * @class PopupShowLogService
 * @description 提供弹窗展示日志的创建、查询、统计等操作
 */
class PopupShowLogService {
  /**
   * 创建弹窗展示日志记录
   *
   * @param {Object} data - 日志数据
   * @param {number} data.popup_banner_id - 弹窗ID
   * @param {number} data.user_id - 用户ID
   * @param {number|null} data.show_duration_ms - 展示时长（毫秒）
   * @param {string} data.close_method - 关闭方式（close_btn/overlay/confirm_btn/auto_timeout）
   * @param {number} data.queue_position - 队列位置（1-5）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 创建的日志记录
   */
  static async createLog(data, options = {}) {
    const { popup_banner_id, user_id, show_duration_ms, close_method, queue_position } = data
    const { transaction } = options

    try {
      // 验证关闭方式
      if (!VALID_CLOSE_METHODS.includes(close_method)) {
        throw new Error(`关闭方式无效，必须是以下之一：${VALID_CLOSE_METHODS.join(', ')}`)
      }

      // 验证队列位置（1-5）
      const queuePos = parseInt(queue_position)
      if (isNaN(queuePos) || queuePos < 1 || queuePos > 5) {
        throw new Error('队列位置必须是 1-5 之间的整数')
      }

      const log = await PopupShowLog.create(
        {
          popup_banner_id: parseInt(popup_banner_id),
          user_id: parseInt(user_id),
          show_duration_ms: show_duration_ms ? parseInt(show_duration_ms) : null,
          close_method,
          queue_position: queuePos,
          created_at: BeijingTimeHelper.createBeijingTime()
        },
        { transaction }
      )

      logger.info('创建弹窗展示日志成功', {
        popup_show_log_id: log.popup_show_log_id,
        popup_banner_id,
        user_id,
        close_method,
        queue_position: queuePos
      })

      return log.toJSON()
    } catch (error) {
      logger.error('创建弹窗展示日志失败', {
        error: error.message,
        popup_banner_id,
        user_id,
        close_method,
        queue_position
      })
      throw error
    }
  }

  /**
   * 获取指定弹窗的展示统计数据
   *
   * @param {number} popupBannerId - 弹窗ID
   * @param {Object} options - 查询选项
   * @param {Date|string|null} options.startDate - 开始日期
   * @param {Date|string|null} options.endDate - 结束日期
   * @returns {Promise<Object>} 统计数据
   */
  static async getShowStats(popupBannerId, options = {}) {
    const { startDate = null, endDate = null } = options

    try {
      // 构建查询条件
      const whereClause = {
        popup_banner_id: parseInt(popupBannerId)
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
      const [
        totalShowsResult,
        avgDurationResult,
        closeMethodDistribution,
        queuePositionDistribution
      ] = await Promise.all([
        // 总展示次数
        PopupShowLog.count({
          where: whereClause
        }),

        // 平均展示时长
        PopupShowLog.findAll({
          attributes: [[sequelize.fn('AVG', sequelize.col('show_duration_ms')), 'avg_duration_ms']],
          where: {
            ...whereClause,
            show_duration_ms: { [Op.ne]: null }
          },
          raw: true
        }),

        // 关闭方式分布
        PopupShowLog.findAll({
          attributes: [
            'close_method',
            [sequelize.fn('COUNT', sequelize.col('popup_show_log_id')), 'count']
          ],
          where: whereClause,
          group: ['close_method'],
          raw: true
        }),

        // 队列位置分布
        PopupShowLog.findAll({
          attributes: [
            'queue_position',
            [sequelize.fn('COUNT', sequelize.col('popup_show_log_id')), 'count']
          ],
          where: whereClause,
          group: ['queue_position'],
          raw: true
        })
      ])

      // 处理平均展示时长
      const avgDurationMs =
        avgDurationResult && avgDurationResult[0]
          ? Math.round(parseFloat(avgDurationResult[0].avg_duration_ms) || 0)
          : 0

      // 处理关闭方式分布
      const closeMethodDist = {}
      VALID_CLOSE_METHODS.forEach(method => {
        closeMethodDist[method] = 0
      })
      closeMethodDistribution.forEach(item => {
        closeMethodDist[item.close_method] = parseInt(item.count) || 0
      })

      // 处理队列位置分布
      const queuePositionDist = {}
      for (let i = 1; i <= 5; i++) {
        queuePositionDist[i] = 0
      }
      queuePositionDistribution.forEach(item => {
        const pos = parseInt(item.queue_position)
        if (pos >= 1 && pos <= 5) {
          queuePositionDist[pos] = parseInt(item.count) || 0
        }
      })

      const stats = {
        total_shows: totalShowsResult,
        avg_duration_ms: avgDurationMs,
        close_method_distribution: closeMethodDist,
        queue_position_distribution: queuePositionDist
      }

      logger.info('获取弹窗展示统计数据成功', {
        popup_banner_id: popupBannerId,
        total_shows: totalShowsResult,
        start_date: startDate,
        end_date: endDate
      })

      return stats
    } catch (error) {
      logger.error('获取弹窗展示统计数据失败', {
        error: error.message,
        popup_banner_id: popupBannerId
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
      const dailyStats = await PopupShowLog.findAll({
        attributes: [
          [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('popup_show_log_id')), 'total_shows'],
          [
            sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('user_id'))),
            'unique_users'
          ],
          [sequelize.fn('AVG', sequelize.col('show_duration_ms')), 'avg_duration_ms']
        ],
        where: whereClause,
        group: [sequelize.fn('DATE', sequelize.col('created_at'))],
        order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'DESC']],
        raw: true
      })

      // 格式化结果
      const formattedStats = dailyStats.map(stat => ({
        date: stat.date ? stat.date.toISOString().split('T')[0] : null,
        total_shows: parseInt(stat.total_shows) || 0,
        unique_users: parseInt(stat.unique_users) || 0,
        avg_duration_ms: Math.round(parseFloat(stat.avg_duration_ms) || 0)
      }))

      logger.info('获取每日弹窗统计数据成功', {
        record_count: formattedStats.length,
        start_date: startDate,
        end_date: endDate
      })

      return formattedStats
    } catch (error) {
      logger.error('获取每日弹窗统计数据失败', {
        error: error.message,
        start_date: startDate,
        end_date: endDate
      })
      throw error
    }
  }
}

module.exports = PopupShowLogService
module.exports.VALID_CLOSE_METHODS = VALID_CLOSE_METHODS
