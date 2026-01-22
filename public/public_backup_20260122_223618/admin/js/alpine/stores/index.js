/**
 * Alpine.js Stores 入口文件
 * 汇总所有扩展的 Store 模块
 * 
 * @file public/admin/js/alpine/stores/index.js
 * @description Stores 汇总导出
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * 📦 包含的 Store：
 * - confirm: 全局确认对话框
 * - loading: 加载状态管理
 * - pageState: 页面状态持久化
 * 
 * 注意：基础 Store (auth, ui, notification) 在 init.js 中定义
 */

// 确保在 Alpine 初始化时检查 Store
document.addEventListener('alpine:init', () => {
  // 等待其他 Store 模块加载
  setTimeout(() => {
    console.log('📦 Alpine Stores 状态检查:')
    
    const stores = [
      'auth',        // 基础：认证状态
      'ui',          // 基础：UI 状态
      'notification', // 基础：通知消息
      'confirm',     // 扩展：确认对话框
      'loading',     // 扩展：加载状态
      'pageState'    // 扩展：页面状态
    ]
    
    stores.forEach(name => {
      const exists = Alpine.store(name) !== undefined
      console.log(`   ${exists ? '✅' : '❌'} ${name}`)
    })
  }, 100)
})

console.log('✅ Alpine Stores 入口文件已加载')

