/**
 * 内容管理中心 - Alpine.js 组件
 *
 * @file admin/src/modules/content/pages/content-management.js
 * @description 内容管理中心页面，整合公告管理、轮播图管理、图片资源管理三个子模块
 * @version 4.0.0 (简化版)
 * @date 2026-01-23
 * @module ContentManagement
 *
 * @requires Alpine.js
 * @requires createPageMixin - 页面基础混入
 * @requires API - API工具类
 * @requires SYSTEM_ENDPOINTS - 系统模块API端点配置
 *
 * 后端API对应：
 * - /api/v4/console/system/announcements (公告管理)
 * - /api/v4/console/popup-banners (轮播图管理)
 * - /api/v4/console/images (图片资源)
 *
 * 功能模块：
 * 1. 公告管理 - 创建、编辑、删除系统公告
 * 2. 轮播图管理 - 管理首页、详情页等位置的轮播图
 * 3. 图片资源 - 统一管理系统图片资源
 *
 * 注意：后端没有 /api/v4/console/notifications API，已移除通知管理功能
 */

import { logger } from '../../../utils/logger.js'
import { buildURL, request, getToken } from '../../../api/base.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
document.addEventListener('alpine:init', () => {
  logger.info('[ContentManagement] 注册 Alpine 组件...')

  /**
   * 内容管理主组件
   *
   * @description 整合公告、轮播图、图片资源管理的综合页面组件
   *
   * @property {string} current_page - 当前激活的子页面ID
   * @property {Array<Object>} subPages - 子页面导航配置
   * @property {Array<Object>} announcements - 公告列表数据
   * @property {Object} announcementForm - 公告表单数据
   * @property {Array<Object>} banners - 轮播图列表数据
   * @property {Object} bannerForm - 轮播图表单数据
   * @property {Array<Object>} images - 图片资源列表
   * @property {boolean} isEditMode - 是否编辑模式
   * @property {boolean} saving - 保存中状态
   * @property {boolean} deleting - 删除中状态
   * @property {Object|null} deleteTarget - 待删除的目标对象
   * @property {string|null} deleteType - 待删除的类型
   *
   * @example
   * // HTML中使用
   * <div x-data="contentManagement()">
   *   <!-- 公告管理内容 -->
   * </div>
   */
  Alpine.data('contentManagement', () => ({
    ...createPageMixin(),

    // ==================== 子页面导航 ====================

    /**
     * 当前激活的子页面ID
     * @type {string}
     */
    current_page: 'announcements',

    /**
     * 子页面导航配置
     * 后端API对应关系：
     * - /api/v4/console/system/announcements (公告管理)
     * - /api/v4/console/popup-banners (弹窗横幅)
     * - /api/v4/console/images (图片资源)
     * @type {Array<{id: string, name: string, icon: string}>}
     */
    subPages: [
      { id: 'announcements', name: '公告管理', icon: '📢' },
      { id: 'popup-banners', name: '轮播图管理', icon: '🎨' },
      { id: 'image-resources', name: '图片资源', icon: '🖼️' }
    ],

    // ==================== 公告相关 ====================

    /**
     * 公告列表数据
     * @type {Array<Object>}
     */
    announcements: [],

    /**
     * 公告表单数据
     * @type {{announcement_id: number|null, title: string, content: string, type: string, priority: string, status: string, expires_at: string}}
     */
    announcementForm: {
      announcement_id: null,
      title: '',
      content: '',
      type: 'notice',
      priority: 'medium',
      status: 'published',
      expires_at: ''
    },

    // ==================== 弹窗横幅相关 ====================

    /**
     * 轮播图列表数据
     * @type {Array<Object>}
     */
    banners: [],

    /**
     * 轮播图表单数据
     * @type {{popup_banner_id: number|null, title: string, position: string, sort_order: number, is_active: boolean, image_url: string, link_url: string, start_time: string, end_time: string}}
     */
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

    /**
     * 待上传的轮播图图片文件（新建时使用）
     * @type {File|null}
     */
    bannerImageFile: null,

    /**
     * 轮播图图片预览URL（本地预览）
     * @type {string}
     */
    bannerImagePreview: '',

    // ==================== 图片资源相关 ====================

    /**
     * 图片资源列表数据
     * @type {Array<Object>}
     */
    images: [],

    // ==================== 通用状态 ====================

    /**
     * 保存操作进行中状态
     * @type {boolean}
     */
    saving: false,

    /**
     * 删除操作进行中状态
     * @type {boolean}
     */
    deleting: false,

    /**
     * 轮播图图片上传中状态
     * @type {boolean}
     */
    uploadingBannerImage: false,

    /**
     * 是否处于编辑模式
     * @type {boolean}
     */
    isEditMode: false,

    /**
     * 待删除的目标对象
     * @type {Object|null}
     */
    deleteTarget: null,

    /**
     * 待删除对象的类型
     * @type {'announcement'|'banner'|'image'|null}
     */
    deleteType: null,

    /**
     * 组件初始化方法
     * @description 页面加载时自动执行，检查认证并加载数据
     * @returns {void}
     */
    init() {
      logger.info('内容管理页面初始化')
      if (!this.checkAuth()) return
      const urlParams = new URLSearchParams(window.location.search)
      this.current_page = urlParams.get('page') || 'announcements'
      this.loadPageData()
    },

    /**
     * 切换子页面
     * @param {string} pageId - 目标子页面ID
     * @description 更新URL参数并加载对应页面数据
     * @returns {void}
     */
    switchPage(pageId) {
      this.current_page = pageId
      const url = new URL(window.location)
      url.searchParams.set('page', pageId)
      window.history.pushState({}, '', url)
      this.loadPageData()
    },

    /**
     * 加载当前页面数据
     * @async
     * @description 根据当前激活的子页面加载对应数据
     * @returns {Promise<void>}
     */
    async loadPageData() {
      logger.info('[ContentManagement] 加载页面数据:', this.current_page)
      switch (this.current_page) {
        case 'announcements':
          await this.loadAnnouncements()
          break
        case 'popup-banners':
          await this.loadBanners()
          break
        case 'image-resources':
          await this.loadImages()
          break
      }
    },

    // ==================== 公告管理方法 ====================

    /**
     * 加载公告列表
     * @async
     * @description 从API获取公告数据并更新列表
     * @returns {Promise<void>}
     */
    async loadAnnouncements() {
      try {
        logger.info('[ContentManagement] 加载公告列表...')
        const response = await this.apiGet(SYSTEM_ENDPOINTS.ANNOUNCEMENT_LIST)
        if (response?.success) {
          this.announcements = response.data?.announcements || []
          logger.info('[ContentManagement] 公告数量:', this.announcements.length)
        }
      } catch (error) {
        logger.error('加载公告失败:', error)
        this.announcements = []
      }
    },

    /**
     * 打开创建公告模态框
     * @description 重置表单并显示公告编辑模态框
     * @returns {void}
     */
    openCreateAnnouncementModal() {
      this.isEditMode = false
      this.announcementForm = {
        announcement_id: null,
        title: '',
        content: '',
        type: 'notice',
        priority: 'medium',
        status: 'published',
        expires_at: ''
      }
      this.showModal('announcementModal')
    },

    /**
     * 编辑公告
     * @param {Object} ann - 要编辑的公告对象
     * @param {number} ann.announcement_id - 公告ID
     * @param {string} ann.title - 公告标题
     * @param {string} ann.content - 公告内容
     * @param {string} ann.type - 公告类型
     * @param {string} ann.priority - 公告优先级
     * @param {boolean} ann.is_active - 是否激活
     * @param {string} ann.expires_at - 过期时间
     * @returns {void}
     */
    editAnnouncement(ann) {
      this.isEditMode = true
      this.announcementForm = {
        announcement_id: ann.announcement_id || ann.id,
        title: ann.title || '',
        content: ann.content || '',
        type: ann.type || 'notice',
        priority: ann.priority || 'medium',
        status: ann.is_active ? 'published' : 'draft',
        expires_at: ann.expires_at || ''
      }
      this.showModal('announcementModal')
    },

    /**
     * 保存公告
     * @async
     * @description 验证表单并提交公告数据（创建或更新）
     * @returns {Promise<void>}
     */
    async saveAnnouncement() {
      if (!this.announcementForm.title?.trim()) {
        this.showError('请输入公告标题')
        return
      }
      if (!this.announcementForm.content?.trim()) {
        this.showError('请输入公告内容')
        return
      }

      this.saving = true
      try {
        const payload = {
          title: this.announcementForm.title.trim(),
          content: this.announcementForm.content.trim(),
          type: this.announcementForm.type,
          priority: this.announcementForm.priority,
          is_active: this.announcementForm.status === 'published',
          expires_at: this.announcementForm.expires_at || null
        }

        const url = this.isEditMode
          ? buildURL(SYSTEM_ENDPOINTS.ANNOUNCEMENT_UPDATE, {
              id: this.announcementForm.announcement_id
            })
          : SYSTEM_ENDPOINTS.ANNOUNCEMENT_CREATE
        const method = this.isEditMode ? 'PUT' : 'POST'

        // 使用 data 属性，request() 函数会自动 JSON.stringify
        const response = await this.apiCall(url, { method, data: payload })

        if (response?.success) {
          this.hideModal('announcementModal')
          await this.loadAnnouncements()
          this.showSuccess(this.isEditMode ? '公告已更新' : '公告已发布')
        }
      } catch (error) {
        logger.error('保存公告失败:', error)
        this.showError('保存公告失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    /**
     * 删除公告
     * @async
     * @param {Object} ann - 要删除的公告对象
     * @description 设置删除目标并显示确认模态框
     * @returns {Promise<void>}
     */
    async deleteAnnouncement(ann) {
      this.deleteTarget = ann
      this.deleteType = 'announcement'
      this.showModal('deleteModal')
    },

    // ==================== 轮播图管理方法 ====================

    /**
     * 轮播图筛选条件
     * @type {{position: string, status: string}}
     */
    bannerFilters: { position: '', status: '' },

    /**
     * 轮播图统计数据
     * @type {{total: number, active: number, positions: Object}}
     */
    bannerStats: { total: 0, active: 0, positions: {} },

    /**
     * 加载轮播图列表
     * @async
     * @description 从API获取轮播图数据并计算统计信息
     * @returns {Promise<void>}
     */
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
          // 计算统计
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

    /**
     * 打开创建轮播图模态框
     * @description 重置表单并显示轮播图编辑模态框
     * @returns {void}
     */
    openCreateBannerModal() {
      this.isEditMode = false
      // 清理之前的文件选择状态
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

    /**
     * 编辑轮播图
     * @param {Object} banner - 要编辑的轮播图对象
     * @param {number} banner.popup_banner_id - 轮播图ID
     * @param {string} banner.title - 标题
     * @param {string} banner.position - 显示位置
     * @param {number} banner.display_order - 排序
     * @param {boolean} banner.is_active - 是否激活
     * @param {string} banner.image_url - 图片地址
     * @param {string} banner.link_url - 链接地址
     * @param {string} banner.start_time - 开始时间
     * @param {string} banner.end_time - 结束时间
     * @returns {void}
     */
    editBanner(banner) {
      this.isEditMode = true
      // 清理之前的文件选择状态
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

    /**
     * 上传轮播图图片
     * @async
     * @param {Event} event - 文件选择事件
     * @description 上传图片到服务器并获取URL
     * @returns {Promise<void>}
     */
    /**
     * 选择轮播图图片（暂存文件，本地预览）
     * 后端 popup-banners 接口使用 multipart/form-data，需要在保存时一起发送文件
     */
    selectBannerImage(event) {
      const file = event.target.files?.[0]
      if (!file) return

      // 验证文件类型
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!allowedTypes.includes(file.type)) {
        this.showError('不支持的图片格式，请选择 JPG/PNG/GIF/WebP')
        event.target.value = ''
        return
      }

      // 验证文件大小 (5MB)
      if (file.size > 5 * 1024 * 1024) {
        this.showError('图片大小不能超过 5MB')
        event.target.value = ''
        return
      }

      // 暂存文件
      this.bannerImageFile = file
      // 生成本地预览URL
      this.bannerImagePreview = URL.createObjectURL(file)
      logger.info('轮播图图片已选择:', file.name)
    },

    /**
     * 清除选择的轮播图图片
     */
    clearBannerImage() {
      this.bannerImageFile = null
      if (this.bannerImagePreview) {
        URL.revokeObjectURL(this.bannerImagePreview)
        this.bannerImagePreview = ''
      }
      this.bannerForm.image_url = ''
    },

    /**
     * 保存轮播图
     * @async
     * @description 验证表单并提交轮播图数据（创建或更新）
     * @returns {Promise<void>}
     */
    async saveBanner() {
      // 调试日志
      logger.info('saveBanner 调用:', {
        isEditMode: this.isEditMode,
        hasImageFile: !!this.bannerImageFile,
        imageFileType: this.bannerImageFile ? this.bannerImageFile.constructor.name : 'null',
        imageFileName: this.bannerImageFile ? this.bannerImageFile.name : 'null',
        imageFileSize: this.bannerImageFile ? this.bannerImageFile.size : 0,
        bannerFormTitle: this.bannerForm.title,
        bannerFormImageUrl: this.bannerForm.image_url
      })

      // 编辑时必须有 popup_banner_id
      if (this.isEditMode && !this.bannerForm.popup_banner_id) {
        this.showError('轮播图 ID 缺失')
        return
      }

      // 新建时必须有图片文件，编辑时可选
      if (!this.isEditMode && !this.bannerImageFile) {
        this.showError('请选择轮播图图片')
        return
      }

      // 验证图片文件是否是有效的 File 对象
      if (!this.isEditMode && !(this.bannerImageFile instanceof File)) {
        logger.error('bannerImageFile 不是有效的 File 对象:', this.bannerImageFile)
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

        // 使用 FormData 发送（后端使用 multer 接收）
        const formData = new FormData()
        formData.append('title', this.bannerForm.title?.trim() || '')
        formData.append('position', this.bannerForm.position || 'home')
        formData.append('display_order', String(this.bannerForm.sort_order || 0))
        formData.append('is_active', String(this.bannerForm.is_active))
        formData.append('link_url', this.bannerForm.link_url || '')
        if (this.bannerForm.start_time) {
          formData.append('start_time', this.bannerForm.start_time)
        }
        if (this.bannerForm.end_time) {
          formData.append('end_time', this.bannerForm.end_time)
        }

        // 如果有新选择的图片文件，添加到 FormData
        if (this.bannerImageFile) {
          logger.info('正在添加图片到 FormData:', {
            name: this.bannerImageFile.name,
            type: this.bannerImageFile.type,
            size: this.bannerImageFile.size
          })
          formData.append('image', this.bannerImageFile, this.bannerImageFile.name)
        }

        // 直接使用 fetch 发送 FormData（不能用 JSON）
        const token = getToken()
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        })

        const result = await response.json()
        if (result.success) {
          this.hideModal('bannerModal')
          this.clearBannerImage() // 清理暂存的文件
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

    /**
     * 切换轮播图状态
     * @async
     * @param {Object} banner - 轮播图对象
     * @param {number} banner.popup_banner_id - 轮播图ID
     * @param {boolean} banner.is_active - 当前状态
     * @description 启用或禁用轮播图
     * @returns {Promise<void>}
     */
    async toggleBannerStatus(banner) {
      try {
        const newStatus = !banner.is_active
        const response = await this.apiCall(
          buildURL(SYSTEM_ENDPOINTS.POPUP_BANNER_TOGGLE, { id: banner.popup_banner_id }),
          {
            method: 'POST',
            data: { is_active: newStatus }
          }
        )
        if (response?.success) {
          this.showSuccess(`轮播图已${newStatus ? '启用' : '禁用'}`)
          await this.loadBanners()
        }
      } catch (error) {
        this.showError('切换状态失败')
      }
    },

    /**
     * 预览轮播图
     * @param {Object} banner - 轮播图对象
     * @param {string} banner.image_url - 图片URL
     * @description 在新窗口中打开轮播图图片进行预览
     * @returns {void}
     */
    previewBanner(banner) {
      const url = banner.image_url
      if (url) {
        window.open(url, '_blank')
      }
    },

    /**
     * 删除轮播图
     * @async
     * @param {Object} banner - 要删除的轮播图对象
     * @description 设置删除目标并显示确认模态框
     * @returns {Promise<void>}
     */
    async deleteBanner(banner) {
      this.deleteTarget = banner
      this.deleteType = 'banner'
      this.showModal('deleteModal')
    },

    /**
     * 获取位置文本
     * @param {string} position - 位置代码
     * @returns {string} 位置的中文名称
     */
    // ✅ 已删除 getPositionText 映射函数 - 改用后端 _display 字段（P2 中文化）

    /**
     * 格式化日期时间为local格式
     * @param {string} dateStr - 日期字符串
     * @returns {string} 格式化后的日期时间字符串，用于datetime-local输入框
     */
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

    // ==================== 图片资源方法 ====================

    /**
     * 图片筛选条件
     * @type {{type: string, keyword: string}}
     */
    imageFilters: { type: '', keyword: '' },

    /**
     * 图片统计数据
     * @type {{total: number, totalSize: number}}
     */
    imageStats: { total: 0, totalSize: 0, weekly_uploads: 0, orphan_count: 0 },

    /**
     * 当前选中的图片
     * @type {Object|null}
     */
    selectedImage: null,

    /**
     * 上传进行中状态
     * @type {boolean}
     */
    uploading: false,

    /**
     * 加载图片列表
     * @async
     * @description 从API获取图片数据并计算统计信息
     * @returns {Promise<void>}
     */
    async loadImages() {
      try {
        logger.info('[ContentManagement] 加载图片列表...')
        const params = new URLSearchParams()
        if (this.imageFilters?.type) params.append('type', this.imageFilters.type)
        if (this.imageFilters?.keyword) params.append('keyword', this.imageFilters.keyword)

        const response = await this.apiGet(`${SYSTEM_ENDPOINTS.IMAGE_LIST}?${params}`)
        if (response?.success) {
          this.images = response.data?.list || response.data?.images || []
          logger.info('[ContentManagement] 图片数量:', this.images.length)
          // 计算统计
          this.imageStats = {
            total: this.images.length,
            totalSize: this.images.reduce((sum, img) => sum + (img.size || img.file_size || 0), 0)
          }
        }
      } catch (error) {
        logger.error('加载图片失败:', error)
        this.images = []
      }
    },

    /**
     * 打开上传图片模态框
     * @description 显示图片上传模态框
     * @returns {void}
     */
    openUploadImageModal() {
      this.showModal('uploadImageModal')
    },

    /**
     * 处理图片上传事件
     * @param {Event} event - 文件选择事件
     * @description 验证文件类型和大小后上传图片
     * @returns {void}
     */
    handleImageUpload(event) {
      const file = event.target.files?.[0]
      if (!file) return

      // 验证文件类型
      if (!file.type.startsWith('image/')) {
        this.showError('请选择图片文件')
        return
      }

      // 验证文件大小 (5MB)
      if (file.size > 5 * 1024 * 1024) {
        this.showError('图片大小不能超过5MB')
        return
      }

      // 上传图片
      this.uploadImage(file)
    },

    /**
     * 上传图片
     * @async
     * @param {File} file - 要上传的图片文件
     * @description 将图片文件上传到服务器
     * @returns {Promise<void>}
     */
    async uploadImage(file) {
      this.uploading = true
      try {
        const formData = new FormData()
        formData.append('image', file)
        formData.append('business_type', 'uploads') // 必填参数：业务类型
        formData.append('category', 'general') // 可选参数：资源分类

        const response = await fetch(SYSTEM_ENDPOINTS.IMAGE_UPLOAD, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('admin_token')}`
          },
          body: formData
        })

        const result = await response.json()

        if (result?.success) {
          this.hideModal('uploadImageModal')
          await this.loadImages()
          this.showSuccess('图片上传成功')
        } else {
          this.showError(result?.message || '上传失败')
        }
      } catch (error) {
        logger.error('上传图片失败:', error)
        this.showError('上传失败: ' + error.message)
      } finally {
        this.uploading = false
      }
    },

    /**
     * 查看图片详情
     * @param {Object} image - 图片对象
     * @description 选中图片并显示详情模态框
     * @returns {void}
     */
    viewImage(image) {
      this.selectedImage = image
      this.showModal('imageDetailModal')
    },

    /**
     * 在新窗口打开图片
     * @param {Object} image - 图片对象
     * @param {string} image.url - 图片URL
     * @returns {void}
     */
    openImageInNewTab(image) {
      if (image.url) {
        window.open(image.url, '_blank')
      }
    },

    /**
     * 复制图片链接
     * @async
     * @param {Object} image - 图片对象
     * @param {string} image.url - 图片URL
     * @description 将图片链接复制到剪贴板
     * @returns {Promise<void>}
     */
    async copyImageUrl(image) {
      const url = image.url
      if (url) {
        try {
          await navigator.clipboard.writeText(url)
          this.showSuccess('链接已复制')
        } catch {
          this.showError('复制失败，请手动复制')
        }
      }
    },

    /**
     * 删除图片
     * @async
     * @param {Object} image - 要删除的图片对象
     * @description 设置删除目标并显示确认模态框
     * @returns {Promise<void>}
     */
    async deleteImage(image) {
      this.deleteTarget = image
      this.deleteType = 'image'
      this.showModal('deleteModal')
    },

    /**
     * 搜索图片
     * @description 根据当前筛选条件重新加载图片列表
     * @returns {void}
     */
    searchImages() {
      this.loadImages()
    },

    /**
     * 重置图片筛选
     * @description 清空筛选条件并重新加载图片列表
     * @returns {void}
     */
    resetImageFilters() {
      this.imageFilters = { business_type: '', status: '' }
      this.loadImages()
    },

    /**
     * 获取图片类型文本
     * @param {string} type - 图片类型代码
     * @returns {string} 图片类型的中文名称
     */
    // ✅ 已删除 getImageTypeText 映射函数 - 改用后端 _display 字段（P2 中文化）

    // ==================== 通用删除确认 ====================

    /**
     * 确认删除操作
     * @async
     * @description 根据删除类型执行相应的删除API调用
     * @returns {Promise<void>}
     */
    async confirmDelete() {
      if (!this.deleteTarget || !this.deleteType) return

      this.deleting = true
      try {
        let url = ''
        let successMsg = ''
        const targetId =
          this.deleteTarget.system_announcement_id ||
          this.deleteTarget.popup_banner_id ||
          this.deleteTarget.image_resource_id

        switch (this.deleteType) {
          case 'announcement':
            url = buildURL(SYSTEM_ENDPOINTS.ANNOUNCEMENT_DELETE, { id: targetId })
            successMsg = '公告已删除'
            break
          case 'banner':
            url = buildURL(SYSTEM_ENDPOINTS.POPUP_BANNER_DELETE, { id: targetId })
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
    },

    // ==================== 辅助方法 ====================

    /**
     * 格式化文件大小
     * @param {number} bytes - 字节数
     * @returns {string} 格式化后的文件大小字符串
     */
    formatFileSize(bytes) {
      if (!bytes) return '0 B'
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
    }
  }))

  logger.info('[ContentManagementPage] Alpine 组件已注册 (Mixin v3.0)')
})

logger.info('[ContentManagement] 页面脚本已加载 (Mixin v3.0)')
