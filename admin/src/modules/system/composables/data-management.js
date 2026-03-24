/**
 * 数据管理 Composable - 状态 + 方法
 *
 * @module system/composables/data-management
 * @description 数据一键删除功能的 Alpine.js 状态和方法
 * @version 1.0.0
 * @date 2026-03-10
 */

import { DataManagementAPI } from '../../../api/system/data-management.js'
import { loadECharts } from '../../../utils/echarts-lazy.js'

/**
 * 数据管理状态
 * @returns {Object} Alpine.js 响应式状态
 */
export function useDataManagementState() {
  return {
    /** @type {string} 当前激活的 Tab */
    activeTab: 'overview',

    // ========== Tab 1: 数据总览 ==========
    /** @type {Object|null} 数据量统计 */
    stats: null,
    /** @type {boolean} 统计加载中 */
    statsLoading: false,

    // ========== Tab 2: 自动清理策略 ==========
    /** @type {Array} 策略列表 */
    policies: [],
    /** @type {boolean} 策略加载中 */
    policiesLoading: false,
    /** @type {Object|null} 正在编辑的策略 */
    editingPolicy: null,

    // ========== Tab 3: 手动清理 ==========
    /** @type {string} 清理模式：manual/pre_launch/auto */
    cleanupMode: 'manual',
    /** @type {number} 手动清理步骤（1-5） */
    cleanupStep: 1,
    /** @type {string[]} 选中的清理类目 */
    selectedCategories: [],
    /** @type {Object} 时间范围 */
    timeRange: { start: '', end: '' },
    /** @type {Object} 筛选条件 */
    cleanupFilters: { user_id: '', lottery_campaign_id: '', business_type_prefix: '' },
    /** @type {string} 管理员验证码（二次确认） */
    verificationCode: '',
    /** @type {Object|null} 预览结果 */
    previewResult: null,
    /** @type {boolean} 预览加载中 */
    previewLoading: false,
    /** @type {string} 确认文字输入 */
    confirmationText: '',
    /** @type {string} 操作原因 */
    cleanupReason: '',
    /** @type {boolean} 干跑模式：仅预览影响，不实际删除数据 */
    dry_run: false,
    /** @type {boolean} 清理执行中 */
    cleanupExecuting: false,
    /** @type {Object|null} 清理结果 */
    cleanupResult: null,

    // ========== Tab 4: 对账校验 ==========
    /** @type {Object|null} 资产域对账结果 */
    assetReconciliation: null,
    /** @type {Object|null} 物品域对账结果 */
    itemReconciliation: null,
    /** @type {boolean} 对账加载中 */
    reconcileLoading: false,

    // ========== Tab 5: 清理历史 ==========
    /** @type {Array} 清理历史列表 */
    historyList: [],
    /** @type {Object} 历史分页 */
    historyPagination: { page: 1, page_size: 20, total: 0, total_pages: 1 },
    /** @type {boolean} 历史加载中 */
    historyLoading: false,

    /** @type {string[]} 可用的清理类目 */
    availableCategories: [
      { key: 'lottery_records', label: '抽奖记录' },
      { key: 'lottery_monitoring', label: '抽奖监控（告警与模拟）' },
      { key: 'monitoring_metrics', label: '监控指标' },
      { key: 'consumption_records', label: '消费与核销' },
      { key: 'customer_service', label: '客服会话' },
      { key: 'market_listings', label: '市场挂牌' },
      { key: 'notifications', label: '用户通知' },
      { key: 'feedbacks', label: '用户反馈' },
      { key: 'market_snapshots', label: '市场快照' },
      { key: 'exchange_records', label: '兑换记录' },
      { key: 'bid_records', label: '竞拍记录' },
      { key: 'system_debts', label: '系统垫付' }
    ]
  }
}

/**
 * 数据管理方法
 * @returns {Object} Alpine.js 方法
 */
