/**
 * 用户行为轨迹模型
 *
 * 业务场景：
 * - 记录用户关键行为（登录、抽奖、消费、兑换等）
 * - 支持用户行为轨迹查询和分析
 * - 用于用户画像和运营决策
 *
 * 表名：user_behavior_tracks
 * 创建时间：2026年01月31日
 */

'use strict'

const { DataTypes } = require('sequelize')

/**
 * 行为类型枚举（主要分类）
 * @readonly
 * @enum {string}
 */
const BEHAVIOR_TYPES = {
  LOGIN: 'login', // 登录
  LOTTERY: 'lottery', // 抽奖
  CONSUMPTION: 'consumption', // 消费
  EXCHANGE: 'exchange', // 兑换
  PURCHASE: 'purchase', // 购买
  MARKET: 'market', // 市场交易
  PROFILE: 'profile', // 个人信息
  POINTS: 'points', // 积分操作
  CHAT: 'chat' // 客服聊天
}

/**
 * 行为动作枚举
 * @readonly
 * @enum {string}
 */
const BEHAVIOR_ACTIONS = {
  CREATE: 'create', // 创建
  SUBMIT: 'submit', // 提交
  COMPLETE: 'complete', // 完成
  CANCEL: 'cancel', // 取消
  VIEW: 'view', // 查看
  UPDATE: 'update', // 更新
  DELETE: 'delete' // 删除
}

/**
 * 行为结果枚举
 * @readonly
 * @enum {string}
 */
const BEHAVIOR_RESULTS = {
  SUCCESS: 'success',
  FAILED: 'failed',
  PENDING: 'pending',
  CANCELLED: 'cancelled'
}

