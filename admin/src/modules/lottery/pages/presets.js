/**
 * 预设队列管理页面
 *
 * @file admin/src/modules/lottery/pages/presets.js
 * @description 为用户安排多次连续中奖剧本（lottery_presets 表），用户每次抽奖按 queue_order 顺序命中。
 *              per-user 暗箱干预已于 2026-06 合规改造整体下线，本页面精简为纯「预设队列管理」。
 * @version 5.0.0 (2026-06-05 per-user 干预下线，精简为纯预设队列管理)
 * @module lottery/pages/presets
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'
import { request } from '../../../api/base.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import {
  usePresetVisualizationState,
  usePresetVisualizationMethods
} from '../composables/preset-visualization.js'

// API 请求封装
const apiRequest = async (url, options = {}) => {
  return await request({ url, ...options })
}

/**
 * 预设队列管理页面组件
 *
 * @description 管理用户预设队列（多次连续中奖剧本）。用户每次抽奖按 queue_order 顺序命中对应奖品，
 *              队列耗尽后恢复正常概率抽奖。
 * @returns {Object} Alpine.js 组件配置对象
 *
 * @property {boolean} globalLoading - 全局加载状态
 * @property {boolean} submitting - 表单提交中状态
 * @property {Array<Object>} allPrizes - 奖品列表（创建预设时选择奖品用）
 */
function presetsPage() {
  return {
    // ==================== Mixin 组合（userResolver 提供手机号→用户解析能力） ====================
    ...createPageMixin({ userResolver: true }),

    // ==================== 预设队列 composable ====================
    ...usePresetVisualizationState(),
    ...usePresetVisualizationMethods(),

    // ==================== 页面特有状态 ====================

    /**
     * 全局加载状态
     * @type {boolean}
     */
    globalLoading: false,

    /**
     * 表单提交中状态
     * @type {boolean}
     */
    submitting: false,

    /**
     * 奖品列表（创建预设队列时选择奖品用）
     * @type {Array<Object>}
     */
    allPrizes: [],

    // ==================== 生命周期 ====================

    /**
     * 初始化组件
     *
     * @description 执行认证检查并加载初始数据（奖品列表、预设统计、预设列表）
     * @async
     * @returns {Promise<void>}
     */
    async init() {
      logger.info('[PRESETS] 预设队列管理页面初始化 (v5.0 - 纯预设队列)')

      if (!this.checkAuth()) {
        logger.warn('[PRESETS] 认证检查未通过，跳过数据加载')
        return
      }

      try {
        await Promise.all([this.loadPrizes(), this.loadPresetStats(), this.loadPresets()])
        logger.info('[PRESETS] 预设队列初始化完成', {
          presetsCount: this.presets.length,
          prizesCount: this.allPrizes.length
        })
      } catch (error) {
        logger.error('[PRESETS] 初始化失败:', error)
      }
    },

    // ==================== 数据加载 ====================

    /**
     * 加载奖品列表
     *
     * @description 从 API 获取所有可用奖品，用于创建预设队列时选择
     * @async
     * @returns {Promise<void>}
     */
    async loadPrizes() {
      try {
        const response = await apiRequest(LOTTERY_ENDPOINTS.PRIZE_LIST)

        if (response && response.success) {
          this.allPrizes = response.data?.prizes || []
          logger.info('奖品列表加载成功', { count: this.allPrizes.length })

          if (this.allPrizes.length === 0) {
            logger.warn('奖品列表为空，请检查后端数据')
          }
        } else {
          logger.warn('奖品列表响应失败', { response })
        }
      } catch (error) {
        logger.error('加载奖品列表失败:', error)
        this.showError('加载奖品列表失败: ' + error.message)
      }
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('presetsPage', presetsPage)
  logger.info('[PresetsPage] Alpine 组件已注册 (v5.0 - 纯预设队列)')
})