export function useDataManagementMethods() {
  return {
    /**
     * 切换 Tab
     * @param {string} tab - Tab 名称
     */
    switchTab(tab) {
      this.activeTab = tab
      if (tab === 'overview' && !this.stats) this.loadStats()
      if (tab === 'policies' && this.policies.length === 0) this.loadPolicies()
      if (tab === 'history' && this.historyList.length === 0) this.loadHistory()
    },

    // ==================== Tab 1: 数据总览 ====================

    /** 加载数据量统计 */
    async loadStats() {
      this.statsLoading = true
      try {
        const res = await DataManagementAPI.getStats()
        if (res.success) {
          this.stats = res.data
          this.renderOverviewCharts()
        } else {
          this.showError(res.message || '获取统计失败')
        }
      } catch (error) {
        this.showError('获取统计失败: ' + error.message)
      } finally {
        this.statsLoading = false
      }
    },

    /**
     * 渲染数据总览 ECharts 图表（安全等级饼图 + Top20 柱状图）
     * 在 loadStats() 成功后自动调用
     */
    async renderOverviewCharts() {
      if (!this.stats) return

      try {
        const echarts = await loadECharts()

        /* 安全等级数据量饼图 */
        this.$nextTick(() => {
          const pieEl = document.getElementById('level-pie-chart')
          if (pieEl) {
            const pieChart = echarts.init(pieEl)
            const levelColors = {
              L0: '#ef4444',
              L1: '#f97316',
              L2: '#eab308',
              L3: '#22c55e',
              other: '#6b7280'
            }
            const pieData = Object.entries(this.stats.by_level).map(([level, info]) => ({
              name: level === 'other' ? '其他' : level,
              value: info.tables.reduce((sum, t) => sum + Number(t.estimated_rows || 0), 0),
              itemStyle: { color: levelColors[level] }
            }))

            pieChart.setOption({
              title: { text: '各安全等级数据量分布', left: 'center', textStyle: { fontSize: 14 } },
              tooltip: {
                trigger: 'item',
                formatter: p => `${p.name}: ${Number(p.value).toLocaleString()} 行 (${p.percent}%)`
              },
              legend: { bottom: 0, textStyle: { fontSize: 11 } },
              series: [
                {
                  type: 'pie',
                  radius: ['35%', '65%'],
                  center: ['50%', '45%'],
                  label: { formatter: '{b}\n{d}%', fontSize: 11 },
                  data: pieData
                }
              ]
            })
            window.addEventListener('resize', () => pieChart.resize())
          }

          /* Top 20 表数据量柱状图 */
          const barEl = document.getElementById('top20-bar-chart')
          if (barEl && this.stats.top_tables?.length > 0) {
            const barChart = echarts.init(barEl)
            const top20 = this.stats.top_tables.slice(0, 20)

            barChart.setOption({
              title: { text: '数据量 Top 20 表', left: 'center', textStyle: { fontSize: 14 } },
              tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: params => {
                  const p = params[0]
                  return `${p.name}<br/>预估行数: ${Number(p.value).toLocaleString()}`
                }
              },
              grid: { left: 10, right: 30, bottom: 5, top: 40, containLabel: true },
              xAxis: { type: 'value', axisLabel: { fontSize: 10 } },
              yAxis: {
                type: 'category',
                inverse: true,
                data: top20.map(t => t.table_name),
                axisLabel: { fontSize: 10, width: 160, overflow: 'truncate' }
              },
              series: [
                {
                  type: 'bar',
                  data: top20.map(t => Number(t.estimated_rows || 0)),
                  itemStyle: {
                    color: params => {
                      const colors = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd']
                      return colors[params.dataIndex % colors.length]
                    }
                  },
                  label: {
                    show: true,
                    position: 'right',
                    fontSize: 10,
                    formatter: p => p.value.toLocaleString()
                  }
                }
              ]
            })
            window.addEventListener('resize', () => barChart.resize())
          }
        })
      } catch (error) {
        console.warn('[DataManagement] ECharts 图表渲染失败:', error.message)
      }
    },

    // ==================== Tab 2: 自动清理策略 ====================

    /** 加载策略列表 */
    async loadPolicies() {
      this.policiesLoading = true
      try {
        const res = await DataManagementAPI.getPolicies()
        if (res.success) {
          this.policies = res.data?.policies || []
        }
      } catch (error) {
        this.showError('获取策略失败: ' + error.message)
      } finally {
        this.policiesLoading = false
      }
    },

    /**
     * 开始编辑策略
     * @param {Object} policy - 策略对象
     */
    startEditPolicy(policy) {
      this.editingPolicy = { ...policy }
    },

    /** 取消编辑策略 */
    cancelEditPolicy() {
      this.editingPolicy = null
    },

    /** 保存策略 */
    async savePolicy() {
      if (!this.editingPolicy) return
      try {
        const res = await DataManagementAPI.updatePolicy(this.editingPolicy.table, {
          retention_days: this.editingPolicy.retention_days,
          enabled: this.editingPolicy.enabled
        })
        if (res.success) {
          this.showSuccess('策略更新成功')
          this.editingPolicy = null
          await this.loadPolicies()
        } else {
          this.showError(res.message || '更新失败')
        }
      } catch (error) {
        this.showError('策略更新失败: ' + error.message)
      }
    },

    /**
     * 切换策略启用状态
     * @param {Object} policy - 策略对象
     */
    async togglePolicy(policy) {
      try {
        const res = await DataManagementAPI.updatePolicy(policy.table, { enabled: !policy.enabled })
        if (res.success) {
          policy.enabled = !policy.enabled
        }
      } catch (error) {
        this.showError('切换失败: ' + error.message)
      }
    },

    // ==================== Tab 3: 手动清理 ====================

    /**
     * 切换清理类目选中状态
     * @param {string} catKey - 类目键
     */
    toggleCategory(catKey) {
      const idx = this.selectedCategories.indexOf(catKey)
      if (idx === -1) {
        this.selectedCategories.push(catKey)
      } else {
        this.selectedCategories.splice(idx, 1)
      }
    },

    /**
     * 检查类目是否选中
     * @param {string} catKey - 类目键
     * @returns {boolean}
     */
    isCategorySelected(catKey) {
      return this.selectedCategories.includes(catKey)
    },

    /** 进入下一步 */
    nextStep() {
      if (this.cleanupStep === 1 && this.selectedCategories.length === 0) {
        this.showError('请至少选择一个清理类目')
        return
      }
      if (this.cleanupStep === 2) {
        this.runPreview()
        return
      }
      this.cleanupStep++
    },

    /** 返回上一步 */
    prevStep() {
      if (this.cleanupStep > 1) {
        this.cleanupStep--
      }
    },

    /** 重置手动清理状态 */
    resetManualCleanup() {
      this.cleanupStep = 1
      this.selectedCategories = []
      this.timeRange = { start: '', end: '' }
      this.cleanupFilters = { user_id: '', lottery_campaign_id: '', business_type_prefix: '' }
      this.previewResult = null
      this.confirmationText = ''
      this.verificationCode = ''
      this.cleanupReason = ''
      this.cleanupResult = null
    },

    /** 执行预览 */
    async runPreview() {
      this.previewLoading = true
      try {
        const params = {
          mode: this.cleanupMode,
          categories: this.cleanupMode === 'manual' ? this.selectedCategories : undefined
        }
        if (this.timeRange.start || this.timeRange.end) {
          params.time_range = {}
          if (this.timeRange.start) params.time_range.start = this.timeRange.start
          if (this.timeRange.end) params.time_range.end = this.timeRange.end
        }
        const filters = {}
        if (this.cleanupFilters.user_id) {
          filters.user_id = Number(this.cleanupFilters.user_id)
        }
        if (this.cleanupFilters.lottery_campaign_id) {
          filters.lottery_campaign_id = Number(this.cleanupFilters.lottery_campaign_id)
        }
        if (this.cleanupFilters.business_type_prefix) {
          filters.business_type_prefix = this.cleanupFilters.business_type_prefix.trim()
        }
        if (Object.keys(filters).length > 0) {
          params.filters = filters
        }

        const res = await DataManagementAPI.preview(params)
        if (res.success) {
          this.previewResult = res.data
          this.cleanupStep = 3
        } else {
          this.showError(res.message || '预览失败')
        }
      } catch (error) {
        this.showError('预览失败: ' + error.message)
      } finally {
        this.previewLoading = false
      }
    },

    /** 执行清理 */
    async executeCleanup() {
      if (this.confirmationText !== '确认删除') {
        this.showError('请输入"确认删除"以确认操作')
        return
      }
      if (!this.cleanupReason.trim()) {
        this.showError('请填写操作原因')
        return
      }
      if (!this.verificationCode.trim()) {
        this.showError('请输入管理员验证码')
        return
      }

      this.cleanupExecuting = true
      try {
        const res = await DataManagementAPI.cleanup({
          preview_token: this.previewResult.preview_token,
          dry_run: this.dry_run,
          reason: this.cleanupReason,
          confirmation_text: this.confirmationText,
          verification_code: this.verificationCode
        })
        if (res.success) {
          this.cleanupResult = res.data
          this.cleanupStep = 5
          const modeLabel = this.dry_run ? '干跑模式完成（未实际删除）' : '清理完成'
          this.showSuccess(
            `${modeLabel}，共${this.dry_run ? '影响' : '删除'} ${res.data.total_deleted} 条数据`
          )
        } else {
          this.showError(res.message || '清理失败')
        }
      } catch (error) {
        this.showError('清理失败: ' + error.message)
      } finally {
        this.cleanupExecuting = false
      }
    },

    // ==================== Tab 4: 对账校验 ====================

    /** 运行对账校验 */
    async runReconciliation() {
      this.reconcileLoading = true
      try {
        const [assetsRes, itemsRes] = await Promise.all([
          DataManagementAPI.reconcileAssets(),
          DataManagementAPI.reconcileItems()
        ])
        if (assetsRes.success) this.assetReconciliation = assetsRes.data
        if (itemsRes.success) this.itemReconciliation = itemsRes.data
        this.showSuccess('对账校验完成')
      } catch (error) {
        this.showError('对账校验失败: ' + error.message)
      } finally {
        this.reconcileLoading = false
      }
    },

    // ==================== Tab 5: 清理历史 ====================

    /** 加载清理历史 */
    async loadHistory() {
      this.historyLoading = true
      try {
        const res = await DataManagementAPI.getHistory({
          page: this.historyPagination.page,
          page_size: this.historyPagination.page_size
        })
        if (res.success) {
          this.historyList = res.data || []
          if (res.pagination) {
            this.historyPagination.total = res.pagination.total
            this.historyPagination.total_pages = res.pagination.total_pages
          }
        }
      } catch (error) {
        this.showError('获取历史失败: ' + error.message)
      } finally {
        this.historyLoading = false
      }
    },

    /**
     * 历史分页跳转
     * @param {number} page - 页码
     */
    goToHistoryPage(page) {
      if (page >= 1 && page <= this.historyPagination.total_pages) {
        this.historyPagination.page = page
        this.loadHistory()
      }
    },

    /**
     * 安全等级徽标样式
     * @param {string} level - L0/L1/L2/L3
     * @returns {string} Tailwind CSS 类名
     */
    getLevelBadgeClass(level) {
      const map = {
        L0: 'bg-red-100 text-red-800',
        L1: 'bg-orange-100 text-orange-800',
        L2: 'bg-yellow-100 text-yellow-800',
        L3: 'bg-green-100 text-green-800'
      }
      return map[level] || 'bg-gray-100 text-gray-800'
    }
  }
}
