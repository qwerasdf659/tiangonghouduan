/**
 * 统一数据脱敏服务
 * 解决API数据安全风险分析报告中发现的38个安全风险点
 *
 * 核心原则：
 * - 管理员(dataLevel='full')：返回完整数据
 * - 普通用户(dataLevel='public')：返回脱敏安全数据
 */

class DataSanitizer {
  /**
   * 1. 抽奖奖品数据脱敏 - 解决概率泄露等极高风险问题
   */
  static sanitizePrizes (prizes, dataLevel) {
    if (dataLevel === 'full') {
      return prizes // 管理员看完整数据
    }

    return prizes.map(prize => ({
      id: prize.prize_id,
      name: prize.prize_name,
      type: prize.prize_type,
      icon: this.getPrizeIcon(prize.prize_type),
      rarity: this.calculateRarity(prize.prize_type), // 用稀有度替代概率
      available: prize.stock_quantity > 0, // 简化库存状态
      display_value: this.getDisplayValue(prize.prize_type),
      status: prize.status
      // ❌ 移除敏感字段：win_probability, stock_quantity, prize_value,
      // cost_points, max_daily_wins, daily_win_count
    }))
  }

  /**
   * 2. 库存管理数据脱敏 - 解决获取方式暴露等风险
   */
  static sanitizeInventory (inventory, dataLevel) {
    if (dataLevel === 'full') {
      return inventory // 管理员看完整数据
    }

    return inventory.map(item => ({
      id: item.id,
      item_name: item.item_name,
      item_type: item.item_type,
      source_display: this.getSourceDisplay(item.acquisition_method),
      status: item.status,
      can_use: item.can_use,
      can_transfer: item.can_transfer,
      expires_soon: this.checkExpiringSoon(item.expires_at),
      display_value: this.getDisplayValue(item.market_value),
      obtained_date: item.created_at ? item.created_at.split('T')[0] : null,
      transfer_count: item.transfer_count || 0
      // ❌ 移除敏感字段：acquisition_method, acquisition_cost, market_value,
      // transfer_history, usage_restrictions详情
    }))
  }

  /**
   * 3. 用户认证数据脱敏 - 解决JWT权限信息泄露
   */
  static sanitizeUser (user, dataLevel) {
    if (dataLevel === 'full') {
      return user // 管理员看完整数据
    }

    return {
      id: user.id,
      display_name: user.display_name || user.username,
      can_lottery: user.can_lottery !== false,
      can_exchange: user.can_exchange !== false,
      balance: user.points_balance || 0,
      avatar: user.avatar,
      member_since: user.created_at ? user.created_at.split('T')[0] : null
      // ❌ 移除敏感字段：role, permissions, admin_flags, detailed_stats
    }
  }

  /**
   * 4. 积分系统数据脱敏 - 解决经济模型泄露
   */
  static sanitizePoints (pointsData, dataLevel) {
    if (dataLevel === 'full') {
      return pointsData
    }

    return {
      balance: pointsData.balance,
      today_earned: pointsData.today_earned,
      can_draw: pointsData.balance >= (pointsData.draw_cost || 100),
      draw_available: Math.floor(pointsData.balance / (pointsData.draw_cost || 100))
      // ❌ 移除敏感字段：earning_rules, discount_rate, cost_per_draw详情
    }
  }

  /**
   * 5. 管理员统计数据脱敏 - 解决运营数据泄露
   */
  static sanitizeAdminStats (stats, dataLevel) {
    if (dataLevel === 'full') {
      return stats // 只有管理员能看到完整统计
    }

    // 普通用户不应该看到任何管理员统计数据
    return {
      message: '权限不足，无法访问统计数据'
    }
  }

  /**
   * 6. 图片上传响应脱敏 - 解决存储架构泄露
   */
  static sanitizeUpload (uploadData, dataLevel) {
    if (dataLevel === 'full') {
      return uploadData
    }

    return {
      success: uploadData.success,
      data: {
        image_url: uploadData.data?.image_url,
        upload_id: uploadData.data?.upload_id,
        file_size: uploadData.data?.file_size
        // ❌ 移除敏感字段：storage_info, bucket_name, access_key,
        // compression_ratio, processing_time
      }
    }
  }

  /**
   * 7. 聊天会话数据脱敏 - 解决用户隐私泄露
   */
  static sanitizeChatSessions (sessions, dataLevel) {
    if (dataLevel === 'full') {
      return sessions // 管理员看完整数据
    }

    return sessions.map(session => ({
      session_id: session.session_id,
      status: session.status,
      created_at: session.created_at,
      last_message_time: session.last_message_time,
      message_count: session.message_count || 0
      // ❌ 移除敏感字段：user_profile详情, admin_notes, conversation_summary
    }))
  }

  // ==================== 辅助方法 ====================

  static getPrizeIcon (prizeType) {
    const iconMap = {
      physical: '🎁',
      points: '💰',
      voucher: '🎫',
      discount: '💸'
    }
    return iconMap[prizeType] || '🎁'
  }

  static calculateRarity (prizeType) {
    // 用稀有度等级替代真实概率
    const rarityMap = {
      points: 'common', // 普通
      voucher: 'rare', // 稀有
      physical: 'legendary', // 传说
      discount: 'epic' // 史诗
    }
    return rarityMap[prizeType] || 'common'
  }

  static getDisplayValue (value) {
    if (typeof value === 'number') {
      if (value >= 1000) {
        return `价值约${Math.round(value / 1000)}千元`
      } else if (value > 0) {
        return `价值约${value}元`
      }
    }
    return '精品好礼'
  }

  static getSourceDisplay (acquisitionMethod) {
    const sourceMap = {
      lottery_preset: '抽奖获得',
      lottery_random: '抽奖获得',
      purchase: '购买获得',
      exchange: '兑换获得',
      admin_grant: '系统赠送',
      transfer: '转让获得'
    }
    return sourceMap[acquisitionMethod] || '其他方式'
  }

  static checkExpiringSoon (expiresAt) {
    if (!expiresAt) return false
    const now = new Date()
    const expireDate = new Date(expiresAt)
    const daysUntilExpire = Math.ceil((expireDate - now) / (1000 * 60 * 60 * 24))
    return daysUntilExpire <= 7 && daysUntilExpire > 0
  }

  /**
   * 8. WebSocket消息脱敏 - 解决实时数据泄露
   */
  static sanitizeWebSocketMessage (message, dataLevel) {
    if (dataLevel === 'full') {
      return message
    }

    const sanitized = { ...message }
    // 移除管理员专用的实时数据
    delete sanitized.real_time_stats
    delete sanitized.admin_notifications
    delete sanitized.probability_adjustments
    delete sanitized.system_metrics

    return sanitized
  }

  /**
   * 9. 日志数据脱敏 - 防止日志泄露敏感信息
   */
  static sanitizeLogs (logData) {
    if (typeof logData !== 'string') {
      logData = JSON.stringify(logData)
    }

    return logData
      .replace(/win_probability:\s*[\d.]+/g, 'win_probability: [HIDDEN]')
      .replace(/preset_type:\s*\w+/g, 'preset_type: [HIDDEN]')
      .replace(/cost_points:\s*\d+/g, 'cost_points: [HIDDEN]')
      .replace(/market_value:\s*[\d.]+/g, 'market_value: [HIDDEN]')
      .replace(/acquisition_cost:\s*\d+/g, 'acquisition_cost: [HIDDEN]')
  }
}

module.exports = DataSanitizer
