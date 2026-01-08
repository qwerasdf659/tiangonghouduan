#!/usr/bin/env node
/**
 * 路由冲突修复方案符合性检查脚本
 *
 * 功能：
 * 1. 连接真实数据库检查用户和角色数据
 * 2. 检查代码实现是否符合文档标准
 * 3. 生成符合性报告
 *
 * 使用方法：
 * node scripts/check-route-fix-compliance.js
 */

require('dotenv').config()
const { sequelize } = require('../config/database')
const { QueryTypes } = require('sequelize')

// 检查结果
const complianceReport = {
  timestamp: new Date().toISOString(),
  database: {
    connected: false,
    users: null,
    roles: null,
    userRoles: null,
    specialCases: null
  },
  codeCompliance: {
    routeMounting: null,
    pathNaming: null,
    permissionBoundary: null,
    cacheInvalidation: null,
    dependencyFix: null
  },
  issues: [],
  recommendations: []
}

async function checkDatabase() {
  console.log('🔍 开始检查数据库连接...')

  try {
    await sequelize.authenticate()
    complianceReport.database.connected = true
    console.log('✅ 数据库连接成功')

    // 检查用户总数
    const userCount = await sequelize.query(
      "SELECT COUNT(*) as total FROM users WHERE status = 'active'",
      { type: QueryTypes.SELECT }
    )
    complianceReport.database.users = {
      total: userCount[0].total
    }

    // 检查角色分布
    const roleDistribution = await sequelize.query(
      `
      SELECT 
        r.role_name, 
        r.role_level, 
        COUNT(DISTINCT u.user_id) AS user_count
      FROM users u
      JOIN user_roles ur ON u.user_id = ur.user_id AND ur.is_active = 1
      JOIN roles r ON r.role_id = ur.role_id AND r.is_active = 1
      WHERE u.status = 'active'
      GROUP BY r.role_name, r.role_level
      ORDER BY r.role_level DESC
    `,
      { type: QueryTypes.SELECT }
    )

    complianceReport.database.roles = roleDistribution

    // 检查特殊用户情况
    const usersWithoutRoles = await sequelize.query(
      `
      SELECT COUNT(*) AS count
      FROM users u
      LEFT JOIN user_roles ur ON u.user_id = ur.user_id AND ur.is_active = 1
      LEFT JOIN roles r ON r.role_id = ur.role_id AND r.is_active = 1
      WHERE u.status = 'active' AND r.role_id IS NULL
    `,
      { type: QueryTypes.SELECT }
    )

    const multiRoleUsers = await sequelize.query(
      `
      SELECT COUNT(*) AS count FROM (
        SELECT u.user_id
        FROM users u
        JOIN user_roles ur ON u.user_id = ur.user_id AND ur.is_active = 1
        JOIN roles r ON r.role_id = ur.role_id AND r.is_active = 1
        WHERE u.status = 'active'
        GROUP BY u.user_id
        HAVING COUNT(DISTINCT ur.role_id) > 1
      ) t
    `,
      { type: QueryTypes.SELECT }
    )

    complianceReport.database.specialCases = {
      usersWithoutRoles: usersWithoutRoles[0].count,
      multiRoleUsers: multiRoleUsers[0].count
    }

    console.log('✅ 数据库数据检查完成')
    console.log(`   总用户数: ${complianceReport.database.users.total}`)
    console.log(`   角色分布: ${roleDistribution.length} 种角色`)
    console.log(`   无角色用户: ${usersWithoutRoles[0].count}`)
    console.log(`   多角色用户: ${multiRoleUsers[0].count}`)
  } catch (error) {
    console.error('❌ 数据库检查失败:', error.message)
    complianceReport.issues.push({
      type: 'database',
      severity: 'critical',
      message: `数据库连接失败: ${error.message}`
    })
  }
}

