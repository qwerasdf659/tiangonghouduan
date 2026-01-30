/**
 * 用户抽奖档案模块
 *
 * @file admin/src/modules/lottery/composables/user-profile.js
 * @description 用户抽奖档案聚合数据管理，提供完整的用户抽奖行为视图
 * @version 1.0.0
 * @date 2026-01-28
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'
import { buildURL } from '../../../api/base.js'

/**
 * 用户抽奖档案状态
 * @returns {Object} 状态对象
 */
export function useUserProfileState() {
  return {
    /** @type {Object|null} 当前查看的用户档案 */
    userProfile: null,
    /** @type {Array} 用户抽奖历史 */
    userDrawHistory: [],
    /** @type {Object|null} 用户体验状态 */
    userExperienceState: null,
    /** @type {Object|null} 用户全局状态 */
    userGlobalState: null,
    /** @type {Array} 用户配额列表 */
    userQuotaList: [],
    /** @type {Object} 用户抽奖统计 */
    userDrawStats: {
      totalDraws: 0,
      totalWins: 0,
      winRate: 0,
      totalValue: 0,
      lastDrawTime: null
    },
    /** @type {boolean} 是否正在加载用户档案 */
    loadingUserProfile: false,
    /** @type {string} 搜索的用户ID */
    searchUserId: '',
    /** @type {string} 搜索的活动ID（可选） */
    searchCampaignId: '',
    /** @type {boolean} 是否显示用户档案模态框 */
    showUserProfileModal: false
  }
}

/**
 * 用户抽奖档案方法
 * @returns {Object} 方法对象
 */
