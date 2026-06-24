'use strict'

/**
 * 数据清理：删除已废弃的核销门槛配置 redemption.min_role_level_for_fulfill
 *
 * 创建时间: 2026-06-24 北京时间
 *
 * 背景（直连真实库 restaurant_points_dev 核对）:
 * - 2026-06-24 权限收口拍板（选项A）：核销准入（扫码核销 /shop/redemption/scan、
 *   手动核销 /shop/redemption/fulfill）由「system_settings 角色等级阈值」统一改为
 *   「RBAC 权限码 consumption:scan_user」（requireMerchantPermission 中间件），
 *   与消费录入(consumption:create)、我的提交(consumption:read) 三个商家接口口径统一。
 * - 改造后 scan.js / fulfill.js 不再读取 min_role_level_for_fulfill，
 *   config/system-settings-whitelist.js 的对应白名单定义已同步删除。
 * - 该 system_settings 数据行若保留，会造成「配置存在但不生效」的误导（运营改它无效），
 *   属技术债，按「删除无用代码/配置」原则硬删。
 * - 实测该行：category='redemption', setting_key='min_role_level_for_fulfill', value='20'。
 *
 * 幂等：无该行时不报错。
 * 回滚: down 为安全空实现（废弃配置不恢复；权限改由 RBAC 权限码控制）。
 */

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction()
    try {
      const [res] = await queryInterface.sequelize.query(
        "DELETE FROM system_settings WHERE category = 'redemption' AND setting_key = 'min_role_level_for_fulfill'",
        { transaction: t }
      )

      // eslint-disable-next-line no-console
      console.log(
        `[migrate] 已删除废弃核销门槛配置 redemption.min_role_level_for_fulfill（affectedRows=${res?.affectedRows ?? 'n/a'}）`
      )
      await t.commit()
    } catch (e) {
      await t.rollback()
      throw e
    }
  },

  async down() {
    // 废弃配置清理，不恢复（核销准入已统一由 RBAC 权限码 consumption:scan_user 控制）
  }
}
