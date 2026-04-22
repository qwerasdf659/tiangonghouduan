/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 管理后台客服管理服务（AdminCustomerServiceService）
 *
 * 业务场景：管理员视角的客服会话管理，采用Facade模式统一整合CustomerServiceSessionService
 *
 * 核心功能：
 * 1. 会话列表管理（查询会话列表、支持分页筛选排序）
 * 2. 会话消息管理（获取会话消息历史）
 * 3. 消息发送管理（管理员发送消息给用户）
 * 4. 会话状态管理（标记已读、转接会话、关闭会话）
 * 5. 统计分析管理（获取会话统计信息）
 *
 * 业务流程：
 *
 * 1. **会话列表查询流程**
 *    - 获取查询参数（分页、筛选、排序） → 调用CustomerServiceSessionService.getSessionList → 返回会话列表
 *
 * 2. **消息发送流程**
 *    - 验证参数（内容、长度、类型） → 调用CustomerServiceSessionService.sendMessage → 返回发送结果
 *
 * 3. **会话管理流程**
 *    - 验证权限 → 调用CustomerServiceSessionService对应方法 → 返回操作结果
 *
 * 设计原则：
 * - **Facade模式**：为管理员提供统一的客服管理接口，屏蔽底层服务复杂性
 * - **职责分离**：本服务只做组合编排和参数验证，具体业务逻辑委托给CustomerServiceSessionService
 * - **依赖注入**：通过ServiceManager获取底层服务，降低耦合
 * - **权限控制**：确保管理员权限验证和操作合法性检查
 *
 * 依赖服务：
 * - CustomerServiceSessionService：客服会话核心业务逻辑
 *
 * 关键方法列表：
 * - getSessionList(options) - 获取会话列表
 * - getSessionStats(adminId) - 获取会话统计
 * - getSessionMessages(sessionId, options) - 获取会话消息
 * - sendMessage(sessionId, messageData) - 发送消息
 * - markSessionAsRead(sessionId, adminId) - 标记已读
 * - transferSession(sessionId, currentAdminId, targetAdminId) - 转接会话
 * - closeSession(sessionId, closeData) - 关闭会话
 *
 * 数据模型关联：
 * - CustomerServiceSession：客服会话表（通过CustomerServiceSessionService）
 * - ChatMessage：聊天消息表（通过CustomerServiceSessionService）
 * - User：用户表（通过CustomerServiceSessionService）
 *
 * 使用示例：
 * ```javascript
 * const serviceManager = require('./services');
 * const AdminCustomerServiceService = serviceManager.getService('admin_customer_service');
 *
 * // 示例1：获取会话列表
 * const sessions = await AdminCustomerServiceService.getSessionList({
 *   page: 1,
 *   page_size: 20,
 *   status: 'active'
 * });
 *
 * // 示例2：发送消息
 * const result = await AdminCustomerServiceService.sendMessage(sessionId, {
 *   admin_id: adminId,
 *   content: '您好，有什么可以帮您的吗？',
 *   message_type: 'text',
 *   role_level: 2
 * });
 * ```
 *
 * 使用模型：Claude Sonnet 4.5
 */

const logger = require('../utils/logger').logger
const { getRedisClient } = require('../utils/UnifiedRedisClient')

/**
 * 管理后台客服管理服务类（Facade模式）
 *
 * @class AdminCustomerServiceService
 */
class AdminCustomerServiceService {
  /**
   * 静态依赖属性（通过initialize方法注入）
   * @private
   * @static
   */
  static _dependencies = {
    customerServiceSession: null
  }

  /**
   * 初始化Service依赖（在ServiceManager初始化时调用）
   *
   * @description
   * 在ServiceManager初始化阶段显式注入依赖的Service引用，
   * 避免在每个方法内部重复调用require和getService。
   *
   * @param {Object} serviceManager - ServiceManager实例
   * @returns {void}
   *
   * @example
   * // 在ServiceManager.initialize()中调用
   * AdminCustomerServiceService.initialize(serviceManager)
   */
  static initialize(serviceManager) {
    /*
     * 🎯 直接从_services Map获取，避免触发初始化检查
     * P1-9：使用 snake_case 服务键
     */
    this._dependencies.customerServiceSession = serviceManager._services.get(
      'customer_service_session'
    )
    logger.info('AdminCustomerServiceService依赖注入完成（P1-9 snake_case key）')
  }

