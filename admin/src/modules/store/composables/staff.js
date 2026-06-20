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
    /** 员工筛选（role_in_store 对齐后端枚举 staff/manager） */
    staffFilters: { store_id: '', status: '', role_in_store: '' },
    /** 员工分页 */
    pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 },
    /*
     * 员工表单（严格对齐后端 POST /console/staff 契约）：
     * - mobile：手机号，提交前 resolve 成 user_id（后端要 user_id，不收 name/phone）
     * - role_in_store：门店内角色 staff/manager（后端枚举，不用 waiter/cashier）
     * - store_id：所属门店
     * - notes：备注
     */
    staffForm: { mobile: '', role_in_store: 'staff', store_id: '', notes: '' },
    /** 编辑中的员工记录ID（store_staff_id），编辑态仅改角色 */
    editingStaffId: null,
    /** 调店表单 */
    transferForm: {
      mobile: '',
      user_id: '',
      user_label: '',
      from_store_id: '',
      to_store_id: '',
      notes: ''
    }
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
        // 后端按 role_in_store 筛选（staff/manager），无 keyword 参数
        if (this.staffFilters.role_in_store) {
          params.append('role_in_store', this.staffFilters.role_in_store)
        }
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
      this.staffForm = { mobile: '', role_in_store: 'staff', store_id: '', notes: '' }
      if (typeof this.clearResolvedUser === 'function') this.clearResolvedUser()
      this.showModal('staffModal')
    },

    editStaff(staff) {
      /*
       * 编辑态仅支持"门店内角色变更"（staff↔manager），对齐后端 PUT /:store_staff_id/role。
       * 员工本人（手机号/门店）不可在编辑里改：换门店走"调店"，换人则离职后重新入职。
       */
      this.editingStaffId = staff.store_staff_id
      this.isEditMode = true
      this.staffForm = {
        mobile: staff.user_mobile || '',
        role_in_store: staff.role_in_store || 'staff',
        store_id: staff.store_id || '',
        notes: ''
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
      // 编辑态：仅变更门店内角色（staff↔manager），走 PUT /:store_staff_id/role
      if (this.editingStaffId) {
        if (!['staff', 'manager'].includes(this.staffForm.role_in_store)) {
          this.showError('请选择正确的门店内角色（员工/店长）')
          return
        }
        this.saving = true
        try {
          const response = await this.apiCall(
            buildURL(STORE_ENDPOINTS.STAFF_ROLE, { store_staff_id: this.editingStaffId }),
            {
              method: 'PUT',
              data: {
                role_in_store: this.staffForm.role_in_store,
                notes: this.staffForm.notes || null
              }
            }
          )
          if (response?.success) {
            this.showSuccess('员工角色变更成功')
            this.hideModal('staffModal')
            this.loadStaff()
          }
        } catch (error) {
          logger.error('变更员工角色失败:', error)
          this.showError('保存失败: ' + error.message)
        } finally {
          this.saving = false
        }
        return
      }

      // 新增态：先把手机号 resolve 成 user_id，再提交 { user_id, store_id, role_in_store }
      if (!this.staffForm.store_id) {
        this.showError('请选择所属门店')
        return
      }
      if (!['staff', 'manager'].includes(this.staffForm.role_in_store)) {
        this.showError('请选择正确的门店内角色（员工/店长）')
        return
      }

      this.saving = true
      try {
        const user = await this.resolveUserByMobile(this.staffForm.mobile)
        if (!user) {
          this.showError(this.resolveError || '未找到该手机号对应的用户，请确认用户已注册')
          return
        }

        const response = await this.apiCall(STORE_ENDPOINTS.STAFF_CREATE, {
          method: 'POST',
          data: {
            user_id: user.user_id,
            store_id: this.staffForm.store_id,
            role_in_store: this.staffForm.role_in_store,
            notes: this.staffForm.notes || null
          }
        })

        if (response?.success) {
          this.showSuccess('员工入职成功')
          this.hideModal('staffModal')
          this.loadStaff()
        }
      } catch (error) {
        logger.error('员工入职失败:', error)
        this.showError('保存失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    /**
     * 打开调店弹窗（按手机号 resolve 后调 POST /console/staff/transfer）
     * @param {Object} [staff] - 可选，预填该员工的用户与原门店
     */
    openTransferStaffModal(staff = null) {
      this.transferForm = {
        mobile: staff?.user_mobile || '',
        user_id: staff?.user_id || '',
        user_label: staff ? `${staff.user_nickname || ''}（${staff.user_mobile || ''}）` : '',
        from_store_id: staff?.store_id || '',
        to_store_id: '',
        notes: ''
      }
      if (typeof this.clearResolvedUser === 'function') this.clearResolvedUser()
      this.showModal('staffTransferModal')
    },

    /**
     * 提交员工调店（user_id + from_store_id + to_store_id）
     */
    async submitTransferStaff() {
      if (!this.transferForm.user_id) {
        this.showError('请先指定要调店的员工')
        return
      }
      if (!this.transferForm.from_store_id || !this.transferForm.to_store_id) {
        this.showError('请选择原门店和新门店')
        return
      }
      if (
        String(this.transferForm.from_store_id) === String(this.transferForm.to_store_id)
      ) {
        this.showError('原门店和新门店不能相同')
        return
      }

      this.saving = true
      try {
        const response = await this.apiCall(STORE_ENDPOINTS.STAFF_TRANSFER, {
          method: 'POST',
          data: {
            user_id: this.transferForm.user_id,
            from_store_id: this.transferForm.from_store_id,
            to_store_id: this.transferForm.to_store_id,
            notes: this.transferForm.notes || null
          }
        })
        if (response?.success) {
          this.showSuccess('员工调店成功')
          this.hideModal('staffTransferModal')
          this.loadStaff()
        }
      } catch (error) {
        logger.error('员工调店失败:', error)
        this.showError('调店失败: ' + error.message)
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
