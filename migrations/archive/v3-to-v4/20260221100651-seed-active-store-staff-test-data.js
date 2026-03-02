'use strict';

const TARGET_USER_ID = 31;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [existingStaff] = await queryInterface.sequelize.query(
      `SELECT store_staff_id, store_id, status FROM store_staff WHERE user_id = :userId AND deleted_at IS NULL`,
      { replacements: { userId: TARGET_USER_ID } }
    );

    if (existingStaff.length > 0) {
      const inactiveIds = existingStaff
        .filter(s => s.status !== 'active')
        .map(s => s.store_staff_id);

      if (inactiveIds.length > 0) {
        await queryInterface.sequelize.query(
          `UPDATE store_staff
           SET status = 'active', left_at = NULL, notes = '测试数据-重新激活', updated_at = NOW()
           WHERE store_staff_id IN (:ids)`,
          { replacements: { ids: inactiveIds } }
        );
        console.log(`Reactivated ${inactiveIds.length} store_staff records: [${inactiveIds.join(', ')}]`);
      }

      const coveredStoreIds = existingStaff.map(s => s.store_id);
      const [uncoveredStores] = await queryInterface.sequelize.query(
        `SELECT store_id FROM stores WHERE status = 'active' AND store_id NOT IN (:coveredIds)`,
        { replacements: { coveredIds: coveredStoreIds } }
      );

      if (uncoveredStores.length > 0) {
        const now = new Date();
        const newRecords = uncoveredStores.map(store => ({
          user_id: TARGET_USER_ID,
          store_id: store.store_id,
          sequence_no: 1,
          role_in_store: 'manager',
          status: 'active',
          joined_at: now,
          left_at: null,
          operator_id: null,
          notes: '测试数据-新增门店员工',
          created_at: now,
          updated_at: now,
        }));

        await queryInterface.bulkInsert('store_staff', newRecords);
        console.log(`Inserted ${newRecords.length} new store_staff records for stores: [${uncoveredStores.map(s => s.store_id).join(', ')}]`);
      }
    } else {
      const [activeStores] = await queryInterface.sequelize.query(
        `SELECT store_id FROM stores WHERE status = 'active'`
      );

      if (activeStores.length === 0) {
        console.log('No active stores found, skipping.');
        return;
      }

      const now = new Date();
      const newRecords = activeStores.map(store => ({
        user_id: TARGET_USER_ID,
        store_id: store.store_id,
        sequence_no: 1,
        role_in_store: 'manager',
        status: 'active',
        joined_at: now,
        left_at: null,
        operator_id: null,
        notes: '测试数据-初始创建',
        created_at: now,
        updated_at: now,
      }));

      await queryInterface.bulkInsert('store_staff', newRecords);
      console.log(`Inserted ${newRecords.length} new store_staff records.`);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `UPDATE store_staff
       SET status = 'inactive', left_at = NOW(), notes = '测试数据-回滚恢复inactive', updated_at = NOW()
       WHERE user_id = :userId AND deleted_at IS NULL`,
      { replacements: { userId: TARGET_USER_ID } }
    );

    await queryInterface.sequelize.query(
      `DELETE FROM store_staff WHERE user_id = :userId AND notes = '测试数据-新增门店员工'`,
      { replacements: { userId: TARGET_USER_ID } }
    );
  }
};
