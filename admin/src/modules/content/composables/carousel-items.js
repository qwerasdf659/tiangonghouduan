/**
 * 轮播图管理 - Composable
 *
 * @file admin/src/modules/content/composables/carousel-items.js
 * @description 轮播图（carousel_items 独立表）管理状态和方法
 * @version 1.0.0
 * @date 2026-02-18
 */

import { logger } from '../../../utils/logger.js'
import { buildURL, getToken } from '../../../api/base.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'

/**
 * 轮播图管理状态
 * @returns {Object} 状态对象
 */
export function useCarouselItemsState() {
  return {
    /** 轮播图列表 */
    carouselItems: [],
    /** 轮播图表单 */
    carouselForm: {
      carousel_item_id: null,
      title: '',
      display_mode: 'wide',
      position: 'home',
      display_order: 0,
      is_active: true,
      image_url: '',
      link_url: '',
      link_type: 'none',
      slide_interval_ms: 3000,
      start_time: '',
      end_time: ''
    },
    /** 待上传轮播图图片文件 */
    carouselImageFile: null,
    /** 轮播图图片预览URL */
    carouselImagePreview: '',
    /** 轮播图筛选 */
    carouselFilters: { position: '', status: '' },
    /** 轮播图统计 */
    carouselStats: { total: 0, active: 0, positions: {} },
    /** 轮播图显示模式选项（仅支持宽屏类） */
    carouselDisplayModes: [
      { value: 'wide', label: '宽屏模式', hint: '16:9 · 推荐 750×420' },
      { value: 'horizontal', label: '横版模式', hint: '3:2 · 推荐 750×500' },
      { value: 'square', label: '方图模式', hint: '1:1 · 推荐 750×750' }
    ],
    /** 展示统计数据 */
    carouselShowStats: null,
    carouselShowStatsLoading: false,
    carouselShowStatsTarget: null,
    carouselShowStatsDateRange: { start_date: '', end_date: '' },
    /** 拖拽排序状态 */
    carouselDragging: false,
    carouselDragIndex: null
  }
}

/**
 * 轮播图管理方法
 * @returns {Object} 方法对象
 */
