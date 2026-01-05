const logger = require('../utils/logger').logger

/**
 * 层级权限管理服务（简化版） - 餐厅积分抽奖系统 V4.0 统一引擎架构
 * 业务场景：管理区域负责人→业务经理→业务员三级层级关系和权限操作
 * 创建时间：2025年11月07日
 * 设计理念：简单实用，避免过度设计
 *
 * 核心功能：
 * 1. 建立上下级关系（如：业务经理添加业务员）
 * 2. 批量停用下级权限（如：业务经理离职时停用其所有下级业务员）
 * 3. 查询所有下级用户（如：区域负责人查看所有业务经理和业务员）
 * 4. 权限变更日志记录（审计追踪）
 * 5. 门店分配管理（业务员分配到门店）
 *
 * 简化内容：
 * - 移除 hierarchy_path 和 hierarchy_level 计算（直接使用递归查询）
 * - 移除 Redis 缓存（项目已有auth缓存，无需重复）
 * - 移除分页查询（小数据量一次性查询即可）
 *
 * 业务规则：
 * - 区域负责人（role_level=80）可以管理业务经理和业务员
 * - 业务经理（role_level=60）可以管理业务员
 * - 业务员（role_level=40）无下级管理权限
 * - 权限停用会级联影响所有下级（需要明确传入参数）
 * - 所有操作记录到role_change_logs表
 */

const { User, Role, UserRole, UserHierarchy, RoleChangeLog } = require('../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')
const { PermissionManager } = require('../middleware/auth')

/**
 * 层级权限管理服务类
 * @class HierarchyManagementService
 */
class HierarchyManagementService {
  /**
   * 🏗️ 建立用户层级关系（简化版）
   * 业务场景：
   * - 业务经理添加业务员，指定其负责的门店
   * - 区域负责人添加业务经理
   *
   * @param {number} user_id - 用户ID（要建立层级关系的用户）
   * @param {number} superior_user_id - 上级用户ID（NULL表示顶级区域负责人）
   * @param {number} role_id - 角色ID（关联roles表）
   * @param {number} store_id - 门店ID（可选，仅业务员需要）
   * @returns {Promise<Object>} { success, hierarchy, message }
   *
   * 示例：业务经理（user_id=10）添加业务员（user_id=20）到门店（store_id=5）
   * await createHierarchy(20, 10, role_id, 5)
   */
  static async createHierarchy (user_id, superior_user_id, role_id, store_id = null) {
    try {
      // 1. 验证用户和角色存在
      const user = await User.findByPk(user_id)
      if (!user) {
        throw new Error(`用户不存在: user_id=${user_id}`)
      }

      const role = await Role.findByPk(role_id)
      if (!role) {
        throw new Error(`角色不存在: role_id=${role_id}`)
      }

      // 2. 验证上级用户存在（如果有上级）
      if (superior_user_id) {
        const superior = await User.findByPk(superior_user_id)
        if (!superior) {
          throw new Error(`上级用户不存在: superior_user_id=${superior_user_id}`)
        }
      }

      // 3. 创建层级关系记录（简化版：不计算 hierarchy_path 和 hierarchy_level）
      const hierarchy = await UserHierarchy.create({
        user_id,
        superior_user_id,
        role_id,
        store_id,
        is_active: true,
        activated_at: BeijingTimeHelper.createDatabaseTime()
      })

      logger.info(
        `✅ 创建层级关系成功: 用户${user_id} → 上级${superior_user_id}, 角色级别${role.role_level}`
      )

      // 4. 🔄 清除新用户的权限缓存（确保权限立即生效）
      await PermissionManager.invalidateUser(user_id, 'hierarchy_create')
      logger.info(`✅ 已清除用户${user_id}的权限缓存`)

      return {
        success: true,
        hierarchy,
        message: '层级关系创建成功'
      }
    } catch (error) {
      logger.error('❌ 创建层级关系失败:', error.message)
      throw error
    }
  }

