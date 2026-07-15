'use strict'

/**
 * 创建表: exchange_redeem_requirement（兑换复合门槛配置表）
 *
 * 创建时间: 2026-06-08（路线B 合规改造 模块C·第2步）
 * 创建原因（第七节 / 7.5 用例）:
 * - 高价值实物用"VIP等级 + 多资产 + 消耗指定道具"复合门槛发放，打散单一碎片价格锚点，
 *   定性为"会员尊享权益"而非"虚拟币购物"。
 * - 门槛叠加在 exchange_channel_prices 单资产计价之上（不替换原计价，只追加额外条件）。
 *
 * 字段语义（对齐 7.5 用例）:
 * - exchange_item_id / sku_id : 关联兑换商品/SKU（sku_id 可空=作用于整个商品）
 * - min_growth_level_key      : 最低成长等级门槛（关联 user_growth_levels.level_key，如 'diamond'）
 * - extra_cost_assets (JSON)  : 多资产组合 [{asset_code, amount}]（在主计价之外额外扣减）
 * - required_consume_items(JSON): 需消耗的指定道具 [{item_template_id, quantity}]
 * - required_badges/required_tasks (JSON): 预留（奖章/任务体系，本期可空）
 * - is_enabled / publish_at / unpublish_at : 上下架窗口（对齐 channel_prices 风格）
 *
 * 🔴 合规红线（兑换校验时执行，本表只存配置）:
 * - 目标为实物/券(valuable)：extra_cost_assets 禁含 star_stone（仅水晶系），由 AssetProductGuard 拦截
 * - 目标为 prop(零价值)：水晶系 + star_stone 均可
 *
 * 回滚: 删除整表
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.createTable(
        'exchange_redeem_requirement',
        {
          exchange_redeem_requirement_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: '兑换复合门槛配置主键'
          },
          exchange_item_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '关联兑换商品ID，FK→exchange_items.exchange_item_id',
            references: { model: 'exchange_items', key: 'exchange_item_id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          sku_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '关联SKU（NULL=作用于整个商品所有SKU）'
          },
          min_growth_level_key: {
            type: Sequelize.STRING(32),
            allowNull: true,
            comment: '最低成长等级门槛（关联 user_growth_levels.level_key，NULL=不限等级）'
          },
          extra_cost_assets: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '主计价外额外资产组合 [{asset_code, amount}]（实物侧禁含 star_stone）'
          },
          required_consume_items: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '需消耗的指定道具 [{item_template_id, quantity}]'
          },
          required_badges: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '需持有的奖章（预留，本期可空）'
          },
          required_tasks: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '需完成的任务（预留，本期可空）'
          },
          is_enabled: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: '是否启用该门槛配置'
          },
          publish_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '门槛生效起始时间（北京时间，NULL=立即生效）'
          },
          unpublish_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '门槛失效时间（北京时间，NULL=长期有效）'
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
          comment: '兑换复合门槛配置表（高价值实物 VIP+多资产+消耗道具门槛，叠加在单资产计价之上）'
        }
      )

      // 一个商品/SKU 一条有效门槛配置（sku_id 可空，用唯一约束防重复）
      await queryInterface.addIndex('exchange_redeem_requirement', ['exchange_item_id', 'sku_id'], {
        name: 'idx_redeem_req_item_sku',
        transaction
      })
      await queryInterface.addIndex('exchange_redeem_requirement', ['is_enabled'], {
        name: 'idx_redeem_req_enabled',
        transaction
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('exchange_redeem_requirement')
  }
}
