/**
 * 数据库连接测试脚本
 * 🔴 前端对接说明：此脚本用于测试数据库连接和验证数据完整性
 * 🔴 使用方法：node scripts/test-db.js [--performance] [--integrity]
 * 🔴 参数说明：
 *   --performance: 执行性能测试
 *   --integrity: 执行数据完整性检查
 */

require('dotenv').config();
const { sequelize } = require('../config/database');

// 解析命令行参数
const args = process.argv.slice(2);
const performanceTest = args.includes('--performance');
const integrityCheck = args.includes('--integrity');

// 🔴 基础连接测试
async function testConnection() {
  try {
    console.log('🔗 测试数据库连接...');
    console.log(`📍 连接地址: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    console.log(`📍 数据库名: ${process.env.DB_NAME}`);
    console.log(`📍 用户名: ${process.env.DB_USER}`);
    
    const startTime = Date.now();
    await sequelize.authenticate();
    const connectionTime = Date.now() - startTime;
    
    console.log(`✅ 数据库连接成功! (耗时: ${connectionTime}ms)`);
    
    // 获取数据库信息
    const [results] = await sequelize.query('SELECT VERSION() as version');
    console.log(`📊 MySQL版本: ${results[0].version}`);
    
    return { success: true, connectionTime };
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
    return { success: false, error: error.message };
  }
}

// 🔴 表结构检查
async function checkTables() {
  try {
    console.log('\n📊 检查数据库表...');
    
    const requiredTables = [
      'users',
      'points_records', 
      'lottery_settings',
      'commodity_pools',
      'photo_reviews'
    ];
    
    const [tables] = await sequelize.query("SHOW TABLES");
    const existingTables = tables.map(row => Object.values(row)[0]);
    
    console.log(`📋 现有表: ${existingTables.length} 个`);
    
    for (const table of requiredTables) {
      const exists = existingTables.includes(table);
      console.log(`   ${exists ? '✅' : '❌'} ${table} ${exists ? '存在' : '缺失'}`);
      
      if (exists) {
        // 检查表记录数
        const [countResult] = await sequelize.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = countResult[0].count;
        console.log(`      📊 记录数: ${count}`);
      }
    }
    
    return { success: true, tables: existingTables };
  } catch (error) {
    console.error('❌ 表结构检查失败:', error.message);
    return { success: false, error: error.message };
  }
}

// 🔴 模型加载测试 - 确保前后端数据结构一致
async function testModels() {
  try {
    console.log('\n🧩 测试数据模型...');
    
    const { User, PointsRecord, LotterySetting, CommodityPool, PhotoReview } = require('../models');
    
    const models = [
      { name: 'User', model: User },
      { name: 'PointsRecord', model: PointsRecord },
      { name: 'LotterySetting', model: LotterySetting },
      { name: 'CommodityPool', model: CommodityPool },
      { name: 'PhotoReview', model: PhotoReview }
    ];
    
    for (const { name, model } of models) {
      try {
        const count = await model.count();
        console.log(`✅ ${name}: ${count} 条记录`);
        
        // 测试模型基本操作
        const attributes = Object.keys(model.rawAttributes);
        console.log(`   📝 字段数量: ${attributes.length}`);
        
      } catch (error) {
        console.log(`❌ ${name}: 加载失败 - ${error.message}`);
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ 模型测试失败:', error.message);
    return { success: false, error: error.message };
  }
}

// 🔴 性能测试
async function performanceTests() {
  try {
    console.log('\n⚡ 执行性能测试...');
    
    // 测试1: 简单查询性能
    const startTime1 = Date.now();
    await sequelize.query('SELECT 1');
    const simpleQueryTime = Date.now() - startTime1;
    console.log(`📊 简单查询: ${simpleQueryTime}ms`);
    
    // 测试2: 复杂查询性能
    const startTime2 = Date.now();
    await sequelize.query(`
      SELECT u.user_id, u.nickname, u.total_points,
             COUNT(pr.record_id) as lottery_count
      FROM users u 
      LEFT JOIN points_records pr ON u.user_id = pr.user_id 
      WHERE u.is_active = 1 
      GROUP BY u.user_id 
      LIMIT 10
    `);
    const complexQueryTime = Date.now() - startTime2;
    console.log(`📊 复杂查询: ${complexQueryTime}ms`);
    
    // 测试3: 并发连接测试
    console.log('🔄 测试并发连接...');
    const concurrentTests = [];
    for (let i = 0; i < 5; i++) {
      concurrentTests.push(sequelize.query('SELECT SLEEP(0.1)'));
    }
    
    const startTime3 = Date.now();
    await Promise.all(concurrentTests);
    const concurrentTime = Date.now() - startTime3;
    console.log(`📊 5个并发查询: ${concurrentTime}ms`);
    
    // 性能评估
    console.log('\n📈 性能评估:');
    if (simpleQueryTime < 10) {
      console.log('✅ 简单查询性能: 优秀');
    } else if (simpleQueryTime < 50) {
      console.log('⚠️ 简单查询性能: 良好');
    } else {
      console.log('❌ 简单查询性能: 需要优化');
    }
    
    if (complexQueryTime < 100) {
      console.log('✅ 复杂查询性能: 优秀');
    } else if (complexQueryTime < 500) {
      console.log('⚠️ 复杂查询性能: 良好');
    } else {
      console.log('❌ 复杂查询性能: 需要优化');
    }
    
    return { success: true, metrics: { simpleQueryTime, complexQueryTime, concurrentTime } };
  } catch (error) {
    console.error('❌ 性能测试失败:', error.message);
    return { success: false, error: error.message };
  }
}

// 🔴 数据完整性检查
async function integrityChecks() {
  try {
    console.log('\n🔍 执行数据完整性检查...');
    
    // 检查1: 外键约束
    console.log('📋 检查外键约束...');
    
    // 检查积分记录是否都有对应用户
    const [orphanedPoints] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM points_records pr 
      LEFT JOIN users u ON pr.user_id = u.user_id 
      WHERE u.user_id IS NULL
    `);
    
    if (orphanedPoints[0].count > 0) {
      console.log(`❌ 发现 ${orphanedPoints[0].count} 条孤立的积分记录`);
    } else {
      console.log('✅ 积分记录外键约束正常');
    }
    
    // 检查拍照审核是否都有对应用户
    const [orphanedReviews] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM photo_reviews pr 
      LEFT JOIN users u ON pr.user_id = u.user_id 
      WHERE u.user_id IS NULL
    `);
    
    if (orphanedReviews[0].count > 0) {
      console.log(`❌ 发现 ${orphanedReviews[0].count} 条孤立的审核记录`);
    } else {
      console.log('✅ 审核记录外键约束正常');
    }
    
    // 检查2: 数据逻辑一致性
    console.log('\n📊 检查数据逻辑一致性...');
    
    // 检查用户积分是否与记录一致
    const [pointsConsistency] = await sequelize.query(`
      SELECT u.user_id, u.total_points, u.used_points,
             COALESCE(SUM(CASE WHEN pr.change_type = 'earn' THEN pr.points ELSE 0 END), 0) as earned_points,
             COALESCE(SUM(CASE WHEN pr.change_type = 'spend' THEN pr.points ELSE 0 END), 0) as spent_points
      FROM users u 
      LEFT JOIN points_records pr ON u.user_id = pr.user_id 
      GROUP BY u.user_id, u.total_points, u.used_points
      HAVING (earned_points - spent_points) != (total_points + used_points)
      LIMIT 5
    `);
    
    if (pointsConsistency.length > 0) {
      console.log(`❌ 发现 ${pointsConsistency.length} 个用户积分不一致`);
      pointsConsistency.forEach(user => {
        console.log(`   用户 ${user.user_id}: 记录显示应有 ${user.earned_points - user.spent_points} 积分，实际为 ${user.total_points + user.used_points}`);
      });
    } else {
      console.log('✅ 用户积分数据一致性正常');
    }
    
    // 检查3: 抽奖配置
    console.log('\n🎰 检查抽奖配置...');
    const [lotteryConfig] = await sequelize.query(`
      SELECT SUM(probability) as total_probability,
             COUNT(*) as prize_count
      FROM lottery_settings 
      WHERE is_active = 1
    `);
    
    const totalProb = parseFloat(lotteryConfig[0].total_probability || 0);
    if (Math.abs(totalProb - 1.0) > 0.01) {
      console.log(`❌ 抽奖概率总和异常: ${totalProb} (应为1.0)`);
    } else {
      console.log(`✅ 抽奖概率配置正常: ${lotteryConfig[0].prize_count} 个奖品，总概率 ${totalProb}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ 数据完整性检查失败:', error.message);
    return { success: false, error: error.message };
  }
}

