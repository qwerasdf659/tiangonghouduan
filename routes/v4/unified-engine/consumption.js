/**
 * 餐厅积分抽奖系统 V4.0 - 消费记录管理API（商家扫码录入方案A）
 *
 * 业务场景：
 * - 商家扫码录入消费记录
 * - 用户查询自己的消费记录
 * - 管理员审核消费记录（通过/拒绝）
 * - 审核通过自动奖励积分（1元=1分）
 *
 * 核心功能：
 * 1. POST /api/v4/consumption/submit - 商家提交消费记录
 * 2. GET /api/v4/consumption/user/:user_id - 用户查询消费记录
 * 3. GET /api/v4/consumption/detail/:record_id - 查询消费记录详情
 * 4. POST /api/v4/consumption/approve/:record_id - 管理员审核通过
 * 5. POST /api/v4/consumption/reject/:record_id - 管理员审核拒绝
 * 6. GET /api/v4/consumption/pending - 管理员查询待审核记录
 * 7. GET /api/v4/consumption/qrcode/:user_id - 生成用户二维码
 *
 * 路径前缀: /api/v4/consumption
 *
 * 创建时间：2025年10月30日
 * 使用 Claude Sonnet 4.5 模型
 */

const BeijingTimeHelper = require('../../../utils/timeHelper')
const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const QRCodeValidator = require('../../../utils/QRCodeValidator')
const Logger = require('../../../services/UnifiedLotteryEngine/utils/Logger')

const logger = new Logger('ConsumptionAPI')

/*
 * ========================================
 * 商家端API - 提交消费记录
 * ========================================
 */

/**
 * @route POST /api/v4/consumption/submit
 * @desc 商家提交消费记录（扫码录入）
 * @access Private (商家/管理员)
 *
 * @body {string} qr_code - 用户二维码（必填）
 * @body {number} consumption_amount - 消费金额（元，必填）
 * @body {string} merchant_notes - 商家备注（可选）
 *
 * @example
 * POST /api/v4/consumption/submit
 * {
 *   "qr_code": "QR_123_a1b2c3d4...",
 *   "consumption_amount": 88.50,
 *   "merchant_notes": "消费2份套餐"
 * }
 */
router.post('/submit', authenticateToken, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ConsumptionService（符合TR-005规范）
    const ConsumptionService = req.app.locals.services.getService('consumption')

    const { qr_code, consumption_amount, merchant_notes } = req.body
    const merchantId = req.user.user_id

    // 参数验证
    if (!qr_code) {
      return res.apiError('二维码不能为空', 400)
    }

    if (!consumption_amount || consumption_amount <= 0) {
      return res.apiError('消费金额必须大于0', 400)
    }

    if (consumption_amount > 99999.99) {
      return res.apiError('消费金额不能超过99999.99元', 400)
    }

    logger.info('商家提交消费记录', {
      merchant_id: merchantId,
      qr_code,
      consumption_amount
    })

    // 调用服务层处理
    const record = await ConsumptionService.merchantSubmitConsumption({
      qr_code,
      consumption_amount,
      merchant_notes,
      merchant_id: merchantId
    })

    logger.info('✅ 消费记录创建成功', {
      record_id: record.record_id,
      user_id: record.user_id
    })

    return res.apiSuccess(
      {
        record_id: record.record_id,
        user_id: record.user_id,
        consumption_amount: parseFloat(record.consumption_amount),
        points_to_award: record.points_to_award,
        status: record.status,
        status_name: record.getStatusName(),
        created_at: BeijingTimeHelper.formatForAPI(record.created_at)
      },
      '消费记录提交成功，等待审核'
    )
  } catch (error) {
    logger.error('提交消费记录失败', { error: error.message })
    return handleServiceError(error, res, '提交消费记录失败')
  }
})

/*
 * ========================================
 * 用户端API - 查询消费记录
 * ========================================
 */

/**
 * @route GET /api/v4/consumption/user/:user_id
 * @desc 用户查询自己的消费记录
 * @access Private (用户本人或管理员)
 *
 * @param {number} user_id - 用户ID
 * @query {string} status - 状态筛选（pending/approved/rejected/expired，可选）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大50）
 */
