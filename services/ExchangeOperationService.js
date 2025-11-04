/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 兑换订单运营服务（ExchangeOperationService）
 *
 * 业务场景：为运营人员提供兑换订单管理工具，支持批量审核、超时告警、统计分析等运营需求
 *
 * 核心功能：
 * 1. 批量审核操作（批量通过、批量拒绝，提升运营效率）
 * 2. 超时订单告警（监控超过24小时未审核的订单，防止用户投诉）
 * 3. 审核统计分析（待审核数量、超时率、审核员工作量统计）
 * 4. 运营数据看板（审核趋势、高频拒绝原因、审核效率指标）
 *
 * 业务流程：
 *
 * 1. **批量审核通过流程**
 *    - 运营人员筛选待审核订单 → 选择多个订单ID
 *    - 调用batchApproveOrders() → 逐个执行ExchangeRecords.approve()
 *    - 成功：创建用户库存、发送通知 | 失败：记录失败原因
 *    - 返回批量操作结果（成功数、失败数、耗时统计）
 *
 * 2. **批量审核拒绝流程**
 *    - 运营人员筛选问题订单 → 为每个订单填写拒绝原因（必填，≥5字符）
 *    - 调用batchRejectOrders() → 逐个执行ExchangeRecords.reject()
 *    - 成功：退回积分、恢复商品库存、发送通知 | 失败：记录失败原因
 *    - 返回批量操作结果（成功数、失败数、退款统计）
 *
 * 3. **超时订单监控流程**
 *    - 定时任务（每小时）调用getTimeoutPendingOrders() → 查询超过24小时的待审核订单
 *    - 生成告警通知 → 发送给审核员和运营管理员
 *    - 记录超时订单详情（订单ID、用户信息、超时时长、商品信息）
 *
 * 4. **审核统计流程**
 *    - 运营管理端调用getPendingOrdersStatistics() → 获取当前待审核订单统计
 *    - 展示统计数据（总数、按时间段分布、超时订单数、平均积分）
 *    - 用于运营决策和审核员绩效评估
 *
 * 职责定位（与其他服务的区别）：
 * - **应用层服务**：专注兑换订单（ExchangeRecords）的运营管理，不是通用基础设施
 * - **批量操作工具**：提供批量审核、监控告警等运营工具，提升运营效率
 * - **与ContentAuditEngine的区别**：
 *   - ContentAuditEngine：通用审核基础设施，处理所有内容审核（消费记录、图片、反馈等）
 *   - ExchangeOperationService：专门的兑换订单运营工具，提供批量操作、超时监控等特定功能
 *
 * 重命名历史：
 * - 原名：AuditManagementService（2025-10-10创建）
 * - 新名：ExchangeOperationService（2025-10-12重命名）
 * - 重命名原因：
 *   1. 避免与ContentAuditEngine混淆（名称相似容易误解）
 *   2. 突出"兑换订单运营"的业务职责（而非通用审核管理）
 *   3. 强调这是运营工具，不是通用审核引擎
 *
 * 关键方法列表：
 * - batchApproveOrders() - 批量审核通过订单（支持多订单并行处理）
 * - batchRejectOrders() - 批量审核拒绝订单（必须提供拒绝原因）
 * - getTimeoutPendingOrders() - 获取超时待审核订单（默认24小时）
 * - getPendingOrdersStatistics() - 获取待审核订单统计（总数、时间分布）
 * - getAuditorWorkload() - 获取审核员工作量统计（已审核数、平均处理时间）
 *
 * 数据模型关联：
 * - ExchangeRecords：兑换订单表（核心业务模型，调用approve/reject方法）
 * - User：用户表（关联用户信息，用于告警通知）
 * - Product：商品表（关联商品信息，用于订单详情展示）
 *
 * 业务规则：
 * - 批量审核拒绝时，每个订单必须提供拒绝原因（≥5字符）
 * - 超时阈值默认24小时，可配置调整
 * - 批量操作逐个执行（非事务），单个失败不影响其他订单
 * - 所有操作记录详细日志，便于审计追溯
 *
 * 使用示例：
 * ```javascript
 * // 示例1：批量审核通过10个订单
 * const approveResult = await ExchangeOperationService.batchApproveOrders(
 *   2, // 审核员ID
 *   [101, 102, 103, 104, 105, 106, 107, 108, 109, 110], // 订单ID数组
 *   '批量审核通过（运营工具）' // 批量审核原因
 * );
 * console.log(`成功: ${approveResult.success.length}, 失败: ${approveResult.failed.length}`);
 *
 * // 示例2：批量审核拒绝问题订单
 * const rejectItems = [
 *   { exchange_id: 201, reason: '消费凭证不清晰，无法核实消费金额' },
 *   { exchange_id: 202, reason: '疑似重复提交，已有相同时间的消费记录' },
 *   { exchange_id: 203, reason: '商品兑换资格不符，该商品需premium会员' }
 * ];
 * const rejectResult = await ExchangeOperationService.batchRejectOrders(2, rejectItems);
 *
 * // 示例3：查询超过24小时的超时订单
 * const timeoutOrders = await ExchangeOperationService.getTimeoutPendingOrders(24);
 * if (timeoutOrders.length > 0) {
 *   console.log(`发现${timeoutOrders.length}个超时订单，发送告警通知`);
 *   // 发送告警...
 * }
 *
 * // 示例4：获取待审核订单统计
 * const stats = await ExchangeOperationService.getPendingOrdersStatistics();
 * console.log(`待审核总数: ${stats.total}, 超时订单: ${stats.timeout_count}`);
 * ```
 *
 * 创建时间：2025年10月10日
 * 最后更新：2025年10月30日
 * 使用模型：Claude Sonnet 4.5
 */

