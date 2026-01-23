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
    './src/**/*.{js,ts,jsx,tsx}',      // JS/TS 源码
    './src/templates/**/*.ejs',        // EJS 模板
    './public/**/*.html',              // public 目录下的 HTML
  ],
  darkMode: 'class',  // 支持暗色主题
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
