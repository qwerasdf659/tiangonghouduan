/**
 * 迁移文件：添加inventory_transfer操作类型到AdminOperationLog
 *
 * 目的：为物品转让操作提供独立的审计日志类型
 *
 * 变更内容：
 * - 在admin_operation_logs表的operation_type枚举中添加'inventory_transfer'（物品转让审计）
 *
 * 业务场景：
 * 1. inventory_transfer（物品转让审计）：
 *    - 用户间物品转让操作
 *    - 转让方和接收方信息记录
 *    - 转让链条追溯
 *    - 转让次数限制审计
 *
 * 与inventory_operation的区别：
 * - inventory_operation：通用库存操作（use/verify/list/withdraw等）
 * - inventory_transfer：专门的物品转让操作，需要更详细的追溯信息
 *
 * 技术规范参考：
 * - 📘 规范 P0-4：敏感操作必须记录审计日志
 * - 待办清单 P0-4：InventoryService.transferItem 物品转移未记录审计日志
 *
 * 创建时间：2025-12-11
 * 使用模型：Claude Sonnet 4.5
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加inventory_transfer操作类型
   */
  up: async (queryInterface, Sequelize) => {
    console.log('📝 开始迁移：添加inventory_transfer操作类型')

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
    const hasInventoryTransfer = currentType.includes('inventory_transfer')

    if (hasInventoryTransfer) {
      console.log('✅ inventory_transfer类型已存在，跳过迁移')
      return
    }

    // 步骤3：修改列以添加新的ENUM值
    console.log('正在添加inventory_transfer操作类型...')
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
        'role_change',
        'system_config',
        'session_assign',
        'inventory_operation',
        'inventory_transfer',
        'consumption_audit'
      ) NOT NULL COMMENT '操作类型'
    `)

    console.log('✅ 成功添加inventory_transfer操作类型')

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

    if (newType.includes('inventory_transfer')) {
      console.log('✅ 验证通过：inventory_transfer类型已成功添加')
    } else {
      throw new Error('验证失败：inventory_transfer类型未正确添加')
    }
  },

  /**
   * 回滚迁移：移除inventory_transfer操作类型
   */
  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回滚：移除inventory_transfer操作类型')

    // 步骤1：检查是否有使用这种类型的记录
    const [transferRecords] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count
      FROM admin_operation_logs
      WHERE operation_type = 'inventory_transfer'
    `)

    const transferCount = transferRecords[0].count

    if (transferCount > 0) {
      throw new Error(
        `无法回滚：存在${transferCount}条inventory_transfer类型的审计日志记录。` +
          '请先清理这些记录或保留这个ENUM值。'
      )
    }

    // 步骤2：恢复到原始ENUM值（移除inventory_transfer）
    console.log('正在移除inventory_transfer类型...')
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
        'role_change',
        'system_config',
        'session_assign',
        'inventory_operation',
        'consumption_audit'
      ) NOT NULL COMMENT '操作类型'
    `)

    console.log('✅ 成功移除inventory_transfer操作类型')

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

    if (!newType.includes('inventory_transfer')) {
      console.log('✅ 验证通过：inventory_transfer类型已成功移除')
    } else {
      throw new Error('验证失败：inventory_transfer类型未正确移除')
    }
  }
}
