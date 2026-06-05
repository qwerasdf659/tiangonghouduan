/**
 * 交易售后申诉服务（TradeDisputeService）
 *
 * @description 处理兑换/消费订单的买家售后申诉、仲裁流程、纠纷解决（读写 trade_disputes 表）
 * @module services/TradeDisputeService
 *
 * 业务流程：
 * 1. 买家发起申诉 → 创建 trade_disputes 记录（兑换/消费订单不改其订单状态）
 * 2. 客服处理 → 可直接解决或升级为仲裁（对接 approval_chain）
 * 3. 仲裁完成 → 驳回申诉 或 走 GM 补偿
 *
 * 状态机：open（已提交）→ reviewing（客服审核）→ arbitrating（仲裁中）→ resolved/rejected
 *
 * 退款资金口径（C2C 下线后）：
 * - 兑换/消费类申诉一律不动原单资金，由客服通过 GM 补偿工具（cs_compensate）发放等值补偿，
 *   resolveDispute 拒绝原路退款（C2C 交易订单原路退款链已随 C2C 下线移除，2026-06-05 阶段五）
 *
 * 纠纷类型（dispute_type）：item_not_received / item_mismatch / quality_issue / fraud / other
 */

const BusinessError = require('../utils/BusinessError')
const logger = require('../utils/logger').logger
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const { Op } = require('sequelize')
const ApprovalChainService = require('./ApprovalChainService')
const NotificationService = require('./NotificationService')
const { getRedisClient } = require('../utils/UnifiedRedisClient')

/** 纠纷类型枚举 */
const DISPUTE_TYPE = {
  ITEM_NOT_RECEIVED: 'item_not_received',
  ITEM_MISMATCH: 'item_mismatch',
  QUALITY_ISSUE: 'quality_issue',
  FRAUD: 'fraud',
  OTHER: 'other'
}

/** 允许发起申诉的订单类型白名单（C2C trade/auction 已随 C2C 下线移除，2026-06-05 阶段五） */
const ALLOWED_ORDER_TYPES = ['redemption', 'consumption']

/** 允许发起申诉的兑换订单状态（核销后才可能出现售后问题） */
const DISPUTABLE_REDEMPTION_STATUSES = ['fulfilled']

/** 允许发起申诉的消费核销状态（审核通过后才可能出现售后问题） */
const DISPUTABLE_CONSUMPTION_STATUSES = ['approved']

/** 纠纷处理截止天数（默认7天） */
const DEFAULT_DISPUTE_DEADLINE_DAYS = 7

const models = require('../models')

/**
 * 交易售后申诉服务 - 处理买家申诉、仲裁流程、纠纷解决（读写 trade_disputes）
 */
class TradeDisputeService {
  /** Creates a new TradeDisputeService instance */
  constructor() {
    this.models = models
    this.sequelize = models.sequelize
  }

