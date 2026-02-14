/**
 * 员工管理 - Composable
 *
 * @file admin/src/modules/store/composables/staff.js
 * @description 从 store-management.js 提取的员工管理状态和方法
 * @version 1.0.0
 * @date 2026-02-06
 */

import { logger } from '../../../utils/logger.js'
import { STORE_ENDPOINTS } from '../../../api/store.js'
import { buildURL } from '../../../api/base.js'

/**
 * 员工管理状态
 * @returns {Object} 状态对象
 */
export function useStaffState() {
  return {
    /** 员工列表 */
    staffList: [],
    /** 员工筛选 */
    staffFilters: { store_id: '', status: '', role: '', keyword: '' },
    /** 员工分页 */
    pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 },
    /** 员工表单 */
    staffForm: { name: '', phone: '', role: 'waiter', store_id: '', hire_date: '' },
    /** 编辑中的员工ID */
    editingStaffId: null
  }
}

/**
 * 员工管理方法
 * @returns {Object} 方法对象
 */
export function useStaffMethods() {
  return {
    async loadStaff() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.pagination.page || 1)
        params.append('page_size', this.pagination.page_size || 20)
        if (this.staffFilters.store_id) params.append('store_id', this.staffFilters.store_id)
        if (this.staffFilters.role) params.append('role', this.staffFilters.role)
        if (this.staffFilters.keyword) params.append('keyword', this.staffFilters.keyword)
        if (this.staffFilters.status) {
          params.append('status', this.staffFilters.status)
          if (this.staffFilters.status === 'deleted') {
            params.append('include_deleted', 'true')
          }
        }

        const response = await this.apiGet(
          `${STORE_ENDPOINTS.STAFF_LIST}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.staffList = response.data?.items || response.data?.staff || response.data?.list || []
          if (response.data?.pagination) {
            this.pagination.total = response.data.pagination.total || 0
            this.pagination.total_pages = response.data.pagination.total_pages || 1
          } else if (response.data?.total !== undefined) {
            this.pagination.total = response.data.total || 0
            this.pagination.total_pages =
              response.data.total_pages ||
              Math.ceil((response.data.total || 0) / (this.pagination.page_size || 20))
          }
        }
      } catch (error) {
        logger.error('加载员工失败:', error)
        this.staffList = []
      }
    },

    openCreateStaffModal() {
      this.editingStaffId = null
      this.isEditMode = false
      this.staffForm = { name: '', phone: '', role: 'waiter', store_id: '', hire_date: '' }
      this.showModal('staffModal')
    },

    editStaff(staff) {
      this.editingStaffId = staff.store_staff_id || staff.id
      this.isEditMode = true
      this.staffForm = {
        name: staff.user_nickname || '',
        phone: staff.user_mobile || '',
        role: staff.role_in_store || 'staff',
        store_id: staff.store_id || '',
        hire_date: this.formatDateTimeLocal(staff.joined_at)
      }
      this.showModal('staffModal')
    },

    async resignStaff(staff) {
      const staffName = staff.user_nickname || staff.name || '该员工'
      await this.confirmAndExecute(
        `确认将员工「${staffName}」标记为离职？\n离职后员工将无法继续执行工作操作，但记录会保留。`,
        async () => {
          const response = await this.apiCall(
            buildURL(STORE_ENDPOINTS.STAFF_DETAIL, { store_staff_id: staff.store_staff_id }),
            { method: 'DELETE' }
          )
          if (response?.success) this.loadStaff()
        },
        { successMessage: `员工「${staffName}」已离职` }
      )
    },

    async permanentDeleteStaff(staff) {
      const staffName = staff.user_nickname || staff.name || '该员工'

      const reason = await this.showDeleteReasonDialog(staffName)
      if (reason === null) return

      try {
        const url = buildURL(STORE_ENDPOINTS.STAFF_DETAIL, { store_staff_id: staff.store_staff_id })
        const deleteUrl = reason ? `${url}?reason=${encodeURIComponent(reason)}` : url

        const response = await this.apiCall(deleteUrl, { method: 'DELETE' })
        if (response?.success) {
          this.showSuccess(`员工「${staffName}」已删除`)
          this.loadStaff()
        }
      } catch (error) {
        logger.error('删除员工失败:', error)
        this.showError('删除失败: ' + error.message)
      }
    },

    async showDeleteReasonDialog(staffName) {
      return new Promise(resolve => {
        const reason = prompt(
          `确定要删除员工「${staffName}」吗？\n\n请输入删除原因（可选）：\n\n注意：删除后记录将被标记为已删除，不会物理删除。`,
          ''
        )
        resolve(reason)
      })
    },

    getStaffStatusClass(status) {
      const map = {
        active: 'bg-green-100 text-green-700',
        inactive: 'bg-gray-100 text-gray-700',
        pending: 'bg-amber-100 text-amber-700',
        deleted: 'bg-red-100 text-red-500'
      }
      return map[status] || 'bg-gray-100 text-gray-700'
    },

    async saveStaff() {
      if (!this.staffForm.name.trim()) {
        this.showError('请输入员工姓名')
        return
      }

      this.saving = true
      try {
        const payload = {
          name: this.staffForm.name.trim(),
          phone: this.staffForm.phone.trim(),
          role: this.staffForm.role,
          store_id: this.staffForm.store_id || null,
          hire_date: this.staffForm.hire_date || null
        }

        let response
        if (this.editingStaffId) {
          response = await this.apiCall(
            buildURL(STORE_ENDPOINTS.STAFF_UPDATE, { store_staff_id: this.editingStaffId }),
            { method: 'PUT', body: JSON.stringify(payload) }
          )
        } else {
          response = await this.apiCall(STORE_ENDPOINTS.STAFF_CREATE, {
            method: 'POST',
            body: JSON.stringify(payload)
          })
        }

        if (response?.success) {
          this.showSuccess(this.editingStaffId ? '员工更新成功' : '员工添加成功')
          this.hideModal('staffModal')
          this.loadStaff()
        }
      } catch (error) {
        logger.error('保存员工失败:', error)
        this.showError('保存失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    changePage(newPage) {
      if (newPage < 1 || newPage > this.pagination.total_pages) return
      this.pagination.page = newPage
      this.loadStaff()
    }
  }
}



































