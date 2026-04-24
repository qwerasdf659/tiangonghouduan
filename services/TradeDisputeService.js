/**
 * 交易纠纷与售后服务
 *
 * @description 处理交易市场的买家申诉、仲裁流程、纠纷解决
 * @module services/TradeDisputeService
 *
 * 业务流程：
 * 1. 买家发起申诉 → 创建 issue_type='trade' 的工单 + 订单状态改为 disputed
 * 2. 客服处理 → 可直接解决或升级为仲裁（对接 approval_chain）
 * 3. 仲裁完成 → 退款给买家 或 驳回申诉
 *
 * 纠纷类型（dispute_type）：
 * - item_not_received: 未收到物品
 * - item_mismatch: 物品不符
 * - quality_issue: 质量问题
 * - fraud: 欺诈
 * - other: 其他
 */

const BusinessError = require('../utils/BusinessError')
const logger = require('../utils/logger').logger
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const { Op } = require('sequelize')
const ApprovalChainService = require('./ApprovalChainService')

/** 纠纷类型枚举 */
const DISPUTE_TYPE = {
  ITEM_NOT_RECEIVED: 'item_not_received',
  ITEM_MISMATCH: 'item_mismatch',
  QUALITY_ISSUE: 'quality_issue',
  FRAUD: 'fraud',
  OTHER: 'other'
}

/** 允许发起纠纷的订单状态 */
const DISPUTABLE_ORDER_STATUSES = ['completed', 'frozen']

/** 纠纷处理截止天数（默认7天） */
const DEFAULT_DISPUTE_DEADLINE_DAYS = 7

const models = require('../models')

/**
 * 交易纠纷与售后服务 - 处理买家申诉、仲裁流程、纠纷解决
 */
class TradeDisputeService {
  /** Creates a new TradeDisputeService instance */
  constructor() {
    this.models = models
    this.sequelize = models.sequelize
  }

  /**
   * 创建交易纠纷（买家申诉）
   *
   * @param {Object} params - 纠纷参数
   * @param {number} params.trade_order_id - 交易订单 ID
   * @param {number} params.user_id - 申诉人（买家）用户 ID
   * @param {string} params.dispute_type - 纠纷类型
   * @param {string} params.title - 纠纷标题
   * @param {string} [params.description] - 纠纷描述
   * @param {Object} [params.evidence] - 证据（截图URL数组等）
   * @param {number} params.created_by - 创建人 ID（管理员或买家自身）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @returns {Promise<Object>} 创建的纠纷工单
   */
  async createDispute(params, options = {}) {
    // models 已在构造函数中初始化
    const transaction = assertAndGetTransaction(options, 'TradeDisputeService.createDispute')

    const { trade_order_id, user_id, dispute_type, title, description, evidence, created_by } =
      params

    // 参数校验
    if (!trade_order_id) throw new BusinessError('trade_order_id 是必需参数', 'TRADE_REQUIRED', 400)
    if (!user_id) throw new BusinessError('user_id 是必需参数', 'TRADE_REQUIRED', 400)
    if (!dispute_type || !Object.values(DISPUTE_TYPE).includes(dispute_type)) {
      throw new BusinessError(`无效的纠纷类型：${dispute_type}`, 'TRADE_INVALID', 400)
    }
    if (!title) throw new BusinessError('纠纷标题不能为空', 'TRADE_NOT_ALLOWED', 400)

    // 查询订单（悲观锁）
    const order = await this.models.TradeOrder.findByPk(trade_order_id, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })
    if (!order) throw new BusinessError('交易订单不存在', 'TRADE_NOT_FOUND', 404)

    // 校验订单状态
    if (!DISPUTABLE_ORDER_STATUSES.includes(order.status)) {
      throw new BusinessError(
        `当前订单状态（${order.status}）不允许发起纠纷，仅 ${DISPUTABLE_ORDER_STATUSES.join('/')} 状态可申诉`,
        'TRADE_NOT_ALLOWED',
        400
      )
    }

    // 校验申诉人是买家
    if (order.buyer_user_id !== user_id) {
      throw new BusinessError('仅买家可以对该订单发起纠纷', 'TRADE_ERROR', 400)
    }

    // 检查是否已有未关闭的纠纷
    const existingDispute = await this.models.CustomerServiceIssue.findOne({
      where: {
        trade_order_id,
        issue_type: 'trade',
        status: { [Op.notIn]: ['resolved', 'closed'] }
      },
      transaction
    })
    if (existingDispute) {
      throw new BusinessError(`该订单已有进行中的纠纷工单（工单号：${existingDispute.issue_id}）`, 'TRADE_ERROR', 400)
    }

    // 计算处理截止时间
    const deadline = new Date()
    deadline.setDate(deadline.getDate() + DEFAULT_DISPUTE_DEADLINE_DAYS)