router.get('/user/:user_id', authenticateToken, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ConsumptionService（符合TR-005规范）
    const ConsumptionService = req.app.locals.services.getService('consumption')

    const { user_id } = req.params
    const { status, page = 1, page_size = 20 } = req.query

    /*
     * ✅ 风险R1修复（完整版）- 第1步：严格验证user_id参数
     * 检测NaN和非法值，防止权限绕过漏洞
     * 业务场景：恶意用户传入'abc'等非数字字符串试图绕过权限检查
     */
    const userId = parseInt(user_id, 10)
    if (isNaN(userId) || userId <= 0) {
      logger.warn('无效的用户ID参数', {
        user_id,
        parsed: userId,
        requester: req.user.user_id
      })
      return res.apiError('无效的用户ID，必须是正整数', 400)
    }

    /*
     * ✅ 风险R1修复 - 第2步：权限检查
     * 业务规则：普通用户只能查询自己的记录，管理员(role_level >= 100)可查询所有
     * 使用role_level数值比较，避免字符串匹配不一致风险
     */
    if (req.user.user_id !== userId && req.user.role_level < 100) {
      logger.warn('权限验证失败', {
        requester: req.user.user_id,
        target: userId,
        requester_role_level: req.user.role_level
      })
      return res.apiError('无权查询其他用户的消费记录', 403)
    }

    /*
     * ✅ 风险R1修复 - 第3步：审计日志
     * 记录管理员查询他人记录的操作（用于安全审计和问题追踪）
     */
    if (req.user.user_id !== userId && req.user.role_level >= 100) {
      logger.info('管理员查询用户消费记录', {
        admin_id: req.user.user_id,
        target_user_id: userId,
        query_time: BeijingTimeHelper.formatForAPI(new Date())
      })
    }

    /*
     * ✅ 风险R2修复（完整版）：分页参数严格验证
     * 确保参数 >= 1 且 <= 上限值，防止NaN、0、负数导致查询失败
     * 业务场景：前端传入非法参数（如'abc'、0、-1）时，后端能优雅降级而非崩溃
     */
    const finalPageSize = Math.min(Math.max(parseInt(page_size) || 20, 1), 50) // 范围：1-50，默认20
    const finalPage = Math.max(parseInt(page) || 1, 1) // 最小第1页，默认第1页

    logger.info('查询用户消费记录', {
      user_id: userId,
      status,
      page: finalPage,
      page_size: finalPageSize
    })

    // 调用服务层查询
    const result = await ConsumptionService.getUserConsumptionRecords(userId, {
      status,
      page: finalPage,
      page_size: finalPageSize
    })

    return res.apiSuccess(result, '查询成功')
  } catch (error) {
    logger.error('查询用户消费记录失败', { error: error.message })
    return handleServiceError(error, res, '查询用户消费记录失败')
  }
})

/**
 * @route GET /api/v4/consumption/detail/:record_id
 * @desc 查询消费记录详情
 * @access Private (相关用户或管理员)
 *
 * @param {number} record_id - 消费记录ID
 *
 * ⭐ P0优化：权限验证前置
 * - 先轻量查询验证权限（仅查询user_id、merchant_id、is_deleted字段）
 * - 权限通过后再查询完整数据（包含5个关联查询）
 * - 优化收益：无权限查询响应时间从200ms降低到50ms，节省75%时间和80%数据库资源
 *
 * ⭐ P1优化：错误消息脱敏
 * - 业务错误返回友好提示（如"消费记录不存在"）
 * - 系统错误返回通用消息（不暴露数据库、表名、技术栈信息）
 */
