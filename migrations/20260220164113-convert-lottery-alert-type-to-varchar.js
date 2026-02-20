'use strict'

/**
 * lottery_alerts.alert_type: ENUM → VARCHAR(50)
 *
 * 背景：alert_type 是 ENUM 类型（5 个值），策略模拟的异常熔断联动功能
 * 需要新增 simulation_bound 告警类型。转为 VARCHAR(50) 避免后续反复迁移。
 *
 * @see docs/策略效果模拟分析页面-设计方案.md Section 十八
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [cols] = await queryInterface.sequelize.query("SHOW COLUMNS FROM lottery_alerts LIKE 'alert_type'")
    const currentType = cols[0]?.Type || ''

    if (currentType.startsWith('enum')) {
      await queryInterface.changeColumn('lottery_alerts', 'alert_type', {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: '告警类型（VARCHAR 存储）：win_rate | budget | inventory | user | system | simulation_bound'
      })
      console.log('  ✅ lottery_alerts.alert_type: ENUM → VARCHAR(50) 转换完成')
    } else {
      console.log(`  ⏭️  lottery_alerts.alert_type 已是 ${currentType}，跳过`)
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('lottery_alerts', 'alert_type', {
      type: Sequelize.ENUM('win_rate', 'budget', 'inventory', 'user', 'system'),
      allowNull: false,
      comment: '告警类型'
    })
    console.log('  ✅ lottery_alerts.alert_type: VARCHAR(50) → ENUM 回滚完成')
  }
}
