/**
 * 材料转换规则管理页面 - Alpine.js Mixin 重构版
 *
 * @file admin/src/modules/system/pages/material-conversion-rules.js
 * @module MaterialConversionRulesPage
 * @version 3.0.0
 * @date 2026-01-23
 * @author Admin System
 *
 * @description
 * 管理材料之间的转换规则，提供以下功能：
 * - 查看所有转换规则列表
 * - 添加新的转换规则
 * - 编辑现有转换规则
 * - 启用/禁用转换规则
 * - 风险检测（循环检测、套利检测）
 *
 * @requires createCrudMixin - CRUD操作混入
 * @requires ASSET_ENDPOINTS - 资产管理API端点配置
 * @requires apiRequest - API请求函数
 *
 * @example
 * // HTML中使用
 * <div x-data="materialConversionRulesPage">
 *   <table>
 *     <template x-for="rule in rules" :key="rule.rule_id">...</template>
 *   </table>
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
/**
 * 转换规则对象类型（使用后端字段名）
 * @typedef {Object} ConversionRule
 * @property {number} rule_id - 规则ID
 * @property {string} from_asset_code - 源资产代码
 * @property {string} to_asset_code - 目标资产代码
 * @property {number} from_amount - 源资产数量（后端字段名）
 * @property {number} to_amount - 目标资产数量（后端字段名）
 * @property {string} effective_at - 生效时间
 * @property {boolean} is_enabled - 是否启用
 * @property {boolean} [cycle_detected] - 是否检测到循环
 * @property {boolean} [arbitrage_detected] - 是否检测到套利风险
 */

/**
 * 资产类型对象
 * @typedef {Object} AssetType
 * @property {string} asset_code - 资产代码
 * @property {string} asset_name - 资产名称
 * @property {boolean} is_enabled - 是否启用
 */

/**
 * 风控警告对象
 * @typedef {Object} ValidationWarning
 * @property {string} type - 警告类型 ('cycle'|'arbitrage')
 * @property {string} title - 警告标题
 * @property {string} message - 警告消息
 */

/**
 * 材料转换规则管理页面Alpine.js组件工厂函数
 * @function materialConversionRulesPage
 * @returns {Object} Alpine.js组件配置对象
 */
function materialConversionRulesPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createCrudMixin({
      enablePagination: false,
      enableFormValidation: true
    }),

    // ==================== 页面特有状态 ====================

    /** @type {boolean} 提交操作加载状态 */
    submitting: false,

    /** @type {AssetType[]} 可用资产类型列表 */
    assetTypes: [],

    /** @type {ConversionRule[]} 转换规则列表 */
    rules: [],

    /**
     * 统计数据
     * @type {Object}
     * @property {number} total - 规则总数
     * @property {number} enabled - 启用的规则数
     * @property {number} disabled - 禁用的规则数
     * @property {number} paths - 转换路径数（去重后）
     */
    stats: {
      total: 0,
      enabled: 0,
      disabled: 0,
      paths: 0
    },

    /**
     * 添加规则表单数据（使用后端字段名）
     * @type {Object}
     * @property {string} from_asset_code - 源资产代码
     * @property {string} to_asset_code - 目标资产代码
     * @property {string} from_amount - 源资产数量
     * @property {string} to_amount - 目标资产数量
     * @property {string} effective_at - 生效时间
     * @property {string} is_enabled - 是否启用 ('1'|'0')
     */
    addForm: {
      from_asset_code: '',
      to_asset_code: '',
      from_amount: '',
      to_amount: '',
      effective_at: '',
      is_enabled: '1'
    },

    /**
     * 编辑规则表单数据（使用后端字段名）
     * @type {Object}
     * @property {string} rule_id - 规则ID
     * @property {string} direction - 转换方向显示文本
     * @property {string} from_amount - 源资产数量
     * @property {string} to_amount - 目标资产数量
     * @property {string} effective_at - 生效时间
     * @property {string} is_enabled - 是否启用 ('1'|'0')
     */
    editForm: {
      rule_id: '',
      direction: '',
      from_amount: '',
      to_amount: '',
      effective_at: '',
      is_enabled: '1'
    },

    /** @type {ValidationWarning[]} 添加表单的风控警告列表 */
    addValidationWarnings: [],

    /** @type {ValidationWarning[]} 编辑表单的风控警告列表 */
    editValidationWarnings: [],

    // ==================== 生命周期 ====================

    /**
     * 初始化页面
     * @async
     * @method init
     * @description 组件挂载时自动调用，验证登录状态后并行加载资产类型和规则数据
     * @returns {Promise<void>}
     */
    async init() {
      logger.info('材料转换规则管理页面初始化 (Mixin v3.0)')

      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }

      // 加载资产类型和规则
      await Promise.all([this.loadAssetTypes(), this.loadRules()])
    },

    // ==================== 数据加载 ====================

    /**
     * 加载资产类型列表
     * @async
     * @method loadAssetTypes
     * @description 从后端获取所有可用的资产类型，用于转换规则的源/目标选择
     * @returns {Promise<void>}
     */
    async loadAssetTypes() {
      const result = await this.apiGet(
        ASSET_ENDPOINTS.MATERIAL_ASSET_TYPES,
        {},
        { showError: false }
      )

      if (result.success) {
        this.assetTypes = result.data?.asset_types || []
      }
    },

    /**
     * 获取已启用的资产类型
     * @method getEnabledAssetTypes
     * @description 过滤返回仅启用状态的资产类型，用于下拉选择框
     * @returns {AssetType[]} 已启用的资产类型数组
     */
    getEnabledAssetTypes() {
      return this.assetTypes.filter(a => a.is_enabled)
    },

    /**
     * 加载转换规则列表
     * @async
     * @method loadRules
     * @description 从后端获取所有转换规则，并更新统计数据
     * @returns {Promise<void>}
     */
    async loadRules() {
      const result = await this.withLoading(async () => {
        const response = await apiRequest(ASSET_ENDPOINTS.MATERIAL_CONVERSION_RULES)

        if (response && response.success) {
          return response.data?.rules || []
        }
        throw new Error(response?.message || '加载失败')
      })

      if (result.success) {
        this.rules = result.data
        this._updateStatistics()
      }
    },

    /**
     * 更新统计数据
     * @private
     * @method _updateStatistics
     * @description 根据当前规则列表计算统计信息（总数、启用数、禁用数、路径数）
     * @returns {void}
     */
    _updateStatistics() {
      this.stats.total = this.rules.length
      this.stats.enabled = this.rules.filter(r => r.is_enabled).length
      this.stats.disabled = this.stats.total - this.stats.enabled
      this.stats.paths = new Set(
        this.rules.map(r => `${r.from_asset_code}-${r.to_asset_code}`)
      ).size
    },

    // ==================== 添加规则 ====================

    /**
     * 打开添加规则弹窗
     * @method openAddModal
     * @description 重置添加表单并显示添加规则的模态框
     * @returns {void}
     */
    openAddModal() {
      this.addForm = {
        from_asset_code: '',
        to_asset_code: '',
        from_amount: '',
        to_amount: '',
        effective_at: '',
        is_enabled: '1'
      }
      this.addValidationWarnings = []
      this.showModal('addModal')
    },

    /**
     * 提交添加规则
     * @async
     * @method submitAdd
     * @description
     * 验证表单数据后提交新规则到后端。
     * 如果后端返回风控验证警告（循环检测/套利检测），则显示警告但不关闭弹窗。
     * @returns {Promise<void>}
     */
    async submitAdd() {
      if (
        !this.addForm.from_asset_code ||
        !this.addForm.to_asset_code ||
        !this.addForm.from_amount ||
        !this.addForm.to_amount ||
        !this.addForm.effective_at
      ) {
        this.showError('请填写所有必填字段')
        return
      }

      this.submitting = true

      const result = await this.apiPost(
        ASSET_ENDPOINTS.MATERIAL_CONVERSION_RULES,
        {
          from_asset_code: this.addForm.from_asset_code,
          to_asset_code: this.addForm.to_asset_code,
          from_amount: parseInt(this.addForm.from_amount),
          to_amount: parseInt(this.addForm.to_amount),
          effective_at: this.addForm.effective_at,
          is_enabled: parseInt(this.addForm.is_enabled)
        },
        { showSuccess: true, successMessage: '添加成功' }
      )

      this.submitting = false

      if (result.success) {
        this.hideModal('addModal')
        await this.loadRules()
      } else if (result.data?.validation) {
        this.addValidationWarnings = this._parseValidationWarnings(result.data.validation)
      }
    },

    // ==================== 编辑规则 ====================

    /**
     * 打开查看规则详情弹窗
     * @method openViewModal
     * @param {number|string} ruleId - 规则ID
     * @description 根据规则ID查找规则数据并显示详情（后端设计不支持编辑，只能查看）
     * @returns {void}
     */
    openViewModal(ruleId) {
      const rule = this.rules.find(r => r.rule_id === parseInt(ruleId))
      if (!rule) return

      this.editForm = {
        rule_id: rule.rule_id,
        direction: `${rule.from_asset_code} → ${rule.to_asset_code}`,
        from_amount: rule.from_amount,
        to_amount: rule.to_amount,
        effective_at: this._formatDateTimeLocal(rule.effective_at),
        is_enabled: rule.is_enabled ? '1' : '0'
      }
      this.editValidationWarnings = []
      this.showModal('editModal')
    },

    /**
     * 禁用转换规则
     * @async
     * @method disableRule
     * @param {number} ruleId - 规则ID
     * @description 显示确认对话框后禁用规则（后端设计：改比例需新增规则，不支持重新启用）
     * @returns {Promise<void>}
     */
    async disableRule(ruleId) {
      const result = await this.confirmAndExecute(
        '确定要禁用该转换规则吗？\n注意：禁用后无法重新启用，如需启用请创建新规则。',
        async () => {
          const response = await apiRequest(
            buildURL(ASSET_ENDPOINTS.MATERIAL_CONVERSION_RULE_DISABLE, { rule_id: ruleId }),
            {
              method: 'PUT'
            }
          )
          if (response && response.success) {
            return response.data
          }
          throw new Error(response?.message || '禁用失败')
        },
        { showSuccess: true, successMessage: '禁用成功' }
      )

      if (result.success) {
        await this.loadRules()
      }
    },

    // ==================== 辅助方法 ====================

    /**
     * 解析后端返回的风控验证警告
     * @private
     * @method _parseValidationWarnings
     * @param {Object} validation - 后端返回的验证结果对象
     * @param {boolean} [validation.cycle_detected] - 是否检测到循环转换
     * @param {boolean} [validation.arbitrage_detected] - 是否检测到套利风险
     * @returns {ValidationWarning[]} 解析后的警告数组
     */
    _parseValidationWarnings(validation) {
      const warnings = []

      if (validation.cycle_detected) {
        warnings.push({
          type: 'cycle',
          title: '循环检测',
          message: '检测到循环转换路径，可能导致无限套利'
        })
      }

      if (validation.arbitrage_detected) {
        warnings.push({
          type: 'arbitrage',
          title: '套利检测',
          message: '检测到套利风险，建议调整转换比例'
        })
      }

      return warnings
    },

    /**
     * 计算转换比例
     * @method getRatio
     * @param {ConversionRule} rule - 转换规则对象
     * @returns {string} 格式化的转换比例（保留4位小数）
     *
     * @example
     * // from_amount=1, to_amount=20
     * getRatio({ from_amount: 1, to_amount: 20 }) // '20.0000'
     */
    getRatio(rule) {
      return (rule.to_amount / rule.from_amount).toFixed(4)
    },

    /**
     * 检查规则是否存在风险
     * @method hasRisk
     * @param {ConversionRule} rule - 转换规则对象
     * @returns {boolean} 是否存在循环或套利风险
     */
    hasRisk(rule) {
      return rule.cycle_detected || rule.arbitrage_detected
    },

    /**
     * 格式化日期为中文显示格式
     * @method formatDate
     * @param {string|null} dateStr - ISO日期字符串
     * @returns {string} 格式化后的日期字符串，如 '2026/1/23 14:30:00'
     */
    formatDate(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('zh-CN')
    },

    /**
     * 格式化日期时间为HTML datetime-local输入框格式
     * @private
     * @method _formatDateTimeLocal
     * @param {string} dateString - ISO日期字符串
     * @returns {string} 格式化后的日期字符串，如 '2026-01-23T14:30'
     */
    _formatDateTimeLocal(dateString) {
      const date = new Date(dateString)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      return `${year}-${month}-${day}T${hours}:${minutes}`
    }
  }
}

// ==================== Alpine.js 组件注册 ====================

/**
 * 注册Alpine.js组件
 * @description 监听alpine:init事件，注册materialConversionRulesPage组件到Alpine
 * @listens alpine:init
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('materialConversionRulesPage', materialConversionRulesPage)
  logger.info('[MaterialConversionRulesPage] Alpine 组件已注册 (Mixin v3.0)')
})
