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
    /** @type {Array} 用户体验状态列表（后端返回 experience_states 数组） */
    userExperienceState: [],
    /** @type {Object|null} 用户全局状态 */
    userGlobalState: null,
    /** @type {Array} 用户配额列表 */
    userQuotaList: [],
    /** @type {Object} 用户抽奖统计 - 直接使用后端字段名 */
    userDrawStats: {
      total_draws: 0,
      total_wins: 0,
      win_rate: 0,
      total_cost_points: 0,
      last_draw_time: null
    },
    /** @type {boolean} 是否正在加载用户档案 */
    loadingUserProfile: false,
    /** @type {string} 搜索的手机号 */
    searchMobile: '',
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
        // 构建 API URL（后端参数名：lottery_campaign_id）
        const url = buildURL(LOTTERY_ENDPOINTS.MONITORING_USER_PROFILE, { user_id: userId })
        const queryParams = campaignId ? `?lottery_campaign_id=${campaignId}` : ''

        logger.info('加载用户抽奖档案', { userId, campaignId })

        const response = await this.apiGet(
          `${url}${queryParams}`,
          {},
          { showLoading: false, showError: true }
        )

        if (response?.success && response.data) {
          const data = response.data

          // 设置用户基本信息 - 直接使用后端字段名（mobile 非 phone）
          this.userProfile = {
            user_id: data.user_id || userId,
            nickname: data.user?.nickname || `用户${userId}`,
            mobile: data.user?.mobile || '-',
            created_at: data.user?.created_at || '-'
          }

          // 设置抽奖统计 - 直接使用后端字段名
          const stats = data.stats || {}
          this.userDrawStats = {
            total_draws: stats.total_draws || 0,
            total_wins: stats.total_wins || 0,
            win_rate: stats.win_rate || 0,
            total_cost_points: stats.total_cost_points || 0,
            last_draw_time: stats.last_draw_time || null
          }

          // 设置抽奖历史 - 直接使用后端字段名
          this.userDrawHistory = (data.recent_draws || []).map(draw => ({
            ...draw,
            // reward_tier 判断中奖：high/mid/low 为中奖，fallback 为保底
            is_win: draw.reward_tier && draw.reward_tier !== 'fallback'
          }))

          // 设置体验状态（后端返回 experience_states 数组）
          this.userExperienceState = data.experience_states || []

          // 设置全局状态
          this.userGlobalState = data.global_state || null

          // 设置配额列表
          this.userQuotaList = data.quotas || []

          logger.info('用户档案加载完成', {
            userId,
            total_draws: this.userDrawStats.total_draws,
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
     * 搜索用户档案（手机号主导）
     * 输入手机号 → resolve → 加载档案
     */
    async searchUserProfile() {
      const mobile = this.searchMobile?.toString().trim()
      if (!mobile) {
        if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
          Alpine.store('notification').warning('请输入手机号')
        }
        return
      }

      // 手机号 → resolve 获取 user_id
      const user = await this.resolveUserByMobile(mobile)
      if (!user) return

      await this.loadUserProfile(user.user_id, this.searchCampaignId || null)

      if (this.userProfile) {
        this.showUserProfileModal = true
      }
    },

    /**
     * 打开用户档案模态框
     * @param {number|string} userId - 用户 ID（从表格行点击传入）
     */
    async openUserProfileModal(userId) {
      this.searchMobile = ''
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
      this.userExperienceState = []
      this.userGlobalState = null
      this.userQuotaList = []
      this.userDrawStats = {
        total_draws: 0,
        total_wins: 0,
        win_rate: 0,
        total_cost_points: 0,
        last_draw_time: null
      }
    },

    /**
     * 获取体验阶段显示文本
     * @param {string} phase - 体验阶段代码
     * @returns {string} 显示文本
     */
    // ✅ 已删除 getProfilePhaseText 映射函数 - 改用后端 _display 字段（P2 中文化）

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
    // ✅ 已删除 getProfileTierText 映射函数 - 改用后端 _display 字段（P2 中文化）

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
