/**
 * 消费记录商家侧服务
 * V4.7.0 ConsumptionService 拆分（2026-01-31 大文件拆分方案 Phase 4）
 *
 * 职责：
 * - 商家员工查询消费记录列表（getMerchantRecords）
 * - 商家员工查询消费记录详情（getMerchantRecordDetail）
 * - 商家员工查询消费统计（getMerchantStats）
 *
 * @module services/consumption/MerchantService
 */
const logger = require('../../utils/logger').logger
const { attachDisplayNames } = require('../../utils/displayNameHelper')
const { ConsumptionRecord, User, Store, sequelize } = require('../../models')

/**
 * 消费记录商家侧服务类
 * 负责商家员工的消费记录查询操作
 *
 * @class MerchantService
 */
class MerchantService {
  /**
   * 商家员工查询消费记录列表
   *
   * @description 商家员工查询消费记录（按门店隔离+角色权限控制）
   *              店员只能查询自己录入的，店长可以查询全店
   *
   * @param {Object} params - 查询参数
   * @param {number} params.user_id - 当前用户ID
   * @param {number} params.store_id - 门店ID
   * @param {boolean} params.is_manager - 是否为店长
   * @param {string} [params.status] - 状态筛选
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 消费记录列表及分页信息
   *
   * @since 2026-01-18 路由层合规性治理：移除路由直接访问模型
   */
  static async getMerchantRecords(params) {
    const { user_id, store_id, is_manager, status, page = 1, page_size = 20 } = params

    const finalPage = Math.max(parseInt(page, 10) || 1, 1)
    const finalPageSize = Math.min(Math.max(parseInt(page_size, 10) || 20, 1), 50)
    const offset = (finalPage - 1) * finalPageSize

    // 构建查询条件
    const whereClause = {
      store_id,
      is_deleted: 0
    }

    // 店员只能查自己录入的
    if (!is_manager) {
      whereClause.merchant_id = user_id
    }

    // 状态筛选
    if (status && ['pending', 'approved', 'rejected', 'expired'].includes(status)) {
      whereClause.status = status
    }

    try {
      const { count, rows } = await ConsumptionRecord.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: User,
            as: 'merchant',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: Store,
            as: 'store',
            attributes: ['store_id', 'store_name', 'store_code']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: finalPageSize,
        offset
      })

      // 格式化响应数据
      const formattedRecords = rows.map(record => record.toAPIResponse())

      // 附加中文显示名称
      const recordsWithDisplayNames = await attachDisplayNames(formattedRecords, [
        { field: 'status', dictType: 'consumption_status' },
        { field: 'final_status', dictType: 'consumption_final_status' }
      ])

      return {
        records: recordsWithDisplayNames,
        pagination: {
          current_page: finalPage,
          page_size: finalPageSize,
          total_count: count,
          total_pages: Math.ceil(count / finalPageSize)
        },
        query_scope: is_manager ? 'store' : 'self',
        query_note: is_manager
          ? '店长模式：显示本店全部消费记录'
          : '店员模式：仅显示您录入的消费记录'
      }
    } catch (error) {
      logger.error('商家侧消费记录查询失败', {
        error: error.message,
        params
      })
      throw error
    }
  }

  /**
   * 商家员工查询消费记录详情
   *
   * @param {number} recordId - 记录ID
   * @returns {Promise<Object|null>} 消费记录详情（包含关联信息）
   *
   * @since 2026-01-18 路由层合规性治理
   */
  static async getMerchantRecordDetail(recordId) {
    try {
      const record = await ConsumptionRecord.findByPk(recordId, {
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: User,
            as: 'merchant',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: User,
            as: 'reviewer',
            attributes: ['user_id', 'nickname']
          },
          {
            model: Store,
            as: 'store',
            attributes: ['store_id', 'store_name', 'store_code']
          }
        ]
      })

      if (!record) {
        return null
      }

      // 格式化记录并附加中文显示名称
      const formattedRecord = record.toJSON()

      const recordWithDisplayNames = await attachDisplayNames(formattedRecord, [
        { field: 'status', dictType: 'consumption_status' },
        { field: 'final_status', dictType: 'consumption_final_status' }
      ])

      return recordWithDisplayNames
    } catch (error) {
      logger.error('商家侧消费记录详情查询失败', {
        error: error.message,
        recordId
      })
      throw error
    }
  }

  /**
   * 商家员工查询消费统计
   *
   * @param {Object} params - 查询参数
   * @param {number} params.user_id - 当前用户ID
   * @param {number} params.store_id - 门店ID
   * @param {boolean} params.is_manager - 是否为店长
   * @returns {Promise<Object>} 消费统计数据
   *
   * @since 2026-01-18 路由层合规性治理
   */
  static async getMerchantStats(params) {
    const { user_id, store_id, is_manager } = params

    // 构建查询条件
    const whereClause = {
      store_id,
      is_deleted: 0
    }

    // 店员只统计自己的
    if (!is_manager) {
      whereClause.merchant_id = user_id
    }

    try {
      // 执行统计查询
      const stats = await ConsumptionRecord.findAll({
        where: whereClause,
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('record_id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('consumption_amount')), 'total_amount'],
          [sequelize.fn('SUM', sequelize.col('points_to_award')), 'total_points']
        ],
        group: ['status'],
        raw: true
      })

      // 格式化统计结果
      const statusStats = {
        pending: { count: 0, amount: 0, points: 0 },
        approved: { count: 0, amount: 0, points: 0 },
        rejected: { count: 0, amount: 0, points: 0 },
        expired: { count: 0, amount: 0, points: 0 }
      }

      stats.forEach(stat => {
        if (statusStats[stat.status]) {
          statusStats[stat.status] = {
            count: parseInt(stat.count, 10) || 0,
            amount: parseFloat(stat.total_amount) || 0,
            points: parseInt(stat.total_points, 10) || 0
          }
        }
      })

      // 计算总计
      const total = {
        count: Object.values(statusStats).reduce((sum, s) => sum + s.count, 0),
        amount: Object.values(statusStats).reduce((sum, s) => sum + s.amount, 0),
        approved_points: statusStats.approved.points
      }

      return {
        store_id,
        stats_scope: is_manager ? 'store' : 'self',
        by_status: statusStats,
        total
      }
    } catch (error) {
      logger.error('商家侧消费统计查询失败', {
        error: error.message,
        params
      })
      throw error
    }
  }
}

module.exports = MerchantService
