/**
 * 🔥 VIP系统API接口 v3 - VIP等级和权益管理
 * 创建时间：2025年01月21日 UTC
 * 特点：VIP等级管理 + 权益查询 + 升级机制 + 特权验证
 * 路径：/api/v3/vip
 * 基于：VIPSystemService (14KB, 492行) - 企业级实现
 */

'use strict'

const express = require('express')
const router = express.Router()
const VIPSystemService = require('../../services/VIPSystemService')
const { requireUser, requireAdmin } = require('../../middleware/auth')
const validationMiddleware = require('../../middleware/validation')

/**
 * GET /api/v3/vip/status
 * 获取当前用户VIP状态和权益信息
 */
router.get('/status', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id

    console.log(`🔍 获取VIP状态: 用户=${userId}`)

    // 调用现有Service方法获取VIP信息
    const vipInfo = await VIPSystemService.getUserVIPInfo(userId)

    res.json({
      success: true,
      data: {
        userId,
        currentLevel: vipInfo.currentLevel,
        levelName: vipInfo.levelInfo.name,
        levelDescription: vipInfo.levelInfo.description,
        levelColor: vipInfo.levelInfo.color,
        levelIcon: vipInfo.levelInfo.icon,
        benefits: vipInfo.levelInfo.benefits,
        stats: vipInfo.userStats,
        upgrade: vipInfo.upgradeInfo,
        canUpgrade: vipInfo.canUpgrade,
        nextLevel: vipInfo.nextLevel
      },
      message: 'VIP状态获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ VIP状态查询失败:', error)
    res.status(500).json({
      success: false,
      error: 'VIP_STATUS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * POST /api/v3/vip/upgrade
 * 检查并执行VIP升级
 */
router.post('/upgrade', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id

    console.log(`🚀 VIP升级请求: 用户=${userId}`)

    // 调用现有Service方法检查并升级VIP
    const upgradeResult = await VIPSystemService.checkAndUpgradeVIP(userId)

    if (upgradeResult.upgraded) {
      res.json({
        success: true,
        data: {
          upgraded: true,
          previousLevel: upgradeResult.previousLevel,
          newLevel: upgradeResult.newLevel,
          rewards: upgradeResult.rewards,
          newBenefits: upgradeResult.newBenefits
        },
        message: `恭喜！您已升级到${upgradeResult.newLevelName}`,
        timestamp: new Date().toISOString()
      })
    } else {
      res.json({
        success: true,
        data: {
          upgraded: false,
          currentLevel: upgradeResult.currentLevel,
          requirements: upgradeResult.requirements,
          progress: upgradeResult.progress
        },
        message: '暂未满足升级条件',
        timestamp: new Date().toISOString()
      })
    }
  } catch (error) {
    console.error('❌ VIP升级失败:', error)
    res.status(500).json({
      success: false,
      error: 'VIP_UPGRADE_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/vip/benefits
 * 获取VIP权益详情和等级对比
 */
router.get('/benefits', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id

    console.log(`📋 获取VIP权益: 用户=${userId}`)

    // 获取用户当前VIP信息
    const vipInfo = await VIPSystemService.getUserVIPInfo(userId)

    // 获取所有VIP等级配置（用于对比）
    const allLevels = VIPSystemService.vipLevelConfigs

    res.json({
      success: true,
      data: {
        currentLevel: vipInfo.currentLevel,
        currentBenefits: vipInfo.levelInfo.benefits,
        allLevels: Object.keys(allLevels).map(level => ({
          level: parseInt(level),
          name: allLevels[level].name,
          description: allLevels[level].description,
          benefits: allLevels[level].benefits,
          requirements: {
            requiredSpent: allLevels[level].requiredSpent,
            requiredActiveDays: allLevels[level].requiredActiveDays
          },
          color: allLevels[level].color,
          icon: allLevels[level].icon
        })),
        userProgress: vipInfo.userStats
      },
      message: 'VIP权益信息获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 获取VIP权益失败:', error)
    res.status(500).json({
      success: false,
      error: 'VIP_BENEFITS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * POST /api/v3/vip/check-access
 * 检查用户是否有特定VIP权限
 */
router.post('/check-access',
  requireUser,
  validationMiddleware([
    { field: 'accessType', type: 'string', required: true }
  ]),
  async (req, res) => {
    try {
      const userId = req.user.user_id
      const { accessType } = req.body

      console.log(`🔐 检查VIP权限: 用户=${userId}, 权限=${accessType}`)

      // 调用现有Service方法检查VIP权限
      const hasAccess = await VIPSystemService.checkVIPAccess(userId, accessType)

      res.json({
        success: true,
        data: {
          hasAccess,
          accessType,
          userId
        },
        message: hasAccess ? '拥有此权限' : '权限不足',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ VIP权限检查失败:', error)
      res.status(500).json({
        success: false,
        error: 'VIP_ACCESS_CHECK_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * POST /api/v3/vip/daily-bonus
 * 领取VIP每日奖励
 */
router.post('/daily-bonus', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id

    console.log(`🎁 VIP每日奖励: 用户=${userId}`)

    // 调用现有Service方法发放每日VIP奖励
    const bonusResult = await VIPSystemService.grantDailyVIPBonus(userId)

    if (bonusResult.granted) {
      res.json({
        success: true,
        data: {
          granted: true,
          bonusPoints: bonusResult.bonusPoints,
          vipLevel: bonusResult.vipLevel,
          nextClaimTime: bonusResult.nextClaimTime
        },
        message: `获得${bonusResult.bonusPoints}积分VIP每日奖励`,
        timestamp: new Date().toISOString()
      })
    } else {
      res.json({
        success: false,
        data: {
          granted: false,
          reason: bonusResult.reason,
          nextClaimTime: bonusResult.nextClaimTime
        },
        message: bonusResult.reason || '今日已领取',
        timestamp: new Date().toISOString()
      })
    }
  } catch (error) {
    console.error('❌ VIP每日奖励失败:', error)
    res.status(500).json({
      success: false,
      error: 'VIP_DAILY_BONUS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * POST /api/v3/vip/apply-discount
 * 应用VIP折扣（内部接口，供其他系统调用）
 */
router.post('/apply-discount',
  requireUser,
  validationMiddleware([
    { field: 'originalCost', type: 'number', required: true, min: 0 },
    { field: 'discountType', type: 'string', required: false }
  ]),
  async (req, res) => {
    try {
      const userId = req.user.user_id
      const { originalCost, discountType = 'lottery' } = req.body

      console.log(`💰 应用VIP折扣: 用户=${userId}, 原价=${originalCost}, 类型=${discountType}`)

      // 调用现有Service方法应用VIP折扣
      const discountResult = await VIPSystemService.applyVIPDiscount(userId, originalCost, discountType)

      res.json({
        success: true,
        data: {
          originalCost,
          finalCost: discountResult.finalCost,
          discountAmount: discountResult.discountAmount,
          discountRate: discountResult.discountRate,
          vipLevel: discountResult.vipLevel,
          discountType
        },
        message: `VIP折扣应用成功，节省${discountResult.discountAmount}积分`,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ VIP折扣应用失败:', error)
      res.status(500).json({
        success: false,
        error: 'VIP_DISCOUNT_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * GET /api/v3/vip/history/:userId
 * 获取用户VIP历史记录（管理员接口）
 */
router.get('/history/:userId', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params

    console.log(`📊 VIP历史查询: 管理员查询用户=${userId}`)

    // 获取用户统计信息
    const userStats = await VIPSystemService.calculateUserStats(userId)
    const vipInfo = await VIPSystemService.getUserVIPInfo(userId)

    res.json({
      success: true,
      data: {
        userId: parseInt(userId),
        currentVIP: vipInfo,
        statistics: userStats,
        levelHistory: userStats.levelHistory || [],
        upgradeHistory: userStats.upgradeHistory || []
      },
      message: 'VIP历史记录获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ VIP历史查询失败:', error)
    res.status(500).json({
      success: false,
      error: 'VIP_HISTORY_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

module.exports = router
