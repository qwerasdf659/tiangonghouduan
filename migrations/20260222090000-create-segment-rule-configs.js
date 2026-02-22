'use strict'

/**
 * 用户分群规则动态管理 — 新建 segment_rule_configs 表
 *
 * 业务背景：
 * - 当前分群规则硬编码在 config/segment_rules.js 中，运营无法通过后台调整
 * - 新建此表后，运营可在管理后台自助配置分群条件
 * - SegmentResolver 优先读取数据库配置，未找到时回退到内置规则
 *
 * 变更内容：
 * 1. 新建 segment_rule_configs 表
 * 2. 插入 5 个内置版本的种子数据（is_system=1）
 *
 * @version 4.2.0
 * @date 2026-02-22
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 检查表是否已存在（幂等保护）
      const [tables] = await queryInterface.sequelize.query(
        "SHOW TABLES LIKE 'segment_rule_configs'",
        { transaction }
      )

      if (tables.length === 0) {
        await queryInterface.createTable(
          'segment_rule_configs',
          {
            /** 自增主键 */
            segment_rule_config_id: {
              type: Sequelize.INTEGER,
              autoIncrement: true,
              primaryKey: true,
              comment: '分群规则配置ID'
            },
            /** 版本标识（唯一） */
            version_key: {
              type: Sequelize.STRING(32),
              allowNull: false,
              unique: true,
              comment: '版本标识，如 default、v1、custom_spring_2026'
            },
            /** 版本名称（运营可见） */
            version_name: {
              type: Sequelize.STRING(100),
              allowNull: false,
              comment: '版本显示名称，如"不分群"、"新老用户分层"'
            },
            /** 版本描述 */
            description: {
              type: Sequelize.STRING(500),
              allowNull: true,
              comment: '版本描述'
            },
            /**
             * 规则数组（JSON）
             * 结构：[{ segment_key, label, conditions: [{field, operator, value}], logic, priority }]
             */
            rules: {
              type: Sequelize.JSON,
              allowNull: false,
              comment: '分群规则数组（条件构建器生成的规则 JSON）'
            },
            /** 是否系统内置（内置不可删除） */
            is_system: {
              type: Sequelize.TINYINT(1),
              allowNull: false,
              defaultValue: 0,
              comment: '是否系统内置：1=内置（不可删除），0=自定义'
            },
            /** 状态 */
            status: {
              type: Sequelize.STRING(20),
              allowNull: false,
              defaultValue: 'active',
              comment: '状态：active=启用，archived=已归档'
            },
            /** 创建人 */
            created_by: {
              type: Sequelize.INTEGER,
              allowNull: true,
              comment: '创建人用户ID'
            },
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
              comment: '创建时间'
            },
            updated_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
              comment: '更新时间'
            }
          },
          {
            transaction,
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci',
            comment: '用户分群规则配置表（运营可视化搭建分群条件）'
          }
        )
        console.log('  ✅ segment_rule_configs 表已创建')
      } else {
        console.log('  ⏭️ segment_rule_configs 表已存在，跳过创建')
      }

      // 插入内置版本种子数据
      const [existing] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) as count FROM segment_rule_configs WHERE is_system = 1",
        { transaction }
      )

      if (existing[0].count === 0) {
        await queryInterface.bulkInsert(
          'segment_rule_configs',
          [
            {
              version_key: 'default',
              version_name: '不分群',
              description: '所有用户使用相同的档位概率配置',
              rules: JSON.stringify([
                { segment_key: 'default', label: '所有用户', conditions: [], logic: 'AND', priority: 0 }
              ]),
              is_system: 1,
              status: 'active',
              created_at: new Date(),
              updated_at: new Date()
            },
            {
              version_key: 'v1',
              version_name: '新老用户分层',
              description: '注册7天内为新用户，享受更高的高档位概率',
              rules: JSON.stringify([
                {
                  segment_key: 'new_user',
                  label: '新用户',
                  conditions: [{ field: 'created_at', operator: 'days_within', value: 7 }],
                  logic: 'AND',
                  priority: 10
                },
                { segment_key: 'regular_user', label: '普通用户', conditions: [], logic: 'AND', priority: 0 }
              ]),
              is_system: 1,
              status: 'active',
              created_at: new Date(),
              updated_at: new Date()
            },
            {
              version_key: 'v2',
              version_name: 'VIP用户分层',
              description: '基于历史消费积分进行VIP等级分层',
              rules: JSON.stringify([
                {
                  segment_key: 'vip_premium',
                  label: '高级VIP',
                  conditions: [{ field: 'history_total_points', operator: 'gte', value: 100000 }],
                  logic: 'AND',
                  priority: 20
                },
                {
                  segment_key: 'vip_basic',
                  label: '普通VIP',
                  conditions: [{ field: 'history_total_points', operator: 'gte', value: 10000 }],
                  logic: 'AND',
                  priority: 10
                },
                { segment_key: 'regular_user', label: '普通用户', conditions: [], logic: 'AND', priority: 0 }
              ]),
              is_system: 1,
              status: 'active',
              created_at: new Date(),
              updated_at: new Date()
            },
            {
              version_key: 'v3',
              version_name: '组合分层策略',
              description: '同时考虑注册时间和消费等级的综合策略',
              rules: JSON.stringify([
                {
                  segment_key: 'new_vip',
                  label: '高价值新用户',
                  conditions: [
                    { field: 'created_at', operator: 'days_within', value: 7 },
                    { field: 'history_total_points', operator: 'gte', value: 10000 }
                  ],
                  logic: 'AND',
                  priority: 30
                },
                {
                  segment_key: 'new_user',
                  label: '新用户',
                  conditions: [{ field: 'created_at', operator: 'days_within', value: 7 }],
                  logic: 'AND',
                  priority: 20
                },
                {
                  segment_key: 'vip_user',
                  label: 'VIP用户',
                  conditions: [{ field: 'history_total_points', operator: 'gte', value: 10000 }],
                  logic: 'AND',
                  priority: 10
                },
                { segment_key: 'regular_user', label: '普通用户', conditions: [], logic: 'AND', priority: 0 }
              ]),
              is_system: 1,
              status: 'active',
              created_at: new Date(),
              updated_at: new Date()
            },
            {
              version_key: 'v4',
              version_name: '活跃度分层',
              description: '基于用户最近活跃情况进行分层，适用于召回活动',
              rules: JSON.stringify([
                {
                  segment_key: 'highly_active',
                  label: '高活跃用户',
                  conditions: [{ field: 'last_active_at', operator: 'days_within', value: 7 }],
                  logic: 'AND',
                  priority: 20
                },
                {
                  segment_key: 'moderately_active',
                  label: '中等活跃',
                  conditions: [{ field: 'last_active_at', operator: 'days_within', value: 30 }],
                  logic: 'AND',
                  priority: 10
                },
                { segment_key: 'inactive_user', label: '不活跃用户', conditions: [], logic: 'AND', priority: 0 }
              ]),
              is_system: 1,
              status: 'active',
              created_at: new Date(),
              updated_at: new Date()
            }
          ],
          { transaction }
        )
        console.log('  ✅ 5 个内置分群版本种子数据已插入')
      } else {
        console.log('  ⏭️ 内置种子数据已存在，跳过')
      }

      await transaction.commit()
      console.log('✅ 迁移完成：创建 segment_rule_configs 表')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败：', error.message)
      throw error
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('segment_rule_configs')
    console.log('✅ 回滚完成：删除 segment_rule_configs 表')
  }
}
