'use strict'

/**
 * 迁移：扩展 admin_operation_logs 表 operation_type ENUM，添加角色管理审计操作类型
 *
 * @description 支持角色创建、更新、删除操作的审计日志记录
 * @version V4.6.2
 * @date 2026-01-26
 *
 * 新增 ENUM 值：
 * - role_create: 管理员创建新角色
 * - role_update: 管理员编辑角色信息或权限配置
 * - role_delete: 管理员删除角色（软删除）
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🚀 开始执行迁移：扩展 admin_operation_logs.operation_type ENUM（角色管理）')

      // 扩展 operation_type ENUM 添加 role_create、role_update、role_delete 值
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
           'role_create',
           'role_update',
           'role_delete',
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
         COMMENT '操作类型：积分调整、资产调整、产品管理、用户管理、角色管理（含创建/更新/删除）、奖品管理、活动管理、抽奖配置、库存操作、市场管理、系统配置、会话分配、消费审核、功能开关管理、员工删除'`,
        { transaction }
      )

      console.log('✅ operation_type ENUM 已扩展，添加 role_create、role_update、role_delete')

      await transaction.commit()
      console.log('✅ 迁移完成：admin_operation_logs.operation_type 已支持角色管理审计')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚迁移：移除 role_create、role_update、role_delete')

      // 先删除使用这些新值的记录（或更新为其他值）
      await queryInterface.sequelize.query(
        `UPDATE admin_operation_logs 
         SET operation_type = 'role_change' 
         WHERE operation_type IN ('role_create', 'role_update', 'role_delete')`,
        { transaction }
      )

      // 恢复原有 ENUM（不包含新增的三个值）
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

