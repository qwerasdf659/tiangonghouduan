/**
 * 餐厅积分抽奖系统 V4.0 - 数据库迁移
 *
 * 迁移名称：标准化积分存储为正数（统一存储正数，用transaction_type区分）
 * 迁移类型：data-fix（数据修复）
 * 版本号：v4.2.0
 * 创建时间：2025-11-08 20:48 北京时间
 * 作者：AI Assistant (Claude 4 Sonnet)
 *
 * 变更说明：
 * 1. 将所有consume类型的负数points_amount转换为正数
 * 2. 统一积分存储规则：所有积分统一存储为正数
 * 3. 通过transaction_type字段区分earn（获得）和consume（消费）
 *
 * 业务背景：
 * - 之前consume类型的积分可能存储为负数
 * - 为了数据一致性和查询性能，统一为正数存储
 * - API层已通过ABS()函数处理，此迁移将数据层标准化
 *
 * 依赖关系：
 * - 依赖points_transactions表已存在
 * - 影响后续积分统计和查询逻辑
 *
 * 影响范围：
 * - 修改points_transactions表中consume类型的points_amount负数为正数
 * - 不影响earn类型的积分（已经是正数）
 * - 保持业务逻辑不变（通过transaction_type区分）
 */

'use strict'

module.exports = {
  /**
   * 执行迁移（up方向）：标准化积分为正数
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize')} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始标准化积分存储为正数...')
      console.log('='.repeat(60))

      /*
       * ========================================
       * 第1步：统计需要修复的记录
       * ========================================
       */
      console.log('\n📊 第1步：检查需要修复的数据...')

      const [negativeStats] = await queryInterface.sequelize.query(
        `SELECT 
          transaction_type,
          COUNT(*) as count,
          MIN(points_amount) as min_amount,
          MAX(points_amount) as max_amount
        FROM points_transactions
        WHERE is_deleted = 0 AND points_amount < 0
        GROUP BY transaction_type`,
        { transaction }
      )

      console.log('📋 负数积分统计：')
      if (negativeStats.length === 0) {
        console.log('   ✅ 未发现负数积分，无需修复')
      } else {
        negativeStats.forEach(row => {
          console.log(`   ${row.transaction_type}: ${row.count}条记录`)
          console.log(`      范围: ${parseFloat(row.min_amount).toFixed(2)} ~ ${parseFloat(row.max_amount).toFixed(2)}`)
        })
      }

      // 统计总数
      const [totalCount] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM points_transactions WHERE is_deleted = 0 AND points_amount < 0',
        { transaction }
      )

      const needFixCount = totalCount[0].count
      console.log(`\n📌 需要修复的总记录数: ${needFixCount}`)

      if (needFixCount === 0) {
        console.log('✅ 数据已标准化，无需修复')
        await transaction.commit()
        return
      }

      /*
       * ========================================
       * 第2步：修复负数积分为正数
       * ========================================
       */
      console.log('\n🔧 第2步：标准化负数积分为正数...')

      // 使用ABS()函数将所有负数转为正数
      await queryInterface.sequelize.query(
        `UPDATE points_transactions 
         SET points_amount = ABS(points_amount)
         WHERE is_deleted = 0 AND points_amount < 0`,
        { transaction }
      )

      console.log(`✅ 已修复 ${needFixCount} 条记录`)

      /*
       * ========================================
       * 第3步：验证修复结果
       * ========================================
       */
      console.log('\n🔍 第3步：验证修复结果...')

      const [verifyCount] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM points_transactions WHERE is_deleted = 0 AND points_amount < 0',
        { transaction }
      )

      if (verifyCount[0].count > 0) {
        throw new Error(`❌ 验证失败：仍有 ${verifyCount[0].count} 条负数记录`)
      }

      // 验证数据完整性：检查修复后的积分统计
      const [afterStats] = await queryInterface.sequelize.query(
        `SELECT 
          transaction_type,
          COUNT(*) as count,
          SUM(points_amount) as total_amount,
          AVG(points_amount) as avg_amount
        FROM points_transactions
        WHERE is_deleted = 0
        GROUP BY transaction_type`,
        { transaction }
      )

      console.log('📊 修复后的积分统计：')
      afterStats.forEach(row => {
        console.log(`   ${row.transaction_type}:`)
        console.log(`      记录数: ${row.count}`)
        console.log(`      总积分: ${parseFloat(row.total_amount).toFixed(2)}`)
        console.log(`      平均值: ${parseFloat(row.avg_amount).toFixed(2)}`)
      })

      console.log('\n✅ 验证通过：所有积分已标准化为正数')

      /*
       * ========================================
       * 第4步：提交事务
       * ========================================
       */
      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ 积分存储标准化完成！')
      console.log('📊 修复总结：')
      console.log(`   - 修复记录数: ${needFixCount}`)
      console.log('   - 所有积分统一为正数存储')
      console.log('   - 通过transaction_type区分earn/consume')
    } catch (error) {
      // 出错回滚
      await transaction.rollback()
      console.error('\n❌ 标准化失败，已回滚所有操作:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移（down方向）：恢复consume类型为负数存储
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize')} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async down (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚积分标准化（恢复consume类型为负数）...')
      console.log('='.repeat(60))

      /*
       * ========================================
       * 统计需要回滚的记录
       * ========================================
       */
      const [consumeCount] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM points_transactions WHERE is_deleted = 0 AND transaction_type = \'consume\'',
        { transaction }
      )

      console.log(`\n📊 将回滚 ${consumeCount[0].count} 条consume类型记录为负数`)

      if (consumeCount[0].count > 0) {
        console.warn('⚠️ 警告：此操作将consume类型的积分恢复为负数存储')

        // 将consume类型的正数积分转为负数
        await queryInterface.sequelize.query(
          `UPDATE points_transactions 
           SET points_amount = -ABS(points_amount)
           WHERE is_deleted = 0 
           AND transaction_type = 'consume' 
           AND points_amount > 0`,
          { transaction }
        )

        console.log(`✅ 已回滚 ${consumeCount[0].count} 条记录为负数`)
      }

      /*
       * ========================================
       * 验证回滚结果
       * ========================================
       */
      console.log('\n🔍 验证回滚结果...')

      const [verifyStats] = await queryInterface.sequelize.query(
        `SELECT 
          transaction_type,
          COUNT(*) as count,
          MIN(points_amount) as min_amount,
          MAX(points_amount) as max_amount
        FROM points_transactions
        WHERE is_deleted = 0
        GROUP BY transaction_type`,
        { transaction }
      )

      console.log('📊 回滚后的积分统计：')
      verifyStats.forEach(row => {
        console.log(`   ${row.transaction_type}:`)
        console.log(`      记录数: ${row.count}`)
        console.log(`      范围: ${parseFloat(row.min_amount).toFixed(2)} ~ ${parseFloat(row.max_amount).toFixed(2)}`)
      })

      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ 积分标准化回滚完成！')
      console.log('⚠️ 注意：consume类型积分已恢复为负数存储')
    } catch (error) {
      // 出错回滚
      await transaction.rollback()
      console.error('\n❌ 回滚失败:', error.message)
      throw error
    }
  }
}