async function checkCodeCompliance() {
  console.log('\n🔍 开始检查代码符合性...')

  const fs = require('fs')
  const path = require('path')

  // 1. 检查路由挂载
  const appJsPath = path.join(__dirname, '../app.js')
  const appJsContent = fs.readFileSync(appJsPath, 'utf8')

  const hasPermissionsMount = appJsContent.includes('/api/v4/permissions')
  const hasAuthMount = appJsContent.includes('/api/v4/auth')

  complianceReport.codeCompliance.routeMounting = {
    permissionsDomain: hasPermissionsMount,
    authDomain: hasAuthMount,
    compliant: hasPermissionsMount && hasAuthMount
  }

  if (!hasPermissionsMount) {
    complianceReport.issues.push({
      type: 'route_mounting',
      severity: 'critical',
      message: '缺少 /api/v4/permissions 域挂载'
    })
  }

  // 2. 检查路径命名
  const permissionsJsPath = path.join(__dirname, '../routes/v4/auth/permissions.js')
  const permissionsJsContent = fs.readFileSync(permissionsJsPath, 'utf8')

  const hasCacheInvalidate = permissionsJsContent.includes('/cache/invalidate')
  const hasOldRefresh = permissionsJsContent.includes("router.post('/refresh'")

  complianceReport.codeCompliance.pathNaming = {
    hasCacheInvalidate,
    hasOldRefresh,
    compliant: hasCacheInvalidate && !hasOldRefresh
  }

  if (!hasCacheInvalidate) {
    complianceReport.issues.push({
      type: 'path_naming',
      severity: 'high',
      message: '权限缓存失效路径未更新为 /cache/invalidate'
    })
  }

  if (hasOldRefresh) {
    complianceReport.issues.push({
      type: 'path_naming',
      severity: 'high',
      message: '仍存在旧的 /refresh 路径（应已移除）'
    })
  }

  // 3. 检查权限边界（ops 限制）
  const hasOpsCheck =
    permissionsJsContent.includes('is_self') &&
    permissionsJsContent.includes('isAdmin') &&
    permissionsJsContent.includes('FORBIDDEN')

  complianceReport.codeCompliance.permissionBoundary = {
    hasOpsCheck,
    compliant: hasOpsCheck
  }

  if (!hasOpsCheck) {
    complianceReport.issues.push({
      type: 'permission_boundary',
      severity: 'high',
      message: '缺少 ops 权限边界检查（ops 只能失效自己缓存）'
    })
  }

  // 4. 检查缓存失效实现
  const middlewareAuthPath = path.join(__dirname, '../middleware/auth.js')
  const middlewareAuthContent = fs.readFileSync(middlewareAuthPath, 'utf8')

  const hasMemoryCacheClear = middlewareAuthContent.includes('memoryCache.delete')
  const hasRedisCacheClear =
    middlewareAuthContent.includes('redisClient.del') ||
    middlewareAuthContent.includes('redisClient.del(')

  complianceReport.codeCompliance.cacheInvalidation = {
    hasMemoryCacheClear,
    hasRedisCacheClear,
    compliant: hasMemoryCacheClear && hasRedisCacheClear
  }

  if (!hasMemoryCacheClear) {
    complianceReport.issues.push({
      type: 'cache_invalidation',
      severity: 'medium',
      message: '缺少内存缓存清除逻辑'
    })
  }

  if (!hasRedisCacheClear) {
    complianceReport.issues.push({
      type: 'cache_invalidation',
      severity: 'medium',
      message: '缺少 Redis 缓存清除逻辑'
    })
  }

  // 5. 检查依赖修复（选项 A）
  const hasTopLevelImport =
    permissionsJsContent.includes('invalidateUserPermissions') &&
    permissionsJsContent.includes("require('../../../middleware/auth')")

  const hasDuplicateRequire =
    permissionsJsContent.includes("require('../../middleware/auth')") ||
    permissionsJsContent.includes('require("../../middleware/auth")')

  complianceReport.codeCompliance.dependencyFix = {
    hasTopLevelImport,
    hasDuplicateRequire,
    compliant: hasTopLevelImport && !hasDuplicateRequire
  }

  if (!hasTopLevelImport) {
    complianceReport.issues.push({
      type: 'dependency_fix',
      severity: 'medium',
      message: '缺少顶部统一引入 invalidateUserPermissions'
    })
  }

  if (hasDuplicateRequire) {
    complianceReport.issues.push({
      type: 'dependency_fix',
      severity: 'low',
      message: '仍存在重复的 require（应使用顶部引入）'
    })
  }

  // 6. 检查 auth/index.js 是否已移除 permissionRoutes
  const authIndexPath = path.join(__dirname, '../routes/v4/auth/index.js')
  const authIndexContent = fs.readFileSync(authIndexPath, 'utf8')

  const hasPermissionRoutesRemoved =
    !authIndexContent.includes("router.use('/', permissionRoutes)") ||
    authIndexContent.includes('// router.use') ||
    authIndexContent.includes('已独立挂载')

  if (!hasPermissionRoutesRemoved) {
    complianceReport.issues.push({
      type: 'route_mounting',
      severity: 'high',
      message: 'auth/index.js 中仍挂载 permissionRoutes（应已移除）'
    })
  }

  console.log('✅ 代码符合性检查完成')
}

