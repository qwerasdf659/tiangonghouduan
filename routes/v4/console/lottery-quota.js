/**
 * @file 管理员抽奖配额管理路由（V4.5 配额控制方案）
 * @description 抽奖次数配额规则管理接口
 *
 * 架构原则（2025-12-31 重构）：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 路由层不开启事务（事务管理在 Service 层）
 * - 通过 LotteryQuotaService 统一处理配额业务逻辑
 *
 * 业务场景：
 * - 配额规则查询（支持四维度：全局/活动/角色/用户）
 * - 配额规则新增（版本化，保留历史）
 * - 配额规则禁用（status = inactive）
 * - 用户配额状态查询（今日已用/剩余/上限）
 * - 客服临时加次数（bonus_draw_count）
 *
 * 四维度优先级（写死，不可配置）：
 * - user > role > campaign > global
 *
 * 创建时间：2025-12-23
 * 重构时间：2025-12-31（移除直接 Model 操作，统一通过 Service）
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger
// P1-9：服务通过 ServiceManager 获取（B1-Injected + E2-Strict snake_case）

/**
 * P1-9：获取 LotteryQuotaService 的辅助函数
 * @param {Object} req - Express 请求对象
 * @returns {Object} LotteryQuotaService
 */
function getLotteryQuotaService(req) {
  return req.app.locals.services.getService('lottery_quota')
}

/**
 * 格式化配额规则数据用于API响应
 * @param {Object} ruleInstanceOrPlain - Sequelize模型实例或普通对象
 * @returns {Object} 格式化后的配额规则对象
 */
function formatQuotaRuleForApi(ruleInstanceOrPlain) {
  const rule =
    typeof ruleInstanceOrPlain?.get === 'function'
      ? ruleInstanceOrPlain.get({ plain: true })
      : { ...(ruleInstanceOrPlain || {}) }

  return {
    ...rule
  }
}

/**
 * 查询配额规则列表
 * GET /api/v4/console/lottery-quota/rules
 *
 * Query参数：
 * - rule_type: 规则类型（global/campaign/role/user，可选）
 * - lottery_campaign_id: 活动ID（可选）
 * - is_active: 是否激活（可选，true/false）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 *
 * 返回：规则列表（含优先级信息）
 */
router.get('/rules', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { rule_type, lottery_campaign_id, is_active, page = 1, page_size = 20 } = req.query

    // 通过 Service 层查询规则列表（2025-12-31 重构：移除直接 Model 操作）
    const { rules, pagination } = await getLotteryQuotaService(req).getRulesList({
      rule_type,
      lottery_campaign_id,
      is_active,
      page,
      page_size
    })

    logger.info('查询配额规则列表', {
      admin_id: req.user.user_id,
      filters: { rule_type, lottery_campaign_id, is_active },
      total: pagination.total_count
    })

    return res.apiSuccess(
      {
        rules: rules.map(formatQuotaRuleForApi),
        pagination
      },
      '查询配额规则成功'
    )
  } catch (error) {
    logger.error('查询配额规则失败:', error)
    return res.apiError(`查询配额规则失败：${error.message}`, 'QUERY_RULES_FAILED', null, 500)
  }
})

/**
 * 获取单个配额规则详情
 * GET /api/v4/console/lottery-quota/rules/:id
 *
 * API路径参数设计规范 V2.2（2026-01-20）：
 * - 配额规则是事务实体（按需创建），使用数字ID（:id）作为标识符
 *
 * 返回：规则详情（含优先级信息）
 */
router.get('/rules/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const rule_id = parseInt(req.params.id, 10)

    if (isNaN(rule_id) || rule_id <= 0) {
      return res.apiError('无效的规则ID', 'INVALID_RULE_ID', null, 400)
    }

    const rule = await getLotteryQuotaService(req).getRuleById(rule_id)

    logger.info('获取配额规则详情', {
      admin_id: req.user.user_id,
      rule_id
    })

    return res.apiSuccess(formatQuotaRuleForApi(rule), '获取配额规则详情成功')
  } catch (error) {
    logger.error('获取配额规则详情失败:', error)
    const statusCode = error.status || 500
    const errorCode = error.code || 'GET_RULE_FAILED'
    return res.apiError(error.message, errorCode, null, statusCode)
  }
})

/**
 * 创建配额规则
 * POST /api/v4/console/lottery-quota/rules
 *
 * Body参数：
 * - rule_type: 规则类型（必填，global/campaign/role/user）
 * - lottery_campaign_id: 活动ID（campaign类型必填；其他类型可传但当前实现不会参与scope匹配）
 * - role_uuid: 角色UUID（role类型必填）
 * - target_user_id: 目标用户ID（user类型必填）
 * - limit_value: 每日抽奖次数上限（必填，正整数）
 * - effective_from: 生效开始时间（可选，ISO8601格式）
 * - effective_to: 生效结束时间（可选，ISO8601格式）
 * - reason: 创建原因（可选）
 *
 * 返回：创建的规则信息
 */
