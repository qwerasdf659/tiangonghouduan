/**
 * 高级状态管理模块
 *
 * @file admin/src/modules/user/composables/advanced-status.js
 * @description 高级状态、风控配置、变更历史、概率调整
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { USER_ENDPOINTS } from '../../../api/user.js'
import { buildURL } from '../../../api/base.js'

/**
 * 高级状态管理状态
 * @returns {Object} 状态对象
 */
export function useAdvancedStatusState() {
  return {
    // ==================== 高级状态 ====================
    /** @type {Array} 高级状态用户列表 */
    premiumUsers: [],
    /** @type {Object} 高级状态筛选条件（手机号主导搜索） */
    premiumFilters: { mobile: '', is_valid: '', unlock_method: '' },
    /** @type {Object} 高级状态分页 - 单一对象模式 */
    premiumPagination: {
      page: 1,
      page_size: 20,
      total: 0
    },
    /** @type {Object} 高级状态统计 */
    premiumStats: { total: 0, active: 0, expired: 0, expiring_soon: 0 },
    /** @type {Object|null} 选中的高级状态用户 */
    selectedPremiumUser: null,

    // ==================== 风控配置 ====================
    /** @type {Array} 风控配置列表 */
    riskProfiles: [],
    /** @type {Object} 风控筛选条件 */
    riskFilters: { config_type: '', user_level: '', is_frozen: '' },
    /** @type {Object} 风控分页 - 单一对象模式 */
    riskPagination: {
      page: 1,
      page_size: 20,
      total: 0
    },
    /** @type {Array} 冻结用户列表 */
    frozenUsers: [],
    /** @type {Array} 风控等级配置 */
    riskLevels: [],
    /** @type {Object|null} 选中的风控配置 */
    selectedRiskProfile: null,
    /** @type {Object} 风控表单（手机号主导搜索） */
    riskForm: {
      mobile: '',
      daily_points_limit: 10000,
      single_transaction_limit: 1000,
      daily_lottery_limit: 100,
      freeze_reason: ''
    },

    // ==================== 变更历史 ====================
    /** @type {Array} 角色变更历史 */
    roleChangeHistory: [],
    /** @type {Object} 角色历史筛选条件（手机号主导搜索） */
    roleHistoryFilters: { mobile: '', operator_id: '', start_date: '', end_date: '' },
    /** @type {Object} 角色历史分页 - 单一对象模式 */
    roleHistoryPagination: {
      page: 1,
      page_size: 20,
      total: 0
    },
    /** @type {Array} 状态变更历史 */
    statusChangeHistory: [],
    /** @type {Object} 状态历史筛选条件（手机号主导搜索） */
    statusHistoryFilters: { mobile: '', operator_id: '', start_date: '', end_date: '' },
    /** @type {Object} 状态历史分页 - 单一对象模式 */
    statusHistoryPagination: {
      page: 1,
      page_size: 20,
      total: 0
    },

    // ==================== 概率调整 ====================
    /** @type {Object} 概率调整模态框数据 */
    probabilityModal: {
      user_id: null,
      user_nickname: '',
      mode: 'global',
      multiplier: 1,
      target_prize_id: '',
      custom_probability: 0,
      duration: 60,
      reason: ''
    }
  }
}

/**
 * 高级状态管理方法
 * @returns {Object} 方法对象
 */
