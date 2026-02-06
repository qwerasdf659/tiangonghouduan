'use strict'

/**
 * 迁移：添加消费记录异常检测字段
 * 
 * 任务编号：DB-2 (P1 阶段)
 * 
 * 背景：
 * - 消费审核需要异常检测功能，标记可疑消费记录
 * - 需要 anomaly_flags JSON 字段存储异常类型数组
 * - 需要 anomaly_score 评分字段用于排序和筛选
 * 
 * 异常类型定义：
 * - large_amount: 大额消费（>¥500）
 * - high_frequency: 高频消费（24h内>5次）
 * - new_user_large: 新用户大额（注册<7天且>¥100）
 * - cross_store: 跨店消费（同日多店消费）
 * 
 * 依赖本迁移的后续任务：
 * - B-25: ConsumptionAnomalyService 消费异常检测服务
 * - B-26~B-30: 异常标记/汇总接口/风险评分
 * 
 * @version V4.8.0
 * @date 2026-01-31
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    
    try {
      console.log('📦 [DB-2] 开始添加消费记录异常检测字段...')
      
      // ========== 1. 添加 anomaly_flags 字段 ==========
      const [flagsColumn] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM consumption_records LIKE 'anomaly_flags'",
        { transaction }
      )
      
      if (flagsColumn.length === 0) {
        console.log('  - 添加 consumption_records.anomaly_flags 字段 (JSON)')
        await queryInterface.addColumn('consumption_records', 'anomaly_flags', {
          type: Sequelize.JSON,
          allowNull: true,
          defaultValue: null,
          comment: '异常标记JSON数组，如["large_amount","high_frequency"]'
        }, { transaction })
      } else {
        console.log('  - consumption_records.anomaly_flags 字段已存在，跳过')
      }
      
      // ========== 2. 添加 anomaly_score 字段 ==========
      const [scoreColumn] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM consumption_records LIKE 'anomaly_score'",
        { transaction }
      )
      
      if (scoreColumn.length === 0) {
        console.log('  - 添加 consumption_records.anomaly_score 字段 (TINYINT)')
        await queryInterface.addColumn('consumption_records', 'anomaly_score', {
          type: Sequelize.TINYINT.UNSIGNED,
          allowNull: false,
          defaultValue: 0,
          comment: '异常评分 0-100，0=正常，分数越高越可疑'
        }, { transaction })
      } else {
        console.log('  - consumption_records.anomaly_score 字段已存在，跳过')
      }
      
      // ========== 3. 添加异常评分索引（用于筛选和排序）==========
      const [existingIndexes] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM consumption_records WHERE Key_name = 'idx_anomaly_score'",
        { transaction }
      )
      
      if (existingIndexes.length === 0) {
        console.log('  - 创建索引 idx_anomaly_score')
        await queryInterface.addIndex('consumption_records', ['anomaly_score'], {
          name: 'idx_anomaly_score',
          transaction
        })
      } else {
        console.log('  - idx_anomaly_score 索引已存在，跳过')
      }
      
      // ========== 4. 添加复合索引（状态+异常评分，用于待审核异常筛选）==========
      const [statusAnomalyIndex] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM consumption_records WHERE Key_name = 'idx_status_anomaly'",
        { transaction }
      )
      
      if (statusAnomalyIndex.length === 0) {
        console.log('  - 创建复合索引 idx_status_anomaly (status, anomaly_score)')
        await queryInterface.addIndex('consumption_records', ['status', 'anomaly_score'], {
          name: 'idx_status_anomaly',
          transaction
        })
      } else {
        console.log('  - idx_status_anomaly 复合索引已存在，跳过')
      }
      
      await transaction.commit()
      console.log('✅ [DB-2] 消费记录异常检测字段添加完成')
      
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [DB-2] 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    
    try {
      console.log('📦 [DB-2] 回滚：移除消费记录异常检测字段...')
      
      // 1. 移除复合索引
      const [statusAnomalyIndex] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM consumption_records WHERE Key_name = 'idx_status_anomaly'",
        { transaction }
      )
      
      if (statusAnomalyIndex.length > 0) {
        console.log('  - 移除索引 idx_status_anomaly')
        await queryInterface.removeIndex('consumption_records', 'idx_status_anomaly', { transaction })
      }
      
      // 2. 移除异常评分索引
      const [anomalyScoreIndex] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM consumption_records WHERE Key_name = 'idx_anomaly_score'",
        { transaction }
      )
      
      if (anomalyScoreIndex.length > 0) {
        console.log('  - 移除索引 idx_anomaly_score')
        await queryInterface.removeIndex('consumption_records', 'idx_anomaly_score', { transaction })
      }
      
      // 3. 移除 anomaly_score 字段
      const [scoreColumn] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM consumption_records LIKE 'anomaly_score'",
        { transaction }
      )
      
      if (scoreColumn.length > 0) {
        console.log('  - 移除字段 anomaly_score')
        await queryInterface.removeColumn('consumption_records', 'anomaly_score', { transaction })
      }
      
      // 4. 移除 anomaly_flags 字段
      const [flagsColumn] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM consumption_records LIKE 'anomaly_flags'",
        { transaction }
      )
      
      if (flagsColumn.length > 0) {
        console.log('  - 移除字段 anomaly_flags')
        await queryInterface.removeColumn('consumption_records', 'anomaly_flags', { transaction })
      }
      
      await transaction.commit()
      console.log('✅ [DB-2] 回滚完成')
      
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [DB-2] 回滚失败:', error.message)
      throw error
    }
  }
}

