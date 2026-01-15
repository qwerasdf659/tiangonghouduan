/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 用户反馈模型（Feedback）
 *
 * 业务场景：用户反馈与客服支持系统
 *
 * 核心功能：
 * 1. 记录用户提交的反馈信息（技术问题、功能建议、错误报告、投诉、建议等6种分类）
 * 2. 支持管理员分配优先级（high/medium/low）和状态流转（pending→processing→replied→closed）
 * 3. 管理员回复反馈并记录处理人员（admin_id字段关联管理员）
 * 4. 保存敏感信息用于问题追踪（user_ip、device_info、internal_notes）
 * 5. 支持附件上传功能（attachments存储图片URLs）
 * 6. 自动计算预计响应时间（根据优先级：high-4小时内、medium-24小时内、low-72小时内）
 *
 * 业务流程：
 * 1. 用户提交反馈（category+content+attachments）
 * 2. 系统创建反馈记录（status=pending，自动生成feedback_id）
 * 3. 管理员查看反馈列表（按优先级和创建时间排序）
 * 4. 管理员分配优先级并处理（status变为processing）
 * 5. 管理员回复反馈（调用setReply方法，status变为replied）
 * 6. 用户查看回复内容（replied_at显示回复时间）
 * 7. 管理员关闭已解决的反馈（status变为closed）
 *
 * 数据库表名：feedbacks
 * 主键：feedback_id（INTEGER，自增）
 * 外键：user_id（users.user_id）, admin_id（users.user_id）
 *
 * 集成服务：
 * - NotificationService：发送回复通知给用户
 * - BeijingTimeHelper：统一北京时间处理
 *
 * 创建时间：2025年01月28日
 * 最后更新：2025年10月30日
 * 使用模型：Claude Sonnet 4.5
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const Feedback = sequelize.define(
    'Feedback',
    {
      // ========== 基础信息字段 ==========

      // 主键ID（反馈记录的唯一标识符，用于追踪反馈处理流程和关联回复记录）
      feedback_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment:
          '反馈记录唯一标识（自增主键，用于反馈追踪、回复关联、统计分析，业务用途：用户查询反馈状态、管理员处理反馈、审计日志记录）'
      },

      // 用户ID（提交反馈的用户，外键关联users表，用于查询用户反馈历史和发送回复通知）
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment:
          '提交反馈的用户ID（外键关联users表，ON DELETE RESTRICT保护，业务用途：查询用户反馈历史、统计用户反馈频率、发送回复通知、权限验证，业务规则：同一用户可提交多条反馈，每条独立处理）'
      },

      // ========== 反馈内容字段 ==========

      // 反馈分类（6种类型，帮助管理员快速分类处理和统计分析）
      category: {
        type: DataTypes.ENUM('technical', 'feature', 'bug', 'complaint', 'suggestion', 'other'),
        allowNull: false,
        defaultValue: 'other',
        validate: {
          isIn: {
            args: [['technical', 'feature', 'bug', 'complaint', 'suggestion', 'other']],
            msg: '反馈分类必须是：technical, feature, bug, complaint, suggestion, other 之一'
          }
        },
        comment:
          '反馈分类（technical-技术问题, feature-功能建议, bug-错误报告, complaint-投诉, suggestion-建议, other-其他，业务用途：管理员筛选反馈类型、统计反馈分布、分配处理人员，默认值other）'
      },

      // 反馈内容（用户提交的详细反馈信息，核心字段）
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
          notEmpty: {
            msg: '反馈内容不能为空'
          },
          len: {
            args: [1, 5000],
            msg: '反馈内容长度必须在1-5000字符之间'
          }
        },
        comment:
          '反馈内容（用户提交的详细反馈信息，必填字段，业务规则：长度1-5000字符，不能为空，用于管理员了解问题详情和提供针对性回复，支持富文本内容）'
      },

      // 附件信息（用户上传的图片URLs，帮助管理员更好理解问题）
      attachments: {
        type: DataTypes.JSON,
        allowNull: true,
        comment:
          '附件信息JSON（存储用户上传的图片URLs数组，格式：["https://cdn.example.com/img1.jpg", "https://cdn.example.com/img2.jpg"]，业务用途：问题截图、错误界面、功能演示，可选字段，最多支持5张图片）'
      },

      // ========== 状态管理字段 ==========

      // 处理状态（管理反馈处理的完整生命周期，控制业务流转）
      status: {
        type: DataTypes.ENUM('pending', 'processing', 'replied', 'closed'),
        allowNull: false,
        defaultValue: 'pending',
        validate: {
          isIn: {
            args: [['pending', 'processing', 'replied', 'closed']],
            msg: '处理状态必须是：pending, processing, replied, closed 之一'
          }
        },
        comment:
          '处理状态（pending-待处理【用户刚提交，等待管理员查看】→ processing-处理中【管理员已查看，正在调查处理】→ replied-已回复【管理员已回复，等待用户确认】→ closed-已关闭【问题已解决，流程结束】，业务规则：默认pending，replied后可重新打开为processing，closed为终态）'
      },

      // 优先级（帮助管理员决定处理顺序，影响预计响应时间）
      priority: {
        type: DataTypes.ENUM('high', 'medium', 'low'),
        allowNull: false,
        defaultValue: 'medium',
        validate: {
          isIn: {
            args: [['high', 'medium', 'low']],
            msg: '优先级必须是：high, medium, low 之一'
          }
        },
        comment:
          '优先级（high-高优先级【4小时内响应，系统崩溃/支付问题等】, medium-中优先级【24小时内响应，功能问题/建议等】, low-低优先级【72小时内响应，一般咨询等】，业务规则：默认medium，管理员可调整，影响预计响应时间和处理顺序）'
      },

      // ========== 敏感信息字段（仅管理员可见，用于问题追踪和安全审计）==========

      // 用户IP地址（记录提交反馈时的IP，用于安全审计和问题追踪）
      user_ip: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment:
          '用户IP地址（提交反馈时的客户端IP，IPv4最长15字符，IPv6最长45字符，业务用途：安全审计、恶意反馈识别、地域分析，仅管理员可见，符合数据安全要求）'
      },

      // 设备信息（记录用户设备信息，帮助复现技术问题）
      device_info: {
        type: DataTypes.JSON,
        allowNull: true,
        comment:
          '设备信息JSON（包含：browser浏览器类型, os操作系统, version版本号, screen_resolution屏幕分辨率，格式：{"browser":"Chrome 120","os":"Windows 11","version":"1.0.0"}，业务用途：技术问题复现、兼容性问题分析，仅管理员可见）'
      },

      // 内部备注（管理员内部沟通使用，用户不可见）
      internal_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment:
          '内部备注（管理员内部沟通记录，用户不可见，业务用途：记录处理思路、协调其他部门、标记特殊情况，可选字段，无长度限制，支持多次追加）'
      },

      // ========== 回复信息字段 ==========

      // 处理管理员ID（记录谁回复了这条反馈，用于追责和绩效统计）
      admin_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment:
          '处理管理员ID（外键关联users表，记录回复反馈的管理员，业务用途：审计日志追踪、绩效统计、责任追溯，管理员权限通过UUID角色系统验证，仅在已回复的反馈中有值）'
      },

      // 回复内容（管理员回复给用户的内容，解答用户疑问）
      reply_content: {
        type: DataTypes.TEXT,
        allowNull: true,
        validate: {
          len: {
            args: [0, 3000],
            msg: '回复内容长度不能超过3000字符'
          }
        },
        comment:
          '回复内容（管理员回复给用户的详细内容，可选字段，业务规则：长度0-3000字符，仅在status=replied时有值，通过NotificationService发送给用户，支持富文本格式）'
      },

      // 回复时间（记录管理员回复的时间，用于SLA统计）
      replied_at: {
        type: DataTypes.DATE,
        allowNull: true,
        /**
         * getter方法：将replied_at时间格式化为中文显示格式
         * @returns {string|null} 格式化后的中文时间字符串（如：2025年10月30日 23:15:00），未回复时返回null
         */
        get() {
          const value = this.getDataValue('replied_at')
          return value ? BeijingTimeHelper.formatChinese(value) : null
        },
        comment:
          '回复时间（管理员执行回复操作的北京时间，业务用途：SLA响应时间统计、用户查看回复时间、审计日志记录，仅在已回复时有值，格式化为中文显示：2025年10月30日 23:15:00）'
      },

      // 预计响应时间（根据优先级自动计算，告知用户预期等待时间）
      estimated_response_time: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment:
          '预计响应时间（根据优先级自动计算，格式："4小时内"/"24小时内"/"72小时内"，业务规则：high-4小时内, medium-24小时内, low-72小时内，用于用户预期管理，通过calculateEstimatedResponseTime方法生成）'
      },

      // ========== 时间字段（统一北京时间处理）==========

      // 创建时间（反馈提交时间，用于排序和统计）
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        /**
         * getter方法：将created_at时间格式化为中文显示格式
         * @returns {string} 格式化后的中文时间字符串（如：2025年10月30日 23:15:00）
         */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        },
        comment:
          '创建时间（反馈提交的北京时间，必填字段，业务用途：反馈列表排序、统计分析、SLA计算基准，格式化为中文显示：2025年10月30日 23:15:00）'
      },

      // 更新时间（反馈最后更新时间，自动维护）
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        /**
         * getter方法：将updated_at时间格式化为中文显示格式
         * @returns {string} 格式化后的中文时间字符串（如：2025年10月30日 23:15:00）
         */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('updated_at'))
        },
        comment:
          '更新时间（反馈最后更新的北京时间，Sequelize自动维护，业务用途：追踪反馈状态变更、审计日志、数据同步，每次save操作自动更新，格式化为中文显示）'
      }
    },
    {
      tableName: 'feedbacks',
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      comment: '用户反馈表 - 支持客服反馈功能',

      // ========== 实例方法 ==========
      instanceMethods: {
        /**
         * 检查反馈是否已被回复（用于前端显示和业务逻辑判断）
         *
         * 业务场景：用户查看反馈列表时，区分已回复和未回复的反馈
         *
         * 业务规则：
         * - status必须为'replied'（状态已变更为已回复）
         * - reply_content不能为空（必须有实际回复内容）
         * - replied_at不能为空（必须有回复时间）
         * - 三个条件同时满足才算已回复
         *
         * @returns {boolean} true-已回复（用户可查看回复内容）, false-未回复（等待管理员处理）
         *
         * @example
         * const feedback = await Feedback.findByPk(feedbackId)
         * if (feedback.isReplied()) {
         *   console.log('管理员回复：', feedback.reply_content)
         * } else {
         *   console.log('等待管理员回复中...')
         * }
         */
        isReplied() {
          return this.status === 'replied' && this.reply_content && this.replied_at
        },

        /**
         * 获取反馈状态的中文描述（前端友好显示）
         *
         * 业务场景：前端反馈列表和详情页展示状态
         *
         * @returns {string} 状态中文描述
         * - 'pending' → '待处理'（用户刚提交，等待管理员查看）
         * - 'processing' → '处理中'（管理员正在调查处理）
         * - 'replied' → '已回复'（管理员已回复，用户可查看）
         * - 'closed' → '已关闭'（问题已解决，流程结束）
         * - 其他 → '未知状态'（异常情况）
         *
         * @example
         * const feedback = await Feedback.findByPk(feedbackId)
         * console.log('当前状态：', feedback.getStatusDescription()) // 输出：待处理
         */
        getStatusDescription() {
          const statusMap = {
            pending: '待处理',
            processing: '处理中',
            replied: '已回复',
            closed: '已关闭'
          }
          return statusMap[this.status] || '未知状态'
        },

        /**
         * 获取反馈分类的中文描述（前端友好显示）
         *
         * 业务场景：前端反馈列表和详情页展示分类，帮助用户理解反馈类型
         *
         * @returns {string} 分类中文描述
         * - 'technical' → '技术问题'（登录失败、功能无法使用等）
         * - 'feature' → '功能建议'（希望增加新功能）
         * - 'bug' → '错误报告'（系统错误、数据异常等）
         * - 'complaint' → '投诉'（服务态度、处理速度等）
         * - 'suggestion' → '建议'（改进意见、优化建议等）
         * - 'other' → '其他'（无法归类的反馈）
         * - 其他 → '未知分类'（异常情况）
         *
         * @example
         * const feedback = await Feedback.findByPk(feedbackId)
         * console.log('反馈类型：', feedback.getCategoryDescription()) // 输出：技术问题
         */
        getCategoryDescription() {
          const categoryMap = {
            technical: '技术问题',
            feature: '功能建议',
            bug: '错误报告',
            complaint: '投诉',
            suggestion: '建议',
            other: '其他'
          }
          return categoryMap[this.category] || '未知分类'
        },

        /**
         * 管理员回复反馈（更新回复内容、回复人、回复时间和状态）
         *
         * 业务场景：管理员在后台回复用户反馈
         *
         * 业务流程：
         * 1. 更新reply_content（管理员的回复内容）
         * 2. 记录admin_id（记录回复人员）
         * 3. 设置replied_at（记录回复时间）
         * 4. 更新status为'replied'（标记为已回复）
         * 5. 更新updated_at（自动更新）
         *
         * 业务规则：
         * - 只有pending或processing状态的反馈才能回复
         * - 回复后状态自动变为'replied'
         * - 回复时间使用北京时间
         * - 支持事务操作（与其他操作一起提交）
         *
         * @param {string} content - 回复内容（必填，长度0-3000字符，支持富文本）
         * @param {number} adminId - 管理员ID（必填，用于追踪回复人员）
         * @param {Transaction} transaction - Sequelize事务对象（可选，用于事务控制）
         * @returns {Promise<Feedback>} 更新后的反馈对象
         *
         * @throws {Error} 如果回复内容为空
         * @throws {Error} 如果管理员ID无效
         * @throws {Error} 如果反馈状态不允许回复（如已关闭）
         *
         * @example
         * // 管理员回复用户反馈
         * const feedback = await Feedback.findByPk(feedbackId)
         * await feedback.setReply(
         *   '感谢您的反馈，我们已经修复了这个问题',
         *   adminUserId
         * )
         * console.log('回复成功，用户将收到通知')
         *
         * // 在事务中回复
         * const transaction = await sequelize.transaction()
         * try {
         *   await feedback.setReply('问题已解决', adminId, transaction)
         *   await transaction.commit()
         * } catch (error) {
         *   await transaction.rollback()
         * }
         */
        async setReply(content, adminId, transaction = null) {
          return this.update(
            {
              reply_content: content,
              admin_id: adminId,
              replied_at: BeijingTimeHelper.createBeijingTime(),
              status: 'replied',
              updated_at: BeijingTimeHelper.createBeijingTime()
            },
            { transaction }
          )
        }
      },

      // ========== 类方法（静态方法）==========
      classMethods: {
        /**
         * 生成唯一的反馈ID（基于时间戳+随机数）
         *
         * 业务场景：创建新反馈时自动生成唯一标识符
         *
         * 生成规则：
         * - 前缀：fb（feedback缩写）
         * - 时间戳：精确到毫秒（通过BeijingTimeHelper.generateIdTimestamp生成）
         * - 随机数：6位36进制字符（防止高并发下的ID冲突）
         *
         * @returns {string} 反馈ID，格式：fb_20251030231500123_a1b2c3
         *
         * @example
         * const feedbackId = Feedback.generateFeedbackId()
         * console.log(feedbackId) // fb_20251030231500123_a1b2c3
         */
        generateFeedbackId() {
          const timestamp = BeijingTimeHelper.generateIdTimestamp()
          const random = Math.random().toString(36).substr(2, 6)
          return `fb_${timestamp}_${random}`
        },

        /**
         * 创建新的反馈记录（用户提交反馈的统一入口方法）
         *
         * 业务场景：用户在前端提交反馈表单
         *
         * 业务流程：
         * 1. ✅ P0修复：数据库自动生成feedback_id（自增主键），不再手动赋值
         * 2. 合并用户提交的数据（data参数）
         * 3. 自动填充用户信息（IP和设备信息）
         * 4. 根据优先级计算预计响应时间
         * 5. 设置北京时间为创建时间和更新时间
         *
         * 业务规则：
         * - feedback_id由数据库自动生成（INTEGER，AUTO_INCREMENT，不应手动设置）
         * - user_ip和device_info从userInfo参数自动提取（前端透传）
         * - estimated_response_time根据priority自动计算（high-4小时/medium-24小时/low-72小时）
         * - created_at和updated_at使用北京时间
         *
         * @param {Object} data - 反馈数据对象
         * @param {number} data.user_id - 用户ID（必填）
         * @param {string} data.category - 反馈分类（必填，technical/feature/bug/complaint/suggestion/other）
         * @param {string} data.content - 反馈内容（必填，1-5000字符）
         * @param {Array} data.attachments - 附件URLs数组（可选）
         * @param {string} data.priority - 优先级（可选，默认medium，high/medium/low）
         * @param {Object} userInfo - 用户信息对象（可选）
         * @param {string} userInfo.ip - 用户IP地址（可选，用于安全审计）
         * @param {Object} userInfo.device - 设备信息（可选，用于技术问题复现）
         * @returns {Promise<Feedback>} 创建的反馈对象
         *
         * @throws {Error} 如果user_id为空
         * @throws {Error} 如果category不在允许的枚举值中
         * @throws {Error} 如果content为空或长度超限
         *
         * @example
         * // 用户提交技术问题反馈
         * const feedback = await Feedback.createFeedback(
         *   {
         *     user_id: 10001,
         *     category: 'technical',
         *     content: '登录时一直显示加载中，无法进入系统',
         *     attachments: ['https://cdn.example.com/screenshot.jpg'],
         *     priority: 'high'
         *   },
         *   {
         *     ip: '192.168.1.100',
         *     device: { browser: 'Chrome 120', os: 'Windows 11' }
         *   }
         * )
         * console.log('反馈已提交，ID：', feedback.feedback_id)
         */
        async createFeedback(data, userInfo = {}) {
          /*
           * ✅ P0修复：删除手动生成的feedbackId，让数据库自动生成feedback_id
           * 原因：feedback_id是自增主键（INTEGER AUTO_INCREMENT），数据库会自动分配
           */

          return this.create({
            // ✅ 删除id字段，让数据库自动生成feedback_id（自增主键）
            ...data, // 展开data参数（包含user_id、category、content、priority、attachments等）
            user_ip: userInfo.ip, // 用户IP（VARCHAR(45)，用于安全审计）
            device_info: userInfo.device, // 设备信息（JSON对象，包含{userAgent, platform}）
            estimated_response_time: this.calculateEstimatedResponseTime(data.priority), // 预计响应时间
            created_at: BeijingTimeHelper.createBeijingTime(), // 创建时间（北京时间）
            updated_at: BeijingTimeHelper.createBeijingTime() // 更新时间（北京时间）
          })
        },

        /**
         * 根据优先级计算预计响应时间（SLA标准）
         *
         * 业务场景：用户提交反馈后，告知用户预计多久会收到回复
         *
         * SLA标准：
         * - high（高优先级）：4小时内响应（系统崩溃、支付问题等紧急情况）
         * - medium（中优先级）：24小时内响应（功能问题、一般建议等）
         * - low（低优先级）：72小时内响应（一般咨询、优化建议等）
         * - 默认：72小时内（未知优先级按低优先级处理）
         *
         * @param {string} priority - 优先级（high/medium/low）
         * @returns {string} 预计响应时间描述
         * - 'high' → '4小时内'
         * - 'medium' → '24小时内'
         * - 'low' → '72小时内'
         * - 其他 → '72小时内'（默认值）
         *
         * @example
         * const responseTime = Feedback.calculateEstimatedResponseTime('high')
         * console.log('预计响应时间：', responseTime) // 4小时内
         */
        calculateEstimatedResponseTime(priority) {
          const responseTimeMap = {
            high: '4小时内',
            medium: '24小时内',
            low: '72小时内'
          }
          return responseTimeMap[priority] || '72小时内'
        },

        /**
         * 获取用户的反馈列表（用户端查询自己的反馈历史）
         *
         * 业务场景：用户在前端查看自己提交的反馈记录和回复内容
         *
         * 查询逻辑：
         * - 按user_id过滤（只查询当前用户的反馈）
         * - 支持按status过滤（查看特定状态的反馈，如已回复的）
         * - 按created_at倒序排列（最新的反馈在前）
         * - 支持分页查询（limit和offset参数）
         * - 关联管理员信息（显示回复人员姓名）
         *
         * @param {number} user_id - 用户ID（必填，查询指定用户的反馈）
         * @param {Object} options - 查询选项
         * @param {string} options.status - 状态过滤（可选，pending/processing/replied/closed/'all'，默认查询所有状态）
         * @param {number} options.limit - 每页数量（可选，默认10条）
         * @param {number} options.offset - 跳过数量（可选，默认0，用于分页）
         * @returns {Promise<Array<Feedback>>} 反馈列表数组
         *
         * @example
         * // 查询用户所有反馈（分页）
         * const feedbacks = await Feedback.getUserFeedbacks(10001, {
         *   limit: 10,
         *   offset: 0
         * })
         *
         * // 查询用户已回复的反馈
         * const repliedFeedbacks = await Feedback.getUserFeedbacks(10001, {
         *   status: 'replied',
         *   limit: 20
         * })
         * console.log('用户共有', repliedFeedbacks.length, '条已回复的反馈')
         */
        async getUserFeedbacks(user_id, options = {}) {
          const { status = null, limit = 10, offset = 0 } = options

          const whereClause = { user_id }
          if (status && status !== 'all') {
            whereClause.status = status
          }

          return this.findAll({
            where: whereClause,
            order: [['created_at', 'DESC']],
            limit,
            offset,
            include: [
              {
                model: sequelize.models.User,
                as: 'admin',
                attributes: ['user_id', 'nickname'],
                required: false
              }
            ]
          })
        },

        /**
         * 获取管理员反馈列表（管理端查询所有用户的反馈，支持多维度过滤）
         *
         * 业务场景：管理员在后台查看和处理用户反馈
         *
         * 查询逻辑：
         * - 支持按status、category、priority三个维度过滤
         * - 按优先级降序排列（high优先级的反馈排在前面）
         * - 按创建时间升序排列（早提交的反馈优先处理）
         * - 关联用户和管理员信息（显示提交人和处理人）
         * - 支持分页查询（limit和offset参数）
         *
         * 排序规则说明：
         * - 第一优先级：priority DESC（高优先级优先，确保紧急问题先处理）
         * - 第二优先级：created_at ASC（早提交的优先，先到先得原则）
         *
         * @param {Object} options - 查询选项
         * @param {string} options.status - 状态过滤（可选，pending/processing/replied/closed/'all'）
         * @param {string} options.category - 分类过滤（可选，technical/feature/bug/complaint/suggestion/other/'all'）
         * @param {string} options.priority - 优先级过滤（可选，high/medium/low/'all'）
         * @param {number} options.limit - 每页数量（可选，默认20条）
         * @param {number} options.offset - 跳过数量（可选，默认0，用于分页）
         * @returns {Promise<Array<Feedback>>} 反馈列表数组，包含用户和管理员信息
         *
         * @example
         * // 查询所有待处理的反馈（管理员工作台）
         * const pendingFeedbacks = await Feedback.getAdminFeedbacks({
         *   status: 'pending',
         *   limit: 50
         * })
         * console.log('待处理反馈：', pendingFeedbacks.length, '条')
         *
         * // 查询高优先级的技术问题反馈
         * const urgentTechFeedbacks = await Feedback.getAdminFeedbacks({
         *   category: 'technical',
         *   priority: 'high',
         *   limit: 20
         * })
         *
         * // 查询所有已回复的反馈（统计分析）
         * const repliedFeedbacks = await Feedback.getAdminFeedbacks({
         *   status: 'replied'
         * })
         */
        async getAdminFeedbacks(options = {}) {
          const {
            status = null,
            category = null,
            priority = null,
            limit = 20,
            offset = 0
          } = options

          const whereClause = {}
          if (status && status !== 'all') whereClause.status = status
          if (category && category !== 'all') whereClause.category = category
          if (priority && priority !== 'all') whereClause.priority = priority

          return this.findAll({
            where: whereClause,
            order: [
              ['priority', 'DESC'], // 高优先级优先
              ['created_at', 'ASC'] // 早提交的优先处理
            ],
            limit,
            offset,
            include: [
              {
                model: sequelize.models.User,
                as: 'user',
                attributes: ['user_id', 'nickname', 'mobile']
              },
              {
                model: sequelize.models.User,
                as: 'admin',
                attributes: ['user_id', 'nickname'],
                required: false
              }
            ]
          })
        }
      },

      // 钩子函数
      hooks: {
        /*
         * ✅ P0修复：删除手动生成id的逻辑
         * 原因：feedback_id是自增主键（INTEGER AUTO_INCREMENT），数据库会自动生成
         * 说明：created_at和updated_at在字段定义中已经有defaultValue，这里的设置是额外保障
         */
        beforeCreate: feedback => {
          feedback.created_at = BeijingTimeHelper.createBeijingTime()
          feedback.updated_at = BeijingTimeHelper.createBeijingTime()
          // ✅ 删除id生成逻辑，让数据库自动生成feedback_id（自增主键）
        },
        beforeUpdate: feedback => {
          feedback.updated_at = BeijingTimeHelper.createBeijingTime()
        }
      },

      // 索引
      indexes: [
        {
          name: 'idx_feedbacks_user_status',
          fields: ['user_id', 'status']
        },
        {
          name: 'idx_feedbacks_category_priority',
          fields: ['category', 'priority']
        },
        {
          name: 'idx_feedbacks_status_created',
          fields: ['status', 'created_at']
        },
        {
          name: 'idx_feedbacks_admin_id',
          fields: ['admin_id']
        }
      ]
    }
  )

  // 关联关系
  Feedback.associate = models => {
    // 关联用户
    Feedback.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    })

    // 关联处理管理员（管理员权限通过UUID角色系统验证）
    Feedback.belongsTo(models.User, {
      foreignKey: 'admin_id',
      as: 'admin',
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    })
  }

  return Feedback
}
