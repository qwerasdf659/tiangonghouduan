/**
 * 抽奖管理模块 - 干预规则列表和管理API
 *
 * @description 提供lottery_management_settings表的管理员查询能力
 * @version 1.0.0
 * @date 2026-01-09
 *
 * 业务范围：
 * - 查询所有干预规则（lottery_management_settings）
 * - 获取单个干预规则详情
 * - 取消干预规则
 *
 * 设计依据（文档6.5）：
 * - lottery_management_settings表有869行数据
 * - 后端有AdminLotteryService服务但无console路由
 * - 本模块为数据库已存在表提供规范的读取API
 *
 * 架构规范：
 * - 路由层通过 ServiceManager 获取服务
 * - 使用 adminAuthMiddleware 确保管理员权限
 */

const express = require('express')
const router = express.Router()
const { adminAuthMiddleware, asyncHandler } = require('../shared/middleware')

/**
 * GET /interventions - 获取干预规则列表
 *
 * @description 分页查询lottery_management_settings表，支持状态筛选和用户搜索
 * @route GET /api/v4/console/lottery-management/interventions
 * @access Private (需要管理员权限)
 *
 * @query {number} page - 页码，默认1
 * @query {number} page_size - 每页数量，默认20
 * @query {string} status - 状态筛选：active/used/expired/cancelled
 * @query {string} user_search - 用户搜索（用户ID或手机号）
 * @query {string} setting_type - 设置类型筛选
 */
router.get(
  '/interventions',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { page = 1, page_size = 20, status, user_search, setting_type } = req.query

      // 构建查询条件
      const models = require('../../../../models')
      const { Op } = require('sequelize')

      const where = {}

      // 状态筛选 - 基于expires_at和is_active字段判断
      if (status === 'active') {
        where.is_active = true
        where[Op.or] = [{ expires_at: null }, { expires_at: { [Op.gt]: new Date() } }]
      } else if (status === 'expired') {
        where.expires_at = { [Op.lt]: new Date() }
      } else if (status === 'cancelled') {
        where.is_active = false
      } else if (status === 'used') {
        // 已使用的干预需要根据业务逻辑判断
        where.is_active = false
        where.expires_at = { [Op.gt]: new Date() }
      }

      // 用户搜索
      if (user_search) {
        // 先查找匹配的用户
        const matchedUsers = await models.User.findAll({
          where: {
            [Op.or]: [
              { user_id: isNaN(user_search) ? null : parseInt(user_search) },
              { mobile: { [Op.like]: `%${user_search}%` } }
            ]
          },
          attributes: ['user_id']
        })
        const userIds = matchedUsers.map(u => u.user_id)
        if (userIds.length > 0) {
          where.target_user_id = { [Op.in]: userIds }
        } else {
          // 没有匹配用户，返回空结果
          return res.apiSuccess(
            {
              interventions: [],
              pagination: {
                page: parseInt(page),
                page_size: parseInt(page_size),
                total: 0,
                total_pages: 0
              }
            },
            '干预规则列表查询成功'
          )
        }
      }

      // 设置类型筛选
      if (setting_type) {
        where.setting_type = setting_type
      }

      // 分页查询
      const offset = (parseInt(page) - 1) * parseInt(page_size)
      const limit = parseInt(page_size)

      const { count, rows } = await models.LotteryManagementSetting.findAndCountAll({
        where,
        include: [
          {
            model: models.User,
            as: 'targetUser',
            attributes: ['user_id', 'nickname', 'mobile'],
            required: false
          },
          {
            model: models.User,
            as: 'operator',
            attributes: ['user_id', 'nickname'],
            required: false
          },
          {
            model: models.LotteryPrize,
            as: 'prize',
            attributes: ['prize_id', 'name', 'prize_type', 'image_url'],
            required: false
          }
        ],
        order: [['created_at', 'DESC']],
        offset,
        limit
      })

      // 格式化返回数据
      const interventions = rows.map(setting => ({
        id: setting.setting_id,
        user_id: setting.target_user_id,
        user_nickname: setting.targetUser?.nickname || `用户${setting.target_user_id}`,
        user_mobile: setting.targetUser?.mobile,
        setting_type: setting.setting_type,
        setting_value: setting.setting_value,
        prize_id: setting.prize_id,
        prize_name: setting.prize?.name,
        prize_type: setting.prize?.prize_type,
        reason: setting.reason,
        operator_id: setting.operator_id,
        operator_name: setting.operator?.nickname || `管理员${setting.operator_id}`,
        is_active: setting.is_active,
        expires_at: setting.expires_at,
        created_at: setting.created_at,
        // 计算状态
        status: !setting.is_active
          ? 'cancelled'
          : setting.expires_at && new Date(setting.expires_at) < new Date()
            ? 'expired'
            : 'active'
      }))

      return res.apiSuccess(
        {
          interventions,
          pagination: {
            page: parseInt(page),
            page_size: parseInt(page_size),
            total: count,
            total_pages: Math.ceil(count / parseInt(page_size))
          }
        },
        '干预规则列表查询成功'
      )
    } catch (error) {
      return res.apiInternalError('干预规则列表查询失败', error.message, 'INTERVENTIONS_LIST_ERROR')
    }
  })
)

