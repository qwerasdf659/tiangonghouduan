'use strict'

/**
 * 统一商品中心 — EAV 属性体系 + 兑换渠道定价
 *
 * 新建 9 张表（Layer 1 + Layer 2）：
 *   1. categories          品类树（替代 category_defs，扩展三级层次结构）
 *   2. attributes          属性定义（颜色/尺寸/内存等）
 *   3. attribute_options    属性预设值（冰蓝/火红/XL 等）
 *   4. category_attributes  品类绑定属性（宝石→颜色+尺寸+切工）
 *   5. products            统一 SPU（替代 exchange_items）
 *   6. product_attribute_values  SPU 非销售属性值（材质=天然水晶）
 *   7. product_skus        统一 SKU（替代 exchange_item_skus）
 *   8. sku_attribute_values SKU 销售属性值（替代 JSON spec_values）
 *   9. exchange_channel_prices 兑换渠道定价
 *
 * 依据文档：商品SKU与物品实例系统行业方案对比与架构设计.md 第十一章 + 第十八章
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ═══════════════════════════════════════
      // 表 1：品类树 categories
      // ═══════════════════════════════════════
      await queryInterface.createTable('categories', {
        category_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '品类ID'
        },
        parent_category_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'categories', key: 'category_id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
          comment: '父品类（NULL=顶级）'
        },
        category_name: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: '品类名称（宝石/数码/服装）'
        },
        category_code: {
          type: Sequelize.STRING(50),
          allowNull: false,
          unique: true,
          comment: '品类编码（gems/digital/clothing）'
        },
        level: {
          type: Sequelize.TINYINT,
          allowNull: false,
          defaultValue: 1,
          comment: '层级 1=一级 2=二级 3=三级'
        },
        sort_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '排序'
        },
        is_enabled: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '是否启用'
        },
        icon_media_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'media_files', key: 'media_id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
          comment: '品类图标'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        }
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci', comment: '品类树（EAV 商品中心 Layer 1）' })

      await queryInterface.addIndex('categories', ['parent_category_id'], { name: 'idx_categories_parent', transaction })
      await queryInterface.addIndex('categories', ['level', 'sort_order'], { name: 'idx_categories_level_sort', transaction })
      await queryInterface.addIndex('categories', ['is_enabled', 'level'], { name: 'idx_categories_enabled_level', transaction })

      // ═══════════════════════════════════════
      // 表 2：属性定义 attributes
      // ═══════════════════════════════════════
      await queryInterface.createTable('attributes', {
        attribute_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '属性ID'
        },
        attribute_name: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: '属性名称（颜色/内存/尺码）'
        },
        attribute_code: {
          type: Sequelize.STRING(50),
          allowNull: false,
          unique: true,
          comment: '属性编码（color/memory/size）'
        },
        input_type: {
          type: Sequelize.ENUM('select', 'text', 'number'),
          allowNull: false,
          defaultValue: 'select',
          comment: '录入方式：下拉选择/文本/数字'
        },
        is_required: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否必填'
        },
        is_sale_attr: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否销售属性（影响SKU生成）'
        },
        is_searchable: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否可搜索筛选'
        },
        sort_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '排序'
        },
        is_enabled: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '是否启用'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        }
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci', comment: '属性定义（EAV 商品中心 Layer 1）' })

      await queryInterface.addIndex('attributes', ['is_sale_attr'], { name: 'idx_attributes_sale_attr', transaction })
      await queryInterface.addIndex('attributes', ['is_enabled', 'sort_order'], { name: 'idx_attributes_enabled_sort', transaction })

      // ═══════════════════════════════════════
      // 表 3：属性预设值 attribute_options
      // ═══════════════════════════════════════
      await queryInterface.createTable('attribute_options', {
        option_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '选项ID'
        },
        attribute_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'attributes', key: 'attribute_id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          comment: '所属属性'
        },
        option_value: {
          type: Sequelize.STRING(200),
          allowNull: false,
          comment: '选项值（冰蓝/火红/256GB/XL）'
        },
        sort_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '排序'
        },
        is_enabled: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '是否启用'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        }
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci', comment: '属性预设值（EAV 商品中心 Layer 1）' })

      await queryInterface.addIndex('attribute_options', ['attribute_id', 'sort_order'], { name: 'idx_attr_options_attr_sort', transaction })

      // ═══════════════════════════════════════
      // 表 4：品类绑定属性 category_attributes
      // ═══════════════════════════════════════
      await queryInterface.createTable('category_attributes', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '主键'
        },
        category_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'categories', key: 'category_id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          comment: '品类'
        },
        attribute_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'attributes', key: 'attribute_id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          comment: '属性'
        },
        sort_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '该品类内的属性排序'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        }
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci', comment: '品类绑定属性（EAV 商品中心 Layer 1）' })

      await queryInterface.addIndex('category_attributes', ['category_id', 'attribute_id'], {
        name: 'uk_category_attribute',
        unique: true,
        transaction
      })

      // ═══════════════════════════════════════
      // 表 5：统一 SPU — products
      // ═══════════════════════════════════════
      await queryInterface.createTable('products', {
        product_id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '商品ID'
        },
        product_name: {
          type: Sequelize.STRING(200),
          allowNull: false,
          comment: '商品名称'
        },
        category_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'categories', key: 'category_id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
          comment: '所属品类'
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '商品描述（富文本）'
        },
        primary_media_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'media_files', key: 'media_id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
          comment: '主图'
        },
        item_template_id: {
          type: Sequelize.BIGINT,
          allowNull: true,
          references: { model: 'item_templates', key: 'item_template_id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
          comment: '关联物品模板（铸造时使用的模板）'
        },
        mint_instance: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '铸造开关：true=兑换后自动铸造Item实例，false=纯实物发货'
        },
        rarity_code: {
          type: Sequelize.STRING(50),
          allowNull: false,
          defaultValue: 'common',
          references: { model: 'rarity_defs', key: 'rarity_code' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
          comment: '稀有度'
        },
        status: {
          type: Sequelize.ENUM('active', 'inactive'),
          allowNull: false,
          defaultValue: 'active',
          comment: '状态'
        },
        sort_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '排序'
        },
        space: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'lucky',
          comment: '所属空间 lucky/premium/both'
        },
        is_pinned: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否置顶'
        },
        pinned_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '置顶时间'
        },
        is_new: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否新品'
        },
        is_hot: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否热门'
        },
        is_limited: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否限量'
        },
        is_recommended: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否推荐'
        },
        tags: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '标签数组'
        },
        sell_point: {
          type: Sequelize.STRING(200),
          allowNull: true,
          comment: '营销卖点'
        },
        usage_rules: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '使用说明'
        },
        video_url: {
          type: Sequelize.STRING(500),
          allowNull: true,
          comment: '视频URL'
        },
        stock_alert_threshold: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '库存预警阈值'
        },
        publish_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '定时上架'
        },
        unpublish_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '定时下架'
        },
        attributes_json: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '商品参数表快照（非EAV的补充，如长篇图文参数）'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        }
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci', comment: '统一SPU（EAV 商品中心 Layer 1，替代exchange_items）' })

      await queryInterface.addIndex('products', ['category_id', 'status'], { name: 'idx_products_category_status', transaction })
      await queryInterface.addIndex('products', ['status', 'sort_order'], { name: 'idx_products_status_sort', transaction })
      await queryInterface.addIndex('products', ['item_template_id'], { name: 'idx_products_item_template', transaction })
      await queryInterface.addIndex('products', ['rarity_code'], { name: 'idx_products_rarity', transaction })
      await queryInterface.addIndex('products', ['space', 'status'], { name: 'idx_products_space_status', transaction })
      await queryInterface.addIndex('products', ['is_pinned', 'pinned_at'], { name: 'idx_products_pinned', transaction })

      // ═══════════════════════════════════════
      // 表 6：SPU 非销售属性值 product_attribute_values
      // ═══════════════════════════════════════
      await queryInterface.createTable('product_attribute_values', {
        id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '主键'
        },
        product_id: {
          type: Sequelize.BIGINT,
          allowNull: false,
          references: { model: 'products', key: 'product_id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          comment: '商品'
        },
        attribute_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'attributes', key: 'attribute_id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          comment: '属性'
        },
        attribute_value: {
          type: Sequelize.STRING(500),
          allowNull: false,
          comment: '属性值（天然水晶/巴西）'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        }
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci', comment: 'SPU非销售属性值（EAV 商品中心 Layer 1）' })

      await queryInterface.addIndex('product_attribute_values', ['product_id', 'attribute_id'], {
        name: 'uk_product_attribute',
        unique: true,
        transaction
      })

      // ═══════════════════════════════════════
      // 表 7：统一 SKU — product_skus
      // ═══════════════════════════════════════
      await queryInterface.createTable('product_skus', {
        sku_id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: 'SKU ID'
        },
        product_id: {
          type: Sequelize.BIGINT,
          allowNull: false,
          references: { model: 'products', key: 'product_id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          comment: '所属商品'
        },
        sku_code: {
          type: Sequelize.STRING(100),
          allowNull: false,
          unique: true,
          comment: '唯一编码（如 dragon_gem_blue_L）'
        },
        stock: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '统一库存（所有渠道共享）'
        },
        sold_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '已售数量'
        },
        cost_price: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true,
          comment: '成本价（人民币）'
        },
        status: {
          type: Sequelize.ENUM('active', 'inactive'),
          allowNull: false,
          defaultValue: 'active',
          comment: '状态'
        },
        image_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'media_files', key: 'media_id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
          comment: 'SKU专属图片'
        },
        sort_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '排序'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        }
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci', comment: '统一SKU（EAV 商品中心 Layer 1，替代exchange_item_skus）' })

      await queryInterface.addIndex('product_skus', ['product_id', 'status'], { name: 'idx_product_skus_product_status', transaction })
      await queryInterface.addIndex('product_skus', ['status', 'stock'], { name: 'idx_product_skus_status_stock', transaction })

      // ═══════════════════════════════════════
      // 表 8：SKU 销售属性值 sku_attribute_values
      // ═══════════════════════════════════════
      await queryInterface.createTable('sku_attribute_values', {
        id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '主键'
        },
        sku_id: {
          type: Sequelize.BIGINT,
          allowNull: false,
          references: { model: 'product_skus', key: 'sku_id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          comment: '所属SKU'
        },
        attribute_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'attributes', key: 'attribute_id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          comment: '属性（如颜色）'
        },
        option_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'attribute_options', key: 'option_id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          comment: '属性值（如冰蓝）'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        }
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci', comment: 'SKU销售属性值（替代JSON spec_values，支持SQL级属性筛选）' })

      await queryInterface.addIndex('sku_attribute_values', ['sku_id', 'attribute_id'], {
        name: 'uk_sku_attribute',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('sku_attribute_values', ['attribute_id', 'option_id'], {
        name: 'idx_sku_attr_option',
        transaction
      })

      // ═══════════════════════════════════════
      // 表 9：兑换渠道定价 exchange_channel_prices (Layer 2)
      // ═══════════════════════════════════════
      await queryInterface.createTable('exchange_channel_prices', {
        id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '主键'
        },
        sku_id: {
          type: Sequelize.BIGINT,
          allowNull: false,
          references: { model: 'product_skus', key: 'sku_id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
          comment: '关联SKU'
        },
        cost_asset_code: {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: '支付的材料资产类型（如 red_shard）'
        },
        cost_amount: {
          type: Sequelize.BIGINT,
          allowNull: false,
          comment: '需要的数量（如 10）'
        },
        original_amount: {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '原价（划线价）'
        },
        is_enabled: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '是否在兑换渠道上架'
        },
        publish_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '定时上架'
        },
        unpublish_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '定时下架'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        }
      }, { transaction, charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci', comment: '兑换渠道定价（Layer 2，管理SKU在兑换商城的材料资产价格）' })

      await queryInterface.addIndex('exchange_channel_prices', ['sku_id', 'cost_asset_code'], {
        name: 'uk_exchange_price_sku_asset',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('exchange_channel_prices', ['is_enabled'], { name: 'idx_exchange_price_enabled', transaction })

      await transaction.commit()
      console.log('✅ 统一商品中心 9 张表创建完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.dropTable('exchange_channel_prices', { transaction })
      await queryInterface.dropTable('sku_attribute_values', { transaction })
      await queryInterface.dropTable('product_skus', { transaction })
      await queryInterface.dropTable('product_attribute_values', { transaction })
      await queryInterface.dropTable('products', { transaction })
      await queryInterface.dropTable('category_attributes', { transaction })
      await queryInterface.dropTable('attribute_options', { transaction })
      await queryInterface.dropTable('attributes', { transaction })
      await queryInterface.dropTable('categories', { transaction })
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
