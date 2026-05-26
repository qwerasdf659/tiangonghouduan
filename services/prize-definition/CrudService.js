'use strict'

const BusinessError = require('../../utils/BusinessError')
const {
  PrizeDefinition,
  MaterialAssetType,
  ItemTemplate,
  RarityDef,
  MediaFile
} = require('../../models')
const AuditLogService = require('../AuditLogService')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')

const logger = require('../../utils/logger').logger

/**
 * 奖品目录 CRUD 服务
 * 职责：奖品定义的创建、更新、删除、单个查询
 * 事务策略：强制外部事务传入（路由管理事务边界）
 */
class PrizeDefinitionCrudService {
  /**
   * 创建奖品定义
   *
   * @param {Object} data - 奖品定义数据
   * @param {Object} options - 选项（必须包含 transaction）
   * @returns {Promise<Object>} 创建的奖品定义
   */
  static async create(data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'PrizeDefinitionCrudService.create')
    const { created_by } = options

    logger.info('创建奖品定义', { prize_code: data.prize_code, prize_type: data.prize_type })

    // 1. 校验 prize_code 唯一性
    const existing = await PrizeDefinition.findOne({
      where: { prize_code: data.prize_code },
      paranoid: false,
      transaction
    })
    if (existing) {
      throw new BusinessError(
        `奖品编码 "${data.prize_code}" 已存在`,
        'PRIZE_DEFINITION_CODE_DUPLICATE',
        409
      )
    }

    // 2. 校验关联实体
    await PrizeDefinitionCrudService._validateReferences(data, transaction)

    // 3. 创建奖品定义
    const prizeDefinition = await PrizeDefinition.create(
      {
        prize_code: data.prize_code,
        display_name: data.display_name,
        prize_type: data.prize_type,
        material_asset_code: data.material_asset_code || null,
        material_amount: data.material_amount || null,
        item_template_id: data.item_template_id || null,
        rarity_code: data.rarity_code || 'common',
        primary_media_id: data.primary_media_id || null,
        reward_tier: data.reward_tier || 'low',
        is_enabled: data.is_enabled !== undefined ? data.is_enabled : true,
        description: data.description || null,
        merchant_id: data.merchant_id || null,
        meta: data.meta || null
      },
      { transaction }
    )

    // 4. 审计日志
    await AuditLogService.log({
      action: 'prize_definition_create',
      target_type: 'prize_definition',
      target_id: prizeDefinition.prize_definition_id,
      operator_id: created_by,
      details: { prize_code: data.prize_code, display_name: data.display_name },
      transaction
    })

    // 5. 清除缓存
    await BusinessCacheHelper.invalidate('prize_definitions')

    logger.info('奖品定义创建成功', {
      prize_definition_id: prizeDefinition.prize_definition_id,
      prize_code: prizeDefinition.prize_code
    })

