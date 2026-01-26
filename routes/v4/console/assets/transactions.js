/**
 * 资产流水查询路由（管理员视角）
 *
 * 路径：/api/v4/console/assets/transactions
 *
 * 职责：
 * - 提供管理员查看用户资产流水的只读能力
 * - 暴露DB已存在的 asset_transactions 表数据
 *
 * 设计说明：
 * - 只读接口，不创造新业务能力
 * - 支持按用户/资产类型/时间范围筛选
 * - 支持分页查询
 *
 * 架构规范：
 * - 路由层通过 req.app.locals.services.getService() 获取服务
 * - 路由层禁止直接 require models（所有数据库操作通过 Service 层）
 *
 * 创建时间：2026-01-09
 * 更新时间：2026-01-09（路由层规范治理）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../../middleware/auth')

/**
 * 错误处理包装器
 * @param {Function} fn - 异步处理函数
 * @returns {Function} 包装后的中间件函数
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * GET /api/v4/console/assets/transactions
 *
 * @description 查询资产流水记录（管理员视角）
 * @query {number} user_id - 用户ID（必填）
 * @query {string} [asset_code] - 资产代码筛选（可选）
 * @query {string} [business_type] - 业务类型筛选（可选）
 * @query {string} [start_date] - 开始日期（可选）
 * @query {string} [end_date] - 结束日期（可选）
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量（最大100）
 * @access Admin
 */
router.get(
  '/',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const {
      user_id,
      asset_code,
      business_type,
      start_date,
      end_date,
      page = 1,
      page_size = 20
    } = req.query

    // 参数验证
    if (!user_id) {
      return res.apiError('user_id 是必填参数', 'BAD_REQUEST', null, 400)
    }

    // 分页参数处理
    const pageNum = Math.max(1, parseInt(page) || 1)
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(page_size) || 20))

    // 通过 ServiceManager 获取 AssetService（路由层规范）
    const AssetService = req.app.locals.services.getService('asset')

    try {
      // 调用 Service 层方法获取用户资产流水
      const result = await AssetService.getTransactions(
        { user_id: Number(user_id) },
        {
          asset_code,
          business_type,
          start_date: start_date ? new Date(start_date) : undefined,
          end_date: end_date ? new Date(end_date) : undefined,
          page: pageNum,
          page_size: pageSizeNum
        }
      )

      /*
       * 格式化返回数据（添加资产名称映射）
       * 注意：Sequelize模型需要使用.get()或.toJSON()获取完整字段
       */
      const transactions = result.transactions.map(tx => {
        const plainTx = tx.get ? tx.get({ plain: true }) : tx
        return {
          transaction_id: plainTx.transaction_id,
          asset_code: plainTx.asset_code,
          asset_name: getAssetDisplayName(plainTx.asset_code),
          tx_type: plainTx.business_type,
          amount: Number(plainTx.delta_amount),
          balance_before: Number(plainTx.balance_before),
          balance_after: Number(plainTx.balance_after),
          description: plainTx.description || null,
          reason: plainTx.meta?.reason || plainTx.description || null,
          operator_name: plainTx.meta?.admin_id ? `管理员#${plainTx.meta.admin_id}` : null,
          idempotency_key: plainTx.idempotency_key,
          created_at: plainTx.created_at
        }
      })

      return res.apiSuccess({
        transactions,
        pagination: {
          page: pageNum,
          page_size: pageSizeNum,
          total: result.total,
          total_pages: result.total_pages
        }
      })
    } catch (error) {
      // 用户不存在或无账户
      if (error.message.includes('不存在')) {
        return res.apiSuccess({
          transactions: [],
          pagination: {
            page: pageNum,
            page_size: pageSizeNum,
            total: 0,
            total_pages: 0
          }
        })
      }
      throw error
    }
  })
)

/**
 * 获取资产显示名称（内置映射）
 *
 * @param {string} asset_code - 资产代码
 * @returns {string} 资产显示名称
 */
function getAssetDisplayName(asset_code) {
  const builtInAssets = {
    POINTS: '积分',
    DIAMOND: '钻石',
    BUDGET_POINTS: '预算积分'
  }
  return builtInAssets[asset_code] || asset_code
}

module.exports = router
