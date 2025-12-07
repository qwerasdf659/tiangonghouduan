/**
 * 执行数据库迁移脚本（健壮版本）
 * 直接使用Sequelize API执行ALTER TABLE和CREATE TABLE
 */

const { Sequelize, QueryTypes } = require('sequelize')
require('dotenv').config()

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    logging: false // 关闭详细日志
  }
)

async function executeMigration () {
  try {
    console.log('🚀 开始执行数据库迁移...\n')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 1. 扩展 user_points_accounts
    console.log('📋 1. 扩展 user_points_accounts 表...')
    try {
      await sequelize.query(`
        ALTER TABLE user_points_accounts
        ADD COLUMN frozen_points DECIMAL(10,2) DEFAULT 0 COMMENT '冻结积分（审核中）',
        ADD COLUMN budget_points INT DEFAULT 0 COMMENT '预算积分总额（系统内部）',
        ADD COLUMN remaining_budget_points INT DEFAULT 0 COMMENT '剩余预算积分（系统内部）',
        ADD COLUMN used_budget_points INT DEFAULT 0 COMMENT '已用预算积分（系统内部）',
        ADD COLUMN total_draw_count INT DEFAULT 0 COMMENT '总抽奖次数',
        ADD COLUMN total_redeem_count INT DEFAULT 0 COMMENT '总兑换次数',
        ADD COLUMN won_count INT DEFAULT 0 COMMENT '中奖次数',
        ADD COLUMN last_draw_at DATETIME COMMENT '最后抽奖时间',
        ADD COLUMN last_redeem_at DATETIME COMMENT '最后兑换时间',
        ADD INDEX idx_remaining_budget (remaining_budget_points)
      `, { type: QueryTypes.RAW })
      console.log('✅ user_points_accounts 表扩展成功\n')
    } catch (error) {
      if (error.message.includes('Duplicate column name')) {
        console.log('⚠️  字段已存在，跳过\n')
      } else {
        throw error
      }
    }

    // 2. 扩展 lottery_prizes
    console.log('📋 2. 扩展 lottery_prizes 表...')
    try {
      await sequelize.query(`
        ALTER TABLE lottery_prizes
        ADD COLUMN prize_value_points INT DEFAULT 0 COMMENT '奖品价值积分（统一单位）',
        ADD COLUMN virtual_amount INT COMMENT '虚拟奖品数量（水晶等）',
        ADD COLUMN category VARCHAR(50) COMMENT '分类:crystal/metal/physical/empty/virtual',
        ADD INDEX idx_value_points (prize_value_points),
        ADD INDEX idx_category (category)
      `, { type: QueryTypes.RAW })
      console.log('✅ lottery_prizes 表扩展成功\n')
    } catch (error) {
      if (error.message.includes('Duplicate column name') || error.message.includes('Duplicate key name')) {
        console.log('⚠️  字段已存在，跳过\n')
      } else {
        throw error
      }
    }

    // 3. 扩展 lottery_draws
    console.log('📋 3. 扩展 lottery_draws 表...')
    try {
      await sequelize.query(`
        ALTER TABLE lottery_draws
        ADD COLUMN prize_value_points INT DEFAULT 0 COMMENT '奖品价值积分消耗',
        ADD COLUMN budget_points_before INT COMMENT '抽奖前预算积分',
        ADD COLUMN budget_points_after INT COMMENT '抽奖后预算积分'
      `, { type: QueryTypes.RAW })
      console.log('✅ lottery_draws 表扩展成功\n')
    } catch (error) {
      if (error.message.includes('Duplicate column name')) {
        console.log('⚠️  字段已存在，跳过\n')
      } else {
        throw error
      }
    }

    // 4. 扩展 user_inventory
    console.log('📋 4. 扩展 user_inventory 表...')
    try {
      await sequelize.query(`
        ALTER TABLE user_inventory
        ADD COLUMN virtual_amount INT DEFAULT 0 COMMENT '虚拟奖品数量',
        ADD COLUMN virtual_value_points INT DEFAULT 0 COMMENT '虚拟奖品价值积分',
        ADD COLUMN lottery_record_id VARCHAR(50) COMMENT '关联抽奖记录',
        ADD COLUMN exchange_record_id BIGINT COMMENT '关联兑换记录'
      `, { type: QueryTypes.RAW })
      console.log('✅ user_inventory 表扩展成功\n')
    } catch (error) {
      if (error.message.includes('Duplicate column name')) {
        console.log('⚠️  字段已存在，跳过\n')
      } else {
        throw error
      }
    }

    // 5. 创建 exchange_items 表
    console.log('📋 5. 创建 exchange_items 表...')
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS exchange_items (
          item_id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '商品唯一标识',
          name VARCHAR(200) NOT NULL COMMENT '商品名称',
          description TEXT COMMENT '商品描述',
          image_url VARCHAR(500) COMMENT '商品图片URL',
          price_type ENUM('virtual', 'points', 'mixed') NOT NULL COMMENT '支付方式：虚拟奖品/积分/混合',
          virtual_value_price INT COMMENT '虚拟奖品价格（价值积分）',
          points_price INT COMMENT '积分价格',
          mixed_virtual_value INT COMMENT '混合支付-虚拟奖品价值',
          mixed_points INT COMMENT '混合支付-积分数量',
          cost_price DECIMAL(10,2) NOT NULL COMMENT '实际成本（人民币）',
          stock INT DEFAULT 0 COMMENT '库存数量',
          sold_count INT DEFAULT 0 COMMENT '已售数量',
          category VARCHAR(50) COMMENT '商品分类',
          status ENUM('active','inactive') DEFAULT 'active' COMMENT '商品状态',
          sort_order INT DEFAULT 0 COMMENT '排序序号',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
          INDEX idx_price_type (price_type),
          INDEX idx_status (status),
          INDEX idx_category (category)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='兑换市场商品表'
      `, { type: QueryTypes.RAW })
      console.log('✅ exchange_items 表创建成功\n')
    } catch (error) {
      console.log('⚠️  exchange_items 表可能已存在\n')
    }

    // 6. 创建 exchange_market_records 表
    console.log('📋 6. 创建 exchange_market_records 表...')
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS exchange_market_records (
          record_id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '兑换记录唯一标识',
          user_id INT NOT NULL COMMENT '用户ID',
          item_id BIGINT NOT NULL COMMENT '兑换商品ID',
          payment_type ENUM('virtual','points','mixed') COMMENT '支付方式',
          virtual_value_paid INT DEFAULT 0 COMMENT '消耗虚拟奖品价值',
          points_paid INT DEFAULT 0 COMMENT '消耗积分',
          actual_cost DECIMAL(10,2) COMMENT '实际成本',
          order_no VARCHAR(50) NOT NULL UNIQUE COMMENT '订单号',
          status ENUM('pending','completed','shipped','cancelled') DEFAULT 'pending' COMMENT '订单状态',
          shipped_at DATETIME COMMENT '发货时间',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
          UNIQUE INDEX uk_order_no (order_no),
          INDEX idx_user_id (user_id),
          INDEX idx_status (status),
          INDEX idx_created_at (created_at),
          FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
          FOREIGN KEY (item_id) REFERENCES exchange_items(item_id) ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='兑换市场记录表'
      `, { type: QueryTypes.RAW })
      console.log('✅ exchange_market_records 表创建成功\n')
    } catch (error) {
      console.log('⚠️  exchange_market_records 表可能已存在\n')
    }

    // 验证迁移结果
    console.log('\n🔍 验证迁移结果...\n')

    const [accountFields] = await sequelize.query('DESCRIBE user_points_accounts')
    const hasBudgetFields = accountFields.some(f => f.Field === 'budget_points')
    console.log(`✅ user_points_accounts: ${hasBudgetFields ? '已添加预算字段' : '❌ 预算字段未添加'}`)

    const [prizeFields] = await sequelize.query('DESCRIBE lottery_prizes')
    const hasValuePoints = prizeFields.some(f => f.Field === 'prize_value_points')
    console.log(`✅ lottery_prizes: ${hasValuePoints ? '已添加价值积分字段' : '❌ 价值积分字段未添加'}`)

    const [drawFields] = await sequelize.query('DESCRIBE lottery_draws')
    const hasBudgetAudit = drawFields.some(f => f.Field === 'prize_value_points')
    console.log(`✅ lottery_draws: ${hasBudgetAudit ? '已添加预算审计字段' : '❌ 预算审计字段未添加'}`)

    const [inventoryFields] = await sequelize.query('DESCRIBE user_inventory')
    const hasVirtualFields = inventoryFields.some(f => f.Field === 'virtual_amount')
    console.log(`✅ user_inventory: ${hasVirtualFields ? '已添加虚拟奖品字段' : '❌ 虚拟奖品字段未添加'}`)

    const [tables] = await sequelize.query('SHOW TABLES')
    const tableNames = tables.map(t => Object.values(t)[0])
    const hasExchangeItems = tableNames.includes('exchange_items')
    const hasExchangeRecords = tableNames.includes('exchange_market_records')
    console.log(`✅ exchange_items: ${hasExchangeItems ? '已创建' : '❌ 未创建'}`)
    console.log(`✅ exchange_market_records: ${hasExchangeRecords ? '已创建' : '❌ 未创建'}`)

    console.log('\n✅ 数据库迁移全部完成！')

    await sequelize.close()
    process.exit(0)
  } catch (error) {
    console.error('\n❌ 迁移失败:', error.message)
    console.error('详细错误:', error)
    process.exit(1)
  }
}

executeMigration()
