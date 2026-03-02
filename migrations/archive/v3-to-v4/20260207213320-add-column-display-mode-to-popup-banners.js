'use strict'

/**
 * 数据库迁移：弹窗Banner新增显示模式字段（display_mode / image_width / image_height）
 *
 * 业务背景：
 * 运营在管理后台上传弹窗图片时，需要先选择"显示模式"模板，
 * 模板自带推荐比例，后端存储 display_mode 字段，
 * 前端直接读取该字段决定布局方式，无需实时检测图片比例。
 *
 * 拍板决策（2026-02-08）：
 * - 决策1：文件限制 400KB + 仅 JPG/PNG
 * - 决策2：字段类型 ENUM（6种模式基于物理比例不会频繁变）
 * - 决策3：必填，无默认值兜底（运营必须主动选择模板才能提交）
 * - 决策4：迁移时清空测试数据（干净起步）
 * - 决策5：前端 + 后端双重校验
 *
 * 变更内容：
 * 1. 清空 popup_banners 测试数据（拍板决策4）
 * 2. 新增 display_mode ENUM 列（必填，无默认值）
 * 3. 新增 image_width / image_height 列（可选，上传时 sharp 自动存储）
 * 4. 插入 banner_display_mode 字典数据（6条）
 *
 * @module migrations/20260207213320-add-column-display-mode-to-popup-banners
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 开始执行迁移：弹窗Banner新增显示模式字段...')

    // 0. 清空测试数据（拍板决策4：干净起步）
    const [existingRows] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) AS cnt FROM popup_banners'
    )
    const rowCount = existingRows[0].cnt
    if (rowCount > 0) {
      console.log(`🗑️  清空 popup_banners 现有 ${rowCount} 条测试数据...`)
      await queryInterface.bulkDelete('popup_banners', null, {})
    }

    // 1. 新增 display_mode 列（ENUM，必填无默认值 — 拍板决策2+3）
    console.log('📦 新增 display_mode 列...')
    await queryInterface.addColumn('popup_banners', 'display_mode', {
      type: Sequelize.ENUM('wide', 'horizontal', 'square', 'tall', 'slim', 'full_image'),
      allowNull: false,
      comment: '显示模式：wide=宽屏16:9, horizontal=横版3:2, square=方图1:1, tall=竖图3:4, slim=窄长图9:16, full_image=纯图模式',
      after: 'image_url'
    })

    // 2. 新增 image_width 列（可选，上传时 sharp 自动存储）
    console.log('📦 新增 image_width 列...')
    await queryInterface.addColumn('popup_banners', 'image_width', {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
      defaultValue: null,
      comment: '原图宽度(px)，上传时 sharp 自动存储',
      after: 'display_mode'
    })

    // 3. 新增 image_height 列（可选，上传时 sharp 自动存储）
    console.log('📦 新增 image_height 列...')
    await queryInterface.addColumn('popup_banners', 'image_height', {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
      defaultValue: null,
      comment: '原图高度(px)，上传时 sharp 自动存储',
      after: 'image_width'
    })

    // 4. 插入 banner_display_mode 字典数据（6种显示模式的中文映射）
    console.log('📦 插入 banner_display_mode 字典数据...')
    const now = new Date()
    await queryInterface.bulkInsert('system_dictionaries', [
      {
        dict_type: 'banner_display_mode',
        dict_code: 'wide',
        dict_name: '宽屏模式（16:9）',
        dict_color: 'bg-blue-500',
        sort_order: 1,
        is_enabled: 1,
        remark: '推荐尺寸 750×420px，适用于视频封面、宽幅横幅',
        version: 1,
        created_at: now,
        updated_at: now
      },
      {
        dict_type: 'banner_display_mode',
        dict_code: 'horizontal',
        dict_name: '横版模式（3:2）',
        dict_color: 'bg-cyan-500',
        sort_order: 2,
        is_enabled: 1,
        remark: '推荐尺寸 750×500px，适用于标准横版照片、活动横幅',
        version: 1,
        created_at: now,
        updated_at: now
      },
      {
        dict_type: 'banner_display_mode',
        dict_code: 'square',
        dict_name: '方图模式（1:1）',
        dict_color: 'bg-green-500',
        sort_order: 3,
        is_enabled: 1,
        remark: '推荐尺寸 750×750px，适用于产品展示、通知卡片',
        version: 1,
        created_at: now,
        updated_at: now
      },
      {
        dict_type: 'banner_display_mode',
        dict_code: 'tall',
        dict_name: '竖图模式（3:4）',
        dict_color: 'bg-orange-500',
        sort_order: 4,
        is_enabled: 1,
        remark: '推荐尺寸 750×1000px，适用于活动海报、促销长图',
        version: 1,
        created_at: now,
        updated_at: now
      },
      {
        dict_type: 'banner_display_mode',
        dict_code: 'slim',
        dict_name: '窄长图模式（9:16）',
        dict_color: 'bg-purple-500',
        sort_order: 5,
        is_enabled: 1,
        remark: '推荐尺寸 420×750px，适用于竖屏全幅海报、故事/短视频风格',
        version: 1,
        created_at: now,
        updated_at: now
      },
      {
        dict_type: 'banner_display_mode',
        dict_code: 'full_image',
        dict_name: '纯图模式（无文字区）',
        dict_color: 'bg-pink-500',
        sort_order: 6,
        is_enabled: 1,
        remark: '不限比例，整张图就是弹窗，无白色卡片壳',
        version: 1,
        created_at: now,
        updated_at: now
      }
    ])

    console.log('✅ 迁移完成：弹窗Banner新增显示模式字段')
  },

  async down(queryInterface) {
    console.log('🔄 回滚迁移：移除弹窗Banner显示模式字段...')

    // 1. 移除新增列（顺序：先移列，再移ENUM类型）
    await queryInterface.removeColumn('popup_banners', 'image_height')
    await queryInterface.removeColumn('popup_banners', 'image_width')
    await queryInterface.removeColumn('popup_banners', 'display_mode')

    // 2. 删除字典数据
    await queryInterface.bulkDelete('system_dictionaries', {
      dict_type: 'banner_display_mode'
    })

    console.log('✅ 回滚完成')
  }
}
























