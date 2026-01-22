/**
 * 页面重定向器 - 旧 URL 兼容性处理
 *
 * @file public/admin/js/core/page-redirector.js
 * @description 自动将旧的分散页面 URL 重定向到新的整合页面
 * @version 1.0.0
 * @date 2026-01-23
 *
 * 使用说明：
 * - 此脚本需要在旧页面的 <head> 中最早加载
 * - 脚本会自动检查当前 URL，并重定向到新页面
 * - 可以通过 URL 参数 ?no_redirect=1 禁用重定向
 *
 * 示例：
 * - /admin/prizes.html → /admin/lottery-management.html?page=prizes
 * - /admin/stores.html → /admin/store-management.html?page=store-list
 */

;(function() {
  'use strict'

  /**
   * 页面重定向映射表
   * 键: 旧页面路径（不含 /admin 前缀）
   * 值: 新页面路径和参数
   */
  const PAGE_REDIRECT_MAP = {
    // ====================
    // 资产管理相关
    // ====================
    'user-assets.html': { path: 'asset-management.html', page: 'user-assets' },
    'user-inventory.html': { path: 'asset-management.html', page: 'user-inventory' },
    'material-types.html': { path: 'asset-management.html', page: 'material-types' },
    // 注意: asset-adjustment.html 作为独立页面保留，不需要重定向
    // 'asset-adjustment.html': { path: 'asset-management.html', page: 'asset-adjustment' },
    'orphan-frozen.html': { path: 'asset-management.html', page: 'orphan-frozen' },

    // ====================
    // 用户管理相关
    // ====================
    'users.html': { path: 'user-management.html', page: 'users' },
    'roles.html': { path: 'user-management.html', page: 'roles' },
    'sessions.html': { path: 'user-management.html', page: 'sessions' },
    'user-points.html': { path: 'user-management.html', page: 'user-points' },
    'user-tags.html': { path: 'user-management.html', page: 'user-tags' },

    // ====================
    // 内容管理相关
    // ====================
    'announcements.html': { path: 'content-management.html', page: 'announcements' },
    'global-notifications.html': { path: 'content-management.html', page: 'notifications' },
    'popup-banners.html': { path: 'content-management.html', page: 'banners' },
    'image-resources.html': { path: 'content-management.html', page: 'images' },
    'feedbacks.html': { path: 'content-management.html', page: 'feedbacks' },

    // ====================
    // 抽奖管理相关
    // ====================
    'prizes.html': { path: 'lottery-management.html', page: 'prizes' },
    'campaigns.html': { path: 'lottery-management.html', page: 'campaigns' },
    'lottery-strategy.html': { path: 'lottery-management.html', page: 'lottery-strategy' },
    'lottery-metrics.html': { path: 'lottery-management.html', page: 'lottery-metrics' },
    'lottery-quota.html': { path: 'lottery-management.html', page: 'lottery-quota' },
    'tier-matrix.html': { path: 'lottery-management.html', page: 'tier-matrix' },
    'presets.html': { path: 'lottery-management.html', page: 'presets' },
    'activity-conditions.html': { path: 'lottery-management.html', page: 'campaigns' },
    'campaign-budget.html': { path: 'lottery-management.html', page: 'campaigns' },
    'pricing-config.html': { path: 'lottery-management.html', page: 'campaigns' },

    // ====================
    // 门店管理相关
    // ====================
    'stores.html': { path: 'store-management.html', page: 'store-list' },
    'store-staff.html': { path: 'store-management.html', page: 'store-staff' },
    'merchant-points.html': { path: 'store-management.html', page: 'merchant-points' },

    // ====================
    // 市场交易管理相关 (已整合到 exchange-market.html 和 trade-management.html)
    // ====================
    'exchange-items.html': { path: 'exchange-market.html', page: 'items' },
    'exchange-orders.html': { path: 'exchange-market.html', page: 'orders' },
    'exchange-stats.html': { path: 'exchange-market.html', page: 'stats' },
    'trade-orders.html': { path: 'trade-management.html', page: 'trade-orders' },
    'marketplace-stats.html': { path: 'trade-management.html', page: 'marketplace-stats' },
    // 旧的 market-management.html 重定向到 exchange-market.html
    'market-management.html': { path: 'exchange-market.html', page: null },

    // ====================
    // 财务管理相关
    // ====================
    'consumption.html': { path: 'finance-management.html', page: 'consumption-review' },
    'diamond-accounts.html': { path: 'finance-management.html', page: 'diamond-accounts' },
    'debt-management.html': { path: 'finance-management.html', page: 'debt-management' },
    'redemption-orders.html': { path: 'finance-management.html', page: 'redemption-orders' },

    // ====================
    // 系统设置相关
    // ====================
    'settings.html': { path: 'system-settings.html', page: 'system-config' },
    'system-config.html': { path: 'system-settings.html', page: 'system-config' },
    'dict-management.html': { path: 'system-settings.html', page: 'dict-management' },
    // 注意: config-tools.html 作为独立页面保留，不需要重定向
    // 'config-tools.html': { path: 'system-settings.html', page: 'config-tools' },
    'audit-logs.html': { path: 'system-settings.html', page: 'audit-logs' },
    // 注意: item-templates.html 作为独立页面保留，不需要重定向
    // 'item-templates.html': { path: 'system-settings.html', page: 'item-templates' },

    // ====================
    // 旧 pages 目录的页面
    // ====================
    'pages/asset-management.html': { path: 'asset-management.html', page: null },
    'pages/market-management.html': { path: 'exchange-market.html', page: null },
    'pages/user-management.html': { path: 'user-management.html', page: null },
    'pages/system-config.html': { path: 'system-settings.html', page: null }
  }

  /**
   * 检查是否应该执行重定向
   */
  function shouldRedirect() {
    // 如果 URL 包含 ?no_redirect=1 参数，则不重定向
    if (window.location.search.includes('no_redirect=1')) {
      console.log('[PageRedirector] 重定向已禁用 (no_redirect=1)')
      return false
    }
    return true
  }

  /**
   * 获取当前页面相对路径
   */
  function getCurrentPagePath() {
    const pathname = window.location.pathname
    // 移除 /admin/ 前缀
    const match = pathname.match(/\/admin\/(.+)$/)
    return match ? match[1] : null
  }

  /**
   * 执行页面重定向
   */
  function performRedirect() {
    if (!shouldRedirect()) {
      return
    }

    const currentPath = getCurrentPagePath()
    if (!currentPath) {
      return
    }

    const redirectConfig = PAGE_REDIRECT_MAP[currentPath]
    if (!redirectConfig) {
      // 当前页面不在重定向映射中，无需处理
      return
    }

    // 构建新 URL
    let newUrl = `/admin/${redirectConfig.path}`

    // 如果有指定子页面，添加 page 参数
    if (redirectConfig.page) {
      newUrl += `?page=${redirectConfig.page}`
    }

    // 保留原始 URL 中的其他参数（排除 page 参数，避免冲突）
    const currentParams = new URLSearchParams(window.location.search)
    currentParams.delete('page') // 移除原有的 page 参数

    // 添加其他参数到新 URL
    if (currentParams.toString()) {
      newUrl += (newUrl.includes('?') ? '&' : '?') + currentParams.toString()
    }

    // 执行重定向
    console.log(`[PageRedirector] 重定向: ${window.location.pathname} → ${newUrl}`)
    window.location.replace(newUrl)
  }

  /**
   * 生成兼容性提示横幅（可选，用于开发调试）
   */
  function showDeprecationNotice(oldPath, newPath) {
    // 仅在开发环境显示
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return
    }

    const notice = document.createElement('div')
    notice.id = 'deprecation-notice'
    notice.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #fff3cd;
      color: #856404;
      padding: 8px 16px;
      font-size: 14px;
      z-index: 99999;
      text-align: center;
      border-bottom: 1px solid #ffc107;
    `
    notice.innerHTML = `
      ⚠️ 此页面已迁移到新地址: <a href="${newPath}" style="color: #856404; font-weight: bold;">${newPath}</a>
      <button onclick="this.parentNode.remove()" style="margin-left: 16px; border: none; background: none; cursor: pointer; color: #856404;">✕</button>
    `
    document.body.insertBefore(notice, document.body.firstChild)
  }

  /**
   * 手动触发重定向（供外部调用）
   * @param {string} targetPath - 目标页面路径（如 'prizes.html'）
   * @param {object} options - 可选参数
   */
  window.PageRedirector = {
    redirect: function(targetPath, options = {}) {
      const config = PAGE_REDIRECT_MAP[targetPath]
      if (config) {
        let url = `/admin/${config.path}`
        if (config.page && !options.skipPage) {
          url += `?page=${config.page}`
        }
        window.location.href = url
      }
    },

    getRedirectUrl: function(targetPath) {
      const config = PAGE_REDIRECT_MAP[targetPath]
      if (config) {
        let url = `/admin/${config.path}`
        if (config.page) {
          url += `?page=${config.page}`
        }
        return url
      }
      return null
    },

    isDeprecatedPage: function(path) {
      return !!PAGE_REDIRECT_MAP[path || getCurrentPagePath()]
    },

    getRedirectMap: function() {
      return { ...PAGE_REDIRECT_MAP }
    }
  }

  // 页面加载时立即执行重定向检查
  performRedirect()

})()

