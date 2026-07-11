/**
 * 聊天限流记录清理任务（原定时任务25）
 *
 * 业务用途（定时任务统一管理改进 2026-01-30）：
 * - 迁移自 ChatRateLimitService.initCleanup() 中的 setInterval
 * - 清理内存中过期的用户消息时间戳、管理员消息时间戳、创建会话时间戳
 * - 内存级别操作，无需分布式锁
 * - 防止内存泄漏
 *
 * 调度频率：每10分钟（由 scripts/maintenance/scheduled_tasks.js 注册）
 *
 * 创建时间：2026-01-30
 * 任务体自 scripts/maintenance/scheduled_tasks.js 原样搬移（技术债务方案 7.4-1，2026-07-11）
 */

/**
 * 聊天限流记录清理任务类
 *
 * @class ChatRateLimitCleanup
 * @description 清理内存中过期的聊天限流时间戳记录
 */
class ChatRateLimitCleanup {
  /**
   * 执行限流记录清理
   *
   * @returns {Object} 清理报告（user_messages_cleaned/admin_messages_cleaned/create_session_cleaned/total_cleaned_entries）
   */
  static execute() {
    // 获取 ChatRateLimitService 实例并执行清理
    const ChatRateLimitService = require('../services/ChatRateLimitService')
    return ChatRateLimitService.performCleanup()
  }
}

module.exports = ChatRateLimitCleanup
