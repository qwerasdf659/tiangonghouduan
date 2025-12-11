const { sequelize } = require('../models');

(async () => {
  try {
    console.log('📝 开始迁移：添加role_change操作类型\n');

    // 步骤1：获取现有的ENUM值
    const [results] = await sequelize.query(`
      SELECT COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admin_operation_logs'
        AND COLUMN_NAME = 'operation_type'
    `);

    if (results.length === 0) {
      throw new Error('未找到admin_operation_logs.operation_type列');
    }

    const currentType = results[0].COLUMN_TYPE;
    console.log('当前ENUM类型:', currentType);

    // 步骤2：检查是否已包含新类型
    const hasRoleChange = currentType.includes('role_change');

    if (hasRoleChange) {
      console.log('✅ role_change类型已存在，跳过迁移');
      await sequelize.close();
      process.exit(0);
    }

    // 步骤3：修改列以添加新的ENUM值
    console.log('\n正在添加新的operation_type值...');
    await sequelize.query(`
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
    `);

    console.log('✅ 成功添加role_change操作类型\n');

    // 步骤4：验证修改
    const [verifyResults] = await sequelize.query(`
      SELECT COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admin_operation_logs'
        AND COLUMN_NAME = 'operation_type'
    `);

    const newType = verifyResults[0].COLUMN_TYPE;
    console.log('修改后的ENUM类型:', newType);

    if (newType.includes('role_change')) {
      console.log('\n✅ 验证通过：role_change类型已成功添加');
    } else {
      throw new Error('验证失败：role_change类型未正确添加');
    }

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    await sequelize.close();
    process.exit(1);
  }
})();
