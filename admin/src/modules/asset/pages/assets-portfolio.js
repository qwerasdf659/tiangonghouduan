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
      totalValue: 0,
      totalUsers: 0,
      totalAssets: 0,
      growthRate: 0
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

      await this.withLoading(async () => {
        await Promise.all([
          this.loadAssetStats(),
          this.loadAssetTypes(),
          this.loadAssets()
        ])
        // 初始化图表（数据加载完成后）
        this.$nextTick(() => {
          this.initCharts()
        })
      }, { errorMessage: '加载资产数据失败' })
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
          
          this.overview = {
            totalValue: summary.total_circulation || 0,
            totalUsers: summary.total_holders || 0,
            totalAssets: summary.total_asset_types || 0,
            growthRate: 0 // 后端暂未提供增长率
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
          this.overview = {
            totalValue: assetTypes.reduce((sum, a) => sum + (a.total_supply || 0), 0),
            totalUsers: 0, // 需要单独API获取
            totalAssets: assetTypes.length,
            growthRate: 0
          }
        }
      } catch (error) {
        logger.error('[AssetsPortfolioPage] 备用统计计算失败:', error)
      }
    },

    /**
     * 加载资产类型
     */
    async loadAssetTypes() {
      try {
        const response = await request({ url: ASSET_ENDPOINTS.ADJUSTMENT_ASSET_TYPES, method: 'GET' })
        if (response && response.success) {
          const data = response.data?.asset_types || response.data
          this.assetTypes = Array.isArray(data) ? data : []
          logger.debug('[AssetsPortfolioPage] 资产类型加载成功:', this.assetTypes.length, '种类型')
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
          this.totalRecords = 0
          this.totalPages = 0
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
            const assetName = (item.asset_name || item.display_name || item.asset_code || '未知资产') + campaignInfo
            
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
          
          // 资产余额无分页，直接使用数组长度
          this.totalRecords = this.assets.length
          this.totalPages = 1
          
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
      this.currentPage = 1
      await this.withLoading(async () => {
        await this.loadAssets()
      }, { errorMessage: '搜索资产失败' })
    },

    /**
     * 导出资产
     */
    async exportAssets() {
      this.showInfo('导出功能开发中...')
      // TODO: 实现导出功能
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
          this.assetHistory = (data.transactions || []).map(tx => ({
            id: tx.transaction_id,
            type: tx.tx_type,
            amount: tx.amount,
            balance_before: tx.balance_before,
            balance_after: tx.balance_after,
            description: tx.description || tx.reason || tx.tx_type,
            created_at: tx.created_at
          }))
          logger.debug('[AssetsPortfolioPage] 资产历史加载成功:', this.assetHistory.length, '条记录')
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
        'admin_adjustment': '管理员调整',
        'lottery_reward': '抽奖奖励',
        'consumption': '消费',
        'market_listing_freeze': '市场挂单冻结',
        'market_listing_withdraw_unfreeze': '市场撤单解冻',
        'market_purchase': '市场购买',
        'transfer_in': '转入',
        'transfer_out': '转出'
      }
      return typeMap[type] || type
    },

    // ==================== 分页方法 ====================

    /**
     * 上一页
     */
    async prevPage() {
      if (this.currentPage > 1) {
        this.currentPage--
        await this.loadAssets()
      }
    },

    /**
     * 下一页
     */
    async nextPage() {
      if (this.currentPage < this.totalPages) {
        this.currentPage++
        await this.loadAssets()
      }
    },

    // ==================== 图表初始化 ====================

    /**
     * 初始化图表
     */
    initCharts() {
      const echarts = this._echarts
      
      // 检查 ECharts 是否可用
      if (!echarts) {
        logger.warn('[AssetsPortfolioPage] ECharts 未加载，跳过图表初始化')
        return
      }

      this.initAssetTypeChart()
      this.initValueTrendChart()
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
      const chartData = statsData.length > 0 
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
        series: [{
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
        }]
      }

      this.assetTypeChart.setOption(option)
    },

    /**
     * 初始化资产价值趋势图
     */
    initValueTrendChart() {
      const echarts = this._echarts
      if (!echarts) return
      
      const chartDom = document.getElementById('valueTrendChart')
      if (!chartDom) return

      // 防止重复初始化：先检查是否已有实例
      this.valueTrendChart = echarts.getInstanceByDom(chartDom) || echarts.init(chartDom)

      // 生成模拟趋势数据（实际应从API获取）
      const dates = []
      const values = []
      const today = new Date()
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        dates.push(`${date.getMonth() + 1}/${date.getDate()}`)
        values.push(Math.floor(Math.random() * 1000) + this.overview.totalValue * 0.9)
      }

      const option = {
        tooltip: {
          trigger: 'axis'
        },
        xAxis: {
          type: 'category',
          data: dates
        },
        yAxis: {
          type: 'value',
          axisLabel: {
            formatter: (value) => this.formatNumber(value)
          }
        },
        series: [{
          name: '资产价值',
          type: 'line',
          smooth: true,
          data: values,
          areaStyle: {
            opacity: 0.3
          },
          lineStyle: {
            width: 2
          }
        }]
      }

      this.valueTrendChart.setOption(option)
    },

    // ==================== 工具方法 ====================

    /**
     * 格式化货币
     */
    formatCurrency(value) {
      if (value === null || value === undefined) return '¥0.00'
      const num = Number(value)
      if (isNaN(num)) return '¥0.00'
      return '¥' + num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
    getAssetTypeText(type) {
      const typeMap = {
        'points': '积分',
        'POINTS': '积分',
        'balance': '余额',
        'BALANCE': '余额',
        'diamond': '钻石',
        'DIAMOND': '钻石',
        'material': '材料',
        'MATERIAL': '材料',
        'item': '物品',
        'ITEM': '物品',
        'BUDGET_POINTS': '预算积分'
      }
      return typeMap[type] || type || '未知'
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('assetsPortfolioPage', assetsPortfolioPage)
  logger.info('[AssetsPortfolioPage] Alpine 组件已注册 v3.1.0')
})