// 🔴 主测试函数
async function runDatabaseTests() {
  try {
    console.log('🚀 开始数据库测试...');
    console.log('=' .repeat(50));
    
    // 基础连接测试
    const connectionResult = await testConnection();
    if (!connectionResult.success) {
      console.log('❌ 无法继续测试，数据库连接失败');
      return;
    }
    
    // 表结构检查
    await checkTables();
    
    // 模型测试
    await testModels();
    
    // 可选的性能测试
    if (performanceTest) {
      await performanceTests();
    }
    
    // 可选的完整性检查
    if (integrityCheck) {
      await integrityChecks();
    }
    
    console.log('\n' + '=' .repeat(50));
    console.log('✅ 数据库测试完成！');
    
    if (!performanceTest && !integrityCheck) {
      console.log('\n💡 提示: 可以使用以下参数进行更深入的测试:');
      console.log('   --performance  执行性能测试');
      console.log('   --integrity    执行数据完整性检查');
    }
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

// 🔴 显示使用帮助
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🧪 数据库测试脚本

使用方法:
  node scripts/test-db.js [选项]

选项:
  --performance  执行性能测试
  --integrity    执行数据完整性检查  
  --help         显示此帮助信息

示例:
  node scripts/test-db.js                    # 基础连接和表结构测试
  node scripts/test-db.js --performance      # 包含性能测试
  node scripts/test-db.js --integrity        # 包含数据完整性检查
  node scripts/test-db.js --performance --integrity  # 完整测试

📋 测试内容:
  ✅ 数据库连接测试
  ✅ 表结构检查
  ✅ 数据模型加载测试
  ⚡ 查询性能测试 (可选)
  🔍 数据完整性检查 (可选)
  `);
  process.exit(0);
}

// 🔴 处理未捕获的异常
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  process.exit(1);
});

// 🔴 执行测试
runDatabaseTests(); 