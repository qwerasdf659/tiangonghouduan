#!/usr/bin/env node
'use strict'

const fs = require('fs')

const files = [
  'routes/v4/system/notifications.js',
  'routes/v4/system/statistics.js',
  'routes/v4/system/dictionaries.js',
]

for (const file of files) {
  const fullPath = '/home/devbox/project/' + file
  let code = fs.readFileSync(fullPath, 'utf8')
  
  // Fix pattern: ..., async (req, res) => { → ..., asyncHandler(async (req, res) => {
  // And corresponding }) → }))
  // Handle routes with requireRoleLevel(N) which have parens
  
  // Replace all "async (req, res) => {" that are NOT already inside asyncHandler
  code = code.replace(
    /,\s*async\s*\(\s*req\s*,\s*res\s*\)\s*=>\s*\{/g,
    (match, offset) => {
      // Check if this is already inside asyncHandler
      const before = code.substring(Math.max(0, offset - 30), offset)
      if (before.includes('asyncHandler(')) return match
      return match.replace('async (req, res) => {', 'asyncHandler(async (req, res) => {')
    }
  )
  
  // Now fix closings: find each asyncHandler( and ensure proper ))
  // Strategy: find asyncHandler(async and track brace depth to find the closing }
  let result = code
  let searchFrom = 0
  let safety = 0
  
  while (safety++ < 100) {
    const ahIdx = result.indexOf('asyncHandler(async', searchFrom)
    if (ahIdx === -1) break
    
    // Find the opening { of the async function body
    const openBrace = result.indexOf('{', ahIdx + 'asyncHandler(async'.length)
    if (openBrace === -1) { searchFrom = ahIdx + 1; continue }
    
    // Find matching }
    let depth = 0
    let closeBrace = -1
    for (let i = openBrace; i < result.length; i++) {
      if (result[i] === '{') depth++
      if (result[i] === '}') {
        depth--
        if (depth === 0) { closeBrace = i; break }
      }
    }
    if (closeBrace === -1) { searchFrom = ahIdx + 1; continue }
    
    // Check what follows the }
    const afterClose = result.substring(closeBrace + 1)
    const trimmedAfter = afterClose.replace(/^[\s\n]*/, '')
    
    if (trimmedAfter.startsWith('))')) {
      searchFrom = closeBrace + 3
    } else if (trimmedAfter.startsWith(')')) {
      // Has one ), need to check if it's router closing or asyncHandler closing
      // For single-line routes: router.get('...', asyncHandler(async (req, res) => { ... }))
      // The } closes the async fn, first ) closes asyncHandler, second ) closes router.get
      // So we need })  →  }))
      const parenIdx = closeBrace + 1 + afterClose.search(/\S/)
      result = result.substring(0, parenIdx) + ')' + result.substring(parenIdx)
      searchFrom = parenIdx + 2
    } else {
      searchFrom = closeBrace + 1
    }
  }
  
  fs.writeFileSync(fullPath, result)
  console.log(`Fixed: ${file}`)
}

console.log('Done!')
