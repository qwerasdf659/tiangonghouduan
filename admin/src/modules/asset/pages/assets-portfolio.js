/**
 * 资产组合页面 - Alpine.js Mixin 重构版
 *
 * @file admin/src/modules/asset/pages/assets-portfolio.js
 * @description 资产组合总览、资产类型分布、用户资产查询
 * @version 3.1.0 (修复HTML模板匹配)
 * @date 2026-01-25
 */

import { logger } from '../../../utils/logger.js'
import { ASSET_ENDPOINTS } from '../../../api/asset.js'
import { request, buildURL } from '../../../api/base.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import { loadECharts } from '../../../utils/index.js'

function assetsPortfolioPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createPageMixin({ pagination: true }),

    // ==================== 页面特有状态 ====================

    /** 资产总览统计 - 匹配HTML模板 */
    overview: {
      total_circulation: 0,
      total_holders: 0,
      total_asset_types: 0,
      growth_rate: 0
    },

    /** 资产列表 - 匹配HTML模板的 assets */
    assets: [],

    /** 资产类型列表 */
    assetTypes: [],

    /** 搜索表单 - 匹配HTML模板 */
    searchForm: {
      user_id: '',
      asset_type: '',
      min_value: null
    },

    /** 选中的资产详情 */
    selectedAsset: null,

    /** 资产历史记录 */
    assetHistory: [],
    historyLoading: false,
    showHistoryModal: false,
    historyAsset: null,

    /** 图表实例 */
    assetTypeChart: null,
    valueTrendChart: null,

    /** ECharts 核心模块引用 */
    _echarts: null,

    /** resize 事件绑定标记 */
    _resizeHandlerBound: false,

    /** 资产统计详情（用于图表） */
    _assetStats: [],

    // ==================== 生命周期 ====================

    /**
     * 初始化
     */
    init() {
      logger.info('[AssetsPortfolioPage] 初始化 v3.1.0')

      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }

      // 加载所有数据
      this.loadAllData()
    },

    // ==================== 数据加载 ====================

    /**
     * 加载所有数据
     */
    async loadAllData() {
      // 动态加载 ECharts（懒加载优化）
      try {
        this._echarts = await loadECharts()
        logger.info('[AssetsPortfolioPage] ECharts 加载完成')
      } catch (error) {
        logger.error('[AssetsPortfolioPage] ECharts 加载失败:', error)
      }

      await this.withLoading(
        async () => {
          await Promise.all([this.loadAssetStats(), this.loadAssetTypes(), this.loadAssets()])
          // 初始化图表（数据加载完成后）
          this.$nextTick(() => {
            this.initCharts()
          })
        },
        { errorMessage: '加载资产数据失败' }
      )
    },

    /**
     * 加载资产统计 - 获取总览数据
     *
     * 后端返回格式：
     * {
     *   asset_stats: [...],
     *   summary: { total_asset_types, total_holders, total_circulation, total_frozen }
     * }
     */
    async loadAssetStats() {
      try {
        const response = await request({ url: ASSET_ENDPOINTS.STATS, method: 'GET' })
        if (response && response.success && response.data) {
          const data = response.data
          const summary = data.summary || {}

          // 直接使用后端字段名
          this.overview = {
            total_circulation: summary.total_circulation || 0,
            total_holders: summary.total_holders || 0,
            total_asset_types: summary.total_asset_types || 0,
            growth_rate: 0 // 后端暂未提供增长率
          }

          // 保存资产统计详情用于图表
          this._assetStats = data.asset_stats || []

          logger.debug('[AssetsPortfolioPage] 资产统计加载成功:', this.overview)
        }
      } catch (error) {
        logger.error('[AssetsPortfolioPage] 加载资产统计失败:', error)
        // 尝试从材料资产类型计算统计数据
        await this.calculateStatsFromAssetTypes()
      }
    },

    /**
     * 从资产类型计算统计数据（备用方案）
     */
    async calculateStatsFromAssetTypes() {
      try {
        const response = await request({ url: ASSET_ENDPOINTS.MATERIAL_ASSET_TYPES, method: 'GET' })
        if (response && response.success) {
          const assetTypes = response.data?.asset_types || response.data || []
          // 直接使用后端字段名
          this.overview = {
            total_circulation: assetTypes.reduce((sum, a) => sum + (a.total_supply || 0), 0),
            total_holders: 0, // 需要单独API获取
            total_asset_types: assetTypes.length,
            growth_rate: 0
          }
        }
      } catch (error) {
        logger.error('[AssetsPortfolioPage] 备用统计计算失败:', error)
      }
    },

    /**
     * 加载资产类型
     *
     * 后端 /asset-adjustment/asset-types 会返回 builtin (POINTS/DIAMOND/BUDGET_POINTS)
     * 和 material (DIAMOND/BUDGET_POINTS/red_shard) 两组，存在 asset_code 重复。
     * 前端按 asset_code 去重，优先保留 builtin 分类。
     */
    async loadAssetTypes() {
      try {
        const response = await request({
          url: ASSET_ENDPOINTS.ADJUSTMENT_ASSET_TYPES,
          method: 'GET'
        })
        if (response && response.success) {
          const data = response.data?.asset_types || response.data
          const rawTypes = Array.isArray(data) ? data : []

          // 按 asset_code 去重，优先保留 builtin 分类
          const typeMap = new Map()
          for (const type of rawTypes) {
            if (!type || !type.asset_code) continue
            // builtin 优先；如已有 builtin 则跳过 material 同名项
            if (!typeMap.has(type.asset_code) || type.category === 'builtin') {
              typeMap.set(type.asset_code, type)
            }
          }
          this.assetTypes = Array.from(typeMap.values())

          logger.debug('[AssetsPortfolioPage] 资产类型加载成功:', this.assetTypes.length, '种类型（去重后）')
        }
      } catch (error) {
        logger.error('[AssetsPortfolioPage] 加载资产类型失败:', error)
      }
    },

    /**
     * 加载资产列表（用户资产明细）
     *
     * 注意：后端没有"所有用户资产列表"API
     * - 如果指定了用户ID，使用 asset-adjustment 获取该用户资产余额
     * - 如果没有指定用户ID，显示提示信息
     */
    async loadAssets() {
      try {
        // 必须指定用户ID才能查询资产
        if (!this.searchForm.user_id) {
          logger.debug('[AssetsPortfolioPage] 未指定用户ID，显示空列表')
          this.assets = []
          this.total_records = 0
          this.total_pages = 0
          return
        }

        // 使用资产调整API获取指定用户的资产余额
        const userId = this.searchForm.user_id
        const url = buildURL(ASSET_ENDPOINTS.ADJUSTMENT_USER_BALANCES, { user_id: userId })
        const response = await request({ url, method: 'GET' })

        if (response && response.success) {
          const data = response.data
          // 转换为前端期望的格式
          const balances = data.balances || data.assets || []
          this.assets = balances.map((item, index) => {
            // 生成唯一ID：userId_assetCode_campaignId_index
            const campaignPart = item.campaign_id ? `_${item.campaign_id}` : ''
            const assetId = `${userId}_${item.asset_code || 'unknown'}${campaignPart}_${index}`
            // 显示名称：包含活动信息
            const campaignInfo = item.campaign_id ? ` (活动:${item.campaign_id})` : ''
            const assetName =
              (item.asset_name || item.display_name || item.asset_code || '未知资产') + campaignInfo

            return {
              asset_id: assetId,
              user_id: parseInt(userId),
              user_nickname: data.user?.nickname || `用户${userId}`,
              asset_type: item.asset_code || item.asset_type || 'unknown',
              asset_name: assetName,
              quantity: item.available_amount || item.balance || item.amount || 0,
              frozen_amount: item.frozen_amount || 0,
              unit_price: item.unit_price || 1,
              total_value: item.total || item.available_amount || 0,
              campaign_id: item.campaign_id || null,
              updated_at: item.updated_at || new Date().toISOString()
            }
          })

          // 客户端筛选：如果指定了资产类型
          if (this.searchForm.asset_type) {
            this.assets = this.assets.filter(
              a => a.asset_type === this.searchForm.asset_type
            )
          }

          // 客户端筛选：如果指定了最低价值
          if (this.searchForm.min_value && this.searchForm.min_value > 0) {
            this.assets = this.assets.filter(
              a => a.total_value >= this.searchForm.min_value
            )
          }

          // 资产余额无分页，直接使用数组长度
          this.total_records = this.assets.length
          this.total_pages = 1

          logger.debug('[AssetsPortfolioPage] 资产列表加载成功:', this.assets.length, '条记录')
        }
      } catch (error) {
        logger.error('[AssetsPortfolioPage] 加载资产列表失败:', error)
        this.assets = []
        this.showError(`加载用户 ${this.searchForm.user_id} 资产失败`)
      }
    },

    // ==================== 搜索和操作 ====================

    /**
     * 搜索资产
     */
    async searchAssets() {
      this.current_page = 1
      await this.withLoading(
        async () => {
          await this.loadAssets()
        },
        { errorMessage: '搜索资产失败' }
      )
    },

    /**
     * 导出资产
     */
    async exportAssets() {
      await this.withLoading(
        async () => {
          const { AssetAPI } = await import('../../../api/asset.js')

          // 构建导出参数
          const params = {
            format: 'excel',
            limit: 1000
          }

          // 如果有筛选条件，添加到参数
          if (this.searchForm.asset_type) {
            params.type = this.searchForm.asset_type
          }
          if (this.searchForm.user_id) {
            params.user_id = this.searchForm.user_id
          }

          logger.info('[AssetsPortfolioPage] 导出资产', params)

          // 调用导出API获取文件流
          const blob = await AssetAPI.exportAssets(params)

          // 创建下载链接
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `资产列表_${new Date().toISOString().slice(0, 10)}.xlsx`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)

          this.showSuccess('导出成功')
        },
        { errorMessage: '导出资产失败' }
      )
    },

    /**
     * 查看资产详情
     */
    viewAssetDetail(asset) {
      this.selectedAsset = asset
    },

    /**
     * 查看资产历史
     */
    async viewAssetHistory(asset) {
      this.historyAsset = asset
      this.historyLoading = true
      this.assetHistory = []
      this.showHistoryModal = true

      try {
        // 构建查询参数
        const params = new URLSearchParams()
        params.append('user_id', asset.user_id)
        params.append('asset_code', asset.asset_type)
        params.append('page_size', '20')

        const url = `${ASSET_ENDPOINTS.TRANSACTIONS}?${params.toString()}`
        const response = await request({ url, method: 'GET' })

        if (response && response.success) {
          const data = response.data
          // 直接使用后端字段名，仅保留复合字段（description 有降级逻辑）
          this.assetHistory = (data.transactions || []).map(tx => ({
            ...tx,
            // description 复合字段：按优先级取值
            description: tx.description || tx.reason || tx.tx_type
          }))
          logger.debug(
            '[AssetsPortfolioPage] 资产历史加载成功:',
            this.assetHistory.length,
            '条记录'
          )
        }
      } catch (error) {
        logger.error('[AssetsPortfolioPage] 加载资产历史失败:', error)
        this.showError('加载资产历史失败')
      } finally {
        this.historyLoading = false
      }
    },

    /**
     * 关闭历史模态框
     */
    closeHistoryModal() {
      this.showHistoryModal = false
      this.assetHistory = []
      this.historyAsset = null
    },

    /**
     * 格式化交易类型
     */
    formatTxType(type) {
      const typeMap = {
        admin_adjustment: '管理员调整',
        lottery_reward: '抽奖奖励',
        consumption: '消费',
        market_listing_freeze: '市场挂单冻结',
        market_listing_withdraw_unfreeze: '市场撤单解冻',
        market_purchase: '市场购买',
        transfer_in: '转入',
        transfer_out: '转出'
      }
      return typeMap[type] || type
    },

    // ==================== 分页方法 ====================

    /**
     * 上一页
     */
    async prevPage() {
      if (this.current_page > 1) {
        this.current_page--
        await this.loadAssets()
      }
    },

    /**
     * 下一页
     */
    async nextPage() {
      if (this.current_page < this.total_pages) {
        this.current_page++
        await this.loadAssets()
      }
    },

    // ==================== 图表初始化 ====================

    /**
     * 初始化图表
     * 注意：此页面可能在 iframe 中加载（如 prize-config.html 的 Tab），
     * 需要确保图表容器可见且有尺寸后再初始化
     */
    initCharts() {
      const echarts = this._echarts

      // 检查 ECharts 是否可用
      if (!echarts) {
        logger.warn('[AssetsPortfolioPage] ECharts 未加载，跳过图表初始化')
        return
      }

      // 检查图表容器是否有尺寸（iframe 中可能还未可见）
      const chartDom = document.getElementById('assetTypeChart')
      if (chartDom && chartDom.offsetWidth > 0) {
        this.initAssetTypeChart()
        this.initValueTrendChart()
      } else {
        // 容器尚无尺寸，延迟初始化并监听可见性变化
        logger.info('[AssetsPortfolioPage] 图表容器暂无尺寸，延迟初始化...')
        this._scheduleChartInit()
      }
    },

    /**
     * 延迟初始化图表（处理 iframe/隐藏 Tab 场景）
     */
    _scheduleChartInit() {
      // 方案1：使用 ResizeObserver 监听容器尺寸变化
      const chartDom = document.getElementById('assetTypeChart')
      if (chartDom && typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver((entries) => {
          for (const entry of entries) {
            if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
              logger.info('[AssetsPortfolioPage] 图表容器可见，开始初始化图表')
              observer.disconnect()
              this.initAssetTypeChart()
              this.initValueTrendChart()
              return
            }
          }
        })
        observer.observe(chartDom)
        // 安全超时：30秒后断开观察
        setTimeout(() => observer.disconnect(), 30000)
      } else {
        // 方案2：降级为定时重试
        let retries = 0
        const maxRetries = 10
        const retryInterval = setInterval(() => {
          retries++
          const dom = document.getElementById('assetTypeChart')
          if (dom && dom.offsetWidth > 0) {
            clearInterval(retryInterval)
            logger.info('[AssetsPortfolioPage] 图表容器就绪（重试' + retries + '次）')
            this.initAssetTypeChart()
            this.initValueTrendChart()
          } else if (retries >= maxRetries) {
            clearInterval(retryInterval)
            logger.warn('[AssetsPortfolioPage] 图表容器始终无尺寸，放弃初始化')
          }
        }, 500)
      }
    },

    /**
     * 初始化资产类型分布图
     */
    initAssetTypeChart() {
      const echarts = this._echarts
      if (!echarts) return

      const chartDom = document.getElementById('assetTypeChart')
      if (!chartDom) return

      // 防止重复初始化：先检查是否已有实例
      this.assetTypeChart = echarts.getInstanceByDom(chartDom) || echarts.init(chartDom)

      // 准备图表数据 - 优先使用资产统计数据
      const statsData = this._assetStats || []
      const chartData =
        statsData.length > 0
          ? statsData.map(stat => ({
              name: stat.asset_code,
              value: stat.total_circulation || 0
            }))
          : this.assetTypes.map(type => ({
              name: type.display_name || type.asset_name || type.name || type.asset_code,
              value: type.total_supply || type.count || 0
            }))

      const option = {
        tooltip: {
          trigger: 'item',
          formatter: '{b}: {c} ({d}%)'
        },
        legend: {
          orient: 'vertical',
          right: 10,
          top: 'center'
        },
        series: [
          {
            type: 'pie',
            radius: ['40%', '70%'],
            center: ['40%', '50%'],
            data: chartData.length > 0 ? chartData : [{ name: '暂无数据', value: 1 }],
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            }
          }
        ]
      }

      this.assetTypeChart.setOption(option)
    },

    /**
     * 初始化资产价值趋势图
     * 使用各资产类型的流通量作为柱状对比图
     * （后端暂无时序趋势API，使用当前各资产流通量对比）
     */
    initValueTrendChart() {
      const echarts = this._echarts
      if (!echarts) return

      const chartDom = document.getElementById('valueTrendChart')
      if (!chartDom) return

      // 防止重复初始化：先检查是否已有实例
      this.valueTrendChart = echarts.getInstanceByDom(chartDom) || echarts.init(chartDom)

      // 使用真实的资产统计数据作为柱状对比
      const statsData = this._assetStats || []
      const assetNames = statsData.map(stat => stat.asset_code)
      const circulationValues = statsData.map(stat => stat.total_circulation || 0)
      const frozenValues = statsData.map(stat => stat.total_frozen || 0)

      const option = {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' }
        },
        legend: {
          data: ['流通量', '冻结量']
        },
        xAxis: {
          type: 'category',
          data: assetNames.length > 0 ? assetNames : ['暂无数据'],
          axisLabel: {
            rotate: assetNames.length > 5 ? 30 : 0,
            fontSize: 11
          }
        },
        yAxis: {
          type: 'value',
          axisLabel: {
            formatter: value => this.formatNumber(value)
          }
        },
        series: [
          {
            name: '流通量',
            type: 'bar',
            data: circulationValues.length > 0 ? circulationValues : [0],
            itemStyle: { color: '#10b981' }
          },
          {
            name: '冻结量',
            type: 'bar',
            data: frozenValues.length > 0 ? frozenValues : [0],
            itemStyle: { color: '#f59e0b' }
          }
        ]
      }

      this.valueTrendChart.setOption(option)

      // 监听窗口 resize 事件（iframe 场景下重要）
      if (!this._resizeHandlerBound) {
        this._resizeHandlerBound = true
        window.addEventListener('resize', () => {
          if (this.assetTypeChart) this.assetTypeChart.resize()
          if (this.valueTrendChart) this.valueTrendChart.resize()
        })
      }
    },

    // ==================== 工具方法 ====================

    /**
     * 格式化货币（大数使用紧凑显示：万/亿）
     */
    formatCurrency(value) {
      if (value === null || value === undefined) return '¥0.00'
      const num = Number(value)
      if (isNaN(num)) return '¥0.00'
      if (num >= 1e16) return '¥' + (num / 1e16).toFixed(2) + '京'
      if (num >= 1e12) return '¥' + (num / 1e12).toFixed(2) + '万亿'
      if (num >= 1e8) return '¥' + (num / 1e8).toFixed(2) + '亿'
      if (num >= 1e4) return '¥' + (num / 1e4).toFixed(2) + '万'
      return (
        '¥' + num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      )
    },

    /**
     * 格式化百分比
     */
    formatPercentage(value) {
      if (value === null || value === undefined) return '0%'
      const num = Number(value)
      if (isNaN(num)) return '0%'
      return (num * 100).toFixed(2) + '%'
    },

    /**
     * 格式化数字（大数简化）
     */
    formatNumber(num) {
      if (num === null || num === undefined) return '0'
      const n = Number(num)
      if (isNaN(n)) return '0'
      if (n >= 100000000) return (n / 100000000).toFixed(2) + '亿'
      if (n >= 10000) return (n / 10000).toFixed(2) + '万'
      return n.toLocaleString('zh-CN')
    },

    /**
     * 获取资产类型显示文本
     */
    // ✅ 已删除 getAssetTypeText 映射函数 - 改用后端 _display 字段（P2 中文化）
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('assetsPortfolioPage', assetsPortfolioPage)
  logger.info('[AssetsPortfolioPage] Alpine 组件已注册 v3.1.0')
})
