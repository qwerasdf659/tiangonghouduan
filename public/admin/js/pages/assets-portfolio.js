/**
 * 运营资产中心页面 - Alpine.js 版本
 * @description 展示系统所有资产类型的概览和统计信息
 * @version 2.0.0
 */

function assetsPortfolioPage() {
  return {
    // ============================================================
    // 响应式数据
    // ============================================================
    userInfo: {},
    loading: false,
    assetOverview: [],
    assetTypes: [],

    // 资产图标和颜色映射
    assetConfig: {
      POINTS: { name: '积分', icon: 'bi-star-fill', color: 'warning' },
      DIAMOND: { name: '钻石', icon: 'bi-gem', color: 'info' },
      GOLD: { name: '金币', icon: 'bi-coin', color: 'warning' },
      BUDGET_POINTS: { name: '预算积分', icon: 'bi-wallet2', color: 'success' }
    },

    // ============================================================
    // 初始化
    // ============================================================
    init() {
      // 获取用户信息
      this.userInfo = getCurrentUser() || {}

      // Token和权限验证
      if (!getToken() || !checkAdminPermission()) {
        return
      }

      // 加载所有数据
      this.loadAllData()
    },

    // ============================================================
    // 数据加载方法
    // ============================================================

    /**
     * 加载所有数据
     */
    async loadAllData() {
      this.loading = true

      try {
        await Promise.all([
          this.loadAssetOverview(),
          this.loadAssetTypes()
        ])
      } catch (error) {
        console.error('加载数据失败:', error)
        this.showError('加载数据失败：' + error.message)
      } finally {
        this.loading = false
      }
    },

    /**
     * 加载资产概览
     */
    async loadAssetOverview() {
      try {
        const response = await apiRequest(API_ENDPOINTS.ASSETS.STATS)

        if (response && response.success) {
          const stats = response.data.asset_stats || []

          // 从后端统计数据构建概览
          const overview = stats.map(s => ({
            asset_code: s.asset_code,
            name: s.asset_code,
            total_circulation: s.total_circulation || 0,
            holder_count: s.holder_count || 0,
            total_frozen: s.total_frozen || 0,
            total_issued: s.total_issued || 0
          }))

          // 构建显示数据
          this.assetOverview = ['POINTS', 'DIAMOND', 'BUDGET_POINTS', 'GOLD'].map(code => {
            const data = overview.find(o => o.asset_code === code) || { asset_code: code }
            const config = this.assetConfig[code] || { name: code, icon: 'bi-box-seam', color: 'secondary' }
            return { ...data, ...config }
          })
        }
      } catch (error) {
        console.error('加载资产概览失败:', error)
      }
    },

    /**
     * 加载资产类型详情
     */
    async loadAssetTypes() {
      try {
        // 并行获取资产类型和统计数据
        const [typesResponse, statsResponse] = await Promise.all([
          apiRequest(API_ENDPOINTS.ASSET_ADJUSTMENT.ASSET_TYPES),
          apiRequest(API_ENDPOINTS.ASSETS.STATS)
        ])

        if (typesResponse && typesResponse.success) {
          const types = typesResponse.data.asset_types || typesResponse.data || []
          const stats = statsResponse?.data?.asset_stats || []

          // 创建统计数据映射
          const statsMap = new Map()
          stats.forEach(s => statsMap.set(s.asset_code, s))

          // 合并类型和统计数据
          this.assetTypes = types.map(t => ({
            ...t,
            total_issued: statsMap.get(t.asset_code)?.total_issued || 0,
            circulation: statsMap.get(t.asset_code)?.total_circulation || 0,
            frozen: statsMap.get(t.asset_code)?.total_frozen || 0,
            destroyed: 0,
            holder_count: statsMap.get(t.asset_code)?.holder_count || 0,
            is_active: t.is_enabled !== false
          }))
        }
      } catch (error) {
        console.error('加载资产类型失败:', error)
        this.assetTypes = []
      }
    },

    // ============================================================
    // 工具方法
    // ============================================================

    /**
     * 格式化数字（大数字简化显示）
     */
    formatNumber(num) {
      if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + 'M'
      } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K'
      }
      return num.toString()
    },

    /**
     * 显示成功消息
     */
    showSuccess(message) {
      this.$toast.success(message);
    },

    /**
     * 显示错误消息
     */
    showError(message) {
      this.$toast.error(message);
    },

    /**
     * 退出登录
     */
    handleLogout() {
      logout()
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('assetsPortfolioPage', assetsPortfolioPage)
  console.log('✅ [AssetsPortfolioPage] Alpine 组件已注册')
})