  /**
   * 获取会话列表
   *
   * @description
   * 整合CustomerServiceSessionService的getSessionList方法，为管理员提供会话列表查询。
   * 支持分页、筛选（按状态、管理员ID）、搜索（用户昵称/手机号）、排序。
   *
   * 业务场景：
   * - 管理员查看所有客服会话
   * - 筛选特定状态的会话（待处理/进行中/已关闭）
   * - 查看指定客服的会话列表
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.status] - 会话状态（waiting/assigned/active/closed）
   * @param {number} [options.admin_id] - 筛选指定客服的会话
   * @param {string} [options.search] - 搜索关键词（用户昵称/手机号）
   * @param {string} [options.sort_by='updated_at'] - 排序字段
   * @param {string} [options.sort_order='DESC'] - 排序方向
   * @returns {Promise<Object>} 会话列表结果
   * @returns {Array} result.sessions - 会话列表
   * @returns {Object} result.pagination - 分页信息
   *
   * @throws {Error} 当查询失败时抛出错误
   *
   * @example
   * const result = await AdminCustomerServiceService.getSessionList({
   *   page: 1,
   *   page_size: 20,
   *   status: 'active',
   *   sort_by: 'created_at',
   *   sort_order: 'DESC'
   * });
   */
  static async getSessionList(options) {
    try {
      logger.info('管理员获取会话列表', {
        page: options.page,
        status: options.status,
        admin_id: options.admin_id
      })

      // 🎯 使用初始化时注入的依赖
      const CustomerServiceSessionService = this._dependencies.customerServiceSession

      // 🎯 调用底层服务方法
      const result = await CustomerServiceSessionService.getSessionList(options)

      logger.info('会话列表查询成功', {
        total_sessions: result.pagination.total,
        page: result.pagination.page
      })

      return result
    } catch (error) {
      logger.error('获取会话列表失败', {
        error: error.message,
        stack: error.stack,
        options
      })
      throw error
    }
  }

  /**
   * 获取会话统计
   *
   * @description
   * 整合CustomerServiceSessionService的getSessionStats方法，获取会话统计信息。
   * 统计待处理、进行中、已关闭等各状态的会话数量。
   *
   * 业务场景：
   * - 管理员查看整体客服工作负载
   * - 查看特定客服的工作量统计
   * - 监控客服响应效率
   *
   * @param {number} [adminId] - 指定客服ID（可选，不指定则返回全部统计）
   * @returns {Promise<Object>} 统计信息
   * @returns {number} result.total - 总会话数
   * @returns {number} result.waiting - 待处理会话数
   * @returns {number} result.active - 进行中会话数
   * @returns {number} result.closed - 已关闭会话数
   *
   * @throws {Error} 当统计失败时抛出错误
   *
   * @example
   * const stats = await AdminCustomerServiceService.getSessionStats();
   * // 或查看特定客服的统计
   * const statsForAdmin = await AdminCustomerServiceService.getSessionStats(10001);
   */
  static async getSessionStats(adminId = undefined) {
    try {
      logger.info('管理员获取会话统计', {
        admin_id: adminId
      })

      // 🎯 使用初始化时注入的依赖
      const CustomerServiceSessionService = this._dependencies.customerServiceSession

      // 🎯 调用底层服务方法
      const stats = await CustomerServiceSessionService.getSessionStats(adminId)

      logger.info('会话统计查询成功', {
        total: stats.total,
        admin_id: adminId
      })

      return stats
    } catch (error) {
      logger.error('获取会话统计失败', {
        error: error.message,
        stack: error.stack,
        admin_id: adminId
      })
      throw error
    }
  }

