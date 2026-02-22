'use strict'

/**
 * 创建分群策略配置表 segment_rule_configs
 *
 * 业务背景：
 * - 将硬编码在 config/segment_rules.js 中的分群策略迁移到数据库
 * - 运营可通过管理后台动态配置分群规则，无需开发改代码部署
 * - 字段 + 运算符白名单由 config/segment_field_registry.js 控制安全性
 *
 * rules JSON 结构示例：
 * [
 *   {
 *     "segment_key": "new_user",
 *     "label": "新用户",
 *     "conditions": [{ "field": "created_at", "operator": "days_within", "value": 7 }],
 *     "logic": "AND",
 *     "priority": 10
 *   },
 *   {
 *     "segment_key": "regular_user",
 *     "label": "普通用户",
 *     "conditions": [],
 *     "logic": "AND",
 *     "priority": 0
 *   }
 * ]
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* 检查表是否已存在 */
      const [tables] = await queryInterface.sequelize.query(
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'segment_rule_configs'",
        { transaction }
      )

      if (tables.length === 0) {
        await queryInterface.createTable(
          'segment_rule_configs',
          {
            segment_rule_config_id: {
              type: Sequelize.INTEGER,
              primaryKey: true,
              autoIncrement: true,
              comment: '分群策略配置唯一标识'
            },
            version_key: {
              type: Sequelize.STRING(32),
              allowNull: false,
              unique: true,
              comment: '版本标识（如 default, v1, custom_v1）'
            },
            version_name: {
              type: Sequelize.STRING(100),
              allowNull: false,
              comment: '版本名称（如 不分群、新老用户分层）'
            },
            description: {
              type: Sequelize.STRING(500),
              allowNull: true,
              comment: '版本描述'
            },
            rules: {
              type: Sequelize.JSON,
              allowNull: false,
              comment: '规则数组 JSON（见文件头注释）'
            },
            is_system: {
              type: Sequelize.TINYINT(1),
              allowNull: false,
              defaultValue: 0,
              comment: '是否系统内置（1=内置不可删除, 0=自定义）'
            },
            status: {
              type: Sequelize.STRING(20),
              allowNull: false,
              defaultValue: 'active',
              comment: '状态：active=启用, archived=归档'
            },
            created_by: {
              type: Sequelize.INTEGER,
              allowNull: true,
              comment: '创建人 user_id'
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
          },
          {
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci',
            comment: '用户分群策略配置表（运营可动态管理分群规则）',
            transaction
          }
        )
      }

      /* 种子数据：将内置版本写入表中 */
      const [existing] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as cnt FROM segment_rule_configs',
        { transaction }
      )

      if (existing[0].cnt === 0) {
        await queryInterface.bulkInsert(
          'segment_rule_configs',
          [
            {
              version_key: 'default',
              version_name: '不分群',
              description: '所有用户使用相同概率配置，不区分用户群体',
              rules: JSON.stringify([
                {
                  segment_key: 'default',
                  label: '所有用户',
                  conditions: [],
                  logic: 'AND',
                  priority: 0
                }
              ]),
              is_system: 1,
              status: 'active',
              created_at: new Date(),
              updated_at: new Date()
            },
            {
              version_key: 'v1',
              version_name: '新老用户分层',
              description: '注册 ≤7天为新用户，其余为普通用户',
              rules: JSON.stringify([
                {
                  segment_key: 'new_user',
                  label: '新用户',
                  conditions: [{ field: 'created_at', operator: 'days_within', value: 7 }],
                  logic: 'AND',
                  priority: 10
                },
                {
                  segment_key: 'regular_user',
                  label: '普通用户',
                  conditions: [],
                  logic: 'AND',
                  priority: 0
                }
              ]),
              is_system: 1,
              status: 'active',
              created_at: new Date(),
              updated_at: new Date()
            },
            {
              version_key: 'v2',
              version_name: '积分等级分层',
              description: '按历史总积分划分 VIP 等级',
              rules: JSON.stringify([
                {
                  segment_key: 'vip_premium',
                  label: '尊享VIP',
                  conditions: [
                    { field: 'history_total_points', operator: 'gte', value: 100000 }
                  ],
                  logic: 'AND',
                  priority: 20
                },
                {
                  segment_key: 'vip_basic',
                  label: '基础VIP',
                  conditions: [{ field: 'history_total_points', operator: 'gte', value: 10000 }],
                  logic: 'AND',
                  priority: 10
                },
                {
                  segment_key: 'regular_user',
                  label: '普通用户',
                  conditions: [],
                  logic: 'AND',
                  priority: 0
                }
              ]),
              is_system: 1,
              status: 'active',
              created_at: new Date(),
              updated_at: new Date()
            },
            {
              version_key: 'v3',
              version_name: '新用户+VIP组合',
              description: '综合注册时间和积分的组合分群策略',
              rules: JSON.stringify([
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
                {
                  segment_key: 'regular_user',
                  label: '普通用户',
                  conditions: [],
                  logic: 'AND',
                  priority: 0
                }
              ]),
              is_system: 1,
              status: 'active',
              created_at: new Date(),
              updated_at: new Date()
            },
            {
              version_key: 'v4',
              version_name: '活跃度分层',
              description: '按最后活跃时间划分用户活跃度',
              rules: JSON.stringify([
                {
                  segment_key: 'active_user',
                  label: '活跃用户',
                  conditions: [{ field: 'last_active_at', operator: 'days_within', value: 7 }],
                  logic: 'AND',
                  priority: 20
                },
                {
                  segment_key: 'normal_user',
                  label: '一般用户',
                  conditions: [{ field: 'last_active_at', operator: 'days_within', value: 30 }],
                  logic: 'AND',
                  priority: 10
                },
                {
                  segment_key: 'inactive_user',
                  label: '沉默用户',
                  conditions: [],
                  logic: 'AND',
                  priority: 0
                }
              ]),
              is_system: 1,
              status: 'active',
              created_at: new Date(),
              updated_at: new Date()
            }
          ],
          { transaction }
        )
      }

      await transaction.commit()
      console.log('✅ segment_rule_configs 表创建成功，已写入 5 个内置版本')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('segment_rule_configs')
  }
}
