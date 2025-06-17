/**
 * 餐厅积分抽奖系统 - 数据库配置
 * 🔴 根据数据库开发文档配置MySQL连接
 * 
 * 对接要点：
 * - 内网地址：test-db-mysql.ns-br0za7uc.svc:3306  
 * - 外网地址：dbconn.sealosbja.site:42182
 * - 用户名：root，密码：mc6r9cgb
 */

const { Sequelize } = require('sequelize');
require('dotenv').config();

// 🔴 数据库连接配置 - 根据文档配置信息
const dbConfig = {
  development: {
    host: process.env.DB_HOST || 'test-db-mysql.ns-br0za7uc.svc',
    port: process.env.DB_PORT || 3306,
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'mc6r9cgb',
    database: process.env.DB_NAME || 'restaurant_points_dev',
    dialect: 'mysql',
    timezone: '+08:00',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 20,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      timestamps: true,
      underscored: false,
      freezeTableName: true
    }
  },
  production: {
    host: process.env.DB_HOST || 'dbconn.sealosbja.site',
    port: process.env.DB_PORT || 42182,
    username: process.env.DB_USER || 'root', 
    password: process.env.DB_PASSWORD || 'mc6r9cgb',
    database: process.env.DB_NAME || 'restaurant_points_prod',
    dialect: 'mysql',
    timezone: '+08:00',
    logging: false,
    pool: {
      max: 50,
      min: 5,
      acquire: 60000,
      idle: 10000
    },
    define: {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      timestamps: true,
      underscored: false,
      freezeTableName: true
    }
  }
};

const env = process.env.NODE_ENV || 'development';
const config = dbConfig[env];

// 创建Sequelize实例
const sequelize = new Sequelize(config.database, config.username, config.password, config);

// 🔴 数据库连接测试函数 - 对接时必须验证连接
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('✅ 数据库连接成功:', config.host + ':' + config.port);
    return true;
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
    return false;
  }
}

// 🔴 数据库同步函数 - 根据模型创建表结构
async function syncDatabase(force = false) {
  try {
    console.log('开始同步数据库...');
    await sequelize.sync({ force, alter: !force });
    console.log('✅ 数据库同步完成');
    return true;
  } catch (error) {
    console.error('❌ 数据库同步失败:', error.message);
    return false;
  }
}

module.exports = {
  sequelize,
  testConnection,
  syncDatabase,
  config
}; 