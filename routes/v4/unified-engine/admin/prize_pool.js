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
  models
} = require('./shared/middleware')
const DecimalConverter = require('../../../../utils/formatters/DecimalConverter') // 🔧 DECIMAL字段类型转换工具

/**
 * POST /batch-add - 批量添加奖品到奖品池
 *
 * @description 批量添加奖品到指定活动的奖品池
 * @route POST /api/v4/admin/prize-pool/batch-add
 * @access Private (需要管理员权限)
 *
 * 🔒 P0修复：
 * 1. 修正模型名称：models.Prize → models.LotteryPrize
 * 2. 修正字段映射：name→prize_name, type→prize_type等
 * 3. 添加事务保护：确保原子性操作
 * 4. 添加概率验证：验证概率总和=1
 */
router.post(
  '/batch-add',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { campaign_id, prizes } = req.body // 提前声明，供错误处理使用

    // 🔒 开启事务保护（P0修复3）
    const transaction = await models.sequelize.transaction()

    try {
      // 参数验证
      if (!campaign_id) {
        await transaction.rollback()
        return res.apiError('活动ID不能为空', 'MISSING_CAMPAIGN_ID')
      }

      // 验证奖品列表基础格式
      try {
        validators.validatePrizePool(prizes)
      } catch (validationError) {
        await transaction.rollback()
        return res.apiError(validationError.message, 'VALIDATION_ERROR')
      }

      // 🔒 验证概率总和必须为1（P0修复4）
      const totalProbability = prizes.reduce((sum, p) => {
        const prob = parseFloat(p.probability) || 0
        return sum + prob
      }, 0)

      if (Math.abs(totalProbability - 1.0) > 0.001) {
        await transaction.rollback()
        return res.apiError(
          `奖品概率总和必须为1，当前为${totalProbability.toFixed(4)}`,
          'INVALID_PROBABILITY_SUM',
          { total_probability: totalProbability }
        )
      }

      // 查找活动
      const campaign = await models.LotteryCampaign.findByPk(campaign_id, { transaction })
      if (!campaign) {
        await transaction.rollback()
        return res.apiError('活动不存在', 'CAMPAIGN_NOT_FOUND')
      }

      // 🔒 获取活动现有奖品的最大sort_order（避免重复）
      const maxSortOrder = await models.LotteryPrize.max('sort_order', {
        where: { campaign_id: parseInt(campaign_id) },
        transaction
      })
      let nextSortOrder = (maxSortOrder || 0) + 1

      // 🔒 批量创建奖品（P0修复1和2：使用正确的模型名和字段名）
      const createdPrizes = []
      for (const prizeData of prizes) {
        // 🔒 sort_order唯一性保证：如果前端没提供，自动分配递增的唯一值
        const sortOrder = prizeData.sort_order !== undefined ? prizeData.sort_order : nextSortOrder++

        // eslint-disable-next-line no-await-in-loop -- 需要在事务中顺序创建奖品，确保原子性和sort_order验证
        const prize = await models.LotteryPrize.create(
          {
            campaign_id: parseInt(campaign_id),
            prize_name: prizeData.name, // 修复：name → prize_name
            prize_type: prizeData.type, // 修复：type → prize_type
            prize_value: prizeData.value || 0, // 修复：value → prize_value
            stock_quantity: parseInt(prizeData.quantity), // 修复：quantity → stock_quantity
            win_probability: prizeData.probability || 0, // 使用win_probability（抽奖概率）
            probability: prizeData.wheelProbability || prizeData.probability || 0, // probability（转盘显示概率）
            prize_description: prizeData.description || '', // 修复：description → prize_description
            image_id: prizeData.image_id || null, // 修复：使用image_id替代image_url
            angle: prizeData.angle || 0, // 转盘角度
            color: prizeData.color || '#FF6B6B', // 转盘颜色
            cost_points: prizeData.cost_points || 100, // 抽奖消耗积分
            status: 'active', // 默认激活状态
            sort_order: sortOrder, // 🔒 修复：自动分配唯一的sort_order，防止重复
            max_daily_wins: prizeData.max_daily_wins || null // 每日最大中奖次数
            // created_at由Sequelize自动处理，无需手动设置
          },
          { transaction }
        )

        createdPrizes.push(prize)
      }

      // 🔒 提交事务
      await transaction.commit()

      sharedComponents.logger.info('批量添加奖品成功', {
        campaign_id,
        prize_count: createdPrizes.length,
        created_by: req.user?.id
      })

      // 🔧 转换DECIMAL字段为数字类型（修复前端TypeError）
      const convertedPrizes = DecimalConverter.convertPrizeData(
        createdPrizes.map(p => p.toJSON())
      )

      return res.apiSuccess(
        {
          campaign_id: parseInt(campaign_id),
          added_prizes: createdPrizes.length,
          prizes: convertedPrizes
        },
        '奖品批量添加成功'
      )
    } catch (error) {
      // 🔒 回滚事务
      await transaction.rollback()

      // 🔒 识别sort_order唯一约束冲突错误
      if (
        error.message.includes('奖品排序') &&
        error.message.includes('已存在') &&
        error.message.includes('活动')
      ) {
        sharedComponents.logger.warn('奖品排序冲突', {
          error: error.message,
          campaign_id
        })
        return res.apiError(error.message, 'SORT_ORDER_DUPLICATE', {
          campaign_id,
          suggestion: '请检查sort_order字段，确保每个奖品在活动内有唯一的排序值'
        })
      }

      // 其他错误
      sharedComponents.logger.error('奖品批量添加失败', { error: error.message })
      return res.apiInternalError('奖品批量添加失败', error.message, 'PRIZE_BATCH_ADD_ERROR')
    }
  })
)

