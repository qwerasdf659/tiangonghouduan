/**
 * 弹窗管理 - Composable
 *
 * @file admin/src/modules/content/composables/banners.js
 * @description 弹窗横幅（popup_banners）管理状态和方法
 * @version 2.0.0 - 新增 banner_type/frequency_rule/frequency_value/force_show/priority
 * @date 2026-02-18
 */

import { logger } from '../../../utils/logger.js'
import { buildURL, getToken } from '../../../api/base.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'

/**
 * 弹窗管理状态
 * @returns {Object} 状态对象
 */
export function useBannersState() {
  return {
    /** 弹窗列表 */
    banners: [],
    /** 弹窗表单（含 Phase 1 新增的 5 个字段） */
    bannerForm: {
      popup_banner_id: null,
      title: '',
      display_mode: '',
      position: 'home',
      display_order: 0,
      is_active: true,
      image_url: '',
      link_url: '',
      start_time: '',
      end_time: '',
      banner_type: 'promo',
      frequency_rule: 'once_per_day',
      frequency_value: 1,
      force_show: false,
      priority: 0
    },
    /** 待上传图片文件 */
    bannerImageFile: null,
    /** 图片预览URL */
    bannerImagePreview: '',
    /** 弹窗筛选 */
    bannerFilters: { position: '', status: '', banner_type: '' },
    /** 弹窗统计 */
    bannerStats: { total: 0, active: 0, positions: {}, by_type: {} },
    /** 上传中状态 */
    uploadingBannerImage: false,
    /** 纯图模式二次确认标记 */
    _fullImageConfirmed: false,
    /** 显示模式选项列表（对应后端 6 种 ENUM 值） */
    displayModes: [
      { value: 'wide', label: '宽屏模式', hint: '16:9 · 推荐 750×420', ratio: '16:9' },
      { value: 'horizontal', label: '横版模式', hint: '3:2 · 推荐 750×500', ratio: '3:2' },
      { value: 'square', label: '方图模式', hint: '1:1 · 推荐 750×750', ratio: '1:1' },
      { value: 'tall', label: '竖图模式', hint: '3:4 · 推荐 750×1000', ratio: '3:4' },
      { value: 'slim', label: '窄长图模式', hint: '9:16 · 推荐 420×750', ratio: '9:16' },
      { value: 'full_image', label: '纯图模式', hint: '不限比例 · 图片即弹窗', ratio: '不限' }
    ],
    /** 弹窗类型选项（对应后端 banner_type 字段） */
    bannerTypes: [
      { value: 'notice', label: '系统公告', color: 'bg-red-500' },
      { value: 'event', label: '活动推广', color: 'bg-orange-500' },
      { value: 'promo', label: '日常促销', color: 'bg-blue-500' }
    ],
    /** 频率规则选项（对应后端 frequency_rule 字段） */
    frequencyRules: [
      { value: 'always', label: '每次弹出' },
      { value: 'once', label: '仅弹一次' },
      { value: 'once_per_session', label: '每次启动弹一次' },
      { value: 'once_per_day', label: '每天一次' },
      { value: 'once_per_n_days', label: '每N天一次' },
      { value: 'n_times_total', label: '累计N次' }
    ],
    /** 图片比例警告信息 */
    ratioWarning: '',
    /** 展示统计数据 */
    bannerShowStats: null,
    bannerShowStatsLoading: false,
    bannerShowStatsTarget: null,
    bannerShowStatsDateRange: { start_date: '', end_date: '' },
    /** 拖拽排序状态 */
    bannerDragging: false,
    bannerDragIndex: null
  }
}

/**
 * 弹窗管理方法
 * @returns {Object} 方法对象
 */
