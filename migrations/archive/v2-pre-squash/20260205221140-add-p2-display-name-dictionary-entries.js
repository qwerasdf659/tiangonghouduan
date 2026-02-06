'use strict'

/**
 * P2 中文化显示名称 - 补充字典数据
 *
 * 业务背景：
 * - 为约 40 个前端 getXxxText 映射函数提供后端数据源
 * - 配合 attachDisplayNames 机制，让前端直接使用 xxx_display 字段
 * - 涵盖：弹窗位置、链接类型、垫付模式、支付方式、配额范围、
 *         批量操作类型、预算状态、用户生命周期阶段
 *
 * 关联文件：
 * - utils/displayNameHelper.js (DICT_TYPES 常量)
 * - 各业务 Service (attachDisplayNames 调用)
 *
 * @date 2026-02-06 北京时间
 */
module.exports = {
  async up(queryInterface) {
    /**
     * 所有新增字典类型及其数据
     * 使用 ON DUPLICATE KEY UPDATE 保证幂等性
     */
    const dictEntries = [
      // ==================== 弹窗广告位置 ====================
      { type: 'banner_position', code: 'home', name: '首页', color: 'bg-primary', sort: 1 },
      { type: 'banner_position', code: 'lottery', name: '抽奖页', color: 'bg-warning', sort: 2 },
      { type: 'banner_position', code: 'activity', name: '活动页', color: 'bg-success', sort: 3 },
      { type: 'banner_position', code: 'profile', name: '个人中心', color: 'bg-info', sort: 4 },

      // ==================== 弹窗链接类型 ====================
      { type: 'banner_link_type', code: 'none', name: '无链接', color: 'bg-secondary', sort: 1 },
      { type: 'banner_link_type', code: 'page', name: '内部页面', color: 'bg-primary', sort: 2 },
      { type: 'banner_link_type', code: 'miniprogram', name: '小程序', color: 'bg-success', sort: 3 },
      { type: 'banner_link_type', code: 'webview', name: '网页', color: 'bg-info', sort: 4 },

      // ==================== 预设垫付模式 ====================
      { type: 'advance_mode', code: 'none', name: '无垫付', color: 'bg-secondary', sort: 1 },
      { type: 'advance_mode', code: 'inventory', name: '库存垫付', color: 'bg-warning', sort: 2 },
      { type: 'advance_mode', code: 'budget', name: '预算垫付', color: 'bg-info', sort: 3 },
      { type: 'advance_mode', code: 'both', name: '双重垫付', color: 'bg-danger', sort: 4 },

      // ==================== 支付方式（消费记录分析用） ====================
      { type: 'payment_method', code: 'wechat', name: '微信支付', color: 'bg-success', sort: 1 },
      { type: 'payment_method', code: 'alipay', name: '支付宝', color: 'bg-primary', sort: 2 },
      { type: 'payment_method', code: 'cash', name: '现金', color: 'bg-warning', sort: 3 },
      { type: 'payment_method', code: 'card', name: '银行卡', color: 'bg-info', sort: 4 },
      { type: 'payment_method', code: 'other', name: '其他', color: 'bg-secondary', sort: 5 },

      // ==================== 配额范围类型 ====================
      { type: 'scope_type', code: 'global', name: '全局', color: 'bg-danger', sort: 1 },
      { type: 'scope_type', code: 'campaign', name: '活动级', color: 'bg-warning', sort: 2 },
      { type: 'scope_type', code: 'rule', name: '规则级', color: 'bg-info', sort: 3 },

      // ==================== 批量操作类型 ====================
      { type: 'batch_operation_type', code: 'quota_grant', name: '批量赠送', color: 'bg-success', sort: 1 },
      { type: 'batch_operation_type', code: 'campaign_status', name: '批量状态变更', color: 'bg-warning', sort: 2 },
      { type: 'batch_operation_type', code: 'user_points', name: '批量积分调整', color: 'bg-primary', sort: 3 },
      { type: 'batch_operation_type', code: 'notification', name: '批量通知', color: 'bg-info', sort: 4 },

      // ==================== 预算运行状态（活动预算分析用） ====================
      { type: 'budget_status', code: 'active', name: '运行中', color: 'bg-success', sort: 1 },
      { type: 'budget_status', code: 'paused', name: '已暂停', color: 'bg-warning', sort: 2 },
      { type: 'budget_status', code: 'exhausted', name: '已耗尽', color: 'bg-danger', sort: 3 },
      { type: 'budget_status', code: 'warning', name: '预警', color: 'bg-warning', sort: 4 },

      // ==================== 用户生命周期阶段 ====================
      { type: 'user_phase', code: 'newcomer', name: '新手期', color: 'bg-success', sort: 1 },
      { type: 'user_phase', code: 'growth', name: '成长期', color: 'bg-primary', sort: 2 },
      { type: 'user_phase', code: 'mature', name: '成熟期', color: 'bg-warning', sort: 3 },
      { type: 'user_phase', code: 'decline', name: '衰退期', color: 'bg-danger', sort: 4 },

      // ==================== 分析维度类型 ====================
      { type: 'dimension_type', code: 'store', name: '门店', color: 'bg-primary', sort: 1 },
      { type: 'dimension_type', code: 'campaign', name: '活动', color: 'bg-warning', sort: 2 },
      { type: 'dimension_type', code: 'user_segment', name: '用户群', color: 'bg-info', sort: 3 },
      { type: 'dimension_type', code: 'time_period', name: '时间段', color: 'bg-secondary', sort: 4 },

      // ==================== 资产类型（资产组合展示用） ====================
      { type: 'asset_type', code: 'points', name: '积分', color: 'bg-warning', sort: 1 },
      { type: 'asset_type', code: 'balance', name: '余额', color: 'bg-success', sort: 2 },
      { type: 'asset_type', code: 'coupon', name: '优惠券', color: 'bg-primary', sort: 3 },
      { type: 'asset_type', code: 'diamond', name: '钻石', color: 'bg-info', sort: 4 },
      { type: 'asset_type', code: 'item', name: '道具', color: 'bg-secondary', sort: 5 }
    ]

    console.log(`📝 插入 P2 字典数据（${dictEntries.length} 条，${new Set(dictEntries.map(e => e.type)).size} 种类型）...`)

    // 构建批量 INSERT ... ON DUPLICATE KEY UPDATE SQL
    const values = dictEntries.map(e =>
      `('${e.type}', '${e.code}', '${e.name}', '${e.color}', ${e.sort}, 1, NOW(), NOW())`
    ).join(',\n      ')

    await queryInterface.sequelize.query(`
      INSERT INTO system_dictionaries
        (dict_type, dict_code, dict_name, dict_color, sort_order, is_enabled, created_at, updated_at)
      VALUES
        ${values}
      ON DUPLICATE KEY UPDATE
        dict_name = VALUES(dict_name),
        dict_color = VALUES(dict_color),
        sort_order = VALUES(sort_order),
        updated_at = NOW()
    `)

    // 验证插入结果
    const [result] = await queryInterface.sequelize.query(`
      SELECT dict_type, COUNT(*) as cnt
      FROM system_dictionaries
      WHERE dict_type IN (${[...new Set(dictEntries.map(e => `'${e.type}'`))].join(',')})
      AND is_enabled = 1
      GROUP BY dict_type
      ORDER BY dict_type
    `)

    console.log('✅ P2 字典数据插入完成：')
    result.forEach(r => console.log(`   ${r.dict_type}: ${r.cnt} 条`))
  },

  async down(queryInterface) {
    const types = [
      'banner_position', 'banner_link_type', 'advance_mode',
      'payment_method', 'scope_type', 'batch_operation_type',
      'budget_status', 'user_phase', 'dimension_type', 'asset_type'
    ]

    console.log(`🔄 回滚：删除 P2 字典数据（${types.length} 种类型）`)

    await queryInterface.sequelize.query(
      `DELETE FROM system_dictionaries WHERE dict_type IN (${types.map(t => `'${t}'`).join(',')})`
    )

    console.log('✅ P2 字典数据已删除')
  }
}

