/**
 * 预设可视化模块 - P1-3
 *
 * @file admin/src/modules/lottery/composables/preset-visualization.js
 * @description 预设队列状态可视化，展示活跃/暂停/耗尽/过期预设
 * @version 1.0.0
 * @date 2026-02-03
 *
 * 使用 LOTTERY_CORE_ENDPOINTS 预设相关端点
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_CORE_ENDPOINTS } from '../../../api/lottery/core.js'

/**
 * 预设可视化状态
 * @returns {Object} 状态对象
 */
export function usePresetVisualizationState() {
  return {
    /** @type {Array} 预设列表 */
    presets: [],
    /** @type {Object} 预设统计 */
    presetStats: {
      total_presets: 0, // 总预设数
      pending_presets: 0, // 待使用（活跃）
      used_presets: 0, // 已使用
      total_users_with_presets: 0, // 拥有预设的用户数
      usage_rate: '0%', // 使用率
      // 按状态分组（前端计算）
      active_count: 0, // 活跃（pending）
      paused_count: 0, // 暂停
      exhausted_count: 0, // 耗尽
      expired_count: 0 // 过期
    },
    /** @type {Object} 预设筛选条件（手机号主导搜索） */
    presetFilters: {
      status: '', // pending/used/all
      mobile: ''
    },
    /** @type {Object} 预设分页 */
    presetPagination: {
      page: 1,
      page_size: 20,
      total: 0
    },
    /** @type {Object|null} 选中的预设 */
    selectedPreset: null,
    /** @type {boolean} 显示创建预设模态框 */
    showCreatePresetModal: false,
    /** @type {Object} 创建预设表单（手机号主导搜索） */
    createPresetForm: {
      mobile: '',
      presets: []
    },
    /** @type {Array} 奖品选项（供创建预设使用） */
    prizeOptions: []
  }
}

/**
 * 预设可视化方法
 * @returns {Object} 方法对象
 */
