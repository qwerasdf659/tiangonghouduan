/**
 * 运营资产中心页面 - Alpine.js Mixin 重构版
 *
 * @file public/admin/js/pages/assets-portfolio.js
 * @description 运营资产总览、资产类型管理
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 */

function assetsPortfolioPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createDashboardMixin(),
    
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

    // ==================== 生命周期 ====================
    
    /**
     * 初始化
     */
    init() {
      console.log('✅ 运营资产中心页面初始化 (Mixin v3.0)')
      
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
        await Promise.all([
          this.loadAssetOverview(),
          this.loadAssetTypes()
        ])
      }, '加载资产数据...')
    },

    /**
     * 加载资产总览
     */
    async loadAssetOverview() {
      try {
        const response = await apiRequest(API_ENDPOINTS.ASSETS.OVERVIEW)
        if (response && response.success) {
          this.assetOverview = response.data?.assets || []
          this.assetConfig = {
            total_supply: response.data?.total_supply || 0,
            circulating_supply: response.data?.circulating_supply || 0,
            frozen_supply: response.data?.frozen_supply || 0
          }
        }
      } catch (error) {
        console.error('加载资产总览失败:', error)
        this.showError('加载资产总览失败')
      }
    },

    /**
     * 加载资产类型
     */
    async loadAssetTypes() {
      try {
        const response = await apiRequest(API_ENDPOINTS.ASSET_TYPES.LIST)
        if (response && response.success) {
          this.assetTypes = response.data?.asset_types || response.data || []
        }
      } catch (error) {
        console.error('加载资产类型失败:', error)
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
  console.log('✅ [AssetsPortfolioPage] Alpine 组件已注册 (Mixin v3.0)')
})
