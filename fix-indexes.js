/**
 * 索引清理脚本：删除users表的重复索引
 * 解决MySQL 64个索引限制问题
 */

const {sequelize} = require('./config/database');

async function cleanupIndexes() {
  try {
    console.log('🔧 开始清理users表重复索引...\n');
    
    // 删除重复的mobile索引（保留原始的mobile索引）
    const mobileIndexesToDrop = [
      'mobile_2', 'mobile_3', 'mobile_4', 'mobile_5', 'mobile_6', 'mobile_7', 'mobile_8', 'mobile_9', 'mobile_10',
      'mobile_11', 'mobile_12', 'mobile_13', 'mobile_14', 'mobile_15', 'mobile_16', 'mobile_17', 'mobile_18', 'mobile_19', 'mobile_20',
      'mobile_21', 'mobile_22', 'mobile_23', 'mobile_24', 'mobile_25', 'mobile_26', 'mobile_27', 'mobile_28', 'mobile_29', 'mobile_30',
      'mobile_31', 'mobile_32', 'mobile_33', 'mobile_34', 'mobile_35', 'mobile_36', 'mobile_37', 'mobile_38', 'mobile_39', 'mobile_40',
      'mobile_41', 'mobile_42', 'mobile_43', 'mobile_44', 'mobile_45', 'mobile_46', 'mobile_47', 'mobile_48', 'mobile_49', 'mobile_50',
      'mobile_51', 'mobile_52', 'users_mobile'
    ];
    
    // 删除重复的其他索引
    const otherIndexesToDrop = [
      'users_is_merchant',
      'users_status', 
      'users_merchant_status',
      'idx_admin_status', // 保留 idx_users_admin_status
      'idx_merchant_status' // 有重复的组合索引
    ];
    
    const allIndexesToDrop = [...mobileIndexesToDrop, ...otherIndexesToDrop];
    
    console.log(`准备删除 ${allIndexesToDrop.length} 个重复索引:`);
    
    for (const indexName of allIndexesToDrop) {
      try {
        await sequelize.query(`DROP INDEX \`${indexName}\` ON users`);
        console.log(`✅ 已删除索引: ${indexName}`);
      } catch (error) {
        if (error.message.includes("check that column/key exists")) {
          console.log(`⚠️  索引不存在: ${indexName}`);
        } else {
          console.log(`❌ 删除索引失败 ${indexName}: ${error.message}`);
        }
      }
    }
    
    // 检查清理后的索引数量
    const [results] = await sequelize.query('SHOW INDEX FROM users');
    console.log(`\n🎉 索引清理完成！`);
    console.log(`当前索引数量: ${results.length} 个`);
    console.log(`MySQL限制: 64 个`);
    console.log(`状态: ${results.length <= 64 ? '✅ 正常' : '❌ 仍超限'}`);
    
    if (results.length <= 64) {
      console.log('\n🚀 现在可以启动应用了！');
    }
    
    await sequelize.close();
    
  } catch (error) {
    console.error('❌ 索引清理失败:', error.message);
    process.exit(1);
  }
}

cleanupIndexes(); 