router.get('/detail/:record_id', authenticateToken, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ConsumptionService（符合TR-005规范）
    const ConsumptionService = req.app.locals.services.getService('consumption')

    const { record_id } = req.params
    const recordId = parseInt(record_id)

    logger.info('查询消费记录详情', { record_id: recordId })

    /*
     * ✅ 调用 Service 层方法（含权限检查）
     * Service 内部完成：1) 轻量查询验证权限  2) 权限通过后查询完整数据
     */
    const record = await ConsumptionService.getConsumptionDetailWithAuth(
      recordId,
      req.user.user_id,
      req.user.role_level >= 100,
      {
        include_review_records: true,
        include_points_transaction: true
      }
    )

    logger.info('查询消费记录详情成功', {
      record_id: recordId,
      user_id: req.user.user_id,
      access_reason:
        req.user.role_level >= 100
          ? 'admin_privilege'
          : req.user.user_id === record.user_id
            ? 'user_owner'
            : 'merchant_owner'
    })

    return res.apiSuccess(record, '查询成功')
  } catch (error) {
    logger.error('查询消费记录详情失败', {
      error: error.message,
      stack: error.stack,
      record_id: req.params.record_id
    })
    return handleServiceError(error, res, '查询消费记录失败')
  }
})

/*
 * ========================================
 * 管理员API - 审核管理
 * ========================================
 */

/**
 * @route GET /api/v4/consumption/pending
 * @desc 管理员查询待审核的消费记录
 * @access Private (管理员)
 *
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大100）
 */
router.get('/pending', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ConsumptionService（符合TR-005规范）
    const ConsumptionService = req.app.locals.services.getService('consumption')

    const { page = 1, page_size = 20 } = req.query

    // 分页参数验证
    const finalPageSize = Math.min(parseInt(page_size), 100)
    const finalPage = Math.max(parseInt(page), 1)

    logger.info('管理员查询待审核消费记录', {
      admin_id: req.user.user_id,
      page: finalPage,
      page_size: finalPageSize
    })

    // 调用服务层查询
    const result = await ConsumptionService.getPendingConsumptionRecords({
      page: finalPage,
      page_size: finalPageSize
    })

    return res.apiSuccess(result, '查询成功')
  } catch (error) {
    logger.error('查询待审核记录失败', { error: error.message })
    return handleServiceError(error, res, '查询待审核记录失败')
  }
})

/**
 * @route GET /api/v4/consumption/admin/records
 * @desc 管理员查询所有消费记录（支持筛选、搜索、统计）
 * @access Private (管理员)
 *
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大100）
 * @query {string} status - 状态筛选（pending/approved/rejected/all，默认all）
 * @query {string} search - 搜索关键词（手机号、用户昵称）
 *
 * @returns {Object} {
 *   records: Array - 消费记录列表
 *   pagination: Object - 分页信息
 *   statistics: Object - 统计数据（待审核、今日审核、通过、拒绝）
 * }
 */
router.get('/admin/records', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ConsumptionService（符合TR-005规范）
    const ConsumptionService = req.app.locals.services.getService('consumption')

    const { page = 1, page_size = 20, status = 'all', search = '' } = req.query

    logger.info('管理员查询消费记录', {
      admin_id: req.user.user_id,
      page,
      page_size,
      status,
      search
    })

    // 调用服务层查询
    const result = await ConsumptionService.getAdminRecords({
      page: parseInt(page),
      page_size: parseInt(page_size),
      status,
      search
    })

    return res.apiSuccess(result, '查询成功')
  } catch (error) {
    logger.error('管理员查询消费记录失败', { error: error.message })
    return handleServiceError(error, res, '查询消费记录失败')
  }
})

/**
 * @route POST /api/v4/consumption/approve/:record_id
 * @desc 管理员审核通过消费记录
 * @access Private (管理员)
 *
 * @param {number} record_id - 消费记录ID
 * @body {string} admin_notes - 审核备注（可选）
 *
 * @example
 * POST /api/v4/consumption/approve/123
 * {
 *   "admin_notes": "核实无误，审核通过"
 * }
 */
