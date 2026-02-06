/**
 * 外观设置组件
 * @description 统一管理主题颜色和字体切换
 * @version 1.0.0
 */

import { logger } from '../../utils/logger.js'

/**
 * 广播频道名称（复用现有主题频道，保持兼容性）
 */
const THEME_CHANNEL_NAME = 'admin_theme_channel'

/**
 * 创建外观设置组件
 * @returns {Object} Alpine 组件对象
 */
export function appearanceSettings() {
  return {
    // ==================== 状态 ====================

    /** 面板是否打开 */
    isOpen: false,

    /** 当前激活的Tab */
    activeTab: 'theme', // 'theme' | 'font'

    /** 当前主题 */
    currentTheme: 'light',

    /** 当前字体 */
    currentFont: 'system',

    // ==================== 主题配置 ====================

    /** 主题列表 - 深色侧边栏 */
    darkSidebarThemes: [
      {
        id: 'light',
        name: '深蓝科技',
        icon: '💙',
        colors: ['#3b82f6', '#0f172a', '#f8fafc']
      },
      {
        id: 'dark',
        name: '暗色主题',
        icon: '🌙',
        colors: ['#60a5fa', '#0f172a', '#1e293b']
      },
      {
        id: 'purple',
        name: '紫色渐变',
        icon: '💜',
        colors: ['#8b5cf6', '#1a1625', '#faf5ff']
      },
      {
        id: 'green',
        name: '暗绿商务',
        icon: '💚',
        colors: ['#10b981', '#0d1f17', '#ecfdf5']
      },
      {
        id: 'minimal-dark',
        name: '暗黑极简',
        icon: '🖤',
        colors: ['#f59e0b', '#18181b', '#09090b']
      },
      {
        id: 'indigo',
        name: '蓝紫渐变',
        icon: '🔮',
        colors: ['#6366f1', '#1e1b4b', '#f5f3ff']
      },
      {
        id: 'rose',
        name: '玫瑰粉暖',
        icon: '🌹',
        colors: ['#f43f5e', '#1c1917', '#fafaf9']
      },
      {
        id: 'teal',
        name: '海洋青蓝',
        icon: '🌊',
        colors: ['#14b8a6', '#042f2e', '#f0fdfa']
      },
      {
        id: 'red',
        name: '暗红商务',
        icon: '🔴',
        colors: ['#dc2626', '#1a1a1a', '#fafafa']
      },
      {
        id: 'cyber',
        name: '赛博朋克',
        icon: '🎮',
        colors: ['#f72585', '#0a0a0a', '#16213e']
      },
      {
        id: 'sunset',
        name: '日落橙暖',
        icon: '🌅',
        colors: ['#ff6b35', '#1f1f1f', '#fffbeb']
      },
      {
        id: 'forest',
        name: '森林墨绿',
        icon: '🌲',
        colors: ['#84cc16', '#14532d', '#f7fee7']
      },
      {
        id: 'midnight',
        name: '午夜蓝',
        icon: '🌃',
        colors: ['#0ea5e9', '#020617', '#f0f9ff']
      },
      {
        id: 'coffee',
        name: '咖啡棕暖',
        icon: '☕',
        colors: ['#d97706', '#292524', '#fef3c7']
      },
      {
        id: 'neon',
        name: '电竞霓虹',
        icon: '💫',
        colors: ['#ec4899', '#000000', '#18181b']
      },
      {
        id: 'gold',
        name: '皇家金色',
        icon: '👑',
        colors: ['#eab308', '#1c1917', '#fefce8']
      },
      {
        id: 'navy',
        name: '海军蓝',
        icon: '⚓',
        colors: ['#1e40af', '#1e3a5f', '#eff6ff']
      },
      {
        id: 'volcano',
        name: '火山岩灰',
        icon: '🌋',
        colors: ['#f97316', '#262626', '#fafafa']
      },
      {
        id: 'starry',
        name: '星空紫夜',
        icon: '✨',
        colors: ['#818cf8', '#0c0a1d', '#eef2ff']
      },
      {
        id: 'chinese-red',
        name: '中国红',
        icon: '🧧',
        colors: ['#dc2626', '#450a0a', '#fef2f2']
      }
    ],

    /** 主题列表 - 浅色侧边栏 */
    lightSidebarThemes: [
      {
        id: 'fresh-green',
        name: '翠绿清新',
        icon: '🍀',
        colors: ['#22c55e', '#ffffff', '#f0fdf4']
      },
      {
        id: 'minimal-light',
        name: '浅色极简',
        icon: '☀️',
        colors: ['#3b82f6', '#ffffff', '#f8fafc']
      },
      {
        id: 'lavender',
        name: '薰衣草紫',
        icon: '💐',
        colors: ['#a855f7', '#f3e8ff', '#faf5ff']
      },
      {
        id: 'nordic',
        name: '北欧极简',
        icon: '❄️',
        colors: ['#475569', '#fafafa', '#ffffff']
      },
      {
        id: 'sakura',
        name: '樱花粉',
        icon: '🌸',
        colors: ['#ec4899', '#fdf2f8', '#fff1f2']
      },
      {
        id: 'mint',
        name: '薄荷清凉',
        icon: '🍃',
        colors: ['#34d399', '#ecfdf5', '#f0fdf4']
      }
    ],

    // ==================== 字体配置 ====================

    /** 字体列表 */
    fonts: [
      {
        id: 'system',
        name: '系统默认',
        icon: '💻',
        desc: '跟随操作系统，无需加载额外字体',
        preview: 'Aa 中文'
      },
      {
        id: 'inter',
        name: 'Inter',
        icon: '🔤',
        desc: '现代无衬线字体，数字和英文显示清晰',
        preview: 'Aa 中文'
      },
      {
        id: 'noto-sans',
        name: '思源黑体',
        icon: '🇨🇳',
        desc: 'Google与Adobe联合开发，中文显示优秀',
        preview: 'Aa 中文'
      },
      {
        id: 'harmony',
        name: '鸿蒙字体',
        icon: '📱',
        desc: '华为设计，现代感强，多语言支持好',
        preview: 'Aa 中文'
      },
      {
        id: 'lxgw',
        name: '霞鹜文楷',
        icon: '✍️',
        desc: '手写风格，适合文创、阅读场景',
        preview: 'Aa 中文'
      }
    ],

    // ==================== 生命周期 ====================

    /**
     * 初始化
     */
    init() {
      logger.debug('[外观设置] 组件初始化开始')

      // 读取保存的主题
      const savedTheme = localStorage.getItem('admin_theme')
      if (savedTheme && this.isValidTheme(savedTheme)) {
        this.currentTheme = savedTheme
      }

      // 读取保存的字体
      const savedFont = localStorage.getItem('admin_font')
      if (savedFont && this.isValidFont(savedFont)) {
        this.currentFont = savedFont
      }

      // 应用设置
      this.applyTheme(this.currentTheme)
      this.applyFont(this.currentFont)

      // 监听广播（用于跨标签页同步）
      this.listenBroadcast()

      logger.debug('[外观设置] 初始化完成', {
        theme: this.currentTheme,
        font: this.currentFont
      })
    },

    // ==================== 面板操作 ====================

    /**
     * 切换面板
     */
    togglePanel() {
      this.isOpen = !this.isOpen
    },

    /**
     * 关闭面板
     */
    closePanel() {
      this.isOpen = false
    },

    /**
     * 切换Tab
     */
    setTab(tab) {
      this.activeTab = tab
    },

    // ==================== 主题操作 ====================

    /**
     * 设置主题
     * @param {string} themeId
     */
    setTheme(themeId) {
      if (!this.isValidTheme(themeId)) return

      this.currentTheme = themeId
      this.applyTheme(themeId)
      localStorage.setItem('admin_theme', themeId)
      this.broadcast('theme_change', themeId)

      logger.debug(`[外观设置] 主题已切换: ${themeId}`)
    },

    /**
     * 应用主题到DOM
     */
    applyTheme(themeId) {
      document.documentElement.setAttribute('data-theme', themeId)

      // 同步到iframe
      document.querySelectorAll('iframe').forEach(iframe => {
        try {
          iframe.contentDocument?.documentElement?.setAttribute(
            'data-theme',
            themeId
          )
        } catch (_e) {
          // 跨域iframe通过广播同步
        }
      })
    },

    /**
     * 快速切换深色/浅色
     */
    toggleDarkMode() {
      const isDark = this.darkSidebarThemes.some(
        t => t.id === this.currentTheme
      )
      this.setTheme(isDark ? 'minimal-light' : 'dark')
    },

    /**
     * 验证主题ID是否有效
     */
    isValidTheme(themeId) {
      return [...this.darkSidebarThemes, ...this.lightSidebarThemes].some(
        t => t.id === themeId
      )
    },

    /**
     * 获取当前主题信息
     */
    getCurrentThemeInfo() {
      return (
        [...this.darkSidebarThemes, ...this.lightSidebarThemes].find(
          t => t.id === this.currentTheme
        ) || this.darkSidebarThemes[0]
      )
    },

    // ==================== 字体操作 ====================

    /**
     * 设置字体
     * @param {string} fontId
     */
    setFont(fontId) {
      if (!this.isValidFont(fontId)) return

      this.currentFont = fontId
      this.applyFont(fontId)
      localStorage.setItem('admin_font', fontId)
      this.broadcast('font_change', fontId)

      logger.debug(`[外观设置] 字体已切换: ${fontId}`)
    },

    /**
     * 应用字体到DOM
     */
    applyFont(fontId) {
      document.documentElement.setAttribute('data-font', fontId)

      // 同步到iframe
      document.querySelectorAll('iframe').forEach(iframe => {
        try {
          iframe.contentDocument?.documentElement?.setAttribute(
            'data-font',
            fontId
          )
        } catch (_e) {
          // 跨域iframe通过广播同步
        }
      })
    },

    /**
     * 验证字体ID是否有效
     */
    isValidFont(fontId) {
      return this.fonts.some(f => f.id === fontId)
    },

    /**
     * 获取当前字体信息
     */
    getCurrentFontInfo() {
      return this.fonts.find(f => f.id === this.currentFont) || this.fonts[0]
    },

    // ==================== 广播通信 ====================

    /**
     * 广播设置变更
     * @description 保持与现有 theme-switcher.js 的消息格式兼容
     */
    broadcast(type, value) {
      if (typeof BroadcastChannel === 'undefined') return

      try {
        const channel = new BroadcastChannel(THEME_CHANNEL_NAME)
        // 兼容现有格式：主题用 theme 字段，字体用 font 字段
        const payload =
          type === 'theme_change'
            ? { type, theme: value }
            : { type, font: value }
        channel.postMessage(payload)
        channel.close()
      } catch (e) {
        logger.warn('[外观设置] 广播失败', e)
      }
    },

    /**
     * 监听广播
     * @description 同时监听主题和字体变更消息
     */
    listenBroadcast() {
      if (typeof BroadcastChannel === 'undefined') return

      try {
        const channel = new BroadcastChannel(THEME_CHANNEL_NAME)
        channel.onmessage = event => {
          const { type, theme, font } = event.data || {}

          // 监听主题变更（兼容现有 theme 字段）
          if (type === 'theme_change' && theme && theme !== this.currentTheme) {
            this.currentTheme = theme
            this.applyTheme(theme)
            logger.debug('[外观设置] 收到主题广播', theme)
          }

          // 监听字体变更（新增 font 字段）
          if (type === 'font_change' && font && font !== this.currentFont) {
            this.currentFont = font
            this.applyFont(font)
            logger.debug('[外观设置] 收到字体广播', font)
          }
        }
      } catch (e) {
        logger.warn('[外观设置] 监听广播失败', e)
      }
    }
  }
}

export default appearanceSettings


