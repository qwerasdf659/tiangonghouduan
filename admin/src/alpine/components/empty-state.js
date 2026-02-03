/**
 * Empty State 空状态组件
 *
 * @file src/alpine/components/empty-state.js
 * @description 基于 Alpine.js 的空状态组件
 * @version 1.0.0
 * @date 2026-01-26
 *
 * 使用方式：
 * <div x-data="emptyState({ type: 'no-data', title: '暂无数据' })">
 *   <div class="empty-state" x-bind="container">
 *     <div class="empty-state-icon" x-text="icon"></div>
 *     <h3 class="empty-state-title" x-text="title"></h3>
 *     <p class="empty-state-description" x-text="description"></p>
 *     <div class="empty-state-action" x-show="hasAction">
 *       <button class="btn btn-primary" @click="handleAction" x-text="actionText"></button>
 *     </div>
 *   </div>
 * </div>
 */

import { logger } from '../../utils/logger.js'

/**
 * 预定义的空状态类型及其默认配置
 */
const EMPTY_STATE_PRESETS = {
  'no-data': {
    icon: '📭',
    title: '暂无数据',
    description: '当前没有任何数据'
  },
  'search-empty': {
    icon: '🔍',
    title: '未找到结果',
    description: '没有找到匹配的搜索结果，请尝试其他关键词'
  },
  'filter-empty': {
    icon: '🏷️',
    title: '暂无匹配项',
    description: '当前筛选条件下没有数据，请调整筛选条件'
  },
  error: {
    icon: '❌',
    title: '加载失败',
    description: '数据加载出现错误，请稍后重试'
  },
  'network-error': {
    icon: '📶',
    title: '网络错误',
    description: '无法连接到服务器，请检查网络连接'
  },
  'permission-denied': {
    icon: '🔒',
    title: '无权访问',
    description: '您没有权限查看此内容'
  },
  'coming-soon': {
    icon: '🚧',
    title: '即将上线',
    description: '此功能正在开发中，敬请期待'
  },
  maintenance: {
    icon: '🔧',
    title: '系统维护中',
    description: '系统正在维护升级，请稍后再试'
  },
  success: {
    icon: '✅',
    title: '操作成功',
    description: '您的操作已成功完成'
  },
  inbox: {
    icon: '📥',
    title: '收件箱为空',
    description: '您没有任何消息'
  },
  cart: {
    icon: '🛒',
    title: '购物车是空的',
    description: '快去添加一些商品吧'
  },
  favorites: {
    icon: '⭐',
    title: '暂无收藏',
    description: '您还没有收藏任何内容'
  },
  notifications: {
    icon: '🔔',
    title: '暂无通知',
    description: '您没有任何新的通知'
  },
  users: {
    icon: '👥',
    title: '暂无用户',
    description: '当前没有任何用户数据'
  },
  files: {
    icon: '📁',
    title: '暂无文件',
    description: '当前文件夹是空的'
  },
  images: {
    icon: '🖼️',
    title: '暂无图片',
    description: '还没有上传任何图片'
  },
  comments: {
    icon: '💬',
    title: '暂无评论',
    description: '还没有人发表评论'
  },
  orders: {
    icon: '📦',
    title: '暂无订单',
    description: '您还没有任何订单记录'
  },
  tasks: {
    icon: '✨',
    title: '任务已完成',
    description: '太棒了！没有待处理的任务'
  },

  // ========== P1-14: 正向反馈空状态 ==========

  // 待办总览 - 全部处理完毕
  'pending-complete': {
    icon: '🎉',
    title: '所有待办已处理完毕',
    description: '太棒了！休息一下吧，您的工作效率非常高！',
    positive: true,
    actionText: '查看历史'
  },

  // 消费审核 - 无待审核
  'consumption-empty': {
    icon: '✅',
    title: '暂无待审核的消费记录',
    description: '所有消费记录都已审核完毕，系统运行正常',
    positive: true,
    actionText: '查看已审核'
  },

  // 客服工作台 - 无等待会话
  'customer-service-empty': {
    icon: '😊',
    title: '当前没有等待中的用户会话',
    description: '所有用户咨询都已得到回复，客服工作顺利！',
    positive: true,
    actionText: '查看历史'
  },

  // 告警中心 - 无告警
  'alerts-empty': {
    icon: '🛡️',
    title: '系统运行正常，暂无告警',
    description: '恭喜！所有指标都在正常范围内，继续保持',
    positive: true,
    actionText: '查看历史'
  },

  // 风控告警 - 无风险
  'risk-alerts-empty': {
    icon: '🔐',
    title: '暂无风控告警',
    description: '系统安全运行中，未检测到异常风险',
    positive: true
  },

  // 抽奖告警 - 无异常
  'lottery-alerts-empty': {
    icon: '🎰',
    title: '抽奖系统运行正常',
    description: '中奖率和分布都在预期范围内，无需处理',
    positive: true
  },

  // 健康度满分
  'health-perfect': {
    icon: '🏆',
    title: '业务健康度: 100/100',
    description: '🎊 恭喜！所有指标都处于最佳状态，继续保持！',
    positive: true
  },

  // 消息中心 - 无新消息
  'messages-empty': {
    icon: '📬',
    title: '暂无新消息',
    description: '您已查看所有消息，保持关注最新动态',
    positive: true
  },

  // 审计日志 - 无记录（特定筛选条件）
  'audit-empty': {
    icon: '📋',
    title: '暂无匹配的操作记录',
    description: '当前筛选条件下没有审计日志，请调整查询条件'
  }
}