  /**
   * 获取会话消息
   *
   * @description
   * 整合CustomerServiceSessionService的getSessionMessages方法，获取指定会话的消息历史。
   * 支持分页加载（通过before_message_id实现向上滚动加载更多）。
   *
   * 业务场景：
   * - 管理员查看会话聊天记录
   * - 向上滚动加载历史消息
   * - 审查会话内容
   *
   * @param {number} sessionId - 会话ID
   * @param {Object} options - 查询选项
   * @param {number} [options.limit=50] - 消息数量限制
   * @param {number} [options.before_message_id] - 加载指定消息之前的历史（分页）
   * @returns {Promise<Object>} 会话详情和消息列表
   * @returns {Object} result.session - 会话信息
   * @returns {Array} result.messages - 消息列表
   * @returns {boolean} result.has_more - 是否有更多历史消息
   *
   * @throws {Error} 当会话不存在时抛出错误（message: '会话不存在'）
   *
   * @example
   * const result = await AdminCustomerServiceService.getSessionMessages(123, {
   *   page_size: 50
   * });
   * // 加载更多历史消息
   * const more = await AdminCustomerServiceService.getSessionMessages(123, {
   *   page_size: 50,
   *   before_message_id: result.messages[0].chat_message_id
   * });
   */
  static async getSessionMessages(sessionId, options = {}) {
    try {
      logger.info('管理员获取会话消息', {
        session_id: sessionId,
        page_size: options.page_size ?? options.limit
      })

      // 🎯 使用初始化时注入的依赖
      const CustomerServiceSessionService = this._dependencies.customerServiceSession

      // 🎯 调用底层服务方法
      const result = await CustomerServiceSessionService.getSessionMessages(sessionId, options)

      logger.info('会话消息查询成功', {
        session_id: sessionId,
        message_count: result.messages.length
      })

      return result
    } catch (error) {
      logger.error('获取会话消息失败', {
        error: error.message,
        stack: error.stack,
        session_id: sessionId
      })
      throw error
    }
  }

  /**
   * 发送消息
   *
   * @description
   * 整合CustomerServiceSessionService的sendMessage方法，管理员发送消息给用户。
   * 支持文本消息、图片消息、系统消息等多种类型。
   *
   * 业务场景：
   * - 管理员回复用户咨询
   * - 发送系统通知
   * - 发送图片等富媒体内容
   *
   * @param {number} sessionId - 会话ID
   * @param {Object} messageData - 消息数据
   * @param {number} messageData.admin_id - 管理员ID
   * @param {string} messageData.content - 消息内容（必填）
   * @param {string} [messageData.message_type='text'] - 消息类型（text/image/system）
   * @param {number} messageData.role_level - 管理员权限等级
   * @returns {Promise<Object>} 发送结果
   * @returns {Object} result.message - 已发送的消息对象
   * @returns {Object} result.session - 更新后的会话对象
   *
   * @throws {Error} 当会话不存在时抛出错误（message: '会话不存在'）
   * @throws {Error} 当权限不足时抛出错误（message: '无权限操作此会话'）
   * @throws {Error} 当内容包含敏感词时抛出错误
   * @throws {Error} 当发送过于频繁时抛出错误
   *
   * @example
   * const result = await AdminCustomerServiceService.sendMessage(123, {
   *   admin_id: 10001,
   *   content: '您好，有什么可以帮您的吗？',
   *   message_type: 'text',
   *   role_level: 2
   * });
   */
  static async sendMessage(sessionId, messageData) {
    try {
      logger.info('管理员发送消息', {
        session_id: sessionId,
        admin_id: messageData.admin_id,
        message_type: messageData.message_type
      })

      // 🎯 使用初始化时注入的依赖
      const CustomerServiceSessionService = this._dependencies.customerServiceSession

      // 🎯 调用底层服务方法
      const result = await CustomerServiceSessionService.sendMessage(sessionId, messageData)

      logger.info('消息发送成功', {
        session_id: sessionId,
        chat_message_id: result.message.chat_message_id
      })

      return result
    } catch (error) {
      logger.error('发送消息失败', {
        error: error.message,
        stack: error.stack,
        session_id: sessionId,
        admin_id: messageData.admin_id
      })
      throw error
    }
  }

