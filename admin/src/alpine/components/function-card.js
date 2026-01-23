/**
 * Function Card 功能卡片组件
 *
 * @file public/admin/js/alpine/components/function-card.js
 * @description 基于 Alpine.js 的功能卡片组件，用于快速导航
 * @version 1.0.0
 * @date 2026-01-22
 *
 * 使用方式：
 * <div x-data="functionCard({
 *   title: '用户管理',
 *   icon: 'bi-people',
 *   link: '/admin/users.html',
 *   badge: 10
 * })">
 *   ...
 * </div>
 */

/**
 * Function Card 单个卡片组件
 * @param {Object} config - 配置选项
 * @param {string} config.title - 卡片标题
 * @param {string} config.icon - Bootstrap 图标类名
 * @param {string} config.link - 跳转链接
 * @param {string} config.description - 描述文字
 * @param {string|number} config.badge - 徽章数字或文字
 * @param {string} config.badgeType - 徽章类型 (primary/success/warning/danger)
 * @param {string} config.color - 卡片颜色 (primary/success/warning/danger/info/secondary)
 * @param {boolean} config.disabled - 是否禁用
 */
function functionCard(config = {}) {
  return {
    title: config.title || '功能卡片',
    icon: config.icon || 'bi-grid',
    link: config.link || '#',
    description: config.description || '',
    badge: config.badge || null,
    badgeType: config.badgeType || 'danger',
    color: config.color || 'primary',
    disabled: config.disabled || false,
    loading: false,

    // 初始化
    init() {
      console.log(`[FunctionCard] 初始化: ${this.title}`)
    },

    // 点击处理
    handleClick(event) {
      if (this.disabled || this.loading) {
        event.preventDefault()
        return
      }

      if (this.link && this.link !== '#') {
        window.location.href = this.link
      }
    },

    // 获取卡片样式类
    get cardClass() {
      const classes = ['card', 'h-100', 'border-0', 'shadow-sm', 'function-card']

      if (this.disabled) {
        classes.push('opacity-50')
      } else {
        classes.push('card-hover')
      }

      return classes.join(' ')
    },

    // 获取图标样式类
    get iconClass() {
      return `bi ${this.icon} fs-1 text-${this.color}`
    },

    // 获取徽章样式类
    get badgeClass() {
      return `badge bg-${this.badgeType} rounded-pill`
    },

    // 是否显示徽章
    get showBadge() {
      return this.badge !== null && this.badge !== undefined && this.badge !== 0
    }
  }
}

/**
 * Function Card Grid 卡片网格组件
 * 用于批量渲染功能卡片
 * @param {Object} config - 配置选项
 * @param {Array} config.cards - 卡片配置数组
 * @param {number} config.columns - 列数 (默认 4)
 */
function functionCardGrid(config = {}) {
  return {
    cards: config.cards || [],
    columns: config.columns || 4,
    loading: false,

    // 初始化
    init() {
      console.log(`[FunctionCardGrid] 初始化: ${this.cards.length} 个卡片`)
    },

    // 获取列样式类
    get colClass() {
      const colMap = {
        2: 'col-md-6',
        3: 'col-md-4',
        4: 'col-md-3',
        6: 'col-md-2'
      }
      return colMap[this.columns] || 'col-md-3'
    },

    // 设置卡片列表
    setCards(cards) {
      this.cards = cards || []
    },

    // 添加卡片
    addCard(card) {
      this.cards.push(card)
    },

    // 移除卡片
    removeCard(index) {
      this.cards.splice(index, 1)
    },

    // 过滤卡片
    filterCards(keyword) {
      if (!keyword) return this.cards
      const lowerKeyword = keyword.toLowerCase()
      return this.cards.filter(
        card =>
          card.title.toLowerCase().includes(lowerKeyword) ||
          (card.description && card.description.toLowerCase().includes(lowerKeyword))
      )
    }
  }
}

/**
 * 快捷功能卡片组件（简化版）
 * 用于简单的图标 + 文字 + 链接场景
 */
function quickCard(config = {}) {
  return {
    text: config.text || '功能',
    icon: config.icon || 'bi-grid',
    href: config.href || '#',
    variant: config.variant || 'outline-primary',
    size: config.size || '',

    get buttonClass() {
      const classes = ['btn', `btn-${this.variant}`, 'w-100']
      if (this.size) {
        classes.push(`btn-${this.size}`)
      }
      return classes.join(' ')
    }
  }
}

/**
 * 统计卡片组件（带数值和趋势）
 */
function statFunctionCard(config = {}) {
  return {
    ...functionCard(config),

    value: config.value || 0,
    unit: config.unit || '',
    trend: config.trend || null, // 'up', 'down', 'flat'
    trendValue: config.trendValue || '',
    loading: false,

    // 设置数值
    setValue(value, trend = null, trendValue = '') {
      this.value = value
      this.trend = trend
      this.trendValue = trendValue
    },

    // 获取趋势图标
    get trendIcon() {
      if (this.trend === 'up') return 'bi-arrow-up'
      if (this.trend === 'down') return 'bi-arrow-down'
      return 'bi-dash'
    },

    // 获取趋势颜色
    get trendClass() {
      if (this.trend === 'up') return 'text-success'
      if (this.trend === 'down') return 'text-danger'
      return 'text-muted'
    },

    // 格式化数值
    get formattedValue() {
      if (typeof this.value === 'number') {
        return this.value.toLocaleString('zh-CN')
      }
      return this.value
    }
  }
}

// 添加卡片悬停样式
if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.textContent = `
    .function-card {
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      cursor: pointer;
    }
    .function-card.card-hover:hover {
      transform: translateY(-4px);
      box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15) !important;
    }
    .function-card.card-hover:active {
      transform: translateY(-2px);
    }
  `
  document.head.appendChild(style)
}

console.log('📦 FunctionCard 组件已加载')
