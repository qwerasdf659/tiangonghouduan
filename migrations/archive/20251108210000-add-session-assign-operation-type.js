/**
 * 迁移文件：添加session_assign操作类型到AdminOperationLog
 *
 * 目的：为客服会话分配功能添加审计日志支持
 *
 * 变更内容：
 * - 在admin_operation_logs表的operation_type枚举中添加'session_assign'
 *
 * 业务场景：
 * - 管理员分配会话给客服
 * - 管理员取消会话分配
 * - 管理员转移会话
 *
 * 创建时间：2025-11-08
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加session_assign操作类型
   */
  up: async (queryInterface, Sequelize) => {
    console.log('📝 开始迁移：添加session_assign操作类型')

    // 获取现有的ENUM值
    const [results] = await queryInterface.sequelize.query(`
      SELECT COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admin_operation_logs'
        AND COLUMN_NAME = 'operation_type'
    `)

    if (results.length === 0) {
      throw new Error('未找到admin_operation_logs.operation_type列')
    }

    const currentType = results[0].COLUMN_TYPE
    console.log('当前ENUM类型:', currentType)

    // 检查是否已包含session_assign
    if (currentType.includes('session_assign')) {
      console.log('✅ session_assign类型已存在，跳过迁移')
      return
    }

    // 修改列以添加新的ENUM值
    await queryInterface.sequelize.query(`
      ALTER TABLE admin_operation_logs 
      MODIFY COLUMN operation_type ENUM(
        'points_adjust',
        'exchange_audit',
        'product_update',
        'product_create',
        'product_delete',
        'user_status_change',
        'prize_config',
        'prize_create',
        'prize_delete',
        'campaign_config',
        'role_assign',
        'system_config',
        'session_assign'
      ) NOT NULL COMMENT '操作类型'
    `)

    console.log('✅ 成功添加session_assign操作类型')
  },

  /**
   * 回滚迁移：移除session_assign操作类型
   */
  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回滚：移除session_assign操作类型')

    // 检查是否有使用session_assign的记录
    const [records] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count 
      FROM admin_operation_logs 
      WHERE operation_type = 'session_assign'
    `)

    if (records[0].count > 0) {
      throw new Error(
        `无法回滚：存在${records[0].count}条session_assign类型的审计日志记录。` +
          '请先清理这些记录或保留此ENUM值。'
      )
    }

    // 恢复到原始ENUM值
    await queryInterface.sequelize.query(`
      ALTER TABLE admin_operation_logs 
      MODIFY COLUMN operation_type ENUM(
        'points_adjust',
        'exchange_audit',
        'product_update',
        'product_create',
        'product_delete',
        'user_status_change',
        'prize_config',
        'prize_create',
        'prize_delete',
        'campaign_config',
        'role_assign',
        'system_config'
      ) NOT NULL COMMENT '操作类型'
    `)

    console.log('✅ 成功移除session_assign操作类型')
  }
}
