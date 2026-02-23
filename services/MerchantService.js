/**
 * 商家管理服务 - 多商家接入架构
 *
 * @description 提供商家信息的完整 CRUD 操作和查询功能
 *
 * 业务场景：
 * - 平台管理员创建/编辑/删除/查询商家
 * - 商家状态管理（active/inactive/suspended）
 * - 商家类型通过 system_dictionaries 字典校验
 * - 商家数据用于物品(items)、奖品(lottery_prizes)、门店(stores)归属标识
 *
 * 技术特性：
 * - 静态方法设计（符合项目规范，无需实例化）
 * - 事务支持（通过 options.transaction）
 * - 字典表类型校验（merchant_type）
 * - 北京时间统一处理
 *
 * @since 2026-02-23
 * @see docs/三项核心需求-实施方案.md 第四节
 */

'use strict'

const { Op } = require('sequelize')
const { Merchant, Store, SystemDictionary } = require('../models')
const logger = require('../utils/logger').logger
const { attachDisplayNames } = require('../utils/displayNameHelper')

/**
 * 商家管理服务类
 *
 * @class MerchantService
 */
class MerchantService {
  /**
   * 创建新商家
   *
   * @param {Object} merchantData - 商家数据
   * @param {string} merchantData.merchant_name - 商家名称（必填）
   * @param {string} merchantData.merchant_type - 商家类型（必填，字典校验）
   * @param {string} [merchantData.contact_name] - 联系人姓名
   * @param {string} [merchantData.contact_mobile] - 联系电话
   * @param {string} [merchantData.logo_url] - LOGO图片URL
   * @param {string} [merchantData.status='active'] - 商家状态
   * @param {number} [merchantData.commission_rate=0] - 平台抽佣比例
   * @param {string} [merchantData.notes] - 备注
   * @param {Object} options - 选项
   * @param {Transaction} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 创建的商家数据
   * @throws {Error} 名称为空或类型不合法
   */
  static async createMerchant(merchantData, options = {}) {
    const { transaction } = options

    if (!merchantData.merchant_name || merchantData.merchant_name.trim() === '') {
      throw new Error('商家名称不能为空')
    }

    if (!merchantData.merchant_type) {
      throw new Error('商家类型不能为空')
    }

    // 字典表校验 merchant_type
    await MerchantService._validateMerchantType(merchantData.merchant_type, { transaction })

    const merchant = await Merchant.create(
      {
        merchant_name: merchantData.merchant_name.trim(),
        merchant_type: merchantData.merchant_type,
        contact_name: merchantData.contact_name || null,
        contact_mobile: merchantData.contact_mobile || null,
        logo_url: merchantData.logo_url || null,
        status: merchantData.status || 'active',
        commission_rate: merchantData.commission_rate || 0,
        notes: merchantData.notes || null
      },
      { transaction }
    )

    logger.info('商家创建成功', {
      merchant_id: merchant.merchant_id,
      merchant_name: merchant.merchant_name,
      merchant_type: merchant.merchant_type
    })

    return merchant.toJSON()
  }

