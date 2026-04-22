/**
 * 用户收货地址管理路由
 *
 * 顶层路径：/api/v4/user/addresses
 *
 * 接口清单（5 个）：
 * - GET    /                获取用户地址列表
 * - POST   /                新增收货地址
 * - PUT    /:id             修改收货地址
 * - DELETE /:id             删除收货地址
 * - PUT    /:id/default     设为默认地址
 *
 * 📌 遵循规范：
 * - 路由不直连 models，写操作收口到 UserAddressService
 * - 事务边界由路由层通过 TransactionManager.execute() 管理
 * - Service 层通过 assertAndGetTransaction() 强制要求事务传入
 *
 * @module routes/v4/user/addresses
 */

'use strict'

const express = require('express')
const router = express.Router()
const TransactionManager = require('../../../utils/TransactionManager')
const UserAddressService = require('../../../services/UserAddressService')

/**
 * 异步路由处理器包装
 * @param {Function} fn - 异步路由处理函数
 * @returns {Function} Express 中间件
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/** 获取用户地址列表（读操作，无需事务） */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const addresses = await UserAddressService.getList(req.user.user_id)
    return res.apiSuccess(addresses, '获取地址列表成功')
  })
)

/** 新增收货地址（写操作，事务保护） */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { receiver_name, receiver_phone, province, city, district, detail_address, is_default } =
      req.body

    // 参数校验
    if (!receiver_name || !receiver_phone || !province || !city || !district || !detail_address) {
      return res.apiError(
        '收件人姓名、手机号、省市区、详细地址均为必填',
        'VALIDATION_ERROR',
        null,
        400
      )
    }

    const address = await TransactionManager.execute(async transaction => {
      return UserAddressService.create(
        req.user.user_id,
        { receiver_name, receiver_phone, province, city, district, detail_address, is_default },
        { transaction }
      )
    })

    return res.apiSuccess(address, '新增地址成功')
  })
)

/** 修改收货地址（写操作，事务保护） */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const addressId = parseInt(req.params.id, 10)
    if (isNaN(addressId)) {
      return res.apiError('地址 ID 无效', 'VALIDATION_ERROR', null, 400)
    }

    const address = await TransactionManager.execute(async transaction => {
      return UserAddressService.update(req.user.user_id, addressId, req.body, { transaction })
    })

    return res.apiSuccess(address, '修改地址成功')
  })
)

/** 删除收货地址（写操作，事务保护） */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const addressId = parseInt(req.params.id, 10)
    if (isNaN(addressId)) {
      return res.apiError('地址 ID 无效', 'VALIDATION_ERROR', null, 400)
    }

    await TransactionManager.execute(async transaction => {
      return UserAddressService.remove(req.user.user_id, addressId, { transaction })
    })

    return res.apiSuccess(null, '删除地址成功')
  })
)

/** 设为默认地址（写操作，事务保护） */
router.put(
  '/:id/default',
  asyncHandler(async (req, res) => {
    const addressId = parseInt(req.params.id, 10)
    if (isNaN(addressId)) {
      return res.apiError('地址 ID 无效', 'VALIDATION_ERROR', null, 400)
    }

    const address = await TransactionManager.execute(async transaction => {
      return UserAddressService.setDefault(req.user.user_id, addressId, { transaction })
    })

    return res.apiSuccess(address, '已设为默认地址')
  })
)

module.exports = router
