/**
 * 商家侧消费记录查询路由
 *
 * 📌 背景（2026-01-12 商家员工域权限体系升级 - P0 商家侧消费记录查询能力补齐）：
 * - 店员（merchant_staff）：只能查询自己录入的消费记录（merchant_id = self）
 * - 店长（merchant_manager）：可以查询本店全部消费记录（store_id = 当前门店）
 *
 * @route /api/v4/shop/consumption/merchant
 * @description 商家员工查询消费记录（按门店隔离+角色权限控制）
 *
 * API列表：
 * - GET /list - 商家员工查询消费记录（店员查自己，店长查全店）
 * - GET /detail/:record_id - 商家员工查询记录详情（权限验证）
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md - AC4 商家侧消费记录查询
 */

'use strict'

const express = require('express')
const router = express.Router()
const {
  authenticateToken,
  requireMerchantPermission,
  isUserActiveInStore
} = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger

/**
 * @route GET /api/v4/shop/consumption/merchant/list
 * @desc 商家员工查询消费记录（按门店隔离+角色权限控制）
 * @access Private (merchant_staff / merchant_manager)
 *
 * @query {number} store_id - 门店ID（必填，商家域准入中间件已验证用户在职）
 * @query {string} status - 状态筛选（pending/approved/rejected/expired，可选）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大50）
 *
 * 权限控制：
 * - 店员（role_level=20）：只能查询自己录入的记录（merchant_id = self）
 * - 店长（role_level=40）：可以查询本店全部记录（store_id = store_id）
 * - 需要 consumption:read 权限
 *
 * @example
 * // 店员查询（只返回自己录入的）
 * GET /api/v4/shop/consumption/merchant/list?store_id=1&page=1
 *
 * // 店长查询（返回全店记录）
 * GET /api/v4/shop/consumption/merchant/list?store_id=1&page=1
 */
router.get(
  '/list',
  authenticateToken,
  requireMerchantPermission('consumption:read'),
  async (req, res) => {
    try {
      const { ConsumptionRecord, Store, User } = require('../../../../models')

      const userId = req.user.user_id
      const roleLevel = req.user.role_level || 0

      // 1. 参数解析
      const { store_id, status, page = 1, page_size = 20 } = req.query

      // 2. 验证 store_id 必填
      if (!store_id) {
        return res.apiError('门店ID不能为空', 'MISSING_STORE_ID', null, 400)
      }

      const storeId = parseInt(store_id)
      if (isNaN(storeId)) {
        return res.apiError('门店ID格式不正确', 'INVALID_STORE_ID', null, 400)
      }

      // 3. 验证用户是否在该门店在职
      const isActiveInStore = await isUserActiveInStore(userId, storeId)
      if (!isActiveInStore) {
        logger.warn(`🚫 [MerchantQuery] 用户不在门店在职: user_id=${userId}, store_id=${storeId}`)
        return res.apiForbidden('STORE_ACCESS_DENIED', '您没有该门店的访问权限')
      }

      // 4. 获取用户在该门店的角色
      const { StoreStaff } = require('../../../../models')
      const staffRecord = await StoreStaff.findOne({
        where: {
          user_id: userId,
          store_id: storeId,
          status: 'active'
        },
        attributes: ['role_in_store']
      })

      const isManager = staffRecord?.role_in_store === 'manager' || roleLevel >= 40

      // 5. 分页参数
      const finalPage = Math.max(parseInt(page) || 1, 1)
      const finalPageSize = Math.min(Math.max(parseInt(page_size) || 20, 1), 50)
      const offset = (finalPage - 1) * finalPageSize

      // 6. 构建查询条件
      const whereClause = {
        store_id: storeId,
        is_deleted: 0
      }

      // 店员只能查自己录入的
      if (!isManager) {
        whereClause.merchant_id = userId
      }

      // 状态筛选
      if (status && ['pending', 'approved', 'rejected', 'expired'].includes(status)) {
        whereClause.status = status
      }

      logger.info('商家员工查询消费记录', {
        user_id: userId,
        store_id: storeId,
        is_manager: isManager,
        status,
        page: finalPage,
        page_size: finalPageSize
      })

      // 7. 执行查询
      const { count, rows } = await ConsumptionRecord.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: User,
            as: 'merchant',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: Store,
            as: 'store',
            attributes: ['store_id', 'store_name', 'store_code']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: finalPageSize,
        offset
      })

      // 8. 格式化响应数据
      const records = rows.map(record => record.toAPIResponse())

      return res.apiSuccess(
        {
          records,
          pagination: {
            current_page: finalPage,
            page_size: finalPageSize,
            total_count: count,
            total_pages: Math.ceil(count / finalPageSize)
          },
          query_scope: isManager ? 'store' : 'self',
          query_note: isManager
            ? '店长模式：显示本店全部消费记录'
            : '店员模式：仅显示您录入的消费记录'
        },
        '查询成功'
      )
    } catch (error) {
      logger.error('商家侧消费记录查询失败', {
        error: error.message,
        stack: error.stack,
        user_id: req.user?.user_id
      })
      return handleServiceError(error, res, '查询消费记录失败')
    }
  }
)

