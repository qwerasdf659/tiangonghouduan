/**
 * Page Transitions 页面切换动画组件
 *
 * @file src/alpine/components/page-transitions.js
 * @description 基于 Alpine.js 的页面和 Tab 切换动画组件
 * @version 1.0.0
 * @date 2026-01-26
 *
 * 使用方式：
 * <div x-data="pageTransition({ type: 'fade' })" x-bind="transitionAttrs">
 *   <div class="page-content">...</div>
 * </div>
 */

import { logger } from '../../utils/logger.js'

/**
 * 预定义的过渡动画配置
 */
const TRANSITION_PRESETS = {
  // 淡入淡出
  fade: {
    enter: 'transition ease-out duration-300',
    enterStart: 'opacity-0',
    enterEnd: 'opacity-100',
    leave: 'transition ease-in duration-200',
    leaveStart: 'opacity-100',
    leaveEnd: 'opacity-0'
  },

  // 向上滑入
  slideUp: {
    enter: 'transition ease-out duration-300',
    enterStart: 'opacity-0 transform translate-y-4',
    enterEnd: 'opacity-100 transform translate-y-0',
    leave: 'transition ease-in duration-200',
    leaveStart: 'opacity-100 transform translate-y-0',
    leaveEnd: 'opacity-0 transform -translate-y-4'
  },

  // 向下滑入
  slideDown: {
    enter: 'transition ease-out duration-300',
    enterStart: 'opacity-0 transform -translate-y-4',
    enterEnd: 'opacity-100 transform translate-y-0',
    leave: 'transition ease-in duration-200',
    leaveStart: 'opacity-100 transform translate-y-0',
    leaveEnd: 'opacity-0 transform translate-y-4'
  },

  // 向右滑入（适合 Tab 向右切换）
  slideRight: {
    enter: 'transition ease-out duration-300',
    enterStart: 'opacity-0 transform translate-x-4',
    enterEnd: 'opacity-100 transform translate-x-0',
    leave: 'transition ease-in duration-200',
    leaveStart: 'opacity-100 transform translate-x-0',
    leaveEnd: 'opacity-0 transform -translate-x-4'
  },

  // 向左滑入（适合 Tab 向左切换）
  slideLeft: {
    enter: 'transition ease-out duration-300',
    enterStart: 'opacity-0 transform -translate-x-4',
    enterEnd: 'opacity-100 transform translate-x-0',
    leave: 'transition ease-in duration-200',
    leaveStart: 'opacity-100 transform translate-x-0',
    leaveEnd: 'opacity-0 transform translate-x-4'
  },

  // 缩放淡入
  scale: {
    enter: 'transition ease-out duration-300',
    enterStart: 'opacity-0 transform scale-95',
    enterEnd: 'opacity-100 transform scale-100',
    leave: 'transition ease-in duration-200',
    leaveStart: 'opacity-100 transform scale-100',
    leaveEnd: 'opacity-0 transform scale-95'
  },

  // 缩放放大
  scaleUp: {
    enter: 'transition ease-out duration-300',
    enterStart: 'opacity-0 transform scale-90',
    enterEnd: 'opacity-100 transform scale-100',
    leave: 'transition ease-in duration-200',
    leaveStart: 'opacity-100 transform scale-100',
    leaveEnd: 'opacity-0 transform scale-105'
  },

  // 弹性缩放
  bounce: {
    enter: 'transition ease-out duration-400',
    enterStart: 'opacity-0 transform scale-75',
    enterEnd: 'opacity-100 transform scale-100',
    leave: 'transition ease-in duration-200',
    leaveStart: 'opacity-100 transform scale-100',
    leaveEnd: 'opacity-0 transform scale-90'
  },

  // 模态框动画
  modal: {
    enter: 'transition ease-out duration-300',
    enterStart: 'opacity-0 transform scale-95 translate-y-4',
    enterEnd: 'opacity-100 transform scale-100 translate-y-0',
    leave: 'transition ease-in duration-200',
    leaveStart: 'opacity-100 transform scale-100 translate-y-0',
    leaveEnd: 'opacity-0 transform scale-95 translate-y-4'
  },

  // 抽屉从右滑入
  drawerRight: {
    enter: 'transition ease-out duration-300',
    enterStart: 'transform translate-x-full',
    enterEnd: 'transform translate-x-0',
    leave: 'transition ease-in duration-200',
    leaveStart: 'transform translate-x-0',
    leaveEnd: 'transform translate-x-full'
  },

  // 抽屉从左滑入
  drawerLeft: {
    enter: 'transition ease-out duration-300',
    enterStart: 'transform -translate-x-full',
    enterEnd: 'transform translate-x-0',
    leave: 'transition ease-in duration-200',
    leaveStart: 'transform translate-x-0',
    leaveEnd: 'transform -translate-x-full'
  },

  // 下拉菜单
  dropdown: {
    enter: 'transition ease-out duration-200',
    enterStart: 'opacity-0 transform scale-95 -translate-y-2',
    enterEnd: 'opacity-100 transform scale-100 translate-y-0',
    leave: 'transition ease-in duration-150',
    leaveStart: 'opacity-100 transform scale-100 translate-y-0',
    leaveEnd: 'opacity-0 transform scale-95 -translate-y-2'
  },

  // 无动画（立即显示/隐藏）
  none: {
    enter: '',
    enterStart: '',
    enterEnd: '',
    leave: '',
    leaveStart: '',
    leaveEnd: ''
  }
}

/**
 * Page Transition 组件
 * @param {Object} config - 配置选项
 * @param {string} config.type - 预设动画类型
 * @param {Object} config.custom - 自定义动画配置
 * @param {number} config.duration - 动画时长（毫秒）
 */