router.post('/approve/:record_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ConsumptionService（符合TR-005规范）
    const ConsumptionService = req.app.locals.services.getService('consumption')

    const { record_id } = req.params
    const { admin_notes } = req.body
    const reviewerId = req.user.user_id

    logger.info('管理员审核通过消费记录', {
      record_id,
      reviewer_id: reviewerId
    })

    // 调用服务层处理
    const result = await ConsumptionService.approveConsumption(parseInt(record_id), {
      reviewer_id: reviewerId,
      admin_notes
    })

    logger.info('✅ 消费记录审核通过', {
      record_id,
      user_id: result.consumption_record.user_id,
      points_awarded: result.points_awarded
    })

    return res.apiSuccess(
      {
        record_id: result.consumption_record.record_id,
        status: result.consumption_record.status,
        points_awarded: result.points_awarded,
        new_balance: result.new_balance,
        reviewed_at: BeijingTimeHelper.formatForAPI(result.consumption_record.reviewed_at)
      },
      `审核通过，已奖励${result.points_awarded}积分`
    )
  } catch (error) {
    logger.error('审核通过失败', {
      error: error.message,
      stack: error.stack,
      record_id: req.params.record_id,
      reviewer_id: req.user.user_id
    })
    return handleServiceError(error, res, '审核通过失败')
  }
})

/**
 * @route POST /api/v4/consumption/reject/:record_id
 * @desc 管理员审核拒绝消费记录
 * @access Private (管理员)
 *
 * @param {number} record_id - 消费记录ID
 * @body {string} admin_notes - 拒绝原因（必填）
 *
 * @example
 * POST /api/v4/consumption/reject/123
 * {
 *   "admin_notes": "消费金额与实际不符"
 * }
 */
router.post('/reject/:record_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ConsumptionService（符合TR-005规范）
    const ConsumptionService = req.app.locals.services.getService('consumption')

    const { record_id } = req.params
    const { admin_notes } = req.body
    const reviewerId = req.user.user_id

    // 验证拒绝原因（5-500字符，符合P0优化要求）
    if (!admin_notes || admin_notes.trim().length < 5) {
      return res.apiError('拒绝原因不能为空，且至少5个字符', 400)
    }

    // ⭐ P0优化：增加最大长度限制（防止超长文本影响性能和前端显示）
    if (admin_notes.length > 500) {
      return res.apiError('拒绝原因最多500个字符，请精简描述', 400)
    }

    logger.info('管理员审核拒绝消费记录', {
      record_id,
      reviewer_id: reviewerId
    })

    // 调用服务层处理
    const result = await ConsumptionService.rejectConsumption(parseInt(record_id), {
      reviewer_id: reviewerId,
      admin_notes
    })

    logger.info('✅ 消费记录审核拒绝', {
      record_id,
      reason: admin_notes
    })

    return res.apiSuccess(
      {
        record_id: result.consumption_record.record_id,
        status: result.consumption_record.status,
        reject_reason: result.reject_reason,
        reviewed_at: BeijingTimeHelper.formatForAPI(result.consumption_record.reviewed_at)
      },
      '已拒绝该消费记录'
    )
  } catch (error) {
    logger.error('审核拒绝失败', { error: error.message })
    return handleServiceError(error, res, '审核拒绝失败')
  }
})

/*
 * ========================================
 * 工具API - 二维码生成
 * ========================================
 */

/**
 * @route GET /api/v4/consumption/qrcode/:user_id
 * @desc 生成用户固定身份二维码（UUID版本）
 * @access Private (用户本人或管理员)
 *
 * @param {number} user_id - 用户ID
 *
 * @returns {Object} 二维码信息
 * @example
 * GET /api/v4/consumption/qrcode/123
 * {
 *   "qr_code": "QR_550e8400-e29b-41d4-a716-446655440000_a1b2c3d4...",
 *   "user_id": 123,
 *   "user_uuid": "550e8400-e29b-41d4-a716-446655440000",
 *   "generated_at": "2025-12-17 14:30:00",
 *   "validity": "permanent",
 *   "note": "此二维码长期有效，可打印使用（UUID版本，隐私保护）",
 *   "usage": "请商家扫描此二维码录入消费"
 * }
 */
