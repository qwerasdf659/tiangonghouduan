/**
 * 页面配置注册中心
 * @description 统一管理所有管理后台页面的配置
 * @version 1.0.0
 * @created 2026-01-09
 *
 * 支持的页面类型：
 * 1. 资产/材料管理类 - material-asset-types, material-balances, material-transactions, diamond-accounts, assets-portfolio
 * 2. 市场/交易管理类 - exchange-market-items, exchange-market-orders, exchange-market-stats, trade-orders, marketplace-stats
 * 3. 用户/权限管理类 - users, user-hierarchy, merchant-points
 * 4. 配置/系统管理类 - announcements, notifications, popup-banners, image-resources
 */

// 页面配置注册表
const PAGE_CONFIGS = {
  // ==========================================
  // 📦 资产/材料管理类
  // ==========================================

  /**
   * 材料资产类型管理
   */
  'material-asset-types': {
    pageId: 'material-asset-types',
    title: '材料资产类型管理',
    subtitle: '配置系统中的材料类型（碎片/水晶）',
    icon: 'bi-gem',
    emoji: '💎',
    apiEndpoint: API_ENDPOINTS.MATERIAL.ASSET_TYPES,
    primaryKey: 'asset_code',
    pagination: false,

    headerActions: [
      {
        label: '添加资产类型',
        icon: 'bi-plus-lg',
        type: 'primary',
        modal: 'addAssetTypeModal'
      }
    ],

    stats: [
      { key: 'total', label: '资产类型总数', color: 'primary', compute: data => data.length },
      {
        key: 'enabled',
        label: '已启用',
        color: 'success',
        compute: data => data.filter(a => a.is_enabled).length
      },
      {
        key: 'disabled',
        label: '已禁用',
        color: 'warning',
        compute: data => data.filter(a => !a.is_enabled).length
      },
      {
        key: 'groups',
        label: '材料组数量',
        color: 'info',
        compute: data => new Set(data.map(a => a.group_code)).size
      }
    ],

    columns: [
      { key: 'asset_code', label: '资产代码', type: 'code' },
      { key: 'display_name', label: '显示名称', render: v => `<strong>${v}</strong>` },
      { key: 'group_code', label: '材料组', type: 'badge', badgeMap: { '*': 'info' } },
      {
        key: 'form',
        label: '形态',
        type: 'badge',
        badgeMap: { shard: 'warning', crystal: 'primary' },
        labelMap: { shard: '碎片', crystal: '水晶' }
      },
      {
        key: 'tier',
        label: '层级',
        render: v => `<span class="badge bg-secondary">Tier ${v}</span>`
      },
      { key: 'visible_value_points', label: '可见价值', type: 'currency', color: 'primary' },
      { key: 'budget_value_points', label: '预算价值', type: 'currency', color: 'success' },
      { key: 'sort_order', label: '排序' },
      { key: 'is_enabled', label: '状态', type: 'status' }
    ],

    actions: [
      {
        key: 'edit',
        label: '编辑',
        icon: 'bi-pencil',
        type: 'primary',
        onClick: function (row) {
          this.editAssetType(row)
        }
      },
      {
        key: 'toggle',
        label: row => (row.is_enabled ? '禁用' : '启用'),
        icon: row => (row.is_enabled ? 'bi-pause-circle' : 'bi-play-circle'),
        type: row => (row.is_enabled ? 'warning' : 'success'),
        onClick: function (row) {
          this.toggleStatus(row)
        }
      }
    ],

    modals: {
      addAssetTypeModal: {
        formId: 'addAssetTypeForm',
        submitBtn: 'submitAddBtn',
        method: 'POST',
        successMessage: '添加成功',
        fields: [
          { id: 'assetCode', key: 'asset_code' },
          { id: 'displayName', key: 'display_name' },
          { id: 'groupCode', key: 'group_code' },
          { id: 'form', key: 'form' },
          { id: 'tier', key: 'tier', type: 'integer' },
          { id: 'visibleValue', key: 'visible_value_points', type: 'integer' },
          { id: 'budgetValue', key: 'budget_value_points', type: 'integer' },
          { id: 'sortOrder', key: 'sort_order', type: 'integer' },
          { id: 'isEnabled', key: 'is_enabled', type: 'integer' }
        ]
      },
      editAssetTypeModal: {
        formId: 'editAssetTypeForm',
        submitBtn: 'submitEditBtn',
        method: 'PUT',
        url: function (data) {
          return API.buildURL(API_ENDPOINTS.MATERIAL.ASSET_TYPE_DETAIL, { asset_code: data._assetCode })
        },
        successMessage: '更新成功',
        fields: [
          { id: 'editDisplayName', key: 'display_name' },
          { id: 'editVisibleValue', key: 'visible_value_points', type: 'integer' },
          { id: 'editBudgetValue', key: 'budget_value_points', type: 'integer' },
          { id: 'editSortOrder', key: 'sort_order', type: 'integer' },
          { id: 'editIsEnabled', key: 'is_enabled', type: 'integer' }
        ]
      }
    },

    // 自定义方法
    customMethods: {
      editAssetType: function (row) {
        document.getElementById('editAssetCode').value = row.asset_code
        document.getElementById('editAssetCodeDisplay').value = row.asset_code
        document.getElementById('editDisplayName').value = row.display_name
        document.getElementById('editGroupCode').value = row.group_code
        document.getElementById('editForm').value = row.form === 'shard' ? '碎片' : '水晶'
        document.getElementById('editTier').value = row.tier
        document.getElementById('editSortOrder').value = row.sort_order
        document.getElementById('editVisibleValue').value = row.visible_value_points
        document.getElementById('editBudgetValue').value = row.budget_value_points
        document.getElementById('editIsEnabled').value = row.is_enabled ? '1' : '0'
        this.openModal('editAssetTypeModal')
      },
      toggleStatus: async function (row) {
        const newStatus = row.is_enabled ? 0 : 1
        const action = newStatus ? '启用' : '禁用'

        if (!confirm(`确定要${action}该资产类型吗？`)) return

        try {
          const response = await apiRequest(
            API.buildURL(API_ENDPOINTS.MATERIAL.ASSET_TYPE_DETAIL, { asset_code: row.asset_code }),
            {
              method: 'PUT',
              body: JSON.stringify({ is_enabled: newStatus })
            }
          )

          if (response?.success) {
            this.showSuccess(`${action}成功`)
            this.loadData()
          } else {
            this.showError(response?.message || `${action}失败`)
          }
        } catch (error) {
          this.showError(error.message)
        }
      }
    },

    // 提交前处理
    beforeSubmit: function (modalId, data) {
      if (modalId === 'editAssetTypeModal') {
        data._assetCode = document.getElementById('editAssetCode').value
      }
      return data
    }
  },

  /**
   * 用户材料余额查询
   */
  'material-balances': {
    pageId: 'material-balances',
    title: '用户材料余额查询',
    subtitle: '查询和管理用户的材料/资产余额',
    icon: 'bi-wallet2',
    emoji: '💰',
    apiEndpoint: API_ENDPOINTS.ASSET_ADJUSTMENT.USER_BALANCES,
    apiPathParams: ['user_id'], // 标记需要路径参数
    primaryKey: 'user_id',
    pagination: false,

    headerActions: [],

    stats: [],

    filters: [
      { key: 'user_id', label: '用户ID', type: 'number', placeholder: '输入用户ID', col: 4 },
      { key: 'mobile', label: '手机号', type: 'text', placeholder: '输入手机号', col: 4 }
    ],

    columns: [
      { key: 'asset_code', label: '资产代码', type: 'code' },
      { key: 'display_name', label: '资产名称' },
      { key: 'group_code', label: '材料组', type: 'badge' },
      { key: 'form', label: '形态', render: v => (v === 'shard' ? '碎片' : '水晶') },
      { key: 'balance', label: '当前余额', type: 'currency', color: 'success' },
      { key: 'visible_value', label: '可见价值', type: 'currency', color: 'primary' }
    ],

    actions: [
      {
        key: 'adjust',
        label: '调整',
        icon: 'bi-plus-slash-minus',
        type: 'success',
        onClick: function (row) {
          this.openAdjustModal(row)
        }
      }
    ],

    modals: {
      adjustBalanceModal: {
        formId: 'adjustBalanceForm',
        submitBtn: 'submitAdjustBtn',
        method: 'POST',
        url: API_ENDPOINTS.ASSET_ADJUSTMENT.ADJUST,
        successMessage: '调整成功',
        fields: [
          { id: 'adjustUserId', key: 'user_id', type: 'integer' },
          { id: 'adjustAssetCode', key: 'asset_code' },
          { id: 'adjustAmount', key: 'amount', type: 'integer' },
          { id: 'adjustReason', key: 'reason' }
        ]
      }
    },

    customMethods: {
      openAdjustModal: function (row) {
        document.getElementById('adjustUserId').value = this.currentUserId || ''
        document.getElementById('adjustAssetCode').value = row.asset_code
        document.getElementById('adjustAmount').value = ''
        document.getElementById('adjustReason').value = ''
        this.openModal('adjustBalanceModal')
      }
    }
  },

  /**
   * 材料流水查询
   */
  'material-transactions': {
    pageId: 'material-transactions',
    title: '材料流水查询',
    subtitle: '查询材料/资产的交易记录',
    icon: 'bi-list-ul',
    emoji: '📋',
    apiEndpoint: API_ENDPOINTS.MATERIAL.TRANSACTIONS,
    primaryKey: 'transaction_id',
    pagination: true,
    pageSize: 20,

    stats: [
      { key: 'total', label: '查询结果数', color: 'primary', field: 'pagination.total' },
      {
        key: 'increase',
        label: '增加笔数',
        color: 'success',
        compute: data => data.filter(t => t.tx_type === 'increase').length
      },
      {
        key: 'decrease',
        label: '减少笔数',
        color: 'danger',
        compute: data => data.filter(t => t.tx_type === 'decrease').length
      }
    ],

    filters: [
      { key: 'user_id', label: '用户ID', type: 'number', placeholder: '输入用户ID', col: 2 },
      { key: 'business_id', label: '业务ID', type: 'text', placeholder: '输入业务ID', col: 2 },
      {
        key: 'asset_code',
        label: '资产类型',
        type: 'select',
        col: 2,
        options: [
          { value: '', label: '全部' }
          // 动态加载
        ]
      },
      {
        key: 'tx_type',
        label: '交易类型',
        type: 'select',
        col: 2,
        options: [
          { value: '', label: '全部' },
          { value: 'increase', label: '增加' },
          { value: 'decrease', label: '减少' }
        ]
      },
      { key: 'start_time', label: '开始时间', type: 'datetime-local', col: 2 },
      { key: 'end_time', label: '结束时间', type: 'datetime-local', col: 2 }
    ],

    columns: [
      { key: 'transaction_id', label: '流水ID', type: 'code', width: '100px' },
      { key: 'user_id', label: '用户ID' },
      { key: 'asset_code', label: '资产类型', type: 'badge' },
      {
        key: 'tx_type',
        label: '类型',
        render: v =>
          v === 'increase'
            ? '<span class="text-success fw-bold">+增加</span>'
            : '<span class="text-danger fw-bold">-减少</span>'
      },
      {
        key: 'amount',
        label: '变动数量',
        render: (v, row) =>
          `<span class="${row.tx_type === 'increase' ? 'text-success' : 'text-danger'} fw-bold">${row.tx_type === 'increase' ? '+' : '-'}${v}</span>`
      },
      { key: 'balance_after', label: '变动后余额', type: 'currency', color: 'info' },
      { key: 'business_type', label: '业务类型' },
      { key: 'created_at', label: '时间', type: 'datetime' }
    ],

    actions: [
      {
        key: 'detail',
        label: '详情',
        icon: 'bi-eye',
        type: 'outline-info',
        onClick: function (row) {
          alert(`业务ID: ${row.business_id}\n备注: ${row.remark || '无'}`)
        }
      }
    ]
  },

  /**
   * 钻石账户管理
   */
  'diamond-accounts': {
    pageId: 'diamond-accounts',
    title: '钻石账户管理',
    subtitle: '查询和管理用户的钻石/积分账户',
    icon: 'bi-gem',
    emoji: '💎',
    apiEndpoint: API_ENDPOINTS.DIAMOND_ACCOUNTS.ACCOUNTS,
    primaryKey: 'user_id',
    pagination: false,

    stats: [],

    filters: [
      { key: 'user_id', label: '用户ID', type: 'number', placeholder: '输入用户ID', col: 4 },
      { key: 'mobile', label: '手机号', type: 'text', placeholder: '输入手机号', col: 4 }
    ],

    columns: [
      { key: 'user_id', label: '用户ID' },
      { key: 'nickname', label: '昵称' },
      { key: 'diamond_balance', label: '钻石余额', type: 'currency', color: 'info' },
      { key: 'total_earned', label: '累计获得', type: 'currency', color: 'success' },
      { key: 'total_spent', label: '累计消费', type: 'currency', color: 'danger' },
      { key: 'updated_at', label: '更新时间', type: 'datetime' }
    ],

    actions: [
      {
        key: 'adjust',
        label: '调整余额',
        icon: 'bi-wallet2',
        type: 'success',
        onClick: function (row) {
          this.openModal('adjustBalanceModal', {
            adjustUserId: row.user_id,
            adjustUserName: row.nickname
          })
        }
      },
      {
        key: 'history',
        label: '流水',
        icon: 'bi-clock-history',
        type: 'outline-info',
        onClick: function (row) {
          window.location.href = `/admin/material-transactions.html?user_id=${row.user_id}`
        }
      }
    ],

    modals: {
      adjustBalanceModal: {
        formId: 'adjustBalanceForm',
        submitBtn: 'submitAdjustBtn',
        method: 'POST',
        url: API_ENDPOINTS.ASSET_ADJUSTMENT.ADJUST,
        successMessage: '调整成功',
        fields: [
          { id: 'adjustUserId', key: 'user_id', type: 'integer' },
          { id: 'adjustAmount', key: 'amount', type: 'integer' },
          { id: 'adjustAssetCode', key: 'asset_code', defaultValue: 'DIAMOND' },
          { id: 'adjustReason', key: 'reason' }
        ]
      }
    }
  },

  // ==========================================
  // 🛒 市场/交易管理类
  // ==========================================

  /**
   * 兑换市场商品管理
   */
  'exchange-market-items': {
    pageId: 'exchange-market-items',
    title: '兑换市场商品管理',
    subtitle: '管理用户可兑换的官方商品',
    icon: 'bi-shop',
    emoji: '🛒',
    apiEndpoint: API_ENDPOINTS.MARKETPLACE.EXCHANGE_ITEMS,
    primaryKey: 'item_id',
    pagination: true,
    pageSize: 20,

    headerActions: [
      {
        label: '添加商品',
        icon: 'bi-plus-lg',
        type: 'primary',
        modal: 'addItemModal'
      }
    ],

    stats: [
      { key: 'total', label: '商品总数', color: 'primary', field: 'pagination.total' },
      {
        key: 'active',
        label: '上架商品',
        color: 'success',
        compute: data => data.filter(i => i.status === 'active').length
      },
      {
        key: 'lowStock',
        label: '库存预警',
        color: 'warning',
        compute: data => data.filter(i => i.stock < 10).length
      },
      {
        key: 'exchanges',
        label: '总兑换次数',
        color: 'info',
        compute: data => data.reduce((sum, i) => sum + (i.exchange_count || 0), 0)
      }
    ],

    filters: [
      {
        key: 'status',
        label: '状态筛选',
        type: 'select',
        col: 3,
        options: [
          { value: '', label: '全部状态' },
          { value: 'active', label: '上架' },
          { value: 'inactive', label: '下架' }
        ]
      },
      {
        key: 'category',
        label: '商品分类',
        type: 'select',
        col: 3,
        options: [{ value: '', label: '全部分类' }]
      },
      { key: 'keyword', label: '搜索', type: 'text', placeholder: '商品名称', col: 3 }
    ],

    columns: [
      { key: 'item_id', label: 'ID', width: '60px' },
      {
        key: 'name',
        label: '商品名称',
        render: (v, row) => `
        <div class="d-flex align-items-center">
          ${row.image ? `<img src="${row.image}" class="me-2 rounded" style="width:40px;height:40px;object-fit:cover;">` : ''}
          <div>
            <strong>${v}</strong>
            <br><small class="text-muted">${row.description || ''}</small>
          </div>
        </div>
      `
      },
      {
        key: 'price',
        label: '兑换价格',
        render: (v, row) => `<span class="badge bg-info">${v} ${row.price_unit || '积分'}</span>`
      },
      {
        key: 'stock',
        label: '库存',
        render: v => {
          const color = v === 0 ? 'danger' : v < 10 ? 'warning' : 'success'
          return `<span class="text-${color} fw-bold">${v}</span>`
        }
      },
      { key: 'exchange_count', label: '已兑换' },
      {
        key: 'status',
        label: '状态',
        type: 'status',
        statusMap: {
          active: { class: 'success', label: '上架' },
          inactive: { class: 'secondary', label: '下架' }
        }
      },
      { key: 'created_at', label: '创建时间', type: 'datetime' }
    ],

    actions: [
      {
        key: 'edit',
        label: '编辑',
        icon: 'bi-pencil',
        type: 'primary',
        onClick: function (row) {
          this.editItem(row)
        }
      },
      {
        key: 'toggle',
        label: row => (row.status === 'active' ? '下架' : '上架'),
        icon: row => (row.status === 'active' ? 'bi-toggle-off' : 'bi-toggle-on'),
        type: row => (row.status === 'active' ? 'warning' : 'success'),
        onClick: function (row) {
          this.toggleItemStatus(row)
        }
      }
    ],

    modals: {
      addItemModal: {
        formId: 'addItemForm',
        submitBtn: 'submitAddBtn',
        method: 'POST',
        successMessage: '添加成功',
        fields: [
          { id: 'itemName', key: 'name' },
          { id: 'itemDescription', key: 'description' },
          { id: 'itemPrice', key: 'price', type: 'integer' },
          { id: 'itemPriceUnit', key: 'price_unit' },
          { id: 'itemStock', key: 'stock', type: 'integer' },
          { id: 'itemImage', key: 'image' },
          { id: 'itemStatus', key: 'status' }
        ]
      },
      editItemModal: {
        formId: 'editItemForm',
        submitBtn: 'submitEditBtn',
        method: 'PUT',
        url: function (data) {
          return API.buildURL(API_ENDPOINTS.MARKETPLACE.EXCHANGE_ITEM_DETAIL, { item_id: data._itemId })
        },
        successMessage: '更新成功',
        fields: [
          { id: 'editItemName', key: 'name' },
          { id: 'editItemDescription', key: 'description' },
          { id: 'editItemPrice', key: 'price', type: 'integer' },
          { id: 'editItemStock', key: 'stock', type: 'integer' },
          { id: 'editItemStatus', key: 'status' }
        ]
      }
    },

    customMethods: {
      editItem: function (row) {
        document.getElementById('editItemId').value = row.item_id
        document.getElementById('editItemName').value = row.name
        document.getElementById('editItemDescription').value = row.description || ''
        document.getElementById('editItemPrice').value = row.price
        document.getElementById('editItemStock').value = row.stock
        document.getElementById('editItemStatus').value = row.status
        this.openModal('editItemModal')
      },
      toggleItemStatus: async function (row) {
        const newStatus = row.status === 'active' ? 'inactive' : 'active'
        const action = newStatus === 'active' ? '上架' : '下架'

        if (!confirm(`确定要${action}该商品吗？`)) return

        try {
          const response = await apiRequest(
            API.buildURL(API_ENDPOINTS.MARKETPLACE.EXCHANGE_ITEM_DETAIL, { item_id: row.item_id }),
            {
              method: 'PUT',
              body: JSON.stringify({ status: newStatus })
            }
          )

          if (response?.success) {
            this.showSuccess(`${action}成功`)
            this.loadData()
          } else {
            this.showError(response?.message || `${action}失败`)
          }
        } catch (error) {
          this.showError(error.message)
        }
      }
    },

    beforeSubmit: function (modalId, data) {
      if (modalId === 'editItemModal') {
        data._itemId = document.getElementById('editItemId').value
      }
      return data
    }
  },

  /**
   * 兑换订单管理
   */
  'exchange-market-orders': {
    pageId: 'exchange-market-orders',
    title: '兑换订单管理',
    subtitle: '管理兑换市场的订单',
    icon: 'bi-receipt',
    emoji: '📦',
    apiEndpoint: API_ENDPOINTS.MARKETPLACE.EXCHANGE_ORDERS,
    primaryKey: 'order_no',
    pagination: true,
    pageSize: 20,

    stats: [
      { key: 'total', label: '订单总数', color: 'primary', field: 'pagination.total' },
      {
        key: 'pending',
        label: '待处理',
        color: 'warning',
        border: 'warning',
        compute: data => data.filter(o => o.status === 'pending').length
      },
      {
        key: 'shipped',
        label: '已发货',
        color: 'success',
        border: 'success',
        compute: data => data.filter(o => o.status === 'shipped').length
      },
      {
        key: 'cancelled',
        label: '已取消',
        color: 'secondary',
        border: 'secondary',
        compute: data => data.filter(o => o.status === 'cancelled').length
      }
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
      { key: 'order_no', label: '搜索订单号', type: 'text', placeholder: '输入订单号', col: 3 }
    ],

    columns: [
      { key: 'order_no', label: '订单号', type: 'code' },
      { key: 'user_id', label: '用户', render: v => `ID: ${v}` },
      {
        key: 'item_snapshot.name',
        label: '商品信息',
        render: (v, row) => `
        <div><strong>${row.item_snapshot?.name || '-'}</strong></div>
        <small class="text-muted">${row.item_snapshot?.description || ''}</small>
      `
      },
      { key: 'quantity', label: '数量' },
      {
        key: 'pay_asset_code',
        label: '支付方式',
        render: v => PAGE_CONFIGS._helpers.getAssetTypeText(v)
      },
      {
        key: 'pay_amount',
        label: '支付金额',
        render: (v, row) =>
          `<span class="badge bg-info">${v} ${PAGE_CONFIGS._helpers.getAssetUnit(row.pay_asset_code)}</span>`
      },
      { key: 'status', label: '状态', type: 'status' },
      { key: 'exchange_time', label: '兑换时间', type: 'datetime' }
    ],

    actions: [
      {
        key: 'detail',
        label: '详情',
        icon: 'bi-eye',
        type: 'outline-info',
        onClick: function (row) {
          this.viewOrderDetail(row)
        }
      },
      {
        key: 'update',
        label: '更新',
        icon: 'bi-arrow-repeat',
        type: 'outline-primary',
        visible: row => row.status === 'pending',
        onClick: function (row) {
          this.openModal('updateStatusModal', {
            updateOrderNo: row.order_no
          })
        }
      }
    ],

    modals: {
      orderDetailModal: {},
      updateStatusModal: {
        formId: 'updateStatusForm',
        submitBtn: 'submitUpdateStatusBtn',
        method: 'POST',
        url: function (data) {
          return API.buildURL(API_ENDPOINTS.MARKETPLACE.EXCHANGE_ORDER_STATUS, { order_no: data._orderNo })
        },
        successMessage: '状态更新成功',
        fields: [
          { id: 'newStatus', key: 'status' },
          { id: 'statusRemark', key: 'remark' }
        ]
      }
    },

    customMethods: {
      viewOrderDetail: async function (row) {
        try {
          const response = await apiRequest(
            API.buildURL(API_ENDPOINTS.MARKETPLACE.EXCHANGE_ORDER_DETAIL, { order_no: row.order_no })
          )
          if (response?.success) {
            const order = response.data.order
            document.getElementById('detailOrderNo').textContent = order.order_no
            document.getElementById('detailStatus').innerHTML = this.renderStatusBadge(order.status)
            document.getElementById('detailExchangeTime').textContent = this.formatDateTime(
              order.exchange_time || order.created_at
            )
            document.getElementById('detailUserId').textContent = order.user_id
            document.getElementById('detailItemName').textContent = order.item_snapshot?.name || '-'
            document.getElementById('detailQuantity').textContent = order.quantity
            document.getElementById('detailPaymentType').textContent =
              PAGE_CONFIGS._helpers.getAssetTypeText(order.pay_asset_code)
            document.getElementById('detailVirtualPaid').textContent =
              `${order.pay_amount} ${PAGE_CONFIGS._helpers.getAssetUnit(order.pay_asset_code)}`
            this.openModal('orderDetailModal')
          }
        } catch (error) {
          this.showError('获取订单详情失败')
        }
      }
    },

    beforeSubmit: function (modalId, data) {
      if (modalId === 'updateStatusModal') {
        data._orderNo = document.getElementById('updateOrderNo').value
      }
      return data
    }
  },

  /**
   * 交易订单管理
   */
  'trade-orders': {
    pageId: 'trade-orders',
    title: '交易订单管理',
    subtitle: '管理用户间的交易订单',
    icon: 'bi-arrow-left-right',
    emoji: '🔄',
    apiEndpoint: API_ENDPOINTS.MARKETPLACE.TRADE_ORDERS,
    primaryKey: 'order_no',
    pagination: true,
    pageSize: 20,

    stats: [
      { key: 'total', label: '订单总数', color: 'primary', field: 'pagination.total' },
      {
        key: 'pending',
        label: '进行中',
        color: 'warning',
        compute: data => data.filter(o => o.status === 'pending').length
      },
      {
        key: 'completed',
        label: '已完成',
        color: 'success',
        compute: data => data.filter(o => o.status === 'completed').length
      },
      {
        key: 'cancelled',
        label: '已取消',
        color: 'secondary',
        compute: data => data.filter(o => o.status === 'cancelled').length
      }
    ],

    filters: [
      {
        key: 'status',
        label: '订单状态',
        type: 'select',
        col: 3,
        options: [
          { value: '', label: '全部状态' },
          { value: 'pending', label: '进行中' },
          { value: 'completed', label: '已完成' },
          { value: 'cancelled', label: '已取消' }
        ]
      },
      { key: 'seller_id', label: '卖家ID', type: 'number', placeholder: '输入卖家用户ID', col: 2 },
      { key: 'buyer_id', label: '买家ID', type: 'number', placeholder: '输入买家用户ID', col: 2 },
      { key: 'order_no', label: '订单号', type: 'text', placeholder: '搜索订单号', col: 2 }
    ],

    columns: [
      { key: 'order_no', label: '订单号', type: 'code' },
      { key: 'seller_id', label: '卖家ID' },
      { key: 'buyer_id', label: '买家ID' },
      { key: 'item_name', label: '商品' },
      { key: 'price', label: '价格', type: 'currency', color: 'primary' },
      { key: 'status', label: '状态', type: 'status' },
      { key: 'created_at', label: '创建时间', type: 'datetime' }
    ],

    actions: [
      {
        key: 'detail',
        label: '详情',
        icon: 'bi-eye',
        type: 'outline-info',
        onClick: function (row) {
          alert(
            `订单详情：\n订单号：${row.order_no}\n卖家：${row.seller_id}\n买家：${row.buyer_id}\n价格：${row.price}`
          )
        }
      }
    ]
  },

  // ==========================================
  // 📢 公告/通知管理类
  // ==========================================

  /**
   * 公告管理
   */
  announcements: {
    pageId: 'announcements',
    title: '公告管理',
    subtitle: '管理系统公告和通知',
    icon: 'bi-megaphone',
    emoji: '📢',
    apiEndpoint: API_ENDPOINTS.NOTIFICATION.ANNOUNCEMENTS,
    primaryKey: 'announcement_id',
    pagination: true,
    pageSize: 20,

    headerActions: [
      {
        label: '发布公告',
        icon: 'bi-plus-lg',
        type: 'primary',
        modal: 'addAnnouncementModal'
      }
    ],

    stats: [
      { key: 'total', label: '公告总数', color: 'primary', field: 'pagination.total' },
      {
        key: 'active',
        label: '生效中',
        color: 'success',
        compute: data => data.filter(a => a.status === 'active').length
      },
      {
        key: 'scheduled',
        label: '待发布',
        color: 'warning',
        compute: data => data.filter(a => a.status === 'scheduled').length
      },
      {
        key: 'expired',
        label: '已过期',
        color: 'secondary',
        compute: data => data.filter(a => a.status === 'expired').length
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
          { value: 'scheduled', label: '待发布' },
          { value: 'expired', label: '已过期' }
        ]
      },
      { key: 'keyword', label: '搜索', type: 'text', placeholder: '标题关键词', col: 3 }
    ],

    columns: [
      { key: 'announcement_id', label: 'ID', width: '60px' },
      { key: 'title', label: '标题', render: v => `<strong>${v}</strong>` },
      { key: 'type', label: '类型', type: 'badge' },
      {
        key: 'status',
        label: '状态',
        type: 'status',
        statusMap: {
          active: { class: 'success', label: '生效中' },
          scheduled: { class: 'warning', label: '待发布' },
          expired: { class: 'secondary', label: '已过期' },
          draft: { class: 'info', label: '草稿' }
        }
      },
      { key: 'start_time', label: '开始时间', type: 'datetime' },
      { key: 'end_time', label: '结束时间', type: 'datetime' },
      { key: 'views', label: '查看数' }
    ],

    actions: [
      {
        key: 'edit',
        label: '编辑',
        icon: 'bi-pencil',
        type: 'primary',
        onClick: function (row) {
          this.editAnnouncement(row)
        }
      },
      {
        key: 'delete',
        label: '删除',
        icon: 'bi-trash',
        type: 'danger',
        onClick: function (row) {
          this.deleteAnnouncement(row)
        }
      }
    ],

    modals: {
      addAnnouncementModal: {
        formId: 'addAnnouncementForm',
        submitBtn: 'submitAddAnnouncementBtn',
        method: 'POST',
        successMessage: '发布成功',
        fields: [
          { id: 'announcementTitle', key: 'title' },
          { id: 'announcementContent', key: 'content' },
          { id: 'announcementType', key: 'type' },
          { id: 'announcementStartTime', key: 'start_time' },
          { id: 'announcementEndTime', key: 'end_time' }
        ]
      }
    },

    customMethods: {
      editAnnouncement: function (row) {
        alert('编辑公告: ' + row.title)
      },
      deleteAnnouncement: async function (row) {
        if (!confirm(`确定要删除公告"${row.title}"吗？`)) return

        try {
          const response = await apiRequest(
            API.buildURL(API_ENDPOINTS.ANNOUNCEMENT.DELETE, { id: row.announcement_id }),
            {
              method: 'DELETE'
            }
          )

          if (response?.success) {
            this.showSuccess('删除成功')
            this.loadData()
          } else {
            this.showError(response?.message || '删除失败')
          }
        } catch (error) {
          this.showError(error.message)
        }
      }
    }
  },

  // ==========================================
  // 🔧 辅助函数
  // ==========================================

  _helpers: {
    getAssetTypeText: function (assetCode) {
      const assetMap = {
        points_virtual_value: '虚拟价值',
        points_lottery: '抽奖积分',
        points_consumption: '消费积分',
        coins: '金币',
        red_shard: '红色碎片',
        blue_shard: '蓝色碎片',
        green_shard: '绿色碎片',
        gold_shard: '金色碎片',
        purple_shard: '紫色碎片',
        shard: '碎片',
        crystal: '水晶',
        gem: '宝石',
        ticket: '兑换券'
      }
      return assetMap[assetCode] || assetCode || '未知'
    },
    getAssetUnit: function (assetCode) {
      const unitMap = {
        points_virtual_value: '虚拟值',
        points_lottery: '积分',
        points_consumption: '积分',
        coins: '金币',
        red_shard: '个',
        blue_shard: '个',
        green_shard: '个',
        shard: '个',
        crystal: '个'
      }
      return unitMap[assetCode] || '个'
    }
  }
}

/**
 * 获取页面配置
 * @param {string} pageId - 页面ID
 * @returns {Object} 页面配置对象
 */
function getPageConfig(pageId) {
  const config = PAGE_CONFIGS[pageId]
  if (!config) {
    console.error(`未找到页面配置: ${pageId}`)
    return null
  }
  return config
}

/**
 * 初始化页面
 * @param {string} pageId - 页面ID
 * @returns {AdminPageFramework} 页面实例
 */
function initPage(pageId) {
  const config = getPageConfig(pageId)
  if (!config) return null

  // 合并自定义方法到框架实例
  const page = new AdminPageFramework(config)

  if (config.customMethods) {
    Object.entries(config.customMethods).forEach(([name, fn]) => {
      page[name] = fn.bind(page)
    })
  }

  page.init()
  return page
}

// 导出到全局
window.PAGE_CONFIGS = PAGE_CONFIGS
window.getPageConfig = getPageConfig
window.initPage = initPage
