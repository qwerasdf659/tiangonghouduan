'use strict';

/**
 * P2 数据库任务完成迁移
 * 
 * 任务覆盖：
 * - DB-3: 创建 admin_report_templates 表（报表模板管理）
 * - DB-4: 扩展 admin_operation_logs 表字段（rollback_supported, rollback_status）
 * 
 * @see docs/后端数据库开发任务清单-2026年1月.md - P2 任务清单
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // ========================================
      // DB-3: 创建 admin_report_templates 表
      // ========================================
      console.log('[迁移] 检查 admin_report_templates 表是否存在...');
      
      const [reportTableExists] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.tables 
         WHERE table_schema = DATABASE() AND table_name = 'admin_report_templates'`,
        { transaction }
      );
      
      if (reportTableExists[0].count === 0) {
        console.log('[迁移] 创建 admin_report_templates 表...');
        
        await queryInterface.createTable('admin_report_templates', {
          // 主键：遵循 {table_name}_id 命名规范
          report_template_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: '报表模板主键ID'
          },
          
          // 基础信息
          template_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '模板名称'
          },
          template_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            unique: true,
            comment: '模板唯一编码（用于API调用）'
          },
          description: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '模板描述'
          },
          
          // 报表类型和数据源配置
          report_type: {
            type: Sequelize.ENUM('statistical', 'transactional', 'analytical', 'summary'),
            allowNull: false,
            defaultValue: 'statistical',
            comment: '报表类型：statistical-统计报表、transactional-交易报表、analytical-分析报表、summary-汇总报表'
          },
          data_source: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '数据源类型（如：lottery_draws、consumption_records、user_points）'
          },
          
          // 模板配置（JSON格式）
          column_config: {
            type: Sequelize.JSON,
            allowNull: false,
            comment: '列配置：[{field, label, width, sortable, filterable}]'
          },
          filter_config: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '筛选器配置：[{field, type, label, options}]'
          },
          aggregation_config: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '聚合配置：{groupBy, metrics: [{field, function}]}'
          },
          chart_config: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '图表配置：{type, xAxis, yAxis, series}'
          },
          
          // 导出和推送配置
          export_formats: {
            type: Sequelize.JSON,
            allowNull: true,
            defaultValue: ['xlsx', 'csv'],
            comment: '支持的导出格式'
          },
          schedule_config: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '定时推送配置：{cron, recipients, format}'
          },
          
          // 权限和状态
          required_role_level: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 100,
            comment: '查看此报表所需的最低角色等级'
          },
          is_active: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: '是否启用'
          },
          is_system: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '是否为系统内置模板（不可删除）'
          },
          
          // 元数据
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '创建者用户ID'
          },
          updated_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '更新者用户ID'
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
        }, { 
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '管理后台报表模板配置表 - 支持动态报表生成、预览和导出'
        });
        
        // 创建索引
        await queryInterface.addIndex('admin_report_templates', ['template_code'], {
          name: 'uk_template_code',
          unique: true,
          transaction
        });
        await queryInterface.addIndex('admin_report_templates', ['report_type', 'is_active'], {
          name: 'idx_type_active',
          transaction
        });
        await queryInterface.addIndex('admin_report_templates', ['data_source'], {
          name: 'idx_data_source',
          transaction
        });
        
        console.log('[迁移] admin_report_templates 表创建成功');
      } else {
        console.log('[迁移] admin_report_templates 表已存在，跳过创建');
      }
      
      // ========================================
      // DB-4: 扩展 admin_operation_logs 表字段
      // ========================================
      console.log('[迁移] 检查 admin_operation_logs 表字段...');
      
      // 检查 rollback_supported 字段是否存在
      const [rollbackSupportedExists] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.columns 
         WHERE table_schema = DATABASE() 
         AND table_name = 'admin_operation_logs' 
         AND column_name = 'rollback_supported'`,
        { transaction }
      );
      
      if (rollbackSupportedExists[0].count === 0) {
        console.log('[迁移] 添加 rollback_supported 字段到 admin_operation_logs...');
        
        await queryInterface.addColumn('admin_operation_logs', 'rollback_supported', {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否支持回滚操作',
          after: 'risk_level'
        }, { transaction });
        
        console.log('[迁移] rollback_supported 字段添加成功');
      } else {
        console.log('[迁移] rollback_supported 字段已存在，跳过');
      }
      
      // 检查 rollback_status 字段是否存在
      const [rollbackStatusExists] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.columns 
         WHERE table_schema = DATABASE() 
         AND table_name = 'admin_operation_logs' 
         AND column_name = 'rollback_status'`,
        { transaction }
      );
      
      if (rollbackStatusExists[0].count === 0) {
        console.log('[迁移] 添加 rollback_status 字段到 admin_operation_logs...');
        
        await queryInterface.addColumn('admin_operation_logs', 'rollback_status', {
          type: Sequelize.ENUM('none', 'pending', 'completed', 'failed', 'expired'),
          allowNull: false,
          defaultValue: 'none',
          comment: '回滚状态：none-不适用、pending-待回滚、completed-已回滚、failed-回滚失败、expired-已过期',
          after: 'rollback_supported'
        }, { transaction });
        
        console.log('[迁移] rollback_status 字段添加成功');
      } else {
        console.log('[迁移] rollback_status 字段已存在，跳过');
      }
      
      // 检查 rollback_deadline 字段是否存在
      const [rollbackDeadlineExists] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.columns 
         WHERE table_schema = DATABASE() 
         AND table_name = 'admin_operation_logs' 
         AND column_name = 'rollback_deadline'`,
        { transaction }
      );
      
      if (rollbackDeadlineExists[0].count === 0) {
        console.log('[迁移] 添加 rollback_deadline 字段到 admin_operation_logs...');
        
        await queryInterface.addColumn('admin_operation_logs', 'rollback_deadline', {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '回滚截止时间（超过此时间不可回滚）',
          after: 'rollback_status'
        }, { transaction });
        
        console.log('[迁移] rollback_deadline 字段添加成功');
      } else {
        console.log('[迁移] rollback_deadline 字段已存在，跳过');
      }
      
      // 检查 rollback_data 字段是否存在
      const [rollbackDataExists] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.columns 
         WHERE table_schema = DATABASE() 
         AND table_name = 'admin_operation_logs' 
         AND column_name = 'rollback_data'`,
        { transaction }
      );
      
      if (rollbackDataExists[0].count === 0) {
        console.log('[迁移] 添加 rollback_data 字段到 admin_operation_logs...');
        
        await queryInterface.addColumn('admin_operation_logs', 'rollback_data', {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '回滚所需的原始数据快照',
          after: 'rollback_deadline'
        }, { transaction });
        
        console.log('[迁移] rollback_data 字段添加成功');
      } else {
        console.log('[迁移] rollback_data 字段已存在，跳过');
      }
      
      // 创建索引以支持回滚查询
      const [rollbackIndexExists] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.statistics 
         WHERE table_schema = DATABASE() 
         AND table_name = 'admin_operation_logs' 
         AND index_name = 'idx_rollback_status'`,
        { transaction }
      );
      
      if (rollbackIndexExists[0].count === 0) {
        console.log('[迁移] 创建 rollback 相关索引...');
        
        await queryInterface.addIndex('admin_operation_logs', ['rollback_supported', 'rollback_status'], {
          name: 'idx_rollback_status',
          transaction
        });
        
        console.log('[迁移] idx_rollback_status 索引创建成功');
      } else {
        console.log('[迁移] idx_rollback_status 索引已存在，跳过');
      }
      
      await transaction.commit();
      console.log('[迁移] P2 数据库任务迁移完成');
      
    } catch (error) {
      await transaction.rollback();
      console.error('[迁移] 迁移失败:', error.message);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // 回滚 admin_operation_logs 字段扩展
      console.log('[回滚] 移除 admin_operation_logs 扩展字段...');
      
      // 移除索引
      try {
        await queryInterface.removeIndex('admin_operation_logs', 'idx_rollback_status', { transaction });
      } catch (e) {
        console.log('[回滚] idx_rollback_status 索引不存在，跳过');
      }
      
      // 移除字段
      const columnsToRemove = ['rollback_data', 'rollback_deadline', 'rollback_status', 'rollback_supported'];
      for (const column of columnsToRemove) {
        try {
          await queryInterface.removeColumn('admin_operation_logs', column, { transaction });
          console.log(`[回滚] 移除字段 ${column} 成功`);
        } catch (e) {
          console.log(`[回滚] 字段 ${column} 不存在，跳过`);
        }
      }
      
      // 回滚 admin_report_templates 表
      console.log('[回滚] 删除 admin_report_templates 表...');
      
      try {
        await queryInterface.dropTable('admin_report_templates', { transaction });
        console.log('[回滚] admin_report_templates 表删除成功');
      } catch (e) {
        console.log('[回滚] admin_report_templates 表不存在，跳过');
      }
      
      await transaction.commit();
      console.log('[回滚] P2 数据库任务回滚完成');
      
    } catch (error) {
      await transaction.rollback();
      console.error('[回滚] 回滚失败:', error.message);
      throw error;
    }
  }
};