/**
 * GET /list - 获取所有奖品列表（不限活动）
 *
 * @description 获取所有奖品的列表，支持按活动和状态筛选
 * @route GET /api/v4/prizes/list
 * @access Private (需要管理员权限)
 * @query campaign_id - 可选，筛选指定活动
 * @query status - 可选，筛选状态
 *
 * 🔴 注意：必须在 /:campaign_code 之前定义，否则会被参数化路由捕获
 */
router.get(
  '/list',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { campaign_id, status } = req.query

      const where = {}
      if (campaign_id) where.campaign_id = parseInt(campaign_id)
      if (status) where.status = status

      const prizes = await models.LotteryPrize.findAll({
        where,
        include: [
          {
            model: models.LotteryCampaign,
            as: 'campaign',
            attributes: ['campaign_id', 'campaign_code', 'campaign_name', 'status']
          }
        ],
        order: [['created_at', 'DESC']],
        attributes: [
          'prize_id',
          'campaign_id',
          'prize_name',
          'prize_type',
          'prize_value',
          'stock_quantity',
          'total_win_count',
          'daily_win_count',
          'max_daily_wins',
          'win_probability',
          'probability',
          'prize_description',
          'image_id',
          'angle',
          'color',
          'cost_points',
          'status',
          'sort_order',
          'created_at',
          'updated_at'
        ]
      })

      const statistics = {
        total: prizes.length,
        active: prizes.filter(p => p.status === 'active').length,
        inactive: prizes.filter(p => p.status === 'inactive').length,
        out_of_stock: prizes.filter(p => {
          const remaining = (p.stock_quantity || 0) - (p.total_win_count || 0)
          return remaining <= 0
        }).length,
        total_stock: prizes.reduce((sum, p) => sum + (p.stock_quantity || 0), 0),
        remaining_stock: prizes.reduce((sum, p) => {
          const remaining = (p.stock_quantity || 0) - (p.total_win_count || 0)
          return sum + Math.max(0, remaining)
        }, 0)
      }

      const formattedPrizes = prizes.map(prize => ({
        prize_id: prize.prize_id,
        campaign_id: prize.campaign_id,
        campaign_name: prize.campaign?.campaign_name || '未关联活动',
        campaign_code: prize.campaign?.campaign_code,
        prize_name: prize.prize_name,
        prize_type: prize.prize_type,
        prize_value: prize.prize_value,
        stock_quantity: prize.stock_quantity,
        remaining_quantity: Math.max(0, (prize.stock_quantity || 0) - (prize.total_win_count || 0)),
        total_win_count: prize.total_win_count || 0,
        daily_win_count: prize.daily_win_count || 0,
        max_daily_wins: prize.max_daily_wins,
        win_probability: prize.win_probability,
        probability: prize.probability,
        prize_description: prize.prize_description,
        image_id: prize.image_id,
        angle: prize.angle,
        color: prize.color,
        cost_points: prize.cost_points,
        status: prize.status,
        sort_order: prize.sort_order,
        created_at: prize.created_at,
        updated_at: prize.updated_at
      }))

      // 🔧 转换DECIMAL字段为数字类型（修复前端TypeError: prize_value.toFixed is not a function）
      const convertedPrizes = DecimalConverter.convertPrizeData(formattedPrizes)

      return res.apiSuccess(
        {
          prizes: convertedPrizes,
          statistics
        },
        '奖品列表获取成功'
      )
    } catch (error) {
      sharedComponents.logger.error('获取奖品列表失败', { error: error.message })
      return res.apiInternalError('获取奖品列表失败', error.message, 'PRIZE_LIST_ERROR')
    }
  })
)

