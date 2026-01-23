/**
 * 全局加载状态管理 Store
 * 增强的加载状态管理，支持多任务跟踪和进度显示
 *
 * @file public/admin/js/alpine/stores/loading.js
 * @description 提供细粒度的加载状态管理
 * @version 1.0.0
 * @date 2026-01-23
 *
 * @example
 * // 开始加载
 * const taskId = Alpine.store('loading').start('正在加载数据...')
 *
 * // 完成加载
 * Alpine.store('loading').stop(taskId)
 *
 * // 或使用 withLoading 包装器
 * await Alpine.store('loading').withLoading(async () => {
 *   await loadData()
 * }, '正在加载...')
 */


import { logger } from '../../utils/logger.js'
document.addEventListener('alpine:init', () => {
  logger.info('🔧 注册加载状态 Store...')

  /**
   * 加载状态 Store
   */
  Alpine.store('loading', {
    // ========== 状态 ==========

    /** 活动的加载任务 */
    tasks: {},

    /** 任务计数器 */
    _counter: 0,

    // ========== 计算属性 ==========

    /**
     * 是否有活动的加载任务
     */
    get isLoading() {
      return Object.keys(this.tasks).length > 0
    },

    /**
     * 活动任务数量
     */
    get taskCount() {
      return Object.keys(this.tasks).length
    },

    /**
     * 当前显示的加载消息（最后一个任务）
     */
    get currentMessage() {
      const taskIds = Object.keys(this.tasks)
      if (taskIds.length === 0) return ''
      return this.tasks[taskIds[taskIds.length - 1]]?.message || '加载中...'
    },

    /**
     * 所有活动任务的消息
     */
    get allMessages() {
      return Object.values(this.tasks).map(t => t.message)
    },

    // ========== 方法 ==========

    /**
     * 开始加载任务
     *
     * @param {string} [message='加载中...'] - 加载消息
     * @returns {string} 任务 ID
     */
    start(message = '加载中...') {
      const taskId = `task_${++this._counter}`

      this.tasks[taskId] = {
        id: taskId,
        message,
        startTime: Date.now()
      }

      // 同步到全局加载遮罩
      this._updateGlobalOverlay()

      logger.info(`[Loading] 开始: ${taskId} - ${message}`)
      return taskId
    },

    /**
     * 结束加载任务
     *
     * @param {string} taskId - 任务 ID
     */
    stop(taskId) {
      if (this.tasks[taskId]) {
        const duration = Date.now() - this.tasks[taskId].startTime
        logger.info(`[Loading] 结束: ${taskId} (${duration}ms)`)

        delete this.tasks[taskId]

        // 同步到全局加载遮罩
        this._updateGlobalOverlay()
      }
    },

    /**
     * 更新任务消息
     *
     * @param {string} taskId - 任务 ID
     * @param {string} message - 新消息
     */
    updateMessage(taskId, message) {
      if (this.tasks[taskId]) {
        this.tasks[taskId].message = message
        this._updateGlobalOverlay()
      }
    },

    /**
     * 停止所有加载任务
     */
    stopAll() {
      const count = Object.keys(this.tasks).length
      this.tasks = {}
      this._updateGlobalOverlay()
      logger.info(`[Loading] 停止所有任务: ${count} 个`)
    },

    /**
     * 包装异步函数，自动管理加载状态
     *
     * @param {Function} asyncFn - 异步函数
     * @param {string} [message='加载中...'] - 加载消息
     * @returns {Promise<any>}
     */
    async withLoading(asyncFn, message = '加载中...') {
      const taskId = this.start(message)

      try {
        return await asyncFn()
      } finally {
        this.stop(taskId)
      }
    },

    /**
     * 批量执行异步操作，显示进度
     *
     * @param {Array<Function>} asyncFns - 异步函数数组
     * @param {string} [messagePrefix='处理中'] - 消息前缀
     * @returns {Promise<Array>}
     */
    async withProgress(asyncFns, messagePrefix = '处理中') {
      const total = asyncFns.length
      const taskId = this.start(`${messagePrefix} (0/${total})`)
      const results = []

      try {
        for (let i = 0; i < asyncFns.length; i++) {
          this.updateMessage(taskId, `${messagePrefix} (${i + 1}/${total})`)
          const result = await asyncFns[i]()
          results.push(result)
        }
        return results
      } finally {
        this.stop(taskId)
      }
    },

    // ========== 私有方法 ==========

    /**
     * 更新全局加载遮罩
     * @private
     * ========== window.xxx 已移除（方案 A：彻底 ES Module） ==========
     * 直接操作 DOM 元素，不再依赖 window.showLoading/hideLoading
     */
    _updateGlobalOverlay() {
      const overlay = document.getElementById('globalLoadingOverlay')
      if (!overlay) return

      if (this.isLoading) {
        overlay.style.display = 'flex'
        const messageEl = overlay.querySelector('.loading-message')
        if (messageEl && this.currentMessage) {
          messageEl.textContent = this.currentMessage
        }
      } else {
        overlay.style.display = 'none'
      }
    }
  })

  logger.info('加载状态 Store 已注册')
})

logger.info('加载状态模块已加载')
