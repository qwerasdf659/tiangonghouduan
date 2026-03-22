/**
 * 餐厅积分抽奖系统 V4.0 - 系统状态和配置API路由
 *
 * 功能：
 * - 获取系统状态信息
 * - 获取业务配置（前后端共享配置）
 *
 * 路由前缀：/api/v4/system
 *
 * 创建时间：2025年12月22日
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../utils/logger').logger
const { optionalAuth } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const dataAccessControl = require('../../../middleware/dataAccessControl')
const BeijingTimeHelper = require('../../../utils/timeHelper')

/**
 * @route GET /api/v4/system/status
 * @desc 获取系统状态信息
 * @access Public
 *
 * @returns {Object} 系统状态信息
 * @returns {string} system.server_time - 服务器时间（北京时间）
 * @returns {string} system.status - 系统状态（running）
 * @returns {string} system.version - 系统版本号
 * @returns {Object} system.statistics - 统计信息（仅管理员可见）
 */
router.get('/status', optionalAuth, dataAccessControl, async (req, res) => {
  try {
    const dataLevel = req.role_level >= 100 ? 'full' : 'public'

    // 系统基本状态
    const systemStatus = {
      server_time: BeijingTimeHelper.nowLocale(),
      status: 'running',
      version: '4.0.0'
    }

    /*
     * 管理员可见的详细统计信息（Admin-only Statistics）
     * ✅ P2-C架构重构：使用 ReportingService.getSystemStatus() 统一查询（符合TR-005规范）
     */
    if (dataLevel === 'full') {
      // 🔄 通过 ServiceManager 获取 StatsService（V4.7.0 服务拆分）
      const StatsService = req.app.locals.services.getService('reporting_stats')

      // ✅ 使用 Service 查询系统状态统计（不直接操作models）
      const statistics = await StatsService.getSystemOverview()

      // 添加统计数据到响应中（Add Statistics to Response）
      systemStatus.statistics = {
        total_users: statistics.total_users, // 用户总数（包含所有状态：active/inactive/banned）
        active_announcements: statistics.active_announcements, // 活跃公告数（is_active=true）
        pending_feedbacks: statistics.pending_feedbacks // 待处理反馈数（status='pending'）
      }
    }

    return res.apiSuccess(
      {
        system: systemStatus
      },
      '获取系统状态成功'
    )
  } catch (error) {
    logger.error('获取系统状态失败:', error)
    return handleServiceError(error, res, '获取系统状态失败')
  }
})

/**
 * @route GET /api/v4/system/business-config
 * @desc 获取业务配置（前后端共享配置）
 * @access Public
 *
 * @description
 * 返回统一的业务配置，包括：
 * - 连抽定价配置（单抽/3连抽/5连抽/10连抽）- 从 DB 动态读取单抽价格
 * - 每日抽奖上限 - 从 DB 动态读取
 * - 积分系统规则（上限/下限/验证规则）
 * - 用户系统配置（昵称规则/验证码有效期）
 * - 图片上传限制（文件大小/类型/数量）
 * - 分页配置（用户/管理员）
 *
 * @配置来源
 * - lottery_cost_points: DB system_settings（运营可调）
 * - daily_lottery_limit: DB system_settings（运营可调）
 * - 其他配置: config/business.config.js（代码层固定）
 *
 * @returns {Object} 业务配置信息
 */