/**
 * GET /:campaign_code - 获取指定活动的奖品池
 *
 * @description 获取指定活动的所有奖品信息
 * @route GET /api/v4/admin/prize-pool/:campaign_code
 * @access Private (需要管理员权限)
 *
 * 🎯 V4.2: 使用campaign_code标识符（方案2实施）
 * 🔒 P0修复：修正模型名称和字段映射
 */
router.get(
  '/:campaign_code',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { campaign_code } = req.params

      if (!campaign_code) {
        return res.apiError('缺少活动代码', 'MISSING_CAMPAIGN_CODE')
      }

      // 通过campaign_code查找活动信息
      const campaign = await models.LotteryCampaign.findOne({
        where: { campaign_code }
      })

      if (!campaign) {
        return res.apiError(`活动不存在: ${campaign_code}`, 'CAMPAIGN_NOT_FOUND', { campaign_code })
      }

      // 🔒 获取奖品列表（P0修复：使用正确的模型名和字段）
      const prizes = await models.LotteryPrize.findAll({
        where: { campaign_id: campaign.campaign_id },
        order: [['created_at', 'DESC']],
        attributes: [
          'prize_id', // 奖品ID（主键）
          'campaign_id', // 活动ID
          'prize_name', // 奖品名称
          'prize_type', // 奖品类型
          'prize_value', // 奖品价值
          'stock_quantity', // 总库存
          'win_probability', // 中奖概率
          'probability', // 转盘概率
          'prize_description', // 奖品描述
          'image_id', // 图片ID
          'angle', // 转盘角度
          'color', // 转盘颜色
          'cost_points', // 消耗积分
          'status', // 奖品状态
          'sort_order', // 排序
          'total_win_count', // 总中奖次数
          'daily_win_count', // 今日中奖次数
          'max_daily_wins', // 每日上限
          'created_at', // 创建时间
          'updated_at' // 更新时间
        ]
      })

      // 统计信息（使用正确的字段名）
      const totalPrizes = prizes.length
      const totalQuantity = prizes.reduce((sum, prize) => sum + (prize.stock_quantity || 0), 0)
      // 计算剩余库存：总库存 - 总中奖次数
      const remainingQuantity = prizes.reduce((sum, prize) => {
        const remaining = (prize.stock_quantity || 0) - (prize.total_win_count || 0)
        return sum + Math.max(0, remaining)
      }, 0)
      const usedQuantity = prizes.reduce((sum, prize) => sum + (prize.total_win_count || 0), 0)

      // 格式化奖品数据
      const formattedPrizesForCampaign = prizes.map(prize => ({
        prize_id: prize.prize_id, // 使用正确的主键字段
        campaign_id: prize.campaign_id,
        prize_name: prize.prize_name, // 修复字段名
        prize_type: prize.prize_type, // 修复字段名
        prize_value: prize.prize_value, // 修复字段名
        stock_quantity: prize.stock_quantity, // 修复字段名
        remaining_quantity: Math.max(
          0,
          (prize.stock_quantity || 0) - (prize.total_win_count || 0)
        ),
        win_probability: prize.win_probability,
        probability: prize.probability,
        prize_description: prize.prize_description, // 修复字段名
        image_id: prize.image_id, // 使用image_id
        angle: prize.angle,
        color: prize.color,
        cost_points: prize.cost_points,
        status: prize.status,
        sort_order: prize.sort_order,
        total_win_count: prize.total_win_count,
        daily_win_count: prize.daily_win_count,
        max_daily_wins: prize.max_daily_wins,
        created_at: prize.created_at,
        updated_at: prize.updated_at
      }))

      // 🔧 转换DECIMAL字段为数字类型（修复前端TypeError）
      const convertedPrizesForCampaign = DecimalConverter.convertPrizeData(formattedPrizesForCampaign)

      const prizePoolInfo = {
        campaign: {
          campaign_code: campaign.campaign_code,
          campaign_name: campaign.campaign_name,
          status: campaign.status
        },
        statistics: {
          total_prizes: totalPrizes,
          total_quantity: totalQuantity,
          remaining_quantity: remainingQuantity,
          used_quantity: usedQuantity,
          usage_rate: totalQuantity > 0 ? ((usedQuantity / totalQuantity) * 100).toFixed(2) : 0
        },
        prizes: convertedPrizesForCampaign
      }

      return res.apiSuccess(prizePoolInfo, '奖品池信息获取成功')
    } catch (error) {
      sharedComponents.logger.error('奖品池信息获取失败', { error: error.message })
      return res.apiInternalError('奖品池信息获取失败', error.message, 'PRIZE_POOL_GET_ERROR')
    }
  })
)

