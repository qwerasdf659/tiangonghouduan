/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 反馈管理服务（FeedbackService）
 *
 * 业务场景：管理用户反馈的完整生命周期，包括反馈查询、回复、状态管理等
 *
 * 核心功能：
 * 1. 反馈查询管理（列表查询、条件筛选、关联查询）
 * 2. 反馈回复管理（管理员回复、时间记录）
 * 3. 反馈状态管理（状态更新、内部备注）
 *
 * 业务流程：
 *
 * 1. **反馈查询流程**
 *    - 根据条件查询反馈列表 → 关联用户和管理员信息 → 返回反馈数据
 *
 * 2. **反馈回复流程**
 *    - 查询反馈存在性 → 更新回复内容和时间 → 更新状态为已回复
 *
 * 3. **状态更新流程**
 *    - 查询反馈存在性 → 更新状态和内部备注 → 记录更新时间
 *
 * 设计原则：
 * - **数据统一**：所有反馈操作通过Service层统一处理
 * - **关联查询**：自动关联用户和管理员信息
 * - **时间记录**：记录回复时间和更新时间
 * - **状态管理**：严格管理反馈状态流转
 *
 * 关键方法列表：
 * - getFeedbackList(filters) - 获取反馈列表
 * - replyFeedback(feedbackId, replyContent, adminId, internalNotes) - 回复反馈
 * - updateFeedbackStatus(feedbackId, status, internalNotes) - 更新反馈状态
 *
 * 数据模型关联：
 * - Feedback：反馈表（核心数据：feedback_id、user_id、content、status）
 * - User：用户表（关联用户信息和管理员信息）
 *
 * 使用示例：
 * ```javascript
 * // 示例1：获取反馈列表
 * const feedbacks = await FeedbackService.getFeedbackList({
 *   status: 'pending',
 *   category: 'bug',
 *   priority: 'high',
 *   limit: 20,
 *   offset: 0
 * });
 *
 * // 示例2：回复反馈
 * await FeedbackService.replyFeedback(
 *   feedbackId,
 *   '感谢您的反馈，我们已经修复了这个问题。',
 *   adminUserId,
 *   '已通知开发团队'
 * );
 *
 * // 示例3：更新反馈状态
 * await FeedbackService.updateFeedbackStatus(
 *   feedbackId,
 *   'resolved',
 *   '问题已解决并验证'
 * );
 * ```
 *
 * 创建时间：2025年12月09日
 * 使用模型：Claude Sonnet 4.5
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const models = require('../models')

const logger = require('../utils/logger').logger

/**
 * 反馈管理服务类
 */
