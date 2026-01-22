/**
 * 模块加载器 - 汇总入口
 * 提供一个统一的入口文件，按正确顺序加载所有优化模块
 * 
 * @file public/admin/js/modules-loader.js
 * @description 用于在 HTML 中引入所有模块的入口文件
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * 📦 加载顺序：
 * 1. 核心模块 (cache, api-cached, event-bus, keyboard, lazy-loader)
 * 2. 工具模块 (throttle, error-handler, cache-strategy, error-boundary)
 * 3. Alpine Mixins (auth-guard, pagination, async-data, modal, table-selection, form-validation)
 * 4. Alpine Stores (confirm-dialog, loading, page-state)
 * 
 * 在 HTML 中的使用方式：
 * <script src="/admin/js/modules-loader.js"></script>
 * 
 * 或者分别引入各个模块：
 * <script src="/admin/js/core/cache.js"></script>
 * <script src="/admin/js/core/api-cached.js"></script>
 * ...
 */

(function() {
  'use strict';
  
  console.log('🚀 开始加载优化模块...')
  
  // 模块加载状态
  const loadStatus = {
    core: [],
    utils: [],
    mixins: [],
    stores: [],
    components: []
  }
  
  /**
   * 动态加载脚本
   * @param {string} src - 脚本路径
   * @param {string} category - 分类
   * @returns {Promise}
   */
  function loadScript(src, category) {
    return new Promise((resolve, reject) => {
      // 检查是否已加载
      if (document.querySelector(`script[src="${src}"]`)) {
        console.log(`⏭️ 已加载: ${src}`)
        loadStatus[category].push({ src, status: 'cached' })
        resolve()
        return
      }
      
      const script = document.createElement('script')
      script.src = src
      script.async = false  // 保持顺序加载
      
      script.onload = () => {
        console.log(`✅ 已加载: ${src}`)
        loadStatus[category].push({ src, status: 'loaded' })
        resolve()
      }
      
      script.onerror = () => {
        console.error(`❌ 加载失败: ${src}`)
        loadStatus[category].push({ src, status: 'failed' })
        reject(new Error(`Failed to load: ${src}`))
      }
      
      document.head.appendChild(script)
    })
  }
  
  /**
   * 按顺序加载模块组
   * @param {Array} modules - 模块列表
   * @param {string} category - 分类名
   */
  async function loadModuleGroup(modules, category) {
    console.log(`📦 加载 ${category} 模块...`)
    
    for (const module of modules) {
      try {
        await loadScript(module, category)
      } catch (error) {
        // 单个模块加载失败不影响其他模块
        console.warn(`⚠️ ${category} 模块加载失败: ${module}`)
      }
    }
  }
  
  /**
   * 获取基础路径
   */
  function getBasePath() {
    // 从当前脚本路径推断基础路径
    const scripts = document.getElementsByTagName('script')
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i].src
      if (src.includes('modules-loader.js')) {
        return src.replace('modules-loader.js', '')
      }
    }
    return '/admin/js/'
  }
  
  // 主加载函数
  async function loadAllModules() {
    const basePath = getBasePath()
    
    // 1. 核心模块
    const coreModules = [
      basePath + 'core/cache.js',
      basePath + 'core/api-cached.js',
      basePath + 'core/event-bus.js',
      basePath + 'core/keyboard.js',
      basePath + 'core/lazy-loader.js',
      basePath + 'core/index.js'
    ]
    
    // 2. 工具模块
    const utilsModules = [
      basePath + 'utils/throttle.js',
      basePath + 'utils/error-handler.js',
      basePath + 'utils/cache-strategy.js',
      basePath + 'utils/error-boundary.js',
      basePath + 'utils/index.js'
    ]
    
    // 3. Alpine Mixins (需要在 Alpine 之前加载)
    const mixinModules = [
      basePath + 'alpine/mixins/auth-guard.js',
      basePath + 'alpine/mixins/pagination.js',
      basePath + 'alpine/mixins/async-data.js',
      basePath + 'alpine/mixins/modal.js',
      basePath + 'alpine/mixins/table-selection.js',
      basePath + 'alpine/mixins/form-validation.js',
      basePath + 'alpine/mixins/index.js'
    ]
    
    // 4. Alpine Stores (需要在 alpine:init 事件中注册)
    const storeModules = [
      basePath + 'alpine/stores/confirm-dialog.js',
      basePath + 'alpine/stores/loading.js',
      basePath + 'alpine/stores/page-state.js',
      basePath + 'alpine/stores/index.js'
    ]
    
    // 5. Alpine Components (组件)
    const componentModules = [
      basePath + 'alpine/components/virtual-list.js',
      basePath + 'alpine/components/toast.js'
    ]
    
    try {
      // 按顺序加载
      await loadModuleGroup(coreModules, 'core')
      await loadModuleGroup(utilsModules, 'utils')
      await loadModuleGroup(mixinModules, 'mixins')
      await loadModuleGroup(storeModules, 'stores')
      await loadModuleGroup(componentModules, 'components')
      
      console.log('🎉 所有优化模块加载完成!')
      printLoadStatus()
      
      // 触发模块加载完成事件
      document.dispatchEvent(new CustomEvent('modules:loaded', {
        detail: loadStatus
      }))
      
    } catch (error) {
      console.error('❌ 模块加载过程中发生错误:', error)
    }
  }
  
  /**
   * 打印加载状态
   */
  function printLoadStatus() {
    console.log('\n📊 模块加载状态:')
    console.log('━'.repeat(50))
    
    let total = 0
    let loaded = 0
    let failed = 0
    
    Object.entries(loadStatus).forEach(([category, modules]) => {
      const categoryLoaded = modules.filter(m => m.status !== 'failed').length
      const categoryFailed = modules.filter(m => m.status === 'failed').length
      
      console.log(`  ${category}: ${categoryLoaded}/${modules.length} 成功`)
      
      total += modules.length
      loaded += categoryLoaded
      failed += categoryFailed
    })
    
    console.log('━'.repeat(50))
    console.log(`  总计: ${loaded}/${total} 成功, ${failed} 失败`)
    console.log('')
  }
  
  // 导出到全局（方便调试）
  window.ModulesLoader = {
    loadStatus,
    reload: loadAllModules,
    getStatus: () => loadStatus
  }
  
  // 开始加载
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAllModules)
  } else {
    loadAllModules()
  }
  
})();

