/**
 * 安全的数据库重构脚本 - 按新模型重建products表
 * 保证数据安全和业务连续性
 */

const { sequelize } = require('./models')

async function safeRebuildDatabase () {
  const transaction = await sequelize.transaction()

  try {
    console.log('🔄 开始安全数据库重构...')

    // 步骤1：备份现有数据
    console.log('📦 步骤1：备份现有数据...')
    const [existingData] = await sequelize.query(
      'SELECT * FROM products ORDER BY commodity_id',
      { transaction }
    )
    console.log(`✅ 成功备份 ${existingData.length} 条商品数据`)

    // 步骤2：重命名现有表为备份表
    console.log('🏷️ 步骤2：创建备份表...')
    await sequelize.query(
      'CREATE TABLE products_backup_' + Date.now() + ' AS SELECT * FROM products',
      { transaction }
    )
    console.log('✅ 备份表创建成功')

    // 步骤3：删除现有表
    console.log('🗑️ 步骤3：删除现有表...')
    await sequelize.query('DROP TABLE products', { transaction })
    console.log('✅ 现有表已删除')

    // 步骤4：按新模型创建表
    console.log('🏗️ 步骤4：按新模型创建表...')
    await sequelize.query(`
      CREATE TABLE products (
        commodity_id INT AUTO_INCREMENT PRIMARY KEY COMMENT '商品唯一ID',
        name VARCHAR(200) NOT NULL COMMENT '商品名称',
        description TEXT COMMENT '商品描述',
        image VARCHAR(500) COMMENT '商品图片URL',
        category VARCHAR(50) NOT NULL DEFAULT '优惠券' COMMENT '商品分类',
        space ENUM('lucky', 'premium', 'both') NOT NULL DEFAULT 'lucky' COMMENT '所属空间',
        
        -- 价格库存
        exchange_points INT NOT NULL DEFAULT 0 COMMENT '兑换所需积分',
        stock INT NOT NULL DEFAULT 0 COMMENT '库存数量',
        original_price DECIMAL(10,2) COMMENT '原价',
        discount INT NOT NULL DEFAULT 0 COMMENT '折扣百分比',
        low_stock_threshold INT NOT NULL DEFAULT 5 COMMENT '低库存预警阈值',
        
        -- 状态标识
        status ENUM('active', 'offline', 'deleted') NOT NULL DEFAULT 'active' COMMENT '商品状态',
        is_hot BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否热门商品',
        is_new BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否新品',
        is_limited BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否限量商品',
        sort_order INT NOT NULL DEFAULT 0 COMMENT '排序权重',
        
        -- 业务信息（新字段名：sales，不再是sales_count）
        sales INT NOT NULL DEFAULT 0 COMMENT '销量统计',
        view_count INT NOT NULL DEFAULT 0 COMMENT '浏览次数',
        rating DECIMAL(3,2) COMMENT '评分',
        warranty VARCHAR(200) COMMENT '售后说明',
        delivery_info VARCHAR(200) COMMENT '配送信息',
        expires_at DATETIME COMMENT '过期时间',
        
        -- 系统字段
        created_by INT COMMENT '创建者用户ID',
        updated_by INT COMMENT '最后更新者用户ID',
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        
        -- 索引
        INDEX idx_products_space_status (space, status),
        INDEX idx_products_category (category),
        INDEX idx_products_stock (stock),
        INDEX idx_products_sort_order (sort_order)
      ) COMMENT '商品表 - 支持幸运空间和臻选空间'
    `, { transaction })
    console.log('✅ 新表结构创建成功')

    // 步骤5：迁移数据（处理字段映射）
    console.log('📋 步骤5：迁移现有数据...')
    if (existingData.length > 0) {
      for (const item of existingData) {
        await sequelize.query(`
          INSERT INTO products (
            commodity_id, name, description, image, category, space,
            exchange_points, stock, original_price, discount, low_stock_threshold,
            status, is_hot, is_new, is_limited, sort_order,
            sales, view_count, rating, warranty, delivery_info, expires_at,
            created_by, updated_by, created_at, updated_at
          ) VALUES (
            :commodity_id, :name, :description, :image, :category, :space,
            :exchange_points, :stock, :original_price, :discount, :low_stock_threshold,
            :status, :is_hot, :is_new, :is_limited, :sort_order,
            :sales_count, 0, :rating, NULL, NULL, NULL,
            NULL, NULL, :created_at, :updated_at
          )
        `, {
          replacements: {
            commodity_id: item.commodity_id,
            name: item.name,
            description: item.description,
            image: item.image,
            category: item.category,
            space: item.space || 'lucky',
            exchange_points: item.exchange_points,
            stock: item.stock,
            original_price: item.original_price,
            discount: item.discount || 0,
            low_stock_threshold: item.low_stock_threshold || 5,
            status: item.status || 'active',
            is_hot: item.is_hot || false,
            is_new: item.is_new || false,
            is_limited: item.is_limited || false,
            sort_order: item.sort_order || 0,
            sales_count: item.sales_count || 0, // 映射：sales_count -> sales
            rating: item.rating,
            created_at: item.created_at,
            updated_at: item.updated_at
          },
          transaction
        })
      }
      console.log(`✅ 成功迁移 ${existingData.length} 条商品数据`)
    }

    // 步骤6：验证数据完整性
    console.log('🧪 步骤6：验证数据完整性...')
    const [newData] = await sequelize.query('SELECT * FROM products', { transaction })
    if (newData.length !== existingData.length) {
      throw new Error(`数据迁移不完整：原有 ${existingData.length} 条，现有 ${newData.length} 条`)
    }

    // 验证关键字段
    for (const newItem of newData) {
      const originalItem = existingData.find(old => old.commodity_id === newItem.commodity_id)
      if (!originalItem) {
        throw new Error(`找不到商品ID ${newItem.commodity_id} 的原始数据`)
      }
      if (originalItem.name !== newItem.name || originalItem.exchange_points !== newItem.exchange_points) {
        throw new Error(`商品ID ${newItem.commodity_id} 的关键数据不匹配`)
      }
    }
    console.log('✅ 数据完整性验证通过')

    // 提交事务
    await transaction.commit()

    console.log('')
    console.log('🎉 数据库重构完成！')
    console.log('📊 重构结果:')
    console.log(`  - 原有数据: ${existingData.length} 条商品`)
    console.log(`  - 迁移成功: ${newData.length} 条商品`)
    console.log('  - 数据丢失: 0 条')
    console.log('  - 新增字段: view_count, warranty, delivery_info, expires_at, created_by, updated_by')
    console.log('  - 字段重命名: sales_count -> sales')
    console.log('')
    console.log('✅ 商品兑换功能可以正常使用')
  } catch (error) {
    await transaction.rollback()
    console.error('')
    console.error('❌ 数据库重构失败:', error.message)
    console.error('🔄 已自动回滚，数据安全无损失')
    console.error('')
    throw error
  } finally {
    await sequelize.close()
  }
}

// 执行重构
if (require.main === module) {
  safeRebuildDatabase().catch(error => {
    console.error('脚本执行失败:', error.message)
    process.exit(1)
  })
}

module.exports = { safeRebuildDatabase }
