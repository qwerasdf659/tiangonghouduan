#!/usr/bin/env node
'use strict'

/**
 * Smart route transformer: removes only the OUTER try/catch that wraps
 * the entire route body and ends with handleServiceError, preserving
 * inner try/catch blocks used for business logic.
 */

const fs = require('fs')

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Usage: node _smart_transform.js <file1> [file2] ...')
  process.exit(1)
}

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

function transformFile(filePath) {
  let code = fs.readFileSync(filePath, 'utf8')
  const original = code
  
  // Determine relative path for imports
  let relPath
  if (filePath.includes('routes/v4/shop/')) {
    relPath = '../../../../middleware/validation'
  } else {
    relPath = '../../../middleware/validation'
  }
  
  // Step 1: Update imports - add asyncHandler, remove handleServiceError
  const escapedPath = relPath.replace(/\//g, '\\/')
  const importRegex = new RegExp(
    `const\\s*\\{([^}]*)\\}\\s*=\\s*require\\(['"]${escapedPath}['"]\\)`
  )
  
  const importMatch = code.match(importRegex)
  if (importMatch) {
    const imports = importMatch[1].split(',').map(s => s.trim()).filter(s => s)
    const hasAsyncHandler = imports.includes('asyncHandler')
    const newImports = imports.filter(s => s !== 'handleServiceError')
    if (!hasAsyncHandler) newImports.push('asyncHandler')
    
    if (newImports.length > 0) {
      code = code.replace(importMatch[0], `const { ${newImports.join(', ')} } = require('${relPath}')`)
    } else {
      // Remove the entire import line
      code = code.replace(importMatch[0] + '\n', '')
    }
  } else if (!code.includes('asyncHandler')) {
    // No validation import found, add one after the last require
    const lines = code.split('\n')
    let lastRequireIdx = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("require('")) lastRequireIdx = i
    }
    if (lastRequireIdx >= 0) {
      lines.splice(lastRequireIdx + 1, 0, `const { asyncHandler } = require('${relPath}')`)
      code = lines.join('\n')
    }
  }
  
  // Step 2: Find and transform each route handler
  // Strategy: find each "async (req, res) => {" that starts a route handler,
  // then check if the FIRST statement is "try {" and the catch ends with handleServiceError
  
  // We work line by line for precision
  const lines = code.split('\n')
  let output = []
  let i = 0
  
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    
    // Detect async route handler (not already wrapped)
    const asyncMatch = line.match(/^(\s*)(?:asyncHandler\()?async\s*\(\s*req\s*,\s*res\s*\)\s*=>\s*\{/)
    const isAlreadyWrapped = line.includes('asyncHandler(async')
    
    if (asyncMatch && !isAlreadyWrapped) {
      // Check if next non-empty line is "try {"
      let j = i + 1
      while (j < lines.length && lines[j].trim() === '') j++
      
      if (j < lines.length && lines[j].trim() === 'try {') {
        const tryLineIdx = j
        const tryIndent = lines[j].match(/^(\s*)/)[1]
        
        // Find the matching } for this try block
        // Reconstruct code from tryLineIdx to find the brace
        let codeFromTry = lines.slice(tryLineIdx).join('\n')
        let tryOpenBrace = codeFromTry.indexOf('{')
        let tryCloseBrace = findMatchingBrace(codeFromTry, tryOpenBrace)
        
        if (tryCloseBrace >= 0) {
          // Check if followed by catch with handleServiceError
          let afterTryClose = codeFromTry.substring(tryCloseBrace + 1)
          let catchMatch = afterTryClose.match(/^\s*catch\s*\([^)]*\)\s*\{/)
          
          if (catchMatch) {
            let catchBodyStart = afterTryClose.indexOf('{', catchMatch.index)
            let catchBodyEnd = findMatchingBrace(afterTryClose, catchBodyStart)
            
            if (catchBodyEnd >= 0) {
              let catchBody = afterTryClose.substring(catchBodyStart + 1, catchBodyEnd)
              
              // Check if this catch block contains handleServiceError (outer catch)
              if (catchBody.includes('handleServiceError') || catchBody.includes('return handleServiceError')) {
                // This is the outer try/catch - remove it!
                
                // Get the try body (between try { and })
                let tryBody = codeFromTry.substring(tryOpenBrace + 1, tryCloseBrace)
                
                // Dedent try body by one level (2 spaces)
                let tryBodyLines = tryBody.split('\n')
                let dedentedLines = tryBodyLines.map(l => {
                  if (l.startsWith(tryIndent + '  ')) {
                    return l.substring(2)
                  }
                  return l
                })
                
                // Calculate how many original lines the try/catch spans
                let totalTryCatchChars = tryCloseBrace + 1 + catchBodyEnd + 1
                let tryCatchLines = codeFromTry.substring(0, totalTryCatchChars).split('\n').length
                
                // Wrap the async handler with asyncHandler
                let wrappedLine = line.replace(
                  /async\s*\(\s*req\s*,\s*res\s*\)\s*=>\s*\{/,
                  'asyncHandler(async (req, res) => {'
                )
                output.push(wrappedLine)
                
                // Add dedented try body (skip first empty line if any)
                for (const dl of dedentedLines) {
                  output.push(dl)
                }
                
                // Skip past the entire try/catch in the original
                i = tryLineIdx + tryCatchLines
                
                // Now we need to fix the closing: the next line should be }) or similar
                // We need to change it to }))
                // Look at what's next
                while (i < lines.length && lines[i].trim() === '') {
                  i++
                }
                
                // The current line should be the closing of the route handler
                // e.g., "  }" or "})" or "  }\n)"
                // We need to ensure the asyncHandler gets closed with ))
                continue
              }
            }
          }
        }
      }
      
      // No outer try/catch found, but still wrap with asyncHandler
      let wrappedLine = line.replace(
        /async\s*\(\s*req\s*,\s*res\s*\)\s*=>\s*\{/,
        'asyncHandler(async (req, res) => {'
      )
      output.push(wrappedLine)
      i++
      continue
    }
    
    output.push(line)
    i++
  }
  
  code = output.join('\n')
  
  // Step 3: Fix closing parentheses for asyncHandler
  // Find each asyncHandler( and ensure it has matching ))
  let result = code
  let searchFrom = 0
  let safety = 0
  
  while (safety++ < 200) {
    const ahIdx = result.indexOf('asyncHandler(async', searchFrom)
    if (ahIdx === -1) break
    
    const openBrace = result.indexOf('{', ahIdx + 'asyncHandler(async'.length)
    if (openBrace === -1) { searchFrom = ahIdx + 1; continue }
    
    const closeBrace = findMatchingBrace(result, openBrace)
    if (closeBrace === -1) { searchFrom = ahIdx + 1; continue }
    
    // Check what follows }
    const afterClose = result.substring(closeBrace + 1)
    const firstNonWs = afterClose.search(/\S/)
    
    if (firstNonWs >= 0) {
      const nextChars = afterClose.substring(firstNonWs, firstNonWs + 2)
      if (nextChars === '))') {
        searchFrom = closeBrace + firstNonWs + 3
      } else if (nextChars[0] === ')') {
        // Only one ) - need to add another
        const insertPos = closeBrace + 1 + firstNonWs
        result = result.substring(0, insertPos) + ')' + result.substring(insertPos)
        searchFrom = insertPos + 2
      } else {
        // No ) at all - need to add ))
        // But check if there's a newline pattern like }\n)
        searchFrom = closeBrace + 1
      }
    } else {
      searchFrom = closeBrace + 1
    }
  }
  
  // Step 4: Remove unused logger import (only if logger is not used in remaining code)
  const loggerImportMatch = result.match(/const\s+(?:logger|\{\s*logger\s*\})\s*=\s*require\([^)]+\)(?:\.logger)?\n/)
  if (loggerImportMatch) {
    const withoutImport = result.replace(loggerImportMatch[0], '')
    if (!withoutImport.includes('logger.') && !withoutImport.includes('logger,') && !withoutImport.includes('logger)')) {
      result = result.replace(loggerImportMatch[0], '')
    }
  }
  
  // Step 5: Remove standalone handleServiceError references
  // (should already be gone from imports, but clean up any remaining)
  
  // Step 6: Clean up multiple blank lines
  result = result.replace(/\n{3,}/g, '\n\n')
  
  if (result !== original) {
    fs.writeFileSync(filePath, result)
    return true
  }
  return false
}

for (const file of files) {
  const changed = transformFile(file)
  console.log(`${changed ? 'TRANSFORMED' : 'NO CHANGES'}: ${file}`)
}