router.get('/business-config', optionalAuth, dataAccessControl, async (req, res) => {
  try {
    // 读取代码层固定配置
    const businessConfig = require('../../../config/business.config')

    /*
     * 🔴 从 DB 读取运营可调参数（严格模式：配置缺失直接报错）
     * P1-9：通过 ServiceManager 获取服务（snake_case key）
     */
    const AdminSystemService = req.app.locals.services.getService('admin_system')

    // 读取单抽价格和每日上限（严格模式）
    const [singleDrawCost, dailyLimit] = await Promise.all([
      AdminSystemService.getSettingValue('points', 'lottery_cost_points', null, { strict: true }),
      AdminSystemService.getSettingValue('points', 'daily_lottery_limit', null, { strict: true })
    ])

    /*
     * 动态计算连抽定价（基于 DB 读取的单抽价格）
     *
     * 🔄 2026-01-19 架构迁移说明：
     * - 定价配置已从 business.config.lottery.draw_types 迁移到 lottery_campaign_pricing_config 表
     * - 此处返回系统级默认配置（不依赖特定活动）
     * - 活动级定价配置应通过 /api/v4/lottery/campaigns/:code/config 获取
     *
     * 🔴 2026-01-21 技术债务修复：
     * - 活动级定价计算已迁移至 LotteryPricingService.getDrawPricing()
     *
     * @see services/lottery/LotteryPricingService.js - 统一定价服务
     * @see routes/v4/console/lottery/pricing-config.js - 定价配置管理
     */
    const defaultDiscounts = {
      single: { count: 1, discount: 1.0, label: '单抽' },
      triple: { count: 3, discount: 1.0, label: '3连抽' },
      five: { count: 5, discount: 1.0, label: '5连抽' },
      ten: { count: 10, discount: 0.9, label: '10连抽(九折)' }
    }
    const drawPricing = {}
    for (const [type, config] of Object.entries(defaultDiscounts)) {
      drawPricing[type] = {
        count: config.count,
        discount: config.discount,
        label: config.label,
        per_draw: Math.floor(singleDrawCost * config.discount), // 折后单价
        total_cost: Math.floor(singleDrawCost * config.count * config.discount) // 总价
      }
    }

    // 根据用户角色返回不同级别的配置（role_level >= 100 为管理员）
    const dataLevel = req.role_level >= 100 ? 'full' : 'public'

    // 公开配置（所有用户可见）
    const publicConfig = {
      lottery: {
        draw_pricing: drawPricing, // 连抽定价配置（动态计算）
        daily_limit: dailyLimit, // 每日抽奖上限（从 DB 读取）
        free_draw_allowed: businessConfig.lottery.free_draw_allowed // 是否允许免费抽奖
      },
      points: {
        display_name: businessConfig.points.display_name, // 积分显示名称
        max_balance: businessConfig.points.max_balance, // 积分上限
        min_balance: businessConfig.points.min_balance // 积分下限
      },
      user: {
        nickname: {
          min_length: businessConfig.user.nickname.min_length, // 昵称最小长度
          max_length: businessConfig.user.nickname.max_length // 昵称最大长度
        },
        verification_code: {
          expiry_seconds: businessConfig.user.verification_code.expiry_seconds, // 验证码有效期（秒）
          resend_interval: businessConfig.user.verification_code.resend_interval // 重发间隔（秒）
        }
      },
      upload: {
        image: {
          max_size_mb: businessConfig.upload.image.max_size_mb, // 图片最大大小（MB）
          max_count: businessConfig.upload.image.max_count, // 单次最大上传数量
          allowed_types: businessConfig.upload.image.allowed_types // 允许的文件类型
        }
      },
      pagination: {
        user: businessConfig.pagination.user, // 普通用户分页配置
        admin: dataLevel === 'full' ? businessConfig.pagination.admin : undefined // 管理员分页配置（仅管理员可见）
      }
    }

    // 管理员可见的完整配置
    if (dataLevel === 'full') {
      publicConfig.points.validation = businessConfig.points.validation // 积分验证规则（仅管理员可见）
      publicConfig.lottery.daily_reset_time = businessConfig.lottery.daily_reset_time // 每日限制重置时间（仅管理员可见）
    }

    return res.apiSuccess(
      {
        config: publicConfig,
        version: '4.0.0',
        last_updated: '2025-12-30', // 更新日期：配置管理三层分离方案实施
        config_source: {
          lottery_cost_points: 'DB system_settings',
          daily_lottery_limit: 'DB system_settings',
          other: 'config/business.config.js'
        }
      },
      '获取业务配置成功'
    )
  } catch (error) {
    logger.error('获取业务配置失败:', error)
    return handleServiceError(error, res, '获取业务配置失败')
  }
})

module.exports = router