/**
 * Empty State 组件数据
 * @param {Object} config - 配置选项
 * @param {string} config.type - 预设类型（可选）
 * @param {string} config.icon - 自定义图标（emoji 或 icon class）
 * @param {string} config.title - 标题
 * @param {string} config.description - 描述文本
 * @param {string} config.actionText - 操作按钮文本
 * @param {Function} config.onAction - 操作按钮回调
 * @param {string} config.size - 尺寸: 'sm' | 'md' | 'lg'
 */
function emptyState(config = {}) {
  // 获取预设配置
  const preset = EMPTY_STATE_PRESETS[config.type] || EMPTY_STATE_PRESETS['no-data']

  return {
    // 状态
    icon: config.icon || preset.icon,
    title: config.title || preset.title,
    description: config.description || preset.description,
    actionText: config.actionText || '',
    size: config.size || 'md',
    onAction: config.onAction || null,
    visible: true,

    // 计算属性
    get hasAction() {
      return !!this.actionText
    },

    get sizeClass() {
      switch (this.size) {
        case 'sm':
          return 'py-8 text-sm'
        case 'lg':
          return 'py-24 text-lg'
        default:
          return 'py-16'
      }
    },

    get iconSizeClass() {
      switch (this.size) {
        case 'sm':
          return 'text-4xl'
        case 'lg':
          return 'text-8xl'
        default:
          return 'text-6xl'
      }
    },

    // 绑定属性
    container: {
      'x-show': 'visible',
      'x-transition:enter': 'transition ease-out duration-300',
      'x-transition:enter-start': 'opacity-0 transform scale-95',
      'x-transition:enter-end': 'opacity-100 transform scale-100',
      'x-transition:leave': 'transition ease-in duration-200',
      'x-transition:leave-start': 'opacity-100 transform scale-100',
      'x-transition:leave-end': 'opacity-0 transform scale-95'
    },

    // 方法
    init() {
      logger.info('[EmptyState] 初始化', { type: config.type, title: this.title })
    },

    // 更新配置
    update(newConfig) {
      if (newConfig.type && EMPTY_STATE_PRESETS[newConfig.type]) {
        const preset = EMPTY_STATE_PRESETS[newConfig.type]
        this.icon = newConfig.icon || preset.icon
        this.title = newConfig.title || preset.title
        this.description = newConfig.description || preset.description
      } else {
        if (newConfig.icon) this.icon = newConfig.icon
        if (newConfig.title) this.title = newConfig.title
        if (newConfig.description) this.description = newConfig.description
      }
      if (newConfig.actionText !== undefined) this.actionText = newConfig.actionText
      if (newConfig.size) this.size = newConfig.size
      if (newConfig.onAction) this.onAction = newConfig.onAction
    },

    // 显示空状态
    show() {
      this.visible = true
    },

    // 隐藏空状态
    hide() {
      this.visible = false
    },

    // 处理操作按钮点击
    handleAction() {
      if (this.onAction && typeof this.onAction === 'function') {
        this.onAction()
      }
    }
  }
}

/**
 * 快速创建空状态（简化版）
 * @param {string} type - 预设类型
 * @param {Object} overrides - 覆盖配置
 */
function quickEmptyState(type, overrides = {}) {
  return emptyState({ type, ...overrides })
}

/**
 * 空状态工厂 - 用于动态创建空状态
 */
const emptyStateFactory = {
  // 获取所有可用类型
  getTypes() {
    return Object.keys(EMPTY_STATE_PRESETS)
  },

  // 获取预设配置
  getPreset(type) {
    return EMPTY_STATE_PRESETS[type] || null
  },

  // 创建自定义空状态
  create(config) {
    return emptyState(config)
  },

  // 批量注册自定义类型
  registerTypes(types) {
    Object.assign(EMPTY_STATE_PRESETS, types)
    logger.info('[EmptyState] 注册新类型', Object.keys(types))
  }
}

// 导出
export { emptyState, quickEmptyState, emptyStateFactory, EMPTY_STATE_PRESETS }

logger.info('EmptyState 组件已加载')