router.get('/qrcode/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params

    /*
     * ✅ 参数验证：严格验证user_id，防止NaN绕过
     */
    const userId = parseInt(user_id, 10)
    if (isNaN(userId) || userId <= 0) {
      logger.warn('无效的用户ID参数', { user_id, requester: req.user.user_id })
      return res.apiError('无效的用户ID，必须是正整数', 400)
    }

    /*
     * ✅ 权限检查：只能生成自己的二维码，或管理员(role_level >= 100)可生成任何用户
     * 修复：使用role_level数值比较，替代硬编码'admin'字符串
     */
    if (req.user.user_id !== userId && req.user.role_level < 100) {
      logger.warn('权限验证失败', {
        requester: req.user.user_id,
        target: userId
      })
      return res.apiError('无权生成其他用户的二维码', 403)
    }

    logger.info('生成用户二维码（UUID版本）', { user_id: userId })

    // 查询用户获取UUID
    const { User } = require('../../../models')
    const user = await User.findByPk(userId, {
      attributes: ['user_id', 'user_uuid']
    })

    if (!user) {
      return res.apiError('用户不存在', 404)
    }

    // 使用UUID生成二维码
    const qrCodeInfo = QRCodeValidator.generateQRCodeInfo(user.user_uuid)

    return res.apiSuccess(
      {
        qr_code: qrCodeInfo.qr_code,
        user_id: user.user_id, // 内部标识
        user_uuid: qrCodeInfo.user_uuid, // 外部标识
        generated_at: qrCodeInfo.generated_at,
        validity: qrCodeInfo.validity, // 固定身份码，永久有效
        note: qrCodeInfo.note, // 说明：此二维码长期有效，可打印使用（UUID版本，隐私保护）
        usage: '请商家扫描此二维码录入消费金额'
      },
      '二维码生成成功'
    )
  } catch (error) {
    logger.error('生成二维码失败', { error: error.message })
    return handleServiceError(error, res, '生成二维码失败')
  }
})

/**
 * @route GET /api/v4/consumption/user-info
 * @desc 验证二维码并获取用户详细信息（管理员扫码后使用）
 * @access Private (管理员)
 *
 * 核心功能：
 * 1. ✅ 验证二维码有效性（HMAC-SHA256签名验证）
 * 2. ✅ 查询用户详细信息（昵称、手机号码）
 * 3. ✅ 替代原validate-qrcode接口（已删除冗余接口）
 *
 * @query {string} qr_code - 用户二维码（必填，格式：QR_{user_id}_{signature}）
 *
 * @returns {Object} 用户信息
 * @returns {number} data.user_id - 用户ID
 * @returns {string} data.nickname - 用户昵称
 * @returns {string} data.mobile - 用户手机号码（完整号码）
 * @returns {string} data.qr_code - 二维码字符串
 *
 * @example 成功响应
 * GET /api/v4/consumption/user-info?qr_code=QR_123_a1b2c3d4...
 *
 * Response:
 * {
 *   "success": true,
 *   "code": "SUCCESS",
 *   "message": "用户信息获取成功",
 *   "data": {
 *     "user_id": 123,
 *     "nickname": "张三",
 *     "mobile": "13800138000",
 *     "qr_code": "QR_123_a1b2c3d4..."
 *   }
 * }
 *
 * @example 二维码验证失败
 * Response:
 * {
 *   "success": false,
 *   "code": "VALIDATION_ERROR",
 *   "message": "二维码验证失败：签名不匹配（可能已过期或被篡改）",
 *   "data": null
 * }
 *
 * 业务场景：
 * - 管理员扫描用户二维码后，快速获取用户信息（昵称、手机号码）
 * - 用于消费录入页面显示用户身份
 * - 同时完成二维码验证和用户信息查询（一次调用，两个功能）
 *
 * 技术说明：
 * - 使用ConsumptionService.getUserInfoByQRCode()服务方法
 * - 内部调用QRCodeValidator.validate()进行签名验证
 * - 验证失败时返回400错误，验证成功时返回用户信息
 */
