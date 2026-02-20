/**
 * 客服管理 - Composable
 *
 * @file admin/src/modules/content/composables/cs-agent-management.js
 * @description 客服座席管理和用户分配的状态与方法
 * @version 1.1.0
 * @date 2026-02-20
 */

import { logger } from '../../../utils/logger.js'
import { buildURL, request } from '../../../api/base.js'
import { CONTENT_ENDPOINTS } from '../../../api/content.js'

/**
 * 客服管理页面状态
 * @returns {Object} 状态对象
 */
export function useCsAgentManagementState() {
  return {
    /* ===== Tab 切换 ===== */
    activeTab: 'agents',

    /* ===== 座席列表 ===== */
    agents: [],
    agentsLoading: false,
    agentPagination: { total: 0, current_page: 1, page_size: 20, total_pages: 0 },
    agentFilter: { status: '', search: '' },

    /* ===== 座席表单 ===== */
    showAgentModal: false,
    agentModalMode: 'create',
    agentForm: {
      mobile: '',
      display_name: '',
      max_concurrent_sessions: 10,
      specialty: '',
      priority: 0,
      is_auto_assign_enabled: true,
      status: 'active'
    },
    agentFormSubmitting: false,
    /** 手机号查找到的用户预览 */
    lookedUpUser: null,
    lookupLoading: false,
    lookupError: '',

    /* ===== 工作负载 ===== */
    workload: null,
    workloadLoading: false,

    /* ===== 分配列表 ===== */
    assignments: [],
    assignmentsLoading: false,
    assignmentPagination: { total: 0, current_page: 1, page_size: 20, total_pages: 0 },
    assignmentFilter: { agent_id: '', status: 'active', search: '' },

    /* ===== 分配表单 ===== */
    showAssignModal: false,
    assignForm: { mobile: '', agent_id: '', notes: '' },
    assignFormSubmitting: false,
    assignLookedUpUser: null,
    assignLookupLoading: false,
    assignLookupError: '',

    /* ===== 批量分配表单 ===== */
    showBatchAssignModal: false,
    batchAssignForm: { mobiles_text: '', agent_id: '', notes: '' },
    batchAssignSubmitting: false,

    /* ===== 座席详情 ===== */
    showAgentDetailModal: false,
    agentDetail: null,
    agentDetailLoading: false
  }
}

/**
 * 客服管理页面方法
 * @returns {Object} 方法对象
 */