router.post('/rules', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const {
      rule_type,
      lottery_campaign_id,
      role_uuid,
      target_user_id,
      limit_value,
      effective_from,
      effective_to,
      reason
    } = req.body

    // 参数验证
    if (!rule_type || !['global', 'campaign', 'role', 'user'].includes(rule_type)) {
      return res.apiError(
        '无效的规则类型，必须为 global/campaign/role/user',
        'INVALID_RULE_TYPE',
        null,
        400
      )
    }

    if (!limit_value || parseInt(limit_value) <= 0) {
      return res.apiError('limit_value 必须为正整数', 'INVALID_LIMIT_VALUE', null, 400)
    }

    // 根据规则类型验证必填参数
    if (rule_type === 'campaign' && !lottery_campaign_id) {
      return res.apiError(
        'campaign类型规则必须指定 lottery_campaign_id',
        'MISSING_CAMPAIGN_ID',
        null,
        400
      )
    }

    if (rule_type === 'role' && !role_uuid) {
      return res.apiError('role类型规则必须指定 role_uuid', 'MISSING_ROLE_PARAMS', null, 400)
    }

    if (rule_type === 'user' && !target_user_id) {
      return res.apiError('user类型规则必须指定 target_user_id', 'MISSING_USER_PARAMS', null, 400)
    }

    // 通过 Service 层创建规则（2025-12-31 重构：移除直接 Model 操作）
    const rule = await getLotteryQuotaService(req).createRule({
      rule_type,
      lottery_campaign_id,
      role_uuid,
      target_user_id,
      limit_value,
      effective_from,
      effective_to,
      reason,
      created_by: req.user.user_id
    })

    logger.info('创建配额规则成功', {
      admin_id: req.user.user_id,
      rule_id: rule.rule_id,
      rule_type,
      limit_value
    })

    return res.apiSuccess(formatQuotaRuleForApi(rule), '创建配额规则成功')
  } catch (error) {
    logger.error('创建配额规则失败:', error)
    return res.apiError(`创建配额规则失败：${error.message}`, 'CREATE_RULE_FAILED', null, 500)
  }
})

/**
 * 禁用配额规则
 * PUT /api/v4/console/lottery-quota/rules/:id/disable
 *
 * API路径参数设计规范 V2.2（2026-01-20）：
 * - 配额规则是事务实体（按需创建），使用数字ID（:id）作为标识符
 *
 * 硬约束：
 * - 禁止修改 limit_value 等核心字段
 * - 只允许修改 status 为 inactive
 * - 保留历史规则用于审计
 *
 * 返回：更新后的规则信息
 */
router.put('/rules/:id/disable', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const rule_id = parseInt(req.params.id, 10)

    // 通过 Service 层禁用规则（2025-12-31 重构：移除直接 Model 操作）
    const rule = await getLotteryQuotaService(req).disableRule({
      rule_id,
      updated_by: req.user.user_id
    })

    logger.info('禁用配额规则成功', {
      admin_id: req.user.user_id,
      rule_id: rule.rule_id,
      rule_type: rule.scope_type
    })

    return res.apiSuccess(formatQuotaRuleForApi(rule), '禁用配额规则成功')
  } catch (error) {
    logger.error('禁用配额规则失败:', error)
    // 处理 Service 层抛出的业务错误
    const statusCode = error.status || 500
    const errorCode = error.code || 'DISABLE_RULE_FAILED'
    return res.apiError(error.message, errorCode, null, statusCode)
  }
})

/**
 * 查询用户配额状态
 * GET /api/v4/console/lottery-quota/users/:user_id/status
 *
 * Query参数：
 * - lottery_campaign_id: 活动ID（必填）
 *
 * 返回：用户当日配额状态（已用/剩余/上限/bonus）
 */
router.get('/users/:user_id/status', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { user_id } = req.params
    const { lottery_campaign_id } = req.query

    if (!lottery_campaign_id) {
      return res.apiError('缺少必填参数 lottery_campaign_id', 'MISSING_CAMPAIGN_ID', null, 400)
    }

    const status = await getLotteryQuotaService(req).getOrInitQuotaStatus({
      user_id: parseInt(user_id),
      lottery_campaign_id: parseInt(lottery_campaign_id)
    })

    // 获取命中的规则信息（limit_value 在 status 中已有，此处仅需 matched_rule）
    const { matched_rule } = await getLotteryQuotaService(req).getEffectiveDailyLimit({
      user_id: parseInt(user_id),
      lottery_campaign_id: parseInt(lottery_campaign_id)
    })

    logger.info('查询用户配额状态', {
      admin_id: req.user.user_id,
      target_user_id: user_id,
      lottery_campaign_id,
      remaining: status.remaining
    })

    return res.apiSuccess(
      {
        user_id: parseInt(user_id),
        lottery_campaign_id: parseInt(lottery_campaign_id),
        quota_date: status.quota_date,
        limit_value: status.limit_value,
        used_draw_count: status.used_draw_count,
        bonus_draw_count: status.bonus_draw_count,
        remaining: status.remaining,
        total_available: status.total_available,
        is_exhausted: status.is_exhausted,
        last_draw_at: status.last_draw_at,
        matched_rule: matched_rule
          ? {
              rule_id: matched_rule.rule_id,
              rule_type: matched_rule.scope_type,
              limit_value: matched_rule.limit_value,
              priority: matched_rule.priority,
              scope_type: matched_rule.scope_type,
              scope_id: matched_rule.scope_id
            }
          : null
      },
      '查询用户配额状态成功'
    )
  } catch (error) {
    logger.error('查询用户配额状态失败:', error)
    return res.apiError(
      `查询用户配额状态失败：${error.message}`,
      'QUERY_USER_STATUS_FAILED',
      null,
      500
    )
  }
})

