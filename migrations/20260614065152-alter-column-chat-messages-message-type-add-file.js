'use strict'

/**
 * 聊天消息支持文件类型：message_type 增加 'file' + 新增 file_name / file_size 列
 *
 * 创建时间: 2026-06-14（北京时间）
 * 创建原因（docs/后端对接需求-简版客服座席回复端待确认事项.md 第十一节 问题D 已拍板：采用大厂客服方案）:
 * - 微信小程序在线客服需要发送文件（PDF/Word/压缩包等），当前后端仅支持图片。
 * - 实测真实库 chat_messages.message_type = ENUM('text','image','system')，无 'file'；
 *   且无承载文件元信息的列。要支持文件消息必须扩展数据库（ENUM + 元信息列）。
 *
 * 本迁移变更（显式定义、含回滚）:
 * 1. message_type ENUM 增加 'file' → ENUM('text','image','system','file')。
 * 2. 新增 file_name  VARCHAR(255) NULL：文件原始名（前端展示「报告.pdf」）。
 * 3. 新增 file_size  BIGINT       NULL：文件字节数（前端展示「123 KB」）。
 *    文件下载 URL 复用现有 content（TEXT，存文件 URL，与 image 消息一致）；
 *    文件 MIME/扩展名可由 file_name 后缀派生，不单独建列（KISS，避免冗余）。
 *
 * 回滚(down): 删除 file_size / file_name 两列，并将 message_type ENUM 收回为 ('text','image','system')。
 *   ⚠️ 回滚前如已有 message_type='file' 的数据需先行处理（down 中先将 'file' 行内容置为 image 兜底，避免 ENUM 收窄报错）。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction()
    try {
      // 1. 扩展 message_type ENUM，增加 'file'
      await queryInterface.sequelize.query(
        "ALTER TABLE `chat_messages` MODIFY COLUMN `message_type` " +
          "ENUM('text','image','system','file') NOT NULL DEFAULT 'text' COMMENT '消息类型：text-文字 image-图片 system-系统 file-文件'",
        { transaction: t }
      )

      // 2. 新增 file_name 列（文件原始名，用于展示）
      await queryInterface.addColumn(
        'chat_messages',
        'file_name',
        {
          type: Sequelize.STRING(255),
          allowNull: true,
          comment: '文件原始名（message_type=file 时使用，如 报告.pdf；其它类型为 NULL）'
        },
        { transaction: t }
      )

      // 3. 新增 file_size 列（文件字节数，用于展示大小）
      await queryInterface.addColumn(
        'chat_messages',
        'file_size',
        {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '文件字节数（message_type=file 时使用，用于前端展示文件大小；其它类型为 NULL）'
        },
        { transaction: t }
      )

      await t.commit()
      // eslint-disable-next-line no-console
      console.log('[migrate] chat_messages 文件消息支持已添加（message_type+file / file_name / file_size）')
    } catch (e) {
      await t.rollback()
      throw e
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction()
    try {
      // 回滚前兜底：将已存在的 file 类型消息降级为 image，避免 ENUM 收窄失败
      await queryInterface.sequelize.query(
        "UPDATE `chat_messages` SET `message_type`='image' WHERE `message_type`='file'",
        { transaction: t }
      )
      await queryInterface.removeColumn('chat_messages', 'file_size', { transaction: t })
      await queryInterface.removeColumn('chat_messages', 'file_name', { transaction: t })
      await queryInterface.sequelize.query(
        "ALTER TABLE `chat_messages` MODIFY COLUMN `message_type` " +
          "ENUM('text','image','system') NOT NULL DEFAULT 'text' COMMENT '消息类型'",
        { transaction: t }
      )
      await t.commit()
    } catch (e) {
      await t.rollback()
      throw e
    }
  }
}
