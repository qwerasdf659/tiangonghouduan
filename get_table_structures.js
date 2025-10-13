require('dotenv').config()
const { sequelize } = require('./models');

(async () => {
  try {
    const tables = [
      // 用户认证系统 (4表)
      'users', 'user_sessions', 'roles', 'user_roles',
      // 积分系统 (3表)
      'user_points_accounts', 'points_transactions', 'exchange_records',
      // 抽奖系统 (4表)
      'lottery_campaigns', 'lottery_prizes', 'lottery_draws', 'lottery_presets',
      // 商品交易系统 (3表)
      'products', 'trade_records', 'user_inventory',
      // 客服系统 (3表)
      'customer_sessions', 'chat_messages', 'feedbacks',
      // 审计系统 (2表)
      'audit_logs', 'audit_records',
      // 系统管理 (2表)
      'system_announcements', 'image_resources'
    ]

    console.log('开始获取所有表结构...\n')

    for (const table of tables) {
      console.log(`=== ${table} ===`)
      const [result] = await sequelize.query(`SHOW CREATE TABLE ${table}`)
      console.log(result[0]['Create Table'])
      console.log('\n')
    }

    await sequelize.close()
  } catch (err) {
    console.error('错误:', err.message)
    process.exit(1)
  }
})()