    // 创建纠纷工单
    const issue = await this.models.CustomerServiceIssue.create(
      {
        user_id,
        created_by: created_by || user_id,
        issue_type: 'trade',
        priority: dispute_type === 'fraud' ? 'urgent' : 'high',
        status: 'open',
        title,
        description: description || null,
        trade_order_id,
        dispute_type,
        dispute_evidence: evidence || null,
        dispute_deadline: deadline
      },
      { transaction }
    )

    // 订单状态改为 disputed
    const previousStatus = order.status
    await order.update({ status: 'disputed' }, { transaction })

    logger.info('[交易纠纷] 纠纷工单创建成功', {
      issue_id: issue.issue_id,
      trade_order_id,
      dispute_type,
      buyer_user_id: user_id,
      previous_order_status: previousStatus
    })

    return {
      issue_id: issue.issue_id,
      trade_order_id,
      dispute_type,
      status: issue.status,
      priority: issue.priority,
      dispute_deadline: deadline
    }
  }

  /**
   * 升级纠纷为仲裁（对接审批链）
   *
   * @param {number} issueId - 纠纷工单 ID
   * @param {number} operatorId - 操作人 ID（客服管理员）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @returns {Promise<Object>} 仲裁结果
   */
  async escalateToArbitration(issueId, operatorId, options = {}) {
    // models 已在构造函数中初始化
    const transaction = assertAndGetTransaction(
      options,
      'TradeDisputeService.escalateToArbitration'
    )

    const issue = await this.models.CustomerServiceIssue.findByPk(issueId, { transaction })
    if (!issue) throw new BusinessError('纠纷工单不存在', 'TRADE_NOT_FOUND', 404)
    if (issue.issue_type !== 'trade') throw new BusinessError('仅交易纠纷工单可升级为仲裁', 'TRADE_ERROR', 400)
    if (issue.approval_chain_instance_id) throw new BusinessError('该纠纷已进入仲裁流程', 'TRADE_ERROR', 400)

    // 尝试匹配审批链模板
    const template = await ApprovalChainService.matchTemplate('trade_dispute', {
      dispute_type: issue.dispute_type,
      priority: issue.priority
    })

    if (!template) {
      logger.warn('[交易纠纷] 未找到匹配的仲裁审批链模板', { issue_id: issueId })
      throw new BusinessError('未配置交易纠纷仲裁审批链模板，请先在审批链管理中创建 trade_dispute 类型模板', 'TRADE_NOT_CONFIGURED', 500)
    }

    // 创建审批链实例
    const chainInstance = await ApprovalChainService.createChainInstance(
      template,
      'trade_dispute',
      issueId,
      operatorId,
      { transaction }
    )

    // 更新工单
    await issue.update(
      {
        status: 'processing',
        assigned_to: operatorId,
        approval_chain_instance_id: chainInstance.approval_chain_instance_id
      },
      { transaction }
    )

    logger.info('[交易纠纷] 纠纷升级为仲裁', {
      issue_id: issueId,
      chain_instance_id: chainInstance.approval_chain_instance_id,
      operator_id: operatorId
    })

    return {
      issue_id: issueId,
      approval_chain_instance_id: chainInstance.approval_chain_instance_id,
      status: 'processing'
    }
  }

  /**
   * 解决纠纷（退款给买家）
   *
   * @param {number} issueId - 纠纷工单 ID
   * @param {Object} params - 解决参数
   * @param {string} params.resolution - 解决说明
   * @param {boolean} [params.refund=false] - 是否退款
   * @param {number} params.operator_id - 操作人 ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @returns {Promise<Object>} 解决结果
   */
  async resolveDispute(issueId, params, options = {}) {
    // models 已在构造函数中初始化
    const transaction = assertAndGetTransaction(options, 'TradeDisputeService.resolveDispute')

    const { resolution, refund = false, operator_id } = params
    if (!resolution) throw new BusinessError('解决说明不能为空', 'TRADE_NOT_ALLOWED', 400)

    const issue = await this.models.CustomerServiceIssue.findByPk(issueId, { transaction })
    if (!issue) throw new BusinessError('纠纷工单不存在', 'TRADE_NOT_FOUND', 404)
    if (issue.issue_type !== 'trade') throw new BusinessError('仅交易纠纷工单可执行此操作', 'TRADE_ERROR', 400)
    if (['resolved', 'closed'].includes(issue.status)) throw new BusinessError('该纠纷已解决或已关闭', 'TRADE_ERROR', 400)

    const order = await this.models.TradeOrder.findByPk(issue.trade_order_id, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    let refundResult = null
    if (refund && order) {
      /*
       * 退款逻辑：将买家冻结的资产解冻退回
       * 订单状态改为 cancelled（退款完成）
       */
      await order.update({ status: 'cancelled' }, { transaction })
      refundResult = { trade_order_id: order.trade_order_id, refunded: true }
      logger.info('[交易纠纷] 纠纷退款执行', { trade_order_id: order.trade_order_id })
    } else if (order && order.status === 'disputed') {
      // 驳回申诉：恢复订单原状态为 completed
      await order.update({ status: 'completed' }, { transaction })
    }

    // 更新工单
    const now = new Date()
    await issue.update(
      {
        status: 'resolved',
        resolution,
        resolved_at: now,
        assigned_to: operator_id
      },
      { transaction }
    )

    logger.info('[交易纠纷] 纠纷已解决', {
      issue_id: issueId,
      refund,
      operator_id
    })

    return {
      issue_id: issueId,
      status: 'resolved',
      resolution,
      refund: refundResult
    }
  }

  /**
   * 查询交易纠纷列表（管理后台）
   *
   * @param {Object} filters - 筛选条件
   * @param {string} [filters.status] - 工单状态
   * @param {string} [filters.dispute_type] - 纠纷类型
   * @param {string} [filters.priority] - 优先级
   * @param {number} [filters.page=1] - 页码
   * @param {number} [filters.page_size=20] - 每页数量
   * @returns {Promise<Object>} { rows, count, page, page_size }
   */
  async listDisputes(filters = {}) {
    // models 已在构造函数中初始化

    const { status, dispute_type, priority, page = 1, page_size = 20 } = filters
    const where = { issue_type: 'trade' }

    if (status) where.status = status
    if (dispute_type) where.dispute_type = dispute_type
    if (priority) where.priority = priority

    const { rows, count } = await this.models.CustomerServiceIssue.findAndCountAll({
      where,
      include: [
        { model: this.models.User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: this.models.User, as: 'assignee', attributes: ['user_id', 'nickname'] }
      ],
      order: [
        ['priority', 'DESC'],
        ['created_at', 'DESC']
      ],
      limit: page_size,
      offset: (page - 1) * page_size
    })

    return { rows, count, page, page_size }
  }

  /**
   * 获取纠纷详情（含订单信息）
   *
   * @param {number} issueId - 纠纷工单 ID
   * @returns {Promise<Object>} 纠纷详情
   */
  async getDisputeDetail(issueId) {
    // models 已在构造函数中初始化

    const issue = await this.models.CustomerServiceIssue.findByPk(issueId, {
      include: [
        { model: this.models.User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: this.models.User, as: 'assignee', attributes: ['user_id', 'nickname'] },
        { model: this.models.User, as: 'creator', attributes: ['user_id', 'nickname'] }
      ]
    })

    if (!issue) throw new BusinessError('纠纷工单不存在', 'TRADE_NOT_FOUND', 404)
    if (issue.issue_type !== 'trade') throw new BusinessError('该工单不是交易纠纷类型', 'TRADE_ERROR', 400)

    // 关联订单信息
    let orderInfo = null
    if (issue.trade_order_id) {
      orderInfo = await this.models.TradeOrder.findByPk(issue.trade_order_id, {
        attributes: [
          'trade_order_id',
          'market_listing_id',
          'buyer_user_id',
          'seller_user_id',
          'asset_code',
          'gross_amount',
          'fee_amount',
          'net_amount',
          'status',
          'created_at'
        ]
      })
    }

    // 关联审批链信息
    let arbitrationInfo = null
    if (issue.approval_chain_instance_id) {
      arbitrationInfo = await this.models.ApprovalChainInstance.findByPk(
        issue.approval_chain_instance_id,
        { attributes: ['approval_chain_instance_id', 'status', 'created_at', 'completed_at'] }
      )
    }

    return {
      issue: issue.toJSON(),
      order: orderInfo?.toJSON() || null,
      arbitration: arbitrationInfo?.toJSON() || null
    }
  }

  /**
   * 获取纠纷统计数据（管理后台看板）
   *
   * @returns {Promise<Object>} 纠纷统计
   */
  async getDisputeStats() {
    // models 已在构造函数中初始化

    const [statusCounts, typeCounts, recentCount] = await Promise.all([
      // 按状态统计
      this.models.CustomerServiceIssue.findAll({
        where: { issue_type: 'trade' },
        attributes: ['status', [this.sequelize.fn('COUNT', '*'), 'count']],
        group: ['status'],
        raw: true
      }),
      // 按纠纷类型统计
      this.models.CustomerServiceIssue.findAll({
        where: { issue_type: 'trade', dispute_type: { [Op.ne]: null } },
        attributes: ['dispute_type', [this.sequelize.fn('COUNT', '*'), 'count']],
        group: ['dispute_type'],
        raw: true
      }),
      // 近7天新增纠纷数
      this.models.CustomerServiceIssue.count({
        where: {
          issue_type: 'trade',
          created_at: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      })
    ])

    return {
      by_status: statusCounts.reduce((acc, r) => {
        acc[r.status] = parseInt(r.count)
        return acc
      }, {}),
      by_type: typeCounts.reduce((acc, r) => {
        acc[r.dispute_type] = parseInt(r.count)
        return acc
      }, {}),
      recent_7d: recentCount
    }
  }
}

/** 纠纷类型枚举 */
TradeDisputeService.DISPUTE_TYPE = DISPUTE_TYPE
/** 允许发起纠纷的订单状态 */
TradeDisputeService.DISPUTABLE_ORDER_STATUSES = DISPUTABLE_ORDER_STATUSES

module.exports = TradeDisputeService
