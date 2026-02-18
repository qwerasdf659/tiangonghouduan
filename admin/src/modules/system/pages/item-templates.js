/**
 * 物品模板管理页面 Alpine.js 组件
 *
 * @file admin/src/modules/system/pages/item-templates.js
 * @module ItemTemplatesPage
 * @version 3.0.0
 * @date 2026-01-23
 * @author Admin System
 *
 * @description
 * 物品模板管理页面，提供以下功能：
 * - 物品模板列表展示和搜索筛选
 * - 物品模板的创建、编辑和删除
 * - 按类型、稀有度、状态筛选
 * - 模板统计信息展示
 *
 * @requires createCrudMixin - CRUD操作基础Mixin
 * @requires ASSET_ENDPOINTS - 资产API端点配置
 * @requires apiRequest - API请求工具函数
 * @requires showLoading - 显示全局loading
 * @requires hideLoading - 隐藏全局loading
 *
 * @example
 * // HTML中使用
 * <div x-data="itemTemplatesPage">
 *   <template x-for="template in templates">
 *     <div @click="editTemplate(template.item_template_id)">...</div>
 *   </template>
 * </div>
 */

import { logger, $confirmDanger } from '../../../utils/index.js'
import { ASSET_ENDPOINTS } from '../../../api/asset.js'
import { SYSTEM_ADMIN_ENDPOINTS } from '../../../api/system/admin.js'
import { buildURL, request } from '../../../api/base.js'
import { createCrudMixin } from '../../../alpine/mixins/index.js'

// API请求封装
const apiRequest = async (url, options = {}) => {
  return await request({ url, ...options })
}

// 加载状态辅助函数（使用Alpine store或组件自身状态）
function showLoading() {
  if (typeof Alpine !== 'undefined' && Alpine.store && Alpine.store('ui')) {
    try {
      Alpine.store('ui').setLoading(true)
    } catch (_e) {
      // 忽略
    }
  }
}

