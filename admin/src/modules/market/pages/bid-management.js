/**
 * 竞价管理页面 - Alpine.js 组件
 *
 * @file admin/src/modules/market/pages/bid-management.js
 * @description 竞价商品列表、创建、详情、手动结算、取消竞价
 * @version 1.0.0
 * @date 2026-02-16
 *
 * @requires Alpine.js
 * @requires createPageMixin - 页面基础功能混入
 * @requires BidAPI - 竞价管理API调用方法
 *
 * 后端路由：/api/v4/console/bid-management
 * 状态机：pending → active → ended → settled / no_bid / settlement_failed / cancelled
 */

import { logger, $confirm } from '../../../utils/index.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { BidAPI } from '../../../api/market/bid.js'
import { ExchangeAPI } from '../../../api/market/exchange.js'

/**
 * 竞价状态中文映射（基于后端 BidProduct 模型的 7 态状态机）
 */
const BID_STATUS_MAP = {
  pending: { label: '待开始', color: 'bg-gray-100 text-gray-700' },
  active: { label: '进行中', color: 'bg-green-100 text-green-700' },
  ended: { label: '已结束', color: 'bg-blue-100 text-blue-700' },
  settled: { label: '已结算', color: 'bg-purple-100 text-purple-700' },
  no_bid: { label: '流拍', color: 'bg-yellow-100 text-yellow-700' },
  cancelled: { label: '已取消', color: 'bg-red-100 text-red-700' },
  settlement_failed: { label: '结算失败', color: 'bg-red-100 text-red-800' }
}

/**
 * 有效的状态筛选选项（对应后端 validStatuses）
 */
const STATUS_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待开始' },
  { value: 'active', label: '进行中' },
  { value: 'ended', label: '已结束' },
  { value: 'settled', label: '已结算' },
  { value: 'no_bid', label: '流拍' },
  { value: 'cancelled', label: '已取消' },
  { value: 'settlement_failed', label: '结算失败' }
]

