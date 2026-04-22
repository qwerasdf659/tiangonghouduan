/**
 * 用户收货地址服务（UserAddressService）
 *
 * 业务场景：管理用户收货地址（DIY 实物兑换、奖品发货等场景）
 *
 * 核心功能：
 * 1. 地址列表查询（按默认 + 更新时间排序）
 * 2. 新增地址（每用户最多 10 个）
 * 3. 修改地址
 * 4. 删除地址
 * 5. 设为默认地址
 *
 * 设计原则：
 * - 静态方法 + 外部事务传入（写操作强制要求事务）
 * - 地址数量上限由应用层校验（每用户最多 10 个）
 * - 默认地址互斥（设新默认时自动取消旧默认）
 *
 * @module services/UserAddressService
 */

'use strict'

const { UserAddress } = require('../models')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const logger = require('../utils/logger')

/** 每用户最大地址数量 */
const MAX_ADDRESSES_PER_USER = 10

/** 用户收货地址服务 — 管理用户收货地址的增删改查 */
class UserAddressService {
  /**
   * 获取用户地址列表（默认地址优先，按更新时间倒序）
   *
   * @param {number} userId - 用户 ID
   * @returns {Promise<UserAddress[]>} 地址列表
   */
  static async getList(userId) {
    return UserAddress.findAll({
      where: { user_id: userId },
      order: [
        ['is_default', 'DESC'],
        ['updated_at', 'DESC']
      ]
    })
  }

  /**
   * 新增收货地址
   *
   * @param {number} userId - 用户 ID
   * @param {Object} data - 地址数据
   * @param {string} data.receiver_name - 收件人姓名
   * @param {string} data.receiver_phone - 收件人手机号
   * @param {string} data.province - 省
   * @param {string} data.city - 市
   * @param {string} data.district - 区
   * @param {string} data.detail_address - 详细地址
   * @param {boolean} [data.is_default=false] - 是否默认地址
   * @param {Object} options - { transaction }（必填）
   * @returns {Promise<UserAddress>} 新建的地址
   */
  static async create(userId, data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'UserAddressService.create')

    // 校验地址数量上限
    const count = await UserAddress.count({ where: { user_id: userId }, transaction })
    if (count >= MAX_ADDRESSES_PER_USER) {
      const error = new Error(`每位用户最多保存 ${MAX_ADDRESSES_PER_USER} 个收货地址`)
      error.statusCode = 400
      throw error
    }

    // 如果设为默认，先取消其他默认
    if (data.is_default) {
      await UserAddress.update(
        { is_default: false },
        { where: { user_id: userId, is_default: true }, transaction }
      )
    }

    // 如果是第一个地址，自动设为默认
    const isDefault = count === 0 ? true : !!data.is_default

    const address = await UserAddress.create(
      {
        user_id: userId,
        receiver_name: data.receiver_name,
        receiver_phone: data.receiver_phone,
        province: data.province,
        city: data.city,
        district: data.district,
        detail_address: data.detail_address,
        is_default: isDefault
      },
      { transaction }
    )

    logger.info('[UserAddressService] 新增收货地址', {
      user_id: userId,
      address_id: address.address_id
    })

    return address
  }

  /**
   * 修改收货地址
   *
   * @param {number} userId - 用户 ID
   * @param {number} addressId - 地址 ID
   * @param {Object} data - 要更新的字段
   * @param {Object} options - { transaction }（必填）
   * @returns {Promise<UserAddress>} 更新后的地址
   */
  static async update(userId, addressId, data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'UserAddressService.update')

    const address = await UserAddress.findOne({
      where: { address_id: addressId, user_id: userId },
      transaction
    })
    if (!address) {
      const error = new Error('地址不存在')
      error.statusCode = 404
      throw error
    }

    // 允许更新的字段白名单
    const allowedFields = [
      'receiver_name',
      'receiver_phone',
      'province',
      'city',
      'district',
      'detail_address'
    ]
    const updateData = {}
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field]
      }
    }

    await address.update(updateData, { transaction })
    return address
  }

  /**
   * 删除收货地址
   *
   * @param {number} userId - 用户 ID
   * @param {number} addressId - 地址 ID
   * @param {Object} options - { transaction }（必填）
   * @returns {Promise<void>} 无返回值
   */
  static async remove(userId, addressId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'UserAddressService.remove')

    const address = await UserAddress.findOne({
      where: { address_id: addressId, user_id: userId },
      transaction
    })
    if (!address) {
      const error = new Error('地址不存在')
      error.statusCode = 404
      throw error
    }

    await address.destroy({ transaction })

    logger.info('[UserAddressService] 删除收货地址', {
      user_id: userId,
      address_id: addressId
    })
  }

  /**
   * 设为默认地址（互斥：同一用户只能有一个默认地址）
   *
   * @param {number} userId - 用户 ID
   * @param {number} addressId - 地址 ID
   * @param {Object} options - { transaction }（必填）
   * @returns {Promise<UserAddress>} 设为默认后的地址
   */
  static async setDefault(userId, addressId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'UserAddressService.setDefault')

    const address = await UserAddress.findOne({
      where: { address_id: addressId, user_id: userId },
      transaction
    })
    if (!address) {
      const error = new Error('地址不存在')
      error.statusCode = 404
      throw error
    }

    // 取消其他默认
    await UserAddress.update(
      { is_default: false },
      { where: { user_id: userId, is_default: true }, transaction }
    )

    // 设为默认
    await address.update({ is_default: true }, { transaction })
    return address
  }

  /**
   * 根据 ID 获取单个地址（用于下单时快照）
   *
   * @param {number} addressId - 地址 ID
   * @returns {Promise<UserAddress|null>} 地址对象
   */
  static async getById(addressId) {
    return UserAddress.findByPk(addressId)
  }
}

module.exports = UserAddressService
