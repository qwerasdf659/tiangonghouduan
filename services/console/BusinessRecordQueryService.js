'use strict'

/**
 * 业务记录查询服务 - Console 域
 *
 * @description 提供管理后台业务记录的只读查询功能
 *
 * 收口来源：routes/v4/console/business-records.js 的读操作
 * 遵循架构规范：读写分层策略 Phase 3
 *
 * 涵盖查询：
 * - 抽奖清除设置记录 (lottery_clear_setting_records)
 * - 核销订单 (redemption_orders)
 * - 内容审核记录 (content_review_records)
 * - 用户角色变更记录 (user_role_change_records)
 * - 用户状态变更记录 (user_status_change_records)
 * - B2C兑换记录 (exchange_records)
 * - 聊天消息记录 (chat_messages)
 *
 * @module services/console/BusinessRecordQueryService
 * @version 1.0.0
 * @date 2026-02-01
 */

const { Op, fn, col } = require('sequelize')
const logger = require('../../utils/logger').logger

/**
 * 构建分页和排序选项
 *
 * @param {Object} options - 查询参数
 * @param {string} [defaultSortBy='created_at'] - 默认排序字段
 * @returns {Object} 分页和排序选项
 */
function buildPaginationOptions(options, defaultSortBy = 'created_at') {
  const page = Math.max(1, parseInt(options.page) || 1)
  const page_size = Math.min(100, Math.max(1, parseInt(options.page_size) || 20))
  const sort_by = options.sort_by || defaultSortBy
  const sort_order = (options.sort_order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

  return {
    page,
    page_size,
    offset: (page - 1) * page_size,
    limit: page_size,
    order: [[sort_by, sort_order]]
  }
}

/**
 * 业务记录查询服务类
 * 提供管理后台业务记录的只读查询功能
 *
 * @class BusinessRecordQueryService
 */
class BusinessRecordQueryService {
  /*
   * =================================================================
   * 抽奖清除设置记录查询
   * =================================================================
   */

  /**
   * 查询抽奖清除设置记录列表
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.user_id] - 被清除设置的用户ID
   * @param {number} [options.admin_id] - 执行清除的管理员ID
   * @param {string} [options.setting_type] - 清除的设置类型
   * @param {string} [options.start_date] - 开始日期
   * @param {string} [options.end_date] - 结束日期
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 记录列表和分页信息
   */
  static async getLotteryClearSettings(options = {}) {
    const { LotteryClearSettingRecord, User } = require('../../models')

    const { user_id, admin_id, setting_type, start_date, end_date } = options
    const pagination = buildPaginationOptions(options)

    // 构建查询条件
    const where = {}
    if (user_id) where.user_id = parseInt(user_id)
    if (admin_id) where.admin_id = parseInt(admin_id)
    if (setting_type) where.setting_type = setting_type
    if (start_date || end_date) {
      where.created_at = {}
      if (start_date) where.created_at[Op.gte] = new Date(start_date)
      if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
    }

    const { count, rows } = await LotteryClearSettingRecord.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: User, as: 'admin', attributes: ['user_id', 'nickname', 'mobile'] }
      ],
      ...pagination
    })

    logger.info('查询抽奖清除设置记录成功', { total: count, page: pagination.page })

    return {
      records: rows,
      pagination: {
        total: count,
        page: pagination.page,
        page_size: pagination.page_size,
        total_pages: Math.ceil(count / pagination.page_size)
      }
    }
  }

  /**
   * 获取抽奖清除设置记录详情
   *
   * @param {number} record_id - 记录ID
   * @returns {Promise<Object|null>} 记录详情
   */
  static async getLotteryClearSettingById(record_id) {
    const { LotteryClearSettingRecord, User } = require('../../models')

    const record = await LotteryClearSettingRecord.findByPk(parseInt(record_id), {
      include: [
        { model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: User, as: 'admin', attributes: ['user_id', 'nickname', 'mobile'] }
      ]
    })

    return record
  }

  /*
   * =================================================================
   * 核销订单查询
   * =================================================================
   */

  /**
   * 查询核销订单列表
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.status] - 订单状态
   * @param {number} [options.redeemer_user_id] - 核销用户ID
   * @param {string} [options.start_date] - 开始日期
   * @param {string} [options.end_date] - 结束日期
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 订单列表和分页信息
   */
  static async getRedemptionOrders(options = {}) {
    const { RedemptionOrder, User, ItemInstance } = require('../../models')

    const { status, redeemer_user_id, start_date, end_date } = options
    const pagination = buildPaginationOptions(options)

    // 构建查询条件
    const where = {}
    if (status) where.status = status
    if (redeemer_user_id) where.redeemer_user_id = parseInt(redeemer_user_id)
    if (start_date || end_date) {
      where.created_at = {}
      if (start_date) where.created_at[Op.gte] = new Date(start_date)
      if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
    }

    const { count, rows } = await RedemptionOrder.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'redeemer',
          attributes: ['user_id', 'nickname', 'mobile'],
          required: false
        },
        {
          model: ItemInstance,
          as: 'item_instance',
          attributes: ['item_instance_id', 'item_type', 'meta'],
          required: false
        }
      ],
      ...pagination
    })

    logger.info('查询核销订单列表成功', { total: count, page: pagination.page })

    return {
      orders: rows,
      pagination: {
        total: count,
        page: pagination.page,
        page_size: pagination.page_size,
        total_pages: Math.ceil(count / pagination.page_size)
      }
    }
  }

  /**
   * 获取核销订单详情
   *
   * @param {number|string} order_id - 订单ID
   * @returns {Promise<Object|null>} 订单详情
   */
  static async getRedemptionOrderById(order_id) {
    const { RedemptionOrder, User, ItemInstance } = require('../../models')

    const order = await RedemptionOrder.findByPk(order_id, {
      include: [
        {
          model: User,
          as: 'redeemer',
          attributes: ['user_id', 'nickname', 'mobile'],
          required: false
        },
        {
          model: ItemInstance,
          as: 'item_instance',
          required: false
        }
      ]
    })

    return order
  }

  /**
   * 获取核销订单统计数据
   *
   * @returns {Promise<Object>} 统计数据
   */
  static async getRedemptionOrderStats() {
    const { RedemptionOrder } = require('../../models')

    // 按状态分组统计
    const statusCounts = await RedemptionOrder.findAll({
      attributes: ['status', [fn('COUNT', col('order_id')), 'count']],
      group: ['status'],
      raw: true
    })

    // 转换为对象格式
    const stats = {
      total: 0,
      pending: 0,
      fulfilled: 0,
      expired: 0,
      cancelled: 0
    }

    statusCounts.forEach(item => {
      const count = parseInt(item.count) || 0
      stats[item.status] = count
      stats.total += count
    })

    return stats
  }

  /**
   * 导出核销订单数据
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.status] - 订单状态筛选
   * @param {string} [options.start_date] - 开始日期
   * @param {string} [options.end_date] - 结束日期
   * @param {number} [options.limit=10000] - 最大导出数量
   * @returns {Promise<Array>} 订单数组
   */
  static async exportRedemptionOrders(options = {}) {
    const { RedemptionOrder, User, ItemInstance } = require('../../models')

    const { status, start_date, end_date, limit = 10000 } = options

    // 构建查询条件
    const where = {}
    if (status) where.status = status
    if (start_date || end_date) {
      where.created_at = {}
      if (start_date) where.created_at[Op.gte] = new Date(start_date)
      if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
    }

    // 查询所有符合条件的数据（不分页）
    const orders = await RedemptionOrder.findAll({
      where,
      include: [
        {
          model: User,
          as: 'redeemer',
          attributes: ['user_id', 'nickname', 'mobile'],
          required: false
        },
        {
          model: ItemInstance,
          as: 'item_instance',
          attributes: ['item_instance_id', 'item_type', 'meta'],
          required: false
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit)
    })

    return orders
  }

  /*
   * =================================================================
   * 内容审核记录查询
   * =================================================================
   */

  /**
   * 查询内容审核记录列表
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.auditable_type] - 审核对象类型
   * @param {string} [options.audit_status] - 审核状态
   * @param {number} [options.auditor_id] - 审核员ID
   * @param {string} [options.priority] - 优先级
   * @param {string} [options.start_date] - 开始日期
   * @param {string} [options.end_date] - 结束日期
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 记录列表和分页信息
   */
  static async getContentReviews(options = {}) {
    const { ContentReviewRecord, User } = require('../../models')

    const { auditable_type, audit_status, auditor_id, priority, start_date, end_date } = options
    const pagination = buildPaginationOptions(options, 'submitted_at')

    // 构建查询条件
    const where = {}
    if (auditable_type) where.auditable_type = auditable_type
    if (audit_status) where.audit_status = audit_status
    if (auditor_id) where.auditor_id = parseInt(auditor_id)
    if (priority) where.priority = priority
    if (start_date || end_date) {
      where.submitted_at = {}
      if (start_date) where.submitted_at[Op.gte] = new Date(start_date)
      if (end_date) where.submitted_at[Op.lte] = new Date(end_date + ' 23:59:59')
    }

    const { count, rows } = await ContentReviewRecord.findAndCountAll({
      where,
      include: [{ model: User, as: 'auditor', attributes: ['user_id', 'nickname', 'mobile'] }],
      ...pagination
    })

    logger.info('查询内容审核记录成功', { total: count, page: pagination.page })

    return {
      records: rows,
      pagination: {
        total: count,
        page: pagination.page,
        page_size: pagination.page_size,
        total_pages: Math.ceil(count / pagination.page_size)
      }
    }
  }

  /**
   * 获取内容审核记录详情
   *
   * @param {number} audit_id - 审核记录ID
   * @returns {Promise<Object|null>} 记录详情
   */
  static async getContentReviewById(audit_id) {
    const { ContentReviewRecord, User } = require('../../models')

    const record = await ContentReviewRecord.findByPk(parseInt(audit_id), {
      include: [{ model: User, as: 'auditor', attributes: ['user_id', 'nickname', 'mobile'] }]
    })

    return record
  }

  /*
   * =================================================================
   * 用户角色变更记录查询
   * =================================================================
   */

  /**
   * 查询用户角色变更记录列表
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.user_id] - 被变更角色的用户ID
   * @param {number} [options.operator_id] - 执行变更的操作员ID
   * @param {string} [options.old_role] - 变更前角色
   * @param {string} [options.new_role] - 变更后角色
   * @param {string} [options.start_date] - 开始日期
   * @param {string} [options.end_date] - 结束日期
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 记录列表和分页信息
   */
  static async getUserRoleChanges(options = {}) {
    const { UserRoleChangeRecord, User } = require('../../models')

    const { user_id, operator_id, old_role, new_role, start_date, end_date } = options
    const pagination = buildPaginationOptions(options)

    // 构建查询条件
    const where = {}
    if (user_id) where.user_id = parseInt(user_id)
    if (operator_id) where.operator_id = parseInt(operator_id)
    if (old_role) where.old_role = old_role
    if (new_role) where.new_role = new_role
    if (start_date || end_date) {
      where.created_at = {}
      if (start_date) where.created_at[Op.gte] = new Date(start_date)
      if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
    }

    const { count, rows } = await UserRoleChangeRecord.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: User, as: 'operator', attributes: ['user_id', 'nickname', 'mobile'] }
      ],
      ...pagination
    })

    logger.info('查询用户角色变更记录成功', { total: count, page: pagination.page })

    return {
      records: rows,
      pagination: {
        total: count,
        page: pagination.page,
        page_size: pagination.page_size,
        total_pages: Math.ceil(count / pagination.page_size)
      }
    }
  }

  /**
   * 获取用户角色变更记录详情
   *
   * @param {number} record_id - 记录ID
   * @returns {Promise<Object|null>} 记录详情
   */
  static async getUserRoleChangeById(record_id) {
    const { UserRoleChangeRecord, User } = require('../../models')

    const record = await UserRoleChangeRecord.findByPk(parseInt(record_id), {
      include: [
        { model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: User, as: 'operator', attributes: ['user_id', 'nickname', 'mobile'] }
      ]
    })

    return record
  }

  /*
   * =================================================================
   * 用户状态变更记录查询
   * =================================================================
   */

  /**
   * 查询用户状态变更记录列表
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.user_id] - 被变更状态的用户ID
   * @param {number} [options.operator_id] - 执行变更的操作员ID
   * @param {string} [options.old_status] - 变更前状态
   * @param {string} [options.new_status] - 变更后状态
   * @param {string} [options.start_date] - 开始日期
   * @param {string} [options.end_date] - 结束日期
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 记录列表和分页信息
   */
  static async getUserStatusChanges(options = {}) {
    const { UserStatusChangeRecord, User } = require('../../models')

    const { user_id, operator_id, old_status, new_status, start_date, end_date } = options
    const pagination = buildPaginationOptions(options)

    // 构建查询条件
    const where = {}
    if (user_id) where.user_id = parseInt(user_id)
    if (operator_id) where.operator_id = parseInt(operator_id)
    if (old_status) where.old_status = old_status
    if (new_status) where.new_status = new_status
    if (start_date || end_date) {
      where.created_at = {}
      if (start_date) where.created_at[Op.gte] = new Date(start_date)
      if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
    }

    const { count, rows } = await UserStatusChangeRecord.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: User, as: 'operator', attributes: ['user_id', 'nickname', 'mobile'] }
      ],
      ...pagination
    })

    logger.info('查询用户状态变更记录成功', { total: count, page: pagination.page })

    return {
      records: rows,
      pagination: {
        total: count,
        page: pagination.page,
        page_size: pagination.page_size,
        total_pages: Math.ceil(count / pagination.page_size)
      }
    }
  }

  /**
   * 获取用户状态变更记录详情
   *
   * @param {number} record_id - 记录ID
   * @returns {Promise<Object|null>} 记录详情
   */
  static async getUserStatusChangeById(record_id) {
    const { UserStatusChangeRecord, User } = require('../../models')

    const record = await UserStatusChangeRecord.findByPk(parseInt(record_id), {
      include: [
        { model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: User, as: 'operator', attributes: ['user_id', 'nickname', 'mobile'] }
      ]
    })

    return record
  }

  /*
   * =================================================================
   * B2C兑换记录查询
   * =================================================================
   */

  /**
   * 查询B2C兑换记录列表
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.user_id] - 用户ID
   * @param {number} [options.exchange_item_id] - 商品ID
   * @param {string} [options.status] - 订单状态
   * @param {string} [options.order_no] - 订单号（模糊搜索）
   * @param {string} [options.start_date] - 开始日期
   * @param {string} [options.end_date] - 结束日期
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 记录列表和分页信息
   */
  static async getExchangeRecords(options = {}) {
    const { ExchangeRecord, User, ExchangeItem } = require('../../models')

    const { user_id, exchange_item_id, status, order_no, start_date, end_date } = options
    const pagination = buildPaginationOptions(options)

    // 构建查询条件
    const where = {}
    if (user_id) where.user_id = parseInt(user_id)
    if (exchange_item_id) where.exchange_item_id = parseInt(exchange_item_id)
    if (status) where.status = status
    if (order_no) where.order_no = { [Op.like]: `%${order_no}%` }
    if (start_date || end_date) {
      where.created_at = {}
      if (start_date) where.created_at[Op.gte] = new Date(start_date)
      if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
    }

    const { count, rows } = await ExchangeRecord.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
        {
          model: ExchangeItem,
          as: 'item',
          attributes: ['exchange_item_id', 'item_name', 'cost_asset_code', 'cost_amount']
        }
      ],
      ...pagination
    })

    logger.info('查询B2C兑换记录成功', { total: count, page: pagination.page })

    return {
      records: rows,
      pagination: {
        total: count,
        page: pagination.page,
        page_size: pagination.page_size,
        total_pages: Math.ceil(count / pagination.page_size)
      }
    }
  }

  /**
   * 获取B2C兑换记录详情
   *
   * @param {number} record_id - 记录ID
   * @returns {Promise<Object|null>} 记录详情
   */
  static async getExchangeRecordById(record_id) {
    const { ExchangeRecord, User, ExchangeItem } = require('../../models')

    const record = await ExchangeRecord.findByPk(parseInt(record_id), {
      include: [
        { model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: ExchangeItem, as: 'item' }
      ]
    })

    return record
  }

  /*
   * =================================================================
   * 聊天消息记录查询
   * =================================================================
   */

  /**
   * 查询聊天消息列表
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.session_id] - 会话ID
   * @param {number} [options.sender_id] - 发送者ID
   * @param {string} [options.sender_type] - 发送者类型
   * @param {string} [options.message_type] - 消息类型
   * @param {string} [options.message_source] - 消息来源
   * @param {string} [options.status] - 消息状态
   * @param {string} [options.search] - 内容搜索关键词
   * @param {string} [options.start_date] - 开始日期
   * @param {string} [options.end_date] - 结束日期
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 消息列表和分页信息
   */
  static async getChatMessages(options = {}) {
    const { ChatMessage, User, CustomerServiceSession } = require('../../models')

    const {
      session_id,
      sender_id,
      sender_type,
      message_type,
      message_source,
      status,
      search,
      start_date,
      end_date
    } = options
    const pagination = buildPaginationOptions(options)

    // 构建查询条件
    const where = {}
    if (session_id) where.customer_service_session_id = parseInt(session_id)
    if (sender_id) where.sender_id = parseInt(sender_id)
    if (sender_type) where.sender_type = sender_type
    if (message_type) where.message_type = message_type
    if (message_source) where.message_source = message_source
    if (status) where.status = status
    if (search) where.content = { [Op.like]: `%${search}%` }
    if (start_date || end_date) {
      where.created_at = {}
      if (start_date) where.created_at[Op.gte] = new Date(start_date)
      if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
    }

    const { count, rows } = await ChatMessage.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['user_id', 'nickname', 'mobile'],
          required: false
        },
        {
          model: CustomerServiceSession,
          as: 'session',
          attributes: ['customer_service_session_id', 'user_id', 'status', 'admin_id'],
          required: false
        }
      ],
      ...pagination
    })

    logger.info('查询聊天消息记录成功', { total: count, page: pagination.page })

    return {
      messages: rows,
      pagination: {
        total: count,
        page: pagination.page,
        page_size: pagination.page_size,
        total_pages: Math.ceil(count / pagination.page_size)
      }
    }
  }

  /**
   * 获取聊天消息详情
   *
   * @param {number} message_id - 消息ID
   * @returns {Promise<Object|null>} 消息详情
   */
  static async getChatMessageById(message_id) {
    const { ChatMessage, User, CustomerServiceSession } = require('../../models')

    const message = await ChatMessage.findByPk(parseInt(message_id), {
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['user_id', 'nickname', 'mobile'],
          required: false
        },
        {
          model: CustomerServiceSession,
          as: 'session',
          attributes: [
            'customer_service_session_id',
            'user_id',
            'status',
            'admin_id',
            'created_at'
          ],
          required: false
        },
        {
          model: ChatMessage,
          as: 'replyTo',
          attributes: ['message_id', 'content', 'sender_type', 'created_at'],
          required: false
        }
      ]
    })

    return message
  }

  /**
   * 获取聊天消息统计摘要
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.start_date] - 开始日期
   * @param {string} [options.end_date] - 结束日期
   * @returns {Promise<Object>} 统计摘要
   */
  static async getChatMessageStats(options = {}) {
    const { ChatMessage } = require('../../models')

    const { start_date, end_date } = options

    // 构建日期过滤条件
    const dateWhere = {}
    if (start_date || end_date) {
      dateWhere.created_at = {}
      if (start_date) dateWhere.created_at[Op.gte] = new Date(start_date)
      if (end_date) dateWhere.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
    }

    // 并行执行统计查询
    const [totalMessages, byType, bySource, byStatus] = await Promise.all([
      // 统计总消息数
      ChatMessage.count({ where: dateWhere }),
      // 按发送者类型统计
      ChatMessage.findAll({
        where: dateWhere,
        attributes: ['sender_type', [fn('COUNT', col('message_id')), 'count']],
        group: ['sender_type'],
        raw: true
      }),
      // 按消息来源统计
      ChatMessage.findAll({
        where: dateWhere,
        attributes: ['message_source', [fn('COUNT', col('message_id')), 'count']],
        group: ['message_source'],
        raw: true
      }),
      // 按状态统计
      ChatMessage.findAll({
        where: dateWhere,
        attributes: ['status', [fn('COUNT', col('message_id')), 'count']],
        group: ['status'],
        raw: true
      })
    ])

    return {
      total_messages: totalMessages,
      by_sender_type: byType.reduce((acc, item) => {
        acc[item.sender_type] = parseInt(item.count)
        return acc
      }, {}),
      by_message_source: bySource.reduce((acc, item) => {
        acc[item.message_source] = parseInt(item.count)
        return acc
      }, {}),
      by_status: byStatus.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count)
        return acc
      }, {}),
      date_range: {
        start_date: start_date || null,
        end_date: end_date || null
      }
    }
  }

  /**
   * 获取提醒历史统计概览
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.start_time] - 开始时间
   * @param {string} [options.end_time] - 结束时间
   * @returns {Promise<Object>} 统计概览数据
   */
  static async getReminderHistoryStatsOverview(options = {}) {
    const { ReminderHistory, sequelize } = require('../../models')

    const { start_time, end_time } = options

    // 构建时间范围条件
    const where = {}
    if (start_time || end_time) {
      where.triggered_at = {}
      if (start_time) {
        where.triggered_at[Op.gte] = new Date(start_time)
      }
      if (end_time) {
        where.triggered_at[Op.lte] = new Date(end_time)
      }
    }

    // 并行执行统计查询
    const [totalTriggers, byStatus, byRule] = await Promise.all([
      // 总触发次数
      ReminderHistory.count({ where }),
      // 按状态统计
      ReminderHistory.findAll({
        where,
        attributes: ['notification_status', [fn('COUNT', col('reminder_history_id')), 'count']],
        group: ['notification_status'],
        raw: true
      }),
      // 按规则统计（Top 10）
      ReminderHistory.findAll({
        where,
        attributes: [
          'reminder_rule_id',
          [sequelize.fn('COUNT', sequelize.col('reminder_history_id')), 'count']
        ],
        group: ['reminder_rule_id'],
        order: [[sequelize.fn('COUNT', sequelize.col('reminder_history_id')), 'DESC']],
        limit: 10,
        raw: true
      })
    ])

    // 转换格式
    const statusStats = {}
    byStatus.forEach(item => {
      statusStats[item.notification_status] = parseInt(item.count, 10)
    })

    return {
      total_triggers: totalTriggers,
      by_status: statusStats,
      top_rules: byRule.map(item => ({
        reminder_rule_id: item.reminder_rule_id,
        trigger_count: parseInt(item.count, 10)
      }))
    }
  }

  /**
   * 获取审计日志按操作者统计
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.start_time] - 开始时间
   * @param {string} [options.end_time] - 结束时间
   * @param {number} [options.limit=10] - 返回数量
   * @returns {Promise<Array>} 操作者统计数据
   */
  static async getAuditStatsByOperator(options = {}) {
    const { AdminOperationLog, User } = require('../../models')

    const { start_time, end_time, limit = 10 } = options

    // 构建时间范围条件
    const where = {}
    if (start_time || end_time) {
      where.created_at = {}
      if (start_time) {
        where.created_at[Op.gte] = new Date(start_time)
      }
      if (end_time) {
        where.created_at[Op.lte] = new Date(end_time)
      }
    }

    const stats = await AdminOperationLog.findAll({
      where,
      attributes: [
        'operator_id',
        [fn('COUNT', col('log_id')), 'total_operations'],
        [fn('COUNT', fn('DISTINCT', col('operation_type'))), 'operation_types']
      ],
      include: [
        {
          model: User,
          as: 'operator',
          attributes: ['nickname']
        }
      ],
      group: ['operator_id', 'operator.user_id', 'operator.nickname'],
      order: [[fn('COUNT', col('log_id')), 'DESC']],
      limit: parseInt(limit, 10) || 10,
      raw: false
    })

    return stats.map(item => ({
      operator_id: item.operator_id,
      nickname: item.operator?.nickname || 'Unknown',
      total_operations: parseInt(item.dataValues.total_operations, 10),
      operation_types: parseInt(item.dataValues.operation_types, 10)
    }))
  }

  /**
   * 获取审计日志按风险等级统计
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.start_time] - 开始时间
   * @param {string} [options.end_time] - 结束时间
   * @returns {Promise<Object>} 风险等级统计数据
   */
  static async getAuditStatsByRiskLevel(options = {}) {
    const { AdminOperationLog } = require('../../models')

    const { start_time, end_time } = options

    // 构建时间范围条件
    const where = {}
    if (start_time || end_time) {
      where.created_at = {}
      if (start_time) {
        where.created_at[Op.gte] = new Date(start_time)
      }
      if (end_time) {
        where.created_at[Op.lte] = new Date(end_time)
      }
    }

    const stats = await AdminOperationLog.findAll({
      where,
      attributes: ['risk_level', [fn('COUNT', col('log_id')), 'count']],
      group: ['risk_level'],
      raw: true
    })

    const result = {}
    stats.forEach(item => {
      result[item.risk_level] = parseInt(item.count, 10)
    })

    return result
  }

  /**
   * 获取提醒历史详情
   *
   * @param {number} historyId - 历史记录ID
   * @returns {Promise<Object|null>} 提醒历史详情
   */
  static async getReminderHistoryById(historyId) {
    const { ReminderHistory, ReminderRule } = require('../../models')

    const history = await ReminderHistory.findByPk(historyId, {
      include: [
        {
          model: ReminderRule,
          as: 'rule',
          attributes: ['reminder_rule_id', 'rule_code', 'rule_name', 'rule_type']
        }
      ]
    })

    return history
  }
}

module.exports = BusinessRecordQueryService
