/**
 * 🔥 抽奖系统API接口 v3 - 全新分离式架构
 * 创建时间：2025年08月19日 UTC
 * 更新时间：2025年08月21日 - 扩展连抽、多池、条件抽奖功能
 * 特点：与积分系统完全分离 + 事件驱动 + 独立业务逻辑
 * 路径：/api/v3/lottery
 */

'use strict'

const express = require('express')
const router = express.Router()
const LotteryService = require('../../services/LotteryService')
// 事件总线和积分系统服务将在后续集成中使用
// const PointsSystemService = require('../../services/PointsSystemService')
// const EventBusService = require('../../services/EventBusService')
const { requireUser, requireAdmin } = require('../../middleware/auth')
const validationMiddleware = require('../../middleware/validation')

/**
 * 🔥 抽奖活动管理接口
 */

/**
 * GET /api/v3/lottery/campaigns
 * 获取可参与的抽奖活动列表
 */
router.get('/campaigns', requireUser, async (req, res) => {
  try {
    const { status, type, levelFilter } = req.query
    const userId = req.user.user_id

    console.log(`🔍 获取抽奖活动列表: 用户ID=${userId}, 状态=${status}, 类型=${type}`)

    const result = await LotteryService.getAvailableCampaigns(userId, { status, type, levelFilter })

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: result.data,
      message: '获取抽奖活动列表成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取抽奖活动列表失败:', error)
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '服务器内部错误',
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/lottery/campaigns/:campaignId
 * 获取指定抽奖活动的详细信息
 */
router.get(
  '/campaigns/:campaignId',
  requireUser,
  validationMiddleware([{ field: 'campaignId', type: 'number', required: true, source: 'params' }]),
  async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId)
      const userId = req.user.user_id

      console.log(`🔍 获取抽奖活动详情: 活动ID=${campaignId}, 用户ID=${userId}`)

      const result = await LotteryService.getCampaignDetail(campaignId, userId)

      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: result.error,
          message: result.message,
          timestamp: new Date().toISOString()
        })
      }

      res.json({
        success: true,
        data: result.campaign,
        message: '获取活动详情成功',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('获取抽奖活动详情失败:', error)
      res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: '服务器内部错误',
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * 🔥 抽奖执行接口
 */

/**
 * POST /api/v3/lottery/draw
 * 执行抽奖操作
 */
router.post(
  '/draw',
  requireUser,
  validationMiddleware([
    { field: 'campaign_id', type: 'number', required: true },
    { field: 'campaign_code', type: 'string', required: false }
  ]),
  async (req, res) => {
    try {
      const { campaign_id, campaign_code } = req.body
      const userId = req.user.user_id

      console.log(`🎲 执行抽奖: 用户ID=${userId}, 活动ID=${campaign_id}`)

      // 🔥 通过事件总线协调积分系统和抽奖系统
      const result = await LotteryService.executeDraw(userId, campaign_id, {
        campaign_code,
        event_source: 'user_request'
      })

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          message: result.message,
          details: result.details || {},
          timestamp: new Date().toISOString()
        })
      }

      // 🔥 成功响应包含完整抽奖结果
      const responseData = {
        draw_id: result.draw.draw_id,
        campaign_id: result.draw.campaign_id,
        campaign_name: result.campaign.campaign_name,
        is_winner: result.draw.is_winner,
        draw_time: result.draw.draw_time,
        points_consumed: result.draw.points_consumed,
        points_remaining: result.points_remaining
      }

      // 如果中奖，添加奖品信息
      if (result.draw.is_winner && result.prize) {
        responseData.prize = {
          prize_id: result.prize.prize_id,
          prize_name: result.prize.prize_name,
          prize_type: result.prize.prize_type,
          prize_value: result.prize.prize_value,
          prize_image_url: result.prize.prize_image_url,
          distribution_status: result.prize_distribution?.status || 'pending'
        }
        responseData.message = '恭喜中奖！'
      } else {
        responseData.message = '很遗憾未中奖，请继续努力！'
        responseData.consolation_message = '感谢参与，明天继续加油！'
      }

      res.json({
        success: true,
        data: responseData,
        message: responseData.message,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('执行抽奖失败:', error)
      res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: '服务器内部错误',
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * 🔥 用户抽奖记录接口
 */

/**
 * GET /api/v3/lottery/my-draws
 * 获取当前用户的抽奖记录
 */
router.get('/my-draws', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { page = 1, limit = 20, campaign_id, is_winner } = req.query

    console.log(`🔍 获取用户抽奖记录: 用户ID=${userId}`)

    const result = await LotteryService.getUserDrawHistory(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      campaign_id: campaign_id ? parseInt(campaign_id) : null,
      is_winner: is_winner === 'true' ? true : is_winner === 'false' ? false : null
    })

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: {
        draws: result.draws,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          pages: result.pages
        },
        statistics: result.statistics
      },
      message: '获取抽奖记录成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取用户抽奖记录失败:', error)
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '服务器内部错误',
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * 🔥 奖品管理接口
 */

/**
 * GET /api/v3/lottery/prizes
 * 获取奖品列表
 */
router.get('/prizes', requireUser, async (req, res) => {
  try {
    const { campaign_id, prize_type, is_active } = req.query

    console.log(`🔍 获取奖品列表: 活动ID=${campaign_id}`)

    const result = await LotteryService.getPrizesList({
      campaign_id: campaign_id ? parseInt(campaign_id) : null,
      prize_type,
      is_active: is_active === 'true' ? true : is_active === 'false' ? false : null
    })

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: {
        prizes: result.prizes,
        statistics: result.statistics
      },
      message: '获取奖品列表成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取奖品列表失败:', error)
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '服务器内部错误',
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * 🔥 管理员接口
 */

/**
 * POST /api/v3/lottery/campaigns
 * 创建新的抽奖活动（仅管理员）
 */
router.post(
  '/campaigns',
  requireAdmin,
  validationMiddleware([
    { field: 'campaign_name', type: 'string', required: true },
    { field: 'campaign_code', type: 'string', required: true },
    { field: 'campaign_type', type: 'string', enum: ['daily', 'weekly', 'event', 'permanent'] },
    { field: 'cost_per_draw', type: 'number', min: 0, required: true },
    { field: 'max_draws_per_user_daily', type: 'number', min: 1 },
    { field: 'start_time', type: 'string', required: true },
    { field: 'end_time', type: 'string', required: true }
  ]),
  async (req, res) => {
    try {
      const campaignData = req.body
      const adminId = req.user.user_id

      console.log(`🔍 创建抽奖活动: 管理员ID=${adminId}`)

      const result = await LotteryService.createCampaign(campaignData, { created_by: adminId })

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          message: result.message,
          timestamp: new Date().toISOString()
        })
      }

      res.status(201).json({
        success: true,
        data: result.campaign,
        message: '抽奖活动创建成功',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('创建抽奖活动失败:', error)
      res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: '服务器内部错误',
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * PUT /api/v3/lottery/campaigns/:campaignId
 * 更新抽奖活动（仅管理员）
 */
router.put(
  '/campaigns/:campaignId',
  requireAdmin,
  validationMiddleware([{ field: 'campaignId', type: 'number', required: true, source: 'params' }]),
  async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId)
      const updateData = req.body
      const adminId = req.user.user_id

      console.log(`🔍 更新抽奖活动: 活动ID=${campaignId}, 管理员ID=${adminId}`)

      const result = await LotteryService.updateCampaign(campaignId, updateData, {
        updated_by: adminId
      })

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          message: result.message,
          timestamp: new Date().toISOString()
        })
      }

      res.json({
        success: true,
        data: result.campaign,
        message: '抽奖活动更新成功',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('更新抽奖活动失败:', error)
      res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: '服务器内部错误',
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * 🔥 抽奖统计接口
 */

/**
 * GET /api/v3/lottery/statistics
 * 获取抽奖系统统计信息（仅管理员）
 */
router.get('/statistics', requireAdmin, async (req, res) => {
  try {
    const { time_range = '7d', campaign_id } = req.query

    console.log(`🔍 获取抽奖统计: 时间范围=${time_range}`)

    const result = await LotteryService.getLotteryStatistics({
      time_range,
      campaign_id: campaign_id ? parseInt(campaign_id) : null
    })

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: result.statistics,
      message: '获取抽奖统计成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取抽奖统计失败:', error)
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '服务器内部错误',
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * 🔥 连抽系统接口
 */

/**
 * POST /api/v3/lottery/multi-draw
 * 连抽接口 - 支持5/10/20连抽
 */
router.post(
  '/multi-draw',
  requireUser,
  validationMiddleware([
    { field: 'campaign_id', type: 'number', required: true },
    { field: 'draw_count', type: 'number', required: true }
  ]),
  async (req, res) => {
    try {
      const { campaign_id, draw_count } = req.body
      const userId = req.user.user_id

      // 输入验证
      if (![5, 10, 20].includes(parseInt(draw_count))) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_DRAW_COUNT',
          message: '连抽次数只支持5、10、20次',
          allowed: [5, 10, 20],
          timestamp: new Date().toISOString()
        })
      }

      console.log(`🎯 执行${draw_count}连抽: 用户ID=${userId}, 活动ID=${campaign_id}`)

      // 执行连抽
      const result = await LotteryService.performMultipleDraw(userId, campaign_id, parseInt(draw_count))

      res.json({
        success: true,
        data: result,
        message: `${draw_count}连抽完成`,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('连抽接口错误:', error)
      res.status(500).json({
        success: false,
        error: 'MULTI_DRAW_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * GET /api/v3/lottery/multi-draw/history
 * 获取连抽历史记录
 */
router.get('/multi-draw/history', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { page = 1, limit = 10 } = req.query

    console.log(`🔍 查询连抽历史: 用户ID=${userId}`)

    // 查询用户的连抽历史 (基于现有数据模型)
    const { LotteryDraw, LotteryCampaign, LotteryPrize } = require('../../models')
    const { Op } = require('sequelize')

    const history = await LotteryDraw.findAndCountAll({
      where: {
        user_id: userId,
        batch_id: { [Op.ne]: null } // 有batch_id的是连抽记录
      },
      include: [
        { model: LotteryCampaign, as: 'campaign' },
        { model: LotteryPrize, as: 'prize' }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (page - 1) * limit
    })

    // 按批次分组
    const batchGroups = {}
    history.rows.forEach(draw => {
      const batchId = draw.batch_id
      if (!batchGroups[batchId]) {
        batchGroups[batchId] = {
          batch_id: batchId,
          batch_size: draw.batch_size,
          discount_applied: draw.discount_applied,
          campaign: draw.campaign,
          draws: [],
          created_at: draw.created_at
        }
      }
      batchGroups[batchId].draws.push(draw)
    })

    const batches = Object.values(batchGroups)

    res.json({
      success: true,
      data: {
        batches,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total: history.count,
          total_pages: Math.ceil(history.count / limit)
        }
      },
      message: '连抽历史查询成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('连抽历史查询错误:', error)
    res.status(500).json({
      success: false,
      error: 'MULTI_DRAW_HISTORY_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * 🎱 多池系统接口
 */

/**
 * GET /api/v3/lottery/pools
 * 获取可用抽奖池
 */
router.get('/pools', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id

    console.log(`🎱 查询可用抽奖池: 用户ID=${userId}`)

    const result = await LotteryService.getAvailablePools(userId)

    res.json({
      success: true,
      data: result,
      message: '获取可用抽奖池成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取抽奖池错误:', error)
    res.status(500).json({
      success: false,
      error: 'GET_POOLS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * POST /api/v3/lottery/pools/:poolId/draw
 * 池抽奖接口 - 支持单次和连抽
 */
router.post('/pools/:poolId/draw', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id
    const poolId = parseInt(req.params.poolId)
    const { draw_count = 1 } = req.body

    console.log(`🎱 池抽奖: 用户ID=${userId}, 池ID=${poolId}, 次数=${draw_count}`)

    // 单次抽奖
    if (draw_count === 1) {
      const result = await LotteryService.drawFromPool(userId, poolId)
      res.json({
        success: true,
        data: result,
        message: '池抽奖完成',
        timestamp: new Date().toISOString()
      })
    } else if ([5, 10, 20].includes(draw_count)) {
      // 连抽
      const result = await LotteryService.performMultipleDraw(userId, poolId, draw_count)
      res.json({
        success: true,
        data: result,
        message: `池${draw_count}连抽完成`,
        timestamp: new Date().toISOString()
      })
    } else {
      res.status(400).json({
        success: false,
        error: 'INVALID_DRAW_COUNT',
        message: '无效的抽奖次数',
        timestamp: new Date().toISOString()
      })
    }
  } catch (error) {
    console.error('池抽奖错误:', error)
    res.status(500).json({
      success: false,
      error: 'POOL_DRAW_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/lottery/pools/:poolId
 * 池详情接口
 */
router.get('/pools/:poolId', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id
    const poolId = parseInt(req.params.poolId)

    console.log(`🎱 查询池详情: 用户ID=${userId}, 池ID=${poolId}`)

    const { LotteryCampaign, LotteryPrize } = require('../../models')

    const pool = await LotteryCampaign.findByPk(poolId, {
      include: [
        {
          model: LotteryPrize,
          as: 'prizes',
          where: { is_active: true },
          required: false
        }
      ]
    })

    if (!pool || !pool.campaign_type.startsWith('pool_')) {
      return res.status(404).json({
        success: false,
        error: 'POOL_NOT_FOUND',
        message: '抽奖池不存在',
        timestamp: new Date().toISOString()
      })
    }

    // 检查用户访问权限
    const accessCheck = await LotteryService.validatePoolAccess(userId, poolId)

    // 获取用户在此池的抽奖统计
    const userStats = {
      total_draws: await LotteryService.getUserDrawCountInCampaign(userId, poolId),
      remaining_draws: pool.max_draws_per_user_daily
        ? Math.max(0, pool.max_draws_per_user_daily - await LotteryService.getUserDrawCountInCampaign(userId, poolId))
        : '无限制'
    }

    res.json({
      success: true,
      data: {
        pool: pool.toJSON(),
        access: accessCheck,
        user_stats: userStats
      },
      message: '池详情获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取池详情错误:', error)
    res.status(500).json({
      success: false,
      error: 'GET_POOL_DETAIL_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * 🔒 条件抽奖接口
 */

/**
 * POST /api/v3/lottery/check-permission
 * 条件抽奖权限检查
 */
router.post('/check-permission', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { campaign_id, additional_checks = {} } = req.body

    if (!campaign_id) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_CAMPAIGN_ID',
        message: '缺少活动ID',
        timestamp: new Date().toISOString()
      })
    }

    console.log(`🔒 权限检查: 用户ID=${userId}, 活动ID=${campaign_id}`)

    const result = await LotteryService.checkAdvancedDrawPermission(
      userId,
      campaign_id,
      additional_checks
    )

    res.json({
      success: true,
      data: result,
      message: '权限检查完成',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('权限检查错误:', error)
    res.status(500).json({
      success: false,
      error: 'PERMISSION_CHECK_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/lottery/vip-campaigns
 * VIP专享活动列表
 */
router.get('/vip-campaigns', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id

    console.log(`💎 查询VIP活动: 用户ID=${userId}`)

    // 获取用户信息
    const PointsSystemService = require('../../services/PointsSystemService')
    const userAccount = await PointsSystemService.getUserPointsAccount(userId)
    if (!userAccount.success) {
      throw new Error('无法获取用户信息')
    }

    const userLevel = userAccount.data.account_level

    // 查询VIP活动
    const { LotteryCampaign, LotteryPrize } = require('../../models')
    const { Op } = require('sequelize')

    const vipCampaigns = await LotteryCampaign.findAll({
      where: {
        campaign_type: { [Op.in]: ['premium', 'special'] },
        required_level: { [Op.ne]: null },
        status: 'active',
        is_active: true
      },
      include: [
        {
          model: LotteryPrize,
          as: 'prizes',
          where: { is_active: true },
          required: false
        }
      ],
      order: [['required_level', 'DESC'], ['cost_per_draw', 'DESC']]
    })

    // 为每个活动添加用户权限状态
    const campaignsWithPermission = await Promise.all(
      vipCampaigns.map(async (campaign) => {
        const permission = await LotteryService.checkAdvancedDrawPermission(
          userId,
          campaign.campaign_id,
          campaign.pool_rules || {}
        )

        return {
          ...campaign.toJSON(),
          user_permission: permission
        }
      })
    )

    res.json({
      success: true,
      data: {
        campaigns: campaignsWithPermission,
        user_level: userLevel,
        accessible_count: campaignsWithPermission.filter(c => c.user_permission.canDraw).length
      },
      message: 'VIP活动列表获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取VIP活动错误:', error)
    res.status(500).json({
      success: false,
      error: 'GET_VIP_CAMPAIGNS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * POST /api/v3/lottery/conditional-draw
 * 条件抽奖执行
 */
router.post('/conditional-draw', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { campaign_id, force_check = true } = req.body

    console.log(`🔒 条件抽奖: 用户ID=${userId}, 活动ID=${campaign_id}`)

    // 1. 先进行权限检查
    if (force_check) {
      const { LotteryCampaign } = require('../../models')
      const campaign = await LotteryCampaign.findByPk(campaign_id)
      if (!campaign) {
        throw new Error('活动不存在')
      }

      const additionalChecks = campaign.pool_rules || {}

      const permission = await LotteryService.checkAdvancedDrawPermission(
        userId,
        campaign_id,
        additionalChecks
      )

      if (!permission.canDraw) {
        return res.status(403).json({
          success: false,
          error: 'PERMISSION_DENIED',
          message: '抽奖条件不满足',
          data: {
            checks: permission.checkResults,
            recommendation: permission.recommendation
          },
          timestamp: new Date().toISOString()
        })
      }
    }

    // 2. 执行抽奖
    const result = await LotteryService.executeDraw(userId, campaign_id, {
      conditionChecked: true
    })

    res.json({
      success: true,
      data: result,
      message: '条件抽奖完成',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('条件抽奖错误:', error)
    res.status(500).json({
      success: false,
      error: 'CONDITIONAL_DRAW_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * 🔥 多池系统扩展API - 基于MultiPoolService
 */

/**
 * GET /api/v3/lottery/pools/:poolId/campaigns
 * 获取特定池子的专属活动
 */
router.get('/pools/:poolId/campaigns', requireUser, async (req, res) => {
  try {
    const { poolId } = req.params
    const userId = req.user.user_id

    console.log(`🎱 池子活动查询: 用户=${userId}, 池ID=${poolId}`)

    // 首先验证池子访问权限
    const { User, UserPointsAccount } = require('../../models')
    const user = await User.findByPk(userId, {
      include: [{ model: UserPointsAccount, as: 'pointsAccount' }]
    })

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: '用户不存在',
        timestamp: new Date().toISOString()
      })
    }

    // 调用MultiPoolService获取池子活动
    const MultiPoolService = require('../../services/MultiPoolService')
    const poolCampaigns = await MultiPoolService.getPoolCampaigns(poolId)

    res.json({
      success: true,
      data: {
        poolId,
        campaigns: poolCampaigns,
        totalCampaigns: poolCampaigns.length,
        userId
      },
      message: '池子活动获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 池子活动查询失败:', error)
    res.status(500).json({
      success: false,
      error: 'POOL_CAMPAIGNS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/lottery/pools/statistics
 * 获取多池系统统计数据（管理员接口）
 */
router.get('/pools/statistics', requireAdmin, async (req, res) => {
  try {
    const { poolType, period = '7d' } = req.query

    console.log(`📊 多池统计查询: 池类型=${poolType}, 周期=${period}`)

    // 调用MultiPoolService获取统计数据
    const MultiPoolService = require('../../services/MultiPoolService')

    // 获取所有池的统计信息
    const availablePools = await MultiPoolService.getAvailablePools(null) // 管理员查看所有池

    const poolStatistics = []
    for (const pool of availablePools) {
      if (poolType && pool.poolType !== poolType) continue

      // 获取每个池的详细统计
      const poolStats = {
        poolId: pool.poolId,
        poolType: pool.poolType,
        name: pool.name,
        totalUsers: pool.totalUsers || 0,
        totalDraws: pool.totalDraws || 0,
        totalRewards: pool.totalRewards || 0,
        avgDrawsPerUser: pool.avgDrawsPerUser || 0,
        popularityScore: pool.popularityScore || 0
      }

      poolStatistics.push(poolStats)
    }

    res.json({
      success: true,
      data: {
        statistics: poolStatistics,
        summary: {
          totalPools: poolStatistics.length,
          totalUsers: poolStatistics.reduce((sum, pool) => sum + pool.totalUsers, 0),
          totalDraws: poolStatistics.reduce((sum, pool) => sum + pool.totalDraws, 0),
          totalRewards: poolStatistics.reduce((sum, pool) => sum + pool.totalRewards, 0)
        },
        filters: {
          poolType: poolType || 'all',
          period
        }
      },
      message: '多池统计数据获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 多池统计查询失败:', error)
    res.status(500).json({
      success: false,
      error: 'POOL_STATISTICS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * POST /api/v3/lottery/pools/:poolId/access
 * 检查用户对特定池子的访问权限
 */
router.post('/pools/:poolId/access', requireUser, async (req, res) => {
  try {
    const { poolId } = req.params
    const userId = req.user.user_id

    console.log(`🔐 池子权限检查: 用户=${userId}, 池ID=${poolId}`)

    // 获取用户信息和统计
    const { User, UserPointsAccount } = require('../../models')
    const user = await User.findByPk(userId, {
      include: [{ model: UserPointsAccount, as: 'pointsAccount' }]
    })

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: '用户不存在',
        timestamp: new Date().toISOString()
      })
    }

    // 调用MultiPoolService检查权限
    const MultiPoolService = require('../../services/MultiPoolService')

    // 获取用户抽奖统计
    const userStats = await MultiPoolService.getUserDrawingStats(userId)

    // 检查池子访问权限
    const poolConfig = { /* 池子配置可能需要从数据库获取 */ }
    const accessResult = await MultiPoolService.checkPoolAccess(user, userStats, poolConfig, poolId)

    res.json({
      success: true,
      data: {
        userId,
        poolId,
        hasAccess: accessResult.hasAccess,
        accessLevel: accessResult.accessLevel,
        requirements: accessResult.requirements,
        userStatus: accessResult.userStatus,
        restrictions: accessResult.restrictions
      },
      message: accessResult.hasAccess ? '拥有池子访问权限' : '不满足池子访问条件',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 池子权限检查失败:', error)
    res.status(500).json({
      success: false,
      error: 'POOL_ACCESS_CHECK_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/lottery/pools/:poolId/user-stats
 * 获取用户在特定池子的统计数据
 */
router.get('/pools/:poolId/user-stats', requireUser, async (req, res) => {
  try {
    const { poolId } = req.params
    const userId = req.user.user_id

    console.log(`📈 用户池子统计: 用户=${userId}, 池ID=${poolId}`)

    // 调用MultiPoolService获取用户池子统计
    const MultiPoolService = require('../../services/MultiPoolService')
    const userPoolStats = await MultiPoolService.getUserPoolStats(userId, { poolType: poolId })

    // 获取今日使用情况
    const todayUsage = await MultiPoolService.getTodayUsage(userId, poolId)

    res.json({
      success: true,
      data: {
        userId,
        poolId,
        statistics: userPoolStats,
        todayUsage,
        summary: {
          totalDraws: userPoolStats.totalDraws || 0,
          totalWins: userPoolStats.totalWins || 0,
          winRate: userPoolStats.winRate || 0,
          totalSpent: userPoolStats.totalSpent || 0,
          totalRewards: userPoolStats.totalRewards || 0
        }
      },
      message: '用户池子统计获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 用户池子统计失败:', error)
    res.status(500).json({
      success: false,
      error: 'USER_POOL_STATS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

module.exports = router
