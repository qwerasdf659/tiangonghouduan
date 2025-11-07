/**
 * 餐厅积分抽奖系统 V4.0 - 消费记录管理API路由
 *
 * 业务场景：商家扫码录入方案A - 消费奖励业务流程
 * 核心功能：消费记录提交、审核管理、积分奖励
 *
 * 业务流程：
 * 1. 用户出示固定身份二维码（QR_{user_id}_{signature}）
 * 2. 商家扫码录入消费金额和备注
 * 3. 系统创建消费记录（状态：pending）
 * 4. 管理员审核（通过content_review_records表）
 * 5. 审核通过 → 奖励积分（1元=1分）
 * 6. 审核拒绝 → 记录拒绝原因
 *
 * 路径前缀: /api/v4/consumption
 * 认证方式: JWT Token
 * 时区标准: 北京时间（GMT+8）
 *
 * 创建时间：2025年11月7日
 * 最后更新：2025年11月7日
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../middleware/auth')
const ConsumptionService = require('../../services/ConsumptionService')
const QRCodeValidator = require('../../utils/QRCodeValidator')
const ApiResponse = require('../../utils/ApiResponse')
const BeijingTimeHelper = require('../../utils/timeHelper')

/**
 * @route POST /api/v4/consumption/submit
 * @desc 商家提交消费记录（核心接口）
 * @access Private (需要Token，管理员或商家)
 *
 * 业务逻辑：
 * 1. 验证二维码有效性（HMAC-SHA256签名验证）
 * 2. 检查用户是否存在
 * 3. 防重复提交检查（3分钟防误操作窗口）
 * 4. 计算预计奖励积分（1元=1分，四舍五入）
 * 5. 创建消费记录（状态：pending）
 * 6. 返回成功响应
 */
router.post('/submit', authenticateToken, async (req, res) => {
  try {
    const { qr_code, consumption_amount, merchant_notes } = req.body

    // 1. 参数验证
    if (!qr_code) {
      return ApiResponse.error(res, '二维码不能为空', 400)
    }

    if (!consumption_amount || parseFloat(consumption_amount) <= 0) {
      return ApiResponse.error(res, '消费金额必须大于0', 400)
    }

    if (parseFloat(consumption_amount) > 99999.99) {
      return ApiResponse.error(res, '消费金额不能超过99999.99元', 400)
    }

    // 2. 调用服务层提交消费记录
    const record = await ConsumptionService.merchantSubmitConsumption({
      qr_code: qr_code.trim(),
      consumption_amount: parseFloat(consumption_amount),
      merchant_notes: merchant_notes ? merchant_notes.trim() : null,
      merchant_id: req.user.user_id // 当前登录用户作为录入商家
    })

    console.log('✅ [Consumption] 消费记录提交成功:', {
      record_id: record.record_id,
      user_id: record.user_id,
      merchant_id: record.merchant_id,
      consumption_amount: record.consumption_amount,
      points_to_award: record.points_to_award,
      status: record.status
    })

    // 3. 返回成功响应（使用toAPIResponse方法格式化数据）
    return ApiResponse.success(
      res,
      record.toAPIResponse(),
      '消费记录提交成功，等待审核'
    )
  } catch (error) {
    console.error('❌ [Consumption] 提交消费记录失败:', error.message)
    return ApiResponse.error(res, error.message, 400)
  }
})

/**
 * @route GET /api/v4/consumption/pending
 * @desc 查询待审核的消费记录列表（管理员使用）
 * @access Private (需要Token + 管理员权限)
 *
 * 查询参数:
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20，最大100）
 *
 * 业务逻辑：
 * 1. 验证管理员权限
 * 2. 查询待审核记录（status='pending'）
 * 3. 关联查询用户和商家信息
 * 4. 分页返回数据
 */
