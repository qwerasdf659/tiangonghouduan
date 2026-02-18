/**
 * 内容管理中心 - Alpine.js 组件
 *
 * @file admin/src/modules/content/pages/content-management.js
 * @description 内容管理中心页面，整合公告管理、弹窗管理、轮播图管理、图片资源管理四个子模块
 * @version 4.1.0 (Composable 重构版)
 * @date 2026-02-06
 */

import { logger } from '../../../utils/logger.js'
import { buildURL } from '../../../api/base.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'
import { Alpine, createPageMixin, dataTable } from '../../../alpine/index.js'
import { request } from '../../../api/base.js'
import {
  useAllContentManagementState,
  useAllContentManagementMethods
} from '../composables/index.js'

document.addEventListener('alpine:init', () => {
  logger.info('[ContentManagement] 注册 Alpine 组件...')

  Alpine.data('contentManagement', () => ({
    ...createPageMixin(),

    // ==================== Composables ====================
    ...useAllContentManagementState(),
    ...useAllContentManagementMethods(),

    // ==================== 子页面导航 ====================
    current_page: 'announcements',
    subPages: [
      { id: 'announcements', name: '公告管理', icon: '📢' },
      { id: 'popup-banners', name: '弹窗管理', icon: '🔔' },
      { id: 'carousel-items', name: '轮播图管理', icon: '🎨' },
      { id: 'image-resources', name: '图片资源', icon: '🖼️' }
    ],

    // ==================== 通用状态 ====================
    saving: false,
    deleting: false,
    isEditMode: false,
    deleteTarget: null,
    deleteType: null,

    init() {
      logger.info('内容管理页面初始化')
      if (!this.checkAuth()) return
      const urlParams = new URLSearchParams(window.location.search)
      this.current_page = urlParams.get('page') || 'announcements'
      this.loadPageData()
      this._loadAllStats()
    },

    /** 加载所有模块统计（用于概览卡片） */
    async _loadAllStats() {
      try {
        const [bannersRes, carouselsRes, imagesRes] = await Promise.allSettled([
          this.apiGet(SYSTEM_ENDPOINTS.POPUP_BANNER_LIST),
          this.apiGet(SYSTEM_ENDPOINTS.CAROUSEL_ITEM_LIST),
          this.apiGet(SYSTEM_ENDPOINTS.IMAGE_LIST)
        ])
        if (bannersRes.status === 'fulfilled' && bannersRes.value?.success) {
          const banners = bannersRes.value.data?.banners || []
          this.bannerStats = { total: banners.length, active: banners.filter(b => b.is_active).length }
        }
        if (carouselsRes.status === 'fulfilled' && carouselsRes.value?.success) {
          const items = carouselsRes.value.data?.carousel_items || []
          this.carouselStats = { total: items.length, active: items.filter(c => c.is_active).length }
        }
        if (imagesRes.status === 'fulfilled' && imagesRes.value?.success) {
          const imgs = imagesRes.value.data?.images || []
          this.imageStats = { total: imgs.length }
        }
      } catch (e) {
        logger.warn('[ContentManagement] 加载统计概览失败:', e.message)
      }
    },

    switchPage(pageId) {
      this.current_page = pageId
      const url = new URL(window.location)
      url.searchParams.set('page', pageId)
      window.history.pushState({}, '', url)
      this.loadPageData()
    },

    async loadPageData() {
      logger.info('[ContentManagement] 加载页面数据:', this.current_page)
      switch (this.current_page) {
        case 'announcements':
          await this.loadAnnouncements()
          break
        case 'popup-banners':
          await this.loadBanners()
          break
        case 'carousel-items':
          await this.loadCarouselItems()
          break
        case 'image-resources':
          await this.loadImages()
          break
      }
    },

    // ==================== 通用删除确认 ====================

    async confirmDelete() {
      if (!this.deleteTarget || !this.deleteType) return

      this.deleting = true
      try {
        let url = ''
        let successMsg = ''
        const targetId =
          this.deleteTarget.system_announcement_id ||
          this.deleteTarget.popup_banner_id ||
          this.deleteTarget.carousel_item_id ||
          this.deleteTarget.image_resource_id

        switch (this.deleteType) {
          case 'announcement':
            url = buildURL(SYSTEM_ENDPOINTS.ANNOUNCEMENT_DELETE, { id: targetId })
            successMsg = '公告已删除'
            break
          case 'banner':
            url = buildURL(SYSTEM_ENDPOINTS.POPUP_BANNER_DELETE, { id: targetId })
            successMsg = '弹窗已删除'
            break
          case 'carousel':
            url = buildURL(SYSTEM_ENDPOINTS.CAROUSEL_ITEM_DELETE, { id: targetId })
            successMsg = '轮播图已删除'
            break
          case 'image':
            url = buildURL(SYSTEM_ENDPOINTS.IMAGE_DELETE, { id: targetId })
            successMsg = '图片已删除'
            break
        }

        const response = await this.apiCall(url, { method: 'DELETE' })

        if (response?.success) {
          this.hideModal('deleteModal')
          await this.loadPageData()
          this.showSuccess(successMsg)
        }
      } catch (error) {
        logger.error('删除失败:', error)
        this.showError('删除失败: ' + error.message)
      } finally {
        this.deleting = false
        this.deleteTarget = null
        this.deleteType = null
      }
    }
  }))

  /**
   * 公告列表 - data-table 组件
   */
  Alpine.data('announcementsTable', () => {
    const table = dataTable({
      columns: [
        { key: 'system_announcement_id', label: '公告ID', sortable: true },
        { key: 'title', label: '标题', sortable: true },
        { key: 'type', label: '类型', type: 'badge', badgeMap: { notice: 'blue', alert: 'red', info: 'gray' }, labelMap: { notice: '通知', alert: '警告', info: '信息' } },
        { key: 'is_active', label: '状态', type: 'status', statusMap: { true: { class: 'green', label: '已发布' }, false: { class: 'gray', label: '草稿' } } },
        { key: 'created_at', label: '创建时间', type: 'datetime', sortable: true }
      ],
      dataSource: async (params) => {
        const res = await request({ url: SYSTEM_ENDPOINTS.ANNOUNCEMENT_LIST, method: 'GET', params })
        return {
          items: res.data?.list || res.data?.announcements || res.data || [],
          total: res.data?.pagination?.total || res.data?.total || 0
        }
      },
      primaryKey: 'system_announcement_id',
      sortable: true,
      page_size: 20
    })
    const origInit = table.init
    table.init = async function () {
      window.addEventListener('refresh-announcements', () => this.loadData())
      if (origInit) await origInit.call(this)
    }
    return table
  })

  logger.info('[ContentManagementPage] Alpine 组件已注册 (Composable v4.1 + data-table)')
})

logger.info('[ContentManagement] 页面脚本已加载 (Composable v4.1)')
