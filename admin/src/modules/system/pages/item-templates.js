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

import { logger } from '../../../utils/logger.js'
import { ASSET_ENDPOINTS } from '../../../api/asset.js'
import { buildURL, request } from '../../../api/base.js'
import { createCrudMixin } from '../../../alpine/mixins/index.js'

// API请求封装
const apiRequest = async (url, options = {}) => {
  return await request({ url, ...options })
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
   * @property {boolean} isSubmitting - 是否正在提交
   * @property {Object} typeIcons - 类型图标映射
   * @property {Object} rarityLabels - 稀有度标签映射
   */
  Alpine.data('itemTemplatesPage', () => ({
    ...baseMixin,

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
      templateId: '',
      displayName: '',
      templateCode: '',
      itemType: 'voucher',
      rarityCode: 'common',
      isEnabled: true,
      imageUrl: '',
      referencePricePoints: 0,
      description: '',
      meta: ''
    },
    isSubmitting: false,
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
     * @fires ASSET_ENDPOINTS.ITEM_TEMPLATES_LIST
     */
    async loadTemplates() {
      showLoading()
      try {
        const params = new URLSearchParams()
        if (this.filters.type) params.append('item_type', this.filters.type)
        if (this.filters.rarity) params.append('rarity_code', this.filters.rarity)
        if (this.filters.status)
          params.append('is_enabled', this.filters.status === 'active' ? 'true' : 'false')
        if (this.filters.search) params.append('keyword', this.filters.search)

        const url =
          ASSET_ENDPOINTS.ITEM_TEMPLATES_LIST + (params.toString() ? `?${params.toString()}` : '')
        const response = await apiRequest(url)

        if (response && response.success) {
          this.templates = response.data.list || []
          this.updateStats(response.data.pagination || {})
        } else {
          this.showError('加载失败', response?.message || '获取物品模板失败')
        }
      } catch (error) {
        logger.error('加载物品模板失败:', error)
        this.showError('加载失败', error.message)
      } finally {
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
     * 打开创建模板模态框
     * @description 重置表单并显示创建模板的模态框
     * @returns {void}
     */
    openCreateModal() {
      this.form = {
        templateId: '',
        displayName: '',
        templateCode: '',
        itemType: 'voucher',
        rarityCode: 'common',
        isEnabled: true,
        imageUrl: '',
        referencePricePoints: 0,
        description: '',
        meta: ''
      }
      this.showModal('templateModal')
    },

    /**
     * 编辑物品模板
     * @async
     * @param {number|string} templateId - 模板ID
     * @description 获取模板详情并填充到表单中，然后显示编辑模态框
     * @returns {Promise<void>}
     * @fires ASSET_ENDPOINTS.ITEM_TEMPLATES_DETAIL
     */
    async editTemplate(templateId) {
      showLoading()
      try {
        const response = await apiRequest(
          buildURL(ASSET_ENDPOINTS.ITEM_TEMPLATES_DETAIL, { id: templateId })
        )
        if (response && response.success) {
          const t = response.data
          this.form = {
            templateId: t.item_template_id,
            displayName: t.display_name || '',
            templateCode: t.template_code || '',
            itemType: t.item_type || 'voucher',
            rarityCode: t.rarity_code || 'common',
            isEnabled: t.is_enabled,
            imageUrl: t.image_url || '',
            referencePricePoints: t.reference_price_points || 0,
            description: t.description || '',
            meta: t.meta ? JSON.stringify(t.meta, null, 2) : ''
          }
          this.showModal('templateModal')
        } else {
          this.showError('加载失败', response?.message || '获取模板详情失败')
        }
      } catch (error) {
        logger.error('加载模板详情失败:', error)
        this.showError('加载失败', error.message)
      } finally {
        hideLoading()
      }
    },

    /**
     * 提交模板表单（创建或更新）
     * @async
     * @description 验证表单数据并提交到后端，根据templateId判断是创建还是更新
     * @returns {Promise<void>}
     * @throws {Error} 当JSON格式错误或必填字段缺失时
     * @fires ASSET_ENDPOINTS.ITEM_TEMPLATES_CREATE
     * @fires ASSET_ENDPOINTS.ITEM_TEMPLATES_UPDATE
     */
    async submitTemplate() {
      if (this.isSubmitting) return

      let meta = null
      try {
        if (this.form.meta && this.form.meta.trim()) {
          meta = JSON.parse(this.form.meta)
        }
      } catch (e) {
        this.showError('格式错误', '扩展属性JSON格式错误')
        return
      }

      const data = {
        display_name: this.form.displayName,
        template_code: this.form.templateCode,
        item_type: this.form.itemType,
        rarity_code: this.form.rarityCode,
        is_enabled: this.form.isEnabled,
        image_url: this.form.imageUrl || null,
        reference_price_points: this.form.referencePricePoints || 0,
        description: this.form.description || null,
        meta: meta
      }

      if (!data.display_name || !data.template_code) {
        this.showError('验证失败', '请填写模板名称和编码')
        return
      }

      this.isSubmitting = true
      showLoading()
      try {
        const url = this.form.templateId
          ? buildURL(ASSET_ENDPOINTS.ITEM_TEMPLATES_UPDATE, { id: this.form.templateId })
          : ASSET_ENDPOINTS.ITEM_TEMPLATES_CREATE
        const method = this.form.templateId ? 'PUT' : 'POST'

        const response = await apiRequest(url, { method, body: JSON.stringify(data) })

        if (response && response.success) {
          this.hideModal('templateModal')
          this.showSuccess(`${this.form.templateId ? '更新' : '创建'}成功`)
          this.loadTemplates()
        } else {
          this.showError('保存失败', response?.message || '操作失败')
        }
      } catch (error) {
        logger.error('保存模板失败:', error)
        this.showError('保存失败', error.message)
      } finally {
        this.isSubmitting = false
        hideLoading()
      }
    },

    /**
     * 删除物品模板
     * @async
     * @param {number|string} templateId - 模板ID
     * @description 确认后删除指定的物品模板
     * @returns {Promise<void>}
     * @fires ASSET_ENDPOINTS.ITEM_TEMPLATES_DELETE
     */
    async deleteTemplate(templateId) {
      if (!confirm('确定要删除此物品模板吗？此操作不可恢复！')) return

      showLoading()
      try {
        const response = await apiRequest(
          buildURL(ASSET_ENDPOINTS.ITEM_TEMPLATES_DELETE, { id: templateId }),
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
        hideLoading()
      }
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
