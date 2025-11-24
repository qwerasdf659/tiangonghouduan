/**
 * 客服会话服务（Customer Service Session Service）
 *
 * 业务场景：管理用户与客服的聊天会话
 * 核心职责：会话查询、消息收发、会话分配、状态管理
 *
 * 主要功能：
 * 1. 获取会话列表（分页、筛选、排序）
 * 2. 获取会话消息历史
 * 3. 发送消息（管理员端）
 * 4. 标记消息已读
 * 5. 转接会话给其他客服
 * 6. 关闭会话
 *
 * 集成服务：
 * - ChatWebSocketService：实时消息推送
 * - NotificationService：通知推送
 *
 * 创建时间：2025年11月23日
 * 最后更新：2025年11月23日
 */

'use strict'

const { CustomerServiceSession, ChatMessage, User } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')
const { Sequelize, Transaction } = require('sequelize')
const { Op } = Sequelize

/**
 * 客服会话服务类
 * 负责客服聊天会话的业务逻辑处理
 *
 * @class CustomerServiceSessionService
 */
class CustomerServiceSessionService {
  /**
   * 获取会话列表（支持分页、筛选、排序）
   *
   * 业务场景：
   * - 管理员查看待处理的客服会话
   * - 支持按状态、时间范围、搜索关键词筛选
   * - 分页加载会话列表
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.status] - 会话状态筛选（waiting/assigned/active/closed）
   * @param {number} [options.admin_id] - 筛选指定客服的会话
   * @param {string} [options.search] - 搜索关键词（用户昵称/手机号）
   * @param {string} [options.sort_by='updated_at'] - 排序字段
   * @param {string} [options.sort_order='DESC'] - 排序方向
   * @returns {Object} 会话列表和分页信息
   */
  static async getSessionList (options = {}) {
    try {
      const {
        page = 1,
        page_size = 20,
        status,
        admin_id,
        search,
        sort_by = 'updated_at',
        sort_order = 'DESC'
      } = options

      console.log('📋 获取客服会话列表，参数:', JSON.stringify(options, null, 2))

      // 构建查询条件
      const where = {}

      // 状态筛选
      if (status) {
        where.status = status
      }

      // 客服筛选
      if (admin_id) {
        where.admin_id = admin_id
      }

      // 构建查询（包含用户信息）
      const queryOptions = {
        where,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['user_id', 'nickname', 'mobile'],
            // 搜索条件
            where: search
              ? {
                [Op.or]: [
                  { nickname: { [Op.like]: `%${search}%` } },
                  { mobile: { [Op.like]: `%${search}%` } }
                ]
              }
              : undefined,
            required: !!search
          },
          {
            model: User,
            as: 'admin',
            attributes: ['user_id', 'nickname', 'mobile'],
            required: false
          }
        ],
        order: [[sort_by, sort_order]],
        limit: parseInt(page_size),
        offset: (parseInt(page) - 1) * parseInt(page_size)
      }

      // 执行查询
      const { rows: sessions, count: total } = await CustomerServiceSession.findAndCountAll(queryOptions)

      // 格式化返回数据
      const formattedSessions = sessions.map(session => ({
        session_id: session.session_id,
        user: session.user
          ? {
            user_id: session.user.user_id,
            nickname: session.user.nickname,
            mobile: session.user.mobile
          }
          : null,
        admin: session.admin
          ? {
            user_id: session.admin.user_id,
            nickname: session.admin.nickname
          }
          : null,
        status: session.status,
        priority: session.priority,
        last_message_at: session.last_message_at ? BeijingTimeHelper.formatForAPI(session.last_message_at).iso : null,
        created_at: BeijingTimeHelper.formatForAPI(session.created_at).iso,
        updated_at: BeijingTimeHelper.formatForAPI(session.updated_at).iso,
        // 获取未读消息数（需要额外查询）
        unread_count: 0 // TODO: 后续优化添加未读数统计
      }))

      console.log(`✅ 成功获取${formattedSessions.length}条会话记录`)