function generateReport() {
  console.log('\n' + '='.repeat(60))
  console.log('📊 路由冲突修复方案符合性检查报告')
  console.log('='.repeat(60))

  console.log('\n📅 检查时间:', complianceReport.timestamp)

  // 数据库检查结果
  console.log('\n🗄️ 数据库检查结果:')
  if (complianceReport.database.connected) {
    console.log('   ✅ 数据库连接: 成功')
    console.log(`   📊 总用户数: ${complianceReport.database.users.total}`)
    console.log(`   👥 角色分布:`)
    complianceReport.database.roles.forEach(role => {
      console.log(`      - ${role.role_name} (level ${role.role_level}): ${role.user_count} 人`)
    })
    console.log(`   ⚠️ 无角色用户: ${complianceReport.database.specialCases.usersWithoutRoles}`)
    console.log(`   ⚠️ 多角色用户: ${complianceReport.database.specialCases.multiRoleUsers}`)
  } else {
    console.log('   ❌ 数据库连接: 失败')
  }

  // 代码符合性检查结果
  console.log('\n💻 代码符合性检查结果:')

  const checks = [
    { name: '路由挂载', check: complianceReport.codeCompliance.routeMounting },
    { name: '路径命名', check: complianceReport.codeCompliance.pathNaming },
    { name: '权限边界', check: complianceReport.codeCompliance.permissionBoundary },
    { name: '缓存失效', check: complianceReport.codeCompliance.cacheInvalidation },
    { name: '依赖修复', check: complianceReport.codeCompliance.dependencyFix }
  ]

  checks.forEach(({ name, check }) => {
    if (check && check.compliant !== undefined) {
      const status = check.compliant ? '✅' : '❌'
      console.log(`   ${status} ${name}: ${check.compliant ? '符合' : '不符合'}`)
    }
  })

  // 问题汇总
  if (complianceReport.issues.length > 0) {
    console.log('\n⚠️ 发现的问题:')
    complianceReport.issues.forEach((issue, index) => {
      const severityEmoji =
        {
          critical: '🔴',
          high: '🟠',
          medium: '🟡',
          low: '🔵'
        }[issue.severity] || '⚪'

      console.log(
        `   ${index + 1}. ${severityEmoji} [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.message}`
      )
    })
  } else {
    console.log('\n✅ 未发现问题，代码完全符合文档标准')
  }

  // 建议
  if (complianceReport.database.connected) {
    const { roles, specialCases } = complianceReport.database

    if (specialCases.usersWithoutRoles > 0) {
      complianceReport.recommendations.push({
        type: 'business',
        message: `发现 ${specialCases.usersWithoutRoles} 个无角色用户，建议批量分配角色后测试权限缓存失效功能`
      })
    }

    if (specialCases.multiRoleUsers > 0) {
      complianceReport.recommendations.push({
        type: 'business',
        message: `发现 ${specialCases.multiRoleUsers} 个多角色用户，建议测试多角色用户的权限缓存失效功能`
      })
    }

    const opsUsers = roles.find(r => r.role_name === 'ops')
    if (opsUsers && opsUsers.user_count > 0) {
      complianceReport.recommendations.push({
        type: 'testing',
        message: `发现 ${opsUsers.user_count} 个 ops 用户，建议测试 ops 用户只能失效自己缓存的权限边界`
      })
    }
  }

  if (complianceReport.recommendations.length > 0) {
    console.log('\n💡 建议:')
    complianceReport.recommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. ${rec.message}`)
    })
  }

  console.log('\n' + '='.repeat(60))

  // 返回退出码
  const hasCriticalIssues = complianceReport.issues.some(i => i.severity === 'critical')
  const hasHighIssues = complianceReport.issues.some(i => i.severity === 'high')

  if (hasCriticalIssues) {
    console.log('\n❌ 检查失败：发现严重问题')
    process.exit(1)
  } else if (hasHighIssues) {
    console.log('\n⚠️ 检查警告：发现高优先级问题')
    process.exit(0)
  } else {
    console.log('\n✅ 检查通过：符合文档标准')
    process.exit(0)
  }
}

async function main() {
  try {
    await checkDatabase()
    await checkCodeCompliance()
    generateReport()
  } catch (error) {
    console.error('❌ 检查过程出错:', error)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

main()