router.get('/pending', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, page_size = 20 } = req.query

    // 参数验证
    const pageNum = Math.max(1, parseInt(page))
    const pageSize = Math.min(100, Math.max(1, parseInt(page_size)))

    // 调用服务层查询待审核记录
    const result = await ConsumptionService.getPendingConsumptionRecords({
      page: pageNum,
      page_size: pageSize
    })

    console.log('✅ [Consumption] 查询待审核记录成功:', {
      total: result.pagination.total,
      page: result.pagination.page,
      page_size: result.pagination.page_size
    })

    return ApiResponse.success(res, result, '查询成功')
  } catch (error) {
    console.error('❌ [Consumption] 查询待审核记录失败:', error.message)
    return ApiResponse.error(res, error.message, 500)
  }
})

/**
 * @route POST /api/v4/consumption/approve/:record_id
 * @desc 审核通过消费记录（管理员操作）
 * @access Private (需要Token + 管理员权限)
 *
 * 路径参数:
 * - record_id: 消费记录ID
 *
 * 请求体:
 * - admin_notes: 审核备注（可选）
 *
 * 业务逻辑：
 * 1. 验证管理员权限
 * 2. 检查记录状态（只能审核pending状态）
 * 3. 更新记录状态为approved
 * 4. 创建审核记录（ContentReviewRecord）
 * 5. 奖励积分（通过PointsService）
 * 6. 使用数据库事务确保数据一致性
 */
router.post('/approve/:record_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { record_id } = req.params
    const { admin_notes } = req.body

    // 参数验证
    if (!record_id || isNaN(parseInt(record_id))) {
      return ApiResponse.error(res, '无效的记录ID', 400)
    }

    // 调用服务层审核通过
    const result = await ConsumptionService.approveConsumption(
      parseInt(record_id),
      req.user.user_id, // 当前管理员ID
      admin_notes ? admin_notes.trim() : null
    )

    console.log('✅ [Consumption] 审核通过成功:', {
      record_id: result.record_id,
      status: result.status,
      points_awarded: result.points_awarded,
      new_balance: result.new_balance,
      reviewed_by: req.user.user_id
    })

    return ApiResponse.success(
      res,
      result,
      `审核通过，已奖励${result.points_awarded}积分`
    )
  } catch (error) {
    console.error('❌ [Consumption] 审核通过失败:', error.message)
    return ApiResponse.error(res, error.message, 400)
  }
})

/**
 * @route POST /api/v4/consumption/reject/:record_id
 * @desc 审核拒绝消费记录（管理员操作）
 * @access Private (需要Token + 管理员权限)
 *
 * 路径参数:
 * - record_id: 消费记录ID
 *
 * 请求体:
 * - admin_notes: 拒绝原因（必填，至少5个字符）
 *
 * 业务逻辑：
 * 1. 验证管理员权限
 * 2. 验证拒绝原因（必填，至少5个字符）
 * 3. 检查记录状态（只能审核pending状态）
 * 4. 更新记录状态为rejected
 * 5. 创建审核记录（ContentReviewRecord）
 * 6. 使用数据库事务确保数据一致性
 * 7. 注意：拒绝时不会发放积分
 */
router.post('/reject/:record_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { record_id } = req.params
    const { admin_notes } = req.body

    // 参数验证
    if (!record_id || isNaN(parseInt(record_id))) {
      return ApiResponse.error(res, '无效的记录ID', 400)
    }

    if (!admin_notes || admin_notes.trim().length < 5) {
      return ApiResponse.error(res, '拒绝原因不能为空，且至少5个字符', 400)
    }

    // 调用服务层审核拒绝
    const result = await ConsumptionService.rejectConsumption(
      parseInt(record_id),
      req.user.user_id, // 当前管理员ID
      admin_notes.trim()
    )

    console.log('✅ [Consumption] 审核拒绝成功:', {
      record_id: result.record_id,
      status: result.status,
      reject_reason: result.reject_reason,
      reviewed_by: req.user.user_id
    })

    return ApiResponse.success(
      res,
      result,
      '已拒绝该消费记录'
    )
  } catch (error) {
    console.error('❌ [Consumption] 审核拒绝失败:', error.message)
    return ApiResponse.error(res, error.message, 400)
  }
})

