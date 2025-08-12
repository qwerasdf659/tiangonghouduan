/**
 * 用户信息路由 v2.0
 * 解决前端缺失用户信息接口的问题
 * 创建时间：2025年08月07日
 */

const express = require('express')
const { User, LotteryRecord, UploadReview } = require('../../models')
const ApiResponse = require('../../utils/ApiResponse')
const { authenticateToken } = require('../../middleware/auth')

const router = express.Router()

/**
 * @route GET /api/v2/user/info
 * @desc 获取当前用户信息
 * @access 认证用户
 */
router.get('/info', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id

    // 获取用户详细信息
    const user = await User.findOne({
      where: { user_id: userId },
      attributes: [
        'user_id',
        'mobile',
        'nickname',
        'avatar_url',
        'is_admin',
        'total_points',
        'status',
        'login_count',
        'last_login',
        'created_at'
      ]
    })

    if (!user) {
      return res.status(404).json(ApiResponse.error('用户不存在', 'USER_NOT_FOUND'))
    }

    // 检查用户状态
    if (user.status === 'banned') {
      return res.status(403).json(ApiResponse.error('用户已被禁用', 'USER_BANNED'))
    }

    res.json(ApiResponse.success(user, '获取用户信息成功'))
  } catch (error) {
    console.error('❌ 获取用户信息失败:', error.message)
    res.status(500).json(ApiResponse.error('获取用户信息失败', 'GET_USER_INFO_FAILED'))
  }
})

/**
 * @route GET /api/v2/user/statistics
 * @desc 获取用户统计数据
 * @access 认证用户
 */
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id

    // 先获取用户基本信息
    const user = await User.findOne({
      where: { user_id: userId },
      attributes: ['user_id', 'total_points', 'login_count', 'created_at']
    })

    if (!user) {
      return res.status(404).json(ApiResponse.error('用户不存在', 'USER_NOT_FOUND'))
    }

    // 安全地获取各项统计数据
    let totalLotteries = 0
    let winLotteries = 0
    let totalUploads = 0
    let approvedUploads = 0

    try {
      totalLotteries = await LotteryRecord.count({
        where: { user_id: userId }
      }) || 0
    } catch (error) {
      console.warn('获取抽奖统计失败:', error.message)
    }

    try {
      winLotteries = await LotteryRecord.count({
        where: {
          user_id: userId,
          is_winning: true
        }
      }) || 0
    } catch (error) {
      console.warn('获取中奖统计失败:', error.message)
    }

    try {
      totalUploads = await UploadReview.count({
        where: { user_id: userId }
      }) || 0
    } catch (error) {
      console.warn('获取上传统计失败:', error.message)
    }

    try {
      approvedUploads = await UploadReview.count({
        where: {
          user_id: userId,
          review_status: 'approved'
        }
      }) || 0
    } catch (error) {
      console.warn('获取审核统计失败:', error.message)
    }

    // 计算统计数据
    const statistics = {
      user_info: {
        user_id: user.user_id,
        total_points: user.total_points,
        member_days: Math.ceil((new Date() - new Date(user.created_at)) / (1000 * 60 * 60 * 24)),
        login_count: user.login_count
      },
      lottery_stats: {
        total_draws: totalLotteries,
        winning_draws: winLotteries,
        winning_rate: totalLotteries > 0 ? (winLotteries / totalLotteries * 100).toFixed(1) + '%' : '0%'
      },
      upload_stats: {
        total_uploads: totalUploads,
        approved_uploads: approvedUploads,
        approval_rate: totalUploads > 0 ? (approvedUploads / totalUploads * 100).toFixed(1) + '%' : '0%'
      },
      activity_level: {
        level: getUserActivityLevel(totalLotteries, totalUploads, user.login_count),
        description: getActivityDescription(totalLotteries, totalUploads, user.login_count)
      }
    }

    res.json(ApiResponse.success(statistics, '获取用户统计成功'))
  } catch (error) {
    console.error('❌ 获取用户统计失败:', error.message, error.stack)
    res.status(500).json(ApiResponse.error('获取用户统计失败', 'GET_USER_STATISTICS_FAILED'))
  }
})

/**
 * 计算用户活跃度等级
 * @param {number} totalLotteries 总抽奖次数
 * @param {number} totalUploads 总上传次数
 * @param {number} loginCount 登录次数
 * @returns {string} 活跃度等级
 */
function getUserActivityLevel (totalLotteries, totalUploads, loginCount) {
  const totalActivity = totalLotteries + totalUploads + Math.floor(loginCount / 5)

  if (totalActivity >= 100) return 'platinum' // 铂金会员
  if (totalActivity >= 50) return 'gold' // 黄金会员
  if (totalActivity >= 20) return 'silver' // 银牌会员
  if (totalActivity >= 5) return 'bronze' // 青铜会员
  return 'newcomer' // 新手会员
}

/**
 * 获取活跃度描述
 * @param {number} totalLotteries 总抽奖次数
 * @param {number} totalUploads 总上传次数
 * @param {number} loginCount 登录次数
 * @returns {string} 活跃度描述
 */
function getActivityDescription (totalLotteries, totalUploads, loginCount) {
  const level = getUserActivityLevel(totalLotteries, totalUploads, loginCount)

  const descriptions = {
    platinum: '超级活跃用户，餐厅忠实粉丝！',
    gold: '非常活跃，积极参与各项活动',
    silver: '比较活跃，经常参与抽奖',
    bronze: '活跃度一般，偶尔参与活动',
    newcomer: '新手用户，欢迎多多参与！'
  }

  return descriptions[level] || '活跃度待提升'
}

// 路由信息导出（用于文档生成）
router._routeInfo = {
  prefix: '/api/v2/user',
  routes: {
    'GET /info': '获取当前用户信息',
    'GET /statistics': '获取用户统计数据'
  },
  middleware: ['authenticateToken'],
  version: '2.0.0',
  description: '用户信息管理接口'
}

module.exports = router
