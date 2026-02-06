/**
 * 配额管理模块
 *
 * @file admin/src/modules/lottery/composables/quota.js
 * @description 配额规则的 CRUD 操作和使用统计
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'
import { buildURL } from '../../../api/base.js'

/**
 * 配额管理状态
 * @description 后端设计原则（lottery-quota.js 路由注释）：
 *   - 规则只能创建和禁用，不能编辑（版本化，保留历史审计）
 *   - 禁止修改 limit_value 等核心字段
 *   - 需要变更配额时：创建新规则 + 禁用旧规则
 *
 * 后端实际字段:
 *   - rule_type: 规则类型 (global/campaign/role/user)
 *   - lottery_campaign_id: 活动ID (campaign类型必填)
 *   - role_uuid: 角色UUID (role类型必填)
 *   - target_user_id: 目标用户ID (user类型必填)
 *   - limit_value: 每日抽奖次数上限
 * @returns {Object} 状态对象
 */
export function useQuotaState() {
  return {
    /** @type {Array} 配额规则列表 */
    quotas: [],
    /** @type {Object} 配额规则表单 - 使用后端字段 */
    quotaForm: {
      rule_type: 'campaign', // global/campaign/role/user
      campaign_id: '', // 活动ID（campaign类型必填，从下拉选择）
      role_uuid: '', // 角色UUID（role类型必填）
      target_user_id: '', // 目标用户ID（user类型必填）
      limit_value: 10, // 每日抽奖次数上限
      reason: '' // 创建原因
    },
    /** @type {Object} 配额筛选条件 */
    quotaFilters: { rule_type: '', status: '', campaign_id: '' },
    /** @type {Object} 配额统计 */
    quotaStats: { totalRules: 0, activeRules: 0 },
    /** @type {Array} 配额使用情况 */
    quotaUsage: [],
    /** @type {string} 用户配额检查ID */
    quotaCheckUserId: '',
    /** @type {Object|null} 用户配额检查结果 */
    userQuotaCheckResult: null,
    /** @type {Object} 配额统计 */
    quotaStatistics: { totalRules: 0, activeRules: 0 }
  }
}

/**
 * 配额管理方法
 * @returns {Object} 方法对象
 */
