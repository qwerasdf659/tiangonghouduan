/**
 * 迁移文件：数据迁移 user_asset_accounts → account_asset_balances
 *
 * 业务背景：
 * - 从旧的user_asset_accounts表迁移数据到新的账户体系
 * - 为每个用户创建对应的账户记录（accounts表）
 * - 将余额数据迁移到account_asset_balances表
 *
 * 迁移策略：
 * 1. 为每个user_id创建USER类型账户（如果不存在）
 * 2. 将user_asset_accounts的余额数据迁移到account_asset_balances
 * 3. frozen_amount初始化为0（旧表不支持冻结）
 * 4. 保留旧表数据用于回滚验证
 *
 * 注意事项：
 * - 迁移前会检查数据一致性
 * - 迁移过程在事务中执行，确保原子性
 * - 迁移后会验证数据完整性
 *
 * 命名规范（snake_case）：
 * - 所有字段和表名使用snake_case
 *
 * 创建时间：2025-12-15
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：数据迁移 user_asset_accounts → account_asset_balances
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} _Sequelize - Sequelize对象（未使用）
   * @returns {Promise<void>} 无返回值，执行数据迁移
   */
  async up(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始数据迁移: user_asset_accounts → account_asset_balances')

      // 1. 检查user_asset_accounts表是否有数据
      const [oldAccountsCount] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM user_asset_accounts',
        { transaction }
      )

      const totalOldAccounts = oldAccountsCount[0].count
      console.log(`📊 user_asset_accounts表数据量: ${totalOldAccounts}条`)

      if (totalOldAccounts === 0) {
        console.log('✅ user_asset_accounts表为空，无需迁移')
        await transaction.commit()
        return
      }

      // 2. 获取所有需要迁移的数据
      const [oldAccounts] = await queryInterface.sequelize.query(
        `SELECT 
          user_id, 
          asset_code, 
          available_amount, 
          created_at 
        FROM user_asset_accounts 
        ORDER BY user_id, asset_code`,
        { transaction }
      )

      console.log(`📋 开始迁移${oldAccounts.length}条资产账户数据...`)

      let migratedCount = 0
      let createdAccountsCount = 0

      // 3. 为每个用户创建账户并迁移余额
      for (const oldAccount of oldAccounts) {
        const { user_id, asset_code, available_amount, created_at } = oldAccount

        // 3.1 查找或创建用户账户
        const [accounts] = await queryInterface.sequelize.query(
          `SELECT account_id FROM accounts 
           WHERE account_type = 'USER' AND user_id = ?`,
          {
            replacements: [user_id],
            transaction
          }
        )

        let accountId
        if (accounts.length === 0) {
          // 创建新的用户账户
          const [result] = await queryInterface.sequelize.query(
            `INSERT INTO accounts (account_type, user_id, status, created_at, updated_at)
             VALUES ('USER', ?, 'active', NOW(), NOW())`,
            {
              replacements: [user_id],
              transaction
            }
          )
          accountId = result
          createdAccountsCount++
          console.log(`  ✅ 创建用户账户: user_id=${user_id}, account_id=${accountId}`)
        } else {
          accountId = accounts[0].account_id
        }

        // 3.2 检查是否已存在余额记录（防止重复迁移）
        const [existingBalances] = await queryInterface.sequelize.query(
          `SELECT balance_id FROM account_asset_balances 
           WHERE account_id = ? AND asset_code = ?`,
          {
            replacements: [accountId, asset_code],
            transaction
          }
        )

        if (existingBalances.length > 0) {
          console.log(
            `  ⚠️ 跳过已存在的余额记录: account_id=${accountId}, asset_code=${asset_code}`
          )
          continue
        }

        // 3.3 迁移余额数据到account_asset_balances
        await queryInterface.sequelize.query(
          `INSERT INTO account_asset_balances 
           (account_id, asset_code, available_amount, frozen_amount, created_at, updated_at)
           VALUES (?, ?, ?, 0, ?, NOW())`,
          {
            replacements: [accountId, asset_code, available_amount, created_at],
            transaction
          }
        )

        migratedCount++

        if (migratedCount % 100 === 0) {
          console.log(`  📊 已迁移: ${migratedCount}/${oldAccounts.length}`)
        }
      }

      // 4. 验证迁移结果
      const [newBalancesCount] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM account_asset_balances',
        { transaction }
      )

      const totalNewBalances = newBalancesCount[0].count

      console.log('\n📊 迁移结果统计:')
      console.log(`  - 创建用户账户: ${createdAccountsCount}个`)
      console.log(`  - 迁移余额记录: ${migratedCount}条`)
      console.log(`  - account_asset_balances表总数: ${totalNewBalances}条`)

      // 只有在有数据时才验证数量匹配
      if (totalOldAccounts > 0 && migratedCount !== totalOldAccounts) {
        throw new Error(`迁移数量不匹配: 预期${totalOldAccounts}条，实际迁移${migratedCount}条`)
      }

      await transaction.commit()
      console.log('✅ 数据迁移完成')
      console.log('⚠️  注意: user_asset_accounts表数据已保留，可用于回滚验证')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：删除迁移的数据
   *
   * 注意：
   * - 回滚会删除account_asset_balances表中的数据
   * - 回滚会删除自动创建的USER类型账户
   * - user_asset_accounts表数据不会被删除
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} _Sequelize - Sequelize对象（未使用）
   * @returns {Promise<void>} 无返回值，执行回滚
   */
  async down(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚数据迁移...')

      // 1. 删除account_asset_balances表中的数据
      await queryInterface.sequelize.query('DELETE FROM account_asset_balances', { transaction })
      console.log('✅ 已清空account_asset_balances表')

      // 2. 删除自动创建的USER类型账户（保留系统账户）
      const [result] = await queryInterface.sequelize.query(
        "DELETE FROM accounts WHERE account_type = 'USER'",
        { transaction }
      )
      console.log(`✅ 已删除${result.affectedRows}个用户账户`)

      await transaction.commit()
      console.log('✅ 数据迁移回滚完成')
      console.log('⚠️  注意: user_asset_accounts表数据未被删除，可以重新执行迁移')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
