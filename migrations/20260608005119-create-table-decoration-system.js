'use strict'

/**
 * 创建表: decoration_season / decoration_sku / user_owned_decorations（星石虚拟装饰体系）
 *
 * 创建时间: 2026-06-08（路线B 合规改造 模块D·第1步）
 * 创建原因（第十节·游戏去内核版 / 决策 17.3）:
 * - 给星石（star_stone）建正当消耗出口：明码标价购买纯展示装饰（皮肤/头像框/称号等）。
 * - 🔴 红线（务必守住）：装饰明码标价星石购买、严禁抽装饰/开箱；纯展示零数值、不进任何业务计算；
 *   限时装饰到期清理。装饰偏好可作用户画像维度，但不碰抽奖/回馈逻辑。
 *
 * 表设计：
 * - decoration_season：赛季/限定周期（造稀缺，促当季消耗）
 * - decoration_sku：装饰 SKU（品质/赛季/套装归属/是否限定，无任何数值属性字段）
 * - user_owned_decorations：用户拥有（佩戴态 + 到期时间，NULL=永久）
 *
 * 回滚: 按依赖逆序删表
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      // 1. 赛季表
      await queryInterface.createTable(
        'decoration_season',
        {
          decoration_season_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: '装饰赛季主键'
          },
          season_code: {
            type: Sequelize.STRING(64),
            allowNull: false,
            comment: '赛季业务码（唯一稳定标识，如 s2026_summer）'
          },
          season_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '赛季名称（展示用）'
          },
          start_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '赛季开始时间（北京时间）'
          },
          end_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '赛季结束时间（北京时间）'
          },
          status: {
            type: Sequelize.ENUM('draft', 'active', 'ended'),
            allowNull: false,
            defaultValue: 'draft',
            comment: '赛季状态：draft-草稿 active-进行中 ended-已结束'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（北京时间）'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间（北京时间）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '装饰赛季/限定周期表（造稀缺促星石消耗）'
        }
      )
      await queryInterface.addConstraint('decoration_season', {
        fields: ['season_code'],
        type: 'unique',
        name: 'uk_decoration_season_code',
        transaction
      })

      // 2. 装饰 SKU 表（纯展示，无任何数值属性）
      await queryInterface.createTable(
        'decoration_sku',
        {
          decoration_sku_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: '装饰SKU主键'
          },
          decoration_code: {
            type: Sequelize.STRING(64),
            allowNull: false,
            comment: '装饰业务码（唯一稳定标识）'
          },
          decoration_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '装饰名称（展示用）'
          },
          decoration_type: {
            type: Sequelize.ENUM('avatar_frame', 'bubble', 'theme', 'title', 'badge_visual'),
            allowNull: false,
            comment: '装饰类型：头像框/气泡/主题/称号/视觉徽章（纯 UI 展示）'
          },
          rarity_code: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '品质分级（仅视觉差异，零数值）：关联 rarity_defs.rarity_code'
          },
          decoration_season_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '所属赛季（NULL=常驻），FK→decoration_season',
            references: { model: 'decoration_season', key: 'decoration_season_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          set_code: {
            type: Sequelize.STRING(64),
            allowNull: true,
            comment: '套装归属码（同套装集齐可额外展示效果，NULL=不属套装）'
          },
          is_limited: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '是否限定款（限时供应，绝版机制）'
          },
          price_star_stone: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '明码标价（星石数量）；严禁抽取/开箱获得'
          },
          validity_days: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '有效期天数（NULL=永久；>0=限时装饰，购买后 N 天到期）'
          },
          image_url: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '装饰预览图 URL'
          },
          status: {
            type: Sequelize.ENUM('draft', 'on_sale', 'off_sale'),
            allowNull: false,
            defaultValue: 'draft',
            comment: '上架状态：draft-草稿 on_sale-在售 off_sale-下架'
          },
          sort_order: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '展示排序'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（北京时间）'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间（北京时间）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '装饰SKU表（纯展示零数值，星石明码标价，禁止抽取/开箱）'
        }
      )
      await queryInterface.addConstraint('decoration_sku', {
        fields: ['decoration_code'],
        type: 'unique',
        name: 'uk_decoration_sku_code',
        transaction
      })
      await queryInterface.addIndex('decoration_sku', ['status', 'sort_order'], {
        name: 'idx_decoration_sku_status_sort',
        transaction
      })
      await queryInterface.addIndex('decoration_sku', ['decoration_season_id'], {
        name: 'idx_decoration_sku_season',
        transaction
      })

      // 3. 用户拥有装饰表
      await queryInterface.createTable(
        'user_owned_decorations',
        {
          user_owned_decoration_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '用户拥有装饰主键'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '用户ID，FK→users.user_id',
            references: { model: 'users', key: 'user_id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          decoration_sku_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '装饰SKU ID，FK→decoration_sku.decoration_sku_id',
            references: { model: 'decoration_sku', key: 'decoration_sku_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          equipped: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '是否佩戴中（仅影响 UI 展示，不进任何业务计算）'
          },
          acquired_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '获得时间（北京时间）'
          },
          expires_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '到期时间（NULL=永久；限时装饰到期后由定时任务清理）'
          },
          status: {
            type: Sequelize.ENUM('active', 'expired'),
            allowNull: false,
            defaultValue: 'active',
            comment: '持有状态：active-有效 expired-已过期'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（北京时间）'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间（北京时间）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '用户拥有装饰表（佩戴态+到期，纯展示不进业务计算）'
        }
      )
      await queryInterface.addIndex('user_owned_decorations', ['user_id', 'status'], {
        name: 'idx_user_owned_deco_user_status',
        transaction
      })
      await queryInterface.addIndex('user_owned_decorations', ['expires_at'], {
        name: 'idx_user_owned_deco_expires',
        transaction
      })
      // 防重复持有同一装饰（同一用户同一 SKU 仅一条有效）
      await queryInterface.addConstraint('user_owned_decorations', {
        fields: ['user_id', 'decoration_sku_id'],
        type: 'unique',
        name: 'uk_user_owned_deco_user_sku',
        transaction
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.dropTable('user_owned_decorations', { transaction })
      await queryInterface.dropTable('decoration_sku', { transaction })
      await queryInterface.dropTable('decoration_season', { transaction })
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