  /**
   * 创建售后申诉（买家发起或客服代发起）
   *
   * @param {Object} params - 申诉参数
   * @param {string} params.order_type - 订单类型（trade/redemption/consumption/auction）
   * @param {string} params.order_id - 订单ID（字符串格式，多态值）
   * @param {number} params.user_id - 申诉人（买家）用户 ID
   * @param {string} params.dispute_type - 纠纷类型
   * @param {string} params.title - 申诉标题
   * @param {string} [params.description] - 申诉描述
   * @param {Object} [params.evidence] - 证据（截图URL数组、订单快照等）
   * @param {number} [params.created_by] - 发起人 ID（自助=买家本人，代发=客服）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @returns {Promise<Object>} 创建的申诉
   */
  async createDispute(params, options = {}) {
    const transaction = assertAndGetTransaction(options, 'TradeDisputeService.createDispute')

    const {
      order_type,
      order_id,
      user_id,
      dispute_type,
      title,
      description,
      evidence,
      created_by,
      self_service = false
    } = params

    // 参数校验
    if (!order_type || !order_id) {
      throw new BusinessError('order_type 和 order_id 是必需参数', 'TRADE_REQUIRED', 400)
    }
    if (!ALLOWED_ORDER_TYPES.includes(order_type)) {
      throw new BusinessError(
        `不支持的订单类型：${order_type}，仅支持 ${ALLOWED_ORDER_TYPES.join('/')}`,
        'TRADE_NOT_ALLOWED',
        400
      )
    }
    if (!user_id) throw new BusinessError('user_id 是必需参数', 'TRADE_REQUIRED', 400)
    if (!dispute_type || !Object.values(DISPUTE_TYPE).includes(dispute_type)) {
      throw new BusinessError(`无效的纠纷类型：${dispute_type}`, 'TRADE_INVALID', 400)
    }
    if (!title) throw new BusinessError('申诉标题不能为空', 'TRADE_NOT_ALLOWED', 400)

    // 用户自助发起时执行防滥用风控（冷却 + 月限，配置驱动，默认关闭）
    if (self_service) {
      await this._assertSelfServiceRateLimit(user_id, transaction)
    }

    // 按 order_type 分流校验订单归属（redemption/consumption）
    await this._assertOrderOwnership(order_type, order_id, user_id, transaction)

    // 检查是否已有未关闭的申诉
    const existingDispute = await this.models.TradeDispute.findOne({
      where: {
        order_type,
        order_id: String(order_id),
        status: { [Op.notIn]: ['resolved', 'rejected'] }
      },
      transaction
    })
    if (existingDispute) {
      throw new BusinessError(
        `该订单已有进行中的售后申诉（申诉号：${existingDispute.trade_dispute_id}）`,
        'TRADE_ERROR',
        400
      )
    }

    // 计算处理截止时间
    const deadline = new Date()
    deadline.setDate(deadline.getDate() + DEFAULT_DISPUTE_DEADLINE_DAYS)

    // 创建申诉记录
    const dispute = await this.models.TradeDispute.create(
      {
        user_id,
        created_by: created_by || user_id,
        order_type,
        order_id: String(order_id),
        dispute_type,
        priority: dispute_type === 'fraud' ? 'urgent' : 'high',
        status: 'open',
        title,
        description: description || null,
        evidence: evidence || null,
        deadline
      },
      { transaction }
    )

    // 兑换/消费订单不改其订单状态（C2C trade 订单已随 C2C 下线移除）

    logger.info('[售后申诉] 申诉创建成功', {
      trade_dispute_id: dispute.trade_dispute_id,
      order_type,
      order_id: String(order_id),
      dispute_type,
      buyer_user_id: user_id
    })

    // 通知申诉人：已受理（item10，失败不影响主流程）
    this._notify(
      user_id,
      'dispute_created',
      '售后申诉已提交',
      `您的售后申诉（#${dispute.trade_dispute_id}）已提交，我们将尽快处理`,
      {
        trade_dispute_id: dispute.trade_dispute_id,
        status: 'open'
      }
    )

    // 自助发起成功后写入冷却标记（仅当配置了冷却小时数，失败不阻断主流程）
    if (self_service) {
      await this._markSelfServiceCooldown(user_id)
    }

    return {
      trade_dispute_id: dispute.trade_dispute_id,
      order_type,
      order_id: String(order_id),
      dispute_type,
      status: dispute.status,
      priority: dispute.priority,
      deadline
    }
  }

  /**
   * 按订单类型分流校验订单归属（私有方法，修复 P4-d）
   *
   * @param {string} orderType - 订单类型
   * @param {string} orderId - 订单ID
   * @param {number} userId - 申诉人用户ID（须为买家/中标人）
   * @param {Object} transaction - 事务对象
   * @returns {Promise<void>} 校验通过无返回，失败抛 BusinessError
   * @private
   */
  async _assertOrderOwnership(orderType, orderId, userId, transaction) {
    if (orderType === 'redemption') {
      // 兑换订单：主键 redemption_order_id(UUID)，买家字段 redeemer_user_id，核销后(fulfilled)可申诉
      const order = await this.models.RedemptionOrder.findByPk(String(orderId), { transaction })
      if (!order) throw new BusinessError('兑换订单不存在', 'TRADE_NOT_FOUND', 404)
      if (!DISPUTABLE_REDEMPTION_STATUSES.includes(order.status)) {
        throw new BusinessError(
          `当前兑换订单状态（${order.status}）不允许发起申诉，仅 ${DISPUTABLE_REDEMPTION_STATUSES.join('/')} 状态可申诉`,
          'TRADE_NOT_ALLOWED',
          400
        )
      }
      if (order.redeemer_user_id !== userId) {
        throw new BusinessError('仅本人可以对该兑换订单发起申诉', 'TRADE_ERROR', 400)
      }
      return
    }

    if (orderType === 'consumption') {
      // 消费核销：主键 consumption_record_id，用户字段 user_id，审核通过(approved)后可申诉
      const record = await this.models.ConsumptionRecord.findByPk(parseInt(orderId), {
        transaction
      })
      if (!record) throw new BusinessError('消费记录不存在', 'TRADE_NOT_FOUND', 404)
      if (!DISPUTABLE_CONSUMPTION_STATUSES.includes(record.status)) {
        throw new BusinessError(
          `当前消费记录状态（${record.status}）不允许发起申诉，仅 ${DISPUTABLE_CONSUMPTION_STATUSES.join('/')} 状态可申诉`,
          'TRADE_NOT_ALLOWED',
          400
        )
      }
      if (record.user_id !== userId) {
        throw new BusinessError('仅本人可以对该消费记录发起申诉', 'TRADE_ERROR', 400)
      }
      return
    }

    throw new BusinessError(`不支持的订单类型：${orderType}`, 'TRADE_NOT_ALLOWED', 400)
  }

