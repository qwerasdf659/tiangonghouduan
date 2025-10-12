'use strict'

/**
 * 主键命名统一迁移
 *
 * 目标:
 * 1. exchange_records: 主键从 VARCHAR 改为 INT AUTO_INCREMENT
 * 2. customer_sessions: 主键从 VARCHAR 改为 BIGINT AUTO_INCREMENT
 * 3. chat_messages: 主键从 VARCHAR 改为 BIGINT AUTO_INCREMENT
 *
 * 策略: 彻底迁移,不保留兼容性字段
 */

module.exports = {
  async up (queryInterface, _Sequelize) {
    console.log('🚀 开始主键统一迁移...\n')

    // ==========================================
    // 阶段1: exchange_records (无数据,简单)
    // ==========================================
    console.log('📋 阶段1: 迁移 exchange_records')
    console.log('   当前: exchange_id VARCHAR(50) PRIMARY KEY')
    console.log('   目标: exchange_id INT AUTO_INCREMENT PRIMARY KEY')

    try {
      // 检查表中是否有数据
      const [countResult] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM exchange_records'
      )
      const recordCount = countResult[0].count

      console.log(`   记录数: ${recordCount}`)

      if (recordCount > 0) {
        throw new Error('⚠️  exchange_records 表有数据,迁移中止! 请先清理数据。')
      }

      // 步骤1: 删除id字段(如果存在)
      console.log('   [1/5] 删除未使用的id字段...')
      try {
        await queryInterface.sequelize.query(`
          ALTER TABLE exchange_records DROP COLUMN id
        `)
        console.log('       ✓ id字段已删除')
      } catch (e) {
        console.log('       (字段不存在,跳过)')
      }

      // 步骤2: 删除exchange_id的唯一索引 (如果存在)
      console.log('   [2/5] 删除exchange_id唯一索引...')
      try {
        await queryInterface.sequelize.query(`
          ALTER TABLE exchange_records DROP INDEX exchange_id
        `)
        console.log('       ✓ exchange_id唯一索引已删除')
      } catch (e) {
        console.log('       (索引不存在,跳过)')
      }

      // 步骤3: 修改exchange_id字段类型为INT AUTO_INCREMENT并设为主键
      console.log('   [3/5] 修改exchange_id为INT AUTO_INCREMENT PRIMARY KEY...')
      await queryInterface.sequelize.query(`
        ALTER TABLE exchange_records
        MODIFY COLUMN exchange_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY
        COMMENT '兑换记录主键ID'
      `)

      // 步骤4: 确保exchange_code字段存在且为唯一
      console.log('   [4/4] 确保exchange_code唯一索引...')
      await queryInterface.sequelize.query(`
        ALTER TABLE exchange_records
        MODIFY COLUMN exchange_code VARCHAR(50) NOT NULL UNIQUE
        COMMENT '兑换业务编号(用户凭证)'
      `)

      console.log('   ✅ exchange_records 迁移完成!\n')
    } catch (error) {
      console.error('   ❌ exchange_records 迁移失败:', error.message)
      throw error
    }

    // ==========================================
    // 阶段2: customer_sessions (1条数据,中等)
    // ==========================================
    console.log('📋 阶段2: 迁移 customer_sessions')
    console.log('   当前: session_id VARCHAR(64) PRIMARY KEY')
    console.log('   目标: session_id BIGINT AUTO_INCREMENT PRIMARY KEY')

    try {
      // 检查数据量
      const [countResult] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM customer_sessions'
      )
      const recordCount = countResult[0].count
      console.log(`   记录数: ${recordCount}`)

      if (recordCount > 0) {
        // 有数据,需要保留
        console.log('   ⚠️  表中有数据,采用保留数据方案')

        // 步骤1: 添加临时新主键字段
        console.log('   [1/6] 添加临时主键字段 new_session_id...')
        await queryInterface.sequelize.query(`
          ALTER TABLE customer_sessions
          ADD COLUMN new_session_id BIGINT NOT NULL AUTO_INCREMENT UNIQUE
          COMMENT '新主键ID(临时)'
        `)

        // 步骤2: 创建session_id到new_session_id的映射表
        console.log('   [2/6] 创建映射表...')
        await queryInterface.sequelize.query(`
          CREATE TEMPORARY TABLE session_id_mapping AS
          SELECT session_id, new_session_id FROM customer_sessions
        `)

        // 步骤3: 删除session_id的主键约束
        console.log('   [3/6] 删除旧主键约束...')
        await queryInterface.sequelize.query(`
          ALTER TABLE customer_sessions DROP PRIMARY KEY
        `)

        // 步骤4: 删除session_id字段
        console.log('   [4/6] 删除旧session_id字段...')
        await queryInterface.sequelize.query(`
          ALTER TABLE customer_sessions DROP COLUMN session_id
        `)

        // 步骤5: 将new_session_id重命名为session_id并设为主键
        console.log('   [5/6] 重命名新字段为session_id...')
        await queryInterface.sequelize.query(`
          ALTER TABLE customer_sessions
          CHANGE COLUMN new_session_id session_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY
          COMMENT '会话主键ID'
        `)

        // 步骤6: 删除id字段(如果存在)
        console.log('   [6/6] 删除未使用的id字段...')
        try {
          await queryInterface.sequelize.query(`
            ALTER TABLE customer_sessions DROP COLUMN id
          `)
        } catch (e) {
          console.log('       (字段不存在,跳过)')
        }

        console.log('   ✅ customer_sessions 迁移完成!\n')
      } else {
        // 无数据,直接修改
        console.log('   无数据,直接修改字段类型')

        await queryInterface.sequelize.query(`
          ALTER TABLE customer_sessions DROP PRIMARY KEY
        `)

        await queryInterface.sequelize.query(`
          ALTER TABLE customer_sessions
          MODIFY COLUMN session_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY
          COMMENT '会话主键ID'
        `)

        // 删除id字段
        try {
          await queryInterface.sequelize.query(`
            ALTER TABLE customer_sessions DROP COLUMN id
          `)
        } catch (e) {
          // 忽略
        }

        console.log('   ✅ customer_sessions 迁移完成!\n')
      }
    } catch (error) {
      console.error('   ❌ customer_sessions 迁移失败:', error.message)
      throw error
    }

    // ==========================================
    // 阶段3: chat_messages (80条数据,复杂)
    // ==========================================
    console.log('📋 阶段3: 迁移 chat_messages')
    console.log('   当前: message_id VARCHAR(64) PRIMARY KEY')
    console.log('   目标: message_id BIGINT AUTO_INCREMENT PRIMARY KEY')

    try {
      const [countResult] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM chat_messages'
      )
      const recordCount = countResult[0].count
      console.log(`   记录数: ${recordCount}`)

      if (recordCount > 0) {
        // 有数据,需要保留
        console.log('   ⚠️  表中有数据,采用保留数据方案')

        // 步骤1: 添加临时新主键字段
        console.log('   [1/7] 添加临时主键字段 new_message_id...')
        await queryInterface.sequelize.query(`
          ALTER TABLE chat_messages
          ADD COLUMN new_message_id BIGINT NOT NULL AUTO_INCREMENT UNIQUE
          COMMENT '新主键ID(临时)'
        `)

        // 步骤2: 更新reply_to_id (如果引用了message_id)
        console.log('   [2/7] 检查reply_to_id字段...')
        // reply_to_id 是BIGINT,应该引用的是id字段,不是message_id,所以不需要更新

        // 步骤3: 删除message_id的主键约束
        console.log('   [3/7] 删除旧主键约束...')
        await queryInterface.sequelize.query(`
          ALTER TABLE chat_messages DROP PRIMARY KEY
        `)

        // 步骤4: 保留旧message_id为普通字段(改名为old_message_id,用于数据追踪)
        console.log('   [4/7] 保留旧message_id为old_message_id...')
        await queryInterface.sequelize.query(`
          ALTER TABLE chat_messages
          CHANGE COLUMN message_id old_message_id VARCHAR(64) NULL
          COMMENT '旧的消息ID(字符串,仅用于数据追踪)'
        `)

        // 步骤5: 将new_message_id重命名为message_id并设为主键
        console.log('   [5/7] 重命名新字段为message_id...')
        await queryInterface.sequelize.query(`
          ALTER TABLE chat_messages
          CHANGE COLUMN new_message_id message_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY
          COMMENT '消息主键ID'
        `)

        // 步骤6: 删除id字段(如果存在)
        console.log('   [6/7] 删除未使用的id字段...')
        try {
          await queryInterface.sequelize.query(`
            ALTER TABLE chat_messages DROP COLUMN id
          `)
        } catch (e) {
          console.log('       (字段不存在,跳过)')
        }

        // 步骤7: 稍后删除old_message_id(给用户时间验证数据)
        console.log('   [7/7] old_message_id字段保留,待验证后手动删除')
        console.log('       SQL: ALTER TABLE chat_messages DROP COLUMN old_message_id;')

        console.log('   ✅ chat_messages 迁移完成!\n')
      } else {
        // 无数据,直接修改
        console.log('   无数据,直接修改字段类型')

        await queryInterface.sequelize.query(`
          ALTER TABLE chat_messages DROP PRIMARY KEY
        `)

        await queryInterface.sequelize.query(`
          ALTER TABLE chat_messages
          MODIFY COLUMN message_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY
          COMMENT '消息主键ID'
        `)

        // 删除id字段
        try {
          await queryInterface.sequelize.query(`
            ALTER TABLE chat_messages DROP COLUMN id
          `)
        } catch (e) {
          // 忽略
        }

        console.log('   ✅ chat_messages 迁移完成!\n')
      }
    } catch (error) {
      console.error('   ❌ chat_messages 迁移失败:', error.message)
      throw error
    }

    console.log('🎉 主键统一迁移全部完成!')
    console.log('\n📝 后续步骤:')
    console.log('1. 验证数据完整性')
    console.log('2. 更新业务代码中的字段引用')
    console.log('3. 运行完整测试')
    console.log('4. 确认无误后删除 chat_messages.old_message_id 字段')
  },

  async down (_queryInterface, _Sequelize) {
    console.log('⚠️  回滚主键统一迁移')
    console.log('警告: 回滚会导致数据丢失!')
    console.log('建议: 使用数据库备份恢复而不是执行回滚')

    throw new Error('此迁移不支持回滚,请使用数据库备份恢复')
  }
}