  /**
   * 标记消息已读
   *
   * @description
   * 整合CustomerServiceSessionService的markSessionAsRead方法，标记会话中用户发送的消息为已读。
   *
   * 业务场景：
   * - 管理员查看会话后标记已读
   * - 清除未读消息计数
   * - 更新会话最后查看时间
   *
   * @param {number} sessionId - 会话ID
   * @param {number} adminId - 管理员ID
   * @returns {Promise<Object>} 操作结果
   * @returns {boolean} result.success - 操作是否成功
   * @returns {number} result.marked_count - 标记已读的消息数量
   *
   * @throws {Error} 当会话不存在时抛出错误（message: '会话不存在'）
   * @throws {Error} 当无权限操作时抛出错误（message: '无权限操作此会话'）
   *
   * @example
   * const result = await AdminCustomerServiceService.markSessionAsRead(123, 10001);
   */
  static async markSessionAsRead(sessionId, adminId) {
    try {
      logger.info('管理员标记会话已读', {
        session_id: sessionId,
        admin_id: adminId
      })

      // 🎯 使用初始化时注入的依赖
      const CustomerServiceSessionService = this._dependencies.customerServiceSession

      // 🎯 调用底层服务方法
      const result = await CustomerServiceSessionService.markSessionAsRead(sessionId, adminId)

      logger.info('会话标记已读成功', {
        session_id: sessionId,
        marked_count: result.marked_count
      })

      return result
    } catch (error) {
      logger.error('标记会话已读失败', {
        error: error.message,
        stack: error.stack,
        session_id: sessionId,
        admin_id: adminId
      })
      throw error
    }
  }

  /**
   * 转接会话
   *
   * @description
   * 整合CustomerServiceSessionService的transferSession方法，将会话转接给其他客服。
   *
   * 业务场景：
   * - 客服下班时转接给其他客服
   * - 专业问题转接给资深客服
   * - 工作负载均衡调整
   *
   * @param {number} sessionId - 会话ID
   * @param {number} currentAdminId - 当前客服ID
   * @param {number} targetAdminId - 目标客服ID
   * @returns {Promise<Object>} 操作结果
   * @returns {boolean} result.success - 操作是否成功
   * @returns {Object} result.session - 更新后的会话对象
   * @returns {Object} result.message - 自动发送的转接通知消息
   *
   * @throws {Error} 当会话不存在时抛出错误（message: '会话不存在'）
   * @throws {Error} 当目标客服不存在时抛出错误（message: '目标客服不存在'）
   * @throws {Error} 当无权限转接时抛出错误（message: '无权限转接此会话'）
   *
   * @example
   * const result = await AdminCustomerServiceService.transferSession(123, 10001, 10002);
   */
  static async transferSession(sessionId, currentAdminId, targetAdminId) {
    try {
      logger.info('管理员转接会话', {
        session_id: sessionId,
        current_admin_id: currentAdminId,
        target_admin_id: targetAdminId
      })

      // 🎯 使用初始化时注入的依赖
      const CustomerServiceSessionService = this._dependencies.customerServiceSession

      // 🎯 调用底层服务方法
      const result = await CustomerServiceSessionService.transferSession(
        sessionId,
        currentAdminId,
        targetAdminId
      )

      logger.info('会话转接成功', {
        session_id: sessionId,
        from_admin: currentAdminId,
        to_admin: targetAdminId
      })

      return result
    } catch (error) {
      logger.error('转接会话失败', {
        error: error.message,
        stack: error.stack,
        session_id: sessionId,
        current_admin_id: currentAdminId,
        target_admin_id: targetAdminId
      })
      throw error
    }
  }

  /**
   * 关闭会话
   *
   * @description
   * 整合CustomerServiceSessionService的closeSession方法，关闭客服会话。
   *
   * 业务场景：
   * - 问题已解决，关闭会话
   * - 用户无响应，超时关闭
   * - 管理员主动结束会话
   *
   * @param {number} sessionId - 会话ID
   * @param {Object} closeData - 关闭数据
   * @param {number} closeData.admin_id - 管理员ID
   * @param {string} [closeData.close_reason='问题已解决'] - 关闭原因
   * @returns {Promise<Object>} 操作结果
   * @returns {boolean} result.success - 操作是否成功
   * @returns {Object} result.session - 更新后的会话对象
   * @returns {Object} result.message - 自动发送的关闭通知消息
   *
   * @throws {Error} 当会话不存在时抛出错误（message: '会话不存在'）
   * @throws {Error} 当无权限关闭时抛出错误（message: '无权限关闭此会话'）
   *
   * @example
   * const result = await AdminCustomerServiceService.closeSession(123, {
   *   admin_id: 10001,
   *   close_reason: '问题已解决'
   * });
   */
  static async closeSession(sessionId, closeData) {
    try {
      logger.info('管理员关闭会话', {
        session_id: sessionId,
        admin_id: closeData.admin_id,
        close_reason: closeData.close_reason
      })

      // 🎯 使用初始化时注入的依赖
      const CustomerServiceSessionService = this._dependencies.customerServiceSession

      // 🎯 调用底层服务方法
      const result = await CustomerServiceSessionService.closeSession(sessionId, closeData)

      logger.info('会话关闭成功', {
        session_id: sessionId,
        close_reason: closeData.close_reason
      })

      return result
    } catch (error) {
      logger.error('关闭会话失败', {
        error: error.message,
        stack: error.stack,
        session_id: sessionId,
        admin_id: closeData.admin_id
      })
      throw error
    }
  }

