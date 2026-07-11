/**
 * 天工商户营销平台 V4.7.0 - 兑换市场查询排序白名单工具
 * Exchange Query Sort Whitelist（技术债务方案 7.4-2：QueryService 拆分共享工具）
 *
 * 职责范围：排序参数白名单化（防 SQL 注入）
 * - MARKET_SORT_WHITELIST: 商品列表排序白名单
 * - ORDER_SORT_WHITELIST: 订单列表排序白名单
 * - sanitizeMarketSort(): 将外部传入的排序参数规整为白名单内的安全值
 *
 * 由 MallQueryService / OrderQueryService 共享（纯搬移自原 QueryService.js，逻辑不变）。
 *
 * @module services/exchange/query/marketSort
 * @created 2026-07-11（技术债务方案 7.4-2 拆分）
 */

/**
 * 商品列表排序白名单（防 SQL 注入：sort_by/sort_order 仅允许白名单内取值，
 * 杜绝把用户原始输入拼进 ORDER BY 子句导致注入或泄露原始输入）
 * @constant {Object}
 */
const MARKET_SORT_WHITELIST = Object.freeze({
  fields: ['sort_order', 'created_at', 'min_cost_amount', 'max_cost_amount', 'stock', 'sold_count'],
  directions: ['ASC', 'DESC']
})

/**
 * 订单列表排序白名单（管理员订单查询用，仅允许订单时间/状态等列）
 * @constant {Object}
 */
const ORDER_SORT_WHITELIST = Object.freeze({
  fields: ['created_at', 'updated_at', 'exchange_time', 'total_cost', 'pay_amount', 'status'],
  directions: ['ASC', 'DESC']
})

/**
 * 将外部传入的排序参数规整为白名单内的安全值
 * @param {string} sortBy - 外部传入排序字段
 * @param {string} sortOrder - 外部传入排序方向
 * @param {Object} [whitelist=MARKET_SORT_WHITELIST] - 排序白名单（字段集合 + 方向集合）
 * @param {string} [defaultField='sort_order'] - 字段非法时的兜底字段
 * @returns {{sort_by: string, sort_order: string}} 安全的排序字段与方向
 */
function sanitizeMarketSort(
  sortBy,
  sortOrder,
  whitelist = MARKET_SORT_WHITELIST,
  defaultField = 'sort_order'
) {
  const safeField = whitelist.fields.includes(sortBy) ? sortBy : defaultField
  const safeDirection = whitelist.directions.includes(String(sortOrder).toUpperCase())
    ? String(sortOrder).toUpperCase()
    : 'ASC'
  return { sort_by: safeField, sort_order: safeDirection }
}

module.exports = {
  MARKET_SORT_WHITELIST,
  ORDER_SORT_WHITELIST,
  sanitizeMarketSort
}