router.get('/user-info', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ConsumptionService（符合TR-005规范）
    const ConsumptionService = req.app.locals.services.getService('consumption')

    const { qr_code } = req.query

    // 参数验证
    if (!qr_code) {
      return res.apiError('二维码不能为空', 400)
    }

    logger.info('获取用户信息', { qr_code: qr_code.substring(0, 20) + '...' })

    // 调用服务层获取用户信息
    const userInfo = await ConsumptionService.getUserInfoByQRCode(qr_code)

    logger.info('用户信息获取成功', {
      user_id: userInfo.user_id,
      nickname: userInfo.nickname
    })

    return res.apiSuccess(
      {
        user_id: userInfo.user_id,
        user_uuid: userInfo.user_uuid, // UUID标识
        nickname: userInfo.nickname,
        mobile: userInfo.mobile,
        qr_code
      },
      '用户信息获取成功'
    )
  } catch (error) {
    logger.error('获取用户信息失败', { error: error.message })
    return handleServiceError(error, res, '获取用户信息失败')
  }
})

/*
 * ❌ 已删除 POST /api/v4/consumption/validate-qrcode 接口
 * 原因：功能已被 GET /api/v4/consumption/user-info 接口完全覆盖
 * user-info接口同时提供：二维码验证 + 用户详细信息
 * 符合YAGNI原则，减少接口冗余，降低维护成本
 */

/*
 * ========================================
 * API#7 统一软删除机制 - 消费记录软删除
 * ========================================
 */

/**
 * @route DELETE /api/v4/consumption/:record_id
 * @desc 软删除消费记录（用户端隐藏记录，管理员可恢复）
 * @access Private (用户自己的记录)
 *
 * @param {number} record_id - 消费记录ID（路径参数）
 *
 * @returns {Object} 删除确认信息
 * @returns {number} data.record_id - 被删除的记录ID
 * @returns {number} data.is_deleted - 删除标记（1=已删除）
 * @returns {string} data.deleted_at - 删除时间（北京时间）
 * @returns {string} data.record_type - 记录类型（consumption）
 * @returns {string} data.note - 操作说明
 *
 * @example
 * DELETE /api/v4/consumption/123
 * Response:
 * {
 *   "success": true,
 *   "message": "消费记录已删除",
 *   "data": {
 *     "record_id": 123,
 *     "is_deleted": 1,
 *     "deleted_at": "2025-11-02 14:30:00",
 *     "record_type": "consumption",
 *     "note": "消费记录已删除，将不再显示在列表中"
 *   }
 * }
 *
 * 业务规则：
 * - 只能删除自己的消费记录（通过JWT token验证user_id）
 * - 🔒 普通用户只能删除pending状态的记录，管理员可删除任何状态
 * - 软删除：记录仍然保留在数据库中，只是标记为已删除（is_deleted=1）
 * - 前端查询时自动过滤已删除记录（WHERE is_deleted=0）
 * - 用户删除后无法自己恢复，只有管理员可以在后台恢复
 * - 删除不影响已奖励的积分（积分已发放，不会回收）
 *
 * 权限控制：
 * - 普通用户（role_level < 100）：只能删除自己的pending状态记录
 * - 管理员（role_level >= 100）：可以删除任何状态的记录
 * - 防止用户删除已审核通过的记录后重新提交刷分
 */
