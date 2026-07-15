'use strict'

/**
 * 新建「活动预算归集规则」表（水晶奖品倍率活动设计方案 §12.10 / §18.4 / B-6）
 *
 * 业务语义：
 * - 限时翻倍活动期间，消费审核通过发放的预算积分不再进全局桶 CONSUMPTION_DEFAULT，
 *   而是按本表规则命中后"全额重定向"进该活动的个人专属预算桶 EVENT_<活动code>（防7 全量重定向），
 *   并同步发放活动积分 event_points（可见层入场代币，§12.7 双层货币）。
 * - 规则由运营在 Web 后台配置（关联活动、生效时间窗、命中条件门店/商家、event_points 发放比率）。
 * - 小程序/商家端不加人工选择口（防9），归集去向由本表规则自动判定。
 *
 * 关键约束（对齐真实库）：
 * - lottery_campaign_id INT（对齐 lottery_campaigns.lottery_campaign_id 真实类型）。
 * - 预算桶键运行时派生：EVENT_<campaign_code>（D-5 字符串桶键规范），不在本表冗余存储。
 * - store_ids / merchant_ids JSON 数组（NULL=不限），弱引用软标识（门店/商家可独立增删）。
 * - 字符集 utf8mb4_unicode_ci；BIGINT 主键；事务化 up/down 可回滚。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()

    try {
      await queryInterface.createTable(
        'event_budget_collection_rules',
        {
          collection_rule_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '归集规则主键'
          },
          lottery_campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment:
              '归集去向的抽奖活动ID（FK→lottery_campaigns.lottery_campaign_id）；命中本规则的消费预算全额进 EVENT_<该活动campaign_code> 专属桶'
          },
          rule_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '规则名（对内运营识别，如"新春活动预算归集"）'
          },
          store_ids: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '命中门店ID数组（消费记录 store_id 在列表内才命中）；NULL=不限门店'
          },
          merchant_ids: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '命中商家ID数组（消费记录 merchant_id 在列表内才命中）；NULL=不限商家'
          },
          event_points_ratio: {
            type: Sequelize.DECIMAL(10, 4),
            allowNull: false,
            defaultValue: 1.0,
            comment:
              '活动积分发放比率：event_points = round(消费金额 × 比率)；可见层入场代币（§12.7），0=只归集预算不发活动积分'
          },
          start_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '生效开始（北京时间）；NULL=对齐活动 start_time'
          },
          end_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '生效结束（北京时间）；NULL=对齐活动 end_time'
          },
          priority: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '优先级（多规则同时命中同一笔消费时取最高优先级一条，越大越优先）'
          },
          status: {
            type: Sequelize.ENUM('active', 'inactive'),
            allowNull: false,
            defaultValue: 'inactive',
            comment: '开关：active 生效 / inactive 停用'
          },
          remark: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '备注'
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
          comment:
            '活动预算归集规则（限时翻倍活动消费预算重定向 + event_points 发放；§12.10 后端规则自动判定，无人工选择口）'
        }
      )

      await queryInterface.addIndex(
        'event_budget_collection_rules',
        ['status', 'start_at', 'end_at'],
        { name: 'idx_ebcr_status_window', transaction }
      )
      await queryInterface.addIndex('event_budget_collection_rules', ['lottery_campaign_id'], {
        name: 'idx_ebcr_campaign',
        transaction
      })
      await queryInterface.addConstraint('event_budget_collection_rules', {
        fields: ['lottery_campaign_id'],
        type: 'foreign key',
        name: 'fk_ebcr_lottery_campaign',
        references: { table: 'lottery_campaigns', field: 'lottery_campaign_id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('event_budget_collection_rules')
  }
}
