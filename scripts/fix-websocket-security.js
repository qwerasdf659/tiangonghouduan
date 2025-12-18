/**
 * 餐厅积分抽奖系统 V4.0 - WebSocket安全修复脚本
 *
 * 修复内容：
 * 1. WebSocket CORS白名单（禁止origin: '*'）
 * 2. WebSocket握手JWT鉴权
 * 3. 禁止客户端决定user_type身份
 *
 * 创建时间：2025年12月18日
 */

'use strict'

const fs = require('fs').promises
const path = require('path')

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

async function fixWebSocketSecurity() {
  log('\n=== WebSocket安全修复 ===', 'blue')

  const wsServicePath = path.join(__dirname, '../services/ChatWebSocketService.js')
  let content = await fs.readFile(wsServicePath, 'utf8')

  // 备份原文件
  const backupPath = wsServicePath + '.backup'
  await fs.writeFile(backupPath, content, 'utf8')
  log('✅ 已备份原文件到 ChatWebSocketService.js.backup', 'green')

  // 1. 修复CORS配置（添加白名单）
  const oldCorsPattern = /cors: \{[\s\S]*?origin: '\*',[\s\S]*?\}/
  const newCors = `cors: {
        origin: (origin, callback) => {
          // CORS白名单配置（P0安全修复）
          const allowedOrigins = process.env.ALLOWED_ORIGINS
            ? process.env.ALLOWED_ORIGINS.split(',')
            : ['http://localhost:3000', 'http://localhost:8080']
          
          // 微信小程序场景：无origin或servicewechat.com
          if (!origin || origin.includes('servicewechat.com') || origin.includes('weixin.qq.com')) {
            return callback(null, true)
          }
          
          // 白名单检查
          if (allowedOrigins.includes(origin)) {
            return callback(null, true)
          }
          
          wsLogger.warn('WebSocket连接被CORS拒绝', { origin })
          callback(new Error('Not allowed by CORS'))
        },
        methods: ['GET', 'POST'],
        credentials: true
      }`

  if (content.match(oldCorsPattern)) {
    content = content.replace(oldCorsPattern, newCors)
    log('✅ CORS白名单已配置', 'green')
  } else {
    log('⚠️ 未找到CORS配置模式', 'yellow')
  }

  // 2. 添加握手JWT鉴权（在记录服务启动之后、设置连接监听之前）
  const jwtAuthCode = `
    // 🔐 强制握手JWT鉴权（P0安全修复）
    const jwt = require('jsonwebtoken')
    this.io.use((socket, next) => {
      const token = socket.handshake.auth?.token
      
      if (!token) {
        wsLogger.warn('WebSocket握手失败：缺少token', {
          socket_id: socket.id,
          ip: socket.handshake.address
        })
        return next(new Error('Authentication required: missing token'))
      }
      
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        socket.user = decoded // 将用户信息挂载到socket
        
        wsLogger.info('WebSocket握手鉴权成功', {
          user_id: decoded.user_id,
          role: decoded.role || decoded.is_admin,
          socket_id: socket.id
        })
        
        next()
      } catch (error) {
        wsLogger.warn('WebSocket握手失败：token无效', {
          error: error.message,
          socket_id: socket.id
        })
        next(new Error('Authentication failed: invalid token'))
      }
    })
`

  // 在服务启动记录之后添加JWT鉴权
  const insertPos = content.indexOf('// 设置连接事件监听')
  if (insertPos !== -1) {
    content = content.slice(0, insertPos) + jwtAuthCode + '\n    ' + content.slice(insertPos)
    log('✅ JWT握手鉴权已添加', 'green')
  } else {
    log('⚠️ 未找到插入JWT鉴权的位置', 'yellow')
  }

  // 3. 修复connection事件：自动从JWT读取身份
  const oldConnectionPattern = /\/\/ 设置连接事件监听\s*this\.io\.on\('connection', socket => \{/
  const newConnection = `// 设置连接事件监听（已通过JWT鉴权）
    this.io.on('connection', socket => {
      // 🔐 从JWT自动注册用户身份（P0安全修复）
      const userId = socket.user.user_id
      const isAdmin = socket.user.role === 'admin' || socket.user.is_admin === true
      
      if (isAdmin) {
        this.connectedAdmins.set(userId, socket.id)
        wsLogger.info('管理员已连接', { user_id: userId, socket_id: socket.id })
      } else {
        this.connectedUsers.set(userId, socket.id)
        wsLogger.info('用户已连接', { user_id: userId, socket_id: socket.id })
      }
`

  if (content.match(oldConnectionPattern)) {
    content = content.replace(oldConnectionPattern, newConnection)
    log('✅ connection事件已修复（自动从JWT读取身份）', 'green')
  }

  // 4. 修复或删除register_user事件（降级为能力声明）
  const registerUserPattern = /socket\.on\('register_user', (?:async )?(?:data|\(\) =>|\{)/
  if (content.match(registerUserPattern)) {
    // 查找register_user事件处理器的完整代码块
    const registerUserStart = content.search(registerUserPattern)
    if (registerUserStart !== -1) {
      // 找到匹配的右括号
      let braceCount = 0
      let inHandler = false
      let endPos = registerUserStart

      for (let i = registerUserStart; i < content.length; i++) {
        const char = content[i]
        if (char === '{') {
          braceCount++
          inHandler = true
        } else if (char === '}') {
          braceCount--
          if (inHandler && braceCount === 0) {
            endPos = i + 1
            break
          }
        }
      }

      // 查找完整的socket.on语句（包括前面的换行）
      let fullStart = registerUserStart
      while (fullStart > 0 && content[fullStart - 1] !== '\n') {
        fullStart--
      }

      // 查找结束位置的换行
      while (endPos < content.length && content[endPos] === '\n') {
        endPos++
      }

      const newRegisterUser = `
      // ⚠️ register_user已降级为能力声明（不可决定身份）
      socket.on('register_user', data => {
        // ❌ 禁止：决定身份、写入 connectedAdmins/connectedUsers
        // ✅ 允许：声明订阅偏好、加入房间等
        const { preferences, rooms } = data
        
        if (preferences) {
          socket.preferences = preferences
        }
        
        if (rooms) {
          rooms.forEach(room => socket.join(room))
        }
        
        wsLogger.info('用户订阅偏好已更新', {
          user_id: socket.user.user_id,
          preferences,
          rooms
        })
      })
`

      content = content.slice(0, fullStart) + newRegisterUser + content.slice(endPos)
      log('✅ register_user事件已降级（不可决定身份）', 'green')
    }
  }

  // 保存修改后的文件
  await fs.writeFile(wsServicePath, content, 'utf8')
  log('✅ ChatWebSocketService.js已更新', 'green')
}

async function main() {
  log('开始WebSocket安全修复...', 'blue')

  try {
    await fixWebSocketSecurity()

    log('\n=== 修复完成 ===', 'green')
    log('✅ WebSocket安全已修复', 'green')
    log('\n⚠️ 注意事项：', 'yellow')
    log('1. 需要在.env中配置ALLOWED_ORIGINS环境变量', 'yellow')
    log('2. 前端需要修改连接方式：io(url, { auth: { token: jwt } })', 'yellow')
    log('3. 修复完成后需要重启服务：npm run pm:restart', 'yellow')
  } catch (error) {
    log(`\n❌ 修复过程出错: ${error.message}`, 'red')
    console.error(error)
    process.exit(1)
  }
}

main()
