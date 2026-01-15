'use strict'

/**
 * 市场分类系统实施迁移
 *
 * 基于 MarketListingService-category参数兼容残留清理报告-2026-01-13.md 拍板决策
 *
 * 变更内容：
 * 1. 创建 category_defs 字典表（物品类目定义）
 * 2. 创建 rarity_defs 字典表（稀有度定义）
 * 3. 创建 asset_group_defs 字典表（资产分组定义）
 * 4. 创建 item_templates 表（物品模板）
 * 5. 扩展 market_listings 表添加快照字段
 * 6. 更新 material_asset_types.group_code 外键约束
 * 7. 更新 item_instances.item_template_id 外键约束
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========================================
      // 第一步：创建字典表
      // ========================================

      // 1. 创建 category_defs 表（物品类目字典）
      console.log('📋 创建 category_defs 表（物品类目字典）...')
      await queryInterface.createTable(
        'category_defs',
        {
          category_code: {
            type: DataTypes.STRING(50),
            primaryKey: true,
            allowNull: false,
            comment: '类目代码（主键）：如 food_drink, electronics, fashion'
          },
          display_name: {
            type: DataTypes.STRING(100),
            allowNull: false,
            comment: '显示名称（UI展示）'
          },
          description: {
            type: DataTypes.STRING(500),
            allowNull: true,
            comment: '类目描述'
          },
          icon_url: {
            type: DataTypes.STRING(500),
            allowNull: true,
            comment: '图标URL'
          },
          sort_order: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '排序顺序（升序）'
          },
          is_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: '是否启用'
          },
          created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          },
          updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '物品类目字典表（Category Definitions - 商品/物品分类定义）'
        }
      )

      // 2. 创建 rarity_defs 表（稀有度字典）
      console.log('📋 创建 rarity_defs 表（稀有度字典）...')
      await queryInterface.createTable(
        'rarity_defs',
        {
          rarity_code: {
            type: DataTypes.STRING(50),
            primaryKey: true,
            allowNull: false,
            comment: '稀有度代码（主键）：如 common, uncommon, rare, epic, legendary'
          },
          display_name: {
            type: DataTypes.STRING(100),
            allowNull: false,
            comment: '显示名称（UI展示）'
          },
          description: {
            type: DataTypes.STRING(500),
            allowNull: true,
            comment: '稀有度描述'
          },
          color_hex: {
            type: DataTypes.STRING(7),
            allowNull: true,
            comment: '主题颜色（HEX格式）：如 #FFFFFF'
          },
          tier: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
            comment: '稀有度等级（数值越高越稀有）'
          },
          sort_order: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '排序顺序（升序）'
          },
          is_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: '是否启用'
          },
          created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          },
          updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '稀有度字典表（Rarity Definitions - 物品稀有度等级定义）'
        }
      )

      // 3. 创建 asset_group_defs 表（资产分组字典）
      console.log('📋 创建 asset_group_defs 表（资产分组字典）...')
      await queryInterface.createTable(
        'asset_group_defs',
        {
          group_code: {
            type: DataTypes.STRING(50),
            primaryKey: true,
            allowNull: false,
            comment:
              '分组代码（主键）：如 currency, points, red, orange, yellow, green, blue, purple'
          },
          display_name: {
            type: DataTypes.STRING(100),
            allowNull: false,
            comment: '显示名称（UI展示）'
          },
          description: {
            type: DataTypes.STRING(500),
            allowNull: true,
            comment: '分组描述'
          },
          group_type: {
            type: DataTypes.ENUM('system', 'material', 'custom'),
            allowNull: false,
            defaultValue: 'material',
            comment: '分组类型：system=系统级（积分/货币）, material=材料组, custom=自定义'
          },
          color_hex: {
            type: DataTypes.STRING(7),
            allowNull: true,
            comment: '主题颜色（HEX格式）：如 #FF0000'
          },
          sort_order: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '排序顺序（升序）'
          },
          is_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: '是否启用'
          },
          is_tradable: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: '该分组资产是否允许交易'
          },
          created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          },
          updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '资产分组字典表（Asset Group Definitions - 可交易资产分组定义）'
        }
      )

      // ========================================
      // 第二步：创建 item_templates 表
      // ========================================
      console.log('📋 创建 item_templates 表（物品模板）...')
      await queryInterface.createTable(
        'item_templates',
        {
          item_template_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '物品模板ID（主键）'
          },
          template_code: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
            comment: '模板代码（唯一业务标识）：如 prize_iphone_15_pro'
          },
          item_type: {
            type: DataTypes.STRING(50),
            allowNull: false,
            comment: '物品类型：对应 item_instances.item_type'
          },
          category_code: {
            type: DataTypes.STRING(50),
            allowNull: true,
            references: {
              model: 'category_defs',
              key: 'category_code'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
            comment: '类目代码（外键 → category_defs.category_code）'
          },
          rarity_code: {
            type: DataTypes.STRING(50),
            allowNull: true,
            references: {
              model: 'rarity_defs',
              key: 'rarity_code'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
            comment: '稀有度代码（外键 → rarity_defs.rarity_code）'
          },
          display_name: {
            type: DataTypes.STRING(200),
            allowNull: false,
            comment: '显示名称（UI展示）'
          },
          description: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: '物品描述'
          },
          image_url: {
            type: DataTypes.STRING(500),
            allowNull: true,
            comment: '物品图片URL'
          },
          thumbnail_url: {
            type: DataTypes.STRING(500),
            allowNull: true,
            comment: '缩略图URL'
          },
          reference_price_points: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            defaultValue: 0.0,
            comment: '参考价格（积分）：用于估值和建议定价'
          },
          is_tradable: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: '是否允许交易上架'
          },
          is_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: '是否启用'
          },
          meta: {
            type: DataTypes.JSON,
            allowNull: true,
            comment: '扩展元数据（JSON格式）'
          },
          created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          },
          updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '物品模板表（Item Templates - 不可叠加物品模板定义）'
        }
      )

      // 为 item_templates 添加索引
      console.log('📋 创建 item_templates 索引...')
      await queryInterface.addIndex('item_templates', ['item_type'], {
        name: 'idx_item_templates_item_type',
        transaction
      })
      await queryInterface.addIndex('item_templates', ['category_code'], {
        name: 'idx_item_templates_category_code',
        transaction
      })
      await queryInterface.addIndex('item_templates', ['rarity_code'], {
        name: 'idx_item_templates_rarity_code',
        transaction
      })
      await queryInterface.addIndex('item_templates', ['is_tradable', 'is_enabled'], {
        name: 'idx_item_templates_tradable_enabled',
        transaction
      })

      // ========================================
      // 第三步：扩展 market_listings 表
      // ========================================
      console.log('📋 扩展 market_listings 表添加快照字段...')

      // 添加物品实例快照字段
      await queryInterface.addColumn(
        'market_listings',
        'offer_item_template_id',
        {
          type: DataTypes.BIGINT,
          allowNull: true,
          after: 'offer_item_instance_id',
          references: {
            model: 'item_templates',
            key: 'item_template_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
          comment:
            '挂牌物品模板ID（快照 → item_templates.item_template_id，仅 listing_kind=item_instance 时有值）'
        },
        { transaction }
      )

      await queryInterface.addColumn(
        'market_listings',
        'offer_item_category_code',
        {
          type: DataTypes.STRING(50),
          allowNull: true,
          after: 'offer_item_template_id',
          references: {
            model: 'category_defs',
            key: 'category_code'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
          comment: '挂牌物品类目代码（快照 → category_defs.category_code）'
        },
        { transaction }
      )

      await queryInterface.addColumn(
        'market_listings',
        'offer_item_rarity',
        {
          type: DataTypes.STRING(50),
          allowNull: true,
          after: 'offer_item_category_code',
          references: {
            model: 'rarity_defs',
            key: 'rarity_code'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
          comment: '挂牌物品稀有度（快照 → rarity_defs.rarity_code）'
        },
        { transaction }
      )

      await queryInterface.addColumn(
        'market_listings',
        'offer_item_display_name',
        {
          type: DataTypes.STRING(200),
          allowNull: true,
          after: 'offer_item_rarity',
          comment: '挂牌物品显示名称（快照，便于搜索和展示）'
        },
        { transaction }
      )

      // 添加资产快照字段
      await queryInterface.addColumn(
        'market_listings',
        'offer_asset_group_code',
        {
          type: DataTypes.STRING(50),
          allowNull: true,
          after: 'offer_item_display_name',
          references: {
            model: 'asset_group_defs',
            key: 'group_code'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
          comment:
            '挂牌资产分组代码（快照 → asset_group_defs.group_code，仅 listing_kind=fungible_asset 时有值）'
        },
        { transaction }
      )

      await queryInterface.addColumn(
        'market_listings',
        'offer_asset_display_name',
        {
          type: DataTypes.STRING(100),
          allowNull: true,
          after: 'offer_asset_group_code',
          comment: '挂牌资产显示名称（快照，便于搜索和展示）'
        },
        { transaction }
      )

      // 为 market_listings 新字段添加索引
      console.log('📋 创建 market_listings 快照字段索引...')
      await queryInterface.addIndex('market_listings', ['offer_item_template_id'], {
        name: 'idx_market_listings_item_template',
        transaction
      })
      await queryInterface.addIndex('market_listings', ['offer_item_category_code'], {
        name: 'idx_market_listings_item_category',
        transaction
      })
      await queryInterface.addIndex('market_listings', ['offer_item_rarity'], {
        name: 'idx_market_listings_item_rarity',
        transaction
      })
      await queryInterface.addIndex('market_listings', ['offer_asset_group_code'], {
        name: 'idx_market_listings_asset_group',
        transaction
      })
      // 复合索引：常用筛选组合
      await queryInterface.addIndex(
        'market_listings',
        ['status', 'listing_kind', 'offer_item_category_code'],
        {
          name: 'idx_market_listings_status_kind_category',
          transaction
        }
      )
      await queryInterface.addIndex(
        'market_listings',
        ['status', 'listing_kind', 'offer_asset_group_code'],
        {
          name: 'idx_market_listings_status_kind_asset_group',
          transaction
        }
      )

      // ========================================
      // 第四步：插入字典初始数据
      // ========================================
      console.log('📋 插入字典表初始数据...')

      // 4.1 插入 category_defs 初始数据
      await queryInterface.bulkInsert(
        'category_defs',
        [
          {
            category_code: 'electronics',
            display_name: '电子产品',
            description: '手机、平板、数码设备等电子产品',
            sort_order: 1,
            is_enabled: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            category_code: 'food_drink',
            display_name: '餐饮美食',
            description: '餐厅代金券、美食礼包等',
            sort_order: 2,
            is_enabled: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            category_code: 'voucher',
            display_name: '优惠券',
            description: '折扣券、满减券、代金券等',
            sort_order: 3,
            is_enabled: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            category_code: 'gift_card',
            display_name: '礼品卡',
            description: '各类礼品卡、充值卡',
            sort_order: 4,
            is_enabled: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            category_code: 'home_life',
            display_name: '家居生活',
            description: '家居用品、生活百货',
            sort_order: 5,
            is_enabled: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            category_code: 'other',
            display_name: '其他',
            description: '其他类型奖品',
            sort_order: 99,
            is_enabled: true,
            created_at: new Date(),
            updated_at: new Date()
          }
        ],
        { transaction }
      )

      // 4.2 插入 rarity_defs 初始数据
      await queryInterface.bulkInsert(
        'rarity_defs',
        [
          {
            rarity_code: 'common',
            display_name: '普通',
            description: '常见物品',
            color_hex: '#9E9E9E',
            tier: 1,
            sort_order: 1,
            is_enabled: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            rarity_code: 'uncommon',
            display_name: '稀有',
            description: '较为稀有的物品',
            color_hex: '#4CAF50',
            tier: 2,
            sort_order: 2,
            is_enabled: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            rarity_code: 'rare',
            display_name: '精良',
            description: '精良品质物品',
            color_hex: '#2196F3',
            tier: 3,
            sort_order: 3,
            is_enabled: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            rarity_code: 'epic',
            display_name: '史诗',
            description: '史诗级稀有物品',
            color_hex: '#9C27B0',
            tier: 4,
            sort_order: 4,
            is_enabled: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            rarity_code: 'legendary',
            display_name: '传说',
            description: '传说级顶级物品',
            color_hex: '#FF9800',
            tier: 5,
            sort_order: 5,
            is_enabled: true,
            created_at: new Date(),
            updated_at: new Date()
          }
        ],
        { transaction }
      )

      // 4.3 插入 asset_group_defs 初始数据
      await queryInterface.bulkInsert(
        'asset_group_defs',
        [
          {
            group_code: 'currency',
            display_name: '货币',
            description: '系统货币（积分等）',
            group_type: 'system',
            color_hex: '#FFD700',
            sort_order: 1,
            is_enabled: true,
            is_tradable: false,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            group_code: 'points',
            display_name: '积分',
            description: '用户积分',
            group_type: 'system',
            color_hex: '#FFC107',
            sort_order: 2,
            is_enabled: true,
            is_tradable: false,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            group_code: 'red',
            display_name: '红色材料',
            description: '红色系列材料资产',
            group_type: 'material',
            color_hex: '#F44336',
            sort_order: 10,
            is_enabled: true,
            is_tradable: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            group_code: 'orange',
            display_name: '橙色材料',
            description: '橙色系列材料资产',
            group_type: 'material',
            color_hex: '#FF9800',
            sort_order: 11,
            is_enabled: true,
            is_tradable: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            group_code: 'yellow',
            display_name: '黄色材料',
            description: '黄色系列材料资产',
            group_type: 'material',
            color_hex: '#FFEB3B',
            sort_order: 12,
            is_enabled: true,
            is_tradable: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            group_code: 'green',
            display_name: '绿色材料',
            description: '绿色系列材料资产',
            group_type: 'material',
            color_hex: '#4CAF50',
            sort_order: 13,
            is_enabled: true,
            is_tradable: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            group_code: 'blue',
            display_name: '蓝色材料',
            description: '蓝色系列材料资产',
            group_type: 'material',
            color_hex: '#2196F3',
            sort_order: 14,
            is_enabled: true,
            is_tradable: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            group_code: 'purple',
            display_name: '紫色材料',
            description: '紫色系列材料资产',
            group_type: 'material',
            color_hex: '#9C27B0',
            sort_order: 15,
            is_enabled: true,
            is_tradable: true,
            created_at: new Date(),
            updated_at: new Date()
          }
        ],
        { transaction }
      )

      // ========================================
      // 第五步：更新 material_asset_types 外键
      // ========================================
      console.log('📋 检查并更新 material_asset_types.group_code 外键...')

      // 先统一 group_code 为小写（处理 CURRENCY, POINTS_GROUP 等大写值）
      await queryInterface.sequelize.query(
        `
        UPDATE material_asset_types 
        SET group_code = LOWER(group_code) 
        WHERE group_code != LOWER(group_code)
      `,
        { transaction }
      )

      // 处理 POINTS_GROUP → points 的映射
      await queryInterface.sequelize.query(
        `
        UPDATE material_asset_types 
        SET group_code = 'points' 
        WHERE group_code = 'points_group'
      `,
        { transaction }
      )

      // 检查是否存在外键约束，如果不存在则添加
      const [existingFk] = await queryInterface.sequelize.query(
        `
        SELECT CONSTRAINT_NAME 
        FROM information_schema.TABLE_CONSTRAINTS 
        WHERE TABLE_NAME = 'material_asset_types' 
          AND CONSTRAINT_TYPE = 'FOREIGN KEY' 
          AND CONSTRAINT_NAME = 'fk_material_asset_types_group_code'
      `,
        { transaction }
      )

      if (existingFk.length === 0) {
        await queryInterface.addConstraint('material_asset_types', {
          fields: ['group_code'],
          type: 'foreign key',
          name: 'fk_material_asset_types_group_code',
          references: {
            table: 'asset_group_defs',
            field: 'group_code'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
          transaction
        })
        console.log('✅ 添加 material_asset_types.group_code 外键约束')
      } else {
        console.log('ℹ️ material_asset_types.group_code 外键约束已存在，跳过')
      }

      // ========================================
      // 提交事务
      // ========================================
      await transaction.commit()
      console.log('✅ 市场分类系统数据库迁移完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚市场分类系统迁移...')

      // ========================================
      // 第一步：移除 material_asset_types 外键
      // ========================================
      console.log('📋 移除 material_asset_types.group_code 外键...')
      try {
        await queryInterface.removeConstraint(
          'material_asset_types',
          'fk_material_asset_types_group_code',
          { transaction }
        )
      } catch (e) {
        console.log('ℹ️ 外键约束可能不存在，跳过:', e.message)
      }

      // ========================================
      // 第二步：移除 market_listings 快照字段索引
      // ========================================
      console.log('📋 移除 market_listings 快照字段索引...')
      const indexesToRemove = [
        'idx_market_listings_status_kind_asset_group',
        'idx_market_listings_status_kind_category',
        'idx_market_listings_asset_group',
        'idx_market_listings_item_rarity',
        'idx_market_listings_item_category',
        'idx_market_listings_item_template'
      ]
      for (const indexName of indexesToRemove) {
        try {
          await queryInterface.removeIndex('market_listings', indexName, { transaction })
        } catch (e) {
          console.log(`ℹ️ 索引 ${indexName} 可能不存在，跳过`)
        }
      }

      // ========================================
      // 第三步：移除 market_listings 快照字段
      // ========================================
      console.log('📋 移除 market_listings 快照字段...')
      const columnsToRemove = [
        'offer_asset_display_name',
        'offer_asset_group_code',
        'offer_item_display_name',
        'offer_item_rarity',
        'offer_item_category_code',
        'offer_item_template_id'
      ]
      for (const column of columnsToRemove) {
        try {
          await queryInterface.removeColumn('market_listings', column, { transaction })
        } catch (e) {
          console.log(`ℹ️ 字段 ${column} 可能不存在，跳过`)
        }
      }

      // ========================================
      // 第四步：删除 item_templates 表
      // ========================================
      console.log('📋 删除 item_templates 表...')
      await queryInterface.dropTable('item_templates', { transaction })

      // ========================================
      // 第五步：删除字典表
      // ========================================
      console.log('📋 删除字典表...')
      await queryInterface.dropTable('asset_group_defs', { transaction })
      await queryInterface.dropTable('rarity_defs', { transaction })
      await queryInterface.dropTable('category_defs', { transaction })

      // ========================================
      // 提交事务
      // ========================================
      await transaction.commit()
      console.log('✅ 市场分类系统迁移回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
