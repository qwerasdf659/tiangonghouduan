require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    logging: false
  }
);

async function analyze() {
  try {
    // 1. 用户角色数据分析
    const [roles] = await sequelize.query(`
      SELECT role_name, role_level, COUNT(*) as count 
      FROM user_roles 
      GROUP BY role_name, role_level 
      ORDER BY role_level DESC
    `);
    console.log('=== 角色分布 ===');
    console.log(JSON.stringify(roles, null, 2));

    // 2. 用户总数
    const [[userCount]] = await sequelize.query('SELECT COUNT(*) as total FROM users');
    console.log('\n=== 用户总数 ===');
    console.log(userCount.total);

    // 3. 核心业务表
    const dbName = process.env.DB_NAME;
    const [tables] = await sequelize.query(`
      SELECT table_name, table_rows 
      FROM information_schema.tables 
      WHERE table_schema = '${dbName}' 
      AND table_rows > 0
      ORDER BY table_rows DESC
      LIMIT 20
    `);
    console.log('\n=== 核心业务表（按数据量排序）===');
    console.log(JSON.stringify(tables, null, 2));

    // 4. 抽奖相关
    const [[lotteryCount]] = await sequelize.query('SELECT COUNT(*) as total FROM lottery_records');
    console.log('\n=== 抽奖记录数 ===');
    console.log(lotteryCount.total);

    // 5. 资产相关表
    const [assetTables] = await sequelize.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = '${dbName}' 
      AND (table_name LIKE '%asset%' OR table_name LIKE '%item%' OR table_name LIKE '%inventory%')
    `);
    console.log('\n=== 资产相关表 ===');
    console.log(JSON.stringify(assetTables, null, 2));

    // 6. 交易相关
    const [tradeTables] = await sequelize.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = '${dbName}' 
      AND (table_name LIKE '%trade%' OR table_name LIKE '%market%' OR table_name LIKE '%exchange%')
    `);
    console.log('\n=== 交易相关表 ===');
    console.log(JSON.stringify(tradeTables, null, 2));

    // 7. 门店相关
    const [[storeCount]] = await sequelize.query('SELECT COUNT(*) as total FROM stores');
    console.log('\n=== 门店数量 ===');
    console.log(storeCount.total);

    // 8. 商品/奖品相关
    const [prizeData] = await sequelize.query(`
      SELECT prize_type, COUNT(*) as count 
      FROM prizes 
      GROUP BY prize_type
    `);
    console.log('\n=== 奖品类型分布 ===');
    console.log(JSON.stringify(prizeData, null, 2));

    // 9. 物品实例
    const [[itemCount]] = await sequelize.query('SELECT COUNT(*) as total FROM items');
    console.log('\n=== 物品实例数 ===');
    console.log(itemCount.total);

    // 10. 市场挂牌
    const [marketData] = await sequelize.query(`
      SELECT status, COUNT(*) as count 
      FROM market_listings 
      GROUP BY status
    `);
    console.log('\n=== 市场挂牌状态 ===');
    console.log(JSON.stringify(marketData, null, 2));

    await sequelize.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

analyze();



