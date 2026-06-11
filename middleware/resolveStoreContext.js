'use strict'

/**
 * 🏪 统一门店上下文解析中间件（resolveStoreContext）
 *
 * 议题3（已拍板·方案丙）：收口商家域 /api/v4/shop/* 此前互不一致的三套门店校验逻辑：
 *   模式①（缺陷）：直接读 req.user_stores，管理员被 requireMerchantPermission 提前 next 跳过填充 → NO_STORE_BINDING
 *   模式②（正确）：if (role_level < 100 && !store_id) 管理员豁免
 *   模式③（强校验）：store_id 必填 + isUserActiveInStore 直查
 * 统一为单一事实源：解析出 req.store_context = { store_id, source, is_admin_override }，
 * 下游路由只读 req.store_context.store_id，不再各写各的判断。
 *
 * 核心设计（对标美团/阿里双层 RBAC）：
 * - "账号身份(identity)" 与 "经营上下文(store context)" 解耦。
 * - 普通员工(role_level<100)：单门店自动填充；多门店必须显式传 store_id；校验该店在职。
 * - 管理员(role_level>=100)：可访问任意门店（跨店特权），但写操作仍必须落到具体 store_id
 *   （不允许"无门店写入"，保证审计可定位）；不要求其为该店在职员工，但记审计日志。
 *
 * 使用方式（挂在 authenticateToken 之后、业务处理器之前）：
 *   router.post('/submit', authenticateToken,
 *     requireMerchantPermission('consumption:create'),     // 仅做权限校验（不再管门店）
 *     resolveStoreContext({ storeIdParam: 'body' }),        // 解析门店上下文
 *     handler)                                              // handler 读 req.store_context.store_id
 *
 * @module middleware/resolveStoreContext
 * @since 2026-06-11（议题3 门店上下文统一）
 */

const { getUserStores, isUserActiveInStore } = require('./auth')
const logger = require('../utils/logger').logger

/**
 * 从请求中按指定来源取出原始 store_id
 *
 * @param {Object} req - Express 请求对象
 * @param {string} storeIdParam - 取值来源：'body' | 'query' | 'params' | 'header'
 * @returns {string|number|undefined} 原始 store_id（未解析）
 */
function extractStoreId(req, storeIdParam) {
  switch (storeIdParam) {
    case 'query':
      return req.query?.store_id
    case 'params':
      return req.params?.store_id
    case 'header':
      return req.headers?.['x-store-id']
    case 'body':
    default:
      return req.body?.store_id
  }
}

/**
 * 统一门店上下文解析中间件工厂
 *
 * @param {Object} [options] - 配置
 * @param {string} [options.storeIdParam='body'] - store_id 来源：'body'|'query'|'params'|'header'
 * @param {boolean} [options.required=true] - 是否强制要求最终解析出 store_id
 *        （写操作必须 true；个别"全局只读聚合"场景可设 false 允许无门店）
 * @returns {Function} Express 中间件
 */
function resolveStoreContext(options = {}) {
  const { storeIdParam = 'body', required = true } = options

  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.apiError
          ? res.apiError('未认证用户', 'UNAUTHENTICATED', null, 401)
          : res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: '未认证用户' })
      }

      const userId = req.user.user_id
      const roleLevel = req.user.role_level || 0
      const isAdmin = roleLevel >= 100

      // 1. 解析候选 store_id
      const rawStoreId = extractStoreId(req, storeIdParam)
      let storeId = null
      if (rawStoreId !== undefined && rawStoreId !== null && rawStoreId !== '') {
        storeId = parseInt(rawStoreId, 10)
        if (isNaN(storeId) || storeId <= 0) {
          return res.apiError
            ? res.apiError('store_id 必须是有效的正整数', 'INVALID_STORE_ID', null, 400)
            : res.status(400).json({
                success: false,
                code: 'INVALID_STORE_ID',
                message: 'store_id 必须是有效的正整数'
              })
        }
      }

      // 2. 管理员分支：可跨任意门店，但写操作仍必须带 store_id（审计可定位）
      if (isAdmin) {
        if (!storeId) {
          if (!required) {
            req.store_context = {
              store_id: null,
              source: 'admin_no_store',
              is_admin_override: true
            }
            return next()
          }
          return res.apiError
            ? res.apiError(
                '管理员执行门店相关写操作必须指定 store_id（不允许无门店写入，以保证审计可定位）',
                'ADMIN_STORE_ID_REQUIRED',
                null,
                400
              )
            : res.status(400).json({
                success: false,
                code: 'ADMIN_STORE_ID_REQUIRED',
                message: '管理员执行门店相关写操作必须指定 store_id'
              })
        }

        // 管理员可访问任意门店，不要求在职，但记审计日志
        req.store_context = {
          store_id: storeId,
          source: `${storeIdParam}_admin`,
          is_admin_override: true
        }
        logger.info('🏪 [门店上下文] 管理员跨店访问', {
          user_id: userId,
          store_id: storeId,
          role_level: roleLevel,
          path: req.originalUrl
        })
        return next()
      }

      // 3. 普通员工分支
      if (storeId) {
        // 3.1 显式传了 store_id：校验在职
        const active = await isUserActiveInStore(userId, storeId)
        if (!active) {
          logger.warn('🚫 [门店上下文] 员工非该门店在职', { user_id: userId, store_id: storeId })
          return res.apiError
            ? res.apiError(
                '您不是该门店的在职员工，无法执行此操作',
                'STORE_ACCESS_DENIED',
                null,
                403
              )
            : res.status(403).json({
                success: false,
                code: 'STORE_ACCESS_DENIED',
                message: '您不是该门店的在职员工，无法执行此操作'
              })
        }
        // eslint-disable-next-line require-atomic-updates
        req.store_context = { store_id: storeId, source: storeIdParam, is_admin_override: false }
        return next()
      }

      // 3.2 未传 store_id：按在职门店数量自动解析
      const userStores = await getUserStores(userId)
      if (userStores.length === 0) {
        // 普通员工无任何在职门店：一律拒绝（读写都不允许），不受 required 影响
        return res.apiError
          ? res.apiError('您未绑定任何门店，无法执行此操作', 'NO_STORE_BINDING', null, 403)
          : res.status(403).json({
              success: false,
              code: 'NO_STORE_BINDING',
              message: '您未绑定任何门店，无法执行此操作'
            })
      }

      if (userStores.length === 1) {
        // 单门店：自动填充
        // eslint-disable-next-line require-atomic-updates
        req.store_context = {
          store_id: userStores[0].store_id,
          source: 'auto_single_store',
          is_admin_override: false
        }
        return next()
      }

      // 多门店：必须显式指定
      return res.apiError
        ? res.apiError(
            '您绑定了多个门店，请明确指定 store_id 参数',
            'MULTIPLE_STORES_REQUIRE_STORE_ID',
            {
              available_stores: userStores.map(s => ({
                store_id: s.store_id,
                store_name: s.store_name
              }))
            },
            400
          )
        : res.status(400).json({
            success: false,
            code: 'MULTIPLE_STORES_REQUIRE_STORE_ID',
            message: '您绑定了多个门店，请明确指定 store_id 参数'
          })
    } catch (error) {
      logger.error('❌ [门店上下文] 解析失败', { error: error.message })
      return res.apiError
        ? res.apiError('门店上下文解析失败', 'STORE_CONTEXT_RESOLVE_FAILED', null, 500)
        : res.status(500).json({
            success: false,
            code: 'STORE_CONTEXT_RESOLVE_FAILED',
            message: '门店上下文解析失败'
          })
    }
  }
}

module.exports = { resolveStoreContext }
