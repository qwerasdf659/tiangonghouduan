/**
 * 配额管理模块
 *
 * @file admin/src/modules/lottery/composables/quota.js
 * @description 配额规则的 CRUD 操作和使用统计
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery.js'
import { buildURL } from '../../../api/base.js'

/**
 * 配额管理状态
 * @description 使用后端实际字段 (lottery-quota.js):
 *   - rule_type: 规则类型 (global/campaign/role/user)
 *   - campaign_id: 活动ID (campaign类型必填)
 *   - role_uuid: 角色UUID (role类型必填)
 *   - target_user_id: 目标用户ID (user类型必填)
 *   - limit_value: 每日抽奖次数上限
 *   - effective_from/effective_to: 生效时间范围
 * @returns {Object} 状态对象
 */
export function useQuotaState() {
  return {
    /** @type {Array} 配额规则列表 */
    quotas: [],
    /** @type {Object} 配额规则表单 - 使用后端字段 */
    quotaForm: {
      rule_type: 'campaign',     // global/campaign/role/user
      campaign_id: '',           // 活动ID（campaign类型必填，从下拉选择）
      role_uuid: '',             // 角色UUID（role类型必填）
      target_user_id: '',        // 目标用户ID（user类型必填）
      limit_value: 10,           // 每日抽奖次数上限
      reason: ''                 // 创建原因
    },
    /** @type {number|string|null} 当前编辑的规则ID */
    editingQuotaId: null,
    /** @type {boolean} 是否编辑模式 */
    isEditQuota: false,
    /** @type {Object} 配额筛选条件 */
    quotaFilters: { ruleType: '', status: '', campaignId: '' },
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
        console.log('📊 [Quota] loadQuotas 开始执行')
        const params = new URLSearchParams()
        // 使用后端字段: rule_type, campaign_id, is_active
        if (this.quotaFilters?.ruleType) {
          params.append('rule_type', this.quotaFilters.ruleType)
        }
        if (this.quotaFilters?.status) {
          params.append('is_active', this.quotaFilters.status === 'active' ? 'true' : 'false')
        }
        if (this.quotaFilters?.campaignId) {
          params.append('campaign_id', this.quotaFilters.campaignId)
        }

        // apiGet 通过 withLoading 包装，返回 { success: true, data: {...} }
        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.QUOTA_RULES_LIST}?${params}`,
          {},
          { showLoading: false }
        )
        console.log('📊 [Quota] API 返回数据:', response)
        
        // 解包 withLoading 返回的结构
        const data = response?.success ? response.data : response
        console.log('📊 [Quota] 解包后数据:', data)
        
        if (data) {
          this.quotas = data.rules || data.list || data || []
          this.quotaStats = this.generateQuotaStats(this.quotas)
          logger.info(`加载配额规则成功，共 ${this.quotas.length} 条`)
          console.log('✅ [Quota] 数据加载完成, quotas:', this.quotas.length)
        }
      } catch (error) {
        logger.error('加载配额失败:', error)
        console.error('❌ [Quota] loadQuotas 失败:', error)
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
     */
    openCreateQuotaModal() {
      this.editingQuotaId = null
      this.isEditQuota = false
      // 使用后端字段名
      this.quotaForm = {
        rule_type: 'campaign',
        campaign_id: this.campaigns?.[0]?.campaign_id || '',  // 默认选第一个活动
        role_uuid: '',
        target_user_id: '',
        limit_value: 10,
        reason: ''
      }
      this.showModal('quotaModal')
    },

    /**
     * 编辑配额规则
     * @param {Object} quota - 配额规则对象（后端返回 scope_type/scope_id）
     */
    editQuota(quota) {
      this.editingQuotaId = quota.rule_id
      this.isEditQuota = true
      
      // 后端返回 scope_type/scope_id，需要转换为前端表单字段
      const scopeType = quota.scope_type || 'campaign'
      const scopeId = quota.scope_id || ''
      
      this.quotaForm = {
        rule_type: scopeType,
        campaign_id: scopeType === 'campaign' ? scopeId : '',
        role_uuid: scopeType === 'role' ? scopeId : '',
        target_user_id: scopeType === 'user' ? scopeId : '',
        limit_value: quota.limit_value || 10,
        reason: quota.reason || ''
      }
      this.showModal('quotaModal')
    },

    /**
     * 提交配额规则表单
     * 后端字段: rule_type, campaign_id, role_uuid, target_user_id, limit_value, reason
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
        
        // 根据规则类型添加对应字段
        if (ruleType === 'campaign') {
          submitData.campaign_id = parseInt(this.quotaForm.campaign_id)
        } else if (ruleType === 'role') {
          submitData.role_uuid = this.quotaForm.role_uuid
        } else if (ruleType === 'user') {
          submitData.target_user_id = parseInt(this.quotaForm.target_user_id)
        }
        
        if (this.quotaForm.reason) {
          submitData.reason = this.quotaForm.reason
        }

        const url = this.isEditQuota
          ? buildURL(LOTTERY_ENDPOINTS.QUOTA_RULES_DETAIL, { id: this.editingQuotaId })
          : LOTTERY_ENDPOINTS.QUOTA_RULES_CREATE

        await this.apiCall(url, {
          method: this.isEditQuota ? 'PUT' : 'POST',
          data: submitData
        })

        this.showSuccess(this.isEditQuota ? '规则更新成功' : '规则创建成功')
        this.hideModal('quotaModal')
        await this.loadQuotas()
      } catch (error) {
        this.showError('保存规则失败: ' + (error.message || '未知错误'))
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
        `确认禁用此配额规则？（规则将被禁用而非删除，以保留审计记录）`,
        async () => {
          // apiCall 成功时返回 response.data，失败时抛出错误
          await this.apiCall(
            buildURL(LOTTERY_ENDPOINTS.QUOTA_RULES_DISABLE, { id: quota.rule_id }),
            { method: 'PUT' }
          )
          // 如果没有抛出错误，则表示成功
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
        // apiCall 成功时返回 response.data，失败时抛出错误
        await this.apiCall(
          buildURL(LOTTERY_ENDPOINTS.QUOTA_RULES_DISABLE, { id: quota.rule_id }),
          { method: 'PUT' }
        )
        // 如果没有抛出错误，则表示成功
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
    getScopeTypeText(type) {
      const map = {
        global: '全局',
        campaign: '活动',
        role: '角色',
        user: '用户'
      }
      return map[type] || type || '-'
    },

    /**
     * 获取窗口类型文本
     * @param {string} type - 窗口类型代码
     * @returns {string} 窗口类型文本
     */
    getWindowTypeText(type) {
      const map = {
        daily: '每日',
        weekly: '每周',
        monthly: '每月',
        total: '永久'
      }
      return map[type] || type || '-'
    },

    /**
     * 获取配额类型文本（兼容旧代码）
     * @param {string} type - 配额类型代码
     * @returns {string} 配额类型文本
     */
    getQuotaTypeText(type) {
      return this.getScopeTypeText(type)
    },

    /**
     * 获取周期类型文本（兼容旧代码）
     * @param {string} type - 周期类型代码
     * @returns {string} 周期类型文本
     */
    getPeriodTypeText(type) {
      return this.getWindowTypeText(type)
    },

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

