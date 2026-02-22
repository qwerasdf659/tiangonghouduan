/**
 * 客服内部备注模型（CustomerServiceNote）
 *
 * 业务说明：
 * - 客服之间传递关于用户的内部信息，用户永远不可见
 * - 可关联到工单或会话，也可以独立存在（关于用户的通用备注）
 * - 典型场景：客服交接班传递信息、标记用户特殊情况、记录内部处理过程
 *
 * 数据库表：customer_service_notes
 * 主键：note_id（BIGINT 自增）
 * 外键：user_id → users.user_id, author_id → users.user_id,
 *       issue_id → customer_service_issues.issue_id,
 *       session_id → customer_service_sessions.customer_service_session_id
 *
 * @version 1.0.0
 * @date 2026-02-22
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const CustomerServiceNote = sequelize.define(
    'CustomerServiceNote',
    {
      note_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '备注主键ID'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '关于哪个用户的备注'
      },

      issue_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '关联工单ID（可选，备注可独立于工单存在）'
      },

      session_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '关联客服会话ID（可选，记录备注产生的上下文）'
      },

      author_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '备注作者ID（撰写备注的客服管理员）'
      },

      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '备注内容（仅客服可见，用户永远不可见）'
      }
    },
    {
      tableName: 'customer_service_notes',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      underscored: true,
      indexes: [
        { fields: ['user_id'], name: 'idx_notes_user_id' },
        { fields: ['issue_id'], name: 'idx_notes_issue_id' },
        { fields: ['session_id'], name: 'idx_notes_session_id' },
        { fields: ['author_id'], name: 'idx_notes_author_id' }
      ],
      comment: '客服内部备注表（仅客服可见，用户不可见）'
    }
  )

  CustomerServiceNote.associate = function (models) {
    /* 备注关于的用户 */
    CustomerServiceNote.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })

    /* 备注作者（客服管理员） */
    CustomerServiceNote.belongsTo(models.User, {
      foreignKey: 'author_id',
      as: 'author'
    })

    /* 备注关联的工单（可选） */
    CustomerServiceNote.belongsTo(models.CustomerServiceIssue, {
      foreignKey: 'issue_id',
      as: 'issue'
    })

    /* 备注关联的客服会话（可选） */
    CustomerServiceNote.belongsTo(models.CustomerServiceSession, {
      foreignKey: 'session_id',
      targetKey: 'customer_service_session_id',
      as: 'session'
    })
  }

  return CustomerServiceNote
}