export function usePresetVisualizationMethods() {
  return {
    /**
     * 加载预设列表
     */
    async loadPresets() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.presetPagination?.page || 1)
        params.append('page_size', this.presetPagination?.page_size || 20)
        if (this.presetFilters.status) params.append('status', this.presetFilters.status)
        // 手机号 → resolve 获取 user_id
        if (this.presetFilters.mobile) {
          const user = await this.resolveUserByMobile(this.presetFilters.mobile)
          if (user) params.append('user_id', user.user_id)
          else {
            this.presets = []
            return
          }
        }

        const response = await this.apiGet(
          `${LOTTERY_CORE_ENDPOINTS.PRESET_LIST}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          this.presets = response.data?.list || response.data?.presets || response.data?.items || []
          if (response.data?.pagination) {
            this.presetPagination.total = response.data.pagination.total || 0
          }
          logger.debug('[PresetVisualization] 加载预设列表成功:', this.presets.length, '条')
        }
      } catch (error) {
        logger.error('[PresetVisualization] 加载预设列表失败:', error)
        this.presets = []
      }
    },

    /**
     * 加载预设统计
     */
    async loadPresetStats() {
      try {
        const response = await this.apiGet(
          LOTTERY_CORE_ENDPOINTS.PRESET_STATS,
          {},
          { showLoading: false, showError: false }
        )

        if (response?.success && response.data) {
          const data = response.data
          this.presetStats = {
            total_presets: data.total_presets ?? 0,
            pending_presets: data.pending_presets ?? 0,
            used_presets: data.used_presets ?? 0,
            total_users_with_presets: data.total_users_with_presets ?? 0,
            usage_rate: data.usage_rate || '0%',
            // 前端计算各状态数量
            active_count: data.pending_presets ?? 0, // 活跃 = 待使用
            paused_count: data.paused_presets ?? 0,
            exhausted_count: data.exhausted_presets ?? 0,
            expired_count: data.expired_presets ?? 0
          }
          logger.debug('[PresetVisualization] 加载预设统计成功:', this.presetStats)
        }
      } catch (error) {
        logger.error('[PresetVisualization] 加载预设统计失败:', error)
      }
    },

    /**
     * 搜索预设
     */
    searchPresets() {
      this.presetPagination.page = 1
      this.loadPresets()
    },

    /**
     * 重置预设筛选
     */
    resetPresetFilters() {
      this.presetFilters = {
        status: '',
        mobile: ''
      }
      this.presetPagination.page = 1
      this.loadPresets()
    },

    /**
     * 预设分页切换
     * @param {number} page - 页码
     */
    changePresetPage(page) {
      this.presetPagination.page = page
      this.loadPresets()
    },

    /**
     * 获取预设总页数
     * 注意：改为普通方法避免在对象展开时触发 getter
     * @returns {number} 总页数
     */
    getPresetTotalPages() {
      const pagination = this.presetPagination || { total: 0, page_size: 20 }
      return Math.ceil(pagination.total / pagination.page_size) || 1
    },

    /**
     * 查看预设详情
     * @param {Object} preset - 预设对象
     */
    viewPresetDetail(preset) {
      this.selectedPreset = preset
      this.showModal('presetDetailModal')
    },

    /**
     * 打开创建预设模态框
     */
    openCreatePresetModal() {
      this.createPresetForm = {
        mobile: '',
        presets: [{ lottery_prize_id: '', queue_order: 1 }]
      }
      this.showCreatePresetModal = true
      this.showModal('createPresetModal')
    },

    /**
     * 添加预设项
     */
    addPresetItem() {
      const nextOrder = this.createPresetForm.presets.length + 1
      this.createPresetForm.presets.push({
        lottery_prize_id: '',
        queue_order: nextOrder
      })
    },

    /**
     * 移除预设项
     * @param {number} index - 索引
     */
    removePresetItem(index) {
      if (this.createPresetForm.presets.length > 1) {
        this.createPresetForm.presets.splice(index, 1)
        // 重新排序
        this.createPresetForm.presets.forEach((p, i) => {
          p.queue_order = i + 1
        })
      }
    },

    /**
     * 提交创建预设
     */
    async submitCreatePreset() {
      if (!this.createPresetForm.mobile) {
        this.showError('请输入手机号')
        return
      }
      if (this.createPresetForm.presets.some(p => !p.lottery_prize_id)) {
        this.showError('请选择所有预设的奖品')
        return
      }

      // 手机号 → resolve 获取 user_id
      const user = await this.resolveUserByMobile(this.createPresetForm.mobile)
      if (!user) return

      try {
        this.saving = true
        const response = await this.apiPost(LOTTERY_CORE_ENDPOINTS.PRESET_CREATE, {
          user_id: user.user_id,
          presets: this.createPresetForm.presets.map(p => ({
            lottery_prize_id: parseInt(p.lottery_prize_id),
            queue_order: p.queue_order
          }))
        })

        if (response?.success) {
          this.showSuccess('预设创建成功')
          this.showCreatePresetModal = false
          this.hideModal('createPresetModal')
          await this.loadPresets()
          await this.loadPresetStats()
        }
      } catch (error) {
        this.showError('创建预设失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 取消/删除用户预设
     * @param {number} userId - 用户ID
     */
    async deleteUserPresets(userId) {
      await this.confirmAndExecute(
        '确定删除该用户的所有预设吗？',
        async () => {
          const response = await this.apiDelete(
            `${LOTTERY_CORE_ENDPOINTS.PRESET_DELETE.replace(':user_id', userId)}`,
            {}
          )
          if (response?.success) {
            await this.loadPresets()
            await this.loadPresetStats()
          }
        },
        { successMessage: '预设已删除' }
      )
    },

    /**
     * 获取预设状态图标
     * @param {string} status - 状态
     * @returns {string} 图标
     */
    getPresetStatusIcon(status) {
      const map = {
        pending: '🟢',
        used: '⚪',
        paused: '🟡',
        exhausted: '🔴',
        expired: '⚫'
      }
      return map[status] || '⚪'
    },

    /**
     * 获取预设状态文本
     * @param {string} status - 状态
     * @returns {string} 文本
     */
    // ✅ 已删除 getPresetStatusText 映射函数 - 改用后端 _display 字段（P2 中文化）

    /**
     * 获取预设状态CSS类
     * @param {string} status - 状态
     * @returns {string} CSS类
     */
    getPresetStatusClass(status) {
      const map = {
        pending: 'bg-green-100 text-green-800',
        used: 'bg-gray-100 text-gray-800',
        paused: 'bg-yellow-100 text-yellow-800',
        exhausted: 'bg-red-100 text-red-800',
        expired: 'bg-gray-200 text-gray-600'
      }
      return map[status] || 'bg-gray-100 text-gray-800'
    },

    /**
     * 查看用户档案（跳转到用户管理页面）
     * @param {number} userId - 用户ID
     */
    viewUserProfile(userId) {
      if (!userId) return
      // 跳转到用户管理页面并带上用户ID参数
      window.open(`/admin/user-management.html?user_id=${userId}`, '_blank')
      logger.debug('[PresetVisualization] 跳转查看用户档案:', userId)
    }
  }
}

export default { usePresetVisualizationState, usePresetVisualizationMethods }