export function useAdvancedStatusMethods() {
  return {
    // ==================== 高级状态管理 ====================

    /**
     * 加载高级状态用户列表
     */
    async loadPremiumUsers() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.premiumPagination.page)
        params.append('page_size', this.premiumPagination.page_size)
        // 手机号 → resolve 获取 user_id
        if (this.premiumFilters.mobile) {
          const user = await this.resolveUserByMobile(this.premiumFilters.mobile)
          if (!user) return
          params.append('user_id', user.user_id)
        }
        if (this.premiumFilters.is_valid) params.append('is_valid', this.premiumFilters.is_valid)
        if (this.premiumFilters.unlock_method)
          params.append('unlock_method', this.premiumFilters.unlock_method)

        const response = await this.apiGet(
          `${USER_ENDPOINTS.PREMIUM_LIST}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          // 后端返回 statuses 数组，直接使用后端字段名
          this.premiumUsers = response.data?.statuses || []
          if (response.data?.pagination) {
            // 后端返回 total_count，适配后端字段（只更新 total，total_pages 由 getter 计算）
            this.premiumPagination.total = response.data.pagination.total_count || 0
          }
        }
      } catch (error) {
        logger.error('加载高级状态失败:', error)
        this.premiumUsers = []
      }
    },

    /**
     * 切换高级状态分页
     * @param {number} page - 目标页码
     */
    changePremiumPage(page) {
      const totalPages =
        Math.ceil(this.premiumPagination.total / this.premiumPagination.page_size) || 1
      if (page < 1 || page > totalPages) return
      this.premiumPagination.page = page
      this.loadPremiumUsers()
    },

    /**
     * 加载高级状态统计
     */
    async loadPremiumStats() {
      try {
        const response = await this.apiGet(
          USER_ENDPOINTS.PREMIUM_STATUS_STATS,
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success && response.data) {
          // 后端返回 summary 对象，适配后端字段名
          const summary = response.data.summary || response.data
          this.premiumStats = {
            total: summary.total_records ?? summary.total ?? 0,
            active: summary.active_users ?? summary.active ?? 0,
            expired: summary.expired_users ?? summary.expired ?? 0,
            expiring_soon: summary.expiring_soon ?? 0
          }
        }
      } catch (error) {
        logger.error('加载高级状态统计失败:', error)
      }
    },

    /**
     * 查看高级状态详情
     * @param {Object} user - 用户对象
     */
    viewPremiumDetail(user) {
      this.selectedPremiumUser = user
      this.showModal('premiumDetailModal')
    },

    /**
     * 延长高级状态
     * @param {Object} user - 用户对象
     * @param {number} days - 延长天数
     */
    async extendPremium(user, days = 30) {
      await this.confirmAndExecute(
        `确定为用户延长 ${days} 天高级状态？`,
        async () => {
          const response = await this.apiCall(
            buildURL(USER_ENDPOINTS.PREMIUM_STATUS_EXTEND, { user_id: user.user_id }),
            { method: 'POST', data: { days } }
          )
          if (response?.success) {
            await this.loadPremiumUsers()
            await this.loadPremiumStats()
          }
        },
        { successMessage: '高级状态已延长' }
      )
    },

    /**
     * 撤销高级状态
     * @param {Object} user - 用户对象
     */
    async revokePremium(user) {
      await this.confirmAndExecute(
        `确定撤销用户「${user.nickname || user.user_id}」的高级状态？`,
        async () => {
          const response = await this.apiCall(
            buildURL(USER_ENDPOINTS.PREMIUM_STATUS_REVOKE, { user_id: user.user_id }),
            { method: 'POST' }
          )
          if (response?.success) {
            await this.loadPremiumUsers()
            await this.loadPremiumStats()
          }
        },
        { successMessage: '高级状态已撤销', confirmText: '确认撤销' }
      )
    },

    // ==================== 风控配置管理 ====================

    /**
     * 加载风控配置列表
     */
    async loadRiskProfiles() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.riskPagination.page)
        params.append('page_size', this.riskPagination.page_size)
        if (this.riskFilters.config_type) params.append('config_type', this.riskFilters.config_type)
        if (this.riskFilters.user_level) params.append('user_level', this.riskFilters.user_level)
        if (this.riskFilters.is_frozen) params.append('is_frozen', this.riskFilters.is_frozen)

        const response = await this.apiGet(
          `${USER_ENDPOINTS.RISK_PROFILE_LIST}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          // 后端返回 { list: [...], pagination: { total_count } }
          const list = response.data?.list || response.data?.profiles || []
          // 过滤掉可能的无效数据
          this.riskProfiles = list.filter(item => item && (item.user_risk_profile_id || item.user_id))
          if (response.data?.pagination) {
            // 只更新 total，total_pages 由 getter 计算
            this.riskPagination.total =
              response.data.pagination.total_count || response.data.pagination.total || 0
          }
        }
      } catch (error) {
        logger.error('加载风控配置失败:', error)
        this.riskProfiles = []
      }
    },

    /**
     * 切换风控配置分页
     * @param {number} page - 目标页码
     */
    changeRiskPage(page) {
      const totalPages = Math.ceil(this.riskPagination.total / this.riskPagination.page_size) || 1
      if (page < 1 || page > totalPages) return
      this.riskPagination.page = page
      this.loadRiskProfiles()
    },

    /**
     * 打开风控配置模态框
     * @param {Object|null} profile - 风控配置对象
     */
    openRiskModal(profile = null) {
      if (profile) {
        // 从 thresholds JSON 字段获取阈值，兼容旧字段格式
        const thresholds = profile.thresholds || {}
        this.riskForm = {
          mobile: '',
          _resolved_user_id: profile.user_id || '',
          user_level: profile.user_level || 'normal',
          daily_points_limit: thresholds.daily_points_limit || profile.daily_points_limit || 10000,
          single_transaction_limit:
            thresholds.single_transaction_limit || profile.single_transaction_limit || 1000,
          daily_lottery_limit: thresholds.daily_lottery_limit || profile.daily_lottery_limit || 100,
          freeze_reason: ''
        }
        this.selectedRiskProfile = profile
      } else {
        this.riskForm = {
          mobile: '',
          _resolved_user_id: '',
          user_level: 'normal',
          daily_points_limit: 10000,
          single_transaction_limit: 1000,
          daily_lottery_limit: 100,
          freeze_reason: ''
        }
        this.selectedRiskProfile = null
      }
      this.showModal('riskProfileModal')
    },

    /**
     * 提交风控配置
     */
    async submitRiskProfile() {
      // 等级配置不需要手机号/user_id，用户配置才需要
      const isLevelConfig = this.selectedRiskProfile?.config_type === 'level'
      if (!isLevelConfig && !this.riskForm.mobile && !this.riskForm._resolved_user_id) {
        this.showError('请输入手机号')
        return
      }

      // 新建时手机号 → resolve 获取 user_id；编辑时已有 _resolved_user_id
      let resolvedUserId = this.riskForm._resolved_user_id
      if (!isLevelConfig && this.riskForm.mobile && !resolvedUserId) {
        const user = await this.resolveUserByMobile(this.riskForm.mobile)
        if (!user) return
        resolvedUserId = user.user_id
      }

      try {
        this.saving = true
        // 使用后端实际主键字段名 user_risk_profile_id
        const profileId = this.selectedRiskProfile?.user_risk_profile_id

        // 构建提交数据，使用 thresholds JSON 格式（直接使用后端字段名）
        const submitData = {
          thresholds: {
            daily_points_limit: this.riskForm.daily_points_limit,
            single_transaction_limit: this.riskForm.single_transaction_limit,
            daily_lottery_limit: this.riskForm.daily_lottery_limit
          }
        }

        // 根据操作类型选择正确的后端端点和HTTP方法
        let url, method
        if (this.selectedRiskProfile) {
          // 编辑现有配置 → PUT /risk-profiles/:id（按记录ID更新）
          url = buildURL(USER_ENDPOINTS.RISK_PROFILE_UPDATE_BY_ID, { id: profileId })
          method = 'PUT'
        } else if (isLevelConfig) {
          // 创建等级默认配置 → POST /risk-profiles/levels
          submitData.user_level = this.riskForm.user_level || 'normal'
          url = USER_ENDPOINTS.RISK_PROFILE_LEVELS
          method = 'POST'
        } else {
          // 创建用户风控配置 → POST /risk-profiles/user/:user_id
          url = buildURL(USER_ENDPOINTS.RISK_PROFILE_USER, { user_id: resolvedUserId })
          method = 'POST'
        }

        // 编辑等级配置时需要 user_level
        if (isLevelConfig && this.selectedRiskProfile) {
          submitData.user_level = this.selectedRiskProfile.user_level
        }

        logger.info('[RiskProfile] 提交风控配置:', { url, method, isLevelConfig, profileId })

        const response = await this.apiCall(url, {
          method,
          data: submitData
        })

        if (response?.success) {
          this.showSuccess(this.selectedRiskProfile ? '风控配置已更新' : '风控配置已创建')
          this.hideModal('riskProfileModal')
          await this.loadRiskProfiles()
        }
      } catch (error) {
        this.showError('保存风控配置失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 冻结用户
     * @param {Object} profile - 风控配置对象
     */
    async freezeUser(profile) {
      await this.confirmAndExecute(
        `确定冻结用户「${profile.user_id}」？`,
        async () => {
          const response = await this.apiCall(
            buildURL(USER_ENDPOINTS.RISK_PROFILE_FREEZE, { user_id: profile.user_id }),
            { method: 'POST', data: { reason: this.riskForm.freeze_reason || '管理员操作' } }
          )
          if (response?.success) {
            await this.loadRiskProfiles()
          }
        },
        { successMessage: '用户已冻结', confirmText: '确认冻结' }
      )
    },

    /**
     * 解冻用户
     * @param {Object} profile - 风控配置对象
     */
    async unfreezeUser(profile) {
      await this.confirmAndExecute(
        `确定解冻用户「${profile.user_id}」？`,
        async () => {
          const response = await this.apiCall(
            buildURL(USER_ENDPOINTS.RISK_PROFILE_UNFREEZE, { user_id: profile.user_id }),
            { method: 'POST' }
          )
          if (response?.success) {
            await this.loadRiskProfiles()
          }
        },
        { successMessage: '用户已解冻' }
      )
    },

    // ==================== 变更历史 ====================

    /**
     * 加载角色变更历史
     */
    async loadRoleChangeHistory() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.roleHistoryPagination.page)
        params.append('page_size', this.roleHistoryPagination.page_size)
        // 手机号 → resolve 获取 user_id
        if (this.roleHistoryFilters.mobile) {
          const user = await this.resolveUserByMobile(this.roleHistoryFilters.mobile)
          if (user) params.append('user_id', user.user_id)
        }
        if (this.roleHistoryFilters.operator_id)
          params.append('operator_id', this.roleHistoryFilters.operator_id)
        if (this.roleHistoryFilters.start_date)
          params.append('start_date', this.roleHistoryFilters.start_date)
        if (this.roleHistoryFilters.end_date)
          params.append('end_date', this.roleHistoryFilters.end_date)

        const url = `${USER_ENDPOINTS.ROLE_CHANGE_HISTORY_LIST}?${params}`
        const response = await this.apiGet(url, {}, { showLoading: true })

        if (response?.success) {
          this.roleChangeHistory =
            response.data?.history || response.data?.list || response.data?.records || []
          if (response.data?.pagination) {
            // 只更新 total，total_pages 由 getter 计算
            this.roleHistoryPagination.total =
              response.data.pagination.total || response.data.pagination.total_count || 0
          }
          logger.info('[RoleHistory] 加载完成，记录数:', this.roleChangeHistory.length)
          // 显示刷新成功提示
          this.showSuccess &&
            this.showSuccess(`刷新成功，共 ${this.roleChangeHistory.length} 条记录`)
        } else {
          logger.warn('[RoleHistory] API返回失败:', response)
          this.showError(response?.message || '加载角色变更历史失败')
        }
      } catch (error) {
        logger.error('[RoleHistory] 加载角色变更历史异常:', error)
        this.showError('加载角色变更历史失败: ' + (error.message || '未知错误'))
        this.roleChangeHistory = []
      }
    },

    /**
     * 切换角色变更历史分页
     * @param {number} page - 目标页码
     */
    changeRoleHistoryPage(page) {
      const totalPages =
        Math.ceil(this.roleHistoryPagination.total / this.roleHistoryPagination.page_size) || 1
      if (page < 1 || page > totalPages) return
      this.roleHistoryPagination.page = page
      this.loadRoleChangeHistory()
    },

    /**
     * 加载状态变更历史
     */
    async loadStatusChangeHistory() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.statusHistoryPagination.page)
        params.append('page_size', this.statusHistoryPagination.page_size)
        // 手机号 → resolve 获取 user_id
        if (this.statusHistoryFilters.mobile) {
          const user = await this.resolveUserByMobile(this.statusHistoryFilters.mobile)
          if (user) params.append('user_id', user.user_id)
        }
        if (this.statusHistoryFilters.operator_id)
          params.append('operator_id', this.statusHistoryFilters.operator_id)
        if (this.statusHistoryFilters.start_date)
          params.append('start_date', this.statusHistoryFilters.start_date)
        if (this.statusHistoryFilters.end_date)
          params.append('end_date', this.statusHistoryFilters.end_date)

        const url = `${USER_ENDPOINTS.STATUS_CHANGE_HISTORY_LIST}?${params}`
        const response = await this.apiGet(url, {}, { showLoading: true })

        if (response?.success) {
          this.statusChangeHistory =
            response.data?.history || response.data?.list || response.data?.records || []
          if (response.data?.pagination) {
            // 只更新 total，total_pages 由 getter 计算
            this.statusHistoryPagination.total =
              response.data.pagination.total || response.data.pagination.total_count || 0
          }
          logger.info('[StatusHistory] 加载完成，记录数:', this.statusChangeHistory.length)
        } else {
          logger.warn('[StatusHistory] API返回失败:', response)
          this.showError(response?.message || '加载状态变更历史失败')
        }
      } catch (error) {
        logger.error('[StatusHistory] 加载状态变更历史异常:', error)
        this.showError('加载状态变更历史失败: ' + (error.message || '未知错误'))
        this.statusChangeHistory = []
      }
    },

    /**
     * 切换状态变更历史分页
     * @param {number} page - 目标页码
     */
    changeStatusHistoryPage(page) {
      const totalPages =
        Math.ceil(this.statusHistoryPagination.total / this.statusHistoryPagination.page_size) || 1
      if (page < 1 || page > totalPages) return
      this.statusHistoryPagination.page = page
      this.loadStatusChangeHistory()
    },

    // ==================== 概率调整 ====================

    /**
     * 打开概率调整模态框
     * @param {Object} user - 用户对象
     */
    openProbabilityModal(user) {
      this.probabilityModal = {
        user_id: user.user_id,
        user_nickname: user.nickname || `用户${user.user_id}`,
        mode: 'global',
        multiplier: 1,
        target_prize_id: '',
        custom_probability: 0,
        duration: 60,
        reason: ''
      }
      this.showModal('probabilityModal')
    },

    /**
     * 提交概率调整
     */
    async submitProbabilityAdjustment() {
      if (!this.probabilityModal.user_id) {
        this.showError('用户信息无效')
        return
      }

      try {
        this.saving = true
        const response = await this.apiCall(
          buildURL(USER_ENDPOINTS.ADJUST_PROBABILITY, {
            user_id: this.probabilityModal.user_id
          }),
          {
            method: 'POST',
            data: {
              mode: this.probabilityModal.mode,
              multiplier: this.probabilityModal.multiplier,
              target_prize_id: this.probabilityModal.target_prize_id || null,
              custom_probability: this.probabilityModal.custom_probability || null,
              duration_minutes: this.probabilityModal.duration,
              reason: this.probabilityModal.reason
            }
          }
        )

        if (response?.success) {
          this.showSuccess('概率调整已生效')
          this.hideModal('probabilityModal')
        }
      } catch (error) {
        this.showError('概率调整失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    // ==================== 辅助方法 ====================

    // ✅ 已删除 getUnlockMethodText / getRiskLevelText 映射函数
    // 中文显示名称由后端 attachDisplayNames 统一返回 unlock_method_display / risk_level_display 字段

    /**
     * 获取风控等级样式
     * @param {string} level - 风控等级代码
     * @returns {string} CSS类名
     */
    getRiskLevelClass(level) {
      const map = {
        low: 'bg-success',
        medium: 'bg-warning',
        high: 'bg-danger',
        critical: 'bg-dark'
      }
      return map[level] || 'bg-secondary'
    }
  }
}

export default { useAdvancedStatusState, useAdvancedStatusMethods }
