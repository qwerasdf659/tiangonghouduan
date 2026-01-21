/**
 * 敏感操作会话验证中间件
 *
 * @description 用于支付、修改密码等高风险操作前验证会话有效性
 *
 * 业务规则（2026-01-21 拍板）：
 * - 仅敏感操作检查会话，普通操作不检查
 * - 会话有效期：2小时（独立于JWT 7天有效期）
 * - 敏感操作通过后自动续期30分钟
 * - 强制登出时会话立即失效
 *
 * 敏感操作清单：
 * - 支付相关：积分支付、钻石支付、资产转移
 * - 密码/安全：修改密码、绑定手机号、解绑设备
 * - 账户操作：账户注销、权限变更
 * - 高风险操作：批量删除、导出敏感数据
 * - 市场交易：市场挂牌、市场下架
 * - 物品操作：物品转赠、背包物品转移
 *
 * @see docs/会话管理功能补齐方案.md
 * @since 2026-01-21
 */

const { AuthenticationSession } = require('../models')
const logger = require('../utils/logger').logger

/**
 * 敏感操作会话验证中间件
 *
 * @description 验证JWT中的session_token对应的会话是否有效
 *
 * 使用方式：
 * ```javascript
 * const { requireValidSession } = require('../../../middleware/sensitiveOperation')
 *
 * // 积分转账 - 敏感操作，需要验证会话
 * router.post('/transfer',
 *   authenticateToken,
 *   requireValidSession,  // 🔐 仅敏感操作加此中间件
 *   async (req, res) => {
 *     // ...
 *   }
 * )
 * ```
 *
 * @param {Object} req - Express请求对象（需要先通过 authenticateToken 中间件）
 * @param {Object} res - Express响应对象
 * @param {Function} next - Express下一个中间件
 * @returns {Promise<void>} 无返回值，验证通过则调用next()，否则返回错误响应
 */
async function requireValidSession(req, res, next) {
  try {
    /*
     * 1. 从已认证的用户信息中获取 session_token
     *    注意：session_token 在 JWT Payload 中，authenticateToken 会解析
     */
    const sessionToken = req.user?.session_token

    /*
     * 2. 如果没有 session_token，说明是旧版Token（无会话存储）
     *    为了兼容旧Token，仅记录警告但允许通过
     *    待所有用户重新登录后，可改为强制拒绝
     */
    if (!sessionToken) {
      logger.warn(
        `⚠️ [SensitiveOp] 敏感操作缺少session_token: user_id=${req.user?.user_id}, path=${req.path}`
      )
      /*
       * 暂时允许通过，后续可改为拒绝：
       * return res.apiError('会话信息缺失，请重新登录', 'SESSION_REQUIRED', null, 401)
       */
      return next()
    }

    // 3. 验证会话是否仍然有效
    const session = await AuthenticationSession.findValidByToken(sessionToken)

    if (!session) {
      logger.warn(
        `🔒 [SensitiveOp] 会话已失效: user_id=${req.user?.user_id}, session_token=${sessionToken.substring(0, 8)}...`
      )
      return res.apiError('会话已失效，请重新登录', 'SESSION_INVALID', null, 401)
    }

    // 4. 敏感操作成功，更新最后活动时间并续期30分钟
    try {
      await session.extendExpiry(30) // 延长30分钟
      logger.info(
        `✅ [SensitiveOp] 会话验证通过并续期: user_id=${req.user?.user_id}, path=${req.path}`
      )
    } catch (updateError) {
      // 更新失败不阻塞操作
      logger.warn(`⚠️ [SensitiveOp] 会话续期失败（非致命）: ${updateError.message}`)
    }

    // 5. 将会话对象挂载到请求中，供后续使用
    // eslint-disable-next-line require-atomic-updates -- Express中间件是同步调用，req对象不会被并发修改
    req.session = session

    next()
  } catch (error) {
    logger.error(`❌ [SensitiveOp] 会话验证异常: ${error.message}`)
    return res.apiError('会话验证失败', 'SESSION_CHECK_FAILED', null, 500)
  }
}

/**
 * 敏感操作会话验证中间件（严格模式）
 *
 * @description 严格模式：缺少session_token时直接拒绝（不兼容旧Token）
 *
 * 适用场景：
 * - 项目已全面启用会话存储后
 * - 对安全性要求极高的操作
 *
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - Express下一个中间件
 * @returns {Promise<void>} 无返回值，验证通过则调用next()，否则返回错误响应
 */
async function requireValidSessionStrict(req, res, next) {
  try {
    const sessionToken = req.user?.session_token

    // 严格模式：缺少session_token直接拒绝
    if (!sessionToken) {
      logger.warn(
        `🔒 [SensitiveOp][Strict] 缺少session_token: user_id=${req.user?.user_id}, path=${req.path}`
      )
      return res.apiError('会话信息缺失，请重新登录', 'SESSION_REQUIRED', null, 401)
    }

    const session = await AuthenticationSession.findValidByToken(sessionToken)

    if (!session) {
      logger.warn(
        `🔒 [SensitiveOp][Strict] 会话已失效: user_id=${req.user?.user_id}, session_token=${sessionToken.substring(0, 8)}...`
      )
      return res.apiError('会话已失效，请重新登录', 'SESSION_INVALID', null, 401)
    }

    // 续期30分钟
    try {
      await session.extendExpiry(30)
    } catch (updateError) {
      logger.warn(`⚠️ [SensitiveOp][Strict] 会话续期失败（非致命）: ${updateError.message}`)
    }

    // eslint-disable-next-line require-atomic-updates -- Express中间件是同步调用，req对象不会被并发修改
    req.session = session
    next()
  } catch (error) {
    logger.error(`❌ [SensitiveOp][Strict] 会话验证异常: ${error.message}`)
    return res.apiError('会话验证失败', 'SESSION_CHECK_FAILED', null, 500)
  }
}

module.exports = {
  requireValidSession,
  requireValidSessionStrict
}
