/**
 * 运营资产中心页面
 * @description 展示系统所有资产类型的概览和统计信息
 * @created 2026-01-09
 * @version 1.0.0
 */

// ============================================================
// 页面初始化
// ============================================================

/**
 * 页面初始化
 */
document.addEventListener('DOMContentLoaded', function () {
  // 显示用户信息
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }

  // 事件监听器
  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('refreshBtn').addEventListener('click', loadAllData)

  // Token和权限验证
  if (!getToken() || !checkAdminPermission()) {
    return
  }

  // 加载所有数据
  loadAllData()
})

// ============================================================
// 数据加载函数
// ============================================================

/**
 * 加载所有数据
 * @returns {Promise<void>}
 */
async function loadAllData() {
  showLoading(true)

  try {
    await Promise.all([loadAssetOverview(), loadAssetTypes(), loadRecentTransactions()])
  } catch (error) {
    console.error('加载数据失败:', error)
    showErrorToast('加载数据失败：' + error.message)
  } finally {
    showLoading(false)
  }
}

/**
 * 加载资产概览
 * ✅ 对齐后端：使用 /api/v4/console/assets/stats 端点获取统计数据
 * @returns {Promise<void>}
 */
async function loadAssetOverview() {
  try {
    const response = await apiRequest(API_ENDPOINTS.ASSETS.STATS)

    if (response && response.success) {
      const stats = response.data.asset_stats || []
      const summary = response.data.summary || {}

      // 从后端统计数据构建概览
      const overview = stats.map(s => ({
        asset_code: s.asset_code,
        name: s.asset_code,
        total_circulation: s.total_circulation || 0,
        holder_count: s.holder_count || 0,
        total_frozen: s.total_frozen || 0,
        total_issued: s.total_issued || 0
      }))
      renderAssetOverview(overview, summary)
    }
  } catch (error) {
    console.error('加载资产概览失败:', error)
  }
}

/**
 * 加载资产类型详情（带统计数据）
 * ✅ 对齐后端：合并 asset-types 和 stats 数据
 * @returns {Promise<void>}
 */
async function loadAssetTypes() {
  const tbody = document.getElementById('assetTypeTableBody')

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
      const mergedTypes = types.map(t => ({
        ...t,
        total_issued: statsMap.get(t.asset_code)?.total_issued || 0,
        circulation: statsMap.get(t.asset_code)?.total_circulation || 0,
        frozen: statsMap.get(t.asset_code)?.total_frozen || 0,
        destroyed: 0,
        holder_count: statsMap.get(t.asset_code)?.holder_count || 0,
        is_active: t.is_enabled !== false
      }))

      renderAssetTypeTable(mergedTypes)
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center py-5 text-muted">
            <i class="bi bi-inbox" style="font-size: 3rem;"></i>
            <p class="mt-2">暂无资产类型数据</p>
          </td>
        </tr>
      `
    }
  } catch (error) {
    console.error('加载资产类型失败:', error)
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-5 text-danger">
          <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
          <p class="mt-2">加载失败：${error.message}</p>
        </td>
      </tr>
    `
  }
}

/**
 * 加载最近资产变动
 * ✅ 对齐后端：/api/v4/console/assets/transactions 需要 user_id 参数
 * 该端点用于查询特定用户的流水，不支持全局流水查询
 * 显示提示信息引导用户到资产调整页面查询
 * @returns {Promise<void>}
 */
async function loadRecentTransactions() {
  const tbody = document.getElementById('recentTransactionsBody')

  // 后端 /api/v4/console/assets/transactions 需要 user_id，不支持全局查询
  // 引导用户到资产调整页面按用户查询
  tbody.innerHTML = `
    <tr>
      <td colspan="7" class="text-center py-5 text-muted">
        <i class="bi bi-info-circle" style="font-size: 2rem;"></i>
        <p class="mt-2">资产流水需按用户查询</p>
        <a href="/admin/asset-adjustment.html" class="btn btn-sm btn-primary mt-2">
          <i class="bi bi-search"></i> 前往资产调整页面查询
        </a>
      </td>
    </tr>
  `
}

// ============================================================
// 渲染函数
// ============================================================

/**
 * 渲染资产概览卡片
 * @param {Array} overview - 资产概览数据
 * @param {Object} summary - 汇总数据
 */
