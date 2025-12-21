/**
 * user域 - 用户中心业务域聚合
 *
 * 顶层路径：/api/v4/user
 * 内部目录：routes/v4/user/
 *
 * 职责：
 * - 用户个人信息管理
 * - 用户设置
 * - 用户数据查询（/me端点）
 *
 * 📌 遵循规范：
 * - 用户端禁止/:id参数（使用/me端点）
 * - 用户只能操作自己的数据
 *
 * 📌 说明：
 * - 用户profile相关功能在/auth域的/profile端点
 * - 本域主要提供用户中心的扩展功能
 *
 * 创建时间：2025年01月21日
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')

/**
 * GET /api/v4/user/me
 * @desc 获取当前用户基本信息（通过token识别）
 * @access Private
 *
 * 📌 说明：完整用户信息请使用 /api/v4/auth/profile
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // 从token获取用户信息
    const userInfo = {
      user_uuid: req.user.user_uuid,
      mobile: req.user.mobile,
      nickname: req.user.nickname,
      status: req.user.status
    }

    return res.apiSuccess(userInfo, '获取用户信息成功')
  } catch (error) {
    return res.apiInternalError('获取用户信息失败')
  }
})

module.exports = router