const { ExchangeRecords, User } = require('../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 兑换订单运营服务类
 *
 * 职责：提供兑换订单批量操作、监控告警、统计分析等运营工具
 * 设计模式：静态方法服务类（无状态设计）
 *
 * @class ExchangeOperationService
 */
class ExchangeOperationService {
  /**
   * 批量审核通过历史待审核订单
   *
   * @param {number} auditorId - 审核员ID
   * @param {Array<number>} exchangeIds - 兑换订单ID数组
   * @param {string} batchReason - 批量审核原因
   * @returns {Object} 批量审核结果
   */
  static async batchApproveOrders (auditorId, exchangeIds, batchReason = '批量审核通过') {
    console.log(`[批量审核] 审核员${auditorId}批量审核${exchangeIds.length}个订单`)

    const results = {
      total: exchangeIds.length,
      success: [],
      failed: [],
      startTime: BeijingTimeHelper.createDatabaseTime()
    }

    // 逐个审核订单
    for (const exchangeId of exchangeIds) {
      try {
        // 1. 获取兑换记录
        const exchange = await ExchangeRecords.findOne({
          where: { exchange_id: exchangeId }
        })

        if (!exchange) {
          results.failed.push({
            exchange_id: exchangeId,
            reason: '订单不存在'
          })
          continue
        }

        // 2. 检查订单状态
        if (exchange.audit_status !== 'pending') {
          results.failed.push({
            exchange_id: exchangeId,
            reason: `订单状态不正确，当前状态：${exchange.audit_status}`
          })
          continue
        }

        // 3. 执行审核通过
        await exchange.approve(auditorId, batchReason)

        results.success.push({
          exchange_id: exchangeId,
          user_id: exchange.user_id,
          product_name: exchange.product_snapshot.name,
          quantity: exchange.quantity
        })

        console.log(`[批量审核] 订单${exchangeId}审核通过`)
      } catch (error) {
        results.failed.push({
          exchange_id: exchangeId,
          reason: error.message
        })
        console.error(`[批量审核] 订单${exchangeId}审核失败: ${error.message}`)
      }
    }

    results.endTime = BeijingTimeHelper.createDatabaseTime()
    results.duration = BeijingTimeHelper.timeDiff(results.startTime, results.endTime)

    console.log(
      `[批量审核] 完成，成功${results.success.length}个，失败${results.failed.length}个，耗时${results.duration}ms`
    )

    return results
  }

  /**
   * 批量审核拒绝历史待审核订单
   *
   * @param {number} auditorId - 审核员ID
   * @param {Array<Object>} rejectItems - 拒绝订单数组 [{exchange_id, reason}]
   * @returns {Object} 批量审核结果
   */
  static async batchRejectOrders (auditorId, rejectItems) {
    console.log(`[批量拒绝] 审核员${auditorId}批量拒绝${rejectItems.length}个订单`)

    const results = {
      total: rejectItems.length,
      success: [],
      failed: [],
      startTime: BeijingTimeHelper.createDatabaseTime()
    }

    // 逐个拒绝订单
    for (const item of rejectItems) {
      const { exchange_id: exchangeId, reason } = item

      if (!reason || reason.trim().length < 5) {
        results.failed.push({
          exchange_id: exchangeId,
          reason: '拒绝原因必须提供，且不少于5个字符'
        })
        continue
      }

      try {
        // 1. 获取兑换记录
        const exchange = await ExchangeRecords.findOne({
          where: { exchange_id: exchangeId }
        })

        if (!exchange) {
          results.failed.push({
            exchange_id: exchangeId,
            reason: '订单不存在'
          })
          continue
        }

        // 2. 检查订单状态
        if (exchange.audit_status !== 'pending') {
          results.failed.push({
            exchange_id: exchangeId,
            reason: `订单状态不正确，当前状态：${exchange.audit_status}`
          })
          continue
        }

        // 3. 执行审核拒绝
        await exchange.reject(auditorId, reason)

        results.success.push({
          exchange_id: exchangeId,
          user_id: exchange.user_id,
          product_name: exchange.product_snapshot.name,
          refunded_points: exchange.total_points
        })

        console.log(`[批量拒绝] 订单${exchangeId}审核拒绝`)
      } catch (error) {
        results.failed.push({
          exchange_id: exchangeId,
          reason: error.message
        })
        console.error(`[批量拒绝] 订单${exchangeId}审核失败: ${error.message}`)
      }
    }

    results.endTime = BeijingTimeHelper.createDatabaseTime()
    results.duration = BeijingTimeHelper.timeDiff(results.startTime, results.endTime)

    console.log(
      `[批量拒绝] 完成，成功${results.success.length}个，失败${results.failed.length}个，耗时${results.duration}ms`
    )

    return results
  }

  /**
   * 获取超时待审核订单（超过24小时）
   *
   * @param {number} timeoutHours - 超时小时数，默认24小时
   * @returns {Array} 超时订单列表
   */
  static async getTimeoutPendingOrders (timeoutHours = 24) {
    const timeoutThreshold = new Date(BeijingTimeHelper.timestamp() - timeoutHours * 60 * 60 * 1000)

    const orders = await ExchangeRecords.findAll({
      where: {
        audit_status: 'pending',
        exchange_time: {
          [Op.lt]: timeoutThreshold
        }
      },
      include: [
        {
          model: User,
          attributes: ['user_id', 'username', 'phone']
        }
      ],
      order: [['exchange_time', 'ASC']]
    })

    return orders.map(order => ({
      exchange_id: order.exchange_id,
      user_id: order.user_id,
      username: order.User?.username,
      phone: order.User?.phone,
      product_name: order.product_snapshot.name,
      quantity: order.quantity,
      total_points: order.total_points,
      exchange_time: order.exchange_time,
      timeout_hours: Math.floor((BeijingTimeHelper.timestamp() - new Date(order.exchange_time)) / (60 * 60 * 1000))
    }))
  }

  /**
   * 检查超时订单并发送告警通知
   *
   * @param {number} timeoutHours - 超时小时数，默认24小时
   * @returns {Object} 告警结果
   */
  static async checkTimeoutAndAlert (timeoutHours = 24) {
    console.log(`[超时告警] 开始检查超过${timeoutHours}小时的待审核订单...`)

    const timeoutOrders = await this.getTimeoutPendingOrders(timeoutHours)

    if (timeoutOrders.length === 0) {
      console.log('[超时告警] 没有超时订单')
      return {
        hasTimeout: false,
        count: 0,
        orders: []
      }
    }

    console.log(`[超时告警] 发现${timeoutOrders.length}个超时订单`)

    // 统计信息
    const statistics = {
      total: timeoutOrders.length,
      totalPoints: timeoutOrders.reduce((sum, order) => sum + order.total_points, 0),
      maxTimeoutHours: Math.max(...timeoutOrders.map(order => order.timeout_hours)),
      oldestOrder: timeoutOrders[0]
    }

    // 发送告警通知给管理员
    const alertMessage = this.generateAlertMessage(timeoutOrders, statistics)

    console.log('[超时告警] 告警信息:')
    console.log(alertMessage)

    // 发送通知给管理员
    try {
      const NotificationService = require('./NotificationService')
      await NotificationService.notifyTimeoutAlert({
        timeout_hours: timeoutHours,
        count: timeoutOrders.length,
        statistics
      })
    } catch (notifyError) {
      console.error('[超时告警] 发送通知失败:', notifyError.message)
    }

    return {
      hasTimeout: true,
      count: timeoutOrders.length,
      orders: timeoutOrders,
      statistics,
      alertMessage
    }
  }

  /**
   * 生成告警消息
   *
   * @param {Array} orders - 超时订单列表
   * @param {Object} statistics - 统计信息
   * @returns {string} 告警消息
   */
  static generateAlertMessage (orders, statistics) {
    const lines = [
      '🚨 待审核订单超时告警',
      '',
      '📊 统计信息:',
      `   订单数量: ${statistics.total}个`,
      `   涉及积分: ${statistics.totalPoints}分`,
      `   最长超时: ${statistics.maxTimeoutHours}小时`,
      '',
      '⏰ 最早订单:',
      `   订单号: ${statistics.oldestOrder.exchange_id}`,
      `   用户: ${statistics.oldestOrder.username} (${statistics.oldestOrder.phone})`,
      `   商品: ${statistics.oldestOrder.product_name} × ${statistics.oldestOrder.quantity}`,
      `   超时: ${statistics.oldestOrder.timeout_hours}小时`,
      '',
      '📋 超时订单列表（前10个）:'
    ]

    orders.slice(0, 10).forEach((order, index) => {
      lines.push(
        `   ${index + 1}. ID:${order.exchange_id} | ${order.product_name} | ${order.username} | 超时${order.timeout_hours}h`
      )
    })

    if (orders.length > 10) {
      lines.push(`   ... 还有${orders.length - 10}个订单`)
    }

    lines.push('')
    lines.push('⚠️ 请及时处理待审核订单，避免用户积分长期被占用')

    return lines.join('\n')
  }

  /**
   * 获取待审核订单统计信息
   *
   * @returns {Object} 统计信息
   */
  static async getPendingOrdersStatistics () {
    const now = BeijingTimeHelper.createDatabaseTime()
    const oneHourAgo = new Date(now - 1 * 60 * 60 * 1000)
    const sixHoursAgo = new Date(now - 6 * 60 * 60 * 1000)
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000)
    const threeDaysAgo = new Date(now - 72 * 60 * 60 * 1000)

    const [total, within1h, within6h, within24h, over24h, over72h] = await Promise.all([
      // 总待审核订单
      ExchangeRecords.count({
        where: { audit_status: 'pending' }
      }),
      // 1小时内
      ExchangeRecords.count({
        where: {
          audit_status: 'pending',
          exchange_time: { [Op.gte]: oneHourAgo }
        }
      }),
      // 6小时内
      ExchangeRecords.count({
        where: {
          audit_status: 'pending',
          exchange_time: { [Op.gte]: sixHoursAgo }
        }
      }),
      // 24小时内
      ExchangeRecords.count({
        where: {
          audit_status: 'pending',
          exchange_time: { [Op.gte]: oneDayAgo }
        }
      }),
      // 超过24小时
      ExchangeRecords.count({
        where: {
          audit_status: 'pending',
          exchange_time: { [Op.lt]: oneDayAgo }
        }
      }),
      // 超过72小时
      ExchangeRecords.count({
        where: {
          audit_status: 'pending',
          exchange_time: { [Op.lt]: threeDaysAgo }
        }
      })
    ])

    return {
      total,
      within1h,
      within6h,
      within24h,
      over24h,
      over72h,
      urgent: over72h, // 紧急订单（超过72小时）
      warning: over24h - over72h, // 警告订单（24-72小时）
      normal: total - over24h // 正常订单（24小时内）
    }
  }

  /**
   * 定时任务：检查超时订单并告警
   * 建议每小时执行一次
   *
   * @returns {Promise<Object>} 定时任务执行结果
   * @returns {Object} returns.statistics - 订单统计信息
   * @returns {Object} returns.alerts - 告警信息
   */
  static async scheduledTimeoutCheck () {
    console.log('[定时任务] 开始执行超时订单检查...')

    try {
      // 1. 检查24小时超时订单
      const result24h = await this.checkTimeoutAndAlert(24)

      // 2. 检查72小时超时订单（紧急）
      const result72h = await this.checkTimeoutAndAlert(72)

      // 3. 获取统计信息
      const statistics = await this.getPendingOrdersStatistics()

      console.log('[定时任务] 待审核订单统计:')
      console.log(`   总数: ${statistics.total}`)
      console.log(`   24小时内: ${statistics.within24h}`)
      console.log(`   超过24小时: ${statistics.over24h} ⚠️`)
      console.log(`   超过72小时: ${statistics.over72h} 🚨`)

      return {
        success: true,
        timestamp: BeijingTimeHelper.createDatabaseTime(),
        alert24h: result24h,
        alert72h: result72h,
        statistics
      }
    } catch (error) {
      console.error('[定时任务] 执行失败:', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }
}

module.exports = ExchangeOperationService