  /**
   * 🔍 查询用户的所有下级（简单递归查询，带循环检测和深度限制）
   * 业务场景：
   * - 区域负责人查看所有业务经理和业务员
   * - 业务经理查看所有业务员
   * - 业务经理离职时，需要查询其所有下级用户进行批量停用
   *
   * @param {number} user_id - 用户ID
   * @param {boolean} include_inactive - 是否包含已停用的下级（默认false，仅返回激活的）
   * @param {number} maxDepth - 最大递归深度（默认10层，防止无限递归）
   * @param {Set} visited - 已访问节点集合（用于循环检测，内部参数）
   * @returns {Promise<Array>} 所有下级用户列表
   *
   * 示例：查询业务经理（user_id=10）的所有下级业务员
   * const subordinates = await getAllSubordinates(10, false)
   *
   * 安全增强：添加循环检测和深度限制，防止数据异常导致无限递归
   */
  static async getAllSubordinates (
    user_id,
    include_inactive = false,
    maxDepth = 10,
    visited = new Set()
  ) {
    try {
      const allSubordinates = []

      // 递归辅助函数：查询某个用户的所有下级
      const findSubordinates = async (currentUserId, currentVisited) => {
        // 🛡️ 循环检测：防止无限递归
        if (currentVisited.has(currentUserId)) {
          logger.warn(`⚠️ 检测到循环引用: user_id=${currentUserId}`)
          return
        }

        // 🛡️ 深度限制：防止过深的递归
        if (currentVisited.size >= maxDepth) {
          logger.warn(`⚠️ 达到最大递归深度: ${maxDepth}层`)
          return
        }

        currentVisited.add(currentUserId)
        // 1. 查询当前用户的直接下级
        const whereCondition = {
          superior_user_id: currentUserId
        }

        // 是否包含已停用的下级
        if (!include_inactive) {
          whereCondition.is_active = true
        }

        const directSubordinates = await UserHierarchy.findAll({
          where: whereCondition,
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['user_id', 'mobile', 'nickname', 'status'],
              comment: '用户基本信息'
            },
            {
              model: Role,
              as: 'role',
              attributes: ['role_id', 'role_name', 'role_level'],
              comment: '角色信息'
            }
          ]
        })

        // 2. 将直接下级添加到结果数组
        allSubordinates.push(...directSubordinates)

        // 3. 递归查询每个直接下级的下级（深度优先遍历）
        // eslint-disable-next-line no-await-in-loop
        for (const subordinate of directSubordinates) {
          await findSubordinates(subordinate.user_id, new Set(currentVisited))
        }
      }

      // 从指定用户开始递归查询
      const initialVisited = new Set(visited)
      await findSubordinates(user_id, initialVisited)

      logger.info(
        `✅ 查询到用户${user_id}的${allSubordinates.length}个下级（包含已停用: ${include_inactive}）`
      )