function renderAssetOverview(overview, summary = {}) {
  const container = document.getElementById('assetOverviewContainer')

  // 资产图标和颜色映射
  const assetConfig = {
    POINTS: { name: '积分', icon: 'bi-star-fill', color: 'warning' },
    DIAMOND: { name: '钻石', icon: 'bi-gem', color: 'info' },
    GOLD: { name: '金币', icon: 'bi-coin', color: 'warning' },
    BUDGET_POINTS: { name: '预算积分', icon: 'bi-wallet2', color: 'success' }
  }

  // 取前4个最常用的资产展示在概览卡片
  const topAssets = overview.slice(0, 4)

  // 如果实际数据不足4个，补充默认显示
  const displayAssets = ['POINTS', 'DIAMOND', 'BUDGET_POINTS', 'GOLD'].map(code => {
    const data = overview.find(o => o.asset_code === code) || { asset_code: code }
    const config = assetConfig[code] || { name: code, icon: 'bi-box-seam', color: 'secondary' }
    return { ...data, ...config }
  })

  container.innerHTML = displayAssets
    .map(
      asset => `
      <div class="col-md-3">
        <div class="card asset-overview-card">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <h6 class="text-muted mb-1">${asset.name}</h6>
                <div class="asset-value text-${asset.color}">${formatNumber(asset.total_circulation || 0)}</div>
                <small class="text-muted">
                  持有用户: ${asset.holder_count || 0}
                </small>
              </div>
              <div>
                <i class="bi ${asset.icon} asset-icon text-${asset.color}"></i>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
    )
    .join('')
}

/**
 * 渲染资产类型表格
 * @param {Array} types - 资产类型列表
 */
function renderAssetTypeTable(types) {
  const tbody = document.getElementById('assetTypeTableBody')

  if (!types || types.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-5 text-muted">
          <i class="bi bi-inbox" style="font-size: 3rem;"></i>
          <p class="mt-2">暂无资产类型数据</p>
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = types
    .map(type => {
      const statusBadge =
        type.is_active !== false
          ? '<span class="badge bg-success">启用</span>'
          : '<span class="badge bg-secondary">禁用</span>'

      return `
      <tr>
        <td><code>${type.asset_code}</code></td>
        <td>${type.name || type.asset_code}</td>
        <td>${formatNumber(type.total_issued || 0)}</td>
        <td>${formatNumber(type.circulation || 0)}</td>
        <td>${formatNumber(type.frozen || 0)}</td>
        <td>${formatNumber(type.destroyed || 0)}</td>
        <td>${type.holder_count || 0}</td>
        <td>${statusBadge}</td>
        <td>
          <a href="/admin/material-transactions.html?asset_code=${type.asset_code}" 
             class="btn btn-sm btn-outline-primary">
            <i class="bi bi-clock-history"></i> 流水
          </a>
        </td>
      </tr>
    `
    })
    .join('')
}

/**
 * 渲染最近变动表格
 * @param {Array} transactions - 交易记录列表
 */
function renderRecentTransactions(transactions) {
  const tbody = document.getElementById('recentTransactionsBody')

  if (!transactions || transactions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-5 text-muted">
          <i class="bi bi-inbox" style="font-size: 3rem;"></i>
          <p class="mt-2">暂无变动记录</p>
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = transactions
    .map(tx => {
      const amountClass = tx.amount >= 0 ? 'text-success' : 'text-danger'
      const amountPrefix = tx.amount >= 0 ? '+' : ''

      return `
      <tr>
        <td>${formatDate(tx.created_at)}</td>
        <td>${tx.user_nickname || tx.user_id || '-'}</td>
        <td>${tx.asset_name || tx.asset_code}</td>
        <td>${tx.tx_type || '-'}</td>
        <td class="${amountClass}">${amountPrefix}${tx.amount}</td>
        <td>${tx.balance_after || '-'}</td>
        <td>${tx.operator_name || '-'}</td>
      </tr>
    `
    })
    .join('')
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 格式化数字（大数字简化显示）
 * @param {number} num - 数字
 * @returns {string} 格式化后的字符串
 */
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

/**
 * 显示/隐藏加载状态
 * @param {boolean} show - 是否显示
 */
function showLoading(show) {
  document.getElementById('loadingOverlay').classList.toggle('show', show)
}
