const BusinessError = require('../utils/BusinessError')
const logger = require('../utils/logger').logger
const BeijingTimeHelper = require('../utils/timeHelper')
const { attachDisplayNames, DICT_TYPES } = require('../utils/displayNameHelper')

const { AdminOperationLog, User } = require('../models')

const { normalizeTargetType } = require('../constants/AuditTargetTypes')
const { Op, fn, col, literal } = require('sequelize')

/**
 * 审计日志查询服务（从 AuditLogService 拆分）
 *
 * 职责：审计日志的只读查询、统计、报告生成
 * 设计模式：静态方法（无状态设计）
 */
class AuditLogQueryService {
  /**
   * 管理员获取审计日志列表（Admin Only）
   *
   * @description 管理员查看所有审计日志，支持分页、筛选、排序
   *
   * 业务场景：
   * - 管理后台审计日志管理页面
   * - 操作追溯和审计查询
   * - 安全事件分析
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.operator_id] - 操作员ID筛选
   * @param {string} [options.operation_type] - 操作类型筛选
   * @param {string} [options.target_type] - 目标类型筛选
   * @param {number} [options.target_id] - 目标ID筛选
   * @param {string} [options.start_date] - 开始日期
   * @param {string} [options.end_date] - 结束日期
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.sort_by='created_at'] - 排序字段
   * @param {string} [options.sort_order='DESC'] - 排序方向
   * @returns {Promise<Object>} 审计日志列表和分页信息
   *
   * @example
   * // 获取所有积分调整日志
   * const result = await AuditLogService.getAdminAuditLogs({
   *   operation_type: 'points_adjust',
   *   page: 1,
   *   page_size: 20
   * });
   */
  static async getAdminAuditLogs(options = {}) {
    const {
      operator_id = null,
      operation_type = null,
      target_type = null,
      target_id = null,
      start_date = null,
      end_date = null,
      page = 1,
      page_size = 20,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = options

    logger.info('[审计日志] 管理员查询审计日志列表', {
      operator_id,
      operation_type,
      target_type,
      target_id,
      page,
      page_size
    })

    // 构建查询条件
    const whereClause = {}

    if (operator_id) {
      whereClause.operator_id = operator_id
    }

    if (operation_type) {
      whereClause.operation_type = operation_type
    }

    if (target_type) {
      whereClause.target_type = normalizeTargetType(target_type)
    }

    if (target_id) {
      whereClause.target_id = target_id
    }

    if (start_date || end_date) {
      whereClause.created_at = {}
      if (start_date) {
        whereClause.created_at[Op.gte] = start_date
      }
      if (end_date) {
        whereClause.created_at[Op.lte] = end_date
      }
    }

    // 分页参数
    const offset = (page - 1) * page_size
    const limit = page_size

    try {
      const { count, rows } = await AdminOperationLog.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: User,
            as: 'operator',
            attributes: ['user_id', 'nickname', 'mobile']
          }
        ],
        limit,
        offset,
        order: [[sort_by, sort_order]]
      })

      logger.info(
        `[审计日志] 管理员查询成功：找到${count}条日志，返回第${page}页（${rows.length}条）`
      )

      // 添加中文显示名称（V4.7 中文化显示名称系统 - 2026-01-22）
      const logsWithDisplayNames = rows.map(log => (log.toJSON ? log.toJSON() : log))

      // 批量附加显示名称和颜色
      await attachDisplayNames(logsWithDisplayNames, [
        { field: 'operation_type', dictType: DICT_TYPES.OPERATION_TYPE },
        { field: 'target_type', dictType: DICT_TYPES.TARGET_TYPE }
      ])

      return {
        success: true,
        logs: logsWithDisplayNames,
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        },
        filters: {
          operator_id,
          operation_type,
          target_type,
          target_id,
          start_date,
          end_date
        }
      }
    } catch (error) {
      logger.error('[审计日志] 管理员查询失败:', error.message)
      throw new BusinessError(`查询审计日志失败: ${error.message}`, 'SERVICE_QUERY_FAILED', 500)
    }
  }

  /**
   * 获取操作审计日志
   *
   * @param {Object} filters - 过滤条件
   * @param {number} filters.operator_id - 操作员ID
   * @param {string} filters.operation_type - 操作类型
   * @param {string} filters.target_type - 目标对象类型
   * @param {number} filters.target_id - 目标对象ID
   * @param {string} filters.start_date - 开始日期
   * @param {string} filters.end_date - 结束日期
   * @param {number} filters.limit - 每页数量（默认50）
   * @param {number} filters.offset - 偏移量（默认0）
   * @returns {Promise<Array>} 审计日志列表
   */
  static async queryAuditLogs(filters = {}) {
    const {
      operator_id = null,
      operation_type = null,
      target_type = null,
      target_id = null,
      start_date = null,
      end_date = null,
      limit = 50,
      offset = 0
    } = filters

    const whereClause = {}

    if (operator_id) {
      whereClause.operator_id = operator_id
    }

    if (operation_type) {
      whereClause.operation_type = operation_type
    }

    if (target_type) {
      whereClause.target_type = normalizeTargetType(target_type)
    }

    if (target_id) {
      whereClause.target_id = target_id
    }

    if (start_date || end_date) {
      whereClause.created_at = {}
      if (start_date) {
        whereClause.created_at[require('sequelize').Op.gte] = start_date
      }
      if (end_date) {
        whereClause.created_at[require('sequelize').Op.lte] = end_date
      }
    }

    try {
      const logs = await AdminOperationLog.findAll({
        where: whereClause,
        order: [['created_at', 'DESC']],
        limit,
        offset,
        include: [
          {
            model: User,
            as: 'operator',
            attributes: ['user_id', 'nickname', 'mobile']
          }
        ]
      })

      return logs
    } catch (error) {
      logger.error('[审计日志查询] 失败:', error.message)
      throw error
    }
  }

  /**
   * 根据ID获取审计日志详情
   *
   * @param {number} logId - 日志ID
   * @returns {Promise<AdminOperationLog>} 审计日志详情
   * @throws {Error} 当日志不存在时抛出错误
   */
  static async getById(logId) {
    try {
      // 验证参数
      if (!logId || isNaN(logId) || logId <= 0) {
        throw new BusinessError('无效的日志ID', 'SERVICE_INVALID', 400)
      }

      const log = await AdminOperationLog.findByPk(logId, {
        include: [
          {
            model: User,
            as: 'operator',
            attributes: ['user_id', 'nickname', 'mobile']
          }
        ]
      })

      if (!log) {
        throw new BusinessError('审计日志不存在', 'SERVICE_NOT_FOUND', 404)
      }

      return log
    } catch (error) {
      logger.error(`[审计日志详情] 查询失败: log_id=${logId}, 错误=${error.message}`)
      throw error
    }
  }

  /**
   * 获取审计日志统计信息
   *
   * @param {Object} filters - 过滤条件
   * @param {number} filters.operator_id - 操作员ID
   * @param {string} filters.start_date - 开始日期
   * @param {string} filters.end_date - 结束日期
   * @returns {Promise<Object>} 统计信息
   */
  static async getAuditStatistics(filters = {}) {
    const { operator_id = null, start_date = null, end_date = null } = filters

    try {
      const whereClause = {}

      if (operator_id) {
        whereClause.operator_id = operator_id
      }

      if (start_date || end_date) {
        whereClause.created_at = {}
        if (start_date) {
          whereClause.created_at[require('sequelize').Op.gte] = start_date
        }
        if (end_date) {
          whereClause.created_at[require('sequelize').Op.lte] = end_date
        }
      }

      const [total, byType, byAction] = await Promise.all([
        // 总数
        AdminOperationLog.count({ where: whereClause }),

        // 按操作类型统计
        AdminOperationLog.findAll({
          where: whereClause,
          attributes: [
            'operation_type',
            [
              require('sequelize').fn('COUNT', require('sequelize').col('admin_operation_log_id')),
              'count'
            ]
          ],
          group: ['operation_type']
        }),

        // 按操作动作统计
        AdminOperationLog.findAll({
          where: whereClause,
          attributes: [
            'action',
            [
              require('sequelize').fn('COUNT', require('sequelize').col('admin_operation_log_id')),
              'count'
            ]
          ],
          group: ['action']
        })
      ])

      return {
        total,
        by_operation_type: byType.map(item => ({
          operation_type: item.operation_type,
          count: parseInt(item.get('count'))
        })),
        by_action: byAction.map(item => ({
          action: item.action,
          count: parseInt(item.get('count'))
        }))
      }
    } catch (error) {
      logger.error('[审计日志统计] 失败:', error.message)
      throw error
    }
  }

  /**
   * 获取增强版审计日志统计信息（包含今日、本周等时间维度统计）
   *
   * @param {Object} filters - 过滤条件
   * @param {number} filters.operator_id - 操作员ID
   * @param {string} filters.start_date - 开始日期
   * @param {string} filters.end_date - 结束日期
   * @returns {Promise<Object>} 增强版统计信息
   *
   * @note AdminOperationLog模型没有result字段，审计日志是只增不改的操作记录
   *       成功/失败统计改为按action字段分类（create/update/delete等）
   */
  static async getAuditStatisticsEnhanced(filters = {}) {
    const { operator_id = null, start_date = null, end_date = null } = filters

    try {
      // 计算时间范围（北京时间）
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const weekStart = new Date(todayStart)
      weekStart.setDate(weekStart.getDate() - 7)

      // 构建基础查询条件
      const baseWhere = {}
      if (operator_id) {
        baseWhere.operator_id = operator_id
      }

      // 构建带日期范围的查询条件
      const rangeWhere = { ...baseWhere }
      if (start_date || end_date) {
        rangeWhere.created_at = {}
        if (start_date) {
          rangeWhere.created_at[Op.gte] = start_date
        }
        if (end_date) {
          rangeWhere.created_at[Op.lte] = end_date
        }
      }

      // 并行执行所有统计查询
      const [total, todayCount, weekCount, byType, byAction] = await Promise.all([
        // 总数（带日期范围）
        AdminOperationLog.count({ where: rangeWhere }),

        // 今日操作数
        AdminOperationLog.count({
          where: {
            ...baseWhere,
            created_at: { [Op.gte]: todayStart }
          }
        }),

        // 本周操作数
        AdminOperationLog.count({
          where: {
            ...baseWhere,
            created_at: { [Op.gte]: weekStart }
          }
        }),

        // 按操作类型统计
        AdminOperationLog.findAll({
          where: rangeWhere,
          attributes: [
            'operation_type',
            [
              require('sequelize').fn('COUNT', require('sequelize').col('admin_operation_log_id')),
              'count'
            ]
          ],
          group: ['operation_type']
        }),

        // 按操作动作统计
        AdminOperationLog.findAll({
          where: rangeWhere,
          attributes: [
            'action',
            [
              require('sequelize').fn('COUNT', require('sequelize').col('admin_operation_log_id')),
              'count'
            ]
          ],
          group: ['action']
        })
      ])

      /*
       * 从action统计中计算成功/失败（审计日志本身都是成功记录的操作）
       * 按照审计日志的设计，所有记录都是成功的操作记录，失败操作不会被记录
       * 这里将所有操作视为成功操作
       */
      const successCount = total
      const failedCount = 0

      return {
        // 基础统计（前端页面顶部卡片需要）
        total,
        today_count: todayCount,
        week_count: weekCount,
        success_count: successCount, // 审计日志都是成功的操作记录
        failed_count: failedCount, // 失败操作不会被记录到审计日志

        // 详细统计（图表或详细分析用）
        by_operation_type: byType.map(item => ({
          operation_type: item.operation_type,
          count: parseInt(item.get('count'))
        })),
        by_action: byAction.map(item => ({
          action: item.action,
          count: parseInt(item.get('count'))
        }))
      }
    } catch (error) {
      logger.error('[审计日志增强统计] 失败:', error.message)
      throw error
    }
  }

  /**
   * 生成审计报告（F-59 审计报告功能）
   *
   * @description 生成综合审计报告，包含汇总统计、分组统计和趋势数据
   *
   * 业务场景：
   * - 管理后台审计报告页面展示
   * - 运营数据分析和风险监控
   * - 合规审计和安全审计
   *
   * @param {Object} options - 报告选项
   * @param {string} [options.time_range='7d'] - 时间范围 (7d/30d/90d/custom)
   * @param {string} [options.start_date] - 自定义开始日期 (YYYY-MM-DD)
   * @param {string} [options.end_date] - 自定义结束日期 (YYYY-MM-DD)
   * @param {number} [options.operator_id] - 特定操作员ID筛选
   * @returns {Promise<Object>} 审计报告数据
   *
   * @example
   * // 获取最近7天的审计报告
   * const report = await AuditLogService.generateAuditReport({ time_range: '7d' })
   *
   * // 获取自定义时间范围的报告
   * const report = await AuditLogService.generateAuditReport({
   *   time_range: 'custom',
   *   start_date: '2026-01-01',
   *   end_date: '2026-01-31'
   * })
   */
  static async generateAuditReport(options = {}) {
    const { time_range = '7d', start_date, end_date, operator_id } = options

    logger.info('[审计报告] 开始生成审计报告', { time_range, start_date, end_date, operator_id })

    try {
      // 1. 计算时间范围（北京时间）
      const now = new Date()
      let reportStartDate, reportEndDate

      if (time_range === 'custom' && start_date && end_date) {
        // 自定义时间范围
        reportStartDate = new Date(start_date)
        reportStartDate.setHours(0, 0, 0, 0)
        reportEndDate = new Date(end_date)
        reportEndDate.setHours(23, 59, 59, 999)
      } else {
        // 预设时间范围
        reportEndDate = new Date(now)
        reportStartDate = new Date(now)

        const daysMap = { '7d': 7, '30d': 30, '90d': 90 }
        const days = daysMap[time_range] || 7
        reportStartDate.setDate(reportStartDate.getDate() - days)
        reportStartDate.setHours(0, 0, 0, 0)
      }

      // 2. 构建基础查询条件
      const baseWhere = {
        created_at: {
          [Op.gte]: reportStartDate,
          [Op.lte]: reportEndDate
        }
      }

      if (operator_id) {
        baseWhere.operator_id = operator_id
      }

      // 3. 并行执行所有统计查询
      const [
        totalOperations,
        highRiskCount,
        rollbackCount,
        uniqueOperators,
        affectedStats,
        byOperationType,
        byTargetType,
        byOperator,
        byRiskLevel,
        trendData
      ] = await Promise.all([
        // 3.1 总操作数
        AdminOperationLog.count({ where: baseWhere }),

        // 3.2 高风险操作数（risk_level = 'high' 或 'critical'）
        AdminOperationLog.count({
          where: {
            ...baseWhere,
            risk_level: { [Op.in]: ['high', 'critical'] }
          }
        }),

        // 3.3 已回滚操作数（is_reversed = true）
        AdminOperationLog.count({
          where: {
            ...baseWhere,
            is_reversed: true
          }
        }),

        // 3.4 独立操作员数
        AdminOperationLog.count({
          where: baseWhere,
          distinct: true,
          col: 'operator_id'
        }),

        // 3.5 影响统计（影响用户数、影响金额）
        AdminOperationLog.findOne({
          where: baseWhere,
          attributes: [
            [fn('SUM', col('affected_users')), 'total_affected_users'],
            [fn('SUM', col('affected_amount')), 'total_affected_amount']
          ],
          raw: true
        }),

        // 3.6 按操作类型分组统计
        AdminOperationLog.findAll({
          where: baseWhere,
          attributes: ['operation_type', [fn('COUNT', col('admin_operation_log_id')), 'count']],
          group: ['operation_type'],
          order: [[literal('count'), 'DESC']],
          raw: true
        }),

        // 3.7 按目标类型分组统计
        AdminOperationLog.findAll({
          where: baseWhere,
          attributes: ['target_type', [fn('COUNT', col('admin_operation_log_id')), 'count']],
          group: ['target_type'],
          order: [[literal('count'), 'DESC']],
          raw: true
        }),

        // 3.8 按操作员分组统计（包含操作员信息）
        AdminOperationLog.findAll({
          where: baseWhere,
          attributes: ['operator_id', [fn('COUNT', col('admin_operation_log_id')), 'count']],
          include: [
            {
              model: User,
              as: 'operator',
              attributes: ['user_id', 'nickname', 'mobile']
            }
          ],
          group: ['operator_id', 'operator.user_id', 'operator.nickname', 'operator.mobile'],
          order: [[literal('count'), 'DESC']],
          limit: 20 // 只返回前20个操作员
        }),

        // 3.9 按风险等级分组统计
        AdminOperationLog.findAll({
          where: baseWhere,
          attributes: ['risk_level', [fn('COUNT', col('admin_operation_log_id')), 'count']],
          group: ['risk_level'],
          order: [[literal('count'), 'DESC']],
          raw: true
        }),

        // 3.10 时间趋势数据（按天分组）
        AdminOperationLog.findAll({
          where: baseWhere,
          attributes: [
            [fn('DATE', col('created_at')), 'date'],
            [fn('COUNT', col('admin_operation_log_id')), 'count']
          ],
          group: [fn('DATE', col('created_at'))],
          order: [[fn('DATE', col('created_at')), 'ASC']],
          raw: true
        })
      ])

      // 4. 格式化结果数据
      const report = {
        // 4.1 汇总统计
        summary: {
          total_operations: totalOperations,
          high_risk_count: highRiskCount,
          rollback_count: rollbackCount,
          unique_operators: uniqueOperators,
          affected_users_total: parseInt(affectedStats?.total_affected_users) || 0,
          affected_amount_total: parseInt(affectedStats?.total_affected_amount) || 0
        },

        // 4.2 按操作类型分组
        by_operation_type: byOperationType.map(item => ({
          operation_type: item.operation_type,
          count: parseInt(item.count)
        })),

        // 4.3 按目标类型分组
        by_target_type: byTargetType.map(item => ({
          target_type: item.target_type,
          count: parseInt(item.count)
        })),

        // 4.4 按操作员分组
        by_operator: byOperator.map(item => {
          const plainItem = item.toJSON ? item.toJSON() : item
          return {
            operator_id: plainItem.operator_id,
            operator_nickname: plainItem.operator?.nickname || '未知',
            operator_mobile: plainItem.operator?.mobile || '',
            count: parseInt(plainItem.count)
          }
        }),

        // 4.5 按风险等级分组
        by_risk_level: byRiskLevel.map(item => ({
          risk_level: item.risk_level,
          count: parseInt(item.count)
        })),

        // 4.6 时间趋势数据
        trend: trendData.map(item => ({
          date: item.date,
          count: parseInt(item.count)
        })),

        // 4.7 报告元数据
        report_meta: {
          generated_at: BeijingTimeHelper.apiTimestamp(),
          time_range,
          start_date: BeijingTimeHelper.formatDate(reportStartDate),
          end_date: BeijingTimeHelper.formatDate(reportEndDate)
        }
      }

      // 5. 为分组数据附加中文显示名称
      await attachDisplayNames(report.by_operation_type, [
        { field: 'operation_type', dictType: DICT_TYPES.OPERATION_TYPE }
      ])

      await attachDisplayNames(report.by_target_type, [
        { field: 'target_type', dictType: DICT_TYPES.TARGET_TYPE }
      ])

      logger.info('[审计报告] 审计报告生成成功', {
        time_range,
        total_operations: report.summary.total_operations,
        high_risk_count: report.summary.high_risk_count
      })

      return report
    } catch (error) {
      logger.error('[审计报告] 生成审计报告失败:', {
        error: error.message,
        stack: error.stack,
        options
      })
      throw new BusinessError(`生成审计报告失败: ${error.message}`, 'SERVICE_FAILED', 500)
    }
  }
}

module.exports = AuditLogQueryService