/**
 * @route GET /api/v4/consumption/qrcode/:user_id
 * @desc 生成用户固定身份二维码（用户端使用）
 * @access Private (需要Token)
 *
 * 路径参数:
 * - user_id: 用户ID
 *
 * 业务逻辑：
 * 1. 验证用户身份（只能生成自己的二维码，或管理员可以生成任何用户的）
 * 2. 调用QRCodeValidator生成签名二维码
 * 3. 返回二维码字符串（格式：QR_{user_id}_{signature}）
 * 4. 二维码长期有效（基于HMAC-SHA256签名）
 */
router.get('/qrcode/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params
    const requestUserId = parseInt(user_id)

    // 权限验证：只能生成自己的二维码，或管理员可以生成任何用户的
    if (req.user.user_id !== requestUserId && req.user.role_level < 100) {
      return ApiResponse.error(res, '权限不足：只能生成自己的二维码', 403)
    }

    // 生成二维码
    const qrCode = QRCodeValidator.generateQRCode(requestUserId)

    console.log('✅ [Consumption] 生成二维码成功:', {
      user_id: requestUserId,
      qr_code: qrCode.substring(0, 20) + '...' // 只记录前20个字符
    })

    return ApiResponse.success(
      res,
      {
        qr_code: qrCode,
        user_id: requestUserId,
        generated_at: BeijingTimeHelper.formatForAPI(new Date()),
        validity: 'permanent',
        note: '此二维码长期有效，可打印使用',
        usage: '请商家扫描此二维码录入消费金额'
      },
      '二维码生成成功'
    )
  } catch (error) {
    console.error('❌ [Consumption] 生成二维码失败:', error.message)
    return ApiResponse.error(res, error.message, 500)
  }
})

/**
 * @route GET /api/v4/consumption/user/:user_id
 * @desc 查询用户的消费记录（用户端使用）
 * @access Private (需要Token)
 *
 * 路径参数:
 * - user_id: 用户ID
 *
 * 查询参数:
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20，最大100）
 * - status: 状态筛选（可选：pending/approved/rejected/expired）
 *
 * 业务逻辑：
 * 1. 验证用户身份（只能查询自己的记录，或管理员可以查询任何用户的）
 * 2. 查询用户的消费记录
 * 3. 关联查询商家和审核员信息
 * 4. 分页返回数据
 */
router.get('/user/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params
    const { page = 1, page_size = 20, status } = req.query
    const requestUserId = parseInt(user_id)

    // 权限验证：只能查询自己的记录，或管理员可以查询任何用户的
    if (req.user.user_id !== requestUserId && req.user.role_level < 100) {
      return ApiResponse.error(res, '权限不足：只能查询自己的消费记录', 403)
    }

    // 参数验证
    const pageNum = Math.max(1, parseInt(page))
    const pageSize = Math.min(100, Math.max(1, parseInt(page_size)))

    // 调用服务层查询用户消费记录
    const result = await ConsumptionService.getUserConsumptionRecords({
      user_id: requestUserId,
      page: pageNum,
      page_size: pageSize,
      status: status || null
    })

    console.log('✅ [Consumption] 查询用户消费记录成功:', {
      user_id: requestUserId,
      total: result.pagination.total,
      page: result.pagination.page,
      status_filter: status || 'all'
    })

    return ApiResponse.success(res, result, '查询成功')
  } catch (error) {
    console.error('❌ [Consumption] 查询用户消费记录失败:', error.message)
    return ApiResponse.error(res, error.message, 500)
  }
})

/**
 * @route GET /api/v4/consumption/record/:record_id
 * @desc 查询单个消费记录详情
 * @access Private (需要Token)
 *
 * 路径参数:
 * - record_id: 消费记录ID
 *
 * 业务逻辑：
 * 1. 验证权限（记录所属用户或管理员）
 * 2. 查询记录详情
 * 3. 关联查询用户、商家、审核员、审核记录等信息
 * 4. 返回完整记录数据
 */
