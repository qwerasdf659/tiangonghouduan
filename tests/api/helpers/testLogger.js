/**
 * 统一测试日志器
 * 为所有测试模块提供一致的日志记录功能
 */

const winston = require('winston')
const path = require('path')

// 创建统一的测试日志器
const testLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `[${timestamp}] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(__dirname, '../../../logs/test.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
})

module.exports = testLogger
