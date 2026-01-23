/**
 * 字典管理模块
 *
 * @file admin/src/modules/system/composables/dict.js
 * @description 数据字典的增删改查（基于后端 categories/rarities/asset-groups API）
 * @version 2.0.0
 * @date 2026-01-24
 *
 * 后端 API 结构说明：
 * - 后端有三种字典类型：categories（类目）、rarities（稀有度）、asset-groups（资产分组）
 * - 每种字典类型都是扁平化的列表，没有父子关系
 * - 所有字典数据可通过 /api/v4/console/dictionaries/all 一次性获取
 */

import { logger } from '../../../utils/logger.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system.js'
import { buildURL } from '../../../api/base.js'

/**
 * 字典类型配置
 */
const DICT_TYPES = {
  categories: {
    name: '类目字典',
    listEndpoint: SYSTEM_ENDPOINTS.DICT_CATEGORY_LIST,
    detailEndpoint: SYSTEM_ENDPOINTS.DICT_CATEGORY_DETAIL,
    createEndpoint: SYSTEM_ENDPOINTS.DICT_CATEGORY_CREATE,
    updateEndpoint: SYSTEM_ENDPOINTS.DICT_CATEGORY_UPDATE,
    deleteEndpoint: SYSTEM_ENDPOINTS.DICT_CATEGORY_DELETE,
    idField: 'code',
    fields: ['code', 'name', 'description', 'display_name', 'sort_order', 'icon', 'status']
  },
  rarities: {
    name: '稀有度字典',
    listEndpoint: SYSTEM_ENDPOINTS.DICT_RARITY_LIST,
    detailEndpoint: SYSTEM_ENDPOINTS.DICT_RARITY_DETAIL,
    createEndpoint: SYSTEM_ENDPOINTS.DICT_RARITY_CREATE,
    updateEndpoint: SYSTEM_ENDPOINTS.DICT_RARITY_UPDATE,
    deleteEndpoint: SYSTEM_ENDPOINTS.DICT_RARITY_DELETE,
    idField: 'code',
    fields: ['code', 'name', 'color', 'description', 'level', 'drop_rate_modifier', 'status']
  },
  'asset-groups': {
    name: '资产分组字典',
    listEndpoint: SYSTEM_ENDPOINTS.DICT_ASSET_GROUP_LIST,
    detailEndpoint: SYSTEM_ENDPOINTS.DICT_ASSET_GROUP_DETAIL,
    createEndpoint: SYSTEM_ENDPOINTS.DICT_ASSET_GROUP_CREATE,
    updateEndpoint: SYSTEM_ENDPOINTS.DICT_ASSET_GROUP_UPDATE,
    deleteEndpoint: SYSTEM_ENDPOINTS.DICT_ASSET_GROUP_DELETE,
    idField: 'code',
    fields: ['code', 'name', 'description', 'display_name', 'sort_order', 'status']
  }
}

/**
 * 字典管理状态
 * @returns {Object} 状态对象
 */
export function useDictState() {
  return {
    /** @type {string} 当前选中的字典类型 */
    currentDictType: 'categories',
    /** @type {Object} 字典类型配置 */
    dictTypes: DICT_TYPES,
    /** @type {Array} 字典列表 */
    dictList: [],
    /** @type {Object} 字典筛选条件 */
    dictFilters: { keyword: '', status: '' },
    /** @type {Object} 字典表单 */
    dictForm: {
      code: '',
      name: '',
      description: '',
      display_name: '',
      sort_order: 0,
      status: 'active'
    },
    /** @type {Object|null} 选中的字典项 */
    selectedDict: null,
    /** @type {boolean} 是否编辑字典 */
    isEditDict: false,
    /** @type {string|null} 当前编辑的字典编码 */
    editingDictCode: null,
    /** @type {Object} 所有字典数据缓存（用于下拉选项） */
    allDictionaries: {
      categories: [],
      rarities: [],
      asset_groups: []
    }
  }
}

/**
 * 字典管理方法
 * @returns {Object} 方法对象
 */
