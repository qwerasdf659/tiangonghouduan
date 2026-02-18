'use strict'

/**
 * Phase 1 迁移：弹窗频率控制 + 轮播图独立表
 *
 * 变更内容：
 * 1. popup_banners 表新增 5 列（banner_type / frequency_rule / frequency_value / force_show / priority）
 * 2. popup_banners 表新增 2 个索引（idx_popup_banners_type_active / idx_popup_banners_priority）
 * 3. 新建 carousel_items 表（轮播图独立管理，与弹窗分离 — 拍板决策1）
 * 4. system_configs 新增 popup_queue_max_count 配置（弹窗队列最大数量 — 拍板决策5）
 * 5. system_dictionaries 新增 9 条字典数据（banner_type 3条 + banner_frequency 6条）
 *
 * @see docs/广告系统升级方案.md 第二节、第十四节 14.1
 */

/**
 * 幂等添加列：仅当列不存在时才执行 ALTER TABLE ADD COLUMN
 * @param {Object} qi - queryInterface
 * @param {string} table - 表名
 * @param {string} column - 列名
 * @param {Object} definition - 列定义
 * @param {Object} opts - 选项（含 transaction）
 */
async function addColumnIfNotExists(qi, table, column, definition, opts) {
  const [rows] = await qi.sequelize.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND COLUMN_NAME = '${column}'`,
    opts
  )
  if (rows.length === 0) {
    await qi.addColumn(table, column, definition, opts)
  }
}

/**
 * 幂等添加索引：仅当索引不存在时才执行
 */
async function addIndexIfNotExists(qi, table, fields, options) {
  const [rows] = await qi.sequelize.query(
    `SHOW INDEX FROM \`${table}\` WHERE Key_name = '${options.name}'`,
    { transaction: options.transaction }
  )
  if (rows.length === 0) {
    await qi.addIndex(table, fields, options)
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    const opts = { transaction }

    try {
      // ========== 1. popup_banners 表新增 5 列 ==========

      await addColumnIfNotExists(queryInterface, 'popup_banners', 'banner_type', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'promo',
        comment: '弹窗类型分级：notice=系统公告 / event=活动推广 / promo=日常促销'
      }, opts)

      await addColumnIfNotExists(queryInterface, 'popup_banners', 'frequency_rule', {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'once_per_day',
        comment: '频率规则：always / once / once_per_session / once_per_day / once_per_n_days / n_times_total'
      }, opts)

      await addColumnIfNotExists(queryInterface, 'popup_banners', 'frequency_value', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 1,
        comment: '频率参数（配合 once_per_n_days 或 n_times_total 使用）'
      }, opts)

      await addColumnIfNotExists(queryInterface, 'popup_banners', 'force_show', {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        comment: '是否强制弹出（1=不可点遮罩关闭，需点"我知道了"按钮）'
      }, opts)

      await addColumnIfNotExists(queryInterface, 'popup_banners', 'priority', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: '弹出优先级（数字越大越优先，区别于 display_order 的管理排序）'
      }, opts)

      // ========== 2. popup_banners 新增 2 个索引 ==========

      await addIndexIfNotExists(queryInterface, 'popup_banners', ['banner_type', 'is_active'], {
        name: 'idx_popup_banners_type_active',
        transaction
      })

      await addIndexIfNotExists(queryInterface, 'popup_banners', ['priority'], {
        name: 'idx_popup_banners_priority',
        transaction
      })

      // ========== 3. 新建 carousel_items 表 ==========

      const [tableExists] = await queryInterface.sequelize.query(
        "SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'carousel_items'",
        opts
      )

      if (tableExists.length === 0) {
        await queryInterface.createTable(
          'carousel_items',
          {
            carousel_item_id: {
              type: Sequelize.INTEGER,
              primaryKey: true,
              autoIncrement: true,
              comment: '轮播图主键ID'
            },
            title: {
              type: Sequelize.STRING(100),
              allowNull: false,
              comment: '轮播图标题（后台管理识别用）'
            },
            image_url: {
              type: Sequelize.STRING(500),
              allowNull: false,
              comment: '图片对象 key（非完整 URL，如 carousel/xxx.jpg）'
            },
            display_mode: {
              type: Sequelize.ENUM('wide', 'horizontal', 'square'),
              allowNull: false,
              defaultValue: 'wide',
              comment: '显示模式：wide=宽屏16:9 / horizontal=横版3:2 / square=方图1:1'
            },
            image_width: {
              type: Sequelize.INTEGER.UNSIGNED,
              allowNull: true,
              defaultValue: null,
              comment: '原图宽度(px)，上传时自动检测'
            },
            image_height: {
              type: Sequelize.INTEGER.UNSIGNED,
              allowNull: true,
              defaultValue: null,
              comment: '原图高度(px)，上传时自动检测'
            },
            link_url: {
              type: Sequelize.STRING(500),
              allowNull: true,
              comment: '跳转链接'
            },
            link_type: {
              type: Sequelize.ENUM('none', 'page', 'miniprogram', 'webview'),
              allowNull: false,
              defaultValue: 'none',
              comment: '跳转类型：none=不跳转 / page=小程序页面 / miniprogram=其他小程序 / webview=H5页面'
            },
            position: {
              type: Sequelize.STRING(50),
              allowNull: false,
              defaultValue: 'home',
              comment: '显示位置：home=首页'
            },
            is_active: {
              type: Sequelize.BOOLEAN,
              allowNull: false,
              defaultValue: false,
              comment: '是否启用'
            },
            display_order: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '显示顺序（数字小的排前面）'
            },
            slide_interval_ms: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 3000,
              comment: '轮播间隔毫秒（默认3秒）'
            },
            start_time: {
              type: Sequelize.DATE,
              allowNull: true,
              comment: '开始展示时间（NULL表示立即生效）'
            },
            end_time: {
              type: Sequelize.DATE,
              allowNull: true,
              comment: '结束展示时间（NULL表示永不过期）'
            },
            created_by: {
              type: Sequelize.INTEGER,
              allowNull: true,
              references: {
                model: 'users',
                key: 'user_id'
              },
              onUpdate: 'CASCADE',
              onDelete: 'SET NULL',
              comment: '创建人ID'
            },
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
              comment: '创建时间'
            },
            updated_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
              comment: '更新时间'
            }
          },
          {
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci',
            comment: '轮播图配置表 - 页面内嵌 swiper 组件，与弹窗（popup_banners）独立管理',
            transaction
          }
        )

        await addIndexIfNotExists(queryInterface, 'carousel_items', ['position', 'is_active'], {
          name: 'idx_carousel_position_active', transaction
        })
        await addIndexIfNotExists(queryInterface, 'carousel_items', ['display_order'], {
          name: 'idx_carousel_display_order', transaction
        })
        await addIndexIfNotExists(queryInterface, 'carousel_items', ['start_time', 'end_time'], {
          name: 'idx_carousel_time_range', transaction
        })
      }

      // ========== 4. system_configs 新增弹窗队列最大数量配置 ==========

      const [existingConfig] = await queryInterface.sequelize.query(
        "SELECT config_key FROM system_configs WHERE config_key = 'popup_queue_max_count'",
        opts
      )
      if (existingConfig.length === 0) {
        await queryInterface.bulkInsert(
          'system_configs',
          [{
            config_key: 'popup_queue_max_count',
            config_value: JSON.stringify(5),
            config_category: 'general',
            description: '弹窗队列最大数量（拍板决策5：默认5个）',
            is_active: true,
            created_at: new Date(),
            updated_at: new Date()
          }],
          opts
        )
      }

      // ========== 5. system_dictionaries 新增 9 条字典数据 ==========

      const dictionaries = [
        { dict_type: 'banner_type', dict_code: 'notice', dict_name: '系统公告', dict_color: 'bg-red-500', sort_order: 1, is_enabled: true, created_at: new Date(), updated_at: new Date() },
        { dict_type: 'banner_type', dict_code: 'event', dict_name: '活动推广', dict_color: 'bg-orange-500', sort_order: 2, is_enabled: true, created_at: new Date(), updated_at: new Date() },
        { dict_type: 'banner_type', dict_code: 'promo', dict_name: '日常促销', dict_color: 'bg-blue-500', sort_order: 3, is_enabled: true, created_at: new Date(), updated_at: new Date() },
        { dict_type: 'banner_frequency', dict_code: 'always', dict_name: '每次弹出', dict_color: 'bg-gray-500', sort_order: 1, is_enabled: true, created_at: new Date(), updated_at: new Date() },
        { dict_type: 'banner_frequency', dict_code: 'once', dict_name: '仅弹一次', dict_color: 'bg-green-500', sort_order: 2, is_enabled: true, created_at: new Date(), updated_at: new Date() },
        { dict_type: 'banner_frequency', dict_code: 'once_per_session', dict_name: '每次启动弹一次', dict_color: 'bg-cyan-500', sort_order: 3, is_enabled: true, created_at: new Date(), updated_at: new Date() },
        { dict_type: 'banner_frequency', dict_code: 'once_per_day', dict_name: '每天一次', dict_color: 'bg-blue-500', sort_order: 4, is_enabled: true, created_at: new Date(), updated_at: new Date() },
        { dict_type: 'banner_frequency', dict_code: 'once_per_n_days', dict_name: '每N天一次', dict_color: 'bg-purple-500', sort_order: 5, is_enabled: true, created_at: new Date(), updated_at: new Date() },
        { dict_type: 'banner_frequency', dict_code: 'n_times_total', dict_name: '累计N次', dict_color: 'bg-pink-500', sort_order: 6, is_enabled: true, created_at: new Date(), updated_at: new Date() }
      ]

      for (const dict of dictionaries) {
        const [existing] = await queryInterface.sequelize.query(
          `SELECT 1 FROM system_dictionaries WHERE dict_type = '${dict.dict_type}' AND dict_code = '${dict.dict_code}'`,
          opts
        )
        if (existing.length === 0) {
          await queryInterface.bulkInsert('system_dictionaries', [dict], opts)
        }
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      await queryInterface.bulkDelete('system_dictionaries', { dict_type: ['banner_type', 'banner_frequency'] }, { transaction })
      await queryInterface.bulkDelete('system_configs', { config_key: 'popup_queue_max_count' }, { transaction })
      await queryInterface.dropTable('carousel_items', { transaction })
      await queryInterface.removeIndex('popup_banners', 'idx_popup_banners_type_active', { transaction }).catch(() => {})
      await queryInterface.removeIndex('popup_banners', 'idx_popup_banners_priority', { transaction }).catch(() => {})
      await queryInterface.removeColumn('popup_banners', 'priority', { transaction })
      await queryInterface.removeColumn('popup_banners', 'force_show', { transaction })
      await queryInterface.removeColumn('popup_banners', 'frequency_value', { transaction })
      await queryInterface.removeColumn('popup_banners', 'frequency_rule', { transaction })
      await queryInterface.removeColumn('popup_banners', 'banner_type', { transaction })
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
