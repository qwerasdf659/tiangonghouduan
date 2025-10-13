/**
 * 数据库版本管理文件
 *
 * 用途：记录数据库版本信息和迁移历史
 *
 * ⚠️ 重要说明:
 * 1. 此文件由 create-migration.js 自动更新
 * 2. 请勿手动修改 lastMigration 和 lastUpdated
 * 3. 如需手动修改，请确保理解影响
 *
 * 创建时间：2025年10月12日
 */

module.exports = {
  // ==================== 版本信息 ====================

  // 当前版本
  current: 'V1.0.0-clean-start',

  // 基准版本（重构起点）
  baseline: '20251013100000-baseline-v1.0.0-clean-start.js',

  // 最后更新时间（自动更新）
  lastUpdated: '2025-10-13 15:08:00',

  // 最后一次迁移文件（自动更新）
  lastMigration: '20251013100000-baseline-v1.0.0-clean-start.js',

  // 表数量
  tableCount: 21, // 21个业务表（基于实际models/目录）

  // ==================== 历史记录 ====================

  history: {
    // V1.0.0 - 基准版本（完全重构）
    'V1.0.0': {
      createdAt: '2025-10-12',
      description: '完全重构：从40个混乱迁移重建为1个清晰基准',
      migrations: 1,
      tables: 21, // 21个业务表
      changes: [
        '清理40个历史迁移文件',
        '创建21个表的基准迁移（7个业务系统）',
        '统一命名规范',
        '重置SequelizeMeta表',
        '建立版本管理机制'
      ]
    }

    // 未来版本会自动追加到这里
    // 'V1.0.1': { ... }
    // 'V1.1.0': { ... }
  },

  // ==================== 表清单 ====================

  tables: {
    // 用户认证系统 (4个表)
    users: { version: 'V1.0.0', description: '用户基础信息表' },
    roles: { version: 'V1.0.0', description: '角色表（UUID角色系统）' },
    user_roles: { version: 'V1.0.0', description: '用户角色关联表' },
    user_sessions: { version: 'V1.0.0', description: '用户登录会话表' },

    // 积分系统 (3个表)
    user_points_accounts: { version: 'V1.0.0', description: '用户积分账户表' },
    points_transactions: { version: 'V1.0.0', description: '积分交易流水表' },
    exchange_records: { version: 'V1.0.0', description: '积分兑换记录表' },

    // 抽奖系统 (4个表)
    lottery_campaigns: { version: 'V1.0.0', description: '抽奖活动表' },
    lottery_prizes: { version: 'V1.0.0', description: '奖品配置表' },
    lottery_draws: { version: 'V1.0.0', description: '抽奖记录表（含中奖）' },
    lottery_presets: { version: 'V1.0.0', description: '抽奖活动预设模板表' },

    // 商品交易系统 (3个表)
    products: { version: 'V1.0.0', description: '商品管理表' },
    trade_records: { version: 'V1.0.0', description: '交易记录表' },
    user_inventory: { version: 'V1.0.0', description: '用户库存表' },

    // 客服系统 (3个表)
    customer_sessions: { version: 'V1.0.0', description: '客服会话表' },
    chat_messages: { version: 'V1.0.0', description: '聊天消息表' },
    feedbacks: { version: 'V1.0.0', description: '用户反馈表' },

    // 审计系统 (2个表)
    audit_logs: { version: 'V1.0.0', description: '操作审计日志表' },
    audit_records: { version: 'V1.0.0', description: '内容审核记录表' },

    // 系统管理 (2个表)
    system_announcements: { version: 'V1.0.0', description: '系统公告表' },
    image_resources: { version: 'V1.0.0', description: '图片资源表' }
  },

  // ==================== 命名规范 ====================

  namingStandard: {
    // 迁移文件命名格式
    migrationFormat: '{YYYYMMDD}{HHMMSS}-{action}-{target}.js',

    // 允许的Action类型
    allowedActions: [
      'create-table', 'alter-table', 'drop-table', 'rename-table',
      'add-column', 'alter-column', 'drop-column', 'rename-column',
      'create-index', 'alter-index', 'drop-index',
      'add-constraint', 'drop-constraint',
      'migrate-data', 'seed-data',
      'baseline'
    ],

    // 示例
    examples: [
      '20251012120000-create-table-users.js',
      '20251012130000-add-column-users-vip-level.js',
      '20251012140000-create-index-users-mobile.js',
      '20251012150000-migrate-data-merge-user-roles.js'
    ]
  },

  // ==================== 自验证方法 ====================

  validate: function () {
    const errors = []

    // 验证基本字段存在
    if (!this.current) errors.push('缺少 current 字段')
    if (!this.baseline) errors.push('缺少 baseline 字段')
    if (!this.lastUpdated) errors.push('缺少 lastUpdated 字段')
    if (!this.tableCount) errors.push('缺少 tableCount 字段')

    // 验证表数量一致性
    const actualTableCount = Object.keys(this.tables).length
    if (actualTableCount !== this.tableCount) {
      errors.push(`表数量不一致: tableCount=${this.tableCount}, 实际=${actualTableCount}`)
    }

    // 验证历史记录
    if (!this.history['V1.0.0']) {
      errors.push('缺少 V1.0.0 基准版本历史记录')
    }

    if (errors.length > 0) {
      throw new Error('VERSION.js 验证失败:\n  ' + errors.join('\n  '))
    }

    return true
  },

  // ==================== 版本对比方法 ====================

  compareVersion: function (v1, v2) {
    // 比较两个版本号大小
    // 返回: 1 (v1>v2), 0 (v1=v2), -1 (v1<v2)
    const parts1 = v1.replace('V', '').split('.').map(Number)
    const parts2 = v2.replace('V', '').split('.').map(Number)

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0
      const p2 = parts2[i] || 0

      if (p1 > p2) return 1
      if (p1 < p2) return -1
    }

    return 0
  },

  // ==================== 信息获取方法 ====================

  getInfo: function () {
    return {
      version: this.current,
      tableCount: this.tableCount,
      lastUpdated: this.lastUpdated,
      lastMigration: this.lastMigration,
      totalVersions: Object.keys(this.history).length
    }
  }
}
