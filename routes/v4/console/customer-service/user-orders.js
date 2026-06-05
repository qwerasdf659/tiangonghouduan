/**
 * 客服工作台 - 用户订单聚合查询
 *
 * @description 聚合查询用户在三种订单表中的近期订单（交易/兑换/消费）
 * @prefix /api/v4/console/customer-service/user-orders
 *
 * 数据来源（通过 ServiceManager 获取已有服务）：
 * - consumption_query → ConsumptionQueryService.getUserConsumptionRecords()
 * - redemption_order → RedemptionService.getUserOrders()
 *
 * 注：C2C 交易订单（trade_order）已随 C2C 下线移除（2026-06-05 阶段五）
 *
 * @version 1.1.0
 * @date 2026-05-27
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { asyncHandler } = require('../../../../middleware/validation')
const { Op } = require('sequelize')

/* 所有路由需要后台访问权限 */
router.use(authenticateToken, requireRoleLevel(1))

/**
 * GET /:user_id - 获取用户近期所有类型订单（聚合）
 *
 * 聚合逻辑：
 * 1. 并行查询两种订单表（通过 ServiceManager 获取已有服务）
 * 2. 统一格式化为 { order_type, order_id, order_no, summary, status, created_at, issue_count }
 * 3. 按 created_at 倒序混合排序
 * 4. 应用层分页（两表数据量有限，不需要 SQL 级 UNION 分页）
 *
 * @route GET /api/v4/console/customer-service/user-orders/:user_id
 * @param {number} user_id - 用户ID（事务实体）
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get(
  '/:user_id',
  asyncHandler(async (req, res) => {
    const { user_id } = req.params
    const { page = 1, page_size = 20 } = req.query
    const models = req.app.locals.models

    const parsedUserId = parseInt(user_id)
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      return res.apiError('用户ID无效', 'BAD_REQUEST', null, 400)
    }

    // 通过 ServiceManager 获取已有服务（复用，不新建）
    const ConsumptionQueryService = req.app.locals.services.getService('consumption_query')
    const RedemptionService = req.app.locals.services.getService('redemption_order')

    // 并行查询两种订单（各限制50条，覆盖近期订单）
    const [consumptionResult, redemptionResult] = await Promise.all([
      ConsumptionQueryService.getUserConsumptionRecords(parsedUserId, {
        page: 1,
        page_size: 50
      }).catch(err => {
        req.app.locals.logger?.warn('[user-orders] 消费记录查询失败', { error: err.message })
        return { records: [], pagination: { total: 0 } }
      }),
      RedemptionService.getUserOrders(parsedUserId, { page_size: 50 }).catch(err => {
        req.app.locals.logger?.warn('[user-orders] 兑换订单查询失败', { error: err.message })
        return { rows: [], count: 0 }
      })
    ])

    // 统一格式化（注意各服务返回格式不同）
    const allOrders = [
      ...formatConsumptionRecords(consumptionResult.records || []),
      ...formatRedemptionOrders(redemptionResult.rows || [])
    ]

    // 按时间倒序排序
    allOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    // 查询每个订单的关联工单数
    await attachIssueCounts(models, allOrders)

    // 应用层分页
    const parsedPage = parseInt(page) || 1
    const parsedPageSize = Math.min(parseInt(page_size) || 20, 50)
    const start = (parsedPage - 1) * parsedPageSize
    const paged = allOrders.slice(start, start + parsedPageSize)

    return res.apiSuccess(
      {
        orders: paged,
        total: allOrders.length,
        page: parsedPage,
        page_size: parsedPageSize
      },
      '获取用户订单列表成功'
    )
  })
)

// ===== 辅助函数 =====

/**
 * 格式化消费记录为统一结构
 * @param {Array} records - ConsumptionQueryService 返回的记录数组
 * @returns {Array} 统一格式的订单数组
 */
function formatConsumptionRecords(records) {
  return records.map(r => ({
    order_type: 'consumption',
    order_id: String(r.record_id || r.id),
    order_no: r.order_no,
    summary: `门店消费 ¥${r.consumption_amount || 0}`,
    amount: String(r.consumption_amount || 0),
    status: r.status,
    // created_at 经 toAPIResponse() 已转为 { iso, beijing, timestamp, relative } 对象，取 iso 标准串
    created_at: r.created_at?.iso || r.created_at
  }))
}

/**
 * 格式化兑换订单为统一结构
 * @param {Array} orders - RedemptionService.getUserOrders 返回的订单数组
 * @returns {Array} 统一格式的订单数组
 */
function formatRedemptionOrders(orders) {
  return orders.map(o => {
    const plain = o.toJSON ? o.toJSON() : o
    return {
      order_type: 'redemption',
      order_id: String(plain.redemption_order_id),
      order_no: plain.order_no,
      summary: `兑换 ${plain.item?.display_name || '物品'}`,
      amount: '1',
      status: plain.status,
      created_at: plain.created_at
    }
  })
}

/**
 * 批量查询订单关联的工单数量
 * @param {Object} models - Sequelize models
 * @param {Array} orders - 统一格式的订单数组
 * @returns {Promise<void>} 直接修改 orders 数组中每个元素的 issue_count 属性
 */
async function attachIssueCounts(models, orders) {
  if (orders.length === 0) return

  const conditions = orders.map(o => ({
    order_type: o.order_type,
    order_id: o.order_id
  }))

  const issues = await models.CustomerServiceIssue.findAll({
    where: { [Op.or]: conditions },
    attributes: ['order_type', 'order_id'],
    raw: true
  })

  const countMap = {}
  issues.forEach(i => {
    const key = `${i.order_type}:${i.order_id}`
    countMap[key] = (countMap[key] || 0) + 1
  })

  orders.forEach(o => {
    o.issue_count = countMap[`${o.order_type}:${o.order_id}`] || 0
  })
}

module.exports = router
