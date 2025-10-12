-- prizes 表数据恢复脚本
-- 备份时间: 2025-09-21T13:52:46.980Z
-- 记录数: 8

-- 恢复 prizes 表数据
INSERT INTO prizes (prize_id, prize_name, prize_type, prize_value, win_rate, stock_total, stock_remaining, image_url, primary_image_id, gallery_images, description, prize_metadata, display_config, display_order, is_active, valid_from, valid_until, created_at, updated_at) VALUES
(1, '八八折券', 'coupon', '0.00', '0.0000', 0, 0, NULL, NULL, NULL, '全场八八折优惠券（暂时停用）', NULL, NULL, 1, 1, NULL, NULL, '2025-08-02 03:13:09', '2025-08-02 03:15:31'),
(2, '九八折券', 'coupon', '10.00', '0.1000', 0, 0, NULL, NULL, NULL, '全场九八折优惠券，满100可用', NULL, NULL, 2, 1, NULL, NULL, '2025-08-02 03:13:09', '2025-08-02 03:13:09'),
(3, '甜品1份', 'physical', '25.00', '0.3000', 0, 0, NULL, NULL, NULL, '免费获得精选甜品一份', NULL, NULL, 3, 1, NULL, NULL, '2025-08-02 03:13:09', '2025-08-02 03:13:09'),
(4, '青菜1份', 'physical', '15.00', '0.3000', 0, 0, NULL, NULL, NULL, '免费获得新鲜青菜一份', NULL, NULL, 4, 1, NULL, NULL, '2025-08-02 03:13:09', '2025-08-02 03:13:09'),
(5, '虾1份', 'physical', '35.00', '0.0500', 0, 0, NULL, NULL, NULL, '免费获得鲜虾一份', NULL, NULL, 5, 1, NULL, NULL, '2025-08-02 03:13:09', '2025-08-02 03:13:09'),
(6, '花甲1份', 'physical', '28.00', '0.2000', 0, 0, NULL, NULL, NULL, '免费获得花甲一份', NULL, NULL, 6, 1, NULL, NULL, '2025-08-02 03:13:09', '2025-08-02 03:13:09'),
(7, '鱿鱼1份', 'physical', '32.00', '0.0500', 0, 0, NULL, NULL, NULL, '免费获得鱿鱼一份', NULL, NULL, 7, 1, NULL, NULL, '2025-08-02 03:13:09', '2025-08-02 03:13:09'),
(8, '生腌拼盘', 'physical', '0.00', '0.0000', 0, 0, NULL, NULL, NULL, '精品生腌拼盘（暂时停用）', NULL, NULL, 8, 1, NULL, NULL, '2025-08-02 03:13:09', '2025-08-02 03:15:31');