export function useQuotaMethods() {
  return {
    /**
     * 加载配额规则列表
     * @description 使用后端字段: rule_id, scope_type, scope_id, window_type, limit_value, priority, status
     * @description apiGet 返回的是 response.data（已解包），不是完整响应对象
     */
    async loadQuotas() {
      try {
        logger.debug('[Quota] loadQuotas 开始执行')
        const params = new URLSearchParams()
        // 使用后端字段: rule_type, is_active, campaign_id
        if (this.quotaFilters?.rule_type) {
          params.append('rule_type', this.quotaFilters.rule_type)
        }
        if (this.quotaFilters?.status) {
          params.append('is_active', this.quotaFilters.status === 'active' ? 'true' : 'false')
        }
        if (this.quotaFilters?.campaign_id) {
          params.append('campaign_id', this.quotaFilters.campaign_id)
        }

        const queryStr = params.toString()
        const url = queryStr
          ? `${LOTTERY_ENDPOINTS.QUOTA_RULE_LIST}?${queryStr}`
          : LOTTERY_ENDPOINTS.QUOTA_RULE_LIST

        // apiGet 通过 withLoading 包装，返回 { success: true, data: {...} }
        const response = await this.apiGet(url, {}, { showLoading: false })
        logger.debug('[Quota] API 返回数据:', response)

        // 解包 withLoading 返回的结构
        const data = response?.success ? response.data : response
        logger.debug('[Quota] 解包后数据:', data)

        if (data) {
          this.quotas = data.rules || data.list || data || []
          this.quotaStats = this.generateQuotaStats(this.quotas)
          logger.debug('[Quota] 数据加载完成, quotas:', this.quotas.length)
        }
      } catch (error) {
        logger.error('[Quota] loadQuotas 失败:', error)
        this.quotas = []
        this.quotaStats = { totalRules: 0, activeRules: 0 }
      }
    },

    /**
     * 生成配额统计
     * @param {Array} quotas - 配额规则列表
     * @returns {Object} 统计对象
     */
    generateQuotaStats(quotas) {
      const totalRules = quotas.length
      const activeRules = quotas.filter(q => q.status === 'active').length

      return { totalRules, activeRules }
    },

    /**
     * 加载配额使用情况
     * @description apiGet 返回的是 response.data（已解包），不是完整响应对象
     */
    async loadQuotaUsage() {
      try {
        // apiGet 返回的是 response.data，不是完整 response 对象
        const data = await this.apiGet(
          LOTTERY_ENDPOINTS.QUOTA_STATISTICS,
          {},
          { showLoading: false }
        )
        // data 直接就是 response.data 的内容
        if (data) {
          this.quotaUsage = data.usage || data || []
        }
      } catch (error) {
        logger.error('加载配额使用情况失败:', error)
        this.quotaUsage = []
      }
    },

    /**
     * 检查用户配额
     * @description apiGet 返回的是 response.data（已解包），不是完整响应对象
     */
    async checkUserQuota() {
      if (!this.quotaCheckUserId) {
        this.showError('请输入用户ID')
        return
      }
      try {
        // apiGet 返回的是 response.data，不是完整 response 对象
        const data = await this.apiGet(
          buildURL(LOTTERY_ENDPOINTS.QUOTA_USER_CHECK, { user_id: this.quotaCheckUserId }),
          {},
          { showLoading: true }
        )
        // data 直接就是 response.data 的内容
        if (data) {
          this.userQuotaCheckResult = data
          this.showSuccess('配额检查完成')
        }
      } catch (error) {
        logger.error('检查用户配额失败:', error)
        this.showError('检查用户配额失败')
      }
    },

    /**
     * 打开创建配额规则模态框
     * 活动列表从 this.campaigns 获取（由 campaigns.js 加载）
     *
     * 后端设计：规则只能创建和禁用，不能编辑（版本化，保留审计历史）
     * 需要变更配额时：创建新规则 + 禁用旧规则
     */
    openCreateQuotaModal() {
      // 使用后端字段名
      this.quotaForm = {
        rule_type: 'campaign',
        campaign_id: this.campaigns?.[0]?.lottery_campaign_id || '',
        role_uuid: '',
        target_user_id: '',
        limit_value: 10,
        reason: ''
      }
      this.showModal('quotaModal')
    },

    /**
     * 提交配额规则表单（仅创建）
     * 后端设计：规则只能创建不能编辑，需要变更时创建新规则 + 禁用旧规则
     * 后端字段: rule_type, lottery_campaign_id, role_uuid, target_user_id, limit_value, reason
     */
    async submitQuotaForm() {
      // 验证限制次数
      if (!this.quotaForm.limit_value || this.quotaForm.limit_value <= 0) {
        this.showError('请输入有效的限制次数（正整数）')
        return
      }

      // 根据规则类型验证必填参数
      const ruleType = this.quotaForm.rule_type
      if (ruleType === 'campaign' && !this.quotaForm.campaign_id) {
        this.showError('请选择活动')
        return
      }
      if (ruleType === 'role' && !this.quotaForm.role_uuid) {
        this.showError('请输入角色UUID')
        return
      }
      if (ruleType === 'user' && !this.quotaForm.target_user_id) {
        this.showError('请输入目标用户ID')
        return
      }

      try {
        this.saving = true

        // 构建提交数据（只发送后端需要的字段）
        const submitData = {
          rule_type: this.quotaForm.rule_type,
          limit_value: parseInt(this.quotaForm.limit_value)
        }

        // 根据规则类型添加对应字段（使用后端字段名）
        if (ruleType === 'campaign') {
          submitData.lottery_campaign_id = parseInt(this.quotaForm.campaign_id)
        } else if (ruleType === 'role') {
          submitData.role_uuid = this.quotaForm.role_uuid
        } else if (ruleType === 'user') {
          submitData.target_user_id = parseInt(this.quotaForm.target_user_id)
        }

        if (this.quotaForm.reason) {
          submitData.reason = this.quotaForm.reason
        }

        // 后端只支持 POST 创建，不支持 PUT 编辑
        await this.apiCall(LOTTERY_ENDPOINTS.QUOTA_RULE_CREATE, {
          method: 'POST',
          data: submitData
        })

        this.showSuccess('规则创建成功')
        this.hideModal('quotaModal')
        await this.loadQuotas()
      } catch (error) {
        this.showError('创建规则失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 删除配额规则
     * @param {Object} quota - 配额规则对象
     */
    /**
     * 删除（禁用）配额规则
     * 后端设计：规则只能禁用不能删除，保留审计历史
     * 使用 PUT /rules/:id/disable 接口
     */
    async deleteQuota(quota) {
      await this.confirmAndExecute(
        '确认禁用此配额规则？（规则将被禁用而非删除，以保留审计记录）',
        async () => {
          await this.apiCall(
            buildURL(LOTTERY_ENDPOINTS.QUOTA_RULE_DISABLE, { id: quota.lottery_draw_quota_rule_id }),
            { method: 'PUT' }
          )
          await this.loadQuotas()
        },
        { successMessage: '规则已禁用' }
      )
    },

    /**
     * 切换配额规则状态（禁用）
     * @param {Object} quota - 配额规则对象
     */
    async toggleQuotaStatus(quota) {
      try {
        await this.apiCall(
          buildURL(LOTTERY_ENDPOINTS.QUOTA_RULE_DISABLE, { id: quota.lottery_draw_quota_rule_id }),
          { method: 'PUT' }
        )
        this.showSuccess('规则已禁用')
        await this.loadQuotas()
      } catch (error) {
        this.showError('切换规则状态失败')
      }
    },

    /**
     * 获取作用域类型文本
     * @param {string} type - 作用域类型代码
     * @returns {string} 作用域类型文本
     */
    // ✅ 已删除 getScopeTypeText 映射函数 - 改用后端 _display 字段（P2 中文化）

    /**
     * 获取窗口类型文本
     * @param {string} type - 窗口类型代码
     * @returns {string} 窗口类型文本
     */
    // ✅ 已删除 getWindowTypeText 映射函数 - 改用后端 _display 字段（P2 中文化）

    /**
     * 根据scope_id获取活动名称
     * @param {string|number} scopeId - 活动ID（scope_id字段值）
     * @returns {string} 活动名称或ID
     */
    getQuotaCampaignName(scopeId) {
      if (!scopeId || scopeId === 'global') return '-'
      const campaignId = parseInt(scopeId)
      const campaign = this.campaigns?.find(c => c.campaign_id === campaignId)
      return campaign ? `${campaign.campaign_name} (#${campaignId})` : `活动 #${campaignId}`
    }
  }
}

export default { useQuotaState, useQuotaMethods }