/**
 * @route GET /api/v4/shop/consumption/merchant/detail/:record_id
 * @desc 商家员工查询消费记录详情（权限验证）
 * @access Private (merchant_staff / merchant_manager)
 *
 * @param {number} record_id - 消费记录ID
 *
 * 权限控制：
 * - 店员：只能查看自己录入的记录详情
 * - 店长：可以查看本店任意记录详情
 */
router.get(
  '/detail/:record_id',
  authenticateToken,
  requireMerchantPermission('consumption:read'),
  async (req, res) => {
    try {
      const { ConsumptionRecord, Store, User } = require('../../../../models')

      const userId = req.user.user_id
      const roleLevel = req.user.role_level || 0
      const { record_id } = req.params

      // 1. 参数验证
      const recordId = parseInt(record_id)
      if (isNaN(recordId)) {
        return res.apiError('无效的记录ID', 'INVALID_RECORD_ID', null, 400)
      }

      // 2. 查询记录
      const record = await ConsumptionRecord.findByPk(recordId, {
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: User,
            as: 'merchant',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: User,
            as: 'reviewer',
            attributes: ['user_id', 'nickname']
          },
          {
            model: Store,
            as: 'store',
            attributes: ['store_id', 'store_name', 'store_code']
          }
        ]
      })

      if (!record) {
        return res.apiError('消费记录不存在', 'RECORD_NOT_FOUND', null, 404)
      }

      // 3. 权限验证
      const storeId = record.store_id

      // 验证用户是否在该门店在职
      const isActiveInStore = await isUserActiveInStore(userId, storeId)
      if (!isActiveInStore) {
        return res.apiForbidden('STORE_ACCESS_DENIED', '您没有该记录所属门店的访问权限')
      }

      // 获取用户在门店的角色
      const { StoreStaff } = require('../../../../models')
      const staffRecord = await StoreStaff.findOne({
        where: {
          user_id: userId,
          store_id: storeId,
          status: 'active'
        },
        attributes: ['role_in_store']
      })

      const isManager = staffRecord?.role_in_store === 'manager' || roleLevel >= 40

      // 店员只能查看自己录入的记录
      if (!isManager && record.merchant_id !== userId) {
        return res.apiForbidden('RECORD_ACCESS_DENIED', '您只能查看自己录入的消费记录')
      }

      logger.info('商家员工查询消费记录详情', {
        record_id: recordId,
        user_id: userId,
        store_id: storeId,
        is_manager: isManager,
        access_type: isManager ? 'manager_privilege' : 'self_record'
      })

      return res.apiSuccess(record.toAPIResponse(), '查询成功')
    } catch (error) {
      logger.error('商家侧消费记录详情查询失败', {
        error: error.message,
        record_id: req.params.record_id,
        user_id: req.user?.user_id
      })
      return handleServiceError(error, res, '查询消费记录失败')
    }
  }
)

