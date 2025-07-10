/**
 * 检查lottery_records表结构
 */

const {sequelize} = require('./config/database');

async function checkTable() {
  try {
    const [results] = await sequelize.query('DESCRIBE lottery_records');
    
    console.log('lottery_records表字段:');
    results.forEach(r => {
      console.log(`- ${r.Field} (${r.Type})`);
    });
    
    // 检查索引
    const [indexes] = await sequelize.query('SHOW INDEX FROM lottery_records');
    console.log('\n现有索引:');
    indexes.forEach(idx => {
      console.log(`- ${idx.Key_name}: ${idx.Column_name}`);
    });
    
    await sequelize.close();
    
  } catch (error) {
    console.error('检查失败:', error.message);
    process.exit(1);
  }
}

checkTable(); 