/**
 * PUT /prize/:prize_id - 更新奖品信息
 *
 * @description 更新指定奖品的信息
 * @route PUT /api/v4/admin/prize-pool/prize/:prize_id
 * @access Private (需要管理员权限)
 *
 * 🔒 P0修复：修正模型名称和字段映射
 */
router.put(
  '/prize/:prize_id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { prize_id } = req.params // 提前声明，供错误处理使用
    const updateData = req.body

    try {
      if (!prize_id || isNaN(parseInt(prize_id))) {
        return res.apiError('无效的奖品ID', 'INVALID_PRIZE_ID')
      }

      // 🔒 查找奖品（P0修复：使用正确的模型名）
      const prize = await models.LotteryPrize.findByPk(prize_id)
      if (!prize) {
        return res.apiError('奖品不存在', 'PRIZE_NOT_FOUND')
      }

      // 验证更新数据（映射前端字段到数据库字段）
      const allowedFields = {
        name: 'prize_name',
        type: 'prize_type',
        value: 'prize_value',
        quantity: 'stock_quantity',
        probability: 'win_probability',
        wheelProbability: 'probability',
        description: 'prize_description',
        image_id: 'image_id',
        angle: 'angle',
        color: 'color',
        cost_points: 'cost_points',
        sort_order: 'sort_order',
        max_daily_wins: 'max_daily_wins',
        status: 'status'
      }

      const filteredUpdateData = {}

      for (const [frontendKey, value] of Object.entries(updateData)) {
        const dbField = allowedFields[frontendKey]
        if (dbField) {
          filteredUpdateData[dbField] = value
        }
      }

      if (Object.keys(filteredUpdateData).length === 0) {
        return res.apiError('没有有效的更新字段', 'NO_VALID_FIELDS')
      }

      // 特殊处理库存数量更新
      if (filteredUpdateData.stock_quantity !== undefined) {
        const newQuantity = parseInt(filteredUpdateData.stock_quantity)
        const currentUsed = prize.total_win_count || 0

        if (newQuantity < currentUsed) {
          return res.apiError(
            `新库存(${newQuantity})不能小于已使用数量(${currentUsed})`,
            'INVALID_QUANTITY'
          )
        }
      }

      // 更新奖品（updated_at由Sequelize自动处理）
      await prize.update(filteredUpdateData)

      sharedComponents.logger.info('奖品信息更新成功', {
        prize_id: prize.prize_id,
        updated_fields: Object.keys(filteredUpdateData),
        updated_by: req.user?.id
      })

      // 🔒 重新查询更新后的奖品（P0修复：使用正确的模型名）
      const updatedPrize = await models.LotteryPrize.findByPk(prize_id)

      // 格式化奖品数据
      const updatedPrizeData = {
        prize_id: updatedPrize.prize_id,
        campaign_id: updatedPrize.campaign_id,
        prize_name: updatedPrize.prize_name,
        prize_type: updatedPrize.prize_type,
        prize_value: updatedPrize.prize_value,
        stock_quantity: updatedPrize.stock_quantity,
        remaining_quantity: Math.max(
          0,
          (updatedPrize.stock_quantity || 0) - (updatedPrize.total_win_count || 0)
        ),
        win_probability: updatedPrize.win_probability,
        probability: updatedPrize.probability,
        prize_description: updatedPrize.prize_description,
        image_id: updatedPrize.image_id,
        angle: updatedPrize.angle,
        color: updatedPrize.color,
        cost_points: updatedPrize.cost_points,
        status: updatedPrize.status,
        sort_order: updatedPrize.sort_order,
        total_win_count: updatedPrize.total_win_count,
        daily_win_count: updatedPrize.daily_win_count,
        max_daily_wins: updatedPrize.max_daily_wins,
        created_at: updatedPrize.created_at,
        updated_at: updatedPrize.updated_at
      }

      // 🔧 转换DECIMAL字段为数字类型（修复前端TypeError）
      const convertedPrizeData = DecimalConverter.convertPrizeData(updatedPrizeData)

      return res.apiSuccess(
        {
          prize_id: updatedPrize.prize_id,
          updated_fields: Object.keys(filteredUpdateData),
          prize: convertedPrizeData
        },
        '奖品信息更新成功'
      )
    } catch (error) {
      // 🔒 识别sort_order唯一约束冲突错误
      if (
        error.message.includes('奖品排序') &&
        error.message.includes('已存在') &&
        error.message.includes('活动')
      ) {
        sharedComponents.logger.warn('奖品排序冲突', {
          error: error.message,
          prize_id
        })
        return res.apiError(error.message, 'SORT_ORDER_DUPLICATE', {
          prize_id,
          suggestion: '该排序值已被同一活动的其他奖品使用，请使用不同的排序值'
        })
      }

      sharedComponents.logger.error('奖品信息更新失败', { error: error.message })
      return res.apiInternalError('奖品信息更新失败', error.message, 'PRIZE_UPDATE_ERROR')
    }
  })
)

