/**
 * Filter Bar 筛选栏组件
 * 
 * @file public/admin/js/alpine/components/filter-bar.js
 * @description 基于 Alpine.js 的筛选栏组件
 * @version 1.0.0
 * @date 2026-01-22
 * 
 * 使用方式：
 * <div x-data="filterBar({ filters: [...] })" @search="handleSearch">
 *   <form @submit.prevent="search">...</form>
 * </div>
 */

/**
 * Filter Bar 组件数据
 * @param {Object} config - 配置选项
 * @param {Array} config.filters - 筛选器配置数组
 * @param {Function} config.onSearch - 搜索回调
 * @param {Function} config.onReset - 重置回调
 */
function filterBar(config = {}) {
  return {
    filters: config.filters || [],
    values: {},
    onSearch: config.onSearch || null,
    onReset: config.onReset || null,
    loading: false,

    // 初始化
    init() {
      console.log('[FilterBar] 初始化')
      this.initValues()
    },

    // 初始化筛选值
    initValues() {
      this.filters.forEach(filter => {
        this.values[filter.key] = filter.default || ''
      })
    },

    // 执行搜索
    search() {
      console.log('[FilterBar] 搜索:', this.values)
      
      if (this.onSearch) {
        this.onSearch(this.getValues())
      }
      
      // 触发自定义事件
      this.$dispatch('search', this.getValues())
    },

    // 重置筛选
    reset() {
      console.log('[FilterBar] 重置')
      this.initValues()
      
      if (this.onReset) {
        this.onReset()
      }
      
      // 触发自定义事件
      this.$dispatch('reset')
      
      // 自动执行搜索
      this.search()
    },

    // 获取有效的筛选值（排除空值）
    getValues() {
      const result = {}
      Object.entries(this.values).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
          result[key] = value
        }
      })
      return result
    },

    // 设置筛选值
    setValue(key, value) {
      this.values[key] = value
    },

    // 获取筛选值
    getValue(key) {
      return this.values[key] || ''
    },

    // 渲染筛选器输入框
    getInputType(filter) {
      const typeMap = {
        text: 'text',
        number: 'number',
        date: 'date',
        datetime: 'datetime-local',
        email: 'email',
        tel: 'tel',
        search: 'search'
      }
      return typeMap[filter.type] || 'text'
    },

    // 判断是否是选择框
    isSelect(filter) {
      return filter.type === 'select' && filter.options
    },

    // 判断是否是日期范围
    isDateRange(filter) {
      return filter.type === 'daterange'
    },

    // 计算列宽
    getColClass(filter) {
      return `col-md-${filter.col || 3}`
    }
  }
}

/**
 * 高级筛选组件（支持展开/收起）
 */
function advancedFilter(config = {}) {
  return {
    ...filterBar(config),
    
    expanded: false,
    basicFilters: config.basicFilters || [],
    advancedFilters: config.advancedFilters || [],

    // 切换展开状态
    toggle() {
      this.expanded = !this.expanded
    },

    // 获取当前显示的筛选器
    get visibleFilters() {
      if (this.expanded) {
        return [...this.basicFilters, ...this.advancedFilters]
      }
      return this.basicFilters
    },

    // 是否有高级筛选器
    get hasAdvanced() {
      return this.advancedFilters.length > 0
    }
  }
}

console.log('📦 FilterBar 组件已加载')

