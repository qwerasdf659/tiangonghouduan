/**
 * 数据导出弹窗组件
 *
 * @file admin/src/alpine/components/export-modal.js
 * @description 通用数据导出弹窗，支持多种格式和导出范围
 * @version 1.0.0
 * @date 2026-02-04
 *
 * 功能特性：
 * - 支持 Excel (.xlsx)、CSV (.csv)、PDF 三种格式
 * - 支持当前页/筛选结果/全部数据三种范围
 * - 支持字段脱敏选项
 * - 支持自定义导出字段选择
 * - 提供全局 Alpine.store 供外部调用
 *
 * 使用方式：
 * Alpine.store('exportModal').open({
 *   title: '导出消费记录',
 *   exportType: 'consumption',
 *   currentPageCount: 50,
 *   filteredCount: 1234,
 *   totalCount: 5678,
 *   onExport: async (options) => { ... }
 * })
 */

import { logger } from '../../utils/logger.js'

/**
 * 导出类型配置
 */
const EXPORT_TYPE_CONFIG = {
  consumption: {
    name: '消费记录',
    filename: '消费记录',
    supportedFormats: ['excel', 'csv'],
    defaultFormat: 'excel',
    fields: [
      { key: 'consumption_id', label: '消费ID', default: true },
      { key: 'user_id', label: '用户ID', default: true },
      { key: 'user_name', label: '用户名', default: true, sensitive: true },
      { key: 'phone', label: '手机号', default: true, sensitive: true },
      { key: 'store_name', label: '门店名称', default: true },
      { key: 'amount', label: '消费金额', default: true },
      { key: 'status', label: '状态', default: true },
      { key: 'created_at', label: '消费时间', default: true }
    ]
  },
  user: {
    name: '用户列表',
    filename: '用户列表',
    supportedFormats: ['excel', 'csv'],
    defaultFormat: 'csv',
    fields: [
      { key: 'user_id', label: '用户ID', default: true },
      { key: 'nickname', label: '昵称', default: true },
      { key: 'phone', label: '手机号', default: true, sensitive: true },
      { key: 'register_time', label: '注册时间', default: true },
      { key: 'total_consumption', label: '累计消费', default: true },
      { key: 'lottery_count', label: '抽奖次数', default: true },
      { key: 'last_active', label: '最后活跃', default: true }
    ]
  },
  alert: {
    name: '告警历史',
    filename: '告警历史',
    supportedFormats: ['excel'],
    defaultFormat: 'excel',
    fields: [
      { key: 'alert_id', label: '告警ID', default: true },
      { key: 'type', label: '告警类型', default: true },
      { key: 'severity', label: '严重程度', default: true },
      { key: 'message', label: '告警内容', default: true },
      { key: 'status', label: '处理状态', default: true },
      { key: 'handler', label: '处理人', default: true },
      { key: 'created_at', label: '触发时间', default: true },
      { key: 'resolved_at', label: '处理时间', default: false }
    ]
  },
  dashboard: {
    name: '运营日报',
    filename: '运营日报',
    supportedFormats: ['pdf', 'excel'],
    defaultFormat: 'pdf',
    fields: [
      { key: 'date', label: '日期', default: true },
      { key: 'lottery_count', label: '抽奖次数', default: true },
      { key: 'new_users', label: '新增用户', default: true },
      { key: 'active_users', label: '活跃用户', default: true },
      { key: 'consumption_amount', label: '消费金额', default: true },
      { key: 'win_rate', label: '中奖率', default: true },
      { key: 'health_score', label: '健康度', default: true }
    ]
  },
  lottery: {
    name: '抽奖记录',
    filename: '抽奖记录',
    supportedFormats: ['excel', 'csv'],
    defaultFormat: 'excel',
    fields: [
      { key: 'draw_id', label: '抽奖ID', default: true },
      { key: 'user_id', label: '用户ID', default: true },
      { key: 'user_name', label: '用户名', default: true, sensitive: true },
      { key: 'campaign_name', label: '活动名称', default: true },
      { key: 'prize_name', label: '奖品名称', default: true },
      { key: 'is_win', label: '是否中奖', default: true },
      { key: 'draw_time', label: '抽奖时间', default: true }
    ]
  },
  asset: {
    name: '资产流水',
    filename: '资产流水',
    supportedFormats: ['excel', 'csv'],
    defaultFormat: 'excel',
    fields: [
      { key: 'transaction_id', label: '交易ID', default: true },
      { key: 'user_id', label: '用户ID', default: true },
      { key: 'asset_type', label: '资产类型', default: true },
      { key: 'change_type', label: '变动类型', default: true },
      { key: 'amount', label: '变动数量', default: true },
      { key: 'balance_after', label: '变动后余额', default: true },
      { key: 'remark', label: '备注', default: true },
      { key: 'created_at', label: '交易时间', default: true }
    ]
  },
  merchant: {
    name: '商户贡献度',
    filename: '商户贡献度',
    supportedFormats: ['excel'],
    defaultFormat: 'excel',
    fields: [
      { key: 'store_id', label: '门店ID', default: true },
      { key: 'store_name', label: '门店名称', default: true },
      { key: 'consumption_amount', label: '消费金额', default: true },
      { key: 'consumption_count', label: '消费笔数', default: true },
      { key: 'avg_amount', label: '客单价', default: true },
      { key: 'contribution_rate', label: '贡献占比', default: true },
      { key: 'health_score', label: '健康度', default: true }
    ]
  }
}

