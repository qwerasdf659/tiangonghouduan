/**
 * 核心模块入口文件
 * 统一导出所有核心功能模块
 * 
 * @file public/admin/js/core/index.js
 * @description 汇总核心模块的导出
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * 📦 包含的模块：
 * - DataCache: 数据缓存（内存级别）
 * - CachedAPI: 带缓存的 API 请求
 * - KeyboardManager: 键盘快捷键管理
 * - LazyLoader: 模块懒加载
 * - EventBus: 事件总线
 */

// 验证模块加载状态
const CoreModules = {
  DataCache: window.DataCache,
  CachedAPI: window.CachedAPI,
  KeyboardManager: window.KeyboardManager,
  LazyLoader: window.LazyLoader,
  EventBus: window.EventBus
}

// 检查并报告模块状态
const loadedModules = []
const missingModules = []

Object.entries(CoreModules).forEach(([name, module]) => {
  if (module) {
    loadedModules.push(name)
  } else {
    missingModules.push(name)
  }
})

if (missingModules.length > 0) {
  console.warn(`⚠️ 以下核心模块未加载: ${missingModules.join(', ')}`)
  console.warn('请确保在 index.js 之前加载这些模块的脚本文件')
}

console.log(`✅ 核心模块已加载: ${loadedModules.join(', ')}`)

// 导出模块集合
window.CoreModules = CoreModules

// ========== 便捷访问器 ==========

/**
 * 快速获取核心模块
 * @param {string} name - 模块名
 * @returns {Object|undefined}
 */
window.getCore = function(name) {
  return CoreModules[name]
}

// ========== 初始化辅助函数 ==========

/**
 * 初始化所有核心模块
 * 某些模块可能需要手动初始化
 */
window.initCoreModules = function() {
  // 初始化键盘管理器
  if (CoreModules.KeyboardManager && !CoreModules.KeyboardManager._initialized) {
    CoreModules.KeyboardManager.init()
  }
  
  // 预加载常用模块
  if (CoreModules.LazyLoader) {
    // 可以在这里配置需要预加载的模块
    // CoreModules.LazyLoader.preload(['dayjs'])
  }
  
  console.log('✅ 核心模块初始化完成')
}

// ========== 调试工具 ==========

/**
 * 打印核心模块状态
 */
window.printCoreStatus = function() {
  console.log('\n📦 核心模块状态:')
  console.log('━'.repeat(50))
  
  Object.entries(CoreModules).forEach(([name, module]) => {
    const status = module ? '✅ 已加载' : '❌ 未加载'
    console.log(`  ${name.padEnd(20)} ${status}`)
    
    // 打印模块特定信息
    if (module && name === 'DataCache') {
      const stats = module.stats()
      console.log(`    └─ 缓存条目: ${stats.size}, 命中率: ${stats.hitRate}`)
    }
    
    if (module && name === 'KeyboardManager') {
      console.log(`    └─ 快捷键数: ${module.getAll().length}`)
    }
    
    if (module && name === 'EventBus') {
      console.log(`    └─ 事件数: ${module.eventNames().length}`)
    }
  })
  
  console.log('━'.repeat(50))
}

