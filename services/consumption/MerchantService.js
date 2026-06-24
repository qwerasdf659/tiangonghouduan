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
const { ConsumptionRecord, User, Store, ApprovalChainStep, sequelize } = require('../../models')
const { Op } = require('sequelize')

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
   * @since 2026
   */
  /**
   * 查询商家侧消费记录列表（按数据范围 + 角色权限隔离）
   *
   * 数据范围（2026-06-24 §12.4 接入 DataScopeService 多店聚合）：
   * - store_scope='all'（管理员）：不加门店过滤，全局可见
   * - store_scope='stores'：按可见门店集合 store_ids 聚合（店长本店 / 区域负责人辖区多店）
   * - is_manager=false（店员）：在门店范围基础上再叠加 merchant_id=自己（只看本人经手记录）
   *
   * @param {Object} params - 查询参数
   * @param {number} params.user_id - 当前用户ID
   * @param {string} [params.store_scope] - 数据范围：'all' | 'stores'（来自 DataScopeService）
   * @param {number[]} [params.store_ids] - 可见门店集合（store_scope='stores' 时生效）
   * @param {boolean} params.is_manager - 是否为店长/管理者（false=店员，叠加本人经手过滤）
   * @param {string} [params.status] - 状态筛选
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 消费记录列表及分页信息
   *
   * @since 2026
   */
  static async getMerchantRecords(params) {
    const { user_id, store_scope, store_ids, is_manager, status, page = 1, page_size = 20 } = params

    const finalPage = Math.max(parseInt(page, 10) || 1, 1)
    const finalPageSize = Math.min(Math.max(parseInt(page_size, 10) || 20, 1), 50)
    const offset = (finalPage - 1) * finalPageSize

    // 构建查询条件（数据范围隔离：门店集合 + 角色经手过滤）
    const whereClause = {
      is_deleted: 0
    }

    /*
     * 门店范围过滤（DataScopeService 单一事实源）：
     * - 'all'（管理员）：不加门店条件，全局可见
     * - 否则按可见门店集合聚合；集合为空时下发 [0] 保证查不到任何记录（防越权兜底）
     */
    if (store_scope !== 'all') {
      const ids = Array.isArray(store_ids) && store_ids.length > 0 ? store_ids : [0]
      whereClause.store_id = { [Op.in]: ids }
    }

    // 店员只能查自己录入的（merchant_id=经手人本人）
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
          page: finalPage,
          page_size: finalPageSize,
          total: count,
          total_pages: Math.ceil(count / finalPageSize)
        },
        query_scope: store_scope === 'all' ? 'all' : is_manager ? 'stores' : 'self',
        query_note:
          store_scope === 'all'
            ? '管理员模式：显示全部门店消费记录'
            : is_manager
              ? '管理者模式：显示可见门店（本店/辖区）全部消费记录'
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
   * @since 2026
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
   * @since 2026
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
          [sequelize.fn('COUNT', sequelize.col('consumption_record_id')), 'count'],
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

      /*
       * 超时/临近超时维度（2026-06-20 决策 8.4.2/8.6.3，小程序待审预警）：
       * 基于该门店待审消费单对应的审核链步骤 timeout_at——
       *   - overdue：timeout_at 已过期且步骤仍 pending（已超时未处理）
       *   - near_due：timeout_at 在未来 2 小时内（快超时，需尽快处理）
       * 仅统计 consumption 业务、该门店范围内、当前 pending 的步骤。
       */
      const timeoutStats = await MerchantService._getStoreTimeoutStats(store_id)

      return {
        store_id,
        stats_scope: is_manager ? 'store' : 'self',
        by_status: statusStats,
        total,
        // 超时预警维度（小程序"你有 N 单待审，其中 M 单快超时/已超时"）
        timeout: timeoutStats
      }
    } catch (error) {
      logger.error('商家侧消费统计查询失败', {
        error: error.message,
        params
      })
      throw error
    }
  }

  /**
   * 统计门店待审步骤的超时/临近超时数量（小程序待审预警，2026-06-20）
   *
   * 基于 approval_chain_steps（冗余 store_id + timeout_at）按门店聚合当前 pending 步骤：
   *   - overdue：timeout_at < 当前时间（已超时未处理）
   *   - near_due：当前时间 <= timeout_at <= 当前时间 + 2 小时（快超时）
   *   - pending_total：该门店当前 pending 的审核步骤总数
   *
   * @param {number} storeId - 门店ID
   * @returns {Promise<Object>} { pending_total, overdue, near_due }
   * @private
   */
  static async _getStoreTimeoutStats(storeId) {
    const now = new Date()
    const nearDueThreshold = new Date(now.getTime() + 2 * 3600 * 1000)

    const [pendingTotal, overdue, nearDue] = await Promise.all([
      ApprovalChainStep.count({ where: { store_id: storeId, status: 'pending' } }),
      ApprovalChainStep.count({
        where: { store_id: storeId, status: 'pending', timeout_at: { [Op.lt]: now } }
      }),
      ApprovalChainStep.count({
        where: {
          store_id: storeId,
          status: 'pending',
          timeout_at: { [Op.gte]: now, [Op.lte]: nearDueThreshold }
        }
      })
    ])

    return { pending_total: pendingTotal, overdue, near_due: nearDue }
  }
}

module.exports = MerchantService
