/**
 * Tailwind CSS 配置
 * 
 * @description 管理后台样式配置，包含自定义主题色和组件
 * @version 1.0.0
 * @date 2026-01-23
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './*.html',                        // 根目录下的 HTML 文件
    './src/**/*.{js,ts,jsx,tsx,css}',  // JS/TS/CSS 源码
    './src/templates/**/*.ejs',        // EJS 模板
    './public/**/*.html',              // public 目录下的 HTML
  ],
  darkMode: 'class',  // 支持暗色主题
  // 确保骨架屏相关类不被 PurgeCSS 移除
  safelist: [
    // 骨架屏类
    'skeleton', 'skeleton-text', 'skeleton-text-sm', 'skeleton-text-xs',
    'skeleton-title', 'skeleton-title-lg', 'skeleton-avatar', 'skeleton-avatar-sm', 'skeleton-avatar-lg',
    'skeleton-button', 'skeleton-button-sm', 'skeleton-button-lg',
    'skeleton-card', 'skeleton-card-sm', 'skeleton-card-lg',
    'skeleton-image', 'skeleton-image-square', 'skeleton-table', 'skeleton-table-row',
    // Spinner 类
    'spinner', 'spinner-sm', 'spinner-lg', 'spinner-xl',
    'spinner-primary', 'spinner-success', 'spinner-danger', 'spinner-warning',
    // 脉冲类
    'pulse', 'pulse-avatar', 'pulse-text', 'pulse-card',
    // 点加载类
    'dots-loading', 'dots-loading-sm', 'dots-loading-lg',
    // 进度条类
    'progress-bar', 'progress-bar-fill', 'progress-bar-success', 'progress-bar-warning', 'progress-bar-danger',
    'progress-indeterminate', 'progress-bar-thick',
    // 加载遮罩
    'loading-overlay', 'loading-overlay-blur', 'content-loading', 'content-loading-text',
    // 空状态类
    'empty-state', 'empty-state-icon', 'empty-state-title', 'empty-state-description', 'empty-state-action',
    // 统计卡片
    'stats-card', 'stats-card-loading',
    // 动画类
    'animate-pulse', 'animate-spin', 'animate-bounce',
    // 策略分组动态样式（JS 运行时返回，Tailwind 扫描可能遗漏）
    'border-l-4',
    'border-l-purple-500', 'bg-purple-50', 'bg-purple-100', 'text-purple-700',
    'border-l-amber-500', 'bg-amber-50', 'bg-amber-100', 'text-amber-700',
    'border-l-emerald-500', 'bg-emerald-50', 'bg-emerald-100', 'text-emerald-700',
    'border-l-blue-500', 'bg-blue-50', 'bg-blue-100', 'text-blue-700',
    'border-l-red-500', 'bg-red-50', 'bg-red-100', 'text-red-700',
    'border-l-indigo-500', 'bg-indigo-50', 'bg-indigo-100', 'text-indigo-700',
    'border-l-teal-500', 'bg-teal-50', 'bg-teal-100', 'text-teal-700',
    'border-l-cyan-500', 'bg-cyan-50', 'bg-cyan-100', 'text-cyan-700',
    'border-l-gray-400',
  ],
  theme: {
    extend: {
      colors: {
        // 自定义主题色
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // 管理后台专用色
        admin: {
          sidebar: '#1e293b',
          header: '#0f172a',
          bg: '#f8fafc',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      spacing: {
        'sidebar': '250px',
        'header': '60px',
      }
    },
  },
  plugins: [],
}
