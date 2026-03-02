'use strict'

/**
 * 新增客服微信号配置项到 system_settings 表
 *
 * 业务背景：
 * - 微信小程序联系客服页面需要显示客服微信号
 * - 前端当前硬编码为 'tg15818387910'，需改为从配置读取
 * - 现有 GET /api/v4/system/config 会自动返回所有 is_visible=1 的配置，零代码改动
 *
 * 运营确认事项：
 * - setting_value 中的微信号需要运营确认后替换为真实值
 * - 当前使用前端硬编码值作为默认值
 */
module.exports = {
  async up(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT system_setting_id FROM system_settings
       WHERE category = 'basic' AND setting_key = 'customer_wechat'
       LIMIT 1`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    )

    if (existing) {
      console.log('⏭️ customer_wechat 配置项已存在，跳过插入')
      return
    }

    await queryInterface.sequelize.query(
      `INSERT INTO system_settings
        (category, setting_key, setting_value, value_type, description, is_visible, is_readonly, created_at, updated_at)
       VALUES
        ('basic', 'customer_wechat', 'tg15818387910', 'string',
         '客服微信号（显示在小程序联系页面，请替换为真实值）',
         1, 0, NOW(), NOW())`
    )

    console.log('✅ 已插入 customer_wechat 配置项（默认值: tg15818387910，请运营确认后替换为真实微信号）')
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM system_settings
       WHERE category = 'basic' AND setting_key = 'customer_wechat'`
    )

    console.log('✅ 已删除 customer_wechat 配置项')
  }
}
