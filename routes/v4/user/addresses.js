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
 * @module routes/v4/user/addresses
 */

'use strict'

const express = require('express')
const router = express.Router()
const TransactionManager = require('../../../utils/TransactionManager')

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

/** 获取用户地址列表 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { UserAddress } = require('../../../models')
    const addresses = await UserAddress.findAll({
      where: { user_id: req.user.user_id },
      order: [
        ['is_default', 'DESC'],
        ['updated_at', 'DESC']
      ]
    })
    return res.apiSuccess(addresses, '获取地址列表成功')
  })
)

/** 新增收货地址 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { UserAddress } = require('../../../models')
    const {
      receiver_name,
      receiver_phone,
      province,
      city,
      district,
      detail_address,
      postal_code,
      is_default
    } = req.body

    // 参数校验
    if (!receiver_name || !receiver_phone || !province || !city || !detail_address) {
      return res.apiError(
        '收件人姓名、手机号、省、市、详细地址为必填项',
        'VALIDATION_ERROR',
        null,
        400
      )
    }

    let address
    await TransactionManager.execute(async transaction => {
      // 如果设为默认，先取消其他默认地址
      if (is_default) {
        await UserAddress.update(
          { is_default: false },
          { where: { user_id: req.user.user_id, is_default: true }, transaction }
        )
      }

      address = await UserAddress.create(
        {
          user_id: req.user.user_id,
          receiver_name,
          receiver_phone,
          province,
          city,
          district: district || '',
          detail_address,
          postal_code: postal_code || null,
          is_default: is_default || false
        },
        { transaction }
      )
    })

    return res.apiSuccess(address, '地址添加成功')
  })
)

/** 修改收货地址 */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { UserAddress } = require('../../../models')
    const addressId = Number(req.params.id)
    const {
      receiver_name,
      receiver_phone,
      province,
      city,
      district,
      detail_address,
      postal_code,
      is_default
    } = req.body

    let address
    await TransactionManager.execute(async transaction => {
      address = await UserAddress.findOne({
        where: { address_id: addressId, user_id: req.user.user_id },
        transaction,
        lock: true
      })
      if (!address) {
        const error = new Error('地址不存在')
        error.statusCode = 404
        throw error
      }

      // 如果设为默认，先取消其他默认地址
      if (is_default && !address.is_default) {
        await UserAddress.update(
          { is_default: false },
          { where: { user_id: req.user.user_id, is_default: true }, transaction }
        )
      }

      await address.update(
        {
          receiver_name: receiver_name || address.receiver_name,
          receiver_phone: receiver_phone || address.receiver_phone,
          province: province || address.province,
          city: city || address.city,
          district: district !== undefined ? district : address.district,
          detail_address: detail_address || address.detail_address,
          postal_code: postal_code !== undefined ? postal_code : address.postal_code,
          is_default: is_default !== undefined ? is_default : address.is_default
        },
        { transaction }
      )
    })

    return res.apiSuccess(address, '地址修改成功')
  })
)

/** 删除收货地址（硬删除） */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { UserAddress } = require('../../../models')
    const addressId = Number(req.params.id)

    const deleted = await UserAddress.destroy({
      where: { address_id: addressId, user_id: req.user.user_id }
    })

    if (!deleted) {
      return res.apiError('地址不存在', 'NOT_FOUND', null, 404)
    }

    return res.apiSuccess(null, '地址删除成功')
  })
)

/** 设为默认地址 */
router.put(
  '/:id/default',
  asyncHandler(async (req, res) => {
    const { UserAddress } = require('../../../models')
    const addressId = Number(req.params.id)

    let address
    await TransactionManager.execute(async transaction => {
      address = await UserAddress.findOne({
        where: { address_id: addressId, user_id: req.user.user_id },
        transaction,
        lock: true
      })
      if (!address) {
        const error = new Error('地址不存在')
        error.statusCode = 404
        throw error
      }

      // 取消其他默认地址
      await UserAddress.update(
        { is_default: false },
        { where: { user_id: req.user.user_id, is_default: true }, transaction }
      )

      // 设为默认
      await address.update({ is_default: true }, { transaction })
    })

    return res.apiSuccess(address, '已设为默认地址')
  })
)

module.exports = router
