/**
 * 管理员认证模块
 *
 * @description 管理员登录认证相关路由
 * @version 4.0.0
 * @date 2025-09-24
 */

const express = require('express')
const router = express.Router()
const { sharedComponents, models, BeijingTimeHelper, asyncHandler } = require('./shared/middleware')
const { generateTokens } = require('../../../../middleware/auth')

/**
 * POST /auth - 管理员认证登录
 *
 * @description 管理员使用手机号+验证码登录，验证管理员权限并返回JWT token
 * @route POST /api/v4/unified-engine/admin/auth
 * @access Public (但需要管理员权限验证)
 */
router.post('/auth', asyncHandler(async (req, res) => {
  try {
    const { mobile, verification_code } = req.body

    // 参数验证
    if (!mobile || !verification_code) {
      return res.apiError('手机号和验证码不能为空', 'MISSING_REQUIRED_FIELDS')
    }

    // 验证码验证 (开发环境使用万能验证码 123456)
    if (process.env.NODE_ENV === 'development' && verification_code === '123456') {
      // 开发环境万能验证码
      sharedComponents.logger.info('开发环境使用万能验证码登录', { mobile })
    } else {
      // 生产环境验证码验证逻辑
      return res.apiError('验证码错误', 'INVALID_VERIFICATION_CODE')
    }

    // 查找用户并验证管理员权限
    const user = await models.User.findOne({
      where: { mobile }
    })

    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND')
    }

    // 验证管理员权限
    if (!user.is_admin) {
      sharedComponents.logger.warn('非管理员尝试登录管理后台', { mobile, user_id: user.id })
      return res.apiError('无管理员权限', 'ACCESS_DENIED')
    }

    // 更新最后登录时间
    await user.update({
      last_login_at: BeijingTimeHelper.getCurrentTime()
    })

    // 生成JWT token
    const tokens = generateTokens({
      id: user.id,
      mobile: user.mobile,
      is_admin: user.is_admin
    })

    sharedComponents.logger.info('管理员登录成功', {
      user_id: user.id,
      mobile: user.mobile,
      login_time: BeijingTimeHelper.getCurrentTime()
    })

    return res.apiSuccess({
      user: {
        id: user.id,
        mobile: user.mobile,
        nickname: user.nickname,
        is_admin: user.is_admin,
        last_login_at: user.last_login_at
      },
      ...tokens
    }, '管理员登录成功')
  } catch (error) {
    sharedComponents.logger.error('管理员登录失败', { error: error.message })
    return res.apiInternalError('登录失败', error.message, 'ADMIN_LOGIN_ERROR')
  }
}))

module.exports = router
