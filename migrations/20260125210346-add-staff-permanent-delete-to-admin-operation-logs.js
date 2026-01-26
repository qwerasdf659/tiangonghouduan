'use strict'

/**
 * 迁移：扩展 admin_operation_logs 表 operation_type ENUM，添加 staff_permanent_delete
 * @description 支持员工永久删除（软删除）操作的审计日志记录
 * @version V4.6.1
 * @date 2026-01-26
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🚀 开始执行迁移：扩展 admin_operation_logs.operation_type ENUM')

      // 扩展 operation_type ENUM 添加 'staff_permanent_delete' 值
      await queryInterface.sequelize.query(
        `ALTER TABLE admin_operation_logs 
         MODIFY COLUMN operation_type ENUM(
           'points_adjust',
           'asset_adjustment',
           'asset_orphan_cleanup',
           'exchange_audit',
           'product_update',
           'product_create',
           'product_delete',
           'user_status_change',
           'role_assign',
           'role_change',
           'prize_config',
           'prize_create',
           'prize_delete',
           'prize_stock_adjust',
           'campaign_config',
           'lottery_force_win',
           'lottery_force_lose',
           'lottery_probability_adjust',
           'lottery_user_queue',
           'lottery_clear_settings',
           'inventory_operation',
           'inventory_transfer',
           'market_listing_admin_withdraw',
           'system_config',
           'session_assign',
           'consumption_audit',
           'feature_flag_create',
           'feature_flag_update',
           'feature_flag_delete',
           'feature_flag_toggle',
           'staff_permanent_delete'
         ) NOT NULL 
         COMMENT '操作类型：积分调整、资产调整、产品管理、用户管理、角色管理、奖品管理、活动管理、抽奖配置、库存操作、市场管理、系统配置、会话分配、消费审核、功能开关管理、员工删除'`,
        { transaction }
      )

      console.log('✅ operation_type ENUM 已扩展，添加 staff_permanent_delete')

      await transaction.commit()
      console.log('✅ 迁移完成：admin_operation_logs.operation_type 已支持员工删除审计')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚迁移：移除 staff_permanent_delete')

      // 先删除使用 'staff_permanent_delete' 的记录（或更新为其他值）
      await queryInterface.sequelize.query(
        `UPDATE admin_operation_logs 
         SET operation_type = 'user_status_change' 
         WHERE operation_type = 'staff_permanent_delete'`,
        { transaction }
      )

      // 恢复原有 ENUM（不包含 staff_permanent_delete）
      await queryInterface.sequelize.query(
        `ALTER TABLE admin_operation_logs 
         MODIFY COLUMN operation_type ENUM(
           'points_adjust',
           'asset_adjustment',
           'asset_orphan_cleanup',
           'exchange_audit',
           'product_update',
           'product_create',
           'product_delete',
           'user_status_change',
           'role_assign',
           'role_change',
           'prize_config',
           'prize_create',
           'prize_delete',
           'prize_stock_adjust',
           'campaign_config',
           'lottery_force_win',
           'lottery_force_lose',
           'lottery_probability_adjust',
           'lottery_user_queue',
           'lottery_clear_settings',
           'inventory_operation',
           'inventory_transfer',
           'market_listing_admin_withdraw',
           'system_config',
           'session_assign',
           'consumption_audit',
           'feature_flag_create',
           'feature_flag_update',
           'feature_flag_delete',
           'feature_flag_toggle'
         ) NOT NULL 
         COMMENT '操作类型'`,
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
