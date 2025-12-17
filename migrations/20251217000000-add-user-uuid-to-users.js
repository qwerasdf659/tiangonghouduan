/**
 * 数据库迁移：添加user_uuid字段到users表
 *
 * 业务目的：
 * - 支持QR码从user_id迁移到user_uuid（隐私保护）
 * - user_uuid使用UUIDv4格式，防止用户ID枚举攻击
 * - 保持向后兼容：user_id仍然是主键和内部业务标识
 *
 * 字段规格：
 * - user_uuid: VARCHAR(36)，存储UUIDv4格式（如：550e8400-e29b-41d4-a716-446655440000）
 * - UNIQUE索引：确保每个用户UUID唯一
 * - NOT NULL：所有用户必须有UUID
 * - 默认值：通过迁移脚本自动生成
 *
 * 迁移策略：
 * 1. 添加user_uuid字段（允许NULL）
 * 2. 为所有现有用户生成UUID
 * 3. 设置NOT NULL约束
 * 4. 创建UNIQUE索引
 *
 * 创建时间：2025年12月17日
 * 对应方案：docs/用户QR码从user_id迁移到user_uuid实施方案.md
 */

'use strict'

const { v4: uuidv4 } = require('uuid')

module.exports = {
  /**
   * 正向迁移：添加user_uuid字段
   * @param {QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('📝 开始添加user_uuid字段到users表...')

      // 步骤1：添加user_uuid字段（初始允许NULL）
      await queryInterface.addColumn(
        'users',
        'user_uuid',
        {
          type: Sequelize.UUID,
          allowNull: true, // 初始允许NULL，后续会改为NOT NULL
          comment: '用户UUID（用于外部标识和QR码，UUIDv4格式）'
        },
        { transaction }
      )

      console.log('✅ user_uuid字段已添加')

      // 步骤2：为所有现有用户生成UUID
      console.log('🔄 为现有用户生成UUID...')

      // 查询所有用户
      const users = await queryInterface.sequelize.query(
        'SELECT user_id FROM users WHERE user_uuid IS NULL',
        {
          type: Sequelize.QueryTypes.SELECT,
          transaction
        }
      )

      console.log(`📊 找到${users.length}个用户需要生成UUID`)

      // 批量更新UUID（使用循环而非单条SQL，确保每个UUID唯一）
      for (const user of users) {
        const uuid = uuidv4()
        await queryInterface.sequelize.query(
          'UPDATE users SET user_uuid = :uuid WHERE user_id = :user_id',
          {
            replacements: {
              uuid: uuid,
              user_id: user.user_id
            },
            transaction
          }
        )
      }

      console.log(`✅ 已为${users.length}个用户生成UUID`)

      // 步骤3：设置NOT NULL约束
      await queryInterface.changeColumn(
        'users',
        'user_uuid',
        {
          type: Sequelize.UUID,
          allowNull: false,
          comment: '用户UUID（用于外部标识和QR码，UUIDv4格式）'
        },
        { transaction }
      )

      console.log('✅ user_uuid字段已设置为NOT NULL')

      // 步骤4：创建UNIQUE索引
      await queryInterface.addIndex('users', ['user_uuid'], {
        unique: true,
        name: 'idx_users_user_uuid_unique',
        transaction
      })

      console.log('✅ user_uuid唯一索引已创建')

      // 步骤5：验证数据完整性
      const [result] = await queryInterface.sequelize.query(
        `SELECT 
          COUNT(*) as total_users,
          COUNT(DISTINCT user_uuid) as unique_uuids,
          COUNT(CASE WHEN user_uuid IS NULL THEN 1 END) as null_uuids
        FROM users`,
        { transaction }
      )

      console.log('📊 数据验证结果：')
      console.log(`   - 总用户数: ${result[0].total_users}`)
      console.log(`   - 唯一UUID数: ${result[0].unique_uuids}`)
      console.log(`   - 空UUID数: ${result[0].null_uuids}`)

      if (result[0].total_users !== result[0].unique_uuids) {
        throw new Error('UUID唯一性验证失败：存在重复UUID')
      }

      if (result[0].null_uuids > 0) {
        throw new Error('UUID完整性验证失败：存在空UUID')
      }

      await transaction.commit()
      console.log('✅ 迁移完成：user_uuid字段已成功添加')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：删除user_uuid字段
   * @param {QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚：删除user_uuid字段...')

      // 步骤1：删除UNIQUE索引
      await queryInterface.removeIndex('users', 'idx_users_user_uuid_unique', { transaction })
      console.log('✅ user_uuid唯一索引已删除')

      // 步骤2：删除user_uuid字段
      await queryInterface.removeColumn('users', 'user_uuid', { transaction })
      console.log('✅ user_uuid字段已删除')

      await transaction.commit()
      console.log('✅ 回滚完成：user_uuid字段已成功删除')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
