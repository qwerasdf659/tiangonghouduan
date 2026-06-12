/**
 * 商家域「我的门店」路由模块
 *
 * @route /api/v4/shop/my-stores
 * @description 给小程序商家端提供"我能在哪些门店操作"的门店列表，用于消费录入等场景的门店选择器。
 *
 * 业务背景（议题 C）：
 * - 管理员/多门店员工扫码消费录入时，resolveStoreContext 要求显式带 store_id（审计可定位），
 *   前端需要一个"我的门店"列表来渲染门店选择器。
 * - 现状缺口：/console/stores 是 web 管理端接口（小程序不应跨域调）；shop/staff/list 需先有 store_id（鸡生蛋）。
 *   故在商家域新增本接口，对标美团商家版「我的门店」/ 钉钉 GET /tenants。
 *
 * 权限语义（与 resolveStoreContext 双层 RBAC 一致）：
 * - 普通员工（role_level<100）：复用 getUserStores(user_id)，仅返回其 active 在职门店。
 * - 管理员（role_level≥100）：跨店特权，复用 store 服务返回全部 active 门店。
 *
 * 架构约束：薄路由 + 组合；读操作复用现有 Service/能力，不直连 models。
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, getUserStores } = require('../../../middleware/auth')
const { asyncHandler } = require('../../../middleware/validation')

/**
 * 获取门店管理服务（通过 ServiceManager 统一入口）
 * @param {Object} req - Express 请求对象
 * @returns {Object} StoreService（静态服务类）
 */
function getStoreService(req) {
  return req.app.locals.services.getService('store')
}

/**
 * @route GET /api/v4/shop/my-stores
 * @desc 查询当前账号可操作的门店列表（门店选择器数据源）
 * @access Private（需登录；员工返回在职门店，管理员返回全部 active 门店）
 *
 * @returns {Object} data.stores - 门店数组
 * @returns {number} data.stores[].store_id - 门店ID
 * @returns {string} data.stores[].store_name - 门店名称
 * @returns {string} data.stores[].store_code - 门店编码
 * @returns {string|null} data.stores[].role_in_store - 在该门店的角色（管理员跨店时为 null）
 * @returns {boolean} data.is_admin_scope - 是否为管理员全量门店范围（true=全部active门店，false=本人在职门店）
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const userId = req.user.user_id
    const roleLevel = req.user.role_level || 0
    const isAdmin = roleLevel >= 100

    if (isAdmin) {
      // 管理员：跨店特权，复用 StoreService 返回全部 active 门店
      const StoreService = getStoreService(req)
      const result = await StoreService.getStoreList({ status: 'active', page: 1, page_size: 200 })
      const stores = (result.items || []).map(s => ({
        store_id: s.store_id,
        store_name: s.store_name,
        store_code: s.store_code,
        role_in_store: null // 管理员非门店员工，跨店访问无 in-store 角色
      }))
      return res.apiSuccess(
        { stores, is_admin_scope: true },
        '获取门店列表成功',
        'MY_STORES_SUCCESS'
      )
    }

    // 普通员工：复用 getUserStores，仅返回 active 在职门店
    const userStores = await getUserStores(userId)
    const stores = userStores.map(s => ({
      store_id: s.store_id,
      store_name: s.store_name,
      store_code: s.store_code,
      role_in_store: s.role_in_store
    }))
    return res.apiSuccess(
      { stores, is_admin_scope: false },
      '获取门店列表成功',
      'MY_STORES_SUCCESS'
    )
  })
)

module.exports = router
