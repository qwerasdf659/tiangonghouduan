/**
 * 统一静态资源配置管理
 *
 * @description 集中管理所有前端静态资源路径，避免硬编码导致404错误
 * @version 1.0.0
 * @created 2025-11-23
 *
 * 使用方式:
 * ```javascript
 * // 获取默认头像
 * const avatar = ResourceConfig.getImage('defaultAvatar');
 *
 * // 在HTML中使用
 * <img src="${ResourceConfig.getImage('defaultAvatar')}" alt="头像">
 * ```
 */

const ResourceConfig = {
  /**
   * 图片资源配置
   * 使用内联SVG (data URI) 避免额外HTTP请求和404错误
   */
  images: {
    /**
     * 默认用户头像
     * 来源: Bootstrap Icons - person-circle
     * 格式: SVG Base64编码
     * 尺寸: 64x64
     * 颜色: #ccc (浅灰色)
     */
    defaultAvatar: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgZmlsbD0iI2NjYyIgY2xhc3M9ImJpIGJpLXBlcnNvbi1jaXJjbGUiIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHBhdGggZD0iTTExIDZhMyAzIDAgMSAxLTYgMCAzIDMgMCAwIDEgNiAweiIvPjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgZD0iTTAgOGE4IDggMCAxIDEgMTYgMEE4IDggMCAwIDEgMCA4em04IDdhNyA3IDAgMCAwIDUuMzg3LTIuNTAzQTEzLjkzMyAxMy45MzMgMCAwIDAgOCAxMS41YTEzLjkzMyAxMy45MzMgMCAwIDAtNS4zODcgMS4wMDdBNyA3IDAgMCAwIDggMTV6Ii8+PC9zdmc+',

    /**
     * 默认商品图
     * 来源: Bootstrap Icons - box-seam
     */
    defaultProduct: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgZmlsbD0iI2NjYyIgY2xhc3M9ImJpIGJpLWJveC1zZWFtIiB2aWV3Qm94PSIwIDAgMTYgMTYiPjxwYXRoIGQ9Ik04LjE4NiAxLjExM2EuNS41IDAgMCAwLS4zNzIgMEwxLjg0NiA0LjVsNC4zIDEuNzg2YS40MS40MSAwIDAgMSAuMDU4LjA4TDEyIDkuNXY0LjYzNGwuNjU0LS4yN2EuNS41IDAgMCAwIC4yOTQtLjQ1N1YzLjQyOGEuNS41IDAgMCAwLS4yOS0uNDVsLTQuNDY4LTEuODY0ek00IDkuNWw0LjE3OCAyLjczMi4wNDItLjAyM1Y5LjV6bTQuMTg2IDYuMTA2YS41LjUgMCAwIDAtLjM3MiAwTDEuODQ2IDEyLjVsNC4zLTEuNzg2YS40MS40MSAwIDAgMSAuMDU4LS4wOEwxMiA3LjV2NC42MzRsLS42NTQuMjdhLjUuNSAwIDAgMC0uMjk0LjQ1N3Y2LjQ5M2EuNS41IDAgMCAwIC4yOS40NWw0LjQ2OCAxLjg2NGEuNS41IDAgMCAwIC42NS0uMTI4em0tMi40NzctLjI4M0E0MS41IDQxLjUgMCAwIDAgOCAxNC41YTQxLjUgNDEuNSAwIDAgMC0xLjcwOS4zMjN6Ii8+PC9zdmc+',

    /**
     * 默认奖品图
     * 来源: Bootstrap Icons - gift
     */
    defaultPrize: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgZmlsbD0iI2ZmYzEwNyIgY2xhc3M9ImJpIGJpLWdpZnQiIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHBhdGggZD0iTTMgMi41YTIuNSAyLjUgMCAwIDEgNSAwIDIuNSAyLjUgMCAwIDEgNSAwdjV2LS41YS41LjUgMCAwIDEgMS0uMDAxVjhsMSA4YS41LjUgMCAwIDEtLjUuNWgtMTJhLjUuNSAwIDAgMS0uNS0uNUwyIDh2LS41YS41LjUgMCAwIDEgMS0uMDAxVjh6bTEgLS41djRoOHYtNGEuNS41IDAgMCAwLTEgMFY2SDV2LS41YS41LjUgMCAwIDAtMSAwem0wIDV2N2gzVjdINHptNCAwdjdoM1Y3SDh6bS02IDBoM3Y3SDJ6bTEyIDB2N2gzVjdoLTN6Ii8+PC9zdmc+',

    /**
     * 空状态插图
     * 来源: Bootstrap Icons - inbox
     */
    emptyState: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgZmlsbD0iIzk5OSIgY2xhc3M9ImJpIGJpLWluYm94IiB2aWV3Qm94PSIwIDAgMTYgMTYiPjxwYXRoIGQ9Ik00LjkzOCA4LjVINWExIDEgMCAwIDAgLjk2Mi43MjVsLjAyLjAzNyAxIC0yYTEgMSAwIDAgMCAuOTguNzM4SDEwYTEgMSAwIDAgMCAuOTgtLjczOGwxIDJhLjAzNy4wMzcgMCAwIDAgLjAyLS4wMzdBMSAxIDAgMCAwIDExIDguNWgwYS45MzguOTM4IDAgMCAwLS45MzgtLjkzOGgtNS4xMjR6TTEyLjUgMmgtOUEzLjUgMy41IDAgMCAwIDAgNS41djVBMy41IDMuNSAwIDAgMCAzLjUgMTRoOWEzLjUgMy41IDAgMCAwIDMuNS0zLjV2LTVBMS41IDEuNSAwIDAgMCAxMi41IDJ6bS05IDFoOWEyLjUgMi41IDAgMCAxIDIuNSAyLjV2NS41SDFWNi41QTIuNSAyLjUgMCAwIDEgMy41IDN6Ii8+PC9zdmc+'
  },

  /**
   * CSS资源路径
   */
  styles: {
    common: '/admin/css/common.css',
    theme: '/admin/css/theme.css'
  },

  /**
   * JS资源路径
   */
  scripts: {
    common: '/admin/js/admin-common.js',
    utils: '/admin/js/utils.js'
  },

  /**
   * 获取图片资源（安全方法）
   *
   * @param {string} key - 图片资源key
   * @param {string|null} fallback - 备用资源（可选）
   * @returns {string} 图片URL或data URI
   *
   * @example
   * // 获取默认头像
   * const avatar = ResourceConfig.getImage('defaultAvatar');
   *
   * // 使用自定义备用资源
   * const avatar = ResourceConfig.getImage('customAvatar', defaultAvatar);
   */
  getImage (key, fallback = null) {
    return this.images[key] || fallback || this.images.defaultAvatar
  },

  /**
   * 获取样式资源
   *
   * @param {string} key - 样式资源key
   * @returns {string|null} CSS文件路径
   */
  getStyle (key) {
    return this.styles[key] || null
  },

  /**
   * 获取脚本资源
   *
   * @param {string} key - 脚本资源key
   * @returns {string|null} JS文件路径
   */
  getScript (key) {
    return this.scripts[key] || null
  },

  /**
   * 异步检查资源是否存在
   *
   * @param {string} url - 资源URL
   * @returns {Promise<boolean>} 资源是否存在
   *
   * @example
   * const exists = await ResourceConfig.checkResource('/images/logo.png');
   * if (!exists) {
   *   console.warn('资源不存在');
   * }
   */
  async checkResource (url) {
    try {
      const response = await fetch(url, { method: 'HEAD', cache: 'no-cache' })
      return response.ok
    } catch (error) {
      console.error(`资源检查失败: ${url}`, error)
      return false
    }
  },

  /**
   * 批量检查多个资源
   *
   * @param {string[]} urls - 资源URL数组
   * @returns {Promise<Object>} 检查结果 {url: boolean}
   */
  async checkResources (urls) {
    const results = {}

    await Promise.all(
      urls.map(async (url) => {
        results[url] = await this.checkResource(url)
      })
    )

    return results
  },

  /**
   * 预加载图片资源
   *
   * @param {string} url - 图片URL
   * @returns {Promise<void>}
   */
  preloadImage (url) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve()
      img.onerror = () => reject(new Error(`Failed to preload: ${url}`))
      img.src = url
    })
  }
}

// 导出供其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResourceConfig
}

// 全局暴露（浏览器环境）
if (typeof window !== 'undefined') {
  window.ResourceConfig = ResourceConfig
}

console.log('✅ ResourceConfig 已加载')
