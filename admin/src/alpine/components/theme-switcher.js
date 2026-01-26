/**
 * 主题切换组件
 * @description 一键切换主题功能，支持25种配色方案
 * @version 2.0.0
 * @date 2026-01-26
 */

/**
 * 创建主题切换组件
 * @returns {Object} Alpine 组件对象
 */
export function themeSwitcher() {
  return {
    // 可用主题列表 - 25种配色方案
    themes: [
      // ===== 深色侧边栏系列 =====
      {
        id: 'light',
        name: '深蓝科技风',
        icon: '💙',
        colors: ['#3b82f6', '#0f172a', '#f8fafc'],
        category: 'dark-sidebar',
        scene: '企业通用'
      },
      {
        id: 'dark',
        name: '暗色主题',
        icon: '🌙',
        colors: ['#60a5fa', '#0f172a', '#1e293b'],
        category: 'dark-sidebar',
        scene: '护眼模式'
      },
      {
        id: 'purple',
        name: '紫色渐变风',
        icon: '💜',
        colors: ['#8b5cf6', '#1a1625', '#faf5ff'],
        category: 'dark-sidebar',
        scene: '创意设计'
      },
      {
        id: 'green',
        name: '暗绿商务风',
        icon: '💚',
        colors: ['#10b981', '#0d1f17', '#ecfdf5'],
        category: 'dark-sidebar',
        scene: '金融环保'
      },
      {
        id: 'minimal-dark',
        name: '暗黑极简风',
        icon: '🖤',
        colors: ['#f59e0b', '#18181b', '#09090b'],
        category: 'dark-sidebar',
        scene: '开发护眼'
      },
      {
        id: 'indigo',
        name: '蓝紫渐变风',
        icon: '🔮',
        colors: ['#6366f1', '#1e1b4b', '#f5f3ff'],
        category: 'dark-sidebar',
        scene: '高端神秘'
      },
      {
        id: 'rose',
        name: '玫瑰粉暖风',
        icon: '🌹',
        colors: ['#f43f5e', '#1c1917', '#fafaf9'],
        category: 'dark-sidebar',
        scene: '时尚活力'
      },
      {
        id: 'teal',
        name: '海洋青蓝风',
        icon: '🌊',
        colors: ['#14b8a6', '#042f2e', '#f0fdfa'],
        category: 'dark-sidebar',
        scene: '医疗科技'
      },
      {
        id: 'red',
        name: '暗红商务风',
        icon: '🔴',
        colors: ['#dc2626', '#1a1a1a', '#fafafa'],
        category: 'dark-sidebar',
        scene: '金融高端'
      },
      {
        id: 'cyber',
        name: '赛博朋克风',
        icon: '🎮',
        colors: ['#f72585', '#0a0a0a', '#16213e'],
        category: 'dark-sidebar',
        scene: '游戏潮流'
      },
      {
        id: 'sunset',
        name: '日落橙暖风',
        icon: '🌅',
        colors: ['#ff6b35', '#1f1f1f', '#fffbeb'],
        category: 'dark-sidebar',
        scene: '餐饮温暖'
      },
      {
        id: 'forest',
        name: '森林墨绿风',
        icon: '🌲',
        colors: ['#84cc16', '#14532d', '#f7fee7'],
        category: 'dark-sidebar',
        scene: '自然农业'
      },
      {
        id: 'midnight',
        name: '午夜蓝风',
        icon: '🌃',
        colors: ['#0ea5e9', '#020617', '#f0f9ff'],
        category: 'dark-sidebar',
        scene: '航空物流'
      },
      {
        id: 'coffee',
        name: '咖啡棕暖风',
        icon: '☕',
        colors: ['#d97706', '#292524', '#fef3c7'],
        category: 'dark-sidebar',
        scene: '咖啡复古'
      },
      {
        id: 'neon',
        name: '电竞霓虹风',
        icon: '💫',
        colors: ['#ec4899', '#000000', '#18181b'],
        category: 'dark-sidebar',
        scene: '电竞娱乐'
      },
      {
        id: 'gold',
        name: '皇家金色风',
        icon: '👑',
        colors: ['#eab308', '#1c1917', '#fefce8'],
        category: 'dark-sidebar',
        scene: '奢华VIP'
      },
      {
        id: 'navy',
        name: '海军蓝正统风',
        icon: '⚓',
        colors: ['#1e40af', '#1e3a5f', '#eff6ff'],
        category: 'dark-sidebar',
        scene: '政务正式'
      },
      {
        id: 'volcano',
        name: '火山岩深灰风',
        icon: '🌋',
        colors: ['#f97316', '#262626', '#fafafa'],
        category: 'dark-sidebar',
        scene: '工业制造'
      },
      {
        id: 'starry',
        name: '星空紫夜风',
        icon: '✨',
        colors: ['#818cf8', '#0c0a1d', '#eef2ff'],
        category: 'dark-sidebar',
        scene: '梦幻教育'
      },
      {
        id: 'chinese-red',
        name: '中国红喜庆风',
        icon: '🧧',
        colors: ['#dc2626', '#450a0a', '#fef2f2'],
        category: 'dark-sidebar',
        scene: '喜庆节日'
      },

      // ===== 浅色侧边栏系列 =====
      {
        id: 'fresh-green',
        name: '翠绿清新风',
        icon: '🍀',
        colors: ['#22c55e', '#ffffff', '#f0fdf4'],
        category: 'light-sidebar',
        scene: '清新年轻'
      },
      {
        id: 'minimal-light',
        name: '浅色极简风',
        icon: '☀️',
        colors: ['#3b82f6', '#ffffff', '#f8fafc'],
        category: 'light-sidebar',
        scene: '传统明亮'
      },
      {
        id: 'lavender',
        name: '薰衣草紫风',
        icon: '💐',
        colors: ['#a855f7', '#f3e8ff', '#faf5ff'],
        category: 'light-sidebar',
        scene: '优雅美妆'
      },
      {
        id: 'nordic',
        name: '北欧极简风',
        icon: '❄️',
        colors: ['#475569', '#fafafa', '#ffffff'],
        category: 'light-sidebar',
        scene: '极简高端'
      },
      {
        id: 'sakura',
        name: '樱花粉风',
        icon: '🌸',
        colors: ['#ec4899', '#fdf2f8', '#fff1f2'],
        category: 'light-sidebar',
        scene: '日系甜美'
      },
      {
        id: 'mint',
        name: '薄荷清凉风',
        icon: '🍃',
        colors: ['#34d399', '#ecfdf5', '#f0fdf4'],
        category: 'light-sidebar',
        scene: '健康医疗'
      }
    ],

    // 当前主题
    currentTheme: 'light',

    // 下拉菜单是否打开
    isOpen: false,

    // 分类筛选
    activeCategory: 'all',

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
      const currentInfo = this.getCurrentThemeInfo()
      // 在深色和浅色主题间切换
      if (currentInfo.category === 'dark-sidebar') {
        this.setTheme('minimal-light')
      } else {
        this.setTheme('dark')
      }
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
    },

    /**
     * 获取分类标签
     */
    getCategoryLabel(category) {
      const labels = {
        all: '全部',
        'dark-sidebar': '深色侧边栏',
        'light-sidebar': '浅色侧边栏'
      }
      return labels[category] || category
    },

    /**
     * 按分类筛选主题
     */
    getFilteredThemes() {
      if (this.activeCategory === 'all') {
        return this.themes
      }
      return this.themes.filter(t => t.category === this.activeCategory)
    },

    /**
     * 获取深色侧边栏主题
     */
    getDarkSidebarThemes() {
      return this.themes.filter(t => t.category === 'dark-sidebar')
    },

    /**
     * 获取浅色侧边栏主题
     */
    getLightSidebarThemes() {
      return this.themes.filter(t => t.category === 'light-sidebar')
    }
  }
}

export default themeSwitcher
