'use strict'

/**
 * 枚举收窄: authentication_sessions.login_platform 移除 unknown（技术债务方案 拍板 18 前半，2026-07-11）
 *
 * 背景:
 * - 直连库核对（2026-07-11）：login_platform='unknown' 0 条；
 * - 平台识别链路 utils/platformDetector.detectLoginPlatform() 四级识别后兜底返回 'web'，
 *   代码路径不可能产出 'unknown'，该枚举值是识别器上线前的历史设计；
 * - 同 commit 删除 SessionManagementService / AuthenticationSession 的 'unknown' 默认值兜底，
 *   login_platform 由调用方显式传入（登录路由均已传入 detectLoginPlatform 结果）。
 *
 * 注：device_id NOT NULL 收紧（拍板 18 后半）滞后到正式上线擦除（data_pre_launch_wipe）后执行，
 * 前置条件为小程序确认全请求携带 X-Device-Id，本迁移不涉及。
 *
 * 变更内容:
 * 1. login_platform 枚举由 (web,wechat_mp,douyin_mp,alipay_mp,app,unknown) 收窄为
 *    (web,wechat_mp,douyin_mp,alipay_mp,app)，默认值移除（调用方必传）
 *
 * 回滚: 恢复含 unknown 的枚举与默认值。
 */

module.exports = {
  async up(queryInterface) {
    // 前置校验：确认无 unknown 存量
    const [rows] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) AS unknown_count FROM authentication_sessions WHERE login_platform = 'unknown'"
    )
    if (rows[0].unknown_count > 0) {
      throw new Error(
        `authentication_sessions 存在 ${rows[0].unknown_count} 条 login_platform='unknown' 记录，需先归类再收窄枚举`
      )
    }
    await queryInterface.sequelize.query(
      "ALTER TABLE authentication_sessions MODIFY COLUMN login_platform ENUM('web','wechat_mp','douyin_mp','alipay_mp','app') NOT NULL COMMENT '登录平台（展示标签，由 platformDetector 识别，调用方必传）'"
    )
    console.log('✅ authentication_sessions.login_platform 枚举已收窄（移除 unknown，无默认值）')
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "ALTER TABLE authentication_sessions MODIFY COLUMN login_platform ENUM('web','wechat_mp','douyin_mp','alipay_mp','app','unknown') NOT NULL DEFAULT 'unknown' COMMENT '登录平台'"
    )
    console.log('⏪ authentication_sessions.login_platform 枚举已恢复（含 unknown）')
  }
}
