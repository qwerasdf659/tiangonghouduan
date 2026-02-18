/**
 * 材料转换管理页面 - Alpine.js 组件
 *
 * @file admin/src/modules/asset/pages/material-conversion.js
 * @description 材料转换规则管理 + 材料资产类型管理（双Tab页面）
 *   - 转换规则：版本化管理，改比例必须新增（禁止覆盖历史）
 *   - 资产类型：配置实体管理（创建、编辑、禁用）
 * @version 1.0.0
 * @date 2026-02-18
 *
 * @requires Alpine.js
 * @requires createPageMixin - 页面基础功能混入
 * @requires AssetAPI - 资产管理API（含材料转换规则、资产类型方法）
 *
 * 后端路由：/api/v4/console/material/*
 */

import { logger, $confirm } from '../../../utils/index.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { AssetAPI } from '../../../api/asset.js'
import { SYSTEM_ADMIN_ENDPOINTS } from '../../../api/system/admin.js'

/**
 * 风险等级中文映射
 */
const RISK_LEVEL_MAP = {
  low: { label: '低风险', color: 'bg-green-100 text-green-700' },
  medium: { label: '中风险', color: 'bg-yellow-100 text-yellow-700' },
  high: { label: '高风险', color: 'bg-red-100 text-red-700' }
}

/**
 * 材料形态中文映射
 */
const FORM_MAP = {
  shard: '碎片',
  crystal: '水晶'
}

/**
 * 舍入模式中文映射
 */
const ROUNDING_MODE_MAP = {
  floor: '向下取整',
  ceil: '向上取整',
  round: '四舍五入'
}