module.exports = sequelize => {
  const UserBehaviorTrack = sequelize.define(
    'UserBehaviorTrack',
    {
      /**
       * 轨迹记录ID（主键，符合{table_name}_id命名规范）
       * @type {number}
       */
      user_behavior_track_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '用户行为轨迹ID（主键）'
      },

      /**
       * 用户ID
       * @type {number}
       */
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID'
      },

      /**
       * 行为类型
       * @type {string}
       * @see BEHAVIOR_TYPES
       */
      behavior_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '行为类型'
      },

      /**
       * 行为动作
       * @type {string}
       * @see BEHAVIOR_ACTIONS
       */
      behavior_action: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '行为动作'
      },

      /**
       * 行为目标类型
       * @type {string|null}
       * @example 'lottery_campaign', 'product', 'item_instance'
       */
      behavior_target: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '行为目标类型'
      },

      /**
       * 行为目标ID
       * @type {number|null}
       */
      behavior_target_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '行为目标ID'
      },

      /**
       * 行为详情数据
       * @type {Object|null}
       * @example { lottery_prize_id: 1, points_spent: 100 }
       */
      behavior_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '行为详情数据'
      },

      /**
       * 行为结果
       * @type {string|null}
       * @see BEHAVIOR_RESULTS
       */
      behavior_result: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '行为结果'
      },

      /**
       * 会话ID
       * @type {string|null}
       */
      session_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '会话ID'
      },

      /**
       * 设备信息
       * @type {Object|null}
       * @example { platform: 'wechat', device: 'iPhone' }
       */
      device_info: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '设备信息'
      },

      /**
       * IP地址
       * @type {string|null}
       */
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: 'IP地址'
      },

      /**
       * 行为发生时间
       * @type {Date}
       */
      behavior_time: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '行为发生时间'
      }
    },
    {
      sequelize,
      modelName: 'UserBehaviorTrack',
      tableName: 'user_behavior_tracks',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false, // 行为记录不需要更新
      underscored: true,
      comment: '用户行为轨迹表',

      indexes: [
        { fields: ['user_id'], name: 'idx_behavior_tracks_user' },
        { fields: ['behavior_type'], name: 'idx_behavior_tracks_type' },
        { fields: ['behavior_time'], name: 'idx_behavior_tracks_time' },
        { fields: ['user_id', 'behavior_type'], name: 'idx_behavior_tracks_user_type' },
        { fields: ['session_id'], name: 'idx_behavior_tracks_session' }
      ],

      scopes: {
        /**
         * 按用户筛选
         * @param {number} userId - 用户ID
         * @returns {Object} Sequelize 查询条件
         */
        byUser(userId) {
          return {
            where: { user_id: userId }
          }
        },

        /**
         * 按行为类型筛选
         * @param {string} type - 行为类型
         * @returns {Object} Sequelize 查询条件
         */
        byType(type) {
          return {
            where: { behavior_type: type }
          }
        },

        /**
         * 按时间范围筛选
         * @param {Date} startTime - 开始时间
         * @param {Date} endTime - 结束时间
         * @returns {Object} Sequelize 查询条件
         */
        byTimeRange(startTime, endTime) {
          return {
            where: {
              behavior_time: {
                [sequelize.Sequelize.Op.between]: [startTime, endTime]
              }
            }
          }
        },

        /**
         * 今日行为
         */
        today: {
          where: {
            behavior_time: {
              [sequelize.Sequelize.Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
            }
          }
        }
      }
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void} 无返回值
   */
  UserBehaviorTrack.associate = function (models) {
    // 用户关联
    UserBehaviorTrack.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    })
  }

  /**
   * 记录用户行为（静态方法）
   *
   * @param {Object} params - 行为参数
   * @param {number} params.user_id - 用户ID
   * @param {string} params.behavior_type - 行为类型
   * @param {string} params.behavior_action - 行为动作
   * @param {string} [params.behavior_target] - 目标类型
   * @param {number} [params.behavior_target_id] - 目标ID
   * @param {Object} [params.behavior_data] - 行为数据
   * @param {string} [params.behavior_result] - 行为结果
   * @param {string} [params.session_id] - 会话ID
   * @param {Object} [params.device_info] - 设备信息
   * @param {string} [params.ip_address] - IP地址
   * @param {Object} [options] - Sequelize 选项
   * @returns {Promise<UserBehaviorTrack>} 创建的用户行为轨迹记录
   */
  UserBehaviorTrack.track = async function (params, options = {}) {
    const {
      user_id,
      behavior_type,
      behavior_action,
      behavior_target,
      behavior_target_id,
      behavior_data,
      behavior_result,
      session_id,
      device_info,
      ip_address
    } = params

    return UserBehaviorTrack.create(
      {
        user_id,
        behavior_type,
        behavior_action,
        behavior_target,
        behavior_target_id,
        behavior_data,
        behavior_result,
        session_id,
        device_info,
        ip_address,
        behavior_time: new Date()
      },
      options
    )
  }

  /**
   * 获取用户行为统计
   *
   * @param {number} userId - 用户ID
   * @param {Object} [dateRange] - 时间范围
   * @returns {Promise<Object>} 统计数据
   */
  UserBehaviorTrack.getUserStats = async function (userId, dateRange = {}) {
    const { Op } = sequelize.Sequelize
    const where = { user_id: userId }

    if (dateRange.start_time && dateRange.end_time) {
      where.behavior_time = {
        [Op.between]: [dateRange.start_time, dateRange.end_time]
      }
    }

    const stats = await UserBehaviorTrack.findAll({
      where,
      attributes: [
        'behavior_type',
        [sequelize.fn('COUNT', sequelize.col('user_behavior_track_id')), 'count']
      ],
      group: ['behavior_type'],
      raw: true
    })

    // 转换为对象格式
    const result = {}
    stats.forEach(stat => {
      result[stat.behavior_type] = parseInt(stat.count, 10)
    })

    return result
  }

  // 导出常量
  UserBehaviorTrack.BEHAVIOR_TYPES = BEHAVIOR_TYPES
  UserBehaviorTrack.BEHAVIOR_ACTIONS = BEHAVIOR_ACTIONS
  UserBehaviorTrack.BEHAVIOR_RESULTS = BEHAVIOR_RESULTS

  return UserBehaviorTrack
}
