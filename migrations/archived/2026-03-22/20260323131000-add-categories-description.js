'use strict'

/**
 * 为 categories 增加 description，与 DictionaryService / 运营字典能力一致
 * （原 EAV 建表未包含该列，但业务层已读写说明文字）
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('categories', 'description', {
      type: Sequelize.STRING(500),
      allowNull: true,
      comment: '品类说明（运营可见）'
    })
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('categories', 'description')
  }
}