export function useDictMethods() {
  return {
    /**
     * 获取当前字典类型配置
     * @returns {Object} 字典类型配置
     */
    getCurrentDictConfig() {
      return this.dictTypes[this.currentDictType] || this.dictTypes.categories
    },

    /**
     * 切换字典类型
     * @param {string} dictType - 字典类型
     */
    async switchDictType(dictType) {
      if (this.dictTypes[dictType]) {
        this.currentDictType = dictType
        await this.loadDictList()
      }
    },

    /**
     * 加载字典列表
     */
    async loadDictList() {
      try {
        const config = this.getCurrentDictConfig()
        const params = new URLSearchParams()
        if (this.dictFilters.keyword) params.append('keyword', this.dictFilters.keyword)
        if (this.dictFilters.status) params.append('status', this.dictFilters.status)

        const url = params.toString()
          ? `${config.listEndpoint}?${params}`
          : config.listEndpoint

        const response = await this.apiGet(url, {}, { showLoading: false })
        if (response?.success) {
          // 后端返回格式可能是 { data: { items: [...] } } 或 { data: [...] }
          this.dictList = response.data?.items || response.data?.list || response.data || []
        }
      } catch (error) {
        logger.error(`加载${this.getCurrentDictConfig().name}失败:`, error)
        this.dictList = []
      }
    },

    /**
     * 加载所有字典数据（用于下拉选项）
     */
    async loadAllDictionaries() {
      try {
        const response = await this.apiGet(
          SYSTEM_ENDPOINTS.DICT_ALL,
          {},
          { showLoading: false }
        )
        if (response?.success && response.data) {
          this.allDictionaries = {
            categories: response.data.categories || [],
            rarities: response.data.rarities || [],
            asset_groups: response.data.asset_groups || []
          }
        }
      } catch (error) {
        logger.error('加载所有字典数据失败:', error)
      }
    },

    /**
     * 打开创建字典模态框
     */
    openCreateDictModal() {
      this.isEditDict = false
      this.editingDictCode = null
      this.dictForm = this.getEmptyDictForm()
      this.showModal('dictModal')
    },

    /**
     * 获取空的字典表单
     * @returns {Object} 空表单
     */
    getEmptyDictForm() {
      const config = this.getCurrentDictConfig()
      const form = { status: 'active' }
      config.fields.forEach(field => {
        if (field === 'sort_order' || field === 'level') {
          form[field] = 0
        } else if (field === 'drop_rate_modifier') {
          form[field] = 1.0
        } else if (field !== 'status') {
          form[field] = ''
        }
      })
      return form
    },

    /**
     * 编辑字典
     * @param {Object} dict - 字典对象
     */
    editDict(dict) {
      const config = this.getCurrentDictConfig()
      this.isEditDict = true
      this.editingDictCode = dict[config.idField] || dict.code
      this.dictForm = { ...dict }
      this.showModal('dictModal')
    },

    /**
     * 查看字典详情
     * @param {Object} dict - 字典对象
     */
    async viewDictDetail(dict) {
      const config = this.getCurrentDictConfig()
      const code = dict[config.idField] || dict.code
      try {
        const url = buildURL(config.detailEndpoint, { code })
        const response = await this.apiGet(url, {}, { showLoading: true })
        if (response?.success) {
          this.selectedDict = response.data
          this.showModal('dictDetailModal')
        }
      } catch (error) {
        logger.error('加载字典详情失败:', error)
        this.showError('加载字典详情失败')
      }
    },

    /**
     * 提交字典表单
     */
    async submitDictForm() {
      const config = this.getCurrentDictConfig()

      if (!this.dictForm.code || !this.dictForm.name) {
        this.showError('请填写编码和名称')
        return
      }

      try {
        this.saving = true
        let url, method

        if (this.isEditDict) {
          url = buildURL(config.updateEndpoint, { code: this.editingDictCode })
          method = 'PUT'
        } else {
          url = config.createEndpoint
          method = 'POST'
        }

        const response = await this.apiCall(url, {
          method,
          data: this.dictForm
        })

        if (response?.success) {
          this.showSuccess(this.isEditDict ? '字典更新成功' : '字典创建成功')
          this.hideModal('dictModal')
          await this.loadDictList()
          // 更新缓存
          await this.loadAllDictionaries()
        }
      } catch (error) {
        this.showError('保存字典失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 删除字典
     * @param {Object} dict - 字典对象
     */
    async deleteDict(dict) {
      const config = this.getCurrentDictConfig()
      const code = dict[config.idField] || dict.code
      const name = dict.name || dict.display_name || code

      await this.confirmAndExecute(
        `确定删除字典「${name}」？`,
        async () => {
          const url = buildURL(config.deleteEndpoint, { code })
          const response = await this.apiCall(url, { method: 'DELETE' })
          if (response?.success) {
            await this.loadDictList()
            // 更新缓存
            await this.loadAllDictionaries()
          }
        },
        { successMessage: '字典已删除', confirmText: '确认删除' }
      )
    },

    /**
     * 获取字典类型选项列表
     * @returns {Array} 字典类型选项
     */
    getDictTypeOptions() {
      return Object.entries(this.dictTypes).map(([key, config]) => ({
        value: key,
        label: config.name
      }))
    },

    /**
     * 格式化状态显示
     * @param {string} status - 状态值
     * @returns {Object} 状态显示配置
     */
    formatDictStatus(status) {
      const statusMap = {
        active: { label: '启用', class: 'bg-green-100 text-green-800' },
        inactive: { label: '禁用', class: 'bg-gray-100 text-gray-800' },
        deprecated: { label: '已废弃', class: 'bg-red-100 text-red-800' }
      }
      return statusMap[status] || { label: status, class: 'bg-gray-100 text-gray-800' }
    }
  }
}

export default { useDictState, useDictMethods }
