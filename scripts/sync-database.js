/**
 * 数据库同步脚本 - 解决字段缺失问题
 * 自动添加缺失的字段到现有表中
 */

const { sequelize } = require('../config/database');
const models = require('../models');

async function syncDatabase() {
  try {
    console.log('🔄 开始数据库同步...');
    
    // 测试数据库连接
    await sequelize.authenticate();
    console.log('✅ 数据库连接成功');
    
    // 使用alter模式同步，自动添加缺失字段
    await sequelize.sync({ alter: true });
    console.log('✅ 数据库表结构同步完成');
    
    // 检查关键字段是否存在
    const [results] = await sequelize.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME IN ('merchant_status', 'business_name', 'is_merchant')"
    );
    
    console.log('✅ 检查到的字段:', results.map(r => r.COLUMN_NAME));
    
    // 关闭连接
    await sequelize.close();
    console.log('✅ 数据库同步完成，连接已关闭');
    
  } catch (error) {
    console.error('❌ 数据库同步失败:', error.message);
    console.error('详细错误:', error);
    process.exit(1);
  }
}

// 执行同步
if (require.main === module) {
  syncDatabase();
}

module.exports = { syncDatabase }; 