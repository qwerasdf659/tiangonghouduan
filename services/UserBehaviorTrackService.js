/**
 * 用户行为轨迹服务
 *
 * 功能说明：
 * - 行为记录：自动记录用户关键行为（登录、抽奖、消费、兑换等）
 * - 轨迹聚合：按用户、时间、类型等维度聚合分析
 * - 会话追踪：关联同一会话内的行为序列
 * - 数据导出：支持多格式导出
 *
 * 业务场景：
 * - 用户画像构建
 * - 运营决策支持
 * - 异常行为检测
 * - 用户生命周期分析
 *
 * 创建时间：2026年01月31日
 * 任务编号：B-46 行为轨迹聚合, B-47~B-49 轨迹API
 */

'use strict'

const models = require('../models')
const logger = require('../utils/logger')
const BeijingTimeHelper = require('../utils/timeHelper')
const { Op } = require('sequelize')

/**
 * 用户行为轨迹服务类
 */
class UserBehaviorTrackService {
  /**
   * 记录用户行为
   *
   * @param {Object} params - 行为参数
   * @param {number} params.user_id - 用户ID
   * @param {string} params.behavior_type - 行为类型
   * @param {string} params.behavior_action - 行为动作
   * @param {string} [params.behavior_target] - 目标类型
   * @param {number} [params.behavior_target_id] - 目标ID
   * @param {Object} [params.behavior_data] - 行为数据
   * @param {string} [params.behavior_result] - 行为结果
   * @param {string} [params.session_id] - 会话ID
   * @param {Object} [params.device_info] - 设备信息
   * @param {string} [params.ip_address] - IP地址
   * @param {Object} [options] - Sequelize 选项
   * @returns {Promise<Object>} 创建的轨迹记录
   */
  static async track(params, options = {}) {
    const {
      user_id,
      behavior_type,
      behavior_action,
      behavior_target,
      behavior_target_id,
      behavior_data,
      behavior_result,
      session_id,
      device_info,
      ip_address
    } = params

    try {
      const track = await models.UserBehaviorTrack.create(
        {
          user_id,
          behavior_type,
          behavior_action,
          behavior_target,
          behavior_target_id,
          behavior_data,
          behavior_result,
          behavior_session_id: session_id,
          device_info,
          ip_address,
          behavior_time: BeijingTimeHelper.createDatabaseTime()
        },
        options
      )

      logger.debug(`[行为轨迹] 记录成功`, {
        user_behavior_track_id: track.user_behavior_track_id,
        user_id,
        behavior_type,
        behavior_action
      })

      return track
    } catch (error) {
      // 行为记录失败不应影响业务流程
      logger.error(`[行为轨迹] 记录失败`, {
        user_id,
        behavior_type,
        error: error.message
      })
      return null
    }
  }

  /**
   * 批量记录行为（高性能场景）
   *
   * @param {Array} tracks - 行为数组
   * @param {Object} [options] - Sequelize 选项
   * @returns {Promise<number>} 成功创建的记录数
   */
  static async trackBatch(tracks, options = {}) {
    if (!tracks || tracks.length === 0) {
      return 0
    }

    try {
      const now = BeijingTimeHelper.createDatabaseTime()
      const records = tracks.map(track => ({
        ...track,
        behavior_time: track.behavior_time || now
      }))

      const result = await models.UserBehaviorTrack.bulkCreate(records, {
        ...options,
        validate: true
      })

      logger.info(`[行为轨迹] 批量记录成功`, { count: result.length })
      return result.length
    } catch (error) {
      logger.error(`[行为轨迹] 批量记录失败`, { error: error.message })
      return 0
    }
  }

