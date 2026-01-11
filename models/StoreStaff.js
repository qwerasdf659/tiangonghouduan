/**
 * 门店员工关系模型 - 餐厅积分抽奖系统 V4.0
 *
 * 业务场景：
 * - 管理员工与门店的多对多关系
 * - 支持员工在门店内的角色区分（staff/manager）
 * - 支持员工离职/调动的历史记录
 *
 * 表名：store_staff
 * 主键：store_staff_id（BIGINT，自增）
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md
 */

'use strict'

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const StoreStaff = sequelize.define(
    'StoreStaff',
    {
      /*
       * =================================================================
       * 主键
       * =================================================================
       */
      store_staff_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键ID（自增）'
      },

      /*
       * =================================================================
       * 关联字段
       * =================================================================
       */
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '员工用户ID（外键关联 users.user_id）'
      },

      store_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'stores',
          key: 'store_id'
        },
        comment: '门店ID（外键关联 stores.store_id）'
      },

      /*
       * =================================================================
       * 序列号（支持历史记录）
       * =================================================================
       */
      sequence_no: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '序列号（同一用户在同一门店的第N次入职记录，由触发器自动维护）'
      },

      /*
       * =================================================================
       * 门店内角色
       * =================================================================
       */
      role_in_store: {
        type: DataTypes.ENUM('staff', 'manager'),
        allowNull: false,
        defaultValue: 'staff',
        comment: '门店内角色：staff=员工，manager=店长'
      },

      /*
       * =================================================================
       * 状态管理
       * =================================================================
       */
      status: {
        type: DataTypes.ENUM('active', 'inactive', 'pending'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '状态：active=在职，inactive=离职，pending=待审核'
      },

      /*
       * =================================================================
       * 时间记录
       * =================================================================
       */
      joined_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '入职时间（审核通过后设置）'
      },

      left_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '离职时间（离职时设置）'
      },

      /*
       * =================================================================
       * 操作者
       * =================================================================
       */
      operator_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '操作者ID（邀请/审批此员工的用户）'
      },

      /*
       * =================================================================
       * 备注
       * =================================================================
       */
      notes: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '备注信息'
      }
    },
    {
      tableName: 'store_staff',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '门店员工关系表（员工-门店多对多，支持历史记录）',

      /*
       * =================================================================
       * 索引定义（与迁移保持一致）
       * =================================================================
       */
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'store_id', 'sequence_no'],
          name: 'uk_store_staff_user_store_seq'
        },
        {
          fields: ['user_id', 'status'],
          name: 'idx_store_staff_user_status'
        },
        {
          fields: ['store_id', 'status'],
          name: 'idx_store_staff_store_status'
        },
        {
          fields: ['status', 'role_in_store'],
          name: 'idx_store_staff_status_role'
        }
      ],

      /*
       * =================================================================
       * Sequelize Scopes（查询作用域）
       * =================================================================
       */
      defaultScope: {
        // 默认不过滤，返回所有记录（包括历史）
      },

      scopes: {
        // 仅在职员工
        active: {
          where: { status: 'active' }
        },

        // 仅待审核
        pending: {
          where: { status: 'pending' }
        },

        // 仅离职（历史记录）
        inactive: {
          where: { status: 'inactive' }
        },

        // 仅店长
        managers: {
          where: { role_in_store: 'manager', status: 'active' }
        },

        // 仅员工（非店长）
        staff: {
          where: { role_in_store: 'staff', status: 'active' }
        }
      },

      /*
       * =================================================================
       * 钩子函数
       * =================================================================
       */
      hooks: {
        beforeSave: (record, _options) => {
          record.updated_at = BeijingTimeHelper.createDatabaseTime()
        }
      }
    }
  )

  /*
   * =================================================================
   * 模型关联定义
   * =================================================================
   */
  StoreStaff.associate = function (models) {
    // 多对一：员工关联到用户
    StoreStaff.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      comment: '员工用户信息'
    })

    // 多对一：关联到门店
    StoreStaff.belongsTo(models.Store, {
      foreignKey: 'store_id',
      as: 'store',
      comment: '所属门店'
    })

    // 多对一：操作者（邀请人/审批人）
    StoreStaff.belongsTo(models.User, {
      foreignKey: 'operator_id',
      as: 'operator',
      comment: '操作者（邀请/审批人）'
    })
  }

  /*
   * =================================================================
   * 实例方法
   * =================================================================
   */

  /**
   * 检查员工是否在职
   * @returns {boolean} 是否在职
   */
  StoreStaff.prototype.isActive = function () {
    return this.status === 'active'
  }

  /**
   * 检查是否为店长
   * @returns {boolean} 是否为店长
   */
  StoreStaff.prototype.isManager = function () {
    return this.role_in_store === 'manager' && this.status === 'active'
  }

  /**
   * 获取状态名称（中文）
   * @returns {string} 状态名称
   */
  StoreStaff.prototype.getStatusName = function () {
    const statusNames = {
      active: '在职',
      inactive: '离职',
      pending: '待审核'
    }
    return statusNames[this.status] || '未知'
  }

  /**
   * 获取角色名称（中文）
   * @returns {string} 角色名称
   */
  StoreStaff.prototype.getRoleName = function () {
    const roleNames = {
      staff: '员工',
      manager: '店长'
    }
    return roleNames[this.role_in_store] || '未知'
  }

  /**
   * 转换为API响应格式
   * @returns {Object} API响应对象
   */
  StoreStaff.prototype.toAPIResponse = function () {
    const response = {
      id: Number(this.store_staff_id),
      store_staff_id: Number(this.store_staff_id),
      user_id: this.user_id,
      store_id: this.store_id,
      sequence_no: this.sequence_no,
      role_in_store: this.role_in_store,
      role_name: this.getRoleName(),
      status: this.status,
      status_name: this.getStatusName(),
      joined_at: this.joined_at ? BeijingTimeHelper.formatForAPI(this.joined_at) : null,
      left_at: this.left_at ? BeijingTimeHelper.formatForAPI(this.left_at) : null,
      operator_id: this.operator_id,
      notes: this.notes,
      created_at: BeijingTimeHelper.formatForAPI(this.created_at),
      updated_at: BeijingTimeHelper.formatForAPI(this.updated_at)
    }

    // 关联的用户信息
    if (this.user) {
      response.user_nickname = this.user.nickname || null
      response.user_mobile = this.user.mobile || null
    }

    // 关联的门店信息
    if (this.store) {
      response.store_name = this.store.store_name || null
      response.store_code = this.store.store_code || null
    }

    // 关联的操作者信息
    if (this.operator) {
      response.operator_nickname = this.operator.nickname || null
    }

    return response
  }

  /*
   * =================================================================
   * 静态方法
   * =================================================================
   */

  /**
   * 获取用户所属的所有在职门店
   * @param {number} user_id - 用户ID
   * @returns {Promise<Array>} 门店列表
   */
  StoreStaff.getUserActiveStores = async function (user_id) {
    return await this.scope('active').findAll({
      where: { user_id },
      include: [
        {
          association: 'store',
          attributes: ['store_id', 'store_name', 'store_code', 'status']
        }
      ]
    })
  }

  /**
   * 检查用户是否在指定门店在职
   * @param {number} user_id - 用户ID
   * @param {number} store_id - 门店ID
   * @returns {Promise<boolean>} 是否在职
   */
  StoreStaff.isUserActiveInStore = async function (user_id, store_id) {
    const count = await this.scope('active').count({
      where: { user_id, store_id }
    })
    return count > 0
  }

  /**
   * 获取门店的所有在职员工
   * @param {number} store_id - 门店ID
   * @returns {Promise<Array>} 员工列表
   */
  StoreStaff.getStoreActiveStaff = async function (store_id) {
    return await this.scope('active').findAll({
      where: { store_id },
      include: [
        {
          association: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ],
      order: [
        ['role_in_store', 'DESC'],
        ['joined_at', 'ASC']
      ]
    })
  }

  /**
   * 获取用户在指定门店的当前在职记录
   * @param {number} user_id - 用户ID
   * @param {number} store_id - 门店ID
   * @returns {Promise<StoreStaff|null>} 在职记录或null
   */
  StoreStaff.getUserStoreActiveRecord = async function (user_id, store_id) {
    return await this.scope('active').findOne({
      where: { user_id, store_id }
    })
  }

  return StoreStaff
}
