/**
 * 模块懒加载器
 * 解决：首屏加载慢、一次性加载过多资源
 * 
 * @file public/admin/js/core/lazy-loader.js
 * @description 按需加载 JavaScript 模块，支持预加载和依赖管理
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * @example
 * // 需要图表时才加载 ECharts
 * await LazyLoader.load('echarts')
 * const chart = echarts.init(document.getElementById('chart'))
 * 
 * // 加载多个模块
 * await LazyLoader.loadAll(['echarts', 'dayjs'])
 */

const LazyLoader = {
  // ========== 状态 ==========
  
  /** 已加载的模块 */
  _loaded: new Set(),
  
  /** 加载中的 Promise（防止重复加载） */
  _loading: new Map(),
  
  // ========== 模块配置 ==========
  
  /** 预定义的模块配置 */
  _modules: {
    // 图表库
    echarts: {
      url: 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js',
      check: () => typeof echarts !== 'undefined',
      description: 'ECharts 图表库'
    },
    
    // Socket.IO
    socketio: {
      url: 'https://cdn.socket.io/4.7.2/socket.io.min.js',
      check: () => typeof io !== 'undefined',
      description: 'Socket.IO 实时通信'
    },
    
    // 日期处理
    dayjs: {
      url: 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js',
      check: () => typeof dayjs !== 'undefined',
      description: 'Day.js 日期处理'
    },
    
    // Excel 处理
    xlsx: {
      url: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
      check: () => typeof XLSX !== 'undefined',
      description: 'SheetJS Excel 处理'
    },
    
    // 剪贴板
    clipboard: {
      url: 'https://cdn.jsdelivr.net/npm/clipboard@2.0.11/dist/clipboard.min.js',
      check: () => typeof ClipboardJS !== 'undefined',
      description: 'Clipboard.js 剪贴板'
    },
    
    // 二维码生成
    qrcode: {
      url: 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js',
      check: () => typeof QRCode !== 'undefined',
      description: 'QRCode 二维码生成'
    },
    
    // 图片压缩
    compressor: {
      url: 'https://cdn.jsdelivr.net/npm/compressorjs@1.2.1/dist/compressor.min.js',
      check: () => typeof Compressor !== 'undefined',
      description: 'Compressor.js 图片压缩'
    },
    
    // 打印
    printjs: {
      url: 'https://cdn.jsdelivr.net/npm/print-js@1.6.0/dist/print.min.js',
      check: () => typeof printJS !== 'undefined',
      description: 'Print.js 打印'
    },
    
    // 拖拽排序
    sortablejs: {
      url: 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js',
      check: () => typeof Sortable !== 'undefined',
      description: 'Sortable.js 拖拽排序'
    },
    
    // 富文本编辑器
    quill: {
      url: 'https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.min.js',
      css: 'https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css',
      check: () => typeof Quill !== 'undefined',
      description: 'Quill 富文本编辑器'
    }
  },
  
  // ========== 核心方法 ==========
  
  /**
   * 加载模块
   * 
   * @param {string} name - 模块名
   * @returns {Promise<void>}
   * @throws {Error} 模块不存在或加载失败
   * 
   * @example
   * await LazyLoader.load('echarts')
   * // 现在可以使用 echarts
   */
  async load(name) {
    const module = this._modules[name]
    
    if (!module) {
      throw new Error(`[LazyLoader] 未知模块: ${name}`)
    }
    
    // 检查是否已加载
    if (this._loaded.has(name) || module.check()) {
      console.log(`[LazyLoader] 模块已存在: ${name}`)
      return Promise.resolve()
    }
    
    // 检查是否正在加载
    if (this._loading.has(name)) {
      console.log(`[LazyLoader] 模块加载中: ${name}`)
      return this._loading.get(name)
    }
    
    // 创建加载 Promise
    const loadPromise = this._loadModule(name, module)
    this._loading.set(name, loadPromise)
    
    try {
      await loadPromise
      this._loaded.add(name)
      console.log(`✅ [LazyLoader] 模块加载完成: ${name}`)
    } finally {
      this._loading.delete(name)
    }
  },
  
  /**
   * 加载多个模块
   * 
   * @param {string[]} names - 模块名列表
   * @returns {Promise<void>}
   * 
   * @example
   * await LazyLoader.loadAll(['echarts', 'dayjs', 'xlsx'])
   */
  async loadAll(names) {
    console.log(`[LazyLoader] 批量加载 ${names.length} 个模块...`)
    await Promise.all(names.map(name => this.load(name)))
    console.log(`[LazyLoader] 批量加载完成`)
  },
  
  /**
   * 注册新模块
   * 
   * @param {string} name - 模块名
   * @param {Object} config - 模块配置
   * @param {string} config.url - JS 文件 URL
   * @param {string} [config.css] - CSS 文件 URL（可选）
   * @param {Function} config.check - 检查是否已加载的函数
   * @param {string} [config.description] - 模块描述
   * 
   * @example
   * LazyLoader.register('mylib', {
   *   url: '/js/mylib.js',
   *   check: () => typeof MyLib !== 'undefined',
   *   description: '自定义库'
   * })
   */
  register(name, config) {
    if (!config.url || !config.check) {
      throw new Error('[LazyLoader] 模块配置必须包含 url 和 check')
    }
    
    this._modules[name] = config
    console.log(`[LazyLoader] 注册模块: ${name}`)
  },
  
  /**
   * 检查模块是否已加载
   * 
   * @param {string} name - 模块名
   * @returns {boolean}
   */
  isLoaded(name) {
    const module = this._modules[name]
    return module ? (this._loaded.has(name) || module.check()) : false
  },
  
  /**
   * 获取所有可用模块
   * 
   * @returns {Array<{name: string, loaded: boolean, description: string}>}
   */
  getModules() {
    return Object.entries(this._modules).map(([name, config]) => ({
      name,
      loaded: this.isLoaded(name),
      description: config.description || ''
    }))
  },
  
  /**
   * 预加载模块（后台加载，不阻塞）
   * 
   * @param {string[]} names - 模块名列表
   */
  preload(names) {
    console.log(`[LazyLoader] 后台预加载: ${names.join(', ')}`)
    
    // 使用 requestIdleCallback 在浏览器空闲时加载
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => {
        this.loadAll(names).catch(err => {
          console.warn('[LazyLoader] 预加载失败:', err)
        })
      })
    } else {
      // 降级：延迟加载
      setTimeout(() => {
        this.loadAll(names).catch(err => {
          console.warn('[LazyLoader] 预加载失败:', err)
        })
      }, 1000)
    }
  },
  
  // ========== 私有方法 ==========
  
  /**
   * 加载单个模块
   * @private
   */
  async _loadModule(name, module) {
    const promises = []
    
    // 加载 CSS（如果有）
    if (module.css) {
      promises.push(this._loadCSS(module.css, name))
    }
    
    // 加载 JS
    promises.push(this._loadScript(module.url, name))
    
    await Promise.all(promises)
    
    // 验证加载结果
    if (!module.check()) {
      throw new Error(`[LazyLoader] 模块 ${name} 加载后验证失败`)
    }
  },
  
  /**
   * 加载 JS 脚本
   * @private
   */
  _loadScript(url, name) {
    return new Promise((resolve, reject) => {
      // 检查是否已存在
      if (document.querySelector(`script[src="${url}"]`)) {
        resolve()
        return
      }
      
      const script = document.createElement('script')
      script.src = url
      script.async = true
      script.dataset.module = name
      
      script.onload = () => {
        console.log(`[LazyLoader] JS 加载完成: ${name}`)
        resolve()
      }
      
      script.onerror = () => {
        reject(new Error(`[LazyLoader] JS 加载失败: ${url}`))
      }
      
      document.head.appendChild(script)
    })
  },
  
  /**
   * 加载 CSS 样式
   * @private
   */
  _loadCSS(url, name) {
    return new Promise((resolve, reject) => {
      // 检查是否已存在
      if (document.querySelector(`link[href="${url}"]`)) {
        resolve()
        return
      }
      
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = url
      link.dataset.module = name
      
      link.onload = () => {
        console.log(`[LazyLoader] CSS 加载完成: ${name}`)
        resolve()
      }
      
      link.onerror = () => {
        reject(new Error(`[LazyLoader] CSS 加载失败: ${url}`))
      }
      
      document.head.appendChild(link)
    })
  }
}

// 导出到全局作用域
window.LazyLoader = LazyLoader

console.log('✅ LazyLoader 懒加载模块已加载')