/**
 * POST /prize/:prize_id/add-stock - 补充库存（原路径保持兼容）
 *
 * @description 为指定奖品补充库存数量
 * @route POST /api/v4/admin/prize-pool/prize/:prize_id/add-stock
 * @access Private (需要管理员权限)
 */
router.post(
  '/prize/:prize_id/add-stock',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const transaction = await models.sequelize.transaction()

    try {
      const prizeId = parseInt(req.params.prize_id)
      const { quantity } = req.body

      if (!quantity || quantity <= 0) {
        await transaction.rollback()
        return res.apiError('补充数量必须大于0', 'INVALID_QUANTITY')
      }

      // 查找奖品
      const prize = await models.LotteryPrize.findByPk(prizeId, { transaction })
      if (!prize) {
        await transaction.rollback()
        return res.apiError('奖品不存在', 'PRIZE_NOT_FOUND')
      }

      const oldQuantity = prize.stock_quantity || 0
      const newQuantity = oldQuantity + parseInt(quantity)

      // 更新库存
      await prize.update({ stock_quantity: newQuantity }, { transaction })

      // 如果之前是out_of_stock状态，自动恢复为active
      if (prize.status === 'out_of_stock') {
        await prize.update({ status: 'active' }, { transaction })
      }

      await transaction.commit()

      sharedComponents.logger.info('库存补充成功', {
        prize_id: prizeId,
        old_quantity: oldQuantity,
        add_quantity: quantity,
        new_quantity: newQuantity,
        operated_by: req.user?.id
      })

      return res.apiSuccess(
        {
          prize_id: prizeId,
          old_quantity: oldQuantity,
          add_quantity: parseInt(quantity),
          new_quantity: newQuantity,
          remaining_quantity: newQuantity - (prize.total_win_count || 0)
        },
        '库存补充成功'
      )
    } catch (error) {
      await transaction.rollback()
      sharedComponents.logger.error('补充库存失败', { error: error.message })
      return res.apiInternalError('补充库存失败', error.message, 'ADD_STOCK_ERROR')
    }
  })
)

/**
 * DELETE /prize/:prize_id - 删除奖品（原路径保持兼容）
 *
 * @description 删除指定的奖品（仅当无中奖记录时）
 * @route DELETE /api/v4/admin/prize-pool/prize/:prize_id
 * @access Private (需要管理员权限)
 */
router.delete(
  '/prize/:prize_id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const transaction = await models.sequelize.transaction()

    try {
      const prizeId = parseInt(req.params.prize_id)

      // 查找奖品
      const prize = await models.LotteryPrize.findByPk(prizeId, { transaction })
      if (!prize) {
        await transaction.rollback()
        return res.apiError('奖品不存在', 'PRIZE_NOT_FOUND')
      }

      // 检查是否已有用户中奖
      const totalWins = prize.total_win_count || 0
      if (totalWins > 0) {
        await transaction.rollback()
        return res.apiError(
          `该奖品已被中奖${totalWins}次，不能删除。建议改为停用状态。`,
          'PRIZE_IN_USE'
        )
      }

      // 删除奖品
      await prize.destroy({ transaction })
      await transaction.commit()

      sharedComponents.logger.info('奖品删除成功', {
        prize_id: prizeId,
        prize_name: prize.prize_name,
        deleted_by: req.user?.id
      })

      return res.apiSuccess(
        {
          prize_id: prizeId
        },
        '奖品删除成功'
      )
    } catch (error) {
      await transaction.rollback()
      sharedComponents.logger.error('删除奖品失败', { error: error.message })
      return res.apiInternalError('删除奖品失败', error.message, 'PRIZE_DELETE_ERROR')
    }
  })
)

module.exports = router
