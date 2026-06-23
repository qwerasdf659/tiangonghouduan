'use strict'

/**
 * 初始化兑换商品图片轮播速度全局配置（事项C，2026-06-22）
 *
 * 业务背景（详见 docs/兑换商品数据实时性与多图轮播微信小程序前端对接文档.md §9.9 拍板项C）：
 * - 商品主图/SKU 图轮播自动切换间隔，全站统一，运营在后台「兑换市场设置」可调；
 * - 小程序详情接口下发该值驱动 swiper.interval，读不到用前端默认 3000ms 兜底。
 *
 * 设计（与现有 exchange/refund_* 配置同一机制，零表变更）：
 * - 存 system_settings：category='exchange'，setting_key='exchange/gallery_autoplay_interval_ms'；
 * - 白名单已在 config/system-settings-whitelist.js 注册（type=number，min 1000，max 10000，default 3000）；
 * - updateSettings 要求 DB 行先存在，故本迁移负责插入初始行（值=默认 3000）。
 *
 * 数据现状（连真实库 restaurant_points_dev 核实）：该 setting_key 当前不存在，需插入。
 */

const SETTING_KEY = 'exchange/gallery_autoplay_interval_ms'

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()

    try {
      // 幂等：已存在则不重复插入
      const [existing] = await sequelize.query(
        'SELECT system_setting_id FROM system_settings WHERE setting_key = :k',
        { replacements: { k: SETTING_KEY }, transaction }
      )

      if (existing.length === 0) {
        await sequelize.query(
          `INSERT INTO system_settings
             (category, setting_key, setting_value, value_type, description,
              is_visible, is_readonly, created_at, updated_at)
           VALUES
             ('exchange', :k, '3000', 'number',
              '兑换商品主图/SKU图轮播自动切换间隔（毫秒），全站统一，小程序 swiper.interval 读取',
              1, 0, NOW(), NOW())`,
          { replacements: { k: SETTING_KEY }, transaction }
        )
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize
    await sequelize.query('DELETE FROM system_settings WHERE setting_key = :k', {
      replacements: { k: SETTING_KEY }
    })
  }
}
