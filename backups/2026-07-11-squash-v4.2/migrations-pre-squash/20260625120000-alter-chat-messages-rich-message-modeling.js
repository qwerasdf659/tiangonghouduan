'use strict'

/**
 * 客服聊天富消息建模重构（B/富消息定稿，2026-06-25，见架构决策文档 客·二/复·二更正1）
 *
 * 背景：位置消息暴露"聊天表如何承载持续增长的富媒体类型"的建模问题。
 *   业界统一范式 = 「类型判别字段 + 结构化 JSON 负载」。本项目落地：
 *   - message_type ENUM → VARCHAR(32)（开放增长集合，今后加类型=字典插一行，零 DDL）
 *   - 富内容（file_name/file_size/URL/坐标）统一进 metadata(JSON)，删除 file_name/file_size 专属列
 *   - 系统消息语义归一到 message_source='system'（message_type 只表内容类型 text/image/file/location）
 *
 * 本迁移变更（显式定义、含回滚）：
 *  up:
 *   1) 回填：file 类型 → metadata.file_name/file_size/file_url（URL 取自 content），content 改真实文件名
 *   2) 回填：image 类型 → metadata.image_url（URL 取自 content），content 改占位 '[图片]'
 *   3) 存量 message_type='system' → message_type='text' + message_source='system'
 *   4) message_type ENUM → VARCHAR(32) NOT NULL DEFAULT 'text'（合法值由 system_dictionaries 字典约束）
 *   5) 删除 file_name / file_size 列
 *   6) 字典 upsert：message_type 补 file/location、停用 system（幂等）
 *  down: 逆向（VARCHAR→ENUM、重建 file_name/file_size 列并从 metadata 回灌、system 字典恢复启用、占位符还原 URL）
 *
 * 真实库核对（2026-06-25）：chat_messages 8 行（text3/file3/image2），metadata(json) 闲置，
 *   file_name varchar(255)/file_size bigint 存在；message_type ENUM('text','image','system','file')。
 */

module.exports = {
  // PLACEHOLDER_UP
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction()
    const q = queryInterface.sequelize
    try {
      // 1) 回填 file 类型：content(URL) + file_name/file_size 列 → metadata；content 改真实文件名
      await q.query(
        "UPDATE `chat_messages` SET `metadata` = JSON_OBJECT(" +
          "'file_url', `content`, 'file_name', `file_name`, 'file_size', `file_size`), " +
          "`content` = COALESCE(NULLIF(`file_name`, ''), '[文件]') " +
          "WHERE `message_type` = 'file'",
        { transaction: t }
      )
      // 2) 回填 image 类型：content(URL) → metadata.image_url；content 改占位 '[图片]'
      await q.query(
        "UPDATE `chat_messages` SET `metadata` = JSON_OBJECT('image_url', `content`), " +
          "`content` = '[图片]' WHERE `message_type` = 'image'",
        { transaction: t }
      )
      // 3) 存量系统消息：message_type='system' → 'text' + message_source='system'
      await q.query(
        "UPDATE `chat_messages` SET `message_type` = 'text', `message_source` = 'system' " +
          "WHERE `message_type` = 'system'",
        { transaction: t }
      )
      // 4) message_type ENUM → VARCHAR(32)（合法值由字典约束，今后加类型零 DDL）
      await q.query(
        "ALTER TABLE `chat_messages` MODIFY COLUMN `message_type` VARCHAR(32) NOT NULL DEFAULT 'text' " +
          "COMMENT '消息内容类型（合法值来自 system_dictionaries.dict_type=message_type：text/image/file/location）'",
        { transaction: t }
      )
      // 5) 删除 file_name / file_size 列（迁入 metadata 后不再需要专属列）
      await queryInterface.removeColumn('chat_messages', 'file_size', { transaction: t })
      await queryInterface.removeColumn('chat_messages', 'file_name', { transaction: t })
      // 6) 字典 upsert：补 file/location、停用 system（幂等）
      await q.query(
        "INSERT INTO `system_dictionaries` (dict_type, dict_code, dict_name, sort_order, is_enabled, version, created_at, updated_at) VALUES " +
          "('message_type','file','文件',4,1,1,NOW(),NOW()), " +
          "('message_type','location','位置',5,1,1,NOW(),NOW()) " +
          'ON DUPLICATE KEY UPDATE dict_name=VALUES(dict_name), sort_order=VALUES(sort_order), is_enabled=1, version=version+1, updated_at=NOW()',
        { transaction: t }
      )
      await q.query(
        "UPDATE `system_dictionaries` SET is_enabled=0, version=version+1, updated_at=NOW() " +
          "WHERE dict_type='message_type' AND dict_code='system'",
        { transaction: t }
      )

      await t.commit()
      // eslint-disable-next-line no-console
      console.log('[migrate] chat_messages 富消息重构完成（metadata 化 + 删 file_name/file_size + 字典 upsert）')
    } catch (e) {
      await t.rollback()
      throw e
    }
  },
  // PLACEHOLDER_DOWN
  async down(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction()
    const q = queryInterface.sequelize
    try {
      // 6') 字典回滚：删 file/location，恢复 system 启用
      await q.query(
        "DELETE FROM `system_dictionaries` WHERE dict_type='message_type' AND dict_code IN ('file','location')",
        { transaction: t }
      )
      await q.query(
        "UPDATE `system_dictionaries` SET is_enabled=1, version=version+1, updated_at=NOW() " +
          "WHERE dict_type='message_type' AND dict_code='system'",
        { transaction: t }
      )
      // 5') 重建 file_name / file_size 列
      await queryInterface.addColumn(
        'chat_messages',
        'file_name',
        { type: Sequelize.STRING(255), allowNull: true, comment: '文件原始名（message_type=file 时使用）' },
        { transaction: t }
      )
      await queryInterface.addColumn(
        'chat_messages',
        'file_size',
        { type: Sequelize.BIGINT, allowNull: true, comment: '文件字节数（message_type=file 时使用）' },
        { transaction: t }
      )
      // 4') 从 metadata 回灌列与 content（file/image），再把系统消息 message_type 还原为 'system'
      await q.query(
        "UPDATE `chat_messages` SET " +
          "`file_name` = JSON_UNQUOTE(JSON_EXTRACT(`metadata`, '$.file_name')), " +
          "`file_size` = JSON_EXTRACT(`metadata`, '$.file_size'), " +
          "`content` = JSON_UNQUOTE(JSON_EXTRACT(`metadata`, '$.file_url')) " +
          "WHERE `message_type` = 'file'",
        { transaction: t }
      )
      await q.query(
        "UPDATE `chat_messages` SET `content` = JSON_UNQUOTE(JSON_EXTRACT(`metadata`, '$.image_url')) " +
          "WHERE `message_type` = 'image'",
        { transaction: t }
      )
      await q.query(
        "UPDATE `chat_messages` SET `message_type` = 'system' WHERE `message_source` = 'system'",
        { transaction: t }
      )
      // 4'') VARCHAR(32) → ENUM 还原
      await q.query(
        "ALTER TABLE `chat_messages` MODIFY COLUMN `message_type` ENUM('text','image','system','file') NOT NULL DEFAULT 'text' COMMENT '消息类型：text-文字 image-图片 system-系统 file-文件'",
        { transaction: t }
      )
      await t.commit()
    } catch (e) {
      await t.rollback()
      throw e
    }
  }
}