function pageTransition(config = {}) {
  const preset = TRANSITION_PRESETS[config.type] || TRANSITION_PRESETS.fade
  const customConfig = config.custom || {}

  return {
    // 状态
    isVisible: true,
    transitionType: config.type || 'fade',

    // 当前使用的动画配置
    transition: { ...preset, ...customConfig },

    // 绑定的过渡属性
    get transitionAttrs() {
      return {
        'x-show': 'isVisible',
        'x-transition:enter': this.transition.enter,
        'x-transition:enter-start': this.transition.enterStart,
        'x-transition:enter-end': this.transition.enterEnd,
        'x-transition:leave': this.transition.leave,
        'x-transition:leave-start': this.transition.leaveStart,
        'x-transition:leave-end': this.transition.leaveEnd
      }
    },

    // 初始化
    init() {
      logger.debug('[PageTransition] 初始化', { type: this.transitionType })
    },

    // 显示
    show() {
      this.isVisible = true
    },

    // 隐藏
    hide() {
      this.isVisible = false
    },

    // 切换
    toggle() {
      this.isVisible = !this.isVisible
    },

    // 切换动画类型
    setTransitionType(type) {
      if (TRANSITION_PRESETS[type]) {
        this.transitionType = type
        this.transition = { ...TRANSITION_PRESETS[type] }
      }
    },

    // 带动画的内容切换
    async switchContent(callback) {
      this.isVisible = false
      await this.sleep(200) // 等待离开动画完成
      if (callback) callback()
      this.isVisible = true
    },

    // 辅助函数
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms))
    }
  }
}

/**
 * Tab Transition 组件 - 专门用于 Tab 切换
 * @param {Object} config - 配置选项
 */
function tabTransition(config = {}) {
  return {
    // 当前激活的 Tab
    activeTab: config.initialTab || 0,
    // 上一个 Tab（用于判断方向）
    previousTab: config.initialTab || 0,
    // Tab 内容
    tabs: config.tabs || [],
    // 是否正在切换
    isTransitioning: false,

    // 计算切换方向
    get direction() {
      return this.activeTab > this.previousTab ? 'right' : 'left'
    },

    // 获取当前方向的过渡配置
    get currentTransition() {
      return this.direction === 'right'
        ? TRANSITION_PRESETS.slideRight
        : TRANSITION_PRESETS.slideLeft
    },

    // 初始化
    init() {
      logger.debug('[TabTransition] 初始化', {
        tabs: this.tabs.length,
        active: this.activeTab
      })
    },

    // 切换 Tab
    async switchTab(index) {
      if (index === this.activeTab || this.isTransitioning) return

      this.isTransitioning = true
      this.previousTab = this.activeTab

      // 等待离开动画
      await this.sleep(200)

      this.activeTab = index

      // 等待进入动画
      await this.sleep(300)

      this.isTransitioning = false
    },

    // 下一个 Tab
    nextTab() {
      const next = (this.activeTab + 1) % this.tabs.length
      this.switchTab(next)
    },

    // 上一个 Tab
    prevTab() {
      const prev = (this.activeTab - 1 + this.tabs.length) % this.tabs.length
      this.switchTab(prev)
    },

    // 判断 Tab 是否激活
    isActive(index) {
      return index === this.activeTab
    },

    // 获取 Tab 内容的过渡属性
    getContentTransition(index) {
      const transition = this.currentTransition
      return {
        'x-show': `activeTab === ${index}`,
        'x-transition:enter': transition.enter,
        'x-transition:enter-start': transition.enterStart,
        'x-transition:enter-end': transition.enterEnd,
        'x-transition:leave': transition.leave,
        'x-transition:leave-start': transition.leaveStart,
        'x-transition:leave-end': transition.leaveEnd
      }
    },

    // 辅助函数
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms))
    }
  }
}

/**
 * 列表项交错动画组件
 * @param {Object} config - 配置选项
 */
function staggerTransition(config = {}) {
  return {
    items: config.items || [],
    baseDelay: config.delay || 50, // 每项的延迟间隔
    transitionType: config.type || 'slideUp',
    isVisible: false,

    init() {
      // 延迟触发显示
      setTimeout(() => {
        this.isVisible = true
      }, config.initialDelay || 100)
    },

    // 获取单个项的延迟
    getItemDelay(index) {
      return `${index * this.baseDelay}ms`
    },

    // 获取单个项的过渡样式
    getItemStyle(index) {
      return {
        transitionDelay: this.getItemDelay(index),
        animationDelay: this.getItemDelay(index)
      }
    },

    // 获取项的 CSS 类
    getItemClass(index) {
      const preset = TRANSITION_PRESETS[this.transitionType]
      return {
        [preset.enter]: true,
        [this.isVisible ? preset.enterEnd : preset.enterStart]: true
      }
    }
  }
}

/**
 * 获取过渡预设配置
 * @param {string} type - 预设类型
 * @returns {Object} 过渡配置
 */
function getTransitionPreset(type) {
  return TRANSITION_PRESETS[type] || TRANSITION_PRESETS.fade
}

/**
 * 获取所有可用的过渡类型
 * @returns {string[]} 类型列表
 */
function getTransitionTypes() {
  return Object.keys(TRANSITION_PRESETS)
}

// 导出
export {
  pageTransition,
  tabTransition,
  staggerTransition,
  getTransitionPreset,
  getTransitionTypes,
  TRANSITION_PRESETS
}

logger.info('PageTransitions 组件已加载')
