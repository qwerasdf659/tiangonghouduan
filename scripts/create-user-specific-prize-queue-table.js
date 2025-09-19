/**
 * 重构为使用V4统一工具类
 * 重构时间：2025-09-15T22:33:05.563+08:00
 */

const { getDatabaseHelper } = require('../utils/UnifiedDatabaseHelper')

// 获取统一数据库助手
const db = getDatabaseHelper()

/**
 * 创建用户特定奖品队列表
 *
 * 功能：为管理策略提供特定用户预设奖品队列功能
 * 管理员可以为指定用户预设5个奖品，用户抽奖时优先获得这些奖品
 *
 * @version 4.0.0
 * @date 2025-09-13
 */

// 数据库连接

/**
 * 创建用户特定奖品队列表
 */
async function createUserSpecificPrizeQueueTable () {
  try {
    await db.authenticate()
    console.log('✅ 数据库连接成功')

    // 检查表是否已存在
    const [tables] = await db.query('SHOW TABLES LIKE \'user_specific_prize_queue\'')

    if (tables.length > 0) {
      console.log('⚠️ user_specific_prize_queue 表已存在，跳过创建')
      return
    }

    console.log('🔨 创建 user_specific_prize_queue 表...')

    // 创建表的SQL
    const createTableSQL = `
      CREATE TABLE user_specific_prize_queue (
        queue_id VARCHAR(50) NOT NULL PRIMARY KEY COMMENT '队列记录ID',
        user_id INT NOT NULL COMMENT '用户ID',
        campaign_id INT NOT NULL DEFAULT 2 COMMENT '活动ID（默认餐厅积分抽奖）',
        prize_id INT NOT NULL COMMENT '奖品ID',
        prize_number INT NOT NULL COMMENT '奖品号码（1-10）',
        queue_order INT NOT NULL COMMENT '队列顺序（1-5）',
        status ENUM('pending', 'awarded', 'expired', 'cancelled') NOT NULL DEFAULT 'pending' COMMENT '状态',
        awarded_at DATETIME NULL COMMENT '发放时间',
        admin_id INT NOT NULL COMMENT '创建的管理员ID',
        admin_note TEXT NULL COMMENT '管理员备注',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        
        INDEX idx_user_campaign (user_id, campaign_id),
        INDEX idx_queue_status (status),
        INDEX idx_queue_order (user_id, campaign_id, queue_order),
        INDEX idx_admin_created (admin_id, created_at),
        
        CONSTRAINT fk_user_queue_prize 
          FOREIGN KEY (prize_id) REFERENCES lottery_prizes(prize_id) 
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
        COMMENT='用户特定奖品队列 - 管理员预设奖品功能';
    `

    await db.query(createTableSQL)
    console.log('✅ user_specific_prize_queue 表创建成功')

    // 验证表创建结果
    console.log('\n🔍 验证表结构:')
    const [structure] = await db.query('DESCRIBE user_specific_prize_queue')
    console.table(
      structure.map(field => ({
        字段: field.Field,
        类型: field.Type,
        空值: field.Null,
        主键: field.Key,
        默认值: field.Default
      }))
    )

    // 🔴 需要真实数据：请手动添加用户特定奖品队列数据
    console.log('\n⚠️ 注意：需要手动添加用户特定奖品队列的真实数据')
    console.log('   请通过管理员接口或直接数据库操作添加实际的用户奖品预设')

    console.log('\n✅ UserSpecificPrizeQueue 表创建完成！')
    console.log('🎯 功能说明:')
    console.log('   - 管理员可以为用户预设最多5个奖品')
    console.log('   - 奖品按queue_order顺序发放')
    console.log('   - 用户抽奖时优先获得队列中的奖品')
    console.log('   - 支持管理员备注和状态跟踪')
  } catch (error) {
    console.error('❌ 创建表失败:', error.message)
    process.exit(1)
  } finally {
    await db.close()
  }
}

// 🔴 注意：原有测试数据创建函数已被移除
//
// 如需添加用户特定奖品队列数据，请使用以下方式之一：
// 1. 管理员API接口：POST /api/v4/unified-engine/admin/user-prize-queue
// 2. 数据库管理工具直接操作 user_specific_prize_queue 表
// 3. 使用真实的业务数据而不是测试数据
//
// 🔴 需要填写真实数据的字段：
// - queue_id: 队列唯一标识符
// - user_id: 真实用户ID
// - campaign_id: 真实活动ID
// - prize_id: 真实奖品ID
// - admin_id: 操作管理员ID
// - admin_note: 管理员备注说明

// 执行创建
if (require.main === module) {
  createUserSpecificPrizeQueueTable()
}

module.exports = { createUserSpecificPrizeQueueTable }