export function useUserProfileMethods() {
  return {
    /**
     * 加载用户抽奖档案
     * 调用后端聚合 API 获取完整用户档案
     * @param {number|string} userId - 用户 ID
     * @param {number|string} [campaignId] - 活动 ID（可选）
     */
    async loadUserProfile(userId, campaignId = null) {
      if (!userId) {
        logger.warn('加载用户档案失败: 未提供用户ID')
        return
      }

      this.loadingUserProfile = true
      try {
        // 构建 API URL
        const url = buildURL(LOTTERY_ENDPOINTS.MONITORING_USER_PROFILE, { user_id: userId })
        const queryParams = campaignId ? `?campaign_id=${campaignId}` : ''

        logger.info('加载用户抽奖档案', { userId, campaignId })

        const response = await this.apiGet(
          `${url}${queryParams}`,
          {},
          { showLoading: false, showError: true }
        )

        if (response?.success && response.data) {
          const data = response.data

          // 设置用户基本信息
          this.userProfile = {
            user_id: data.user_id || userId,
            nickname: data.user?.nickname || data.nickname || `用户${userId}`,
            phone: data.user?.phone || data.phone || '-',
            register_time: data.user?.created_at || data.register_time || '-',
            user_type: data.user?.user_type || data.user_type || '-'
          }

          // 设置抽奖统计
          const stats = data.stats || data.draw_stats || {}
          this.userDrawStats = {
            totalDraws: stats.total_draws || stats.totalDraws || 0,
            totalWins: stats.total_wins || stats.totalWins || 0,
            winRate: stats.win_rate || stats.winRate || 0,
            totalValue: stats.total_value || stats.totalValue || 0,
            lastDrawTime: stats.last_draw_time || stats.lastDrawTime || null
          }

          // 设置抽奖历史
          this.userDrawHistory = (data.recent_draws || data.draw_history || []).map(draw => ({
            drawId: draw.draw_id || draw.lottery_draw_id,
            campaignName: draw.campaign_name || draw.campaign?.campaign_name || '-',
            prizeName: draw.prize_name || draw.result || '-',
            prizeType: draw.prize_type || '-',
            prizeValue: draw.prize_value || 0,
            isWin: draw.is_win ?? draw.prize_type !== 'empty',
            rewardTier: draw.reward_tier || '-',
            drawTime: draw.draw_time || draw.created_at || '-'
          }))

          // 设置体验状态
          this.userExperienceState = data.experience_state || null

          // 设置全局状态
          this.userGlobalState = data.global_state || null

          // 设置配额列表
          this.userQuotaList = data.quotas || []

          logger.info('用户档案加载完成', {
            userId,
            totalDraws: this.userDrawStats.totalDraws,
            historyCount: this.userDrawHistory.length
          })
        } else {
          logger.warn('加载用户档案失败', { response })
          this._resetUserProfile()
        }
      } catch (error) {
        logger.error('加载用户档案异常:', error)
        this._resetUserProfile()
        // 显示错误提示
        if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
          Alpine.store('notification').error('加载用户档案失败: ' + (error.message || '未知错误'))
        }
      } finally {
        this.loadingUserProfile = false
      }
    },

    /**
     * 搜索用户档案
     * 根据输入的用户ID加载档案
     */
    async searchUserProfile() {
      const userId = this.searchUserId?.toString().trim()
      if (!userId) {
        if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
          Alpine.store('notification').warning('请输入用户ID')
        }
        return
      }

      await this.loadUserProfile(userId, this.searchCampaignId || null)

      if (this.userProfile) {
        this.showUserProfileModal = true
      }
    },

    /**
     * 打开用户档案模态框
     * @param {number|string} userId - 用户 ID
     */
    async openUserProfileModal(userId) {
      this.searchUserId = userId?.toString() || ''
      await this.loadUserProfile(userId)
      this.showUserProfileModal = true
    },

    /**
     * 关闭用户档案模态框
     */
    closeUserProfileModal() {
      this.showUserProfileModal = false
    },

    /**
     * 重置用户档案数据
     * @private
     */
    _resetUserProfile() {
      this.userProfile = null
      this.userDrawHistory = []
      this.userExperienceState = null
      this.userGlobalState = null
      this.userQuotaList = []
      this.userDrawStats = {
        totalDraws: 0,
        totalWins: 0,
        winRate: 0,
        totalValue: 0,
        lastDrawTime: null
      }
    },

    /**
     * 获取体验阶段显示文本
     * @param {string} phase - 体验阶段代码
     * @returns {string} 显示文本
     */
    getProfilePhaseText(phase) {
      const map = {
        newcomer: '🌱 新手期',
        growth: '📈 成长期',
        mature: '🌟 成熟期',
        decline: '📉 衰退期',
        churn_risk: '⚠️ 流失风险'
      }
      return map[phase] || phase || '-'
    },

    /**
     * 获取体验阶段样式类
     * @param {string} phase - 体验阶段代码
     * @returns {string} CSS 类名
     */
    getProfilePhaseClass(phase) {
      const map = {
        newcomer: 'bg-blue-100 text-blue-700',
        growth: 'bg-green-100 text-green-700',
        mature: 'bg-purple-100 text-purple-700',
        decline: 'bg-yellow-100 text-yellow-700',
        churn_risk: 'bg-red-100 text-red-700'
      }
      return map[phase] || 'bg-gray-100 text-gray-700'
    },

    /**
     * 获取奖品档位显示文本
     * @param {string} tier - 档位代码
     * @returns {string} 显示文本
     */
    getProfileTierText(tier) {
      const map = {
        high: '🏆 高档奖品',
        mid: '🥈 中档奖品',
        low: '🥉 低档奖品',
        fallback: '🎁 保底奖品',
        empty: '💨 未中奖'
      }
      return map[tier] || tier || '-'
    },

    /**
     * 格式化用户档案时间
     * @param {string} dateStr - ISO 日期字符串
     * @returns {string} 格式化的时间字符串
     */
    formatProfileTime(dateStr) {
      if (!dateStr) return '-'
      try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return dateStr
        return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      } catch {
        return dateStr
      }
    }
  }
}

export default { useUserProfileState, useUserProfileMethods }
