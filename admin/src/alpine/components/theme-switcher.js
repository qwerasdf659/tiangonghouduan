/**
 * 主题切换组件
 * @description 一键切换主题功能
 * @version 1.0.0
 * @date 2026-01-25
 */

/**
 * 创建主题切换组件
 * @returns {Object} Alpine 组件对象
 */
export function themeSwitcher() {
  return {
    // 可用主题列表
    themes: [
      { id: 'light', name: '亮色', icon: '☀️', colors: ['#3b82f6', '#0f172a', '#f8fafc'] },
      { id: 'dark', name: '暗色', icon: '🌙', colors: ['#60a5fa', '#0f172a', '#1e293b'] },
      { id: 'purple', name: '紫色', icon: '💜', colors: ['#8b5cf6', '#1a1625', '#faf5ff'] },
      { id: 'green', name: '绿色', icon: '💚', colors: ['#10b981', '#0d1f17', '#ecfdf5'] },
      { id: 'minimal-dark', name: '极简黑', icon: '🖤', colors: ['#f59e0b', '#18181b', '#09090b'] },
      { id: 'sunset', name: '日落橙', icon: '🌅', colors: ['#ff6b35', '#1f1f1f', '#fffbeb'] }
    ],
    
    // 当前主题
    currentTheme: 'light',
    
    // 下拉菜单是否打开
    isOpen: false,
    
    /**
     * 初始化
     */
    init() {
      // 从 localStorage 读取保存的主题
      const savedTheme = localStorage.getItem('admin_theme')
      if (savedTheme && this.themes.find(t => t.id === savedTheme)) {
        this.currentTheme = savedTheme
      }
      // 应用主题
      this.applyTheme(this.currentTheme)
    },
    
    /**
     * 切换主题
     * @param {string} themeId - 主题ID
     */
    setTheme(themeId) {
      this.currentTheme = themeId
      this.applyTheme(themeId)
      // 保存到 localStorage
      localStorage.setItem('admin_theme', themeId)
      this.isOpen = false
      console.log(`🎨 主题已切换: ${themeId}`)
    },
    
    /**
     * 应用主题到 DOM
     * @param {string} themeId - 主题ID
     */
    applyTheme(themeId) {
      document.documentElement.setAttribute('data-theme', themeId)
      
      // 同步到所有 iframe（如果有的话）
      document.querySelectorAll('iframe').forEach(iframe => {
        try {
          if (iframe.contentDocument?.documentElement) {
            iframe.contentDocument.documentElement.setAttribute('data-theme', themeId)
          }
        } catch (e) {
          // 跨域 iframe 忽略
        }
      })
    },
    
    /**
     * 获取当前主题信息
     * @returns {Object}
     */
    getCurrentThemeInfo() {
      return this.themes.find(t => t.id === this.currentTheme) || this.themes[0]
    },
    
    /**
     * 快速切换（亮色/暗色切换）
     */
    toggleDarkMode() {
      const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark'
      this.setTheme(newTheme)
    },
    
    /**
     * 切换下拉菜单
     */
    toggleDropdown() {
      this.isOpen = !this.isOpen
    },
    
    /**
     * 关闭下拉菜单
     */
    closeDropdown() {
      this.isOpen = false
    }
  }
}

export default themeSwitcher

