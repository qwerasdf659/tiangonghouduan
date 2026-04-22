/**
 * DIY 用户作品管理 — 管理端路由
 *
 * 顶层路径：/api/v4/console/diy/works
 *
 * 接口清单（4 个）：
 * - GET  /           获取所有用户作品列表（分页/筛选）
 * - GET  /:id        获取作品详情
 * - GET  /:id/order  获取作品关联的兑换订单（含地址、发货信息）
 * - PUT  /:id/address 管理员补录/更新 DIY 订单收货地址
 *
 * @module routes/v4/console/diy/works
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')
const logger = require('../../../../utils/logger').logger
const { asyncHandler } = require('../../../../middleware/validation')

router.use(authenticateToken, requireRoleLevel(60))

/** 获取所有用户作品列表（分页/筛选） */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    const result = await DIYService.getAdminWorkList(req.query)
    return res.apiSuccess(result, '获取作品列表成功')
  })
)

/** 获取作品详情 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    const work = await DIYService.getAdminWorkDetail(Number(req.params.id))
    return res.apiSuccess(work, '获取作品详情成功')
  })
)

/** 获取作品关联的兑换订单（含 address_snapshot、发货信息） */
router.get(
  '/:id/order',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    const record = await DIYService.getWorkExchangeRecord(Number(req.params.id))
    return res.apiSuccess(record, record ? '获取关联订单成功' : '该作品暂无关联订单')
  })
)

/**
 * 管理员补录/更新 DIY 订单收货地址
 *
 * 请求体：{ receiver_name, receiver_phone, province, city, district, detail_address }
 */
router.put(
  '/:id/address',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    const { receiver_name, receiver_phone, province, city, district, detail_address } = req.body

    if (!receiver_name || !receiver_phone || !detail_address) {
      return res.apiError('收件人姓名、手机号、详细地址为必填项', 'VALIDATION_ERROR', null, 400)
    }

    let record
    await TransactionManager.execute(async transaction => {
      record = await DIYService.updateWorkAddress(
        Number(req.params.id),
        { receiver_name, receiver_phone, province, city, district, detail_address },
        { transaction }
      )
    })

    logger.info('[Console/DIY] 管理员更新订单地址', {
      admin_user_id: req.user.user_id,
      diy_work_id: Number(req.params.id),
      exchange_record_id: record.exchange_record_id
    })

    return res.apiSuccess(record, '地址更新成功')
  })
)

module.exports = router
