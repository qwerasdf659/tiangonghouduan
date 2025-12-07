/**
 * 数据脱敏工具类
 * 根据数据级别控制返回字段
 */

class DataSanitizer {
  /**
   * 公告数据脱敏
   * @param {Array} announcements - 公告列表
   * @param {string} level - 数据级别 (public/full)
   * @returns {Array} 脱敏后的数据
   */
  static sanitizeAnnouncements (announcements, level = 'public') {
    if (level === 'full') {
      // 管理员完整数据
      return announcements
    }

    // 用户端公开数据（脱敏）
    return announcements.map(ann => ({
      announcement_id: ann.announcement_id,
      title: ann.title,
      content: ann.content,
      type: ann.type,
      priority: ann.priority,
      created_at: ann.created_at,
      expires_at: ann.expires_at,
      view_count: ann.view_count,
      // 创建者信息脱敏
      creator: ann.creator
        ? {
          nickname: ann.creator.nickname,
          avatar: ann.creator.avatar
        }
        : null
    }))
  }

  /**
   * 用户数据脱敏
   * @param {Object} user - 用户对象
   * @param {string} level - 数据级别
   * @returns {Object} 脱敏后的用户数据
   */
  static sanitizeUser (user, level = 'public') {
    if (level === 'full') {
      return user
    }

    return {
      user_id: user.user_id,
      nickname: user.nickname,
      avatar: user.avatar
    }
  }
}

module.exports = DataSanitizer
