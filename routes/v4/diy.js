/**
 * DIY 饰品设计引擎 — 用户端路由（小程序端）
 *
 * 顶层路径：/api/v4/diy
 *
 * 接口清单（11 个）：
 * - GET    /templates                获取模板列表（按分类分组，仅已发布+已启用）
 * - GET    /templates/:id            获取模板详情
 * - GET    /templates/:id/beads      获取模板可用珠子素材（查 diy_materials）
 * - GET    /templates/:id/payment-assets  获取用户可用支付资产余额（钱包）
 * - GET    /material-groups          获取材料分组列表（用于前端 Tab）
 * - GET    /works                    获取用户作品列表
 * - GET    /works/:id                获取作品详情
 * - POST   /works                    保存作品（创建或更新草稿）
 * - DELETE /works/:id                删除作品（仅 draft 状态）
 * - POST   /works/:id/confirm        确认设计（服务端计算价格 + 冻结资产，draft → frozen）
 * - POST   /works/:id/complete       完成设计（从冻结扣减 + 铸造物品，frozen → completed）
 * - POST   /works/:id/cancel         取消设计（解冻资产，frozen → cancelled）
 *
 * @module routes/v4/diy
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../middleware/auth')
const TransactionManager = require('../../utils/TransactionManager')
const { asyncHandler } = require('../../middleware/validation')

// ==================== 模板接口（公开 + 认证） ====================

/** 获取模板列表（已发布+已启用，按分类分组） */
router.get(
  '/templates',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    const templates = await DIYService.getUserTemplates()
    return res.apiSuccess(templates, '获取模板列表成功')
  })
)

/** 获取模板详情 */
router.get(
  '/templates/:id',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    const template = await DIYService.getTemplateDetail(Number(req.params.id))
    return res.apiSuccess(template, '获取模板详情成功')
  })
)

/** 获取模板可用的实物珠子/宝石素材（查 diy_materials 表） */
router.get(
  '/templates/:id/beads',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    const materials = await DIYService.getUserMaterials(Number(req.params.id), req.query)
    return res.apiSuccess(materials, '获取珠子素材成功')
  })
)

/**
 * 获取用户可用支付资产余额（钱包）
 *
 * 返回该模板下珠子实际使用的定价货币 + 用户在这些货币上的余额
 * 用途：小程序"确认设计"时展示用户钱包，供选择支付方式
 */
router.get(
  '/templates/:id/payment-assets',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    const accountId = await DIYService.getAccountIdByUserId(req.user.user_id)
    const assets = await DIYService.getPaymentAssets(Number(req.params.id), accountId)
    return res.apiSuccess(assets, '获取支付资产成功')
  })
)

/** 获取材料分组列表（用于前端 Tab） */
router.get(
  '/material-groups',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    const groups = await DIYService.getMaterialGroups()
    return res.apiSuccess(groups, '获取材料分组成功')
  })
)

// ==================== 作品接口（全部需登录） ====================

router.use('/works', authenticateToken)

/** 中间件：将 user_id 转换为 account_id */
router.use(
  '/works',
  asyncHandler(async (req, _res, next) => {
    const DIYService = req.app.locals.services.getService('diy')
    const accountId = await DIYService.getAccountIdByUserId(req.user.user_id)
    req.accountId = accountId // eslint-disable-line require-atomic-updates
    next()
  })
)

/** 获取用户作品列表 */
router.get(
  '/works',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    const result = await DIYService.getWorkList(req.accountId, req.query)
    return res.apiSuccess(result, '获取作品列表成功')
  })
)

/** 获取作品详情 */
router.get(
  '/works/:id',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    const work = await DIYService.getWorkDetail(Number(req.params.id), req.accountId)
    return res.apiSuccess(work, '获取作品详情成功')
  })
)

/** 保存作品（创建或更新草稿） */
router.post(
  '/works',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    let work
    await TransactionManager.execute(async transaction => {
      work = await DIYService.saveWork(req.accountId, req.body, { transaction })
    })
    return res.apiSuccess(work, work.diy_work_id ? '作品保存成功' : '作品创建成功')
  })
)

/** 删除作品（仅 draft 状态） */
router.delete(
  '/works/:id',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    await TransactionManager.execute(async transaction => {
      await DIYService.deleteWork(Number(req.params.id), req.accountId, { transaction })
    })
    return res.apiSuccess(null, '作品删除成功')
  })
)

/**
 * 确认设计（服务端计算价格 + 冻结资产，draft → frozen）
 *
 * 请求体：{ payments: [{ asset_code: 'star_stone', amount: 180 }] }
 * 后端从 design_data 中提取 material_code，查 diy_materials 获取真实价格，
 * 校验 payments 总额 ≥ 应付金额后冻结资产。
 */
router.post(
  '/works/:id/confirm',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    let work
    await TransactionManager.execute(async transaction => {
      work = await DIYService.confirmDesign(Number(req.params.id), req.accountId, {
        transaction,
        userId: req.user.user_id,
        payments: req.body.payments
      })
    })
    return res.apiSuccess(work, '设计确认成功，资产已冻结')
  })
)

/**
 * 完成设计（从冻结扣减 + 铸造物品，frozen → completed）
 *
 * 请求体：{ address_id?: number }
 * address_id 为收货地址 ID，后端查 user_addresses 生成 address_snapshot 快照
 * 写入 exchange_records，打通实物发货链路。
 * 如果不传 address_id，exchange_records.address_snapshot 为 null，
 * 管理员可在后台补录地址。
 */
router.post(
  '/works/:id/complete',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    let work
    await TransactionManager.execute(async transaction => {
      work = await DIYService.completeDesign(Number(req.params.id), req.accountId, {
        transaction,
        userId: req.user.user_id,
        addressId: req.body.address_id || null
      })
    })
    return res.apiSuccess(work, '设计完成，物品已铸造')
  })
)

/** 取消设计（解冻资产，frozen → cancelled） */
router.post(
  '/works/:id/cancel',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    let work
    await TransactionManager.execute(async transaction => {
      work = await DIYService.cancelDesign(Number(req.params.id), req.accountId, {
        transaction,
        userId: req.user.user_id
      })
    })
    return res.apiSuccess(work, '设计已取消，资产已解冻')
  })
)

module.exports = router
