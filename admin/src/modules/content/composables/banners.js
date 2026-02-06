/**
 * 轮播图管理 - Composable
 *
 * @file admin/src/modules/content/composables/banners.js
 * @description 从 content-management.js 提取的轮播图管理状态和方法
 * @version 1.0.0
 * @date 2026-02-06
 */

import { logger } from '../../../utils/logger.js'
import { buildURL, getToken } from '../../../api/base.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'

/**
 * 轮播图管理状态
 * @returns {Object} 状态对象
 */
export function useBannersState() {
  return {
    /** 轮播图列表 */
    banners: [],
    /** 轮播图表单 */
    bannerForm: {
      popup_banner_id: null,
      title: '',
      position: 'home',
      sort_order: 0,
      is_active: true,
      image_url: '',
      link_url: '',
      start_time: '',
      end_time: ''
    },
    /** 待上传图片文件 */
    bannerImageFile: null,
    /** 图片预览URL */
    bannerImagePreview: '',
    /** 轮播图筛选 */
    bannerFilters: { position: '', status: '' },
    /** 轮播图统计 */
    bannerStats: { total: 0, active: 0, positions: {} },
    /** 上传中状态 */
    uploadingBannerImage: false
  }
}

/**
 * 轮播图管理方法
 * @returns {Object} 方法对象
 */
export function useBannersMethods() {
  return {
    async loadBanners() {
      try {
        logger.info('[ContentManagement] 加载轮播图列表...')
        const params = new URLSearchParams()
        if (this.bannerFilters?.position) params.append('position', this.bannerFilters.position)
        if (this.bannerFilters?.status) params.append('status', this.bannerFilters.status)

        const response = await this.apiGet(`${SYSTEM_ENDPOINTS.POPUP_BANNER_LIST}?${params}`)
        if (response?.success) {
          this.banners = response.data?.banners || []
          logger.info('[ContentManagement] 轮播图数量:', this.banners.length)
          this.bannerStats = {
            total: this.banners.length,
            active: this.banners.filter(b => b.is_active).length,
            positions: this.banners.reduce((acc, b) => {
              acc[b.position] = (acc[b.position] || 0) + 1
              return acc
            }, {})
          }
        }
      } catch (error) {
        logger.error('加载轮播图失败:', error)
        this.banners = []
      }
    },

    openCreateBannerModal() {
      this.isEditMode = false
      this.bannerImageFile = null
      this.bannerImagePreview = ''
      this.bannerForm = {
        popup_banner_id: null,
        title: '',
        position: 'home',
        sort_order: 0,
        is_active: true,
        image_url: '',
        link_url: '',
        start_time: '',
        end_time: '',
        description: ''
      }
      this.showModal('bannerModal')
    },

    editBanner(banner) {
      this.isEditMode = true
      this.bannerImageFile = null
      this.bannerImagePreview = ''
      this.bannerForm = {
        popup_banner_id: banner.popup_banner_id,
        title: banner.title || '',
        position: banner.position || 'home',
        sort_order: banner.display_order || banner.sort_order || 0,
        is_active: banner.is_active !== false,
        image_url: banner.image_url || '',
        link_url: banner.link_url || '',
        start_time: this.formatDateTimeLocal(banner.start_time),
        end_time: this.formatDateTimeLocal(banner.end_time),
        description: banner.description || ''
      }
      this.showModal('bannerModal')
    },

    selectBannerImage(event) {
      const file = event.target.files?.[0]
      if (!file) return

      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!allowedTypes.includes(file.type)) {
        this.showError('不支持的图片格式，请选择 JPG/PNG/GIF/WebP')
        event.target.value = ''
        return
      }

      if (file.size > 5 * 1024 * 1024) {
        this.showError('图片大小不能超过 5MB')
        event.target.value = ''
        return
      }

      this.bannerImageFile = file
      this.bannerImagePreview = URL.createObjectURL(file)
      logger.info('轮播图图片已选择:', file.name)
    },

    clearBannerImage() {
      this.bannerImageFile = null
      if (this.bannerImagePreview) {
        URL.revokeObjectURL(this.bannerImagePreview)
        this.bannerImagePreview = ''
      }
      this.bannerForm.image_url = ''
    },

    async saveBanner() {
      if (this.isEditMode && !this.bannerForm.popup_banner_id) {
        this.showError('轮播图 ID 缺失')
        return
      }

      if (!this.isEditMode && !this.bannerImageFile) {
        this.showError('请选择轮播图图片')
        return
      }

      if (!this.isEditMode && !(this.bannerImageFile instanceof File)) {
        this.showError('图片文件无效，请重新选择')
        return
      }

      if (!this.bannerForm.title?.trim()) {
        this.showError('请输入标题')
        return
      }

      this.saving = true
      try {
        const url = this.isEditMode
          ? buildURL(SYSTEM_ENDPOINTS.POPUP_BANNER_UPDATE, { id: this.bannerForm.popup_banner_id })
          : SYSTEM_ENDPOINTS.POPUP_BANNER_CREATE
        const method = this.isEditMode ? 'PUT' : 'POST'

        const formData = new FormData()
        formData.append('title', this.bannerForm.title?.trim() || '')
        formData.append('position', this.bannerForm.position || 'home')
        formData.append('display_order', String(this.bannerForm.sort_order || 0))
        formData.append('is_active', String(this.bannerForm.is_active))
        formData.append('link_url', this.bannerForm.link_url || '')
        if (this.bannerForm.start_time) formData.append('start_time', this.bannerForm.start_time)
        if (this.bannerForm.end_time) formData.append('end_time', this.bannerForm.end_time)

        if (this.bannerImageFile) {
          formData.append('image', this.bannerImageFile, this.bannerImageFile.name)
        }

        const token = getToken()
        const response = await fetch(url, {
          method,
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        })

        const result = await response.json()
        if (result.success) {
          this.hideModal('bannerModal')
          this.clearBannerImage()
          await this.loadBanners()
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

    async toggleBannerStatus(banner) {
      try {
        const newStatus = !banner.is_active
        const response = await this.apiCall(
          buildURL(SYSTEM_ENDPOINTS.POPUP_BANNER_TOGGLE, { id: banner.popup_banner_id }),
          { method: 'POST', data: { is_active: newStatus } }
        )
        if (response?.success) {
          this.showSuccess(`轮播图已${newStatus ? '启用' : '禁用'}`)
          await this.loadBanners()
        }
      } catch (_error) {
        this.showError('切换状态失败')
      }
    },

    previewBanner(banner) {
      if (banner.image_url) window.open(banner.image_url, '_blank')
    },

    async deleteBanner(banner) {
      this.deleteTarget = banner
      this.deleteType = 'banner'
      this.showModal('deleteModal')
    },

    formatDateTimeLocal(dateStr) {
      if (!dateStr) return ''
      try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return ''
        return date.toISOString().slice(0, 16)
      } catch {
        return ''
      }
    }
  }
}








