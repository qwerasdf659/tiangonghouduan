/**
 * 奖品管理模块
 *
 * @file admin/src/modules/lottery/composables/prizes.js
 * @description 奖品的 CRUD 操作、库存管理
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery.js'
import { buildURL } from '../../../api/base.js'

/**
 * 奖品管理状态
 * @returns {Object} 状态对象
 */
export function usePrizesState() {
  return {
    /** @type {Array} 奖品列表 */
    prizes: [],
    /** @type {Object} 奖品筛选条件 */
    prizeFilters: { type: '', status: '', keyword: '' },
    /** @type {Object} 奖品编辑表单 */
    prizeForm: {
      name: '',
      type: 'virtual',
      probability: 0,
      stock: -1,
      is_active: true,
      image_url: '',
      description: ''
    },
    /** @type {number|string|null} 当前编辑的奖品ID */
    editingPrizeId: null,
    /** @type {Object} 库存补充表单 */
    stockForm: { prizeId: null, prizeName: '', quantity: 1 }
  }
}

/**
 * 奖品管理方法
 * @returns {Object} 方法对象
 */
export function usePrizesMethods() {
  return {
    /**
     * 加载奖品列表
     */
    async loadPrizes() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.pageSize)
        if (this.prizeFilters.type) {
          params.append('type', this.prizeFilters.type)
        }
        if (this.prizeFilters.status) {
          params.append('is_active', this.prizeFilters.status === 'active')
        }
        if (this.prizeFilters.keyword) {
          params.append('keyword', this.prizeFilters.keyword)
        }

        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.PRIZE_LIST}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.prizes = response.data?.prizes || response.data?.list || []
        }
      } catch (error) {
        logger.error('加载奖品失败:', error)
        this.prizes = []
      }
    },

    /**
     * 打开创建奖品模态框
     */
    openCreatePrizeModal() {
      this.editingPrizeId = null
      this.isEditMode = false
      this.prizeForm = {
        name: '',
        type: 'virtual',
        probability: 0,
        stock: -1,
        is_active: true,
        image_url: '',
        description: ''
      }
      this.showModal('prizeModal')
    },

    /**
     * 编辑奖品
     * @param {Object} prize - 奖品对象
     */
    editPrize(prize) {
      this.editingPrizeId = prize.prize_id || prize.id
      this.isEditMode = true
      this.prizeForm = {
        name: prize.name || '',
        type: prize.type || 'virtual',
        probability: prize.probability || 0,
        stock: prize.stock ?? -1,
        is_active: prize.is_active,
        image_url: prize.image_url || '',
        description: prize.description || ''
      }
      this.showModal('prizeModal')
    },

    /**
     * 切换奖品启用状态
     * @param {Object} prize - 奖品对象
     */
    async togglePrize(prize) {
      const newStatus = !prize.is_active
      await this.confirmAndExecute(
        `确认${newStatus ? '启用' : '禁用'}奖品「${prize.name}」？`,
        async () => {
          const response = await this.apiCall(
            buildURL(LOTTERY_ENDPOINTS.PRIZE_TOGGLE, {
              id: prize.prize_id
            }),
            { method: 'PUT' }
          )
          if (response?.success) this.loadPrizes()
        },
        { successMessage: `奖品已${newStatus ? '启用' : '禁用'}` }
      )
    },

    /**
     * 删除奖品
     * @param {Object} prize - 奖品对象
     */
    async deletePrize(prize) {
      await this.confirmAndExecute(
        `确认删除奖品「${prize.name}」？`,
        async () => {
          const response = await this.apiCall(
            buildURL(LOTTERY_ENDPOINTS.PRIZE_DELETE, {
              id: prize.prize_id
            }),
            { method: 'DELETE' }
          )
          if (response?.success) this.loadPrizes()
        },
        { successMessage: '奖品已删除' }
      )
    },

    /**
     * 提交奖品表单
     */
    async submitPrizeForm() {
      if (!this.prizeForm.name) {
        this.showError('请输入奖品名称')
        return
      }

      try {
        this.saving = true
        const url = this.isEditMode
          ? buildURL(LOTTERY_ENDPOINTS.PRIZE_UPDATE, { id: this.editingPrizeId })
          : LOTTERY_ENDPOINTS.PRIZE_LIST

        const response = await this.apiCall(url, {
          method: this.isEditMode ? 'PUT' : 'POST',
          data: {
            name: this.prizeForm.name,
            type: this.prizeForm.type,
            probability: this.prizeForm.probability,
            stock: this.prizeForm.stock,
            is_active: this.prizeForm.is_active,
            image_url: this.prizeForm.image_url,
            description: this.prizeForm.description
          }
        })

        if (response?.success) {
          this.showSuccess(this.isEditMode ? '奖品更新成功' : '奖品创建成功')
          this.hideModal('prizeModal')
          await this.loadPrizes()
        }
      } catch (error) {
        this.showError('保存奖品失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 获取奖品类型文本
     * @param {string} type - 奖品类型
     * @returns {string} 类型文本
     */
    getPrizeTypeText(type) {
      const map = { physical: '实物', virtual: '虚拟', coupon: '优惠券', points: '积分' }
      return map[type] || type
    },

    /**
     * 打开奖品补货模态框
     * @param {Object} prize - 奖品对象
     */
    openStockModal(prize) {
      this.stockForm = {
        prizeId: prize.prize_id || prize.id,
        prizeName: prize.name || prize.prize_name,
        quantity: 1
      }
      this.showModal('stockModal')
    },

    /**
     * 提交奖品补货
     */
    async submitAddStock() {
      if (!this.stockForm.prizeId) {
        this.showError('奖品信息无效')
        return
      }
      if (!this.stockForm.quantity || this.stockForm.quantity <= 0) {
        this.showError('请输入有效的补货数量')
        return
      }

      try {
        this.saving = true
        const response = await this.apiCall(
          buildURL(LOTTERY_ENDPOINTS.PRIZE_ADD_STOCK, {
            id: this.stockForm.prizeId
          }),
          {
            method: 'POST',
            data: { quantity: parseInt(this.stockForm.quantity) }
          }
        )

        if (response?.success) {
          this.showSuccess(`已成功补充 ${this.stockForm.quantity} 件库存`)
          this.hideModal('stockModal')
          await this.loadPrizes()
        }
      } catch (error) {
        this.showError('补货失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    }
  }
}

export default { usePrizesState, usePrizesMethods }

