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
   * 查询商家侧消费记录列表（按「视角 + 分层数据范围」隔离）
   *
   * 视角模型（执行方案 §四，列表/统计共用同一套口径）：
   * - self：强制 merchant_id=调用者本人，忽略门店（任何角色可用）。
   * - store：看门店全部；target_store_id 指定单店则按单店，否则（D1）聚合全部可见门店。
   * - staff：看某门店某员工（target_store_id + merchant_id=target_user_id，含其离职后历史）。
   * - all：管理员全局，不加门店/人员过滤。
   *
   * 越权校验在路由层完成（视角准入 + 门店 ∈ 可见集合 + 员工任职），本服务只按已校验入参构建查询。
   *
   * @param {Object} params - 查询参数
   * @param {number} params.user_id - 调用者用户ID（self 视角锁本人）
   * @param {string} params.view - 生效视角：'self'|'store'|'staff'|'all'（路由层已解析校验）
   * @param {string} [params.store_scope] - 数据范围：'all'|'stores'（来自 DataScopeService）
   * @param {number[]} [params.store_ids] - 可见门店集合（store_scope='stores' 时生效）
   * @param {number} [params.target_store_id] - 目标门店（store 指定单店 / staff 必带；store 不传=聚合可见门店）
   * @param {number} [params.target_user_id] - 目标员工（staff 视角必带）
   * @param {string} [params.status] - 状态筛选
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 消费记录列表及分页信息（回显 view / view_note）
   *
   * @since 2026
   */
  static async getMerchantRecords(params) {
    const {
      user_id,
      view,
      store_scope,
      store_ids,
      target_store_id,
      target_user_id,
      status,
      page = 1,
      page_size = 20
    } = params

    const finalPage = Math.max(parseInt(page, 10) || 1, 1)
    const finalPageSize = Math.min(Math.max(parseInt(page_size, 10) || 20, 1), 50)
    const offset = (finalPage - 1) * finalPageSize

    // 构建查询条件（按视角隔离数据范围）
    const whereClause = MerchantService._buildViewWhere({
      view,
      user_id,
      store_scope,
      store_ids,
      target_store_id,
      target_user_id
    })

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
        // 回显生效视角（与请求参数同名，前端零映射）
        view,
        view_note: MerchantService._buildViewNote({ view, target_store_id, target_user_id })
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
   * 按视角构建消费记录查询的门店/人员过滤条件（列表与统计共用，杜绝口径漂移）
   *
   * @param {Object} args - 见 getMerchantRecords 同名入参
   * @returns {Object} Sequelize where 片段（含 is_deleted:0）
   * @private
   */
  static _buildViewWhere(args) {
    const { view, user_id, store_scope, store_ids, target_store_id, target_user_id } = args
    const whereClause = { is_deleted: 0 }

    if (view === 'self') {
      // 本人视角：锁 merchant_id=自己，跨店均可见自己经手记录
      whereClause.merchant_id = user_id
      return whereClause
    }

    if (view === 'staff') {
      // 员工视角：指定门店 + 指定员工（含其离职后历史）
      whereClause.store_id = target_store_id
      whereClause.merchant_id = target_user_id
      return whereClause
    }

    if (view === 'store') {
      if (target_store_id) {
        // 指定单店（路由已校验 ∈ 可见集合）
        whereClause.store_id = target_store_id
      } else if (store_scope !== 'all') {
        // D1：不传门店 → 聚合全部可见门店；空集合下发 [0] 兜底（查不到任何记录，防越权）
        const ids = Array.isArray(store_ids) && store_ids.length > 0 ? store_ids : [0]
        whereClause.store_id = { [Op.in]: ids }
      }
      // store_scope==='all' 且不传门店：不加门店过滤（等价全局，仅管理员可达）
      return whereClause
    }

    if (view === 'all') {
      // 管理员全局：不加门店/人员过滤
      return whereClause
    }

    /*
     * 兜底（防越权）：未知/缺失 view 时锁死本人 merchant_id，绝不退化为全表可见。
     * 正常情况下 view 由路由层 resolveView 解析后保证为枚举值；此处仅作纵深防御。
     */
    whereClause.merchant_id = user_id
    return whereClause
  }

  /**
   * 构建视角中文说明（view_note，便于前端校验当前生效范围）
   *
   * @param {Object} args - { view, target_store_id, target_user_id }
   * @returns {string} 中文说明
   * @private
   */
  static _buildViewNote(args) {
    const { view, target_store_id, target_user_id } = args
    if (view === 'self') {
      return '本人模式：仅显示您录入的消费记录'
    }
    if (view === 'staff') {
      return `员工模式：门店${target_store_id} 员工${target_user_id} 的提交记录（含离职历史）`
    }
    if (view === 'store') {
      return target_store_id
        ? `门店模式：门店${target_store_id} 全部提交记录`
        : '门店模式：您可见门店（本店/辖区）全部提交记录'
    }
    return '全局模式：显示全部门店消费记录'
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
   * 商家员工查询消费统计（与列表 getMerchantRecords 共用同一套视角口径）
   *
   * @param {Object} params - 查询参数（视角入参与 getMerchantRecords 一致）
   * @param {number} params.user_id - 调用者用户ID
   * @param {string} params.view - 生效视角：'self'|'store'|'staff'|'all'（路由层已解析校验）
   * @param {string} [params.store_scope] - 数据范围：'all'|'stores'（来自 DataScopeService）
   * @param {number[]} [params.store_ids] - 可见门店集合
   * @param {number} [params.target_store_id] - 目标门店（store 指定单店 / staff 必带）
   * @param {number} [params.target_user_id] - 目标员工（staff 必带）
   * @returns {Promise<Object>} 消费统计数据（by_status / total / timeout，回显 view）
   *
   * @since 2026
   */
  static async getMerchantStats(params) {
    const { user_id, view, store_scope, store_ids, target_store_id, target_user_id } = params

    // 与列表共用同一套视角 where（口径统一，杜绝列表/统计对不上）
    const whereClause = MerchantService._buildViewWhere({
      view,
      user_id,
      store_scope,
      store_ids,
      target_store_id,
      target_user_id
    })

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
       * 超时/临近超时维度（小程序待审预警）：
       * 按当前视角对应的门店范围聚合 approval_chain_steps 的 pending 步骤——
       * 与列表口径一致（self/staff/store 单店=该店；store 多店=可见门店集合；all=全局）。
       */
      const timeoutStats = await MerchantService._getTimeoutStatsByScope({
        view,
        store_scope,
        store_ids,
        target_store_id
      })

      return {
        // 回显生效视角（与请求参数同名，前端零映射）
        view,
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
   * 按当前视角的门店范围统计待审步骤超时/临近超时数量（小程序待审预警）
   *
   * 基于 approval_chain_steps（冗余 store_id + timeout_at）聚合当前 pending 步骤：
   *   - overdue：timeout_at < 当前时间（已超时未处理）
   *   - near_due：当前时间 <= timeout_at <= 当前时间 + 2 小时（快超时）
   *   - pending_total：范围内当前 pending 的审核步骤总数
   *
   * 门店范围与列表一致：
   *   - all（管理员且无指定门店）：全局，不加门店条件
   *   - self：本人可见门店集合（store_ids；空集合下发 [0]）
   *   - store 指定单店 / staff：该门店
   *   - store 多店：可见门店集合
   *
   * @param {Object} args - { view, store_scope, store_ids, target_store_id }
   * @returns {Promise<Object>} { pending_total, overdue, near_due }
   * @private
   */
  static async _getTimeoutStatsByScope(args) {
    const { view, store_scope, store_ids, target_store_id } = args
    const now = new Date()
    const nearDueThreshold = new Date(now.getTime() + 2 * 3600 * 1000)

    // 计算门店范围 where 片段（self 不锁 merchant_id，因审核步骤按门店冗余，无逐人维度）
    const storeWhere = {}
    if (view === 'all' && store_scope === 'all') {
      // 全局：不加门店条件
    } else if (target_store_id) {
      // staff / store 指定单店
      storeWhere.store_id = target_store_id
    } else {
      // self / store 多店：按可见门店集合聚合；空集合下发 [0] 兜底
      const ids = Array.isArray(store_ids) && store_ids.length > 0 ? store_ids : [0]
      storeWhere.store_id = { [Op.in]: ids }
    }

    const [pendingTotal, overdue, nearDue] = await Promise.all([
      ApprovalChainStep.count({ where: { ...storeWhere, status: 'pending' } }),
      ApprovalChainStep.count({
        where: { ...storeWhere, status: 'pending', timeout_at: { [Op.lt]: now } }
      }),
      ApprovalChainStep.count({
        where: {
          ...storeWhere,
          status: 'pending',
          timeout_at: { [Op.gte]: now, [Op.lte]: nearDueThreshold }
        }
      })
    ])

    return { pending_total: pendingTotal, overdue, near_due: nearDue }
  }
}

module.exports = MerchantService