document.addEventListener('alpine:init', () => {
  logger.info('[MaterialConversion] 注册 Alpine 组件...')

  /**
   * 材料转换管理主组件
   */
  Alpine.data('materialConversionPage', () => {
    const pageMixin = createPageMixin({
      pageTitle: '材料转换管理',
      loadDataOnInit: false
    })

    return {
      ...pageMixin,

      // ========== Tab 切换 ==========
      /** @type {'rules'|'asset_types'} 当前激活的Tab */
      active_tab: 'rules',

      // ==================== 转换规则管理 ====================

      // ========== 规则列表 ==========
      /** @type {Array<Object>} 转换规则列表 */
      conversion_rules: [],
      /** 规则列表加载中 */
      rules_loading: false,
      /** 规则列表错误 */
      rules_error: '',

      // ========== 规则分页 ==========
      rules_pagination: {
        page: 1,
        page_size: 20,
        total: 0
      },

      get rulesTotalPages() {
        return Math.ceil(this.rules_pagination.total / this.rules_pagination.page_size) || 1
      },
      get rulesHasPrev() {
        return this.rules_pagination.page > 1
      },
      get rulesHasNext() {
        return this.rules_pagination.page < this.rulesTotalPages
      },

      // ========== 规则筛选 ==========
      /** @type {string} 启用状态筛选 */
      rules_filter_enabled: 'all',
      /** @type {string} 源资产代码筛选 */
      rules_filter_from: '',
      /** @type {string} 目标资产代码筛选 */
      rules_filter_to: '',

      // ========== 创建规则模态框 ==========
      show_create_rule_modal: false,
      creating_rule: false,
      create_rule_form: {
        from_asset_code: '',
        to_asset_code: '',
        from_amount: '',
        to_amount: '',
        effective_at: '',
        is_enabled: true,
        min_from_amount: 1,
        max_from_amount: '',
        fee_rate: 0,
        fee_min_amount: 0,
        fee_asset_code: '',
        title: '',
        description: '',
        risk_level: 'low',
        is_visible: true,
        rounding_mode: 'floor'
      },

      // ========== 规则详情模态框 ==========
      show_rule_detail_modal: false,
      rule_detail: null,
      rule_detail_loading: false,

      // ==================== 资产类型管理 ====================

      // ========== 资产类型列表 ==========
      /** @type {Array<Object>} 材料资产类型列表 */
      asset_types: [],
      /** 资产类型加载中 */
      types_loading: false,
      /** 资产类型错误 */
      types_error: '',

      // ========== 创建资产类型模态框 ==========
      show_create_type_modal: false,
      creating_type: false,
      create_type_form: {
        asset_code: '',
        display_name: '',
        icon_url: '',
        group_code: '',
        form: 'shard',
        tier: 1,
        sort_order: 0,
        is_enabled: true
      },
      /** @type {string|null} 创建表单图标预览URL */
      create_icon_preview: null,
      /** @type {boolean} 创建表单图标上传中 */
      create_icon_uploading: false,

      // ========== 编辑资产类型模态框 ==========
      show_edit_type_modal: false,
      editing_type: false,
      edit_type_form: {
        asset_code: '',
        display_name: '',
        icon_url: '',
        group_code: '',
        form: 'shard',
        tier: 1,
        sort_order: 0,
        is_enabled: true,
        is_tradable: true
      },
      /** @type {string|null} 编辑表单图标预览URL */
      edit_icon_preview: null,
      /** @type {boolean} 编辑表单图标上传中 */
      edit_icon_uploading: false,

      // ========== 初始化 ==========
      async init() {
        logger.info('[MaterialConversion] 初始化组件...')

        if (typeof pageMixin.init === 'function') {
          await pageMixin.init.call(this)
        }

        await this.loadConversionRules()
      },

      // ========== Tab 切换 ==========

      /**
       * 切换Tab并加载对应数据
       * @param {'rules'|'asset_types'} tab - 目标Tab
       */
      async switchTab(tab) {
        if (this.active_tab === tab) return
        this.active_tab = tab
        logger.info('[MaterialConversion] 切换Tab:', tab)

        if (tab === 'rules' && this.conversion_rules.length === 0) {
          await this.loadConversionRules()
        } else if (tab === 'asset_types' && this.asset_types.length === 0) {
          await this.loadAssetTypes()
        }
      },

      // ==================== 转换规则方法 ====================

      /**
       * 加载转换规则列表
       */
      async loadConversionRules() {
        this.rules_loading = true
        this.rules_error = ''

        try {
          const params = {
            page: this.rules_pagination.page,
            page_size: this.rules_pagination.page_size
          }

          if (this.rules_filter_enabled !== 'all') {
            params.is_enabled = this.rules_filter_enabled === 'enabled'
          }
          if (this.rules_filter_from) {
            params.from_asset_code = this.rules_filter_from
          }
          if (this.rules_filter_to) {
            params.to_asset_code = this.rules_filter_to
          }

          logger.info('[MaterialConversion] 加载转换规则', params)
          const res = await AssetAPI.getConversionRules(params)

          if (res.success) {
            this.conversion_rules = res.data?.rules || []
            const paginationData = res.data?.pagination || {}
            this.rules_pagination.total = paginationData.total || res.data?.total || 0
            this.rules_pagination.page = paginationData.page || this.rules_pagination.page
            logger.info('[MaterialConversion] 规则加载成功', {
              count: this.conversion_rules.length,
              total: this.rules_pagination.total
            })
          } else {
            this.rules_error = res.message || '加载转换规则失败'
            logger.error('[MaterialConversion] 规则加载失败:', res.message)
          }
        } catch (e) {
          this.rules_error = e.message || '网络请求失败'
          logger.error('[MaterialConversion] 规则加载异常:', e)
        } finally {
          this.rules_loading = false
        }
      },

      /**
       * 规则启用状态筛选
       * @param {string} filter - 'all' / 'enabled' / 'disabled'
       */
      async filterRulesByEnabled(filter) {
        this.rules_filter_enabled = filter
        this.rules_pagination.page = 1
        await this.loadConversionRules()
      },

      /**
       * 规则翻页
       * @param {number} page - 页码
       */
      async rulesGoToPage(page) {
        if (page < 1 || page > this.rulesTotalPages) return
        this.rules_pagination.page = page
        await this.loadConversionRules()
      },

      /**
       * 查看规则详情
       * @param {number} rule_id - 规则ID
       */
      async viewRuleDetail(rule_id) {
        this.show_rule_detail_modal = true
        this.rule_detail_loading = true
        this.rule_detail = null

        try {
          logger.info('[MaterialConversion] 加载规则详情', { rule_id })
          const res = await AssetAPI.getConversionRuleDetail(rule_id)

          if (res.success) {
            this.rule_detail = res.data
          } else {
            Alpine.store('notification').error(res.message || '加载规则详情失败')
            this.show_rule_detail_modal = false
          }
        } catch (e) {
          logger.error('[MaterialConversion] 加载规则详情失败:', e)
          Alpine.store('notification').error('加载规则详情失败: ' + e.message)
          this.show_rule_detail_modal = false
        } finally {
          this.rule_detail_loading = false
        }
      },

      /**
       * 打开创建规则模态框（加载资产类型供下拉选择）
       */
      async openCreateRuleModal() {
        this.show_create_rule_modal = true
        this.create_rule_form = {
          from_asset_code: '',
          to_asset_code: '',
          from_amount: '',
          to_amount: '',
          effective_at: '',
          is_enabled: true,
          min_from_amount: 1,
          max_from_amount: '',
          fee_rate: 0,
          fee_min_amount: 0,
          fee_asset_code: '',
          title: '',
          description: '',
          risk_level: 'low',
          is_visible: true,
          rounding_mode: 'floor'
        }
        if (this.asset_types.length === 0) {
          await this.loadAssetTypes()
        }
      },

      /**
       * 提交创建转换规则
       */
      async submitCreateRule() {
        const f = this.create_rule_form

        if (!f.from_asset_code || !f.to_asset_code) {
          Alpine.store('notification').warning('请选择源资产和目标资产')
          return
        }
        if (f.from_asset_code === f.to_asset_code) {
          Alpine.store('notification').warning('源资产和目标资产不能相同')
          return
        }
        if (!f.from_amount || parseInt(f.from_amount) <= 0) {
          Alpine.store('notification').warning('源资产数量必须大于0')
          return
        }
        if (!f.to_amount || parseInt(f.to_amount) <= 0) {
          Alpine.store('notification').warning('目标资产数量必须大于0')
          return
        }
        if (!f.effective_at) {
          Alpine.store('notification').warning('请设置生效时间')
          return
        }

        this.creating_rule = true
        try {
          const data = {
            from_asset_code: f.from_asset_code,
            to_asset_code: f.to_asset_code,
            from_amount: parseInt(f.from_amount),
            to_amount: parseInt(f.to_amount),
            effective_at: new Date(f.effective_at).toISOString(),
            is_enabled: f.is_enabled,
            min_from_amount: parseInt(f.min_from_amount) || 1,
            fee_rate: parseFloat(f.fee_rate) || 0,
            fee_min_amount: parseInt(f.fee_min_amount) || 0,
            risk_level: f.risk_level,
            is_visible: f.is_visible,
            rounding_mode: f.rounding_mode
          }
          if (f.max_from_amount) data.max_from_amount = parseInt(f.max_from_amount)
          if (f.fee_asset_code) data.fee_asset_code = f.fee_asset_code
          if (f.title) data.title = f.title
          if (f.description) data.description = f.description

          logger.info('[MaterialConversion] 创建转换规则', data)
          const res = await AssetAPI.createConversionRule(data)

          if (res.success) {
            Alpine.store('notification').success('转换规则创建成功')
            this.show_create_rule_modal = false
            await this.loadConversionRules()
          } else {
            Alpine.store('notification').error(res.message || '创建失败')
          }
        } catch (e) {
          logger.error('[MaterialConversion] 创建转换规则失败:', e)
          Alpine.store('notification').error('创建转换规则失败: ' + e.message)
        } finally {
          this.creating_rule = false
        }
      },

      /**
       * 禁用转换规则（不可删除/修改，仅禁用）
       * @param {number} rule_id - 规则ID
       */
      async disableRule(rule_id) {
        const confirmed = await $confirm(
          '确认禁用该转换规则？禁用后用户将无法使用此规则进行材料转换。',
          '禁用确认'
        )
        if (!confirmed) return

        try {
          logger.info('[MaterialConversion] 禁用规则', { rule_id })
          const res = await AssetAPI.disableConversionRule(rule_id)

          if (res.success) {
            Alpine.store('notification').success('规则已禁用')
            this.show_rule_detail_modal = false
            await this.loadConversionRules()
          } else {
            Alpine.store('notification').error(res.message || '禁用失败')
          }
        } catch (e) {
          logger.error('[MaterialConversion] 禁用规则失败:', e)
          Alpine.store('notification').error('禁用规则失败: ' + e.message)
        }
      },

      // ==================== 资产类型方法 ====================

      /**
       * 加载材料资产类型列表
       */
      async loadAssetTypes() {
        this.types_loading = true
        this.types_error = ''

        try {
          logger.info('[MaterialConversion] 加载材料资产类型')
          const res = await AssetAPI.getMaterialAssetTypes()

          if (res.success) {
            this.asset_types = res.data?.asset_types || res.data || []
            logger.info('[MaterialConversion] 资产类型加载成功', {
              count: this.asset_types.length
            })
          } else {
            this.types_error = res.message || '加载资产类型失败'
            logger.error('[MaterialConversion] 资产类型加载失败:', res.message)
          }
        } catch (e) {
          this.types_error = e.message || '网络请求失败'
          logger.error('[MaterialConversion] 资产类型加载异常:', e)
        } finally {
          this.types_loading = false
        }
      },

      /**
       * 打开创建资产类型模态框
       */
      openCreateTypeModal() {
        this.show_create_type_modal = true
        this.create_type_form = {
          asset_code: '',
          display_name: '',
          icon_url: '',
          group_code: '',
          form: 'shard',
          tier: 1,
          sort_order: 0,
          is_enabled: true
        }
        this.create_icon_preview = null
      },

      /**
       * 提交创建资产类型
       */
      async submitCreateType() {
        const f = this.create_type_form

        if (!f.asset_code || !f.display_name || !f.group_code) {
          Alpine.store('notification').warning('请填写所有必填字段')
          return
        }

        this.creating_type = true
        try {
          const data = {
            asset_code: f.asset_code.trim(),
            display_name: f.display_name.trim(),
            icon_url: f.icon_url || null,
            group_code: f.group_code.trim(),
            form: f.form,
            tier: parseInt(f.tier),
            sort_order: parseInt(f.sort_order) || 0,
            is_enabled: f.is_enabled
          }

          logger.info('[MaterialConversion] 创建资产类型', data)
          const res = await AssetAPI.createAssetType(data)

          if (res.success) {
            Alpine.store('notification').success('资产类型创建成功')
            this.show_create_type_modal = false
            await this.loadAssetTypes()
          } else {
            Alpine.store('notification').error(res.message || '创建失败')
          }
        } catch (e) {
          logger.error('[MaterialConversion] 创建资产类型失败:', e)
          Alpine.store('notification').error('创建资产类型失败: ' + e.message)
        } finally {
          this.creating_type = false
        }
      },

      /**
       * 打开编辑资产类型模态框
       * @param {Object} assetType - 资产类型对象
       */
      openEditTypeModal(assetType) {
        this.show_edit_type_modal = true
        this.edit_type_form = {
          asset_code: assetType.asset_code,
          display_name: assetType.display_name,
          icon_url: assetType.icon_url || '',
          group_code: assetType.group_code,
          form: assetType.form,
          tier: assetType.tier,
          sort_order: assetType.sort_order || 0,
          is_enabled: assetType.is_enabled !== false,
          is_tradable: assetType.is_tradable !== false
        }
        this.edit_icon_preview = assetType.icon_url || null
      },

      /**
       * 提交更新资产类型
       */
      async submitEditType() {
        const f = this.edit_type_form

        if (!f.display_name) {
          Alpine.store('notification').warning('展示名称不能为空')
          return
        }

        this.editing_type = true
        try {
          const data = {
            display_name: f.display_name.trim(),
            icon_url: f.icon_url || null,
            group_code: f.group_code.trim(),
            form: f.form,
            tier: parseInt(f.tier),
            sort_order: parseInt(f.sort_order) || 0,
            is_enabled: f.is_enabled,
            is_tradable: f.is_tradable
          }

          logger.info('[MaterialConversion] 更新资产类型', { asset_code: f.asset_code, data })
          const res = await AssetAPI.updateAssetType(f.asset_code, data)

          if (res.success) {
            Alpine.store('notification').success('资产类型更新成功')
            this.show_edit_type_modal = false
            await this.loadAssetTypes()
          } else {
            Alpine.store('notification').error(res.message || '更新失败')
          }
        } catch (e) {
          logger.error('[MaterialConversion] 更新资产类型失败:', e)
          Alpine.store('notification').error('更新资产类型失败: ' + e.message)
        } finally {
          this.editing_type = false
        }
      },

      /**
       * 禁用资产类型
       * @param {string} asset_code - 资产类型代码
       */
      async disableAssetType(asset_code) {
        const confirmed = await $confirm(
          '确认禁用该资产类型？禁用后关联的转换规则可能无法正常使用。',
          '禁用确认'
        )
        if (!confirmed) return

        try {
          logger.info('[MaterialConversion] 禁用资产类型', { asset_code })
          const res = await AssetAPI.disableAssetType(asset_code)

          if (res.success) {
            Alpine.store('notification').success('资产类型已禁用')
            await this.loadAssetTypes()
          } else {
            Alpine.store('notification').error(res.message || '禁用失败')
          }
        } catch (e) {
          logger.error('[MaterialConversion] 禁用资产类型失败:', e)
          Alpine.store('notification').error('禁用资产类型失败: ' + e.message)
        }
      },

      // ==================== 图标上传方法 ====================

      /**
       * 上传材料资产图标（创建表单）
       * @param {Event} event - 文件选择事件
       */
      async uploadCreateIcon(event) {
        const file = event.target.files?.[0]
        if (!file) return

        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        if (!allowedTypes.includes(file.type)) {
          Alpine.store('notification').error('仅支持 JPG/PNG/GIF/WebP 格式')
          return
        }
        if (file.size > 5 * 1024 * 1024) {
          Alpine.store('notification').error('图标大小不能超过 5MB')
          return
        }

        try {
          this.create_icon_uploading = true
          const formData = new FormData()
          formData.append('image', file)
          formData.append('business_type', 'uploads')
          formData.append('category', 'icons')

          const token = localStorage.getItem('token')
          const response = await fetch(SYSTEM_ADMIN_ENDPOINTS.IMAGE_UPLOAD, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData
          })
          const res = await response.json()

          if (res.success && res.data) {
            this.create_type_form.icon_url = res.data.object_key
            this.create_icon_preview = res.data.public_url || res.data.url || null
            Alpine.store('notification').success('图标上传成功')
            logger.info('[MaterialConversion] 创建表单图标上传成功:', res.data.object_key)
          } else {
            Alpine.store('notification').error(res.message || '图标上传失败')
          }
        } catch (e) {
          logger.error('[MaterialConversion] 创建表单图标上传失败:', e)
          Alpine.store('notification').error('图标上传失败')
        } finally {
          this.create_icon_uploading = false
        }
      },

      /**
       * 上传材料资产图标（编辑表单）
       * @param {Event} event - 文件选择事件
       */
      async uploadEditIcon(event) {
        const file = event.target.files?.[0]
        if (!file) return

        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        if (!allowedTypes.includes(file.type)) {
          Alpine.store('notification').error('仅支持 JPG/PNG/GIF/WebP 格式')
          return
        }
        if (file.size > 5 * 1024 * 1024) {
          Alpine.store('notification').error('图标大小不能超过 5MB')
          return
        }

        try {
          this.edit_icon_uploading = true
          const formData = new FormData()
          formData.append('image', file)
          formData.append('business_type', 'uploads')
          formData.append('category', 'icons')

          const token = localStorage.getItem('token')
          const response = await fetch(SYSTEM_ADMIN_ENDPOINTS.IMAGE_UPLOAD, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData
          })
          const res = await response.json()

          if (res.success && res.data) {
            this.edit_type_form.icon_url = res.data.object_key
            this.edit_icon_preview = res.data.public_url || res.data.url || null
            Alpine.store('notification').success('图标上传成功')
            logger.info('[MaterialConversion] 编辑表单图标上传成功:', res.data.object_key)
          } else {
            Alpine.store('notification').error(res.message || '图标上传失败')
          }
        } catch (e) {
          logger.error('[MaterialConversion] 编辑表单图标上传失败:', e)
          Alpine.store('notification').error('图标上传失败')
        } finally {
          this.edit_icon_uploading = false
        }
      },

      /**
       * 清除创建表单图标
       */
      clearCreateIcon() {
        this.create_type_form.icon_url = ''
        this.create_icon_preview = null
      },

      /**
       * 清除编辑表单图标
       */
      clearEditIcon() {
        this.edit_type_form.icon_url = ''
        this.edit_icon_preview = null
      },

      // ==================== 格式化辅助方法 ====================

      /**
       * 获取风险等级标签
       * @param {string} level - 风险等级
       * @returns {string}
       */
      getRiskLabel(level) {
        return RISK_LEVEL_MAP[level]?.label || level
      },

      /**
       * 获取风险等级样式
       * @param {string} level - 风险等级
       * @returns {string}
       */
      getRiskColor(level) {
        return RISK_LEVEL_MAP[level]?.color || 'bg-gray-100 text-gray-700'
      },

      /**
       * 获取形态中文名
       * @param {string} form - 形态代码
       * @returns {string}
       */
      getFormLabel(form) {
        return FORM_MAP[form] || form
      },

      /**
       * 获取舍入模式中文名
       * @param {string} mode - 舍入模式
       * @returns {string}
       */
      getRoundingLabel(mode) {
        return ROUNDING_MODE_MAP[mode] || mode
      },

      /**
       * 格式化费率为百分比显示
       * @param {number} rate - 费率（如 0.05）
       * @returns {string}
       */
      formatFeeRate(rate) {
        if (!rate || rate === 0) return '无手续费'
        return (Number(rate) * 100).toFixed(2) + '%'
      },

      /**
       * 格式化转换比例为可读文本
       * @param {Object} rule - 规则对象
       * @returns {string}
       */
      formatConversionRatio(rule) {
        if (!rule) return '-'
        return `${rule.from_amount} → ${rule.to_amount}`
      }
    }
  })
})