/**
 * 为用户添加临时补偿次数（客服用）
 * POST /api/v4/console/lottery-quota/users/:user_id/bonus
 *
 * Body参数：
 * - lottery_campaign_id: 活动ID（必填）
 * - bonus_count: 补偿次数（必填，正整数）
 * - reason: 补偿原因（必填）
 *
 * 返回：更新后的配额状态
 */
router.post('/users/:user_id/bonus', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { user_id } = req.params
    const { lottery_campaign_id, bonus_count, reason } = req.body

    // 参数验证
    if (!lottery_campaign_id) {
      return res.apiError('缺少必填参数 lottery_campaign_id', 'MISSING_CAMPAIGN_ID', null, 400)
    }

    if (!bonus_count || parseInt(bonus_count) <= 0) {
      return res.apiError('bonus_count 必须为正整数', 'INVALID_BONUS_COUNT', null, 400)
    }

    if (!reason || reason.trim().length === 0) {
      return res.apiError('必须提供补偿原因', 'MISSING_REASON', null, 400)
    }

    const result = await getLotteryQuotaService(req).addBonusDrawCount(
      {
        user_id: parseInt(user_id),
        lottery_campaign_id: parseInt(lottery_campaign_id),
        bonus_count: parseInt(bonus_count),
        reason: reason.trim()
      },
      {
        admin_id: req.user.user_id
      }
    )

    logger.info('添加用户临时补偿次数成功', {
      admin_id: req.user.user_id,
      target_user_id: user_id,
      lottery_campaign_id,
      bonus_count,
      reason
    })

    return res.apiSuccess(result, '添加临时补偿次数成功')
  } catch (error) {
    logger.error('添加用户临时补偿次数失败:', error)
    return res.apiError(`添加临时补偿次数失败：${error.message}`, 'ADD_BONUS_FAILED', null, 500)
  }
})

/**
 * 获取配额统计数据
 * GET /api/v4/console/lottery-quota/statistics
 *
 * Query参数：
 * - lottery_campaign_id: 活动ID（可选，不传则返回全局统计）
 *
 * 返回：配额规则和使用情况的汇总统计
 */
router.get('/statistics', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { lottery_campaign_id } = req.query

    const statistics = await getLotteryQuotaService(req).getStatistics({
      lottery_campaign_id: lottery_campaign_id ? parseInt(lottery_campaign_id) : null
    })

    logger.info('获取配额统计数据', {
      admin_id: req.user.user_id,
      lottery_campaign_id: lottery_campaign_id || 'global'
    })

    return res.apiSuccess(statistics, '获取配额统计数据成功')
  } catch (error) {
    logger.error('获取配额统计数据失败:', error)
    return res.apiError(
      `获取配额统计数据失败：${error.message}`,
      'GET_STATISTICS_FAILED',
      null,
      500
    )
  }
})

/**
 * 验证用户配额是否充足（预检查，不扣减）
 * GET /api/v4/console/lottery-quota/users/:user_id/check
 *
 * Query参数：
 * - lottery_campaign_id: 活动ID（必填）
 * - draw_count: 抽奖次数（可选，默认1）
 *
 * 返回：配额充足性检查结果
 */
router.get('/users/:user_id/check', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { user_id } = req.params
    const { lottery_campaign_id, draw_count = 1 } = req.query

    if (!lottery_campaign_id) {
      return res.apiError('缺少必填参数 lottery_campaign_id', 'MISSING_CAMPAIGN_ID', null, 400)
    }

    const result = await getLotteryQuotaService(req).checkQuotaSufficient({
      user_id: parseInt(user_id),
      lottery_campaign_id: parseInt(lottery_campaign_id),
      draw_count: parseInt(draw_count)
    })

    return res.apiSuccess(result, result.sufficient ? '配额充足' : '配额不足')
  } catch (error) {
    logger.error('检查用户配额失败:', error)
    return res.apiError(`检查用户配额失败：${error.message}`, 'CHECK_QUOTA_FAILED', null, 500)
  }
})

module.exports = router