export function useCarouselItemsMethods() {
  return {
    async loadCarouselItems() {
      try {
        logger.info('[ContentManagement] 加载轮播图列表...')
        const params = new URLSearchParams()
        if (this.carouselFilters?.position) params.append('position', this.carouselFilters.position)
        if (this.carouselFilters?.status) params.append('is_active', this.carouselFilters.status)

        const response = await this.apiGet(`${SYSTEM_ENDPOINTS.CAROUSEL_ITEM_LIST}?${params}`)
        if (response?.success) {
          this.carouselItems = response.data?.carousel_items || []
          logger.info('[ContentManagement] 轮播图数量:', this.carouselItems.length)
          this.carouselStats = {
            total: this.carouselItems.length,
            active: this.carouselItems.filter(c => c.is_active).length,
            positions: this.carouselItems.reduce((acc, c) => {
              acc[c.position] = (acc[c.position] || 0) + 1
              return acc
            }, {})
          }
        }
      } catch (error) {
        logger.error('加载轮播图失败:', error)
        this.carouselItems = []
      }
    },

    openCreateCarouselModal() {
      this.isEditMode = false
      this.carouselImageFile = null
      this.carouselImagePreview = ''
      this.carouselForm = {
        carousel_item_id: null,
        title: '',
        display_mode: 'wide',
        position: 'home',
        display_order: 0,
        is_active: true,
        image_url: '',
        link_url: '',
        link_type: 'none',
        slide_interval_ms: 3000,
        start_time: '',
        end_time: ''
      }
      this.showModal('carouselModal')
    },

    editCarouselItem(item) {
      this.isEditMode = true
      this.carouselImageFile = null
      this.carouselImagePreview = ''
      this.carouselForm = {
        carousel_item_id: item.carousel_item_id,
        title: item.title || '',
        display_mode: item.display_mode || 'wide',
        position: item.position || 'home',
        display_order: item.display_order || 0,
        is_active: item.is_active !== false,
        image_url: item.image_url || '',
        link_url: item.link_url || '',
        link_type: item.link_type || 'none',
        slide_interval_ms: item.slide_interval_ms || 3000,
        start_time: this.formatDateTimeLocal(item.start_time),
        end_time: this.formatDateTimeLocal(item.end_time)
      }
      this.showModal('carouselModal')
    },

    selectCarouselImage(event) {
      const file = event.target.files?.[0]
      if (!file) return

      const allowedTypes = ['image/jpeg', 'image/png']
      if (!allowedTypes.includes(file.type)) {
        this.showError('仅支持 JPG/PNG 格式的图片')
        event.target.value = ''
        return
      }
      if (file.size > 400 * 1024) {
        const sizeKB = Math.round(file.size / 1024)
        this.showError(`图片大小 ${sizeKB}KB，超过 400KB 限制，请压缩后重新上传`)
        event.target.value = ''
        return
      }

      this.carouselImageFile = file
      this.carouselImagePreview = URL.createObjectURL(file)
      logger.info('轮播图图片已选择:', file.name)
    },

    clearCarouselImage() {
      this.carouselImageFile = null
      if (this.carouselImagePreview) {
        URL.revokeObjectURL(this.carouselImagePreview)
        this.carouselImagePreview = ''
      }
      this.carouselForm.image_url = ''
    },

    async saveCarouselItem() {
      if (this.isEditMode && !this.carouselForm.carousel_item_id) {
        this.showError('轮播图 ID 缺失')
        return
      }
      if (!this.carouselForm.display_mode) {
        this.showError('请选择显示模式')
        return
      }
      if (!this.isEditMode && !this.carouselImageFile) {
        this.showError('请选择轮播图图片')
        return
      }
      if (!this.carouselForm.title?.trim()) {
        this.showError('请输入标题')
        return
      }

      this.saving = true
      try {
        const url = this.isEditMode
          ? buildURL(SYSTEM_ENDPOINTS.CAROUSEL_ITEM_UPDATE, { id: this.carouselForm.carousel_item_id })
          : SYSTEM_ENDPOINTS.CAROUSEL_ITEM_CREATE
        const method = this.isEditMode ? 'PUT' : 'POST'

        const formData = new FormData()
        formData.append('title', this.carouselForm.title.trim())
        formData.append('display_mode', this.carouselForm.display_mode)
        formData.append('position', this.carouselForm.position || 'home')
        formData.append('display_order', String(this.carouselForm.display_order || 0))
        formData.append('is_active', String(this.carouselForm.is_active))
        formData.append('link_url', this.carouselForm.link_url || '')
        formData.append('link_type', this.carouselForm.link_type || 'none')
        formData.append('slide_interval_ms', String(this.carouselForm.slide_interval_ms || 3000))
        if (this.carouselForm.start_time) formData.append('start_time', this.carouselForm.start_time)
        if (this.carouselForm.end_time) formData.append('end_time', this.carouselForm.end_time)

        if (this.carouselImageFile) {
          formData.append('image', this.carouselImageFile, this.carouselImageFile.name)
        }

        const token = getToken()
        const response = await fetch(url, {
          method,
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        })

        const result = await response.json()
        if (result.success) {
          this.hideModal('carouselModal')
          this.clearCarouselImage()
          await this.loadCarouselItems()
          this.showSuccess(this.isEditMode ? '轮播图已更新' : '轮播图已创建')
        } else {
          throw new Error(result.message || '保存失败')
        }
      } catch (error) {
        logger.error('保存轮播图失败:', error)
        this.showError('保存轮播图失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    async toggleCarouselStatus(item) {
      try {
        const response = await this.apiCall(
          buildURL(SYSTEM_ENDPOINTS.CAROUSEL_ITEM_TOGGLE, { id: item.carousel_item_id }),
          { method: 'PATCH' }
        )
        if (response?.success) {
          this.showSuccess(`轮播图已${item.is_active ? '禁用' : '启用'}`)
          await this.loadCarouselItems()
        }
      } catch (_error) {
        this.showError('切换状态失败')
      }
    },

    async deleteCarouselItem(item) {
      this.deleteTarget = item
      this.deleteType = 'carousel'
      this.showModal('deleteModal')
    },

    previewCarouselItem(item) {
      if (item.image_url) window.open(item.image_url, '_blank')
    },

    getCarouselAspectStyle(displayMode) {
      const ratios = { wide: '16/9', horizontal: '3/2', square: '1/1' }
      const ratio = ratios[displayMode] || '16/9'
      return `aspect-ratio: ${ratio}; max-height: 320px;`
    },

    async viewCarouselShowStats(item) {
      this.carouselShowStatsTarget = item
      this.carouselShowStats = null
      const today = new Date()
      const weekAgo = new Date(today.getTime() - 7 * 24 * 3600 * 1000)
      this.carouselShowStatsDateRange = {
        start_date: weekAgo.toISOString().slice(0, 10),
        end_date: today.toISOString().slice(0, 10)
      }
      this.showModal('carouselShowStatsModal')
      await this.loadCarouselShowStats()
    },

    async loadCarouselShowStats() {
      if (!this.carouselShowStatsTarget) return
      this.carouselShowStatsLoading = true
      try {
        const params = new URLSearchParams()
        if (this.carouselShowStatsDateRange.start_date) params.append('start_date', this.carouselShowStatsDateRange.start_date)
        if (this.carouselShowStatsDateRange.end_date) params.append('end_date', this.carouselShowStatsDateRange.end_date)
        const url = buildURL(SYSTEM_ENDPOINTS.CAROUSEL_ITEM_SHOW_STATS, { id: this.carouselShowStatsTarget.carousel_item_id })
        const response = await this.apiGet(`${url}?${params}`)
        if (response?.success) {
          this.carouselShowStats = response.data || {}
        }
      } catch (error) {
        logger.error('加载轮播图展示统计失败:', error)
        this.showError('加载展示统计失败: ' + error.message)
      } finally {
        this.carouselShowStatsLoading = false
      }
    },

    carouselDragStart(index) {
      this.carouselDragIndex = index
      this.carouselDragging = true
    },

    carouselDragOver(event, index) {
      event.preventDefault()
      if (this.carouselDragIndex === null || this.carouselDragIndex === index) return
      const items = [...this.carouselItems]
      const [moved] = items.splice(this.carouselDragIndex, 1)
      items.splice(index, 0, moved)
      this.carouselItems = items
      this.carouselDragIndex = index
    },

    async carouselDragEnd() {
      this.carouselDragging = false
      if (this.carouselDragIndex === null) return
      this.carouselDragIndex = null
      const order_list = this.carouselItems.map((c, i) => ({
        carousel_item_id: c.carousel_item_id,
        display_order: i
      }))
      try {
        const response = await this.apiCall(SYSTEM_ENDPOINTS.CAROUSEL_ITEM_ORDER, {
          method: 'PATCH',
          data: { order_list }
        })
        if (response?.success) {
          this.showSuccess('轮播图排序已保存')
          await this.loadCarouselItems()
        }
      } catch (error) {
        logger.error('保存轮播图排序失败:', error)
        this.showError('保存排序失败: ' + error.message)
        await this.loadCarouselItems()
      }
    }
  }
}