export function useBannersMethods() {
  return {
    async loadBanners() {
      try {
        logger.info('[ContentManagement] 加载弹窗列表...')
        const params = new URLSearchParams()
        if (this.bannerFilters?.position) params.append('position', this.bannerFilters.position)
        if (this.bannerFilters?.status) params.append('status', this.bannerFilters.status)
        if (this.bannerFilters?.banner_type) params.append('banner_type', this.bannerFilters.banner_type)

        const response = await this.apiGet(`${SYSTEM_ENDPOINTS.POPUP_BANNER_LIST}?${params}`)
        if (response?.success) {
          this.banners = response.data?.banners || []
          logger.info('[ContentManagement] 弹窗数量:', this.banners.length)
          this.bannerStats = {
            total: this.banners.length,
            active: this.banners.filter(b => b.is_active).length,
            positions: this.banners.reduce((acc, b) => {
              acc[b.position] = (acc[b.position] || 0) + 1
              return acc
            }, {}),
            by_type: this.banners.reduce((acc, b) => {
              acc[b.banner_type] = (acc[b.banner_type] || 0) + 1
              return acc
            }, {})
          }
        }
      } catch (error) {
        logger.error('加载弹窗失败:', error)
        this.banners = []
      }
    },

    openCreateBannerModal() {
      this.isEditMode = false
      this.bannerImageFile = null
      this.bannerImagePreview = ''
      this.ratioWarning = ''
      this._fullImageConfirmed = false
      this.bannerForm = {
        popup_banner_id: null,
        title: '',
        display_mode: '',
        position: 'home',
        display_order: 0,
        is_active: true,
        image_url: '',
        link_url: '',
        start_time: '',
        end_time: '',
        banner_type: 'promo',
        frequency_rule: 'once_per_day',
        frequency_value: 1,
        force_show: false,
        priority: 0
      }
      this.showModal('bannerModal')
    },

    editBanner(banner) {
      this.isEditMode = true
      this.bannerImageFile = null
      this.bannerImagePreview = ''
      this.ratioWarning = ''
      this._fullImageConfirmed = false
      this.bannerForm = {
        popup_banner_id: banner.popup_banner_id,
        title: banner.title || '',
        display_mode: banner.display_mode || '',
        position: banner.position || 'home',
        display_order: banner.display_order || 0,
        is_active: banner.is_active !== false,
        image_url: banner.image_url || '',
        link_url: banner.link_url || '',
        start_time: this.formatDateTimeLocal(banner.start_time),
        end_time: this.formatDateTimeLocal(banner.end_time),
        banner_type: banner.banner_type || 'promo',
        frequency_rule: banner.frequency_rule || 'once_per_day',
        frequency_value: banner.frequency_value || 1,
        force_show: banner.force_show === true || banner.force_show === 1,
        priority: banner.priority || 0
      }
      this.showModal('bannerModal')
    },

    /** frequency_value 输入框是否需要显示（仅 once_per_n_days / n_times_total 需要） */
    needsFrequencyValue() {
      return ['once_per_n_days', 'n_times_total'].includes(this.bannerForm.frequency_rule)
    },

    /**
     * 校验图片比例与所选模板的匹配度（前端侧，与后端一致的范围定义）
     * @param {string} displayMode - 显示模式
     * @param {number} width - 图片宽度
     * @param {number} height - 图片高度
     * @returns {string} 警告信息，空字符串表示匹配
     */
    checkImageRatio(displayMode, width, height) {
      if (!displayMode || !width || !height) return ''
      const ranges = {
        wide: { min: 1.6, max: 2.0, label: '16:9 宽屏' },
        horizontal: { min: 1.3, max: 1.6, label: '3:2 横版' },
        square: { min: 0.85, max: 1.3, label: '1:1 方图' },
        tall: { min: 0.5, max: 0.85, label: '3:4 竖图' },
        slim: { min: 0.4, max: 0.6, label: '9:16 窄长图' },
        full_image: null
      }
      const range = ranges[displayMode]
      if (!range) return ''
      const ratio = width / height
      if (ratio >= range.min && ratio <= range.max) return ''
      return `当前图片比例 ${ratio.toFixed(2)}:1，与${range.label}模板有偏差，展示时可能被裁切`
    },

    /**
     * 当 display_mode 变更时，如果已有图片预览则重新校验比例
     */
    onDisplayModeChange() {
      if (!this.bannerImagePreview) return
      this._fullImageConfirmed = false
      const img = new Image()
      img.onload = () => {
        this.ratioWarning = this.checkImageRatio(this.bannerForm.display_mode, img.width, img.height)
      }
      img.src = this.bannerImagePreview
    },

    selectBannerImage(event) {
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

      this.bannerImageFile = file
      this.bannerImagePreview = URL.createObjectURL(file)
      logger.info('弹窗图片已选择:', file.name)

      // 读取图片宽高，校验与所选模板的比例匹配度
      const img = new Image()
      img.onload = () => {
        const warning = this.checkImageRatio(this.bannerForm.display_mode, img.width, img.height)
        this.ratioWarning = warning
        if (warning) {
          logger.warn('[Banner] 图片比例警告:', warning)
        }
      }
      img.src = this.bannerImagePreview
    },

    clearBannerImage() {
      this.bannerImageFile = null
      if (this.bannerImagePreview) {
        URL.revokeObjectURL(this.bannerImagePreview)
        this.bannerImagePreview = ''
      }
      this.bannerForm.image_url = ''
      this.ratioWarning = ''
    },

    async saveBanner() {
      if (this.isEditMode && !this.bannerForm.popup_banner_id) {
        this.showError('弹窗 ID 缺失')
        return
      }

      if (!this.bannerForm.display_mode) {
        this.showError('请选择显示模式')
        return
      }

      if (!this.isEditMode && !this.bannerImageFile) {
        this.showError('请选择弹窗图片')
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

      if (this.bannerForm.display_mode === 'full_image' && !this._fullImageConfirmed) {
        const confirmed = confirm(
          '纯图模式不校验比例，图片将直接作为弹窗展示（无标题栏、无白色卡片壳），请确认图片已包含所有设计元素。确定继续？'
        )
        if (!confirmed) return
        this._fullImageConfirmed = true
      }

      this.saving = true
      try {
        const url = this.isEditMode
          ? buildURL(SYSTEM_ENDPOINTS.POPUP_BANNER_UPDATE, { id: this.bannerForm.popup_banner_id })
          : SYSTEM_ENDPOINTS.POPUP_BANNER_CREATE
        const method = this.isEditMode ? 'PUT' : 'POST'

        const formData = new FormData()
        formData.append('title', this.bannerForm.title?.trim() || '')
        formData.append('display_mode', this.bannerForm.display_mode)
        formData.append('position', this.bannerForm.position || 'home')
        formData.append('display_order', String(this.bannerForm.display_order || 0))
        formData.append('is_active', String(this.bannerForm.is_active))
        formData.append('link_url', this.bannerForm.link_url || '')
        if (this.bannerForm.start_time) formData.append('start_time', this.bannerForm.start_time)
        if (this.bannerForm.end_time) formData.append('end_time', this.bannerForm.end_time)

        formData.append('banner_type', this.bannerForm.banner_type || 'promo')
        formData.append('frequency_rule', this.bannerForm.frequency_rule || 'once_per_day')
        formData.append('frequency_value', String(this.bannerForm.frequency_value || 1))
        formData.append('force_show', String(this.bannerForm.force_show))
        formData.append('priority', String(this.bannerForm.priority || 0))

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
          if (result.data?.ratio_warning) {
            this.showWarning?.('保存成功，但后端提示：' + result.data.ratio_warning) ||
              logger.warn('[Banner] 后端比例警告:', result.data.ratio_warning)
          }
          this.hideModal('bannerModal')
          this.clearBannerImage()
          this._fullImageConfirmed = false
          await this.loadBanners()
          this.showSuccess(this.isEditMode ? '弹窗已更新' : '弹窗已创建')
        } else {
          throw new Error(result.message || '保存失败')
        }
      } catch (error) {
        logger.error('保存弹窗失败:', error)
        this.showError('保存弹窗失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    async toggleBannerStatus(banner) {
      try {
        const newStatus = !banner.is_active
        const response = await this.apiCall(
          buildURL(SYSTEM_ENDPOINTS.POPUP_BANNER_TOGGLE, { id: banner.popup_banner_id }),
          { method: 'PATCH', data: { is_active: newStatus } }
        )
        if (response?.success) {
          this.showSuccess(`弹窗已${newStatus ? '启用' : '禁用'}`)
          await this.loadBanners()
        }
      } catch (_error) {
        this.showError('切换状态失败')
      }
    },

    /**
     * 根据 display_mode 返回对应的 CSS aspect-ratio 值
     * 用于轮播图列表卡片的图片容器
     * @param {string} displayMode
     * @returns {string} inline style
     */
    getBannerAspectStyle(displayMode) {
      const ratios = {
        wide: '16/9',
        horizontal: '3/2',
        square: '1/1',
        tall: '3/4',
        slim: '9/16',
        full_image: 'auto'
      }
      const ratio = ratios[displayMode] || '16/9'
      return `aspect-ratio: ${ratio}; max-height: 320px;`
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
    },

    async viewBannerShowStats(banner) {
      this.bannerShowStatsTarget = banner
      this.bannerShowStats = null
      const today = new Date()
      const weekAgo = new Date(today.getTime() - 7 * 24 * 3600 * 1000)
      this.bannerShowStatsDateRange = {
        start_date: weekAgo.toISOString().slice(0, 10),
        end_date: today.toISOString().slice(0, 10)
      }
      this.showModal('bannerShowStatsModal')
      await this.loadBannerShowStats()
    },

    async loadBannerShowStats() {
      if (!this.bannerShowStatsTarget) return
      this.bannerShowStatsLoading = true
      try {
        const params = new URLSearchParams()
        if (this.bannerShowStatsDateRange.start_date) params.append('start_date', this.bannerShowStatsDateRange.start_date)
        if (this.bannerShowStatsDateRange.end_date) params.append('end_date', this.bannerShowStatsDateRange.end_date)
        const url = buildURL(SYSTEM_ENDPOINTS.POPUP_BANNER_SHOW_STATS, { id: this.bannerShowStatsTarget.popup_banner_id })
        const response = await this.apiGet(`${url}?${params}`)
        if (response?.success) {
          this.bannerShowStats = response.data || {}
        }
      } catch (error) {
        logger.error('加载弹窗展示统计失败:', error)
        this.showError('加载展示统计失败: ' + error.message)
      } finally {
        this.bannerShowStatsLoading = false
      }
    },

    bannerDragStart(index) {
      this.bannerDragIndex = index
      this.bannerDragging = true
    },

    bannerDragOver(event, index) {
      event.preventDefault()
      if (this.bannerDragIndex === null || this.bannerDragIndex === index) return
      const items = [...this.banners]
      const [moved] = items.splice(this.bannerDragIndex, 1)
      items.splice(index, 0, moved)
      this.banners = items
      this.bannerDragIndex = index
    },

    async bannerDragEnd() {
      this.bannerDragging = false
      if (this.bannerDragIndex === null) return
      this.bannerDragIndex = null
      const order_list = this.banners.map((b, i) => ({
        popup_banner_id: b.popup_banner_id,
        display_order: i
      }))
      try {
        const response = await this.apiCall(SYSTEM_ENDPOINTS.POPUP_BANNER_ORDER, {
          method: 'PATCH',
          data: { order_list }
        })
        if (response?.success) {
          this.showSuccess('弹窗排序已保存')
          await this.loadBanners()
        }
      } catch (error) {
        logger.error('保存弹窗排序失败:', error)
        this.showError('保存排序失败: ' + error.message)
        await this.loadBanners()
      }
    }
  }
}