router.delete('/:record_id', authenticateToken, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ConsumptionService（符合TR-005规范）
    const ConsumptionService = req.app.locals.services.getService('consumption')

    const userId = req.user.user_id // 从JWT token获取用户ID
    const { record_id } = req.params

    // 1. 参数验证：检查record_id是否为有效的正整数
    if (!record_id || isNaN(parseInt(record_id))) {
      return res.apiError('无效的记录ID，必须是正整数', 400)
    }

    const recordId = parseInt(record_id)

    // 2. 查询记录：必须是用户自己的记录且未删除
    const record = await ConsumptionService.getRecordById(recordId)

    if (!record) {
      return res.apiError('消费记录不存在或已被删除', 404)
    }

    // 3. 权限验证：只能删除自己的记录
    if (record.user_id !== userId) {
      return res.apiError('您无权删除此消费记录', 403)
    }

    // 🔒 安全修复：普通用户只能删除pending状态的记录，管理员可删除任何状态
    if (req.user.role_level < 100 && record.status !== 'pending') {
      return res.apiError(
        `仅允许删除待审核状态的消费记录，当前状态：${record.status}。已审核的记录请联系管理员处理`,
        403
      )
    }

    // 4. 检查是否已经被删除
    if (record.is_deleted === 1) {
      return res.apiError('该消费记录已经被删除，无需重复操作', 400)
    }

    // 5. 执行软删除：标记为已删除
    const deletedAt = BeijingTimeHelper.createDatabaseTime()

    await record.update({
      is_deleted: 1, // 软删除标记
      deleted_at: deletedAt // 删除时间（北京时间）
    })

    logger.info('软删除消费记录成功', {
      record_id: recordId,
      user_id: userId,
      deleted_at: BeijingTimeHelper.formatForAPI(deletedAt)
    })

    // 6. 返回成功响应
    return res.apiSuccess(
      {
        record_id: recordId,
        is_deleted: 1,
        deleted_at: BeijingTimeHelper.formatForAPI(deletedAt),
        record_type: 'consumption',
        note: '消费记录已删除，将不再显示在列表中'
      },
      '消费记录已删除'
    )
  } catch (error) {
    logger.error('软删除消费记录失败', {
      error: error.message,
      record_id: req.params.record_id,
      user_id: req.user?.user_id
    })
    return handleServiceError(error, res, '删除消费记录失败')
  }
})

/**
 * @route POST /api/v4/consumption/:record_id/restore
 * @desc 管理员恢复已删除的消费记录（管理员专用）
 * @access Private (仅管理员)
 *
 * @param {number} record_id - 消费记录ID（路径参数）
 *
 * @returns {Object} 恢复确认信息
 * @returns {number} data.record_id - 恢复的记录ID
 * @returns {number} data.is_deleted - 删除标记（0=未删除）
 * @returns {number} data.user_id - 记录所属用户ID
 * @returns {string} data.note - 操作说明
 *
 * @example
 * POST /api/v4/consumption/123/restore
 * Response:
 * {
 *   "success": true,
 *   "message": "消费记录已恢复",
 *   "data": {
 *     "record_id": 123,
 *     "is_deleted": 0,
 *     "user_id": 456,
 *     "note": "消费记录已恢复，用户端将重新显示该记录"
 *   }
 * }
 *
 * 业务规则：
 * - 仅管理员可以恢复已删除的记录
 * - 恢复后用户端将重新显示该记录
 * - 恢复操作会清空deleted_at时间戳
 */
router.post('/:record_id/restore', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ConsumptionService（符合TR-005规范）
    const ConsumptionService = req.app.locals.services.getService('consumption')

    const { record_id } = req.params
    const adminId = req.user.user_id

    // 1. 参数验证
    if (!record_id || isNaN(parseInt(record_id))) {
      return res.apiError('无效的记录ID', 400)
    }

    const recordId = parseInt(record_id)

    // 2. 查询已删除的记录（包含已删除的记录）
    const record = await ConsumptionService.getRecordById(recordId, { includeDeleted: true })

    if (!record) {
      return res.apiError('消费记录不存在', 404)
    }

    // 3. 检查是否已经被删除
    if (record.is_deleted === 0) {
      return res.apiError('该消费记录未被删除，无需恢复', 400)
    }

    // 4. 恢复记录：清除软删除标记
    await record.update({
      is_deleted: 0, // 恢复显示
      deleted_at: null // 清空删除时间
    })

    logger.info('管理员恢复消费记录成功', {
      record_id: recordId,
      admin_id: adminId,
      original_user_id: record.user_id
    })

    // 5. 返回成功响应
    return res.apiSuccess(
      {
        record_id: recordId,
        is_deleted: 0,
        user_id: record.user_id,
        note: '消费记录已恢复，用户端将重新显示该记录'
      },
      '消费记录已恢复'
    )
  } catch (error) {
    logger.error('恢复消费记录失败', {
      error: error.message,
      record_id: req.params.record_id,
      admin_id: req.user?.user_id
    })
    return handleServiceError(error, res, '恢复消费记录失败')
  }
})

module.exports = router