    return prizeDefinition
  }

  /**
   * 更新奖品定义
   *
   * @param {number} prizeDefinitionId - 奖品定义ID
   * @param {Object} updateData - 更新数据
   * @param {Object} options - 选项（必须包含 transaction）
   * @returns {Promise<Object>} 更新后的奖品定义
   */
  static async update(prizeDefinitionId, updateData, options = {}) {
    const transaction = assertAndGetTransaction(options, 'PrizeDefinitionCrudService.update')
    const { created_by } = options

    const prizeDefinition = await PrizeDefinition.findByPk(prizeDefinitionId, { transaction })
    if (!prizeDefinition) {
      throw new BusinessError('奖品定义不存在', 'PRIZE_DEFINITION_NOT_FOUND', 404)
    }

    // prize_code 变更时校验唯一性
    if (updateData.prize_code && updateData.prize_code !== prizeDefinition.prize_code) {
      const existing = await PrizeDefinition.findOne({
        where: { prize_code: updateData.prize_code },
        paranoid: false,
        transaction
      })
      if (existing) {
        throw new BusinessError(
          `奖品编码 "${updateData.prize_code}" 已存在`,
          'PRIZE_DEFINITION_CODE_DUPLICATE',
          409
        )
      }
    }

    // 校验关联实体
    const mergedData = { ...prizeDefinition.toJSON(), ...updateData }
    await PrizeDefinitionCrudService._validateReferences(mergedData, transaction)

    // 允许更新的字段白名单
    const allowedFields = [
      'prize_code',
      'display_name',
      'prize_type',
      'material_asset_code',
      'material_amount',
      'item_template_id',
      'rarity_code',
      'primary_media_id',
      'reward_tier',
      'is_enabled',
      'description',
      'merchant_id',
      'meta'
    ]

    const changes = {}
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        changes[field] = updateData[field]
      }
    }

    await prizeDefinition.update(changes, { transaction })

    // 审计日志
    await AuditLogService.log({
      action: 'prize_definition_update',
      target_type: 'prize_definition',
      target_id: prizeDefinitionId,
      operator_id: created_by,
      details: { changes: Object.keys(changes) },
      transaction
    })

    await BusinessCacheHelper.invalidate('prize_definitions')

    return prizeDefinition.reload({ transaction })
  }

  /**
   * 删除奖品定义（软删除）
   *
   * @param {number} prizeDefinitionId - 奖品定义ID
   * @param {Object} options - 选项（必须包含 transaction）
   * @returns {Promise<void>} 无返回值
   */
  static async delete(prizeDefinitionId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'PrizeDefinitionCrudService.delete')
    const { created_by } = options

    const prizeDefinition = await PrizeDefinition.findByPk(prizeDefinitionId, { transaction })
    if (!prizeDefinition) {
      throw new BusinessError('奖品定义不存在', 'PRIZE_DEFINITION_NOT_FOUND', 404)
    }

    // 检查是否有活动正在引用
    const { LotteryCampaignPrize } = require('../../models')
    const activeRefs = await LotteryCampaignPrize.count({
      where: {
        prize_definition_id: prizeDefinitionId,
        status: 'active'
      },
      transaction
    })

    if (activeRefs > 0) {
      throw new BusinessError(
        `该奖品正在被 ${activeRefs} 个活动引用，无法删除`,
        'PRIZE_DEFINITION_IN_USE',
        409
      )
    }

    await prizeDefinition.destroy({ transaction })

    await AuditLogService.log({
      action: 'prize_definition_delete',
      target_type: 'prize_definition',
      target_id: prizeDefinitionId,
      operator_id: created_by,
      details: { prize_code: prizeDefinition.prize_code },
      transaction
    })

    await BusinessCacheHelper.invalidate('prize_definitions')

    logger.info('奖品定义已删除', {
      prize_definition_id: prizeDefinitionId,
      prize_code: prizeDefinition.prize_code
    })
  }

  /**
   * 获取单个奖品定义详情
   *
   * @param {number} prizeDefinitionId - 奖品定义ID
   * @returns {Promise<Object>} 奖品定义详情（含关联数据）
   */
  static async getById(prizeDefinitionId) {
    const prizeDefinition = await PrizeDefinition.findByPk(prizeDefinitionId, {
      include: [
        { model: MaterialAssetType, as: 'materialAssetType' },
        { model: ItemTemplate, as: 'itemTemplate' },
        { model: RarityDef, as: 'rarityDef' },
        { model: MediaFile, as: 'primaryMedia' }
      ]
    })

    if (!prizeDefinition) {
      throw new BusinessError('奖品定义不存在', 'PRIZE_DEFINITION_NOT_FOUND', 404)
    }

    return prizeDefinition
  }

  /**
   * 校验关联实体是否存在
   * @param {Object} data - 奖品定义数据
   * @param {Object} transaction - 事务对象
   * @returns {Promise<void>} 校验通过无返回，失败抛出 BusinessError
   * @private
   */
  static async _validateReferences(data, transaction) {
    const { prize_type, material_asset_code, material_amount, item_template_id, rarity_code } = data

    // 材料类/积分类奖品必须指定 material_asset_code 和 material_amount
    if (prize_type === 'material' || prize_type === 'points') {
      if (!material_asset_code) {
        throw new BusinessError(
          '材料/积分类奖品必须指定 material_asset_code',
          'PRIZE_DEFINITION_MATERIAL_REQUIRED',
          400
        )
      }
      if (!material_amount || material_amount <= 0) {
        throw new BusinessError(
          '材料/积分类奖品必须指定有效的 material_amount',
          'PRIZE_DEFINITION_AMOUNT_REQUIRED',
          400
        )
      }

      const assetType = await MaterialAssetType.findOne({
        where: { asset_code: material_asset_code },
        transaction
      })
      if (!assetType) {
        throw new BusinessError(
          `材料资产类型 "${material_asset_code}" 不存在`,
          'PRIZE_DEFINITION_ASSET_NOT_FOUND',
          404
        )
      }
    }

    // 物品类奖品必须指定 item_template_id
    if (prize_type === 'item') {
      if (!item_template_id) {
        throw new BusinessError(
          '物品类奖品必须指定 item_template_id',
          'PRIZE_DEFINITION_ITEM_REQUIRED',
          400
        )
      }

      const template = await ItemTemplate.findByPk(item_template_id, { transaction })
      if (!template) {
        throw new BusinessError(
          `物品模板 ID=${item_template_id} 不存在`,
          'PRIZE_DEFINITION_TEMPLATE_NOT_FOUND',
          404
        )
      }
    }

    // 校验稀有度编码
    if (rarity_code) {
      const rarity = await RarityDef.findOne({
        where: { rarity_code },
        transaction
      })
      if (!rarity) {
        throw new BusinessError(
          `稀有度编码 "${rarity_code}" 不存在`,
          'PRIZE_DEFINITION_RARITY_NOT_FOUND',
          404
        )
      }
    }
  }
}

module.exports = PrizeDefinitionCrudService
