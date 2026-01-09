/**
 * PageConfigRegistry - 页面配置注册中心
 * @description 统一管理所有后台页面的配置，支持模块化和子页面导航
 * @version 2.0.0
 * @created 2026-01-09
 *
 * 设计原则：
 * - 以后端数据库/API为核心权威
 * - 配置驱动，减少代码重复
 * - 支持模块分组和子页面切换
 */

const PageConfigRegistry = {
  // ========================================
  // 模块分组定义
  // ========================================
  modules: {
    // 资产/材料管理模块
    assets: {
      id: 'assets',
      name: '资产管理',
      icon: '💎',
      iconClass: 'bi-gem',
      description: '管理材料、钻石、用户资产等',
      subPages: [
        'material-types',
        'material-balances',
        'material-transactions',
        'diamond-accounts',
        'assets-portfolio'
      ]
    },

    // 市场/交易管理模块
    market: {
      id: 'market',
      name: '市场管理',
      icon: '🏪',
      iconClass: 'bi-shop',
      description: '管理兑换市场、交易订单等',
      subPages: [
        'exchange-items',
        'exchange-orders',
        'exchange-stats',
        'trade-orders',
        'marketplace-stats'
      ]
    },

    // 用户管理模块
    users: {
      id: 'users',
      name: '用户管理',
      icon: '👥',
      iconClass: 'bi-people',
      description: '管理用户、权限、层级等',
      subPages: ['user-list', 'user-hierarchy', 'merchant-points']
    },

    // 系统配置模块
    system: {
      id: 'system',
      name: '系统配置',
      icon: '⚙️',
      iconClass: 'bi-gear',
      description: '管理公告、通知、弹窗等',
      subPages: ['announcements', 'notifications', 'popup-banners', 'image-resources']
    }
  },

  // ========================================
  // 资产/材料管理 - 页面配置
  // ========================================
  'material-types': {
    moduleId: 'assets',
    pageId: 'material-types',
    title: '材料资产类型',
    subtitle: '配置系统中的材料类型（碎片/水晶）',
    icon: 'bi-gem',
    emoji: '💎',
    apiEndpoint: '/api/v4/console/material/asset-types',
    primaryKey: 'asset_code',

    stats: [
      { key: 'total', label: '资产类型总数', color: 'primary', compute: data => data.length },
      {
        key: 'enabled',
        label: '已启用',
        color: 'success',
        compute: data => data.filter(d => d.is_enabled).length
      },
      {
        key: 'disabled',
        label: '已禁用',
        color: 'warning',
        compute: data => data.filter(d => !d.is_enabled).length
      },
      {
        key: 'groups',
        label: '材料组数量',
        color: 'info',
        compute: data => new Set(data.map(d => d.group_code)).size
      }
    ],

    filters: [
      {
        key: 'group_code',
        label: '材料组',
        type: 'select',
        col: 3,
        options: [
          { value: '', label: '全部分组' },
          { value: 'red', label: '红色系' },
          { value: 'orange', label: '橙色系' },
          { value: 'purple', label: '紫色系' }
        ]
      },
      {
        key: 'is_enabled',
        label: '状态',
        type: 'select',
        col: 3,
        options: [
          { value: '', label: '全部状态' },
          { value: 'true', label: '已启用' },
          { value: 'false', label: '已禁用' }
        ]
      }
    ],

    columns: [
      { key: 'asset_code', label: '资产代码', type: 'code' },
      { key: 'display_name', label: '显示名称' },
      {
        key: 'group_code',
        label: '材料组',
        type: 'badge',
        badgeMap: { red: 'danger', orange: 'warning', purple: 'info' }
      },
      {
        key: 'form',
        label: '形态',
        type: 'badge',
        labelMap: { shard: '碎片', crystal: '水晶' },
        badgeMap: { shard: 'secondary', crystal: 'primary' }
      },
      { key: 'tier', label: '层级' },
      { key: 'visible_value_points', label: '可见价值', type: 'currency', color: 'success' },
      { key: 'budget_value_points', label: '预算价值', type: 'currency', color: 'warning' },
      { key: 'sort_order', label: '排序' },
      { key: 'is_enabled', label: '状态', type: 'status' }
    ],

    actions: [
      {
        key: 'edit',
        label: '编辑',
        icon: 'bi-pencil',
        type: 'outline-primary',
        onClick: 'openEditModal'
      },
      {
        key: 'toggle',
        label: row => (row.is_enabled ? '禁用' : '启用'),
        icon: row => (row.is_enabled ? 'bi-x-circle' : 'bi-check-circle'),
        type: row => (row.is_enabled ? 'outline-warning' : 'outline-success'),
        onClick: 'toggleStatus'
      }
    ],

    headerActions: [
      {
        id: 'addBtn',
        label: '添加资产类型',
        icon: 'bi-plus-lg',
        type: 'primary',
        modal: 'addModal'
      }
    ],

    modals: {
      addModal: {
        title: '添加资产类型',
        icon: 'bi-plus-circle',
        formId: 'addForm',
        submitBtn: 'submitAddBtn',
        method: 'POST',
        successMessage: '资产类型添加成功',
        fields: [
          {
            id: 'assetCode',
            key: 'asset_code',
            label: '资产代码',
            type: 'text',
            required: true,
            placeholder: '如: red_shard',
            hint: '唯一标识，使用小写字母和下划线',
            col: 6
          },
          {
            id: 'displayName',
            key: 'display_name',
            label: '显示名称',
            type: 'text',
            required: true,
            placeholder: '如: 碎红水晶',
            col: 6
          },
          {
            id: 'groupCode',
            key: 'group_code',
            label: '材料组',
            type: 'text',
            required: true,
            placeholder: '如: red',
            col: 4
          },
          {
            id: 'form',
            key: 'form',
            label: '形态',
            type: 'select',
            required: true,
            col: 4,
            options: [
              { value: '', label: '请选择' },
              { value: 'shard', label: '碎片（shard）' },
              { value: 'crystal', label: '水晶（crystal）' }
            ]
          },
          {
            id: 'tier',
            key: 'tier',
            label: '层级',
            type: 'number',
            required: true,
            min: 1,
            col: 4
          },
          {
            id: 'visibleValue',
            key: 'visible_value_points',
            label: '可见价值（积分）',
            type: 'number',
            required: true,
            min: 0,
            col: 6
          },
          {
            id: 'budgetValue',
            key: 'budget_value_points',
            label: '预算价值（积分）',
            type: 'number',
            required: true,
            min: 0,
            col: 6
          },
          {
            id: 'sortOrder',
            key: 'sort_order',
            label: '排序权重',
            type: 'number',
            default: 0,
            col: 6
          },
          {
            id: 'isEnabled',
            key: 'is_enabled',
            label: '启用状态',
            type: 'select',
            col: 6,
            options: [
              { value: '1', label: '启用' },
              { value: '0', label: '禁用' }
            ]
          }
        ]
      },
      editModal: {
        title: '编辑资产类型',
        icon: 'bi-pencil',
        formId: 'editForm',
        submitBtn: 'submitEditBtn',
        method: 'PUT',
        url: data => `/api/v4/console/material/asset-types/${data.asset_code}`,
        successMessage: '资产类型更新成功',
        fields: [
          {
            id: 'editAssetCode',
            key: 'asset_code',
            label: '资产代码',
            type: 'text',
            disabled: true,
            col: 12
          },
          {
            id: 'editDisplayName',
            key: 'display_name',
            label: '显示名称',
            type: 'text',
            required: true,
            col: 6
          },
          {
            id: 'editGroupCode',
            key: 'group_code',
            label: '材料组',
            type: 'text',
            disabled: true,
            col: 6
          },
          { id: 'editForm', key: 'form', label: '形态', type: 'text', disabled: true, col: 4 },
          { id: 'editTier', key: 'tier', label: '层级', type: 'number', disabled: true, col: 4 },
          { id: 'editSortOrder', key: 'sort_order', label: '排序权重', type: 'number', col: 4 },
          {
            id: 'editVisibleValue',
            key: 'visible_value_points',
            label: '可见价值',
            type: 'number',
            required: true,
            col: 6
          },
          {
            id: 'editBudgetValue',
            key: 'budget_value_points',
            label: '预算价值',
            type: 'number',
            required: true,
            col: 6
          },
          {
            id: 'editIsEnabled',
            key: 'is_enabled',
            label: '状态',
            type: 'select',
            col: 12,
            options: [
              { value: '1', label: '启用' },
              { value: '0', label: '禁用' }
            ]
          }
        ]
      }
    }
  },

  'material-balances': {
    moduleId: 'assets',
    pageId: 'material-balances',
    title: '用户材料余额',
    subtitle: '查询和调整用户的材料资产余额',
    icon: 'bi-wallet2',
    emoji: '💰',
    apiEndpoint: '/api/v4/console/material/users',
    primaryKey: 'user_id',
    customLayout: 'user-search-first', // 特殊布局：先搜索用户

    filters: [
      { key: 'user_id', label: '用户ID', type: 'number', placeholder: '输入用户ID', col: 4 },
      { key: 'mobile', label: '手机号', type: 'text', placeholder: '输入手机号', col: 4 }
    ],

    columns: [
      { key: 'asset_code', label: '资产代码', type: 'code' },
      { key: 'display_name', label: '资产名称' },
      { key: 'group_code', label: '材料组', type: 'badge' },
      { key: 'form', label: '形态', type: 'badge', labelMap: { shard: '碎片', crystal: '水晶' } },
      { key: 'balance', label: '当前余额', type: 'currency', color: 'success' },
      { key: 'visible_value', label: '可见价值', type: 'currency' },
      { key: 'updated_at', label: '更新时间', type: 'datetime' }
    ],

    actions: [
      {
        key: 'adjust',
        label: '调整',
        icon: 'bi-plus-slash-minus',
        type: 'outline-success',
        onClick: 'openAdjustModal'
      }
    ],

    headerActions: [
      {
        id: 'adjustBtn',
        label: '调整余额',
        icon: 'bi-wallet2',
        type: 'success',
        modal: 'adjustModal'
      }
    ],

    modals: {
      adjustModal: {
        title: '调整用户材料余额',
        icon: 'bi-wallet2',
        formId: 'adjustForm',
        submitBtn: 'submitAdjustBtn',
        method: 'POST',
        url: data => `/api/v4/console/material/users/${data.user_id}/adjust`,
        successMessage: '余额调整成功',
        fields: [
          {
            id: 'adjustAssetCode',
            key: 'asset_code',
            label: '资产类型',
            type: 'select',
            required: true,
            dynamicOptions: 'assetTypes',
            col: 12
          },
          {
            id: 'adjustType',
            key: 'type',
            label: '调整类型',
            type: 'select',
            required: true,
            col: 6,
            options: [
              { value: 'increase', label: '增加' },
              { value: 'decrease', label: '减少' }
            ]
          },
          {
            id: 'adjustAmount',
            key: 'amount',
            label: '调整数量',
            type: 'number',
            required: true,
            min: 1,
            col: 6
          },
          {
            id: 'adjustReason',
            key: 'reason',
            label: '调整原因',
            type: 'textarea',
            required: true,
            rows: 3,
            col: 12
          }
        ]
      }
    }
  },

  'material-transactions': {
    moduleId: 'assets',
    pageId: 'material-transactions',
    title: '材料流水查询',
    subtitle: '查看材料资产的变动记录',
    icon: 'bi-list-ul',
    emoji: '📋',
    apiEndpoint: '/api/v4/console/material/transactions',
    primaryKey: 'transaction_id',
    pagination: true,
    pageSize: 20,

    stats: [
      { key: 'total', label: '流水总数', color: 'primary', field: 'pagination.total_count' },
      {
        key: 'increase',
        label: '增加记录',
        color: 'success',
        compute: data => data.filter(d => d.amount > 0).length
      },
      {
        key: 'decrease',
        label: '减少记录',
        color: 'danger',
        compute: data => data.filter(d => d.amount < 0).length
      }
    ],

    filters: [
      { key: 'user_id', label: '用户ID', type: 'number', placeholder: '输入用户ID', col: 2 },
      {
        key: 'asset_code',
        label: '资产类型',
        type: 'select',
        col: 2,
        dynamicOptions: 'assetTypes'
      },
      {
        key: 'type',
        label: '变动类型',
        type: 'select',
        col: 2,
        options: [
          { value: '', label: '全部类型' },
          { value: 'lottery_reward', label: '抽奖奖励' },
          { value: 'exchange', label: '兑换' },
          { value: 'admin_adjust', label: '管理调整' },
          { value: 'convert', label: '转换' }
        ]
      },
      { key: 'start_time', label: '开始时间', type: 'datetime-local', col: 3 },
      { key: 'end_time', label: '结束时间', type: 'datetime-local', col: 3 }
    ],

    columns: [
      { key: 'transaction_id', label: '流水ID', type: 'code' },
      { key: 'user_id', label: '用户ID' },
      { key: 'asset_code', label: '资产类型', type: 'code' },
      { key: 'type', label: '变动类型', type: 'badge' },
      {
        key: 'amount',
        label: '变动数量',
        render: v =>
          `<span class="text-${v > 0 ? 'success' : 'danger'}">${v > 0 ? '+' : ''}${v}</span>`
      },
      { key: 'balance_after', label: '变动后余额' },
      { key: 'remark', label: '备注' },
      { key: 'created_at', label: '时间', type: 'datetime' }
    ],

    actions: [
      { key: 'detail', label: '详情', icon: 'bi-eye', type: 'outline-info', onClick: 'showDetail' }
    ]
  },

  'diamond-accounts': {
    moduleId: 'assets',
    pageId: 'diamond-accounts',
    title: '钻石账户管理',
    subtitle: '查询和管理用户钻石账户',
    icon: 'bi-diamond',
    emoji: '💠',
    apiEndpoint: '/api/v4/console/diamond/users',
    primaryKey: 'user_id',
    customLayout: 'user-search-first',

    filters: [
      { key: 'user_id', label: '用户ID', type: 'number', placeholder: '输入用户ID', col: 4 },
      { key: 'mobile', label: '手机号', type: 'text', placeholder: '输入手机号', col: 4 }
    ],

    columns: [
      { key: 'user_id', label: '用户ID' },
      { key: 'nickname', label: '昵称' },
      { key: 'mobile', label: '手机号' },
      { key: 'diamond_balance', label: '钻石余额', type: 'currency', color: 'info' },
      { key: 'total_earned', label: '累计获得', type: 'currency', color: 'success' },
      { key: 'total_spent', label: '累计消费', type: 'currency', color: 'warning' },
      { key: 'updated_at', label: '更新时间', type: 'datetime' }
    ],

    actions: [
      {
        key: 'adjust',
        label: '调整',
        icon: 'bi-plus-slash-minus',
        type: 'outline-success',
        onClick: 'openAdjustModal'
      },
      {
        key: 'history',
        label: '流水',
        icon: 'bi-clock-history',
        type: 'outline-info',
        onClick: 'viewHistory'
      }
    ],

    headerActions: [
      { id: 'adjustBtn', label: '调整钻石', icon: 'bi-diamond', type: 'info', modal: 'adjustModal' }
    ],

    modals: {
      adjustModal: {
        title: '调整用户钻石',
        icon: 'bi-diamond',
        formId: 'adjustForm',
        submitBtn: 'submitAdjustBtn',
        method: 'POST',
        url: data => `/api/v4/console/diamond/users/${data.user_id}/adjust`,
        successMessage: '钻石调整成功',
        fields: [
          {
            id: 'adjustType',
            key: 'type',
            label: '调整类型',
            type: 'select',
            required: true,
            col: 6,
            options: [
              { value: 'increase', label: '增加' },
              { value: 'decrease', label: '减少' }
            ]
          },
          {
            id: 'adjustAmount',
            key: 'amount',
            label: '调整数量',
            type: 'number',
            required: true,
            min: 1,
            col: 6
          },
          {
            id: 'adjustReason',
            key: 'reason',
            label: '调整原因',
            type: 'textarea',
            required: true,
            rows: 3,
            col: 12
          }
        ]
      }
    }
  },

  'assets-portfolio': {
    moduleId: 'assets',
    pageId: 'assets-portfolio',
    title: '资产组合总览',
    subtitle: '查看系统物品库存和资产统计',
    icon: 'bi-collection',
    emoji: '📦',
    apiEndpoint: '/api/v4/console/assets/portfolio',
    primaryKey: 'item_id',
    pagination: true,
    pageSize: 20,

    stats: [
      { key: 'total_items', label: '物品总数', color: 'primary', field: 'summary.total_items' },
      { key: 'available', label: '可用物品', color: 'success', field: 'summary.available_count' },
      { key: 'reserved', label: '已预留', color: 'warning', field: 'summary.reserved_count' },
      { key: 'total_value', label: '总价值', color: 'info', field: 'summary.total_value' }
    ],

    filters: [
      {
        key: 'status',
        label: '状态',
        type: 'select',
        col: 3,
        options: [
          { value: '', label: '全部状态' },
          { value: 'available', label: '可用' },
          { value: 'reserved', label: '已预留' },
          { value: 'sold', label: '已售出' }
        ]
      },
      { key: 'category', label: '分类', type: 'select', col: 3, dynamicOptions: 'categories' },
      { key: 'search', label: '搜索', type: 'text', placeholder: '物品名称/编号', col: 3 }
    ],

    columns: [
      { key: 'item_id', label: '物品ID', type: 'code' },
      { key: 'name', label: '物品名称' },
      { key: 'category', label: '分类', type: 'badge' },
      { key: 'quantity', label: '数量' },
      { key: 'unit_value', label: '单价', type: 'currency' },
      { key: 'total_value', label: '总价值', type: 'currency', color: 'success' },
      { key: 'status', label: '状态', type: 'status' },
      { key: 'created_at', label: '入库时间', type: 'datetime' }
    ],

    actions: [
      { key: 'detail', label: '详情', icon: 'bi-eye', type: 'outline-info', onClick: 'showDetail' },
      {
        key: 'events',
        label: '事件',
        icon: 'bi-clock-history',
        type: 'outline-secondary',
        onClick: 'viewEvents'
      }
    ]
  },

  // ========================================
  // 市场/交易管理 - 页面配置
  // ========================================
  'exchange-items': {
    moduleId: 'market',
    pageId: 'exchange-items',
    title: '兑换市场商品',
    subtitle: '管理兑换市场的商品配置',
    icon: 'bi-box-seam',
    emoji: '📦',
    apiEndpoint: '/api/v4/console/marketplace/exchange-items',
    primaryKey: 'item_id',
    pagination: true,

    stats: [
      { key: 'total', label: '商品总数', color: 'primary', field: 'pagination.total_count' },
      {
        key: 'active',
        label: '上架中',
        color: 'success',
        compute: data => data.filter(d => d.is_active).length
      },
      {
        key: 'soldout',
        label: '已售罄',
        color: 'warning',
        compute: data => data.filter(d => d.stock === 0).length
      },
      {
        key: 'inactive',
        label: '已下架',
        color: 'secondary',
        compute: data => data.filter(d => !d.is_active).length
      }
    ],

    filters: [
      {
        key: 'category',
        label: '分类',
        type: 'select',
        col: 3,
        dynamicOptions: 'exchangeCategories'
      },
      {
        key: 'is_active',
        label: '状态',
        type: 'select',
        col: 3,
        options: [
          { value: '', label: '全部状态' },
          { value: 'true', label: '上架中' },
          { value: 'false', label: '已下架' }
        ]
      },
      { key: 'search', label: '搜索', type: 'text', placeholder: '商品名称', col: 3 }
    ],

    columns: [
      { key: 'item_id', label: '商品ID', type: 'code' },
      { key: 'name', label: '商品名称' },
      { key: 'image_url', label: '图片', type: 'image' },
      { key: 'category', label: '分类', type: 'badge' },
      { key: 'price', label: '兑换价格', type: 'currency', color: 'primary' },
      { key: 'stock', label: '库存' },
      { key: 'exchange_count', label: '已兑换' },
      {
        key: 'is_active',
        label: '状态',
        type: 'status',
        statusMap: {
          true: { class: 'success', label: '上架' },
          false: { class: 'secondary', label: '下架' }
        }
      },
      { key: 'created_at', label: '创建时间', type: 'datetime' }
    ],

    actions: [
      {
        key: 'edit',
        label: '编辑',
        icon: 'bi-pencil',
        type: 'outline-primary',
        onClick: 'openEditModal'
      },
      {
        key: 'toggle',
        label: row => (row.is_active ? '下架' : '上架'),
        icon: row => (row.is_active ? 'bi-x-circle' : 'bi-check-circle'),
        type: row => (row.is_active ? 'outline-warning' : 'outline-success'),
        onClick: 'toggleStatus'
      }
    ],

    headerActions: [
      { id: 'addBtn', label: '添加商品', icon: 'bi-plus-lg', type: 'primary', modal: 'addModal' }
    ]
  },

  'exchange-orders': {
    moduleId: 'market',
    pageId: 'exchange-orders',
    title: '兑换订单管理',
    subtitle: '管理用户的兑换订单',
    icon: 'bi-receipt',
    emoji: '📋',
    apiEndpoint: '/api/v4/console/marketplace/exchange-orders',
    primaryKey: 'order_no',
    pagination: true,
    pageSize: 20,

    stats: [
      { key: 'total', label: '订单总数', color: 'primary', field: 'pagination.total_count' },
      { key: 'pending', label: '待处理', color: 'warning', field: 'stats.pending' },
      { key: 'shipped', label: '已发货', color: 'success', field: 'stats.shipped' },
      { key: 'cancelled', label: '已取消', color: 'secondary', field: 'stats.cancelled' }
    ],

    filters: [
      {
        key: 'status',
        label: '订单状态',
        type: 'select',
        col: 3,
        options: [
          { value: '', label: '全部状态' },
          { value: 'pending', label: '待处理' },
          { value: 'completed', label: '已完成' },
          { value: 'shipped', label: '已发货' },
          { value: 'cancelled', label: '已取消' }
        ]
      },
      { key: 'order_no', label: '订单号', type: 'text', placeholder: '输入订单号', col: 3 },
      { key: 'user_id', label: '用户ID', type: 'number', placeholder: '输入用户ID', col: 3 }
    ],

    columns: [
      { key: 'order_no', label: '订单号', type: 'code' },
      { key: 'user_id', label: '用户ID' },
      { key: 'item_name', label: '商品名称' },
      { key: 'quantity', label: '数量' },
      {
        key: 'payment_type',
        label: '支付方式',
        type: 'badge',
        labelMap: { virtual: '虚拟价值', points: '积分' }
      },
      { key: 'total_paid', label: '支付金额', type: 'currency', color: 'primary' },
      {
        key: 'status',
        label: '状态',
        type: 'status',
        statusMap: {
          pending: { class: 'warning', label: '待处理' },
          completed: { class: 'info', label: '已完成' },
          shipped: { class: 'success', label: '已发货' },
          cancelled: { class: 'secondary', label: '已取消' }
        }
      },
      { key: 'created_at', label: '下单时间', type: 'datetime' }
    ],

    actions: [
      { key: 'detail', label: '详情', icon: 'bi-eye', type: 'outline-info', onClick: 'showDetail' },
      {
        key: 'updateStatus',
        label: '处理',
        icon: 'bi-arrow-repeat',
        type: 'outline-primary',
        onClick: 'openStatusModal',
        visible: row => row.status === 'pending'
      }
    ]
  },

  'exchange-stats': {
    moduleId: 'market',
    pageId: 'exchange-stats',
    title: '兑换市场统计',
    subtitle: '查看兑换市场的数据统计',
    icon: 'bi-bar-chart',
    emoji: '📊',
    apiEndpoint: '/api/v4/console/marketplace/exchange-stats',
    customLayout: 'stats-dashboard',

    stats: [
      { key: 'total_orders', label: '订单总数', color: 'primary', field: 'total_orders' },
      { key: 'total_revenue', label: '总营收', color: 'success', field: 'total_revenue' },
      { key: 'avg_order_value', label: '平均客单价', color: 'info', field: 'avg_order_value' },
      { key: 'conversion_rate', label: '转化率', color: 'warning', field: 'conversion_rate' }
    ],

    filters: [
      {
        key: 'period',
        label: '时间范围',
        type: 'select',
        col: 3,
        options: [
          { value: '7d', label: '最近7天' },
          { value: '30d', label: '最近30天' },
          { value: '90d', label: '最近90天' }
        ]
      },
      {
        key: 'group_by',
        label: '分组方式',
        type: 'select',
        col: 3,
        options: [
          { value: 'day', label: '按天' },
          { value: 'week', label: '按周' },
          { value: 'month', label: '按月' }
        ]
      }
    ]
  },

  'trade-orders': {
    moduleId: 'market',
    pageId: 'trade-orders',
    title: '交易订单管理',
    subtitle: '管理用户之间的交易订单',
    icon: 'bi-arrow-left-right',
    emoji: '🔄',
    apiEndpoint: '/api/v4/console/marketplace/trade-orders',
    primaryKey: 'order_id',
    pagination: true,
    pageSize: 20,

    stats: [
      { key: 'total', label: '交易总数', color: 'primary', field: 'pagination.total_count' },
      { key: 'pending', label: '进行中', color: 'warning', field: 'stats.pending' },
      { key: 'completed', label: '已完成', color: 'success', field: 'stats.completed' },
      { key: 'disputed', label: '有争议', color: 'danger', field: 'stats.disputed' }
    ],

    filters: [
      {
        key: 'status',
        label: '交易状态',
        type: 'select',
        col: 3,
        options: [
          { value: '', label: '全部状态' },
          { value: 'pending', label: '进行中' },
          { value: 'completed', label: '已完成' },
          { value: 'cancelled', label: '已取消' },
          { value: 'disputed', label: '有争议' }
        ]
      },
      { key: 'order_id', label: '交易ID', type: 'text', placeholder: '输入交易ID', col: 3 }
    ],

    columns: [
      { key: 'order_id', label: '交易ID', type: 'code' },
      { key: 'seller_id', label: '卖家ID' },
      { key: 'buyer_id', label: '买家ID' },
      { key: 'item_name', label: '商品' },
      { key: 'price', label: '价格', type: 'currency', color: 'primary' },
      { key: 'status', label: '状态', type: 'status' },
      { key: 'created_at', label: '创建时间', type: 'datetime' }
    ],

    actions: [
      { key: 'detail', label: '详情', icon: 'bi-eye', type: 'outline-info', onClick: 'showDetail' },
      {
        key: 'resolve',
        label: '仲裁',
        icon: 'bi-shield-check',
        type: 'outline-warning',
        onClick: 'openResolveModal',
        visible: row => row.status === 'disputed'
      }
    ]
  },

  'marketplace-stats': {
    moduleId: 'market',
    pageId: 'marketplace-stats',
    title: '市场综合统计',
    subtitle: '查看市场挂牌和交易的综合统计',
    icon: 'bi-graph-up',
    emoji: '📈',
    apiEndpoint: '/api/v4/console/marketplace/listing-stats',
    customLayout: 'stats-dashboard',

    stats: [
      { key: 'active_listings', label: '活跃挂牌', color: 'success', field: 'active_listings' },
      { key: 'total_volume', label: '交易总额', color: 'primary', field: 'total_volume' },
      { key: 'daily_trades', label: '今日成交', color: 'info', field: 'daily_trades' },
      { key: 'avg_price', label: '平均价格', color: 'warning', field: 'avg_price' }
    ]
  },

  // ========================================
  // 用户管理 - 页面配置
  // ========================================
  'user-list': {
    moduleId: 'users',
    pageId: 'user-list',
    title: '用户列表',
    subtitle: '管理系统用户',
    icon: 'bi-people',
    emoji: '👥',
    apiEndpoint: '/api/v4/console/user-management/users',
    primaryKey: 'user_id',
    pagination: true,
    pageSize: 20,

    stats: [
      { key: 'total', label: '用户总数', color: 'primary', field: 'pagination.total_count' },
      { key: 'active', label: '活跃用户', color: 'success', field: 'stats.active' },
      { key: 'new_today', label: '今日新增', color: 'info', field: 'stats.new_today' },
      { key: 'vip', label: 'VIP用户', color: 'warning', field: 'stats.vip' }
    ],

    filters: [
      {
        key: 'status',
        label: '状态',
        type: 'select',
        col: 2,
        options: [
          { value: '', label: '全部状态' },
          { value: 'active', label: '正常' },
          { value: 'banned', label: '封禁' }
        ]
      },
      {
        key: 'role',
        label: '角色',
        type: 'select',
        col: 2,
        options: [
          { value: '', label: '全部角色' },
          { value: 'user', label: '普通用户' },
          { value: 'vip', label: 'VIP用户' },
          { value: 'merchant', label: '商户' }
        ]
      },
      { key: 'search', label: '搜索', type: 'text', placeholder: '用户ID/手机号/昵称', col: 4 }
    ],

    columns: [
      { key: 'user_id', label: '用户ID' },
      { key: 'nickname', label: '昵称' },
      { key: 'mobile', label: '手机号' },
      { key: 'role', label: '角色', type: 'badge' },
      { key: 'points', label: '积分', type: 'currency', color: 'warning' },
      { key: 'status', label: '状态', type: 'status' },
      { key: 'created_at', label: '注册时间', type: 'datetime' },
      { key: 'last_login', label: '最后登录', type: 'datetime' }
    ],

    actions: [
      { key: 'detail', label: '详情', icon: 'bi-eye', type: 'outline-info', onClick: 'showDetail' },
      {
        key: 'edit',
        label: '编辑',
        icon: 'bi-pencil',
        type: 'outline-primary',
        onClick: 'openEditModal'
      },
      {
        key: 'ban',
        label: row => (row.status === 'active' ? '封禁' : '解封'),
        icon: row => (row.status === 'active' ? 'bi-lock' : 'bi-unlock'),
        type: row => (row.status === 'active' ? 'outline-danger' : 'outline-success'),
        onClick: 'toggleBan'
      }
    ]
  },

  'user-hierarchy': {
    moduleId: 'users',
    pageId: 'user-hierarchy',
    title: '用户层级管理',
    subtitle: '管理业务员、门店等层级关系',
    icon: 'bi-diagram-3',
    emoji: '🏢',
    apiEndpoint: '/api/v4/console/user-hierarchy',
    primaryKey: 'user_id',
    pagination: true,

    stats: [
      { key: 'total', label: '层级用户总数', color: 'primary', field: 'pagination.total_count' },
      { key: 'managers', label: '区域负责人', color: 'danger', field: 'stats.managers' },
      { key: 'supervisors', label: '业务经理', color: 'warning', field: 'stats.supervisors' },
      { key: 'agents', label: '业务员', color: 'info', field: 'stats.agents' }
    ],

    filters: [
      {
        key: 'role',
        label: '角色',
        type: 'select',
        col: 3,
        options: [
          { value: '', label: '全部角色' },
          { value: 'regional_manager', label: '区域负责人' },
          { value: 'business_manager', label: '业务经理' },
          { value: 'sales_agent', label: '业务员' }
        ]
      },
      {
        key: 'status',
        label: '状态',
        type: 'select',
        col: 3,
        options: [
          { value: '', label: '全部状态' },
          { value: 'active', label: '已激活' },
          { value: 'inactive', label: '未激活' }
        ]
      },
      { key: 'search', label: '搜索', type: 'text', placeholder: '用户ID/姓名', col: 3 }
    ],

    columns: [
      { key: 'user_id', label: '用户ID' },
      { key: 'name', label: '姓名' },
      {
        key: 'role',
        label: '角色',
        type: 'badge',
        badgeMap: {
          regional_manager: 'danger',
          business_manager: 'warning',
          sales_agent: 'info'
        },
        labelMap: {
          regional_manager: '区域负责人',
          business_manager: '业务经理',
          sales_agent: '业务员'
        }
      },
      { key: 'parent_name', label: '上级' },
      { key: 'subordinate_count', label: '下级数量' },
      { key: 'total_performance', label: '累计业绩', type: 'currency', color: 'success' },
      { key: 'status', label: '状态', type: 'status' }
    ],

    actions: [
      {
        key: 'subordinates',
        label: '下级',
        icon: 'bi-people',
        type: 'outline-info',
        onClick: 'viewSubordinates'
      },
      {
        key: 'stats',
        label: '统计',
        icon: 'bi-bar-chart',
        type: 'outline-primary',
        onClick: 'viewStats'
      },
      {
        key: 'toggle',
        label: row => (row.status === 'active' ? '停用' : '激活'),
        icon: row => (row.status === 'active' ? 'bi-pause' : 'bi-play'),
        type: row => (row.status === 'active' ? 'outline-warning' : 'outline-success'),
        onClick: 'toggleStatus'
      }
    ]
  },

  'merchant-points': {
    moduleId: 'users',
    pageId: 'merchant-points',
    title: '商户积分审核',
    subtitle: '审核商户提交的积分申请',
    icon: 'bi-clipboard-check',
    emoji: '✅',
    apiEndpoint: '/api/v4/console/merchant-points',
    primaryKey: 'audit_id',
    pagination: true,

    stats: [
      { key: 'total', label: '申请总数', color: 'primary', field: 'pagination.total_count' },
      { key: 'pending', label: '待审核', color: 'warning', field: 'stats.pending' },
      { key: 'approved', label: '已通过', color: 'success', field: 'stats.approved' },
      { key: 'rejected', label: '已拒绝', color: 'danger', field: 'stats.rejected' }
    ],

    filters: [
      {
        key: 'status',
        label: '审核状态',
        type: 'select',
        col: 3,
        options: [
          { value: '', label: '全部状态' },
          { value: 'pending', label: '待审核' },
          { value: 'approved', label: '已通过' },
          { value: 'rejected', label: '已拒绝' }
        ]
      },
      { key: 'merchant_id', label: '商户ID', type: 'number', placeholder: '输入商户ID', col: 3 }
    ],

    columns: [
      { key: 'audit_id', label: '审核ID', type: 'code' },
      { key: 'merchant_id', label: '商户ID' },
      { key: 'merchant_name', label: '商户名称' },
      { key: 'points_amount', label: '申请积分', type: 'currency', color: 'warning' },
      { key: 'reason', label: '申请原因' },
      {
        key: 'status',
        label: '状态',
        type: 'status',
        statusMap: {
          pending: { class: 'warning', label: '待审核' },
          approved: { class: 'success', label: '已通过' },
          rejected: { class: 'danger', label: '已拒绝' }
        }
      },
      { key: 'created_at', label: '申请时间', type: 'datetime' }
    ],

    actions: [
      { key: 'detail', label: '详情', icon: 'bi-eye', type: 'outline-info', onClick: 'showDetail' },
      {
        key: 'approve',
        label: '通过',
        icon: 'bi-check-lg',
        type: 'outline-success',
        onClick: 'approveAudit',
        visible: row => row.status === 'pending'
      },
      {
        key: 'reject',
        label: '拒绝',
        icon: 'bi-x-lg',
        type: 'outline-danger',
        onClick: 'rejectAudit',
        visible: row => row.status === 'pending'
      }
    ]
  },

  // ========================================
  // 系统配置 - 页面配置
  // ========================================
  announcements: {
    moduleId: 'system',
    pageId: 'announcements',
    title: '公告管理',
    subtitle: '管理系统公告',
    icon: 'bi-megaphone',
    emoji: '📢',
    apiEndpoint: '/api/v4/console/system/announcements',
    primaryKey: 'announcement_id',
    pagination: true,

    stats: [
      { key: 'total', label: '公告总数', color: 'primary', field: 'pagination.total_count' },
      {
        key: 'active',
        label: '生效中',
        color: 'success',
        compute: data => data.filter(d => d.is_active).length
      },
      {
        key: 'scheduled',
        label: '待生效',
        color: 'warning',
        compute: data => data.filter(d => d.status === 'scheduled').length
      }
    ],

    filters: [
      {
        key: 'status',
        label: '状态',
        type: 'select',
        col: 3,
        options: [
          { value: '', label: '全部状态' },
          { value: 'active', label: '生效中' },
          { value: 'scheduled', label: '待生效' },
          { value: 'expired', label: '已过期' }
        ]
      },
      {
        key: 'type',
        label: '类型',
        type: 'select',
        col: 3,
        options: [
          { value: '', label: '全部类型' },
          { value: 'system', label: '系统公告' },
          { value: 'activity', label: '活动公告' },
          { value: 'maintenance', label: '维护公告' }
        ]
      }
    ],

    columns: [
      { key: 'announcement_id', label: '公告ID', type: 'code' },
      { key: 'title', label: '标题' },
      { key: 'type', label: '类型', type: 'badge' },
      { key: 'priority', label: '优先级' },
      { key: 'is_active', label: '状态', type: 'status' },
      { key: 'start_time', label: '开始时间', type: 'datetime' },
      { key: 'end_time', label: '结束时间', type: 'datetime' },
      { key: 'created_at', label: '创建时间', type: 'datetime' }
    ],

    actions: [
      {
        key: 'edit',
        label: '编辑',
        icon: 'bi-pencil',
        type: 'outline-primary',
        onClick: 'openEditModal'
      },
      {
        key: 'toggle',
        label: row => (row.is_active ? '下线' : '上线'),
        icon: row => (row.is_active ? 'bi-x-circle' : 'bi-check-circle'),
        type: row => (row.is_active ? 'outline-warning' : 'outline-success'),
        onClick: 'toggleStatus'
      },
      {
        key: 'delete',
        label: '删除',
        icon: 'bi-trash',
        type: 'outline-danger',
        onClick: 'deleteItem'
      }
    ],

    headerActions: [
      { id: 'addBtn', label: '添加公告', icon: 'bi-plus-lg', type: 'primary', modal: 'addModal' }
    ]
  },

  notifications: {
    moduleId: 'system',
    pageId: 'notifications',
    title: '通知管理',
    subtitle: '管理系统推送通知',
    icon: 'bi-bell',
    emoji: '🔔',
    apiEndpoint: '/api/v4/console/system/notifications',
    primaryKey: 'notification_id',
    pagination: true,

    stats: [
      { key: 'total', label: '通知总数', color: 'primary', field: 'pagination.total_count' },
      { key: 'sent', label: '已发送', color: 'success', field: 'stats.sent' },
      { key: 'pending', label: '待发送', color: 'warning', field: 'stats.pending' }
    ],

    filters: [
      {
        key: 'status',
        label: '状态',
        type: 'select',
        col: 3,
        options: [
          { value: '', label: '全部状态' },
          { value: 'sent', label: '已发送' },
          { value: 'pending', label: '待发送' },
          { value: 'failed', label: '发送失败' }
        ]
      },
      {
        key: 'type',
        label: '类型',
        type: 'select',
        col: 3,
        options: [
          { value: '', label: '全部类型' },
          { value: 'system', label: '系统通知' },
          { value: 'personal', label: '个人通知' },
          { value: 'broadcast', label: '广播通知' }
        ]
      }
    ],

    columns: [
      { key: 'notification_id', label: '通知ID', type: 'code' },
      { key: 'title', label: '标题' },
      { key: 'type', label: '类型', type: 'badge' },
      { key: 'target_count', label: '目标用户数' },
      { key: 'sent_count', label: '已送达' },
      { key: 'status', label: '状态', type: 'status' },
      { key: 'scheduled_at', label: '计划时间', type: 'datetime' },
      { key: 'sent_at', label: '发送时间', type: 'datetime' }
    ],

    actions: [
      { key: 'detail', label: '详情', icon: 'bi-eye', type: 'outline-info', onClick: 'showDetail' },
      {
        key: 'resend',
        label: '重发',
        icon: 'bi-arrow-repeat',
        type: 'outline-warning',
        onClick: 'resendNotification',
        visible: row => row.status === 'failed'
      }
    ],

    headerActions: [
      { id: 'addBtn', label: '发送通知', icon: 'bi-send', type: 'primary', modal: 'addModal' }
    ]
  },

  'popup-banners': {
    moduleId: 'system',
    pageId: 'popup-banners',
    title: '弹窗横幅管理',
    subtitle: '管理首页弹窗和横幅图片',
    icon: 'bi-image',
    emoji: '🖼️',
    apiEndpoint: '/api/v4/console/popup-banners',
    primaryKey: 'banner_id',

    stats: [
      { key: 'total', label: '横幅总数', color: 'primary', compute: data => data.length },
      {
        key: 'active',
        label: '展示中',
        color: 'success',
        compute: data => data.filter(d => d.is_enabled).length
      },
      {
        key: 'scheduled',
        label: '待展示',
        color: 'warning',
        compute: data =>
          data.filter(d => !d.is_enabled && new Date(d.start_time) > new Date()).length
      }
    ],

    filters: [
      {
        key: 'is_enabled',
        label: '状态',
        type: 'select',
        col: 3,
        options: [
          { value: '', label: '全部状态' },
          { value: 'true', label: '展示中' },
          { value: 'false', label: '未展示' }
        ]
      },
      {
        key: 'position',
        label: '位置',
        type: 'select',
        col: 3,
        options: [
          { value: '', label: '全部位置' },
          { value: 'popup', label: '弹窗' },
          { value: 'banner', label: '横幅' }
        ]
      }
    ],

    columns: [
      { key: 'banner_id', label: 'ID', type: 'code' },
      { key: 'title', label: '标题' },
      { key: 'image_url', label: '图片', type: 'image' },
      {
        key: 'position',
        label: '位置',
        type: 'badge',
        labelMap: { popup: '弹窗', banner: '横幅' }
      },
      { key: 'sort_order', label: '排序' },
      { key: 'is_enabled', label: '状态', type: 'status' },
      { key: 'start_time', label: '开始时间', type: 'datetime' },
      { key: 'end_time', label: '结束时间', type: 'datetime' }
    ],

    actions: [
      {
        key: 'edit',
        label: '编辑',
        icon: 'bi-pencil',
        type: 'outline-primary',
        onClick: 'openEditModal'
      },
      {
        key: 'toggle',
        label: row => (row.is_enabled ? '禁用' : '启用'),
        icon: row => (row.is_enabled ? 'bi-x-circle' : 'bi-check-circle'),
        type: row => (row.is_enabled ? 'outline-warning' : 'outline-success'),
        onClick: 'toggleStatus'
      },
      {
        key: 'delete',
        label: '删除',
        icon: 'bi-trash',
        type: 'outline-danger',
        onClick: 'deleteItem'
      }
    ],

    headerActions: [
      { id: 'addBtn', label: '添加横幅', icon: 'bi-plus-lg', type: 'primary', modal: 'addModal' }
    ]
  },

  'image-resources': {
    moduleId: 'system',
    pageId: 'image-resources',
    title: '图片资源管理',
    subtitle: '管理系统上传的图片资源',
    icon: 'bi-images',
    emoji: '🖼️',
    apiEndpoint: '/api/v4/console/images',
    primaryKey: 'image_id',
    pagination: true,

    stats: [
      { key: 'total', label: '图片总数', color: 'primary', field: 'pagination.total_count' },
      { key: 'lottery', label: '抽奖图片', color: 'info', field: 'stats.lottery' },
      { key: 'exchange', label: '兑换图片', color: 'warning', field: 'stats.exchange' },
      { key: 'trade', label: '交易图片', color: 'success', field: 'stats.trade' }
    ],

    filters: [
      {
        key: 'business_type',
        label: '业务类型',
        type: 'select',
        col: 3,
        options: [
          { value: '', label: '全部类型' },
          { value: 'lottery', label: '抽奖' },
          { value: 'exchange', label: '兑换' },
          { value: 'trade', label: '交易' },
          { value: 'uploads', label: '上传' }
        ]
      },
      {
        key: 'is_bound',
        label: '绑定状态',
        type: 'select',
        col: 3,
        options: [
          { value: '', label: '全部状态' },
          { value: 'true', label: '已绑定' },
          { value: 'false', label: '未绑定' }
        ]
      }
    ],

    columns: [
      { key: 'image_id', label: '图片ID', type: 'code' },
      { key: 'url', label: '预览', type: 'image' },
      { key: 'business_type', label: '业务类型', type: 'badge' },
      {
        key: 'file_size',
        label: '文件大小',
        render: v => (v ? `${(v / 1024).toFixed(1)} KB` : '-')
      },
      {
        key: 'is_bound',
        label: '绑定状态',
        type: 'status',
        statusMap: {
          true: { class: 'success', label: '已绑定' },
          false: { class: 'secondary', label: '未绑定' }
        }
      },
      { key: 'created_at', label: '上传时间', type: 'datetime' }
    ],

    actions: [
      {
        key: 'copy',
        label: '复制URL',
        icon: 'bi-clipboard',
        type: 'outline-info',
        onClick: 'copyUrl'
      },
      {
        key: 'delete',
        label: '删除',
        icon: 'bi-trash',
        type: 'outline-danger',
        onClick: 'deleteItem',
        visible: row => !row.is_bound
      }
    ],

    headerActions: [
      {
        id: 'uploadBtn',
        label: '上传图片',
        icon: 'bi-upload',
        type: 'primary',
        onClick: 'openUploadModal'
      }
    ]
  },

  // ========================================
  // 工具方法
  // ========================================

  /**
   * 获取页面配置
   * @param {string} pageId - 页面ID
   * @returns {Object} 页面配置
   */
  getPageConfig(pageId) {
    return this[pageId] || null
  },

  /**
   * 获取模块配置
   * @param {string} moduleId - 模块ID
   * @returns {Object} 模块配置
   */
  getModuleConfig(moduleId) {
    return this.modules[moduleId] || null
  },

  /**
   * 获取模块的所有子页面
   * @param {string} moduleId - 模块ID
   * @returns {Array} 子页面配置数组
   */
  getModulePages(moduleId) {
    const module = this.modules[moduleId]
    if (!module) return []

    return module.subPages
      .map(pageId => ({
        ...this[pageId],
        pageId
      }))
      .filter(Boolean)
  },

  /**
   * 根据URL参数获取当前页面配置
   * @returns {Object} 当前页面配置
   */
  getCurrentPageConfig() {
    const params = new URLSearchParams(window.location.search)
    const pageId = params.get('page') || params.get('p')
    return this.getPageConfig(pageId)
  }
}

// 导出到全局
window.PageConfigRegistry = PageConfigRegistry
