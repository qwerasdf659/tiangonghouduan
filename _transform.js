#!/usr/bin/env node
'use strict'

const fs = require('fs')

const files = [
  'routes/v4/shop/risk/index.js',
  'routes/v4/shop/staff/index.js',
  'routes/v4/system/ad-delivery.js',
  'routes/v4/system/ad-events.js',
  'routes/v4/system/chat.js',
  'routes/v4/system/config.js',
  'routes/v4/system/dictionaries.js',
  'routes/v4/system/feedback.js',
  'routes/v4/system/notifications.js',
  'routes/v4/system/statistics.js',
  'routes/v4/system/status.js',
  'routes/v4/system/user-stats.js',
  'routes/v4/user/ad-campaigns.js',
  'routes/v4/user/ad-slots.js',
  'routes/v4/user/consumption-qrcode.js',
  'routes/v4/user/index.js',
  'routes/v4/user/notifications.js',
]

function findMatchingBrace(code, startIdx) {
  let depth = 0
  for (let i = startIdx; i < code.length; i++) {
    if (code[i] === '{') depth++
    if (code[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function removeTryCatch(code) {
  let result = code
  let safety = 0
  
  while (safety++ < 50) {
    // Find a try { that's inside a route handler
    const tryMatch = result.match(/^(\s*)try\s*\{/m)
    if (!tryMatch) break
    
    const tryIdx = result.indexOf(tryMatch[0])
    const tryIndent = tryMatch[1]
    const tryBraceStart = tryIdx + tryMatch[0].length - 1
    
    // Find matching } for try
    const tryBraceEnd = findMatchingBrace(result, tryBraceStart)
    if (tryBraceEnd === -1) break
    
    // Check if followed by catch
    const afterTry = result.substring(tryBraceEnd + 1)
    const catchMatch = afterTry.match(/^\s*catch\s*\([^)]*\)\s*\{/)
    if (!catchMatch) break
    
    const catchStart = tryBraceEnd + 1 + afterTry.indexOf(catchMatch[0])
    const catchBraceStart = catchStart + catchMatch[0].length - 1
    const catchBraceEnd = findMatchingBrace(result, catchBraceStart)
    if (catchBraceEnd === -1) break
    
    // Extract try body (between try { and })
    const tryBody = result.substring(tryBraceStart + 1, tryBraceEnd)
    
    // Dedent try body by one level (2 spaces)
    const dedentedBody = tryBody.split('\n').map(line => {
      if (line.startsWith(tryIndent + '  ')) {
        return line.substring(2)
      }
      return line
    }).join('\n')
    
    // Replace entire try/catch with dedented try body
    result = result.substring(0, tryIdx) + dedentedBody + result.substring(catchBraceEnd + 1)
  }
  
  return result
}

function wrapAsyncHandlers(code) {
  // Pattern: router.METHOD('path', ...middleware, async (req, res) => {
  // Need to wrap with asyncHandler( ... )
  // Also handle: async (req, res) => { on its own line (multi-line router.get)
  
  let result = code
  
  // Pattern 1: Single-line route definition
  // router.get('/path', middleware, async (req, res) => {
  result = result.replace(
    /(router\.\w+\([^)]*,\s*)async\s*\(\s*req\s*,\s*res\s*\)\s*=>\s*\{/g,
    (match, prefix) => {
      if (match.includes('asyncHandler')) return match
      return `${prefix}asyncHandler(async (req, res) => {`
    }
  )
  
  // Pattern 2: Multi-line route, async handler on separate line
  // router.get(\n  '/path',\n  middleware,\n  async (req, res) => {
  result = result.replace(
    /^(\s*)async\s*\(\s*req\s*,\s*res\s*\)\s*=>\s*\{/gm,
    (match, indent) => {
      // Check if this is already inside asyncHandler
      const lineStart = result.lastIndexOf('\n', result.indexOf(match)) + 1
      const prevLines = result.substring(Math.max(0, lineStart - 200), lineStart)
      if (prevLines.includes('asyncHandler(')) return match
      return `${indent}asyncHandler(async (req, res) => {`
    }
  )
  
  return result
}

function fixClosingParens(code) {
  // After wrapping with asyncHandler, we need to add extra ) at the end
  // Pattern: find }) that closes the async handler and add extra )
  // This is tricky - we need to find asyncHandler( and match its closing
  
  let result = code
  let searchFrom = 0
  let safety = 0
  
  while (safety++ < 100) {
    const ahIdx = result.indexOf('asyncHandler(async', searchFrom)
    if (ahIdx === -1) break
    
    // Find the opening { of the async function
    const braceStart = result.indexOf('{', ahIdx)
    if (braceStart === -1) break
    
    // Find matching }
    const braceEnd = findMatchingBrace(result, braceStart)
    if (braceEnd === -1) break
    
    // After the }, check if there's already ))
    const afterBrace = result.substring(braceEnd + 1, braceEnd + 5)
    if (afterBrace.startsWith('))')) {
      // Already has double closing
      searchFrom = braceEnd + 3
      continue
    }
    
    if (afterBrace.startsWith(')')) {
      // Has single ) - this is the router.method() closing, need to check
      // Actually for asyncHandler(async (req, res) => { ... }) we need })
      // The ) closes asyncHandler, then ) closes router.method
      // So after } we need ))
      // But if it's }) already, we need }))
      searchFrom = braceEnd + 2
      continue
    }
    
    // After }, there should be ) to close asyncHandler
    // Check what's there
    const restAfterBrace = result.substring(braceEnd + 1).trimStart()
    if (restAfterBrace.startsWith('\n') || restAfterBrace.startsWith('\r')) {
      // The } is on its own line, next line might have )
      searchFrom = braceEnd + 1
      continue
    }
    
    searchFrom = braceEnd + 1
  }
  
  return result
}

function updateImports(code, filePath) {
  const depth = filePath.split('/').length - 2 // routes/v4/... 
  // Determine relative path to middleware
  let relPath
  if (filePath.includes('routes/v4/shop/')) {
    relPath = '../../../../middleware/validation'
  } else if (filePath.includes('routes/v4/system/') || filePath.includes('routes/v4/user/')) {
    relPath = '../../../middleware/validation'
  }
  
  if (!relPath) return code
  
  let result = code
  
  // If asyncHandler already imported, just remove handleServiceError
  if (result.includes('asyncHandler')) {
    // Remove handleServiceError from the same import
    result = result.replace(/,\s*handleServiceError\b/g, '')
    result = result.replace(/handleServiceError\s*,\s*/g, '')
    return result
  }
  
  // Need to add asyncHandler, replace handleServiceError
  const escapedPath = relPath.replace(/\//g, '\\/')
  const importRegex = new RegExp(
    `const\\s*\\{([^}]*)\\}\\s*=\\s*require\\(['"]${escapedPath}['"]\\)`
  )
  
  const match = result.match(importRegex)
  if (match) {
    const imports = match[1].split(',').map(s => s.trim()).filter(s => s)
    const newImports = imports.filter(s => s !== 'handleServiceError')
    newImports.push('asyncHandler')
    result = result.replace(match[0], `const { ${newImports.join(', ')} } = require('${relPath}')`)
  } else {
    // No validation import found, add one
    // Find the last require line
    const lastRequire = result.lastIndexOf("require('")
    if (lastRequire !== -1) {
      const lineEnd = result.indexOf('\n', lastRequire)
      result = result.substring(0, lineEnd + 1) + 
        `const { asyncHandler } = require('${relPath}')\n` +
        result.substring(lineEnd + 1)
    }
  }
  
  return result
}

function removeUnusedImports(code) {
  let result = code
  
  // Check if handleServiceError is still used in the code (not just imports)
  const importLine = result.match(/const\s*\{[^}]*handleServiceError[^}]*\}[^\n]*\n/)
  if (importLine) {
    // Count usages outside of import
    const withoutImport = result.replace(importLine[0], '')
    if (!withoutImport.includes('handleServiceError')) {
      // Remove from import
      result = result.replace(/,\s*handleServiceError/g, '')
      result = result.replace(/handleServiceError\s*,\s*/g, '')
      // If it was the only import
      result = result.replace(/const\s*\{\s*\}\s*=\s*require\([^)]+\)\n?/g, '')
    }
  }
  
  // Check if logger is still used (outside of catch blocks - but we already removed those)
  // Only remove logger if it's not used at all in the remaining code
  const loggerImportMatch = result.match(/const\s+(?:\{\s*logger\s*\}|logger)\s*=\s*require\([^)]+\)(?:\.logger)?\n/)
  if (loggerImportMatch) {
    const withoutImport = result.replace(loggerImportMatch[0], '')
    if (!withoutImport.includes('logger.') && !withoutImport.includes('logger,')) {
      result = result.replace(loggerImportMatch[0], '')
    }
  }
  
  // Clean up standalone handleServiceError import line if empty
  result = result.replace(/const\s*\{\s*handleServiceError\s*\}\s*=\s*require\([^)]+\)\n/g, '')
  
  return result
}

function fixRouteClosings(code) {
  // After removing try/catch, the route handler closing needs to be fixed
  // asyncHandler(async (req, res) => { ... }) needs to become asyncHandler(async (req, res) => { ... }))
  // But we also need to handle the router.method() closing
  
  // Find each asyncHandler( and ensure proper closing
  let result = code
  let pos = 0
  let safety = 0
  
  while (safety++ < 100) {
    const ahIdx = result.indexOf('asyncHandler(async', pos)
    if (ahIdx === -1) break
    
    // Find the { that starts the async function body
    const openBrace = result.indexOf('{', ahIdx + 'asyncHandler(async'.length)
    if (openBrace === -1) break
    
    // Find matching }
    const closeBrace = findMatchingBrace(result, openBrace)
    if (closeBrace === -1) break
    
    // Check what follows the }
    const after = result.substring(closeBrace + 1, closeBrace + 10).replace(/\s/g, '')
    
    if (after.startsWith('))')) {
      // Already correct: }))
      pos = closeBrace + 3
    } else if (after.startsWith(')')) {
      // Need to add one more ): }) → }))
      // But wait - this ) might be closing the router.method()
      // asyncHandler(async (req, res) => { ... }) ← this ) closes asyncHandler
      // Then we need another ) for router.method(
      // So }) should become }))
      result = result.substring(0, closeBrace + 1) + ')' + result.substring(closeBrace + 1)
      pos = closeBrace + 3
    } else {
      // No ) after } - need to add ))
      // But this might be a multi-line closing
      // Check if next non-whitespace is )
      const nextNonWs = result.substring(closeBrace + 1).search(/\S/)
      if (nextNonWs >= 0) {
        const nextChar = result[closeBrace + 1 + nextNonWs]
        if (nextChar === ')') {
          // There's a ) on the next line - check if we need another
          const afterParen = result.substring(closeBrace + 1 + nextNonWs + 1).search(/\S/)
          if (afterParen >= 0 && result[closeBrace + 1 + nextNonWs + 1 + afterParen] === ')') {
            pos = closeBrace + 1 + nextNonWs + 1 + afterParen + 1
          } else {
            // Add extra )
            const parenPos = closeBrace + 1 + nextNonWs + 1
            result = result.substring(0, parenPos) + ')' + result.substring(parenPos)
            pos = parenPos + 1
          }
        } else {
          pos = closeBrace + 1
        }
      } else {
        pos = closeBrace + 1
      }
    }
  }
  
  return result
}

// Process each file
for (const file of files) {
  const fullPath = '/home/devbox/project/' + file
  
  if (!fs.existsSync(fullPath)) {
    console.log(`SKIP (not found): ${file}`)
    continue
  }
  
  let code = fs.readFileSync(fullPath, 'utf8')
  const original = code
  
  // Step 1: Update imports
  code = updateImports(code, file)
  
  // Step 2: Remove try/catch blocks
  code = removeTryCatch(code)
  
  // Step 3: Wrap async handlers with asyncHandler
  code = wrapAsyncHandlers(code)
  
  // Step 4: Fix closing parentheses
  code = fixRouteClosings(code)
  
  // Step 5: Remove unused imports
  code = removeUnusedImports(code)
  
  // Step 6: Clean up extra blank lines
  code = code.replace(/\n{3,}/g, '\n\n')
  
  if (code !== original) {
    fs.writeFileSync(fullPath, code)
    console.log(`TRANSFORMED: ${file}`)
  } else {
    console.log(`NO CHANGES: ${file}`)
  }
}

console.log('\nDone!')
