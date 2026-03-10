/**
 * Vite 配置文件
 * 
 * @description 前端构建配置，支持多页应用、EJS 模板、Tailwind CSS、热更新
 * @version 3.0.0
 * @date 2026-01-23
 */
import { defineConfig } from 'vite'
import { resolve, basename } from 'path'
import { readdirSync } from 'fs'
import { ViteEjsPlugin } from 'vite-plugin-ejs'

// 自动扫描 admin 目录下的所有 HTML 文件
function getHtmlEntries() {
  const adminDir = resolve(__dirname)
  const htmlFiles = readdirSync(adminDir).filter(file => file.endsWith('.html'))
  
  const entries = {}
  htmlFiles.forEach(file => {
    const name = basename(file, '.html')
    entries[name] = resolve(adminDir, file)
  })
  
  return entries
}

// 页面配置数据 - 用于 EJS 模板注入
const pageConfigs = {
  // 用户管理模块
  'user-management': { title: '用户权限管理', pageIcon: '👥', pageTitle: '用户权限管理' },
  'user-list': { title: '用户列表', pageIcon: '👤', pageTitle: '用户列表' },
  'role-list': { title: '角色管理', pageIcon: '🛡️', pageTitle: '角色管理' },
  'permission-list': { title: '权限管理', pageIcon: '🔐', pageTitle: '权限管理' },
  
  // 抽奖管理模块
  'lottery-management': { title: '抽奖活动管理', pageIcon: '🎰', pageTitle: '抽奖活动管理' },
  'pool-list': { title: '奖池管理', pageIcon: '🎱', pageTitle: '奖池管理' },
  'prize-list': { title: '奖品管理', pageIcon: '🎁', pageTitle: '奖品管理' },
  'probability-config': { title: '概率配置', pageIcon: '📊', pageTitle: '概率配置' },
  'draw-records': { title: '抽奖记录', pageIcon: '📋', pageTitle: '抽奖记录' },
  'guarantee-config': { title: '保底配置', pageIcon: '🎯', pageTitle: '保底配置' },
  
  // 资产管理模块
  'asset-overview': { title: '资产总览', pageIcon: '💰', pageTitle: '资产总览' },
  'inventory-list': { title: '库存管理', pageIcon: '📦', pageTitle: '库存管理' },
  'coin-management': { title: '金币管理', pageIcon: '🪙', pageTitle: '金币管理' },
  'transaction-records': { title: '交易记录', pageIcon: '📝', pageTitle: '交易记录' },
  
  // 商城管理模块
  'product-list': { title: '商品管理', pageIcon: '🛍️', pageTitle: '商品管理' },
  'category-list': { title: '分类管理', pageIcon: '📂', pageTitle: '分类管理' },
  'order-list': { title: '订单管理', pageIcon: '📋', pageTitle: '订单管理' },
  
  // 市场管理模块
  'exchange-rate-management': { title: '汇率兑换管理', pageIcon: '💱', pageTitle: '汇率兑换管理' },
  'trade-management': { title: '交易管理', pageIcon: '💹', pageTitle: '交易管理' },
  'listing-management': { title: '上架管理', pageIcon: '📊', pageTitle: '上架管理' },
  'market-stats': { title: '市场统计', pageIcon: '📈', pageTitle: '市场统计' },
  'bid-management': { title: '竞价管理', pageIcon: '🏷️', pageTitle: '竞价管理' },
  
  // 内容管理模块
  'announcement-list': { title: '公告管理', pageIcon: '📢', pageTitle: '公告管理' },
  'banner-list': { title: '轮播管理', pageIcon: '🖼️', pageTitle: '轮播管理' },
  'feedback-list': { title: '反馈管理', pageIcon: '💬', pageTitle: '反馈管理' },
  
  // 系统管理模块
  'system-config': { title: '系统配置', pageIcon: '⚙️', pageTitle: '系统配置' },
  'log-list': { title: '日志管理', pageIcon: '📄', pageTitle: '日志管理' },
  'cache-management': { title: '缓存管理', pageIcon: '💾', pageTitle: '缓存管理' },
  
  // 统计分析模块
  'dashboard': { title: '仪表盘', pageIcon: '📊', pageTitle: '管理后台', backUrl: '/admin/dashboard.html' },
  'report-center': { title: '报表中心', pageIcon: '📈', pageTitle: '报表中心' },
  
  // 数据管理模块（2026-03-10 数据一键删除功能）
  'data-management': { title: '数据管理', pageIcon: '🗄️', pageTitle: '数据管理' },

  // 审核链配置管理
  'approval-chain': { title: '审核链配置管理', pageIcon: '🔗', pageTitle: '审核链配置管理' },
  // 默认配置
  'default': { title: '管理后台', pageIcon: '🏠', pageTitle: '管理后台' }
}

// 获取页面配置
function getPageConfig(pageName) {
  return pageConfigs[pageName] || pageConfigs['default']
}

export default defineConfig({
  root: resolve(__dirname),
  base: '/admin/',
  publicDir: 'public',
  
  plugins: [
    // EJS 模板插件配置
    ViteEjsPlugin((viteConfig) => {
      // 返回全局注入的数据
      return {
        // 环境变量
        env: process.env.NODE_ENV || 'development',
        isDev: process.env.NODE_ENV !== 'production',
        
        // API 基础路径
        apiBase: '/api',
        
        // 版本号
        version: '3.0.0',
        
        // 页面配置获取函数
        getPageConfig: getPageConfig,
        
        // 公共数据
        common: {
          siteName: '餐厅抽奖系统',
          copyright: `© ${new Date().getFullYear()} 餐厅抽奖系统`
        }
      }
    }, {
      // EJS 选项
      ejs: {
        // 视图目录
        views: [resolve(__dirname, 'src/templates')]
      }
    })
  ],
  
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      external: ['canvg', 'html2canvas', 'dompurify'],
      input: getHtmlEntries(),
      output: {
        // JS 文件命名
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        
        // 代码分割策略（优化后）
        manualChunks: (id) => {
          // Alpine.js 单独打包
          if (id.includes('alpinejs')) {
            return 'alpine'
          }
          
          // ECharts 单独打包（按需导入后约300KB）
          if (id.includes('echarts')) {
            return 'echarts'
          }
          
          // 其他 node_modules 打包为 vendor
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        }
      }
    },
    // 压缩配置
    minify: 'esbuild',
    sourcemap: true,
    
    // 调整警告阈值（ECharts chunk 可能超过 500KB）
    chunkSizeWarningLimit: 600
  },
  
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@templates': resolve(__dirname, 'src/templates'),
      '@partials': resolve(__dirname, 'src/templates/partials'),
      '@layouts': resolve(__dirname, 'src/templates/layouts')
    }
  },
  
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  
  // 开发时自动打开浏览器
  preview: {
    port: 4173
  }
})