  /**
   * 读取 system_settings 中的数值配置（防滥用阈值，白名单管控）
   *
   * @param {string} settingKey - 配置键名
   * @param {Object} transaction - 事务对象
   * @returns {Promise<number>} 配置值（数字），读取失败或未配置返回 0（表示不限制）
   * @private
   */
  async _getSettingNumber(settingKey, transaction) {
    try {
      const rows = await this.sequelize.query(
        'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
        { replacements: [settingKey], type: this.sequelize.QueryTypes.SELECT, transaction }
      )
      if (rows.length > 0) return parseInt(rows[0].setting_value) || 0
    } catch {
      /* 配置读取失败不阻断业务 */
    }
    return 0
  }

  /**
   * 自助发起防滥用风控（冷却 + 月限，复用兑换退款风控范式）
   *
   * 配置项（system_settings，默认 0=不限制，由运营按业务填真实值）：
   * - dispute/self_service_cooldown_hours：两次自助申诉的冷却小时数
   * - dispute/self_service_monthly_limit：单用户每月自助申诉次数上限
   *
   * @param {number} userId - 申诉人用户ID
   * @param {Object} transaction - 事务对象
   * @returns {Promise<void>} 校验通过无返回，超限抛 BusinessError(429)
   * @private
   */
  async _assertSelfServiceRateLimit(userId, transaction) {
    // 第一层：冷却期（Redis 标记）
    const cooldownHours = await this._getSettingNumber(
      'dispute/self_service_cooldown_hours',
      transaction
    )
    if (cooldownHours > 0) {
      try {
        const redis = await getRedisClient()
        const cooldownKey = `app:v4:dispute_self_cooldown:${userId}`
        const exists = await redis.exists(cooldownKey)
        if (exists) {
          throw new BusinessError(
            `自助申诉冷却期内（${cooldownHours}小时），请稍后再试或联系在线客服`,
            'DISPUTE_COOLDOWN',
            429
          )
        }
      } catch (error) {
        if (error instanceof BusinessError) throw error
        /* Redis 异常不阻断业务，仅记录 */
        logger.warn('[售后申诉] 冷却检查失败（非致命）', { user_id: userId, error: error.message })
      }
    }

    // 第二层：月限（按 trade_disputes 当月发起数统计）
    const monthlyLimit = await this._getSettingNumber(
      'dispute/self_service_monthly_limit',
      transaction
    )
    if (monthlyLimit > 0) {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const monthCount = await this.models.TradeDispute.count({
        where: {
          created_by: userId,
          created_at: { [Op.gte]: startOfMonth }
        },
        transaction
      })

      if (monthCount >= monthlyLimit) {
        throw new BusinessError(
          `本月自助申诉次数已达上限（${monthlyLimit}次/月），如需帮助请联系在线客服`,
          'DISPUTE_MONTHLY_LIMIT',
          429
        )
      }
    }
  }

  /**
   * 写入自助申诉冷却标记（成功发起后调用，失败不阻断主流程）
   *
   * @param {number} userId - 申诉人用户ID
   * @returns {Promise<void>} 完成
   * @private
   */
  async _markSelfServiceCooldown(userId) {
    const cooldownHours = await this._getSettingNumber('dispute/self_service_cooldown_hours', null)
    if (cooldownHours <= 0) return
    try {
      const redis = await getRedisClient()
      const cooldownKey = `app:v4:dispute_self_cooldown:${userId}`
      await redis.set(cooldownKey, '1', 'EX', cooldownHours * 3600)
    } catch (error) {
      logger.warn('[售后申诉] 写入冷却标记失败（非致命）', {
        user_id: userId,
        error: error.message
      })
    }
  }