function hideLoading() {
  if (typeof Alpine !== 'undefined' && Alpine.store && Alpine.store('ui')) {
    try {
      Alpine.store('ui').setLoading(false)
    } catch (_e) {
      // 忽略
    }
  }
}
document.addEventListener('alpine:init', () => {
  // 使用 createCrudMixin 获取标准功能
  const baseMixin =
    typeof createCrudMixin === 'function'
      ? createCrudMixin({ enableFormValidation: true, enablePagination: false })
      : {}

  /**
   * 物品模板管理页面Alpine.js组件
   * @component itemTemplatesPage
   * @description 物品模板的CRUD管理组件
   * @mixes createCrudMixin
   *
   * @property {Array<Object>} templates - 物品模板列表
   * @property {Object} filters - 筛选条件
   * @property {Object} stats - 统计数据
   * @property {Object} form - 表单数据
   * @property {boolean} is_submitting - 是否正在提交
   * @property {Object} typeIcons - 类型图标映射
   * @property {Object} rarityLabels - 稀有度标签映射
   */
  Alpine.data('itemTemplatesPage', () => ({
    ...baseMixin,

    /** @type {boolean} 页面加载状态 */
    loading: false,

    /** @type {Array<Object>} 物品模板列表 */
    templates: [],
    filters: {
      type: '',
      rarity: '',
      status: '',
      search: ''
    },
    stats: {
      total: 0,
      types: 0,
      active: 0,
      rarities: 0
    },
    form: {
      template_id: '',
      display_name: '',
      template_code: '',
      item_type: 'voucher',
      rarity_code: 'common',
      is_enabled: true,
      image_url: '',
      reference_price_points: 0,
      description: '',
      meta: ''
    },
    is_submitting: false,
    /** @type {string|null} 图片上传预览URL */
    image_preview_url: null,
    /** @type {boolean} 图片上传中 */
    image_uploading: false,
    typeIcons: {
      voucher: '🎫',
      coupon: '🎫',
      points: '💰',
      gift: '🎁',
      virtual: '✨',
      material: '📦'
    },
    rarityLabels: {
      common: '普通',
      uncommon: '优良',
      rare: '稀有',
      epic: '史诗',
      legendary: '传说'
    },

    /**
     * 组件初始化方法
     * @description 组件挂载时自动调用，加载物品模板列表
     * @returns {void}
     */
    init() {
      this.loadTemplates()
    },

    /**
     * 获取物品类型对应的图标
     * @param {string} itemType - 物品类型标识
     * @returns {string} 对应的emoji图标
     * @example
     * getTypeIcon('voucher') // '🎫'
     * getTypeIcon('gift')    // '🎁'
     */
    getTypeIcon(itemType) {
      return this.typeIcons[itemType] || '📦'
    },

    /**
     * 获取稀有度的显示标签
     * @param {string} rarityCode - 稀有度编码
     * @param {Object} [rarityObj] - 稀有度对象（可选，包含display_name）
     * @returns {string} 稀有度显示名称
     * @example
     * getRarityLabel('common')        // '普通'
     * getRarityLabel('rare', {display_name: '稀有'}) // '稀有'
     */
    getRarityLabel(rarityCode, rarityObj) {
      if (rarityObj && rarityObj.display_name) {
        return rarityObj.display_name
      }
      return this.rarityLabels[rarityCode] || '普通'
    },

    /**
     * 截断文本并添加省略号
     * @param {string} text - 原始文本
     * @param {number} maxLength - 最大长度
     * @returns {string} 截断后的文本
     * @example
     * truncateText('这是一个很长的文本', 5) // '这是一个很...'
     */
    truncateText(text, maxLength) {
      if (!text) return ''
      return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
    },

    /**
     * 加载物品模板列表
     * @async
     * @description 根据筛选条件从后端获取物品模板列表
     * @returns {Promise<void>}
     * @fires ASSET_ENDPOINTS.ITEM_TEMPLATE_LIST
     */
    async loadTemplates() {
      this.loading = true
      showLoading()
      try {
        const params = new URLSearchParams()
        if (this.filters.type) params.append('item_type', this.filters.type)
        if (this.filters.rarity) params.append('rarity_code', this.filters.rarity)
        if (this.filters.status)
          params.append('is_enabled', this.filters.status === 'active' ? 'true' : 'false')
        if (this.filters.search) params.append('keyword', this.filters.search)

        const url =
          ASSET_ENDPOINTS.ITEM_TEMPLATE_LIST + (params.toString() ? `?${params.toString()}` : '')
        logger.info('请求物品模板列表:', url)
        const response = await apiRequest(url)
        logger.info('物品模板列表响应:', response)

        if (response && response.success) {
          this.templates = response.data.list || response.data.templates || []
          this.updateStats(response.data.pagination || {})
          logger.info('加载到物品模板:', this.templates.length, '个')
          // 搜索完成反馈
          const hasFilters =
            this.filters.type || this.filters.rarity || this.filters.status || this.filters.search
          if (hasFilters) {
            this.showInfo(`搜索完成，找到 ${this.templates.length} 个模板`)
          }
        } else {
          this.showError('加载失败', response?.message || '获取物品模板失败')
        }
      } catch (error) {
        logger.error('加载物品模板失败:', error)
        this.showError('加载失败', error.message)
      } finally {
        this.loading = false
        hideLoading()
      }
    },

    /**
     * 更新统计信息
     * @param {Object} pagination - 分页信息对象
     * @param {number} [pagination.total_count] - 总数量
     * @description 根据当前模板列表计算统计数据
     * @returns {void}
     */
    updateStats(pagination) {
      this.stats.total = pagination.total_count || this.templates.length
      this.stats.types = new Set(this.templates.map(t => t.item_type)).size
      this.stats.active = this.templates.filter(t => t.is_enabled).length
      this.stats.rarities =
        new Set(this.templates.map(t => t.rarity_code).filter(Boolean)).size || '-'
    },

    /**
     * 重置筛选条件
     * @description 清空所有筛选条件并重新加载列表
     * @returns {void}
     */
    resetFilters() {
      logger.info('[resetFilters] 重置筛选条件')
      this.filters = {
        type: '',
        rarity: '',
        status: '',
        search: ''
      }
      this.loadTemplates()
      this.showInfo('筛选条件已重置')
    },

    /**
     * 打开创建模板模态框
     * @description 重置表单并显示创建模板的模态框
     * @returns {void}
     */
    openCreateModal() {
      logger.info('[openCreateModal] 初始化表单')
      this.form = {
        template_id: '',
        display_name: '',
        template_code: '',
        item_type: 'voucher',
        rarity_code: 'common',
        is_enabled: true,
        image_url: '',
        reference_price_points: 0,
        description: '',
        meta: ''
      }
      this.image_preview_url = null
      logger.info('[openCreateModal] 表单已初始化:', JSON.stringify(this.form))
      this.showModal('templateModal')
    },

    /**
     * 编辑物品模板
     * @async
     * @param {number|string} templateId - 模板ID
     * @description 获取模板详情并填充到表单中，然后显示编辑模态框
     * @returns {Promise<void>}
     * @fires ASSET_ENDPOINTS.ITEM_TEMPLATE_DETAIL
     */
    async editTemplate(templateId) {
      this.loading = true
      showLoading()
      try {
        const response = await apiRequest(
          buildURL(ASSET_ENDPOINTS.ITEM_TEMPLATE_DETAIL, { id: templateId })
        )
        if (response && response.success) {
          const t = response.data
          this.form = {
            template_id: t.item_template_id,
            display_name: t.display_name || '',
            template_code: t.template_code || '',
            item_type: t.item_type || 'voucher',
            rarity_code: t.rarity_code || 'common',
            is_enabled: t.is_enabled,
            image_url: t.image_url || '',
            reference_price_points: t.reference_price_points || 0,
            description: t.description || '',
            meta: t.meta ? JSON.stringify(t.meta, null, 2) : ''
          }
          this.image_preview_url = t.image_url || null
          this.showModal('templateModal')
        } else {
          this.showError('加载失败', response?.message || '获取模板详情失败')
        }
      } catch (error) {
        logger.error('加载模板详情失败:', error)
        this.showError('加载失败', error.message)
      } finally {
        this.loading = false
        hideLoading()
      }
    },

    /**
     * 提交模板表单（创建或更新）
     * @async
     * @description 验证表单数据并提交到后端，根据templateId判断是创建还是更新
     * @returns {Promise<void>}
     * @throws {Error} 当JSON格式错误或必填字段缺失时
     * @fires ASSET_ENDPOINTS.ITEM_TEMPLATE_CREATE
     * @fires ASSET_ENDPOINTS.ITEM_TEMPLATE_UPDATE
     */
    async submitTemplate() {
      if (this.is_submitting) return

      // 🔍 调试日志：全面诊断表单状态
      logger.info('[submitTemplate] ========== 开始提交 ==========')
      logger.info('[submitTemplate] this 类型:', typeof this)
      logger.info('[submitTemplate] this.form 存在:', !!this.form)
      logger.info('[submitTemplate] this.form 类型:', typeof this.form)
      logger.info('[submitTemplate] this.form 完整内容:', JSON.stringify(this.form, null, 2))
      logger.info('[submitTemplate] display_name 值:', this.form?.display_name)
      logger.info('[submitTemplate] display_name 类型:', typeof this.form?.display_name)
      logger.info('[submitTemplate] template_code 值:', this.form?.template_code)
      logger.info('[submitTemplate] template_code 类型:', typeof this.form?.template_code)
      logger.info('[submitTemplate] form 所有键:', Object.keys(this.form || {}).join(', '))

      let meta = null
      try {
        if (this.form.meta && this.form.meta.trim()) {
          meta = JSON.parse(this.form.meta)
        }
      } catch (_e) {
        this.showError('格式错误', '扩展属性JSON格式错误')
        return
      }

      const data = {
        display_name: this.form.display_name,
        template_code: this.form.template_code,
        item_type: this.form.item_type,
        rarity_code: this.form.rarity_code,
        is_enabled: this.form.is_enabled,
        image_url: this.form.image_url || null,
        reference_price_points: this.form.reference_price_points || 0,
        description: this.form.description || null,
        meta: meta
      }

      if (!data.display_name || !data.template_code) {
        logger.error(
          '[submitTemplate] 验证失败 - display_name:',
          data.display_name,
          'template_code:',
          data.template_code
        )
        this.showError('验证失败', '请填写模板名称和编码')
        return
      }

      this.is_submitting = true
      this.loading = true
      showLoading()
      try {
        const url = this.form.template_id
          ? buildURL(ASSET_ENDPOINTS.ITEM_TEMPLATE_UPDATE, { id: this.form.template_id })
          : ASSET_ENDPOINTS.ITEM_TEMPLATE_CREATE
        const method = this.form.template_id ? 'PUT' : 'POST'

        const response = await apiRequest(url, { method, data })

        if (response && response.success) {
          this.hideModal('templateModal')
          this.showSuccess(`${this.form.template_id ? '更新' : '创建'}成功`)
          this.loadTemplates()
        } else {
          this.showError('保存失败', response?.message || '操作失败')
        }
      } catch (error) {
        logger.error('保存模板失败:', error)
        this.showError('保存失败', error.message)
      } finally {
        this.is_submitting = false
        this.loading = false
        hideLoading()
      }
    },

    /**
     * 删除物品模板
     * @async
     * @param {number|string} templateId - 模板ID
     * @description 确认后删除指定的物品模板
     * @returns {Promise<void>}
     * @fires ASSET_ENDPOINTS.ITEM_TEMPLATE_DELETE
     */
    async deleteTemplate(templateId) {
      if (!(await $confirmDanger('确定要删除此物品模板吗？此操作不可恢复！'))) return

      this.loading = true
      showLoading()
      try {
        const response = await apiRequest(
          buildURL(ASSET_ENDPOINTS.ITEM_TEMPLATE_DELETE, { id: templateId }),
          {
            method: 'DELETE'
          }
        )

        if (response && response.success) {
          this.showSuccess('删除成功')
          this.loadTemplates()
        } else {
          this.showError('删除失败', response?.message || '操作失败')
        }
      } catch (error) {
        logger.error('删除模板失败:', error)
        this.showError('删除失败', error.message)
      } finally {
        this.loading = false
        hideLoading()
      }
    },

    /**
     * 上传物品模板图片
     *
     * 上传成功后将 object_key 写入 form.image_url，
     * 后端 ImageUrlHelper 在 API 响应时自动拼接为完整公网 URL。
     *
     * @param {Event} event - 文件选择事件
     * @returns {Promise<void>}
     */
    async uploadTemplateImage(event) {
      const file = event.target.files?.[0]
      if (!file) return

      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!allowedTypes.includes(file.type)) {
        this.showError('格式错误', '仅支持 JPG/PNG/GIF/WebP 格式')
        return
      }

      if (file.size > 5 * 1024 * 1024) {
        this.showError('文件过大', '图片大小不能超过 5MB')
        return
      }

      try {
        this.image_uploading = true

        const formData = new FormData()
        formData.append('image', file)
        formData.append('business_type', 'uploads')
        formData.append('category', 'items')

        const token = localStorage.getItem('token')
        const response = await fetch(SYSTEM_ADMIN_ENDPOINTS.IMAGE_UPLOAD, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        })
        const res = await response.json()

        if (res.success && res.data) {
          this.form.image_url = res.data.object_key
          this.image_preview_url = res.data.public_url || res.data.url || null
          this.showSuccess('图片上传成功')
          logger.info('[ItemTemplates] 图片上传成功:', res.data.object_key)
        } else {
          this.showError('上传失败', res.message || '图片上传失败')
        }
      } catch (e) {
        logger.error('[ItemTemplates] 图片上传失败:', e)
        this.showError('上传失败', '图片上传失败')
      } finally {
        this.image_uploading = false
      }
    },

    /**
     * 清除已上传的图片
     * @returns {void}
     */
    clearTemplateImage() {
      this.form.image_url = ''
      this.image_preview_url = null
    },

    /**
     * 显示成功提示消息
     * @param {string} message - 成功消息内容
     * @returns {void}
     */
    showSuccess(message) {
      if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
        Alpine.store('notification').success(message)
      } else if (typeof showToast === 'function') {
        showToast(message, 'success')
      } else {
        logger.info('', message)
      }
    },

    /**
     * 显示信息提示消息
     * @param {string} message - 信息消息内容
     * @returns {void}
     */
    showInfo(message) {
      if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
        Alpine.store('notification').info(message)
      } else if (typeof showToast === 'function') {
        showToast(message, 'info')
      } else {
        logger.info('', message)
      }
    },

    /**
     * 显示错误提示消息
     * @param {string} title - 错误标题
     * @param {string} [message] - 错误详情（可选）
     * @returns {void}
     */
    showError(title, message) {
      const fullMessage = message ? `${title}: ${message}` : title
      if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
        Alpine.store('notification').error(fullMessage)
      } else if (typeof showToast === 'function') {
        showToast(fullMessage, 'error')
      } else {
        logger.error('❌', fullMessage)
      }
    }
  }))
})