document.addEventListener('alpine:init', () => {
  logger.info('[BidManagement] 注册 Alpine 组件...')

  /**
   * 竞价管理主组件
   */
  Alpine.data('bidManagementPage', () => {
    const pageMixin = createPageMixin({
      pageTitle: '竞价管理',
      loadDataOnInit: false
    })

    return {
      ...pageMixin,

      // ========== 状态配置 ==========
      /** 状态选项 */
      statusOptions: STATUS_OPTIONS,
      /** 状态映射 */
      statusMap: BID_STATUS_MAP,

      // ========== 列表数据 ==========
      /** @type {Array<Object>} 竞价商品列表 */
      bid_products: [],
      /** 加载状态 */
      list_loading: false,
      /** 列表错误信息 */
      list_error: '',

      // ========== 分页 ==========
      pagination: {
        page: 1,
        page_size: 20,
        total: 0
      },

      /** 计算总页数 */
      get totalPages() {
        return Math.ceil(this.pagination.total / this.pagination.page_size) || 1
      },
      get hasPrevPage() {
        return this.pagination.page > 1
      },
      get hasNextPage() {
        return this.pagination.page < this.totalPages
      },

      // ========== 筛选 ==========
      /** @type {string} 当前状态筛选 */
      filter_status: 'all',

      // ========== 创建表单 ==========
      /** 是否显示创建模态框 */
      show_create_modal: false,
      /** 创建提交中 */
      creating: false,
      /** 创建表单数据 */
      create_form: {
        exchange_item_id: '',
        start_price: '',
        price_asset_code: 'DIAMOND',
        min_bid_increment: 10,
        start_time: '',
        end_time: '',
        batch_no: ''
      },
      /** 可选兑换商品列表（用于创建表单的下拉选择） */
      exchange_items: [],
      /** 加载兑换商品列表状态 */
      loading_exchange_items: false,

      // ========== 详情模态框 ==========
      /** 是否显示详情模态框 */
      show_detail_modal: false,
      /** 详情数据 */
      detail_data: null,
      /** 详情加载中 */
      detail_loading: false,

      // ========== 取消模态框 ==========
      /** 是否显示取消模态框 */
      show_cancel_modal: false,
      /** 取消操作的竞价 ID */
      cancel_bid_id: null,
      /** 取消原因 */
      cancel_reason: '',
      /** 取消提交中 */
      cancelling: false,

      // ========== 初始化 ==========
      async init() {
        logger.info('[BidManagement] 初始化组件...')

        if (typeof pageMixin.init === 'function') {
          await pageMixin.init.call(this)
        }

        await this.loadBidProducts()
      },

      // ========== 状态格式化 ==========

      /**
       * 获取状态标签文本
       * @param {string} status - 后端状态值
       * @returns {string} 中文标签
       */
      getStatusLabel(status) {
        return BID_STATUS_MAP[status]?.label || status
      },

      /**
       * 获取状态样式类名
       * @param {string} status - 后端状态值
       * @returns {string} CSS 类名
       */
      getStatusColor(status) {
        return BID_STATUS_MAP[status]?.color || 'bg-gray-100 text-gray-700'
      },

      // ========== 列表操作 ==========

      /**
       * 加载竞价商品列表
       */
      async loadBidProducts() {
        this.list_loading = true
        this.list_error = ''

        try {
          const params = {
            status: this.filter_status,
            page: this.pagination.page,
            page_size: this.pagination.page_size
          }

          logger.info('[BidManagement] 加载竞价列表', params)
          const res = await BidAPI.getBidProducts(params)

          if (res.success) {
            this.bid_products = res.data?.bid_products || []
            const paginationData = res.data?.pagination || {}
            this.pagination.total = paginationData.total || 0
            this.pagination.page = paginationData.page || this.pagination.page
            logger.info('[BidManagement] 加载成功', {
              count: this.bid_products.length,
              total: this.pagination.total
            })
          } else {
            this.list_error = res.message || '加载竞价列表失败'
            logger.error('[BidManagement] 列表加载失败:', res.message)
          }
        } catch (e) {
          this.list_error = e.message || '网络请求失败'
          logger.error('[BidManagement] 列表加载异常:', e)
        } finally {
          this.list_loading = false
        }
      },

      /**
       * 切换状态筛选
       * @param {string} status - 状态值
       */
      async filterByStatus(status) {
        this.filter_status = status
        this.pagination.page = 1
        await this.loadBidProducts()
      },

      /**
       * 翻页
       * @param {number} page - 页码
       */
      async goToPage(page) {
        if (page < 1 || page > this.totalPages) return
        this.pagination.page = page
        await this.loadBidProducts()
      },

      // ========== 创建竞价 ==========

      /**
       * 打开创建模态框
       */
      async openCreateModal() {
        this.show_create_modal = true
        this.create_form = {
          exchange_item_id: '',
          start_price: '',
          price_asset_code: 'DIAMOND',
          min_bid_increment: 10,
          start_time: '',
          end_time: '',
          batch_no: ''
        }
        // 加载可选的兑换商品
        await this.loadExchangeItems()
      },

      /**
       * 加载兑换商品列表（用于下拉选择）
       */
      async loadExchangeItems() {
        this.loading_exchange_items = true
        try {
          const res = await ExchangeAPI.getExchangeItems({ status: 'active', page_size: 100 })
          if (res.success) {
            this.exchange_items = res.data?.items || res.data?.list || []
            logger.info('[BidManagement] 兑换商品加载成功:', this.exchange_items.length)
          }
        } catch (e) {
          logger.error('[BidManagement] 加载兑换商品失败:', e)
          Alpine.store('notification').error('加载兑换商品列表失败: ' + e.message)
        } finally {
          this.loading_exchange_items = false
        }
      },

      /**
       * 提交创建竞价
       */
      async submitCreate() {
        // 表单校验
        if (!this.create_form.exchange_item_id) {
          Alpine.store('notification').warning('请选择关联的兑换商品')
          return
        }
        if (!this.create_form.start_price || parseInt(this.create_form.start_price, 10) <= 0) {
          Alpine.store('notification').warning('起拍价必须为正整数')
          return
        }
        if (!this.create_form.start_time || !this.create_form.end_time) {
          Alpine.store('notification').warning('请设置竞价开始和结束时间')
          return
        }
        if (new Date(this.create_form.end_time) <= new Date(this.create_form.start_time)) {
          Alpine.store('notification').warning('结束时间必须晚于开始时间')
          return
        }

        this.creating = true
        try {
          const data = {
            exchange_item_id: parseInt(this.create_form.exchange_item_id, 10),
            start_price: parseInt(this.create_form.start_price, 10),
            price_asset_code: this.create_form.price_asset_code,
            min_bid_increment: parseInt(this.create_form.min_bid_increment, 10) || 10,
            start_time: new Date(this.create_form.start_time).toISOString(),
            end_time: new Date(this.create_form.end_time).toISOString()
          }
          if (this.create_form.batch_no) {
            data.batch_no = this.create_form.batch_no
          }

          logger.info('[BidManagement] 创建竞价', data)
          const res = await BidAPI.createBidProduct(data)

          if (res.success) {
            Alpine.store('notification').success('竞价商品创建成功')
            this.show_create_modal = false
            await this.loadBidProducts()
          } else {
            Alpine.store('notification').error(res.message || '创建失败')
          }
        } catch (e) {
          logger.error('[BidManagement] 创建竞价失败:', e)
          Alpine.store('notification').error('创建竞价失败: ' + e.message)
        } finally {
          this.creating = false
        }
      },

      // ========== 详情 ==========

      /**
       * 查看竞价详情
       * @param {number} bid_product_id - 竞价商品 ID
       */
      async viewDetail(bid_product_id) {
        this.show_detail_modal = true
        this.detail_loading = true
        this.detail_data = null

        try {
          logger.info('[BidManagement] 加载竞价详情', { bid_product_id })
          const res = await BidAPI.getBidProductDetail(bid_product_id)

          if (res.success) {
            this.detail_data = res.data
            logger.info('[BidManagement] 详情加载成功', {
              bid_product_id,
              bid_records_count: res.data?.all_bid_records?.length || 0
            })
          } else {
            Alpine.store('notification').error(res.message || '加载详情失败')
            this.show_detail_modal = false
          }
        } catch (e) {
          logger.error('[BidManagement] 加载详情失败:', e)
          Alpine.store('notification').error('加载详情失败: ' + e.message)
          this.show_detail_modal = false
        } finally {
          this.detail_loading = false
        }
      },

      // ========== 手动结算 ==========

      /**
       * 手动结算竞价
       * @param {number} bid_product_id - 竞价商品 ID
       */
      async settleBid(bid_product_id) {
        const confirmed = await $confirm(
          '确认手动结算该竞价？结算后将根据最高出价确定中标者，落选者的冻结资产将解冻返还。',
          '手动结算确认'
        )
        if (!confirmed) return

        try {
          logger.info('[BidManagement] 手动结算', { bid_product_id })
          const res = await BidAPI.settleBidProduct(bid_product_id)

          if (res.success) {
            Alpine.store('notification').success(res.message || '结算成功')
            // 如果详情模态框开着则关闭
            this.show_detail_modal = false
            await this.loadBidProducts()
          } else {
            Alpine.store('notification').error(res.message || '结算失败')
          }
        } catch (e) {
          logger.error('[BidManagement] 结算失败:', e)
          Alpine.store('notification').error('结算失败: ' + e.message)
        }
      },

      // ========== 取消竞价 ==========

      /**
       * 打开取消模态框
       * @param {number} bid_product_id - 竞价商品 ID
       */
      openCancelModal(bid_product_id) {
        this.cancel_bid_id = bid_product_id
        this.cancel_reason = ''
        this.show_cancel_modal = true
      },

      /**
       * 提交取消竞价
       */
      async submitCancel() {
        if (!this.cancel_reason.trim()) {
          Alpine.store('notification').warning('请输入取消原因')
          return
        }

        this.cancelling = true
        try {
          logger.info('[BidManagement] 取消竞价', {
            bid_product_id: this.cancel_bid_id,
            reason: this.cancel_reason
          })
          const res = await BidAPI.cancelBidProduct(this.cancel_bid_id, {
            reason: this.cancel_reason.trim()
          })

          if (res.success) {
            Alpine.store('notification').success(res.message || '竞价已取消')
            this.show_cancel_modal = false
            this.show_detail_modal = false
            await this.loadBidProducts()
          } else {
            Alpine.store('notification').error(res.message || '取消失败')
          }
        } catch (e) {
          logger.error('[BidManagement] 取消竞价失败:', e)
          Alpine.store('notification').error('取消竞价失败: ' + e.message)
        } finally {
          this.cancelling = false
        }
      },

      // ========== 辅助方法 ==========

      /**
       * 判断竞价是否可结算
       * @param {Object} bid - 竞价商品对象
       * @returns {boolean}
       */
      canSettle(bid) {
        return ['active', 'ended'].includes(bid.status)
      },

      /**
       * 判断竞价是否可取消
       * @param {Object} bid - 竞价商品对象
       * @returns {boolean}
       */
      canCancel(bid) {
        return ['pending', 'active'].includes(bid.status)
      },

      /**
       * 格式化资产数额显示
       * @param {number} amount - 数额
       * @param {string} asset_code - 资产类型
       * @returns {string}
       */
      formatAssetAmount(amount, asset_code) {
        if (amount === null || amount === undefined) return '-'
        return `${Number(amount).toLocaleString()} ${asset_code || ''}`
      }
    }
  })
})



