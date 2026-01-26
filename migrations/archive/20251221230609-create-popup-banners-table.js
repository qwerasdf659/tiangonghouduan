'use strict'

/**
 * 迁移文件：创建弹窗Banner配置表
 *
 * 业务场景：
 * - 用户打开微信小程序首页时显示弹窗图片
 * - 管理员通过Web后台管理弹窗配置
 * - 支持多弹窗位、时间范围控制、点击跳转
 *
 * 表名：popup_banners
 * 创建时间：2025-12-22
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 创建弹窗Banner配置表
    await queryInterface.createTable('popup_banners', {
      // 主键ID
      banner_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '弹窗Banner主键ID'
      },

      // 弹窗标题（便于管理识别）
      title: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: '弹窗标题（便于后台管理识别）'
      },

      // 图片URL（Sealos对象存储）
      image_url: {
        type: Sequelize.STRING(500),
        allowNull: false,
        comment: '弹窗图片URL（Sealos对象存储）'
      },

      // 点击跳转链接（可选）
      link_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: '点击跳转链接（可选）'
      },

      // 跳转类型
      link_type: {
        type: Sequelize.ENUM('none', 'page', 'miniprogram', 'webview'),
        allowNull: false,
        defaultValue: 'none',
        comment: '跳转类型：none-不跳转, page-小程序页面, miniprogram-其他小程序, webview-H5页面'
      },

      // 显示位置
      position: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'home',
        comment: '显示位置：home-首页, profile-个人中心等'
      },

      // 是否启用
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否启用'
      },

      // 显示顺序（数字小的优先）
      display_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '显示顺序（数字小的优先）'
      },

      // 开始展示时间
      start_time: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '开始展示时间（NULL表示立即生效）'
      },

      // 结束展示时间
      end_time: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '结束展示时间（NULL表示永不过期）'
      },

      // 创建人ID
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

      // 创建时间
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '创建时间'
      },

      // 更新时间
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        comment: '更新时间'
      }
    })

    // 创建索引：位置+启用状态（查询有效弹窗）
    await queryInterface.addIndex('popup_banners', ['position', 'is_active'], {
      name: 'idx_popup_banners_position_active'
    })

    // 创建索引：显示顺序（排序）
    await queryInterface.addIndex('popup_banners', ['display_order'], {
      name: 'idx_popup_banners_display_order'
    })

    // 创建索引：时间范围（过滤有效期）
    await queryInterface.addIndex('popup_banners', ['start_time', 'end_time'], {
      name: 'idx_popup_banners_time_range'
    })

    console.log('✅ popup_banners 表创建成功')
  },

  async down(queryInterface, _Sequelize) {
    // 删除表（会自动删除索引）
    await queryInterface.dropTable('popup_banners')
    console.log('✅ popup_banners 表删除成功')
  }
}