export function useCsAgentManagementMethods() {
  return {
    /* ===================== 手机号查找用户 ===================== */

    /**
     * 根据手机号查找用户（座席注册用）
     * 在手机号输入框失焦或回车时触发
     */
    async lookupUserForAgent() {
      const mobile = (this.agentForm.mobile || '').trim()
      this.lookedUpUser = null
      this.lookupError = ''

      if (!mobile || mobile.length < 11) return

      this.lookupLoading = true
      try {
        const response = await request({
          url: CONTENT_ENDPOINTS.CS_AGENT_LOOKUP_USER + '?mobile=' + encodeURIComponent(mobile)
        })
        if (response.success) {
          this.lookedUpUser = response.data
          if (response.data.is_already_agent) {
            this.lookupError = '该用户已注册为客服座席'
          }
          if (!this.agentForm.display_name && response.data.nickname) {
            this.agentForm.display_name = response.data.nickname
          }
        }
      } catch (error) {
        this.lookupError = error.message || '查找用户失败'
        logger.warn('查找用户失败:', error)
      } finally {
        this.lookupLoading = false
      }
    },

    /**
     * 根据手机号查找用户（用户分配用）
     */
    async lookupUserForAssign() {
      const mobile = (this.assignForm.mobile || '').trim()
      this.assignLookedUpUser = null
      this.assignLookupError = ''

      if (!mobile || mobile.length < 11) return

      this.assignLookupLoading = true
      try {
        const response = await request({
          url: CONTENT_ENDPOINTS.CS_AGENT_LOOKUP_USER + '?mobile=' + encodeURIComponent(mobile)
        })
        if (response.success) {
          this.assignLookedUpUser = response.data
        }
      } catch (error) {
        this.assignLookupError = error.message || '查找用户失败'
        logger.warn('查找用户失败:', error)
      } finally {
        this.assignLookupLoading = false
      }
    },

    /* ===================== 座席管理 ===================== */

    /** 加载座席列表 */
    async loadAgents() {
      this.agentsLoading = true
      try {
        const params = new URLSearchParams()
        params.set('page', this.agentPagination.current_page)
        params.set('page_size', this.agentPagination.page_size)
        if (this.agentFilter.status) params.set('status', this.agentFilter.status)
        if (this.agentFilter.search) params.set('search', this.agentFilter.search)

        const response = await request({
          url: CONTENT_ENDPOINTS.CS_AGENT_LIST + '?' + params.toString()
        })
        if (response.success) {
          this.agents = response.data.agents
          this.agentPagination = response.data.pagination
        }
      } catch (error) {
        logger.error('加载客服座席列表失败:', error)
        Alpine.store('notification').error('加载座席列表失败: ' + error.message)
      } finally {
        this.agentsLoading = false
      }
    },

    /** 打开新建座席弹窗 */
    openCreateAgent() {
      this.agentModalMode = 'create'
      this.agentForm = {
        mobile: '',
        display_name: '',
        max_concurrent_sessions: 10,
        specialty: '',
        priority: 0,
        is_auto_assign_enabled: true,
        status: 'active'
      }
      this.lookedUpUser = null
      this.lookupError = ''
      this.showAgentModal = true
    },

    /** 打开编辑座席弹窗 */
    openEditAgent(agent) {
      this.agentModalMode = 'edit'
      this.agentForm = {
        _id: agent.customer_service_agent_id,
        user_id: agent.user_id,
        mobile: agent.user?.mobile || '',
        display_name: agent.display_name,
        max_concurrent_sessions: agent.max_concurrent_sessions,
        specialty: Array.isArray(agent.specialty) ? agent.specialty.join(',') : (agent.specialty || ''),
        priority: agent.priority,
        is_auto_assign_enabled: agent.is_auto_assign_enabled,
        status: agent.status
      }
      this.lookedUpUser = agent.user || null
      this.lookupError = ''
      this.showAgentModal = true
    },

    /** 提交座席表单 */
    async submitAgentForm() {
      if (this.agentModalMode === 'create' && this.lookedUpUser?.is_already_agent) {
        Alpine.store('notification').warning('该用户已注册为客服座席，无法重复注册')
        return
      }

      this.agentFormSubmitting = true
      try {
        const payload = {
          display_name: this.agentForm.display_name,
          specialty: this.agentForm.specialty
            ? this.agentForm.specialty.split(',').map(s => s.trim()).filter(Boolean)
            : [],
          max_concurrent_sessions: parseInt(this.agentForm.max_concurrent_sessions),
          priority: parseInt(this.agentForm.priority),
          is_auto_assign_enabled: this.agentForm.is_auto_assign_enabled
        }

        if (this.agentModalMode === 'create') {
          payload.mobile = (this.agentForm.mobile || '').trim()
        }

        let response
        if (this.agentModalMode === 'create') {
          response = await request({
            url: CONTENT_ENDPOINTS.CS_AGENT_LIST,
            method: 'POST',
            data: payload
          })
        } else {
          payload.status = this.agentForm.status
          response = await request({
            url: buildURL(CONTENT_ENDPOINTS.CS_AGENT_DETAIL, { id: this.agentForm._id }),
            method: 'PUT',
            data: payload
          })
        }

        if (response.success) {
          Alpine.store('notification').success(
            this.agentModalMode === 'create' ? '客服座席注册成功' : '座席配置更新成功'
          )
          this.showAgentModal = false
          await this.loadAgents()
        }
      } catch (error) {
        logger.error('提交座席表单失败:', error)
        Alpine.store('notification').error('操作失败: ' + error.message)
      } finally {
        this.agentFormSubmitting = false
      }
    },

    /** 删除座席 */
    async deleteAgent(agent) {
      if (!confirm(`确定要删除客服座席「${agent.display_name}」吗？`)) return
      try {
        const response = await request({
          url: buildURL(CONTENT_ENDPOINTS.CS_AGENT_DETAIL, { id: agent.customer_service_agent_id }),
          method: 'DELETE'
        })
        if (response.success) {
          Alpine.store('notification').success('客服座席已删除')
          await this.loadAgents()
        }
      } catch (error) {
        logger.error('删除座席失败:', error)
        Alpine.store('notification').error('删除失败: ' + error.message)
      }
    },

    /** 查看座席详情 */
    async viewAgentDetail(agentId) {
      this.agentDetailLoading = true
      this.showAgentDetailModal = true
      try {
        const response = await request({
          url: buildURL(CONTENT_ENDPOINTS.CS_AGENT_DETAIL, { id: agentId })
        })
        if (response.success) {
          this.agentDetail = response.data
        }
      } catch (error) {
        logger.error('获取座席详情失败:', error)
        Alpine.store('notification').error('获取详情失败: ' + error.message)
      } finally {
        this.agentDetailLoading = false
      }
    },

    /* ===================== 工作负载 ===================== */

    /** 加载工作负载概览 */
    async loadWorkload() {
      this.workloadLoading = true
      try {
        const response = await request({ url: CONTENT_ENDPOINTS.CS_AGENT_WORKLOAD })
        if (response.success) {
          this.workload = response.data
        }
      } catch (error) {
        logger.error('加载工作负载失败:', error)
      } finally {
        this.workloadLoading = false
      }
    },

    /* ===================== 用户分配 ===================== */

    /** 加载分配列表 */
    async loadAssignments() {
      this.assignmentsLoading = true
      try {
        const params = new URLSearchParams()
        params.set('page', this.assignmentPagination.current_page)
        params.set('page_size', this.assignmentPagination.page_size)
        if (this.assignmentFilter.agent_id) params.set('agent_id', this.assignmentFilter.agent_id)
        if (this.assignmentFilter.status) params.set('status', this.assignmentFilter.status)
        if (this.assignmentFilter.search) params.set('search', this.assignmentFilter.search)

        const response = await request({
          url: CONTENT_ENDPOINTS.CS_ASSIGNMENT_LIST + '?' + params.toString()
        })
        if (response.success) {
          this.assignments = response.data.assignments
          this.assignmentPagination = response.data.pagination
        }
      } catch (error) {
        logger.error('加载分配列表失败:', error)
        Alpine.store('notification').error('加载分配列表失败: ' + error.message)
      } finally {
        this.assignmentsLoading = false
      }
    },

    /** 打开分配弹窗 */
    openAssignUser() {
      this.assignForm = { mobile: '', agent_id: '', notes: '' }
      this.assignLookedUpUser = null
      this.assignLookupError = ''
      this.showAssignModal = true
    },

    /** 提交单个分配 */
    async submitAssignment() {
      this.assignFormSubmitting = true
      try {
        const response = await request({
          url: CONTENT_ENDPOINTS.CS_ASSIGNMENT_LIST,
          method: 'POST',
          data: {
            mobile: (this.assignForm.mobile || '').trim(),
            agent_id: parseInt(this.assignForm.agent_id),
            notes: this.assignForm.notes || undefined
          }
        })
        if (response.success) {
          Alpine.store('notification').success('用户分配成功')
          this.showAssignModal = false
          await this.loadAssignments()
        }
      } catch (error) {
        logger.error('分配用户失败:', error)
        Alpine.store('notification').error('分配失败: ' + error.message)
      } finally {
        this.assignFormSubmitting = false
      }
    },

    /** 打开批量分配弹窗 */
    openBatchAssign() {
      this.batchAssignForm = { mobiles_text: '', agent_id: '', notes: '' }
      this.showBatchAssignModal = true
    },

    /** 提交批量分配 */
    async submitBatchAssignment() {
      this.batchAssignSubmitting = true
      try {
        const mobiles = this.batchAssignForm.mobiles_text
          .split(/[,，\n\s]+/)
          .map(s => s.trim())
          .filter(s => s.length >= 11)

        if (mobiles.length === 0) {
          Alpine.store('notification').warning('请输入有效的手机号码')
          return
        }

        /* 批量：先逐个解析手机号再提交（后端 batch 接口需要 user_ids） */
        const userIds = []
        const failedMobiles = []
        for (const mobile of mobiles) {
          try {
            const resp = await request({
              url: CONTENT_ENDPOINTS.CS_AGENT_LOOKUP_USER + '?mobile=' + encodeURIComponent(mobile)
            })
            if (resp.success) {
              userIds.push(resp.data.user_id)
            }
          } catch {
            failedMobiles.push(mobile)
          }
        }

        if (userIds.length === 0) {
          Alpine.store('notification').error('所有手机号均未找到对应用户')
          return
        }

        const response = await request({
          url: CONTENT_ENDPOINTS.CS_ASSIGNMENT_BATCH,
          method: 'POST',
          data: {
            user_ids: userIds,
            agent_id: parseInt(this.batchAssignForm.agent_id),
            notes: this.batchAssignForm.notes || undefined
          }
        })
        if (response.success) {
          const { success_count, fail_count } = response.data
          let msg = `批量分配完成：成功 ${success_count}，失败 ${fail_count}`
          if (failedMobiles.length > 0) {
            msg += `，未找到用户的手机号：${failedMobiles.join('、')}`
          }
          Alpine.store('notification').success(msg)
          this.showBatchAssignModal = false
          await this.loadAssignments()
        }
      } catch (error) {
        logger.error('批量分配失败:', error)
        Alpine.store('notification').error('批量分配失败: ' + error.message)
      } finally {
        this.batchAssignSubmitting = false
      }
    },

    /** 解除分配 */
    async removeAssignment(assignment) {
      if (!confirm('确定要解除该用户的客服分配吗？')) return
      try {
        const response = await request({
          url: buildURL(CONTENT_ENDPOINTS.CS_ASSIGNMENT_DELETE, {
            id: assignment.customer_service_user_assignment_id
          }),
          method: 'DELETE'
        })
        if (response.success) {
          Alpine.store('notification').success('分配已解除')
          await this.loadAssignments()
        }
      } catch (error) {
        logger.error('解除分配失败:', error)
        Alpine.store('notification').error('解除失败: ' + error.message)
      }
    },

    /* ===================== 分页和筛选 ===================== */

    /** 座席列表翻页 */
    async agentGoToPage(page) {
      this.agentPagination.current_page = page
      await this.loadAgents()
    },

    /** 座席列表筛选 */
    async filterAgents() {
      this.agentPagination.current_page = 1
      await this.loadAgents()
    },

    /** 分配列表翻页 */
    async assignmentGoToPage(page) {
      this.assignmentPagination.current_page = page
      await this.loadAssignments()
    },

    /** 分配列表筛选 */
    async filterAssignments() {
      this.assignmentPagination.current_page = 1
      await this.loadAssignments()
    },

    /* ===================== 辅助方法 ===================== */

    /** 座席状态中文映射 */
    agentStatusText(status) {
      const map = { active: '在岗', inactive: '离线', on_break: '休息中' }
      return map[status] || status
    },

    /** 座席状态样式 */
    agentStatusClass(status) {
      const map = {
        active: 'bg-green-100 text-green-800',
        inactive: 'bg-gray-100 text-gray-800',
        on_break: 'bg-yellow-100 text-yellow-800'
      }
      return map[status] || 'bg-gray-100 text-gray-800'
    },

    /** 分配状态中文映射 */
    assignmentStatusText(status) {
      const map = { active: '生效中', expired: '已过期', transferred: '已转移' }
      return map[status] || status
    },

    /** 分配状态样式 */
    assignmentStatusClass(status) {
      const map = {
        active: 'bg-green-100 text-green-800',
        expired: 'bg-gray-100 text-gray-800',
        transferred: 'bg-blue-100 text-blue-800'
      }
      return map[status] || 'bg-gray-100 text-gray-800'
    },

    /** 负载百分比样式 */
    loadBarClass(percentage) {
      if (percentage >= 90) return 'bg-red-500'
      if (percentage >= 70) return 'bg-yellow-500'
      return 'bg-green-500'
    }
  }
}