/**
 * GET /interventions/:id - 获取单个干预规则详情
 *
 * @route GET /api/v4/console/lottery-management/interventions/:id
 * @access Private (需要管理员权限)
 */
router.get(
  '/interventions/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params

      const models = require('../../../../models')

      const setting = await models.LotteryManagementSetting.findByPk(id, {
        include: [
          {
            model: models.User,
            as: 'targetUser',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: models.User,
            as: 'operator',
            attributes: ['user_id', 'nickname']
          },
          {
            model: models.LotteryPrize,
            as: 'prize',
            attributes: ['prize_id', 'name', 'prize_type', 'image_url', 'description']
          }
        ]
      })

      if (!setting) {
        return res.apiError('干预规则不存在', 'INTERVENTION_NOT_FOUND', null, 404)
      }

      return res.apiSuccess(
        {
          id: setting.setting_id,
          user_id: setting.target_user_id,
          user_nickname: setting.targetUser?.nickname,
          user_mobile: setting.targetUser?.mobile,
          setting_type: setting.setting_type,
          setting_value: setting.setting_value,
          prize_id: setting.prize_id,
          prize: setting.prize,
          reason: setting.reason,
          operator_id: setting.operator_id,
          operator_name: setting.operator?.nickname,
          is_active: setting.is_active,
          expires_at: setting.expires_at,
          created_at: setting.created_at,
          updated_at: setting.updated_at,
          status: !setting.is_active
            ? 'cancelled'
            : setting.expires_at && new Date(setting.expires_at) < new Date()
              ? 'expired'
              : 'active'
        },
        '干预规则详情查询成功'
      )
    } catch (error) {
      return res.apiInternalError(
        '干预规则详情查询失败',
        error.message,
        'INTERVENTION_DETAIL_ERROR'
      )
    }
  })
)

/**
 * POST /interventions/:id/cancel - 取消干预规则
 *
 * @route POST /api/v4/console/lottery-management/interventions/:id/cancel
 * @access Private (需要管理员权限)
 */
router.post(
  '/interventions/:id/cancel',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params
      const { reason = '管理员手动取消' } = req.body

      const models = require('../../../../models')

      const setting = await models.LotteryManagementSetting.findByPk(id)

      if (!setting) {
        return res.apiError('干预规则不存在', 'INTERVENTION_NOT_FOUND', null, 404)
      }

      if (!setting.is_active) {
        return res.apiError('干预规则已被取消或失效', 'INTERVENTION_ALREADY_CANCELLED', null, 400)
      }

      // 更新状态为已取消
      await setting.update({
        is_active: false,
        updated_by: req.user?.user_id,
        reason: `${setting.reason || ''}（${reason}）`
      })

      return res.apiSuccess(
        {
          id: setting.setting_id,
          status: 'cancelled',
          cancelled_at: new Date(),
          cancelled_by: req.user?.user_id
        },
        '干预规则已取消'
      )
    } catch (error) {
      return res.apiInternalError('取消干预规则失败', error.message, 'INTERVENTION_CANCEL_ERROR')
    }
  })
)

module.exports = router