  /**
   * 受理申诉（客服开始处理，open → reviewing）
   *
   * 业务语义：客服从待处理队列中"接单"，把申诉从"已提交（open）"推进到"审核中（reviewing）"，
   * 并指派给当前客服（assigned_to）。这是状态机 open→reviewing→arbitrating 中
   * 进入 reviewing 的唯一入口（修复状态机断裂：原先无任何路径写入 reviewing）。
   *
   * @param {number} disputeId - 申诉 ID（trade_dispute_id）
   * @param {number} operatorId - 受理客服的用户 ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @returns {Promise<Object>} 受理结果 { trade_dispute_id, status, assigned_to }
   */
  async acceptDispute(disputeId, operatorId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'TradeDisputeService.acceptDispute')

    const dispute = await this.models.TradeDispute.findByPk(disputeId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })
    if (!dispute) throw new BusinessError('售后申诉不存在', 'TRADE_NOT_FOUND', 404)
    if (dispute.status !== 'open') {
      throw new BusinessError(
        `仅"待处理（open）"状态的申诉可受理，当前状态：${dispute.status}`,
        'TRADE_ERROR',
        400
      )
    }

    await dispute.update({ status: 'reviewing', assigned_to: operatorId }, { transaction })

    logger.info('[售后申诉] 申诉已受理', {
      trade_dispute_id: disputeId,
      operator_id: operatorId
    })

    // 通知申诉人：已受理（item10，失败不影响主流程）
    this._notify(
      dispute.user_id,
      'dispute_reviewing',
      '售后申诉已受理',
      `您的售后申诉（#${disputeId}）客服已受理，正在审核处理中`,
      { trade_dispute_id: disputeId, status: 'reviewing' }
    )

    return {
      trade_dispute_id: disputeId,
      status: 'reviewing',
      assigned_to: operatorId
    }
  }

  /**
   * 升级申诉为仲裁（对接审批链）
   *
   * @param {number} disputeId - 申诉 ID（trade_dispute_id）
   * @param {number} operatorId - 操作人 ID（客服管理员）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @returns {Promise<Object>} 仲裁结果
   */
  async escalateToArbitration(disputeId, operatorId, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'TradeDisputeService.escalateToArbitration'
    )

    const dispute = await this.models.TradeDispute.findByPk(disputeId, { transaction })
    if (!dispute) throw new BusinessError('售后申诉不存在', 'TRADE_NOT_FOUND', 404)
    if (dispute.approval_chain_instance_id) {
      throw new BusinessError('该申诉已进入仲裁流程', 'TRADE_ERROR', 400)
    }
    if (['resolved', 'rejected'].includes(dispute.status)) {
      throw new BusinessError('该申诉已解决或已驳回，无法升级仲裁', 'TRADE_ERROR', 400)
    }

    // 尝试匹配审批链模板（步骤2 已建 trade_dispute_default 模板，修复 P5）
    const template = await ApprovalChainService.matchTemplate('trade_dispute', {
      dispute_type: dispute.dispute_type,
      priority: dispute.priority
    })

    if (!template) {
      logger.warn('[售后申诉] 未找到匹配的仲裁审批链模板', { trade_dispute_id: disputeId })
      throw new BusinessError(
        '未配置交易纠纷仲裁审批链模板，请先在审批链管理中创建 trade_dispute 类型模板',
        'TRADE_NOT_CONFIGURED',
        500
      )
    }

    // 创建审批链实例（实例主键为 instance_id）
    const chainInstance = await ApprovalChainService.createChainInstance(
      template,
      'trade_dispute',
      disputeId,
      operatorId,
      { transaction }
    )

    // 更新申诉
    await dispute.update(
      {
        status: 'arbitrating',
        assigned_to: operatorId,
        approval_chain_instance_id: chainInstance.instance_id
      },
      { transaction }
    )

    logger.info('[售后申诉] 申诉升级为仲裁', {
      trade_dispute_id: disputeId,
      chain_instance_id: chainInstance.instance_id,
      operator_id: operatorId
    })

    // 通知申诉人：进入仲裁（item10）
    this._notify(
      dispute.user_id,
      'dispute_arbitrating',
      '售后申诉升级仲裁',
      `您的售后申诉（#${disputeId}）已升级为仲裁，正在加急处理`,
      {
        trade_dispute_id: disputeId,
        status: 'arbitrating'
      }
    )

    return {
      trade_dispute_id: disputeId,
      approval_chain_instance_id: chainInstance.instance_id,
      status: 'arbitrating'
    }
  }

  /**
   * 解决申诉（含真实退款，修复方案A 第9项资损 BUG）
   *
   * 退款资金口径（第9项决策）：
   * - refund=true 且为交易订单且状态 frozen → 复用 TradeOrderService.cancelOrder 真解冻原路退买家
   * - refund=true 但订单已 completed（资金已放卖家）或为拍卖等 → 抛错拒绝伪退款，
   *   要求客服改用 GM 补偿工具发放等值补偿（一期不动原单资金）
   * - refund=false → 驳回申诉，交易订单恢复 completed
   *
   * @param {number} disputeId - 申诉 ID（trade_dispute_id）
   * @param {Object} params - 解决参数
   * @param {string} params.resolution - 解决说明
   * @param {boolean} [params.refund=false] - 是否退款
   * @param {number} params.operator_id - 操作人 ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @returns {Promise<Object>} 解决结果
   */
  async resolveDispute(disputeId, params, options = {}) {
    const transaction = assertAndGetTransaction(options, 'TradeDisputeService.resolveDispute')

    const { resolution, refund = false, operator_id } = params
    if (!resolution) throw new BusinessError('解决说明不能为空', 'TRADE_NOT_ALLOWED', 400)

    const dispute = await this.models.TradeDispute.findByPk(disputeId, { transaction })
    if (!dispute) throw new BusinessError('售后申诉不存在', 'TRADE_NOT_FOUND', 404)
    if (['resolved', 'rejected'].includes(dispute.status)) {
      throw new BusinessError('该申诉已解决或已驳回', 'TRADE_ERROR', 400)
    }

    const refundResult = null
    let finalStatus = 'rejected'

    if (refund) {
      /*
       * C2C 交易订单原路退款已随 C2C 下线移除（2026-06-05 阶段五）。
       * 兑换/消费类申诉一律走客服补偿工具（GM 补偿）发放等值补偿后再解决，不在此处动原单资金。
       */
      throw new BusinessError(
        `${dispute.order_type} 订单不支持原路退款，请使用客服补偿工具（GM 补偿）发放等值补偿后再解决申诉`,
        'TRADE_NOT_ALLOWED',
        400
      )
    } else {
      // 驳回申诉：兑换/消费订单不改其订单状态
      finalStatus = 'rejected'
    }

    // 更新申诉
    const now = new Date()
    await dispute.update(
      {
        status: finalStatus,
        resolution,
        resolved_at: now,
        assigned_to: operator_id
      },
      { transaction }
    )

    logger.info('[售后申诉] 申诉已处理', {
      trade_dispute_id: disputeId,
      refund,
      final_status: finalStatus,
      operator_id
    })

    // 通知申诉人：处理结果（item10）
    this._notify(
      dispute.user_id,
      finalStatus === 'resolved' ? 'dispute_resolved' : 'dispute_rejected',
      finalStatus === 'resolved' ? '售后申诉已解决' : '售后申诉处理结果',
      `您的售后申诉（#${disputeId}）处理结果：${resolution}`,
      { trade_dispute_id: disputeId, status: finalStatus }
    )

    return {
      trade_dispute_id: disputeId,
      status: finalStatus,
      resolution,
      refund: refundResult
    }
  }

  /**
   * 发送申诉状态通知（私有方法，失败不影响主业务流程，item10）
   *
   * @param {number} userId - 接收通知的用户ID
   * @param {string} type - 通知类型
   * @param {string} title - 通知标题
   * @param {string} content - 通知内容
   * @param {Object} data - 附加业务数据
   * @returns {void}
   * @private
   */
  _notify(userId, type, title, content, data) {
    NotificationService.send(userId, { type, title, content, data }).catch(error => {
      logger.warn('[售后申诉] 通知发送失败（不影响业务）', {
        user_id: userId,
        type,
        error: error.message
      })
    })
  }

  /**
   * 查询售后申诉列表（管理后台）
   *
   * @param {Object} filters - 筛选条件
   * @param {string} [filters.status] - 申诉状态
   * @param {string} [filters.dispute_type] - 纠纷类型
   * @param {string} [filters.priority] - 优先级
   * @param {number} [filters.page=1] - 页码
   * @param {number} [filters.page_size=20] - 每页数量
   * @returns {Promise<Object>} { rows, count, page, page_size }
   */
  async listDisputes(filters = {}) {
    const { status, dispute_type, priority, page = 1, page_size = 20 } = filters
    const where = {}

    if (status) where.status = status
    if (dispute_type) where.dispute_type = dispute_type
    if (priority) where.priority = priority

    const { rows, count } = await this.models.TradeDispute.findAndCountAll({
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
   * 获取售后申诉详情（管理后台，含订单与仲裁信息）
   *
   * @param {number} disputeId - 申诉 ID（trade_dispute_id）
   * @returns {Promise<Object>} 申诉详情
   */
  async getDisputeDetail(disputeId) {
    const dispute = await this.models.TradeDispute.findByPk(disputeId, {
      include: [
        { model: this.models.User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: this.models.User, as: 'assignee', attributes: ['user_id', 'nickname'] },
        { model: this.models.User, as: 'creator', attributes: ['user_id', 'nickname'] }
      ]
    })

    if (!dispute) throw new BusinessError('售后申诉不存在', 'TRADE_NOT_FOUND', 404)

    // 关联订单信息（C2C 交易订单已随 C2C 下线移除，兑换/消费为多态值不强查）
    const orderInfo = null

    // 关联审批链信息（实例主键为 instance_id）
    let arbitrationInfo = null
    if (dispute.approval_chain_instance_id) {
      arbitrationInfo = await this.models.ApprovalChainInstance.findByPk(
        dispute.approval_chain_instance_id,
        { attributes: ['instance_id', 'status', 'created_at', 'completed_at'] }
      )
    }

    return {
      dispute: dispute.toJSON(),
      order: orderInfo?.toJSON() || null,
      arbitration: arbitrationInfo?.toJSON() || null
    }
  }

  /**
   * 获取售后申诉统计数据（管理后台看板）
   *
   * @returns {Promise<Object>} 申诉统计
   */
  async getDisputeStats() {
    const [statusCounts, typeCounts, recentCount] = await Promise.all([
      // 按状态统计
      this.models.TradeDispute.findAll({
        attributes: ['status', [this.sequelize.fn('COUNT', '*'), 'count']],
        group: ['status'],
        raw: true
      }),
      // 按纠纷类型统计
      this.models.TradeDispute.findAll({
        attributes: ['dispute_type', [this.sequelize.fn('COUNT', '*'), 'count']],
        group: ['dispute_type'],
        raw: true
      }),
      // 近7天新增申诉数
      this.models.TradeDispute.count({
        where: {
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

  /**
   * C 端：查询用户自己的售后申诉列表（仅本人，下发前由路由层脱敏）
   *
   * @param {number} userId - 当前登录用户ID
   * @param {Object} query - 查询参数
   * @param {string} [query.status] - 状态筛选
   * @param {number} [query.page=1] - 页码
   * @param {number} [query.page_size=10] - 每页数量
   * @returns {Promise<Object>} { rows, count, page, page_size }
   */
  async listUserDisputes(userId, query = {}) {
    const page = parseInt(query.page) || 1
    const pageSize = Math.min(parseInt(query.page_size) || 10, 50)
    const where = { user_id: userId }
    if (query.status) where.status = query.status

    const { rows, count } = await this.models.TradeDispute.findAndCountAll({
      where,
      attributes: [
        'trade_dispute_id',
        'order_type',
        'order_id',
        'dispute_type',
        'status',
        'title',
        'resolution',
        'created_at',
        'resolved_at'
      ],
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    })

    return {
      rows: rows.map(r => r.get({ plain: true })),
      count,
      page,
      page_size: pageSize
    }
  }

  /**
   * C 端：查询用户自己的售后申诉详情（仅本人，下发前由路由层脱敏）
   *
   * @param {number} userId - 当前登录用户ID
   * @param {number} disputeId - 申诉 ID（trade_dispute_id）
   * @returns {Promise<Object>} 申诉详情（含内部字段，路由层脱敏后下发）
   */
  async getUserDisputeDetail(userId, disputeId) {
    const dispute = await this.models.TradeDispute.findByPk(disputeId)
    if (!dispute) throw new BusinessError('售后申诉不存在', 'TRADE_NOT_FOUND', 404)
    if (dispute.user_id !== userId) {
      throw new BusinessError('无权查看该售后申诉', 'TRADE_FORBIDDEN', 403)
    }
    return dispute.get({ plain: true })
  }
}

/** 纠纷类型枚举 */
TradeDisputeService.DISPUTE_TYPE = DISPUTE_TYPE
/** 允许发起申诉的订单类型白名单 */
TradeDisputeService.ALLOWED_ORDER_TYPES = ALLOWED_ORDER_TYPES

module.exports = TradeDisputeService