  /**
   * 更新管理员在线状态
   *
   * @description
   * 管理员客服工作台的在线状态管理，状态存储在 Redis 中（实时性要求高，无需持久化）。
   * 状态变更时通过 WebSocket 广播给其他在线管理员，实现状态实时同步。
   *
   * 业务场景：
   * - 管理员进入客服工作台 → 设置为 online
   * - 管理员暂时离开 → 设置为 busy
   * - 管理员退出客服工作台 → 设置为 offline
   * - 前端据此展示管理员在线状态、控制会话分配
   *
   * Redis Key 设计：cs:admin_status:{admin_id}
   * TTL：4小时（防止僵尸状态，管理员意外断连后自动过期）
   *
   * @param {number} admin_id - 管理员用户ID
   * @param {string} status - 在线状态（online / busy / offline）
   * @returns {Promise<Object>} { admin_id, status, updated_at }
   *
   * @throws {Error} BAD_REQUEST - 无效的状态值
   * @throws {Error} REDIS_ERROR - Redis 操作失败
   */
  static async updateAdminOnlineStatus(admin_id, status) {
    /* 允许的状态值白名单 */
    const VALID_STATUSES = ['online', 'busy', 'offline']

    if (!VALID_STATUSES.includes(status)) {
      const error = new Error(`无效的在线状态: ${status}，允许值: ${VALID_STATUSES.join('/')}`)
      error.code = 'BAD_REQUEST'
      error.statusCode = 400
      throw error
    }

    try {
      const redisClient = getRedisClient()
      const client = redisClient.getClient()

      const redisKey = `cs:admin_status:${admin_id}`
      const TTL_SECONDS = 4 * 60 * 60 // 4小时自动过期

      if (status === 'offline') {
        /* offline 直接删除 key，节省 Redis 内存 */
        await client.del(redisKey)
      } else {
        /* online / busy 写入 Redis 并设置 TTL */
        await client.set(redisKey, status, 'EX', TTL_SECONDS)
      }

      const updatedAt = new Date().toISOString()

      logger.info('管理员在线状态已更新', {
        admin_id,
        status,
        updated_at: updatedAt
      })

      return {
        admin_id,
        status,
        updated_at: updatedAt
      }
    } catch (error) {
      logger.error('更新管理员在线状态失败', {
        error: error.message,
        admin_id,
        status
      })
      throw error
    }
  }

  /**
   * 获取管理员在线状态
   *
   * @description
   * 从 Redis 批量查询管理员在线状态。未设置或已过期的管理员视为 offline。
   *
   * 业务场景：
   * - 客服工作台展示所有管理员的在线状态
   * - 会话分配时优先分配给 online 状态的管理员
   *
   * @param {number[]} admin_ids - 管理员用户ID数组
   * @returns {Promise<Array<{admin_id: number, status: string}>>} 管理员状态列表
   */
  static async getAdminOnlineStatuses(admin_ids) {
    try {
      if (!admin_ids || admin_ids.length === 0) {
        return []
      }

      const redisClient = getRedisClient()
      const client = redisClient.getClient()

      /* 批量查询 Redis（pipeline 模式） */
      const pipeline = client.pipeline()
      admin_ids.forEach(admin_id => {
        pipeline.get(`cs:admin_status:${admin_id}`)
      })
      const results = await pipeline.exec()

      return admin_ids.map((admin_id, index) => ({
        admin_id,
        status: results[index]?.[1] || 'offline' // Redis pipeline 返回 [error, value]
      }))
    } catch (error) {
      logger.error('获取管理员在线状态失败', {
        error: error.message,
        admin_ids
      })
      throw error
    }
  }
}

module.exports = AdminCustomerServiceService