/**
 * 导出弹窗 Store
 */
function createExportModalStore() {
  return {
    // ==================== 状态 ====================
    isOpen: false,
    loading: false,
    progress: 0,

    // 导出配置
    title: '导出数据',
    exportType: 'consumption',
    currentPageCount: 0,
    filteredCount: 0,
    totalCount: 0,

    // 用户选择
    selectedRange: 'filtered', // 'current' | 'filtered' | 'all'
    selectedFormat: 'excel', // 'excel' | 'csv' | 'pdf'
    enableMasking: true, // 是否脱敏
    selectedFields: [], // 选中的字段

    // 回调函数
    onExport: null,

    // ==================== 计算属性 ====================

    /**
     * 获取当前导出类型的配置
     */
    get typeConfig() {
      return EXPORT_TYPE_CONFIG[this.exportType] || EXPORT_TYPE_CONFIG.consumption
    },

    /**
     * 获取支持的格式列表
     */
    get supportedFormats() {
      return this.typeConfig.supportedFormats
    },

    /**
     * 获取可选字段列表
     */
    get availableFields() {
      return this.typeConfig.fields
    },

    /**
     * 获取当前选择的导出数量
     */
    get selectedCount() {
      switch (this.selectedRange) {
        case 'current':
          return this.currentPageCount
        case 'filtered':
          return this.filteredCount
        case 'all':
          return this.totalCount
        default:
          return 0
      }
    },

    /**
     * 获取格式显示名称
     */
    getFormatLabel(format) {
      const labels = {
        excel: 'Excel (.xlsx)',
        csv: 'CSV (.csv)',
        pdf: 'PDF'
      }
      return labels[format] || format
    },

    /**
     * 获取范围显示文本
     */
    getRangeLabel(range) {
      switch (range) {
        case 'current':
          return `当前页数据 (${this.currentPageCount}条)`
        case 'filtered':
          return `筛选结果 (${this.filteredCount}条)`
        case 'all':
          return `全部数据 (${this.totalCount}条)`
        default:
          return ''
      }
    },

    // ==================== 方法 ====================

    /**
     * 打开导出弹窗
     * @param {Object} options - 配置选项
     */
    open(options = {}) {
      logger.info('[ExportModal] 打开导出弹窗', options)

      this.title = options.title || '导出数据'
      this.exportType = options.exportType || 'consumption'
      this.currentPageCount = options.currentPageCount || 0
      this.filteredCount = options.filteredCount || 0
      this.totalCount = options.totalCount || 0
      this.onExport = options.onExport || null

      // 重置选择
      this.selectedRange = options.defaultRange || 'filtered'
      this.selectedFormat = this.typeConfig.defaultFormat
      this.enableMasking = options.enableMasking !== false
      this.selectedFields = this.availableFields.filter(f => f.default).map(f => f.key)

      this.loading = false
      this.progress = 0
      this.isOpen = true
    },

    /**
     * 关闭弹窗
     */
    close() {
      this.isOpen = false
      this.onExport = null
    },

    /**
     * 切换字段选择
     * @param {string} fieldKey - 字段键
     */
    toggleField(fieldKey) {
      const index = this.selectedFields.indexOf(fieldKey)
      if (index === -1) {
        this.selectedFields.push(fieldKey)
      } else {
        this.selectedFields.splice(index, 1)
      }
    },

    /**
     * 检查字段是否选中
     * @param {string} fieldKey - 字段键
     * @returns {boolean}
     */
    isFieldSelected(fieldKey) {
      return this.selectedFields.includes(fieldKey)
    },

    /**
     * 全选/取消全选字段
     */
    toggleAllFields() {
      if (this.selectedFields.length === this.availableFields.length) {
        this.selectedFields = []
      } else {
        this.selectedFields = this.availableFields.map(f => f.key)
      }
    },

    /**
     * 执行导出
     */
    async doExport() {
      if (this.selectedFields.length === 0) {
        Alpine.store('notification').show('请至少选择一个导出字段', 'warning')
        return
      }

      if (!this.onExport) {
        Alpine.store('notification').show('导出功能未配置', 'error')
        return
      }

      try {
        this.loading = true
        this.progress = 0

        const exportOptions = {
          type: this.exportType,
          range: this.selectedRange,
          format: this.selectedFormat,
          enableMasking: this.enableMasking,
          fields: this.selectedFields,
          filename: this.generateFilename()
        }

        logger.info('[ExportModal] 开始导出', exportOptions)

        // 模拟进度
        const progressInterval = setInterval(() => {
          if (this.progress < 90) {
            this.progress += Math.random() * 10
          }
        }, 200)

        // 执行导出
        await this.onExport(exportOptions)

        clearInterval(progressInterval)
        this.progress = 100

        Alpine.store('notification').show('导出成功', 'success')

        // 延迟关闭
        setTimeout(() => {
          this.close()
        }, 500)
      } catch (error) {
        logger.error('[ExportModal] 导出失败:', error)
        Alpine.store('notification').show('导出失败: ' + error.message, 'error')
      } finally {
        this.loading = false
      }
    },

    /**
     * 生成导出文件名
     * @returns {string}
     */
    generateFilename() {
      const config = this.typeConfig
      const date = new Date()
        .toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          timeZone: 'Asia/Shanghai'
        })
        .replace(/\//g, '-')

      const ext = this.selectedFormat === 'excel' ? 'xlsx' : this.selectedFormat
      return `${config.filename}_${date}.${ext}`
    }
  }
}

/**
 * 导出弹窗组件（用于 HTML 模板）
 */
function exportModal() {
  return {
    get store() {
      return Alpine.store('exportModal')
    },

    init() {
      logger.info('[ExportModal] 组件初始化')
    }
  }
}

// 注册 Alpine Store 和组件
document.addEventListener('alpine:init', () => {
  if (window.Alpine) {
    // 注册全局 Store
    window.Alpine.store('exportModal', createExportModalStore())
    // 注册组件
    window.Alpine.data('exportModal', exportModal)
    logger.info('[ExportModal] Alpine Store 和组件注册完成')
  }
})

// 导出
export { createExportModalStore, exportModal, EXPORT_TYPE_CONFIG }
export default exportModal
