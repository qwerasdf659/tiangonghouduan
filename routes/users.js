/**
 * 用户管理API - 基于主体功能文档要求
 * GET /api/users/:userId - 获取用户基本信息
 * POST /api/users/login - 用户登录（重定向到auth）
 * POST /api/users/register - 用户注册（重定向到auth）
 */

const express = require('express')
const router = express.Router()
const { models } = require('../models')
const ApiResponse = require('../utils/ApiResponse')

// 获取用户基本信息
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params

    if (!userId || isNaN(userId)) {
      return res.status(400).json(ApiResponse.badRequest('无效的用户ID'))
    }

    const user = await models.User.findByPk(userId, {
      attributes: ['user_id', 'mobile', 'nickname', 'status', 'is_admin', 'created_at']
    })

    if (!user) {
      return res.status(404).json(ApiResponse.notFound('用户不存在'))
    }

    return res.json(
      ApiResponse.success(
        {
          id: user.user_id,
          mobile: user.mobile,
          nickname: user.nickname,
          status: user.status,
          is_admin: user.is_admin,
          created_at: user.created_at
        },
        '获取用户信息成功'
      )
    )
  } catch (error) {
    return res
      .status(500)
      .json(
        ApiResponse.serverError('获取用户信息失败', 'USER_QUERY_ERROR', { error: error.message })
      )
  }
})

// 用户登录（重定向到auth）
router.post('/login', (req, res, next) => {
  req.url = '/api/v4/unified-engine/auth/login'
  next()
})

// 用户注册（重定向到auth，登录即注册）
router.post('/register', (req, res, next) => {
  req.url = '/api/v4/unified-engine/auth/login'
  next()
})

module.exports = router
