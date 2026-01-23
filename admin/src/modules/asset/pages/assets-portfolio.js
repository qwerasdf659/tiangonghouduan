/**
 * 运营资产中心页面 - Alpine.js Mixin 重构版
 *
 * @file public/admin/js/pages/assets-portfolio.js
 * @description 运营资产总览、资产类型管理
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 */


import { logger } from '../../../utils/logger.js'
import { ASSET_ENDPOINTS } from '../../../api/asset.js'
function assetsPortfolioPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createPageMixin({ pagination: true }),

    // ==================== 页面特有状态 ====================

    /** 资产总览 */
    assetOverview: [],

    /** 资产类型列表 */
    assetTypes: [],

    /** 资产配置 */
    assetConfig: {
      total_supply: 0,
      circulating_supply: 0,
      frozen_supply: 0
    },

    /** 搜索表单 */
    searchForm: {
      user_id: '',
      asset_type: ''
    },

    // ==================== 生命周期 ====================

    /**
     * 初始化
     */
    init() {
      logger.info('运营资产中心页面初始化 (Mixin v3.0)')

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
      await this.withLoading(async () => {
        await Promise.all([this.loadAssetOverview(), this.loadAssetTypes()])
      }, '加载资产数据...')
    },

    /**
     * 加载资产总览 - 使用 material API 获取资产类型统计
     */
    async loadAssetOverview() {
      try {
        // 使用 MATERIAL.ASSET_TYPES 获取资产类型列表作为总览数据
        const response = await apiRequest(ASSET_ENDPOINTS.MATERIAL_ASSET_TYPES)
        if (response && response.success) {
          const assetTypes = response.data?.asset_types || response.data || []
          this.assetOverview = assetTypes.map(item => ({
            asset_code: item.asset_code,
            asset_name: item.asset_name || item.name,
            icon: item.icon || '💎',
            total_supply: item.total_supply || 0,
            circulating_supply: item.circulating || 0,
            status: item.status || 'active'
          }))
          // 计算汇总配置
          this.assetConfig = {
            total_supply: this.assetOverview.reduce((sum, a) => sum + (a.total_supply || 0), 0),
            circulating_supply: this.assetOverview.reduce(
              (sum, a) => sum + (a.circulating_supply || 0),
              0
            ),
            frozen_supply: 0 // material API 不提供冻结数据
          }
        }
      } catch (error) {
        logger.error('加载资产总览失败:', error)
        this.showError('加载资产总览失败')
      }
    },

    /**
     * 加载资产类型 - 使用 material API
     */
    async loadAssetTypes() {
      try {
        const response = await apiRequest(ASSET_ENDPOINTS.MATERIAL_ASSET_TYPES)
        if (response && response.success) {
          const data = response.data?.asset_types || response.data
          this.assetTypes = Array.isArray(data) ? data : []
        }
      } catch (error) {
        logger.error('加载资产类型失败:', error)
        this.showError('加载资产类型失败')
      }
    },

    // ==================== 工具方法 ====================

    /**
     * 格式化数字
     */
    formatNumber(num) {
      if (num === null || num === undefined) return '0'
      const n = Number(num)
      if (isNaN(n)) return '0'
      if (n >= 100000000) return (n / 100000000).toFixed(2) + '亿'
      if (n >= 10000) return (n / 10000).toFixed(2) + '万'
      return n.toLocaleString('zh-CN')
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('assetsPortfolioPage', assetsPortfolioPage)
  logger.info('[AssetsPortfolioPage] Alpine 组件已注册 (Mixin v3.0)')
})