/**
 * @route GET /api/v4/shop/consumption/merchant/stats
 * @desc 商家员工查询消费统计（按门店）
 * @access Private (merchant_staff / merchant_manager)
 *
 * @query {number} store_id - 门店ID（必填）
 *
 * 统计数据：
 * - 待审核数量/金额
 * - 已通过数量/金额/奖励积分
 * - 已拒绝数量/金额
 */
router.get(
  '/stats',
  authenticateToken,
  requireMerchantPermission('consumption:read'),
  async (req, res) => {
    try {
      const { ConsumptionRecord } = require('../../../../models')
      const { sequelize } = require('../../../../config/database')

      const userId = req.user.user_id
      const roleLevel = req.user.role_level || 0
      const { store_id } = req.query

      // 1. 验证 store_id
      if (!store_id) {
        return res.apiError('门店ID不能为空', 'MISSING_STORE_ID', null, 400)
      }

      const storeId = parseInt(store_id)
      if (isNaN(storeId)) {
        return res.apiError('门店ID格式不正确', 'INVALID_STORE_ID', null, 400)
      }

      // 2. 验证用户是否在该门店在职
      const isActiveInStore = await isUserActiveInStore(userId, storeId)
      if (!isActiveInStore) {
        return res.apiForbidden('STORE_ACCESS_DENIED', '您没有该门店的访问权限')
      }

      // 3. 获取用户角色
      const { StoreStaff } = require('../../../../models')
      const staffRecord = await StoreStaff.findOne({
        where: {
          user_id: userId,
          store_id: storeId,
          status: 'active'
        },
        attributes: ['role_in_store']
      })

      const isManager = staffRecord?.role_in_store === 'manager' || roleLevel >= 40

      // 4. 构建查询条件
      const whereClause = {
        store_id: storeId,
        is_deleted: 0
      }

      // 店员只统计自己的
      if (!isManager) {
        whereClause.merchant_id = userId
      }

      // 5. 执行统计查询
      const stats = await ConsumptionRecord.findAll({
        where: whereClause,
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('record_id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('consumption_amount')), 'total_amount'],
          [sequelize.fn('SUM', sequelize.col('points_to_award')), 'total_points']
        ],
        group: ['status'],
        raw: true
      })

      // 6. 格式化统计结果
      const statusStats = {
        pending: { count: 0, amount: 0, points: 0 },
        approved: { count: 0, amount: 0, points: 0 },
        rejected: { count: 0, amount: 0, points: 0 },
        expired: { count: 0, amount: 0, points: 0 }
      }

      stats.forEach(stat => {
        if (statusStats[stat.status]) {
          statusStats[stat.status] = {
            count: parseInt(stat.count) || 0,
            amount: parseFloat(stat.total_amount) || 0,
            points: parseInt(stat.total_points) || 0
          }
        }
      })

      // 计算总计
      const total = {
        count: Object.values(statusStats).reduce((sum, s) => sum + s.count, 0),
        amount: Object.values(statusStats).reduce((sum, s) => sum + s.amount, 0),
        approved_points: statusStats.approved.points
      }

      logger.info('商家员工查询消费统计', {
        user_id: userId,
        store_id: storeId,
        is_manager: isManager,
        stats: total
      })

      return res.apiSuccess(
        {
          store_id: storeId,
          stats_scope: isManager ? 'store' : 'self',
          by_status: statusStats,
          total
        },
        '查询成功'
      )
    } catch (error) {
      logger.error('商家侧消费统计查询失败', {
        error: error.message,
        user_id: req.user?.user_id
      })
      return handleServiceError(error, res, '查询统计失败')
    }
  }
)

module.exports = router