  /**
   * 获取用户行为轨迹列表
   *
   * @param {Object} params - 查询参数
   * @param {number} params.user_id - 用户ID（必需）
   * @param {string} [params.behavior_type] - 行为类型筛选
   * @param {Date} [params.start_time] - 开始时间
   * @param {Date} [params.end_time] - 结束时间
   * @param {string} [params.session_id] - 会话ID筛选
   * @param {number} [params.page] - 页码
   * @param {number} [params.page_size] - 每页数量
   * @returns {Promise<Object>} 分页结果
   */
  static async getUserTracks(params) {
    const {
      user_id,
      behavior_type,
      start_time,
      end_time,
      session_id,
      page = 1,
      page_size = 20
    } = params

    const where = { user_id }

    if (behavior_type) {
      where.behavior_type = behavior_type
    }

    if (session_id) {
      where.behavior_session_id = session_id
    }

    if (start_time || end_time) {
      where.behavior_time = {}
      if (start_time) {
        where.behavior_time[Op.gte] = start_time
      }
      if (end_time) {
        where.behavior_time[Op.lte] = end_time
      }
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await models.UserBehaviorTrack.findAndCountAll({
      where,
      order: [['behavior_time', 'DESC']],
      limit: page_size,
      offset
    })

    return {
      total: count,
      page,
      page_size,
      total_pages: Math.ceil(count / page_size),
      items: rows
    }
  }

  /**
   * 获取用户行为统计
   *
   * @param {number} userId - 用户ID
   * @param {Object} [options] - 查询选项
   * @param {Date} [options.start_time] - 开始时间
   * @param {Date} [options.end_time] - 结束时间
   * @returns {Promise<Object>} 统计数据
   */
  static async getUserStats(userId, options = {}) {
    const { start_time, end_time } = options
    const where = { user_id: userId }

    if (start_time || end_time) {
      where.behavior_time = {}
      if (start_time) {
        where.behavior_time[Op.gte] = start_time
      }
      if (end_time) {
        where.behavior_time[Op.lte] = end_time
      }
    }

    // 按类型统计
    const typeStats = await models.UserBehaviorTrack.findAll({
      where,
      attributes: [
        'behavior_type',
        [models.sequelize.fn('COUNT', models.sequelize.col('user_behavior_track_id')), 'count']
      ],
      group: ['behavior_type'],
      raw: true
    })

    // 按结果统计
    const resultStats = await models.UserBehaviorTrack.findAll({
      where,
      attributes: [
        'behavior_result',
        [models.sequelize.fn('COUNT', models.sequelize.col('user_behavior_track_id')), 'count']
      ],
      group: ['behavior_result'],
      raw: true
    })

    // 总数统计
    const totalCount = await models.UserBehaviorTrack.count({ where })

    // 最近活跃时间
    const lastTrack = await models.UserBehaviorTrack.findOne({
      where,
      order: [['behavior_time', 'DESC']],
      attributes: ['behavior_time']
    })

    // 转换为对象格式
    const byType = {}
    typeStats.forEach(stat => {
      byType[stat.behavior_type] = parseInt(stat.count, 10)
    })

    const byResult = {}
    resultStats.forEach(stat => {
      if (stat.behavior_result) {
        byResult[stat.behavior_result] = parseInt(stat.count, 10)
      }
    })

    return {
      user_id: userId,
      total_behaviors: totalCount,
      by_type: byType,
      by_result: byResult,
      last_active_at: lastTrack?.behavior_time || null
    }
  }

  /**
   * 获取行为轨迹详情
   *
   * @param {number} trackId - 轨迹ID
   * @returns {Promise<Object|null>} 轨迹详情
   */
  static async getTrackDetail(trackId) {
    const track = await models.UserBehaviorTrack.findByPk(trackId, {
      include: [
        {
          model: models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ]
    })

    return track
  }

  /**
   * 聚合分析：按日期统计行为分布
   *
   * @param {Object} params - 查询参数
   * @param {Date} params.start_date - 开始日期
   * @param {Date} params.end_date - 结束日期
   * @param {number} [params.user_id] - 用户ID（可选）
   * @param {string} [params.behavior_type] - 行为类型（可选）
   * @returns {Promise<Array>} 按日期的统计数组
   */
  static async aggregateByDate(params) {
    const { start_date, end_date, user_id, behavior_type } = params

    const where = {
      behavior_time: {
        [Op.between]: [start_date, end_date]
      }
    }

    if (user_id) {
      where.user_id = user_id
    }

    if (behavior_type) {
      where.behavior_type = behavior_type
    }

    const results = await models.UserBehaviorTrack.findAll({
      where,
      attributes: [
        [models.sequelize.fn('DATE', models.sequelize.col('behavior_time')), 'date'],
        'behavior_type',
        [models.sequelize.fn('COUNT', models.sequelize.col('user_behavior_track_id')), 'count']
      ],
      group: [models.sequelize.fn('DATE', models.sequelize.col('behavior_time')), 'behavior_type'],
      order: [[models.sequelize.fn('DATE', models.sequelize.col('behavior_time')), 'ASC']],
      raw: true
    })

    return results
  }

  /**
   * 聚合分析：用户活跃度排名
   *
   * @param {Object} params - 查询参数
   * @param {Date} params.start_date - 开始日期
   * @param {Date} params.end_date - 结束日期
   * @param {number} [params.limit] - 返回数量限制
   * @returns {Promise<Array>} 用户活跃度排名
   */
  static async getActiveUsersRanking(params) {
    const { start_date, end_date, limit = 10 } = params

    const results = await models.UserBehaviorTrack.findAll({
      where: {
        behavior_time: {
          [Op.between]: [start_date, end_date]
        }
      },
      attributes: [
        'user_id',
        [
          models.sequelize.fn('COUNT', models.sequelize.col('user_behavior_track_id')),
          'behavior_count'
        ],
        [
          models.sequelize.fn(
            'COUNT',
            models.sequelize.fn('DISTINCT', models.sequelize.col('behavior_type'))
          ),
          'behavior_types'
        ]
      ],
      include: [
        {
          model: models.User,
          as: 'user',
          attributes: ['nickname', 'mobile']
        }
      ],
      group: ['user_id', 'user.user_id', 'user.nickname', 'user.mobile'],
      order: [
        [models.sequelize.fn('COUNT', models.sequelize.col('user_behavior_track_id')), 'DESC']
      ],
      limit,
      raw: false
    })

    return results
  }

  /**
   * 获取会话内的行为序列
   *
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Array>} 按时间排序的行为序列
   */
  static async getSessionTracks(sessionId) {
    const tracks = await models.UserBehaviorTrack.findAll({
      where: { behavior_session_id: sessionId },
      order: [['behavior_time', 'ASC']],
      include: [
        {
          model: models.User,
          as: 'user',
          attributes: ['user_id', 'nickname']
        }
      ]
    })

    return tracks
  }

  /**
   * 导出用户行为数据
   *
   * @param {Object} params - 导出参数
   * @param {number} params.user_id - 用户ID
   * @param {Date} [params.start_time] - 开始时间
   * @param {Date} [params.end_time] - 结束时间
   * @param {string} [params.format] - 导出格式（json/csv）
   * @returns {Promise<Object>} 导出数据
   */
  static async exportUserTracks(params) {
    const { user_id, start_time, end_time, format = 'json' } = params

    const where = { user_id }

    if (start_time || end_time) {
      where.behavior_time = {}
      if (start_time) {
        where.behavior_time[Op.gte] = start_time
      }
      if (end_time) {
        where.behavior_time[Op.lte] = end_time
      }
    }

    const tracks = await models.UserBehaviorTrack.findAll({
      where,
      order: [['behavior_time', 'DESC']],
      raw: true
    })

    if (format === 'csv') {
      // CSV 格式转换
      const headers = [
        'user_behavior_track_id',
        'user_id',
        'behavior_type',
        'behavior_action',
        'behavior_target',
        'behavior_target_id',
        'behavior_result',
        'behavior_time',
        'ip_address'
      ]

      const csvRows = [headers.join(',')]

      tracks.forEach(track => {
        const row = headers.map(header => {
          const value = track[header]
          if (value === null || value === undefined) return ''
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value}"`
          }
          return value
        })
        csvRows.push(row.join(','))
      })

      return {
        format: 'csv',
        content: csvRows.join('\n'),
        count: tracks.length
      }
    }

    return {
      format: 'json',
      data: tracks,
      count: tracks.length
    }
  }
}

module.exports = UserBehaviorTrackService
