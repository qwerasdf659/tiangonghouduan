/**
 * 奖品池管理模块
 *
 * @description 奖品池管理相关路由，包括奖品添加、查询、修改等
 * @version 4.0.0
 * @date 2025-09-24
 */

const express = require('express')
const router = express.Router()
const {
  sharedComponents,
  adminAuthMiddleware,
  asyncHandler,
  validators,
  models,
  BeijingTimeHelper
} = require('./shared/middleware')

/**
 * POST /batch-add - 批量添加奖品到奖品池
 *
 * @description 批量添加奖品到指定活动的奖品池
 * @route POST /api/v4/unified-engine/admin/prize-pool/batch-add
 * @access Private (需要管理员权限)
 */
router.post('/batch-add', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const { campaign_id, prizes } = req.body

    // 参数验证
    if (!campaign_id) {
      return res.apiError('活动ID不能为空', 'MISSING_CAMPAIGN_ID')
    }

    // 验证奖品列表
    try {
      validators.validatePrizePool(prizes)
    } catch (validationError) {
      return res.apiError(validationError.message, 'VALIDATION_ERROR')
    }

    // 查找活动
    const campaign = await models.LotteryCampaign.findByPk(campaign_id)
    if (!campaign) {
      return res.apiError('活动不存在', 'CAMPAIGN_NOT_FOUND')
    }

    // 批量创建奖品
    const createdPrizes = []
    for (const prizeData of prizes) {
      const prize = await models.Prize.create({
        campaign_id: parseInt(campaign_id),
        name: prizeData.name,
        type: prizeData.type,
        value: prizeData.value || 0,
        quantity: parseInt(prizeData.quantity),
        remaining_quantity: parseInt(prizeData.quantity),
        probability: prizeData.probability || 0,
        description: prizeData.description || '',
        image_url: prizeData.image_url || '',
        created_by: req.user?.id,
        created_at: BeijingTimeHelper.getCurrentTime()
      })

      createdPrizes.push(prize)
    }

    sharedComponents.logger.info('批量添加奖品成功', {
      campaign_id,
      prize_count: createdPrizes.length,
      created_by: req.user?.id
    })

    return res.apiSuccess({
      campaign_id: parseInt(campaign_id),
      added_prizes: createdPrizes.length,
      prizes: createdPrizes
    }, '奖品批量添加成功')
  } catch (error) {
    sharedComponents.logger.error('奖品批量添加失败', { error: error.message })
    return res.apiInternalError('奖品批量添加失败', error.message, 'PRIZE_BATCH_ADD_ERROR')
  }
}))

/**
 * GET /:campaign_id - 获取指定活动的奖品池
 *
 * @description 获取指定活动的所有奖品信息
 * @route GET /api/v4/unified-engine/admin/prize-pool/:campaign_id
 * @access Private (需要管理员权限)
 */
router.get('/:campaign_id', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const { campaign_id } = req.params

    if (!campaign_id || isNaN(parseInt(campaign_id))) {
      return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID')
    }

    // 查找活动信息
    const campaign = await models.LotteryCampaign.findByPk(campaign_id)
    if (!campaign) {
      return res.apiError('活动不存在', 'CAMPAIGN_NOT_FOUND')
    }

    // 获取奖品列表
    const prizes = await models.Prize.findAll({
      where: { campaign_id: parseInt(campaign_id) },
      order: [['created_at', 'DESC']]
    })

    // 统计信息
    const totalPrizes = prizes.length
    const totalQuantity = prizes.reduce((sum, prize) => sum + prize.quantity, 0)
    const remainingQuantity = prizes.reduce((sum, prize) => sum + prize.remaining_quantity, 0)
    const usedQuantity = totalQuantity - remainingQuantity

    const prizePoolInfo = {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status
      },
      statistics: {
        total_prizes: totalPrizes,
        total_quantity: totalQuantity,
        remaining_quantity: remainingQuantity,
        used_quantity: usedQuantity,
        usage_rate: totalQuantity > 0 ? ((usedQuantity / totalQuantity) * 100).toFixed(2) : 0
      },
      prizes: prizes.map(prize => ({
        id: prize.id,
        name: prize.name,
        type: prize.type,
        value: prize.value,
        quantity: prize.quantity,
        remaining_quantity: prize.remaining_quantity,
        probability: prize.probability,
        description: prize.description,
        image_url: prize.image_url,
        created_at: prize.created_at
      }))
    }

    return res.apiSuccess(prizePoolInfo, '奖品池信息获取成功')
  } catch (error) {
    sharedComponents.logger.error('奖品池信息获取失败', { error: error.message })
    return res.apiInternalError('奖品池信息获取失败', error.message, 'PRIZE_POOL_GET_ERROR')
  }
}))

/**
 * PUT /prize/:prize_id - 更新奖品信息
 *
 * @description 更新指定奖品的信息
 * @route PUT /api/v4/unified-engine/admin/prize-pool/prize/:prize_id
 * @access Private (需要管理员权限)
 */
router.put('/prize/:prize_id', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const { prize_id } = req.params
    const updateData = req.body

    if (!prize_id || isNaN(parseInt(prize_id))) {
      return res.apiError('无效的奖品ID', 'INVALID_PRIZE_ID')
    }

    // 查找奖品
    const prize = await models.Prize.findByPk(prize_id)
    if (!prize) {
      return res.apiError('奖品不存在', 'PRIZE_NOT_FOUND')
    }

    // 验证更新数据
    const allowedFields = ['name', 'type', 'value', 'quantity', 'probability', 'description', 'image_url']
    const filteredUpdateData = {}

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        filteredUpdateData[key] = value
      }
    }

    if (Object.keys(filteredUpdateData).length === 0) {
      return res.apiError('没有有效的更新字段', 'NO_VALID_FIELDS')
    }

    // 特殊处理数量更新
    if (filteredUpdateData.quantity !== undefined) {
      const newQuantity = parseInt(filteredUpdateData.quantity)
      const currentUsed = prize.quantity - prize.remaining_quantity

      if (newQuantity < currentUsed) {
        return res.apiError('新数量不能小于已使用数量', 'INVALID_QUANTITY')
      }

      filteredUpdateData.remaining_quantity = newQuantity - currentUsed
    }

    // 更新奖品
    await prize.update({
      ...filteredUpdateData,
      updated_by: req.user?.id,
      updated_at: BeijingTimeHelper.getCurrentTime()
    })

    sharedComponents.logger.info('奖品信息更新成功', {
      prize_id: prize.id,
      updated_fields: Object.keys(filteredUpdateData),
      updated_by: req.user?.id
    })

    return res.apiSuccess({
      prize_id: prize.id,
      updated_fields: Object.keys(filteredUpdateData),
      prize: await models.Prize.findByPk(prize_id)
    }, '奖品信息更新成功')
  } catch (error) {
    sharedComponents.logger.error('奖品信息更新失败', { error: error.message })
    return res.apiInternalError('奖品信息更新失败', error.message, 'PRIZE_UPDATE_ERROR')
  }
}))

module.exports = router