  /**
   * 更新商家信息
   *
   * @param {number} merchantId - 商家ID
   * @param {Object} updateData - 更新数据
   * @param {Object} options - 选项
   * @param {Transaction} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 更新后的商家数据
   * @throws {Error} 商家不存在或类型不合法
   */
  static async updateMerchant(merchantId, updateData, options = {}) {
    const { transaction } = options

    const merchant = await Merchant.findByPk(merchantId, { transaction })
    if (!merchant) {
      throw new Error(`商家不存在（merchant_id=${merchantId}）`)
    }

    if (updateData.merchant_type) {
      await MerchantService._validateMerchantType(updateData.merchant_type, { transaction })
    }

    const allowedFields = [
      'merchant_name',
      'merchant_type',
      'contact_name',
      'contact_mobile',
      'logo_url',
      'status',
      'commission_rate',
      'notes'
    ]

    const filteredData = {}
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field]
      }
    }

    await merchant.update(filteredData, { transaction })

    logger.info('商家信息更新成功', {
      merchant_id: merchantId,
      updated_fields: Object.keys(filteredData)
    })

    return merchant.toJSON()
  }

  /**
   * 获取商家详情
   *
   * @param {number} merchantId - 商家ID
   * @param {Object} [options] - 选项
   * @param {Transaction} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 商家详情（含门店数量统计）
   * @throws {Error} 商家不存在
   */
  static async getMerchantById(merchantId, options = {}) {
    const { transaction } = options

    const merchant = await Merchant.findByPk(merchantId, {
      include: [
        {
          model: Store,
          as: 'stores',
          attributes: ['store_id', 'store_name', 'status'],
          required: false
        }
      ],
      transaction
    })

    if (!merchant) {
      throw new Error(`商家不存在（merchant_id=${merchantId}）`)
    }

    const result = merchant.toJSON()
    result.store_count = result.stores ? result.stores.length : 0

    // 附加字典显示名
    await attachDisplayNames([result], { merchant_type: 'merchant_type' })

    return result
  }

  /**
   * 分页查询商家列表
   *
   * @param {Object} query - 查询条件
   * @param {number} [query.page=1] - 当前页
   * @param {number} [query.page_size=20] - 每页数量
   * @param {string} [query.merchant_type] - 商家类型筛选
   * @param {string} [query.status] - 状态筛选
   * @param {string} [query.keyword] - 名称关键字搜索
   * @param {Object} [options] - 选项
   * @returns {Promise<Object>} { list, total, page, page_size }
   */
  static async getMerchantList(query = {}, options = {}) {
    const { transaction } = options
    const page = Math.max(1, parseInt(query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(query.page_size) || 20))
    const offset = (page - 1) * pageSize

    const where = {}

    if (query.merchant_type) {
      where.merchant_type = query.merchant_type
    }

    if (query.status) {
      where.status = query.status
    }

    if (query.keyword) {
      where.merchant_name = { [Op.like]: `%${query.keyword}%` }
    }

    const { count, rows } = await Merchant.findAndCountAll({
      where,
      include: [
        {
          model: Store,
          as: 'stores',
          attributes: ['store_id'],
          required: false
        }
      ],
      limit: pageSize,
      offset,
      order: [['created_at', 'DESC']],
      distinct: true,
      transaction
    })

    const list = rows.map(m => {
      const item = m.toJSON()
      item.store_count = item.stores ? item.stores.length : 0
      delete item.stores
      return item
    })

    await attachDisplayNames(list, { merchant_type: 'merchant_type' })

    return { list, total: count, page, page_size: pageSize }
  }

  /**
   * 删除商家（硬删除，仅限无关联数据时）
   *
   * @param {number} merchantId - 商家ID
   * @param {Object} [options] - 选项
   * @param {Transaction} [options.transaction] - 事务对象
   * @returns {Promise<void>} 无返回值
   * @throws {Error} 商家不存在或有关联数据
   */
  static async deleteMerchant(merchantId, options = {}) {
    const { transaction } = options

    const merchant = await Merchant.findByPk(merchantId, { transaction })
    if (!merchant) {
      throw new Error(`商家不存在（merchant_id=${merchantId}）`)
    }

    // 检查是否有关联门店
    const storeCount = await Store.count({
      where: { merchant_id: merchantId },
      transaction
    })
    if (storeCount > 0) {
      throw new Error(`无法删除：该商家下有 ${storeCount} 个关联门店，请先解除关联`)
    }

    await merchant.destroy({ transaction })

    logger.info('商家删除成功', {
      merchant_id: merchantId,
      merchant_name: merchant.merchant_name
    })
  }

  /**
   * 获取商家类型选项（用于下拉框）
   * 从 system_dictionaries 字典表获取
   *
   * @returns {Promise<Array>} 类型选项列表 [{ code, name, color }]
   */
  static async getMerchantTypeOptions() {
    const types = await SystemDictionary.findAll({
      where: { dict_type: 'merchant_type', is_enabled: true },
      attributes: ['dict_code', 'dict_name', 'dict_color'],
      order: [['sort_order', 'ASC']]
    })

    return types.map(t => ({
      code: t.dict_code,
      name: t.dict_name,
      color: t.dict_color
    }))
  }

  /**
   * 获取商家下拉选项（用于其他页面的商家筛选器）
   *
   * @returns {Promise<Array>} [{ merchant_id, merchant_name, merchant_type }]
   */
  static async getMerchantOptions() {
    const merchants = await Merchant.findAll({
      where: { status: 'active' },
      attributes: ['merchant_id', 'merchant_name', 'merchant_type'],
      order: [['merchant_name', 'ASC']]
    })

    return merchants.map(m => m.toJSON())
  }

  /**
   * 校验商家类型是否合法（通过字典表）
   *
   * @param {string} merchantType - 商家类型码
   * @param {Object} [options] - 选项
   * @param {Transaction} [options.transaction] - 事务对象
   * @returns {Promise<void>} 校验通过无返回，失败抛异常
   * @throws {Error} 当商家类型不在字典表中时
   * @private
   */
  static async _validateMerchantType(merchantType, options = {}) {
    const { transaction } = options

    const dict = await SystemDictionary.findOne({
      where: {
        dict_type: 'merchant_type',
        dict_code: merchantType,
        is_enabled: true
      },
      transaction
    })

    if (!dict) {
      throw new Error(`商家类型无效（${merchantType}），请在字典管理中配置 merchant_type 字典`)
    }
  }
}

module.exports = MerchantService
