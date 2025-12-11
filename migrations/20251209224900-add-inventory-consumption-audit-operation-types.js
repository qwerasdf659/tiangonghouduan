/**
 * 迁移文件：添加inventory_operation和consumption_audit操作类型到AdminOperationLog
 *
 * 目的：为库存操作和消费审核功能添加审计日志支持
 *
 * 变更内容：
 * - 在admin_operation_logs表的operation_type枚举中添加'inventory_operation'（库存操作审计）
 * - 在admin_operation_logs表的operation_type枚举中添加'consumption_audit'（消费审核审计）
 *
 * 业务场景：
 * 1. inventory_operation（库存操作审计）：
 *    - 用户使用物品（use）
 *    - 用户转让物品（transfer）
 *    - 商家核销物品（verify）
 *    - 物品上架/下架市场（list/withdraw）
 *
 * 2. consumption_audit（消费审核审计）：
 *    - 管理员审核通过消费记录（approve）
 *    - 管理员审核拒绝消费记录（reject）
 *    - 批量审核操作
 *
 * 技术规范参考：TR-008（敏感写操作统一审计日志）
 *
 * 创建时间：2025-12-09
 * 使用模型：Claude Sonnet 4.5
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加inventory_operation和consumption_audit操作类型
   */
  up: async (queryInterface, Sequelize) => {
    console.log('📝 开始迁移：添加inventory_operation和consumption_audit操作类型')

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
    const hasInventoryOperation = currentType.includes('inventory_operation')
    const hasConsumptionAudit = currentType.includes('consumption_audit')

    if (hasInventoryOperation && hasConsumptionAudit) {
      console.log('✅ inventory_operation和consumption_audit类型已存在，跳过迁移')
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
        'campaign_config',
        'role_assign',
        'system_config',
        'session_assign',
        'inventory_operation',
        'consumption_audit'
      ) NOT NULL COMMENT '操作类型'
    `)

    console.log('✅ 成功添加inventory_operation和consumption_audit操作类型')

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

    if (newType.includes('inventory_operation') && newType.includes('consumption_audit')) {
      console.log('✅ 验证通过：新类型已成功添加')
    } else {
      throw new Error('验证失败：新类型未正确添加')
    }
  },

  /**
   * 回滚迁移：移除inventory_operation和consumption_audit操作类型
   */
  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回滚：移除inventory_operation和consumption_audit操作类型')

    // 步骤1：检查是否有使用这两种类型的记录
    const [inventoryRecords] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count
      FROM admin_operation_logs
      WHERE operation_type = 'inventory_operation'
    `)

    const [consumptionRecords] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count
      FROM admin_operation_logs
      WHERE operation_type = 'consumption_audit'
    `)

    const inventoryCount = inventoryRecords[0].count
    const consumptionCount = consumptionRecords[0].count

    if (inventoryCount > 0 || consumptionCount > 0) {
      throw new Error(
        `无法回滚：存在${inventoryCount}条inventory_operation和${consumptionCount}条consumption_audit类型的审计日志记录。` +
          '请先清理这些记录或保留这些ENUM值。'
      )
    }

    // 步骤2：恢复到原始ENUM值
    console.log('正在移除inventory_operation和consumption_audit类型...')
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

    console.log('✅ 成功移除inventory_operation和consumption_audit操作类型')

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

    if (!newType.includes('inventory_operation') && !newType.includes('consumption_audit')) {
      console.log('✅ 验证通过：类型已成功移除')
    } else {
      throw new Error('验证失败：类型未正确移除')
    }
  }
}