      return allSubordinates
    } catch (error) {
      logger.error('❌ 查询下级失败:', error.message)
      throw error
    }
  }

  /**
   * 🚫 批量停用用户权限（可选择是否包括所有下级）
   * 业务场景：
   * - 业务经理离职：可选择停用其本人及所有下级业务员的权限
   * - 业务员离职：仅停用其本人权限
   * - 临时禁用：如业务员违规，业务经理可临时停用其权限
   *
   * ⚠️ 安全设计：默认仅停用目标用户本人，需要批量停用所有下级时必须明确传入true
   *
   * @param {number} target_user_id - 目标用户ID（被停用的用户）
   * @param {number} operator_user_id - 操作人ID（执行停用的用户）
   * @param {string} reason - 停用原因（如：离职、违规、调动等）
   * @param {boolean} include_subordinates - 是否同时停用所有下级（默认false，需要主动选择）
   * @returns {Promise<Object>} { success, deactivated_count, deactivated_users, message }
   *
   * 示例1：仅停用业务员权限（默认行为）
   * await batchDeactivatePermissions(20, 10, '业务员违规')
   *
   * 示例2：业务经理离职，停用其本人及所有下级业务员（需要明确传入true）
   * await batchDeactivatePermissions(10, 1, '业务经理离职', true)
   */
  static async batchDeactivatePermissions (
    target_user_id,
    operator_user_id,
    reason,
    include_subordinates = false
  ) {
    const transaction = await UserHierarchy.sequelize.transaction()

    try {
      // 1. 验证操作权限（操作人必须是目标用户的上级，且角色级别更高）
      const canOperate = await this.canManageUser(operator_user_id, target_user_id)
      if (!canOperate) {
        throw new Error(`无权限操作该用户: operator=${operator_user_id}, target=${target_user_id}`)
      }

      // 2. 获取要停用的用户列表
      let usersToDeactivate = [target_user_id]

      if (include_subordinates) {
        const subordinates = await this.getAllSubordinates(target_user_id, false)
        usersToDeactivate = [target_user_id, ...subordinates.map(sub => sub.user_id)]
      }

      logger.info(
        `🚫 准备停用${usersToDeactivate.length}个用户的权限（目标用户: ${target_user_id}，包含下级: ${include_subordinates}）`
      )

      // 3. 批量停用层级关系（设置is_active=false，记录停用时间、操作人、原因）
      await UserHierarchy.update(
        {
          is_active: false,
          deactivated_at: BeijingTimeHelper.createDatabaseTime(),
          deactivated_by: operator_user_id,
          deactivation_reason: reason
        },
        {
          where: {
            user_id: { [Op.in]: usersToDeactivate },
            is_active: true
          },
          transaction
        }
      )

      // 4. 批量停用用户角色关联（同步更新user_roles表）
      await UserRole.update(
        {
          is_active: false
        },
        {
          where: {
            user_id: { [Op.in]: usersToDeactivate },
            is_active: true
          },
          transaction
        }
      )

      // 5. 记录操作日志（用于审计追踪）
      await RoleChangeLog.create(
        {
          target_user_id,
          operator_user_id,
          operation_type: include_subordinates ? 'batch_deactivate' : 'deactivate',
          affected_count: usersToDeactivate.length,
          reason
        },
        { transaction }
      )

      // 6. 🔄 清除受影响用户的权限缓存（在事务提交前执行，确保数据一致性）
      await PermissionManager.invalidateMultipleUsers(usersToDeactivate, 'hierarchy_deactivate')

      // 7. 提交事务（缓存失效成功后才提交，保证数据一致性）
      await transaction.commit()

      logger.info(`✅ 成功停用${usersToDeactivate.length}个用户的权限，并清除缓存`)

      return {
        success: true,
        deactivated_count: usersToDeactivate.length,
        deactivated_users: usersToDeactivate,
        message: `成功停用${usersToDeactivate.length}个用户的权限`
      }
    } catch (error) {
      await transaction.rollback()
      logger.error('❌ 批量停用权限失败:', error.message)
      throw error
    }
  }

  /**
   * ✅ 批量激活用户权限
   * 业务场景：
   * - 业务员调动回归：重新激活其权限
   * - 临时禁用解除：恢复业务员权限
   *
   * @param {number} target_user_id - 目标用户ID
   * @param {number} operator_user_id - 操作人ID
   * @param {boolean} include_subordinates - 是否同时激活所有下级（默认false）
   * @returns {Promise<Object>} { success, activated_count, activated_users, message }
   */
  static async batchActivatePermissions (
    target_user_id,
    operator_user_id,
    include_subordinates = false
  ) {
    const transaction = await UserHierarchy.sequelize.transaction()

    try {
      // 1. 验证操作权限
      const canOperate = await this.canManageUser(operator_user_id, target_user_id)
      if (!canOperate) {
        throw new Error('无权限操作该用户')
      }

      // 2. 获取要激活的用户列表
      let usersToActivate = [target_user_id]

      if (include_subordinates) {
        const subordinates = await this.getAllSubordinates(target_user_id, true)
        usersToActivate = [target_user_id, ...subordinates.map(sub => sub.user_id)]
      }

      logger.info(`✅ 准备激活${usersToActivate.length}个用户的权限`)

      // 3. 批量激活层级关系（恢复is_active=true，清除停用记录）
      await UserHierarchy.update(
        {
          is_active: true,
          activated_at: BeijingTimeHelper.createDatabaseTime(),
          deactivated_at: null,
          deactivated_by: null,
          deactivation_reason: null
        },
        {
          where: {
            user_id: { [Op.in]: usersToActivate }
          },
          transaction
        }
      )

      // 4. 批量激活用户角色关联
      await UserRole.update(
        {
          is_active: true
        },
        {
          where: {
            user_id: { [Op.in]: usersToActivate }
          },
          transaction
        }
      )

      // 5. 记录操作日志
      await RoleChangeLog.create(
        {
          target_user_id,
          operator_user_id,
          operation_type: 'activate',
          affected_count: usersToActivate.length,
          reason: '批量激活权限'
        },
        { transaction }
      )

      // 6. 🔄 清除受影响用户的权限缓存（在事务提交前执行，确保数据一致性）
      await PermissionManager.invalidateMultipleUsers(usersToActivate, 'hierarchy_activate')

      // 7. 提交事务（缓存失效成功后才提交，保证数据一致性）
      await transaction.commit()

      logger.info(`✅ 成功激活${usersToActivate.length}个用户的权限，并清除缓存`)

      return {
        success: true,
        activated_count: usersToActivate.length,
        activated_users: usersToActivate,
        message: `成功激活${usersToActivate.length}个用户的权限`
      }
    } catch (error) {
      await transaction.rollback()
      logger.error('❌ 批量激活权限失败:', error.message)
      throw error
    }
  }

  /**
   * 🔐 检查操作人是否可以管理目标用户（简化版）
   * 业务规则：
   * - 操作人的角色级别必须高于目标用户（如业务经理role_level=60 > 业务员role_level=40）
   * - 目标用户必须是操作人的下级（通过递归查询验证）
   *
   * @param {number} operator_user_id - 操作人ID
   * @param {number} target_user_id - 目标用户ID
   * @returns {Promise<boolean>} true表示有权限，false表示无权限
   *
   * 简化说明：使用简单的递归查询判断上下级关系，不依赖 hierarchy_path
   */
  static async canManageUser (operator_user_id, target_user_id) {
    try {
      // 1. 获取操作人的角色级别
      const operatorHierarchy = await UserHierarchy.findOne({
        where: { user_id: operator_user_id, is_active: true },
        include: [
          {
            model: Role,
            as: 'role',
            attributes: ['role_level']
          }
        ]
      })

      if (!operatorHierarchy) {
        return false
      }

      // 2. 获取目标用户的层级信息
      const targetHierarchy = await UserHierarchy.findOne({
        where: { user_id: target_user_id },
        include: [
          {
            model: Role,
            as: 'role',
            attributes: ['role_level']
          }
        ]
      })

      if (!targetHierarchy) {
        return false
      }

      // 3. 判断权限：操作人角色级别必须高于目标用户
      const isHigherLevel = operatorHierarchy.role.role_level > targetHierarchy.role.role_level
      if (!isHigherLevel) {
        return false
      }

      // 4. 判断目标用户是否是操作人的下级（简单递归查询）
      const allSubordinates = await this.getAllSubordinates(operator_user_id, false)
      const isSubordinate = allSubordinates.some(sub => sub.user_id === target_user_id)

      return isSubordinate
    } catch (error) {
      logger.error('❌ 权限检查失败:', error.message)
      return false
    }
  }

  /**
   * 📊 获取用户的层级统计信息（简化版）
   * 业务场景：
   * - 区域负责人查看其管理的业务经理和业务员数量
   * - 业务经理查看其管理的业务员数量
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object>} { total_subordinates, direct_subordinates, stats_by_role }
   *
   * 简化说明：按角色类型统计，而不是按层级深度统计（更直观）
   */
  static async getHierarchyStats (user_id) {
    try {
      // 1. 获取所有下级
      const allSubordinates = await this.getAllSubordinates(user_id, false)

      // 2. 获取直接下级（一级下属）
      const directSubordinates = await UserHierarchy.findAll({
        where: {
          superior_user_id: user_id,
          is_active: true
        },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['user_id', 'mobile', 'nickname']
          },
          {
            model: Role,
            as: 'role',
            attributes: ['role_id', 'role_name', 'role_level']
          }
        ]
      })

      // 3. 按角色类型分组统计（更直观）
      const statsByRole = {}
      allSubordinates.forEach(sub => {
        const roleName = sub.role.role_name
        if (!statsByRole[roleName]) {
          statsByRole[roleName] = {
            count: 0,
            users: []
          }
        }
        statsByRole[roleName].count++
        statsByRole[roleName].users.push({
          user_id: sub.user_id,
          mobile: sub.user.mobile,
          nickname: sub.user.nickname,
          role_name: sub.role.role_name
        })
      })

      return {
        total_subordinates: allSubordinates.length,
        direct_subordinates: directSubordinates.length,
        stats_by_role: statsByRole
      }
    } catch (error) {
      logger.error('❌ 获取层级统计失败:', error.message)
      throw error
    }
  }
}

module.exports = HierarchyManagementService