      return {
        sessions: formattedSessions,
        pagination: {
          page: parseInt(page),
          page_size: parseInt(page_size),
          total,
          total_pages: Math.ceil(total / parseInt(page_size))
        }
      }
    } catch (error) {
      console.error('❌ 获取会话列表失败:', error)
      throw error
    }
  }

  /**
   * 获取会话详情和消息历史
   *
   * 业务场景：
   * - 管理员点击会话，查看完整的聊天记录
   * - 加载会话基本信息和历史消息
   *
   * @param {number} session_id - 会话ID
   * @param {Object} options - 查询选项
   * @param {number} [options.limit=50] - 消息数量限制
   * @param {number} [options.before_message_id] - 加载指定消息之前的历史（用于分页）
   * @returns {Object} 会话详情和消息列表
   */
  static async getSessionMessages (session_id, options = {}) {
    try {
      const { limit = 50, before_message_id } = options

      console.log(`📋 获取会话 ${session_id} 的消息，参数:`, JSON.stringify(options, null, 2))

      // 获取会话详情
      const session = await CustomerServiceSession.findOne({
        where: { session_id },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: User,
            as: 'admin',
            attributes: ['user_id', 'nickname', 'mobile']
          }
        ]
      })

      if (!session) {
        throw new Error('会话不存在')
      }

      // 构建消息查询条件
      const messageWhere = { session_id }
      if (before_message_id) {
        messageWhere.message_id = { [Op.lt]: before_message_id }
      }

      // 获取消息列表
      const messages = await ChatMessage.findAll({
        where: messageWhere,
        include: [
          {
            model: User,
            as: 'sender',
            attributes: ['user_id', 'nickname']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit)
      })

      // 格式化返回数据
      const formattedMessages = messages.reverse().map(msg => ({
        message_id: msg.message_id,
        session_id: msg.session_id,
        sender: msg.sender
          ? {
            user_id: msg.sender.user_id,
            nickname: msg.sender.nickname
          }
          : null,
        sender_type: msg.sender_type,
        message_source: msg.message_source,
        content: msg.content,
        message_type: msg.message_type,
        status: msg.status,
        created_at: BeijingTimeHelper.formatForAPI(msg.created_at).iso
      }))

      console.log(`✅ 成功获取${formattedMessages.length}条消息`)

      return {
        session: {
          session_id: session.session_id,
          user: session.user
            ? {
              user_id: session.user.user_id,
              nickname: session.user.nickname,
              mobile: session.user.mobile
            }
            : null,
          admin: session.admin
            ? {
              user_id: session.admin.user_id,
              nickname: session.admin.nickname
            }
            : null,
          status: session.status,
          priority: session.priority,
          created_at: BeijingTimeHelper.formatForAPI(session.created_at).iso
        },
        messages: formattedMessages,
        has_more: messages.length === parseInt(limit)
      }
    } catch (error) {
      console.error('❌ 获取会话消息失败:', error)
      throw error
    }
  }

  /**
   * 发送消息（管理员端）
   *
   * 业务场景：
   * - 客服在管理后台回复用户消息
   * - 自动更新会话状态和最后消息时间
   *
   * @param {number} session_id - 会话ID
   * @param {Object} data - 消息数据
   * @param {number} data.admin_id - 发送客服的ID
   * @param {string} data.content - 消息内容
   * @param {string} [data.message_type='text'] - 消息类型（text/image/system）
   * @returns {Object} 创建的消息对象
   */
  static async sendMessage (session_id, data) {
    const sequelize = CustomerServiceSession.sequelize
    const transaction = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
    })

    try {
      const { admin_id, content, message_type = 'text' } = data

      console.log(`📤 管理员 ${admin_id} 向会话 ${session_id} 发送消息`)

      // 验证会话是否存在
      const session = await CustomerServiceSession.findOne({
        where: { session_id },
        transaction
      })

      if (!session) {
        throw new Error('会话不存在')
      }

      // 验证管理员是否有权限发送消息
      if (session.admin_id && session.admin_id !== admin_id) {
        throw new Error('无权限操作此会话')
      }

      // 创建消息记录
      const message = await ChatMessage.create({
        session_id,
        sender_id: admin_id,
        sender_type: 'admin',
        message_source: 'admin_client',
        content,
        message_type,
        status: 'sent'
      }, { transaction })

      // 更新会话的最后消息时间
      await session.update({
        last_message_at: new Date(),
        status: session.status === 'waiting' || session.status === 'assigned' ? 'active' : session.status
      }, { transaction })

      await transaction.commit()

      console.log(`✅ 消息发送成功，消息ID: ${message.message_id}`)

      /*
       * TODO: 通过WebSocket推送消息给用户端
       * const webSocketService = require('./ChatWebSocketService')
       * await webSocketService.sendMessageToUser(session.user_id, message)
       */

      return {
        message_id: message.message_id,
        content: message.content,
        sender_type: message.sender_type,
        message_type: message.message_type,
        created_at: BeijingTimeHelper.formatForAPI(message.created_at).iso
      }
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 发送消息失败:', error)
      throw error
    }
  }

  /**
   * 标记会话消息为已读
   *
   * 业务场景：
   * - 管理员打开会话时，标记用户发送的消息为已读
   *
   * @param {number} session_id - 会话ID
   * @param {number} admin_id - 管理员ID
   * @returns {Object} 更新结果
   */
  static async markSessionAsRead (session_id, admin_id) {
    try {
      console.log(`👁️ 管理员 ${admin_id} 标记会话 ${session_id} 为已读`)

      // 验证会话权限
      const session = await CustomerServiceSession.findOne({
        where: { session_id }
      })

      if (!session) {
        throw new Error('会话不存在')
      }

      if (session.admin_id && session.admin_id !== admin_id) {
        throw new Error('无权限操作此会话')
      }

      // 标记用户发送的未读消息为已读
      const [updatedCount] = await ChatMessage.update(
        { status: 'read' },
        {
          where: {
            session_id,
            sender_type: 'user',
            status: { [Op.in]: ['sent', 'delivered'] }
          }
        }
      )

      console.log(`✅ 标记 ${updatedCount} 条消息为已读`)

      return {
        updated_count: updatedCount
      }
    } catch (error) {
      console.error('❌ 标记已读失败:', error)
      throw error
    }
  }

  /**
   * 转接会话给其他客服
   *
   * 业务场景：
   * - 当前客服无法处理，转接给其他客服
   * - 自动创建系统消息记录转接操作
   *
   * @param {number} session_id - 会话ID
   * @param {number} current_admin_id - 当前客服ID
   * @param {number} target_admin_id - 目标客服ID
   * @returns {Object} 转接结果
   */
  static async transferSession (session_id, current_admin_id, target_admin_id) {
    const sequelize = CustomerServiceSession.sequelize
    const transaction = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
    })

    try {
      console.log(`🔄 转接会话 ${session_id}: ${current_admin_id} → ${target_admin_id}`)

      // 验证会话
      const session = await CustomerServiceSession.findOne({
        where: { session_id },
        transaction
      })

      if (!session) {
        throw new Error('会话不存在')
      }

      // 验证权限
      if (session.admin_id && session.admin_id !== current_admin_id) {
        throw new Error('无权限转接此会话')
      }

      // 获取客服信息
      const [currentAdmin, targetAdmin] = await Promise.all([
        User.findByPk(current_admin_id, { attributes: ['nickname'], transaction }),
        User.findByPk(target_admin_id, { attributes: ['nickname'], transaction })
      ])

      if (!targetAdmin) {
        throw new Error('目标客服不存在')
      }

      // 更新会话的客服
      await session.update({
        admin_id: target_admin_id,
        status: 'assigned'
      }, { transaction })

      // 创建系统消息记录转接操作
      const systemMessage = await ChatMessage.create({
        session_id,
        sender_id: null,
        sender_type: 'admin',
        message_source: 'system',
        content: `会话已从 ${currentAdmin?.nickname || '客服'} 转接给 ${targetAdmin.nickname}`,
        message_type: 'system',
        status: 'sent'
      }, { transaction })

      await transaction.commit()

      console.log('✅ 会话转接成功')

      /*
       * TODO: 通知目标客服有新会话
       * const notificationService = require('./NotificationService')
       * await notificationService.notifyNewSession(target_admin_id, session)
       */

      return {
        session_id,
        new_admin_id: target_admin_id,
        new_admin_name: targetAdmin.nickname,
        system_message_id: systemMessage.message_id
      }
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 转接会话失败:', error)
      throw error
    }
  }

  /**
   * 关闭会话
   *
   * 业务场景：
   * - 客服处理完成，关闭会话
   * - 记录关闭原因和关闭时间
   *
   * @param {number} session_id - 会话ID
   * @param {Object} data - 关闭数据
   * @param {number} data.admin_id - 操作客服ID
   * @param {string} [data.close_reason] - 关闭原因
   * @returns {Object} 关闭结果
   */
  static async closeSession (session_id, data) {
    const sequelize = CustomerServiceSession.sequelize
    const transaction = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
    })

    try {
      const { admin_id, close_reason = '问题已解决' } = data

      console.log(`🔒 管理员 ${admin_id} 关闭会话 ${session_id}`)

      // 验证会话
      const session = await CustomerServiceSession.findOne({
        where: { session_id },
        transaction
      })

      if (!session) {
        throw new Error('会话不存在')
      }

      // 验证权限
      if (session.admin_id && session.admin_id !== admin_id) {
        throw new Error('无权限关闭此会话')
      }

      // 更新会话状态
      await session.update({
        status: 'closed',
        closed_at: new Date(),
        closed_by: admin_id,
        close_reason
      }, { transaction })

      // 创建系统消息
      await ChatMessage.create({
        session_id,
        sender_id: null,
        sender_type: 'admin',
        message_source: 'system',
        content: `会话已关闭：${close_reason}`,
        message_type: 'system',
        status: 'sent'
      }, { transaction })

      await transaction.commit()

      console.log('✅ 会话关闭成功')

      return {
        session_id,
        status: 'closed',
        closed_at: BeijingTimeHelper.formatForAPI(new Date()).iso
      }
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 关闭会话失败:', error)
      throw error
    }
  }

  /**
   * 获取会话统计信息
   *
   * 业务场景：
   * - 管理后台显示待处理会话数量
   * - 客服工作量统计
   *
   * @param {number} [admin_id] - 指定客服ID（可选）
   * @returns {Object} 统计信息
   */
  static async getSessionStats (admin_id) {
    try {
      const baseWhere = admin_id ? { admin_id } : {}

      const [waiting, assigned, active, closed] = await Promise.all([
        CustomerServiceSession.count({ where: { ...baseWhere, status: 'waiting' } }),
        CustomerServiceSession.count({ where: { ...baseWhere, status: 'assigned' } }),
        CustomerServiceSession.count({ where: { ...baseWhere, status: 'active' } }),
        CustomerServiceSession.count({ where: { ...baseWhere, status: 'closed' } })
      ])

      return {
        waiting,
        assigned,
        active,
        closed,
        total: waiting + assigned + active + closed,
        active_total: waiting + assigned + active
      }
    } catch (error) {
      console.error('❌ 获取统计信息失败:', error)
      throw error
    }
  }
}

module.exports = CustomerServiceSessionService
