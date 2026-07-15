'use strict'

/**
 * 集中奖品目录方案迁移
 *
 * 新增表：
 * 1. prize_definitions — 奖品目录（全局唯一真相源）
 * 2. lottery_campaign_prizes — 活动-奖品关联表（活动引用奖品 + 配置权重/库存/档位）
 *
 * 业务背景：
 * - 将"每活动独立配置奖品"模式升级为"集中奖品目录 + 活动引用"模式
 * - 同一奖品全局价值统一，活动只配置权重/库存/档位
 * - budget_cost 不存储，运行时通过 material_asset_types.budget_value_points × material_amount 实时计算
 *
 * 决策依据：docs/奖品管理架构决策-集中奖品目录方案.md
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 开始创建集中奖品目录表...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========================================
      // 第1部分：创建 prize_definitions 表
      // ========================================
      console.log('\n📦 第1部分：创建 prize_definitions 表...')

      await queryInterface.createTable('prize_definitions', {
        prize_definition_id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '奖品定义ID（主键）'
        },
        prize_code: {
          type: Sequelize.STRING(80),
          allowNull: false,
          unique: true,
          comment: '业务码（如 star_stone_500、red_core_shard_50）'
        },
        display_name: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: '展示名称（如 星石 ×500）'
        },
        prize_type: {
          type: Sequelize.ENUM('material', 'item', 'coupon', 'points'),
          allowNull: false,
          comment: '奖品类型：material=材料资产, item=物品模板, coupon=优惠券, points=积分'
        },
        material_asset_code: {
          type: Sequelize.STRING(32),
          allowNull: true,
          comment: '材料资产编码（FK→material_asset_types.asset_code）'
        },
        material_amount: {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '材料数量'
        },
        item_template_id: {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '物品模板ID（FK→item_templates.item_template_id，物品类奖品）'
        },
        rarity_code: {
          type: Sequelize.STRING(50),
          allowNull: false,
          defaultValue: 'common',
          comment: '稀有度编码（FK→rarity_defs.rarity_code）'
        },
        primary_media_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          comment: '主图媒体ID（FK→media_files.media_file_id）'
        },
        reward_tier: {
          type: Sequelize.ENUM('high', 'mid', 'low'),
          allowNull: false,
          defaultValue: 'low',
          comment: '默认档位（活动关联表可覆盖）'
        },
        is_enabled: {
          type: Sequelize.TINYINT(1),
          allowNull: false,
          defaultValue: 1,
          comment: '是否启用'
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '奖品描述'
        },
        merchant_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '商户ID（FK→merchants，多商家隔离）'
        },
        meta: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '扩展字段（JSON）'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        },
        deleted_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '软删除时间'
        }
      }, {
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '奖品目录表 — 全局唯一真相源，活动通过关联表引用'
      })

      console.log('  ✅ prize_definitions 表创建完成')

      // ========================================
      // 第2部分：创建 lottery_campaign_prizes 表
      // ========================================
      console.log('\n📦 第2部分：创建 lottery_campaign_prizes 表...')

      await queryInterface.createTable('lottery_campaign_prizes', {
        lottery_campaign_prize_id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '活动奖品关联ID（主键）'
        },
        lottery_campaign_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '活动ID（FK→lottery_campaigns.lottery_campaign_id）'
        },
        prize_definition_id: {
          type: Sequelize.BIGINT,
          allowNull: false,
          comment: '奖品定义ID（FK→prize_definitions.prize_definition_id）'
        },
        win_weight: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 0,
          comment: '本活动中的权重（越大越容易中）'
        },
        stock_quantity: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 999999,
          comment: '本活动中的库存'
        },
        reward_tier: {
          type: Sequelize.ENUM('high', 'mid', 'low'),
          allowNull: false,
          defaultValue: 'low',
          comment: '本活动中的档位（可覆盖奖品定义的默认档位）'
        },
        is_fallback: {
          type: Sequelize.TINYINT(1),
          allowNull: false,
          defaultValue: 0,
          comment: '是否兜底奖品'
        },
        sort_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 100,
          comment: '排序序号'
        },
        status: {
          type: Sequelize.ENUM('active', 'inactive'),
          allowNull: false,
          defaultValue: 'active',
          comment: '状态'
        },
        max_daily_wins: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '每日最大中奖次数限制'
        },
        max_user_wins: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '每用户最大中奖次数限制'
        },
        total_win_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '累计中奖次数'
        },
        daily_win_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '当日中奖次数'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      }, {
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '活动-奖品关联表 — 活动引用奖品目录 + 配置权重/库存/档位'
      })

      console.log('  ✅ lottery_campaign_prizes 表创建完成')

      // ========================================
      // 第3部分：创建索引
      // ========================================
      console.log('\n📦 第3部分：创建索引...')

      // prize_definitions 索引
      await queryInterface.addIndex('prize_definitions', ['prize_type'], {
        name: 'idx_prize_definitions_type',
        transaction
      })
      await queryInterface.addIndex('prize_definitions', ['rarity_code'], {
        name: 'idx_prize_definitions_rarity',
        transaction
      })
      await queryInterface.addIndex('prize_definitions', ['material_asset_code'], {
        name: 'idx_prize_definitions_material',
        transaction
      })
      await queryInterface.addIndex('prize_definitions', ['is_enabled'], {
        name: 'idx_prize_definitions_enabled',
        transaction
      })
      await queryInterface.addIndex('prize_definitions', ['merchant_id'], {
        name: 'idx_prize_definitions_merchant',
        transaction
      })
      await queryInterface.addIndex('prize_definitions', ['reward_tier'], {
        name: 'idx_prize_definitions_tier',
        transaction
      })

      // lottery_campaign_prizes 索引
      await queryInterface.addIndex('lottery_campaign_prizes',
        ['lottery_campaign_id', 'prize_definition_id'], {
          name: 'uk_campaign_prize',
          unique: true,
          transaction
        })
      await queryInterface.addIndex('lottery_campaign_prizes',
        ['lottery_campaign_id', 'status'], {
          name: 'idx_campaign_prizes_status',
          transaction
        })
      await queryInterface.addIndex('lottery_campaign_prizes', ['prize_definition_id'], {
        name: 'idx_campaign_prizes_definition',
        transaction
      })
      await queryInterface.addIndex('lottery_campaign_prizes',
        ['lottery_campaign_id', 'reward_tier'], {
          name: 'idx_campaign_prizes_tier',
          transaction
        })

      console.log('  ✅ 索引创建完成')

      // ========================================
      // 第4部分：添加外键约束
      // ========================================
      console.log('\n📦 第4部分：添加外键约束...')

      // prize_definitions 外键
      await queryInterface.addConstraint('prize_definitions', {
        fields: ['merchant_id'],
        type: 'foreign key',
        name: 'fk_prize_definitions_merchant',
        references: { table: 'merchants', field: 'merchant_id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction
      })

      await queryInterface.addConstraint('prize_definitions', {
        fields: ['primary_media_id'],
        type: 'foreign key',
        name: 'fk_prize_definitions_media',
        references: { table: 'media_files', field: 'media_id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction
      })

      // lottery_campaign_prizes 外键
      await queryInterface.addConstraint('lottery_campaign_prizes', {
        fields: ['lottery_campaign_id'],
        type: 'foreign key',
        name: 'fk_campaign_prizes_campaign',
        references: { table: 'lottery_campaigns', field: 'lottery_campaign_id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      await queryInterface.addConstraint('lottery_campaign_prizes', {
        fields: ['prize_definition_id'],
        type: 'foreign key',
        name: 'fk_campaign_prizes_definition',
        references: { table: 'prize_definitions', field: 'prize_definition_id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })

      console.log('  ✅ 外键约束添加完成')

      // ========================================
      // 第5部分：数据完整性验证
      // ========================================
      console.log('\n📦 第5部分：数据完整性验证...')

      const tables = await queryInterface.showAllTables()
      const requiredTables = ['prize_definitions', 'lottery_campaign_prizes']
      const missingTables = requiredTables.filter(t => !tables.includes(t))

      if (missingTables.length > 0) {
        throw new Error(`缺少必需的表: ${missingTables.join(', ')}`)
      }

      const pdFields = await queryInterface.describeTable('prize_definitions')
      const pdRequired = ['prize_definition_id', 'prize_code', 'display_name', 'prize_type',
        'material_asset_code', 'material_amount', 'item_template_id', 'rarity_code',
        'reward_tier', 'is_enabled', 'merchant_id']
      const pdMissing = pdRequired.filter(f => !pdFields[f])
      if (pdMissing.length > 0) {
        throw new Error(`prize_definitions 表缺少字段: ${pdMissing.join(', ')}`)
      }

      const cpFields = await queryInterface.describeTable('lottery_campaign_prizes')
      const cpRequired = ['lottery_campaign_prize_id', 'lottery_campaign_id', 'prize_definition_id',
        'win_weight', 'stock_quantity', 'reward_tier', 'is_fallback', 'sort_order', 'status']
      const cpMissing = cpRequired.filter(f => !cpFields[f])
      if (cpMissing.length > 0) {
        throw new Error(`lottery_campaign_prizes 表缺少字段: ${cpMissing.join(', ')}`)
      }

      console.log('  ✅ 数据完整性验证通过')

      // ========================================
      // 提交事务
      // ========================================
      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ 集中奖品目录迁移执行成功！')
      console.log('='.repeat(60))
      console.log('\n📊 创建摘要:')
      console.log('  - 新增表: prize_definitions, lottery_campaign_prizes')
      console.log('  - 索引数量: 10')
      console.log('  - 外键约束: 4')
      console.log('')
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface) {
    console.log('🔄 开始回滚集中奖品目录迁移...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      await queryInterface.dropTable('lottery_campaign_prizes', { transaction })
      await queryInterface.dropTable('prize_definitions', { transaction })

      await transaction.commit()
      console.log('✅ 集中奖品目录迁移回滚成功')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
