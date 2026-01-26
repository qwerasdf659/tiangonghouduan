/**
 * 迁移文件：添加prize_stock_adjust操作类型到AdminOperationLog
 *
 * 目的：为奖品库存调整功能添加审计日志支持
 *
 * 变更内容：
 * - 在admin_operation_logs表的operation_type枚举中添加'prize_stock_adjust'（奖品库存调整审计）
 *
 * 业务场景：
 * 1. prize_stock_adjust（奖品库存调整审计）：
 *    - 管理员补充奖品库存（addStock）
 *    - 记录奖品库存变化（oldStock → newStock）
 *    - 追溯库存调整历史
 *
 * 技术规范参考：
 * - 架构规范 P0-4：核心资产变动必须记录审计日志
 * - 待办清单 P0-3：PrizePoolService.adjustPrizeStock 奖品库存调整未记录审计日志
 *
 * 创建时间：2025-12-11
 * 使用模型：Claude Sonnet 4.5
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加prize_stock_adjust操作类型
   */
  up: async (queryInterface, Sequelize) => {
    console.log('📝 开始迁移：添加prize_stock_adjust操作类型')

    // 步骤1：获取现有的ENUM值
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

    // 步骤2：检查是否已包含新类型
    const hasPrizeStockAdjust = currentType.includes('prize_stock_adjust')

    if (hasPrizeStockAdjust) {
      console.log('✅ prize_stock_adjust类型已存在，跳过迁移')
      return
    }

    // 步骤3：修改列以添加新的ENUM值
    console.log('正在添加新的operation_type值...')
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
        'prize_stock_adjust',
        'campaign_config',
        'role_assign',
        'system_config',
        'session_assign',
        'inventory_operation',
        'consumption_audit'
      ) NOT NULL COMMENT '操作类型'
    `)

    console.log('✅ 成功添加prize_stock_adjust操作类型')

    // 步骤4：验证修改
    const [verifyResults] = await queryInterface.sequelize.query(`
      SELECT COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admin_operation_logs'
        AND COLUMN_NAME = 'operation_type'
    `)

    const newType = verifyResults[0].COLUMN_TYPE
    console.log('修改后的ENUM类型:', newType)

    if (newType.includes('prize_stock_adjust')) {
      console.log('✅ 验证通过：新类型已成功添加')
    } else {
      throw new Error('验证失败：新类型未正确添加')
    }
  },

  /**
   * 回滚迁移：移除prize_stock_adjust操作类型
   */
  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回滚：移除prize_stock_adjust操作类型')

    // 步骤1：检查是否有使用此类型的记录
    const [records] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count
      FROM admin_operation_logs
      WHERE operation_type = 'prize_stock_adjust'
    `)

    const count = records[0].count

    if (count > 0) {
      throw new Error(
        `无法回滚：存在${count}条prize_stock_adjust类型的审计日志记录。` +
          '请先清理这些记录或保留这个ENUM值。'
      )
    }

    // 步骤2：恢复到原始ENUM值
    console.log('正在移除prize_stock_adjust类型...')
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
        'session_assign',
        'inventory_operation',
        'consumption_audit'
      ) NOT NULL COMMENT '操作类型'
    `)

    console.log('✅ 成功移除prize_stock_adjust操作类型')

    // 步骤3：验证回滚
    const [verifyResults] = await queryInterface.sequelize.query(`
      SELECT COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admin_operation_logs'
        AND COLUMN_NAME = 'operation_type'
    `)

    const newType = verifyResults[0].COLUMN_TYPE
    console.log('回滚后的ENUM类型:', newType)

    if (!newType.includes('prize_stock_adjust')) {
      console.log('✅ 验证通过：类型已成功移除')
    } else {
      throw new Error('验证失败：类型未正确移除')
    }
  }
}
