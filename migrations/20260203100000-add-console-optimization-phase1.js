/**
 * 运营后台优化 Phase 1 - 数据库变更
 * 
 * 业务场景：
 * - DB-1: customer_service_sessions 新增 first_response_at 字段（客服首次响应时间）
 * - DB-2: 创建 alert_silence_rules 表（告警静默规则）
 * - DB-3: 新增索引优化
 * 
 * 关联需求：
 * - 《运营后台优化 - 后端需求文档》§13.1 步骤1.1-1.2, §10.7
 * 
 * 创建时间：2026-02-03
 * @version 1.0.0
 */

'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ============================================================
      // DB-1: customer_service_sessions 新增 first_response_at 字段
      // 业务场景：记录客服首次响应时间，用于计算响应时长统计
      // ============================================================
      const cssColumns = await queryInterface.describeTable('customer_service_sessions')
      
      if (!cssColumns.first_response_at) {
        await queryInterface.addColumn(
          'customer_service_sessions',
          'first_response_at',
          {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '客服首次响应时间（用于计算响应时长）'
          },
          { transaction }
        )
        console.log('✅ DB-1: 添加 first_response_at 字段到 customer_service_sessions 表')
      } else {
        console.log('⏭️ DB-1: first_response_at 字段已存在，跳过')
      }

      // ============================================================
      // DB-2: 创建 alert_silence_rules 表
      // 业务场景：告警静默规则管理，用于抑制重复告警
      // ============================================================
      const tables = await queryInterface.showAllTables()
      
      if (!tables.includes('alert_silence_rules')) {
        await queryInterface.createTable(
          'alert_silence_rules',
          {
            alert_silence_rule_id: {
              type: Sequelize.BIGINT,
              primaryKey: true,
              autoIncrement: true,
              comment: '静默规则主键ID'
            },
            
            rule_name: {
              type: Sequelize.STRING(100),
              allowNull: false,
              comment: '规则名称（如：节假日静默、夜间静默）'
            },
            
            alert_type: {
              type: Sequelize.STRING(50),
              allowNull: false,
              comment: '告警类型（如：risk、lottery、system）'
            },
            
            alert_level: {
              type: Sequelize.ENUM('critical', 'warning', 'info', 'all'),
              defaultValue: 'all',
              comment: '静默的告警级别（critical/warning/info/all）'
            },
            
            condition_json: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '静默条件JSON（如：{ user_id: [1,2], keyword: "测试" }）'
            },
            
            start_time: {
              type: Sequelize.TIME,
              allowNull: true,
              comment: '每日静默开始时间（如：22:00:00）'
            },
            
            end_time: {
              type: Sequelize.TIME,
              allowNull: true,
              comment: '每日静默结束时间（如：08:00:00）'
            },
            
            effective_start_date: {
              type: Sequelize.DATEONLY,
              allowNull: true,
              comment: '规则生效开始日期'
            },
            
            effective_end_date: {
              type: Sequelize.DATEONLY,
              allowNull: true,
              comment: '规则生效结束日期'
            },
            
            is_active: {
              type: Sequelize.BOOLEAN,
              defaultValue: true,
              comment: '是否启用'
            },
            
            created_by: {
              type: Sequelize.INTEGER,
              allowNull: false,
              comment: '创建人用户ID'
            },
            
            updated_by: {
              type: Sequelize.INTEGER,
              allowNull: true,
              comment: '最后修改人用户ID'
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
            comment: '告警静默规则表（运营后台优化 DB-2）',
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci'
          }
        )
        console.log('✅ DB-2: 创建 alert_silence_rules 表')

        // 添加索引
        await queryInterface.addIndex(
          'alert_silence_rules',
          ['alert_type', 'is_active'],
          {
            name: 'idx_alert_silence_type_active',
            transaction
          }
        )
        console.log('✅ DB-2: 添加 idx_alert_silence_type_active 索引')
      } else {
        console.log('⏭️ DB-2: alert_silence_rules 表已存在，跳过')
      }

      // ============================================================
      // DB-3: 索引优化
      // 业务场景：优化常用查询的索引
      // ============================================================
      
      // 3.1 customer_service_sessions 索引优化
      try {
        const cssIndexes = await queryInterface.showIndex('customer_service_sessions')
        const existingIndexNames = cssIndexes.map(idx => idx.name)
        
        // 添加 status + created_at 联合索引（用于待办列表查询优化）
        if (!existingIndexNames.includes('idx_css_status_created_at')) {
          await queryInterface.addIndex(
            'customer_service_sessions',
            ['status', 'created_at'],
            {
              name: 'idx_css_status_created_at',
              transaction
            }
          )
          console.log('✅ DB-3.1: 添加 idx_css_status_created_at 索引')
        }

        // 添加 admin_id + status 联合索引（用于客服工作量查询）
        if (!existingIndexNames.includes('idx_css_admin_status')) {
          await queryInterface.addIndex(
            'customer_service_sessions',
            ['admin_id', 'status'],
            {
              name: 'idx_css_admin_status',
              transaction
            }
          )
          console.log('✅ DB-3.2: 添加 idx_css_admin_status 索引')
        }
      } catch (error) {
        console.log('⚠️ DB-3: customer_service_sessions 索引检查失败，跳过:', error.message)
      }

      // 3.2 consumption_records 索引优化
      try {
        const crIndexes = await queryInterface.showIndex('consumption_records')
        const crIndexNames = crIndexes.map(idx => idx.name)
        
        // 添加 status + created_at 联合索引（用于待审核列表分页查询）
        if (!crIndexNames.includes('idx_cr_status_created_at')) {
          await queryInterface.addIndex(
            'consumption_records',
            ['status', 'created_at'],
            {
              name: 'idx_cr_status_created_at',
              transaction
            }
          )
          console.log('✅ DB-3.3: 添加 idx_cr_status_created_at 索引')
        }
      } catch (error) {
        console.log('⚠️ DB-3: consumption_records 索引检查失败，跳过:', error.message)
      }

      // 3.3 risk_alerts 索引优化
      try {
        const raIndexes = await queryInterface.showIndex('risk_alerts')
        const raIndexNames = raIndexes.map(idx => idx.name)
        
        // 添加 level + status + created_at 联合索引（用于告警列表查询）
        if (!raIndexNames.includes('idx_ra_level_status_created')) {
          await queryInterface.addIndex(
            'risk_alerts',
            ['level', 'status', 'created_at'],
            {
              name: 'idx_ra_level_status_created',
              transaction
            }
          )
          console.log('✅ DB-3.4: 添加 idx_ra_level_status_created 索引')
        }
      } catch (error) {
        console.log('⚠️ DB-3: risk_alerts 索引检查失败，跳过:', error.message)
      }

      await transaction.commit()
      console.log('✅ 运营后台优化 Phase 1 数据库变更完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 运营后台优化 Phase 1 数据库变更失败:', error)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 回滚 DB-3: 删除索引
      try {
        await queryInterface.removeIndex('customer_service_sessions', 'idx_css_status_created_at', { transaction })
      } catch (e) { /* 索引可能不存在 */ }
      
      try {
        await queryInterface.removeIndex('customer_service_sessions', 'idx_css_admin_status', { transaction })
      } catch (e) { /* 索引可能不存在 */ }
      
      try {
        await queryInterface.removeIndex('consumption_records', 'idx_cr_status_created_at', { transaction })
      } catch (e) { /* 索引可能不存在 */ }
      
      try {
        await queryInterface.removeIndex('risk_alerts', 'idx_ra_level_status_created', { transaction })
      } catch (e) { /* 索引可能不存在 */ }

      // 回滚 DB-2: 删除 alert_silence_rules 表
      const tables = await queryInterface.showAllTables()
      if (tables.includes('alert_silence_rules')) {
        await queryInterface.dropTable('alert_silence_rules', { transaction })
        console.log('✅ 回滚: 删除 alert_silence_rules 表')
      }

      // 回滚 DB-1: 删除 first_response_at 字段
      const cssColumns = await queryInterface.describeTable('customer_service_sessions')
      if (cssColumns.first_response_at) {
        await queryInterface.removeColumn('customer_service_sessions', 'first_response_at', { transaction })
        console.log('✅ 回滚: 删除 first_response_at 字段')
      }

      await transaction.commit()
      console.log('✅ 运营后台优化 Phase 1 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 运营后台优化 Phase 1 回滚失败:', error)
      throw error
    }
  }
}
