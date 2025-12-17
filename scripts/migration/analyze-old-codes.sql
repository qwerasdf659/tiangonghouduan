-- 分析旧核销码数据状态
SELECT 
  status,
  COUNT(*) as count,
  COUNT(CASE WHEN verification_code IS NOT NULL THEN 1 END) as has_code_count
FROM user_inventory
WHERE deleted_at IS NULL
GROUP BY status
ORDER BY 
  CASE status 
    WHEN 'available' THEN 1 
    WHEN 'locked' THEN 2
    WHEN 'used' THEN 3
    WHEN 'expired' THEN 4
    WHEN 'transferred' THEN 5
  END;

-- 统计有未过期核销码的物品数量
SELECT COUNT(*) as active_codes_count
FROM user_inventory
WHERE deleted_at IS NULL
  AND status IN ('available', 'locked')
  AND verification_code IS NOT NULL
  AND verification_expires_at > NOW();