router.get('/record/:record_id', authenticateToken, async (req, res) => {
  try {
    const { record_id } = req.params

    // 参数验证
    if (!record_id || isNaN(parseInt(record_id))) {
      return ApiResponse.error(res, '无效的记录ID', 400)
    }

    // 调用服务层查询记录详情
    const record = await ConsumptionService.getConsumptionRecordDetail(
      parseInt(record_id),
      req.user.user_id,
      req.user.role_level >= 100 // 是否是管理员
    )

    console.log('✅ [Consumption] 查询记录详情成功:', {
      record_id: record.record_id,
      user_id: record.user_id,
      status: record.status
    })

    return ApiResponse.success(res, record, '查询成功')
  } catch (error) {
    console.error('❌ [Consumption] 查询记录详情失败:', error.message)
    return ApiResponse.error(res, error.message, 400)
  }
})

/**
 * @route DELETE /api/v4/consumption/record/:record_id
 * @desc 删除消费记录（软删除，用户端使用）
 * @access Private (需要Token)
 *
 * 路径参数:
 * - record_id: 消费记录ID
 *
 * 业务逻辑：
 * 1. 验证权限（记录所属用户或管理员）
 * 2. 检查记录状态（只能删除rejected或expired状态的记录）
 * 3. 执行软删除（设置is_deleted=1, deleted_at=当前时间）
 * 4. 返回成功响应
 *
 * 注意：
 * - pending和approved状态的记录不能删除
 * - 软删除后记录仍保留在数据库中，只是标记为已删除
 */
router.delete('/record/:record_id', authenticateToken, async (req, res) => {
  try {
    const { record_id } = req.params

    // 参数验证
    if (!record_id || isNaN(parseInt(record_id))) {
      return ApiResponse.error(res, '无效的记录ID', 400)
    }

    // 调用服务层删除记录
    const result = await ConsumptionService.deleteConsumptionRecord(
      parseInt(record_id),
      req.user.user_id,
      req.user.role_level >= 100 // 是否是管理员
    )

    console.log('✅ [Consumption] 删除记录成功:', {
      record_id: result.record_id,
      deleted_by: req.user.user_id,
      deleted_at: result.deleted_at
    })

    return ApiResponse.success(res, result, '记录已删除')
  } catch (error) {
    console.error('❌ [Consumption] 删除记录失败:', error.message)
    return ApiResponse.error(res, error.message, 400)
  }
})

/**
 * @route GET /api/v4/consumption/statistics
 * @desc 获取消费记录统计数据（管理员使用）
 * @access Private (需要Token + 管理员权限)
 *
 * 查询参数:
 * - start_date: 开始日期（YYYY-MM-DD）
 * - end_date: 结束日期（YYYY-MM-DD）
 *
 * 业务逻辑：
 * 1. 验证管理员权限
 * 2. 查询指定时间范围内的统计数据：
 *    - 总记录数
 *    - 待审核数量
 *    - 已通过数量
 *    - 已拒绝数量
 *    - 总消费金额
 *    - 总奖励积分
 * 3. 返回统计结果
 */
router.get('/statistics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { start_date, end_date } = req.query

    // 调用服务层获取统计数据
    const statistics = await ConsumptionService.getStatistics({
      start_date: start_date || null,
      end_date: end_date || null
    })

    console.log('✅ [Consumption] 获取统计数据成功:', {
      total_records: statistics.total_records,
      date_range: {
        start: start_date || 'all_time',
        end: end_date || 'now'
      }
    })

    return ApiResponse.success(res, statistics, '获取统计数据成功')
  } catch (error) {
    console.error('❌ [Consumption] 获取统计数据失败:', error.message)
    return ApiResponse.error(res, error.message, 500)
  }
})

// 导出路由
module.exports = router