class FeedbackService {
  /**
   * 获取反馈列表
   *
   * @param {Object} filters - 筛选条件
   * @param {number|null} filters.user_id - 用户ID（用户端筛选）
   * @param {string|null} filters.status - 反馈状态（可选）
   * @param {string|null} filters.category - 反馈分类（可选）
   * @param {string|null} filters.priority - 优先级（可选）
   * @param {number} filters.limit - 查询数量限制（默认20）
   * @param {number} filters.offset - 查询偏移量（默认0）
   * @returns {Promise<Object>} 反馈列表和统计信息
   * @returns {Array<Object>} return.feedbacks - 反馈列表
   * @returns {number} return.total - 总数量
   */
  static async getFeedbackList (filters = {}) {
    try {
      const {
        user_id = null,
        status = null,
        category = null,
        priority = null,
        limit = 20,
        offset = 0
      } = filters

      logger.info('获取反馈列表', { filters })

      // 构建查询条件
      const whereClause = {}
      if (user_id) whereClause.user_id = user_id
      if (status && status !== 'all') whereClause.status = status
      if (category && category !== 'all') whereClause.category = category
      if (priority && priority !== 'all') whereClause.priority = priority

      // 查询反馈列表
      const feedbacks = await models.Feedback.findAll({
        where: whereClause,
        order: [
          ['priority', 'DESC'], // 高优先级优先
          ['created_at', 'DESC'] // 最新的优先显示
        ],
        limit: Math.min(parseInt(limit), 100),
        offset: parseInt(offset),
        include: [
          {
            model: models.User,
            as: 'user',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: models.User,
            as: 'admin',
            attributes: ['user_id', 'nickname'],
            required: false
          }
        ]
      })

      // 获取总数
      const total = await models.Feedback.count({
        where: whereClause
      })

      logger.info('获取反馈列表成功', {
        count: feedbacks.length,
        total
      })

      return {
        feedbacks: feedbacks.map(f => f.toJSON()),
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    } catch (error) {
      logger.error('获取反馈列表失败', { error: error.message })
      throw error
    }
  }

  /**
   * 创建用户反馈
   *
   * @param {Object} data - 反馈数据
   * @param {number} data.user_id - 用户ID
   * @param {string} data.category - 反馈分类
   * @param {string} data.content - 反馈内容
   * @param {string} data.priority - 优先级
   * @param {Array|null} data.attachments - 附件URLs
   * @param {string} data.user_ip - 用户IP
   * @param {Object} data.device_info - 设备信息
   * @returns {Promise<Object>} 创建的反馈对象
   */
  static async createFeedback (data) {
    try {
      const {
        user_id,
        category = 'other',
        content,
        priority = 'medium',
        attachments = null,
        user_ip,
        device_info
      } = data

      logger.info('创建用户反馈', {
        user_id,
        category,
        priority
      })

      // 参数验证
      if (!content || content.trim().length === 0) {
        throw new Error('反馈内容不能为空')
      }

      if (content.length > 5000) {
        throw new Error('反馈内容不能超过5000字符')
      }

      // 计算预计响应时间
      const calculateResponseTime = priority => {
        const hours = {
          high: 24,
          medium: 72,
          low: 168
        }
        return hours[priority] || 72
      }

      // 创建反馈记录
      const feedback = await models.Feedback.create({
        user_id,
        category,
        content: content.trim(),
        priority,
        attachments,
        user_ip,
        device_info,
        estimated_response_time: calculateResponseTime(priority),
        created_at: BeijingTimeHelper.createBeijingTime(),
        updated_at: BeijingTimeHelper.createBeijingTime()
      })

      logger.info('反馈创建成功', {
        feedback_id: feedback.feedback_id,
        user_id
      })

      return feedback.toJSON()
    } catch (error) {
      logger.error('创建反馈失败', {
        error: error.message,
        user_id: data.user_id
      })
      throw error
    }
  }

  /**
   * 回复用户反馈
   *
   * @param {number} feedbackId - 反馈ID
   * @param {string} replyContent - 回复内容
   * @param {number} adminId - 管理员ID
   * @param {string|null} internalNotes - 内部备注（可选）
   * @returns {Promise<Object>} 更新后的反馈对象
   */
  static async replyFeedback (feedbackId, replyContent, adminId, internalNotes = null) {
    try {
      logger.info('开始回复反馈', {
        feedback_id: feedbackId,
        admin_id: adminId
      })

      // 验证回复内容
      if (!replyContent || replyContent.trim().length === 0) {
        throw new Error('回复内容不能为空')
      }

      // 查询反馈
      const feedback = await models.Feedback.findByPk(feedbackId)
      if (!feedback) {
        throw new Error('反馈不存在')
      }

      // 更新反馈状态和回复
      await feedback.update({
        reply_content: replyContent.trim(),
        admin_id: adminId,
        replied_at: BeijingTimeHelper.createBeijingTime(),
        status: 'replied',
        internal_notes: internalNotes,
        updated_at: BeijingTimeHelper.createBeijingTime()
      })

      logger.info('反馈回复成功', {
        feedback_id: feedbackId,
        admin_id: adminId,
        user_id: feedback.user_id
      })

      return feedback.toJSON()
    } catch (error) {
      logger.error('回复反馈失败', {
        error: error.message,
        feedback_id: feedbackId
      })
      throw error
    }
  }

  /**
   * 获取单个反馈详情
   *
   * @param {number} feedbackId - 反馈ID
   * @returns {Promise<Object|null>} 反馈详情对象，不存在则返回null
   */
  static async getFeedbackById (feedbackId) {
    try {
      logger.info('获取反馈详情', { feedback_id: feedbackId })

      // 查询反馈详情（关联用户和管理员信息）
      const feedback = await models.Feedback.findByPk(feedbackId, {
        include: [
          {
            model: models.User,
            as: 'user',
            attributes: ['user_id', 'mobile', 'nickname']
          },
          {
            model: models.User,
            as: 'admin',
            attributes: ['user_id', 'nickname'],
            required: false
          }
        ]
      })

      if (!feedback) {
        logger.warn('反馈不存在', { feedback_id: feedbackId })
        return null
      }

      logger.info('获取反馈详情成功', {
        feedback_id: feedbackId,
        user_id: feedback.user_id
      })

      return feedback.toJSON()
    } catch (error) {
      logger.error('获取反馈详情失败', {
        error: error.message,
        feedback_id: feedbackId
      })
      throw error
    }
  }

  /**
   * 更新反馈状态
   *
   * @param {number} feedbackId - 反馈ID
   * @param {string} status - 新状态
   * @param {string|null} internalNotes - 内部备注（可选）
   * @returns {Promise<Object>} 更新后的反馈对象
   */
  static async updateFeedbackStatus (feedbackId, status, internalNotes = null) {
    try {
      logger.info('开始更新反馈状态', {
        feedback_id: feedbackId,
        new_status: status
      })

      // 查询反馈
      const feedback = await models.Feedback.findByPk(feedbackId)
      if (!feedback) {
        throw new Error('反馈不存在')
      }

      // 更新状态
      await feedback.update({
        status,
        internal_notes: internalNotes,
        updated_at: BeijingTimeHelper.createBeijingTime()
      })

      logger.info('反馈状态更新成功', {
        feedback_id: feedbackId,
        old_status: feedback.status,
        new_status: status
      })

      return feedback.toJSON()
    } catch (error) {
      logger.error('更新反馈状态失败', {
        error: error.message,
        feedback_id: feedbackId
      })
      throw error
    }
  }
}

module.exports = FeedbackService
