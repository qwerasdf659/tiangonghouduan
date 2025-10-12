-- 数据库备份
-- 数据库: restaurant_points_dev
-- 时间: 2025-09-30T14:08:59.554Z
-- 备份原因: 主键命名统一改造前备份

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for exchange_records
-- ----------------------------
DROP TABLE IF EXISTS `exchange_records`;
CREATE TABLE `exchange_records` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '兑换记录唯一ID',
  `exchange_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '兑换记录业务ID',
  `user_id` int NOT NULL COMMENT '用户ID',
  `product_id` int NOT NULL COMMENT '商品ID',
  `product_snapshot` json NOT NULL COMMENT '商品信息快照JSON',
  `quantity` int NOT NULL DEFAULT '1' COMMENT '兑换数量',
  `total_points` int NOT NULL COMMENT '总消耗积分',
  `exchange_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '兑换码（用户凭证）',
  `status` enum('pending','distributed','used','expired','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'distributed' COMMENT '兑换状态：pending-待处理，distributed-已分发，used-已使用，expired-已过期，cancelled-已取消',
  `space` enum('lucky','premium') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '兑换空间',
  `exchange_time` datetime NOT NULL COMMENT '兑换时间',
  `expires_at` datetime DEFAULT NULL COMMENT '兑换码过期时间',
  `used_at` datetime DEFAULT NULL COMMENT '使用时间',
  `client_info` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户端信息',
  `usage_info` json DEFAULT NULL COMMENT '使用说明JSON',
  `notes` text COLLATE utf8mb4_unicode_ci COMMENT '备注信息',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `exchange_id` (`exchange_id`),
  UNIQUE KEY `exchange_code` (`exchange_code`),
  KEY `idx_exchange_records_user_id` (`user_id`),
  KEY `idx_exchange_records_product_id` (`product_id`),
  KEY `idx_exchange_records_status` (`status`),
  KEY `idx_exchange_records_space` (`space`),
  KEY `idx_exchange_records_exchange_time` (`exchange_time`),
  KEY `idx_exchange_records_status_time` (`status`,`exchange_time`),
  KEY `idx_exchange_records_user_time` (`user_id`,`created_at`),
  KEY `idx_exchange_records_product_status` (`product_id`,`status`),
  KEY `idx_exchange_status_time` (`status`,`created_at`),
  CONSTRAINT `fk_exchange_records_product_id` FOREIGN KEY (`product_id`) REFERENCES `products` (`commodity_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_exchange_records_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='兑换记录表 - 记录用户商品兑换信息';

-- ----------------------------
-- Table structure for trade_records
-- ----------------------------
DROP TABLE IF EXISTS `trade_records`;
CREATE TABLE `trade_records` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '交易记录唯一ID',
  `trade_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '交易记录业务ID（如tr_1722249322）',
  `trade_type` enum('point_transfer','exchange_refund','prize_claim','admin_adjustment','system_reward') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '交易类型',
  `from_user_id` int DEFAULT NULL COMMENT '发送方用户ID（系统操作时为null）',
  `to_user_id` int NOT NULL COMMENT '接收方用户ID',
  `operator_id` int DEFAULT NULL COMMENT '操作员ID（管理员操作时使用）',
  `points_amount` int NOT NULL COMMENT '交易积分数量',
  `fee_points_amount` int NOT NULL DEFAULT '0' COMMENT '交易手续积分数量',
  `net_points_amount` int NOT NULL COMMENT '实际到账积分数量（扣除手续积分后）',
  `status` enum('pending','processing','completed','failed','cancelled','refunded') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '交易状态',
  `verification_status` enum('none','required','verified','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none' COMMENT '验证状态',
  `related_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '关联记录ID（如兑换记录ID、抽奖记录ID）',
  `related_type` enum('exchange','lottery','review','refund','system') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '关联记录类型',
  `trade_reason` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '交易原因或描述',
  `remarks` text COLLATE utf8mb4_unicode_ci COMMENT '交易备注',
  `trade_password_hash` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '交易密码哈希（用户设置时）',
  `security_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '安全验证码',
  `client_ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户端IP地址',
  `device_info` json DEFAULT NULL COMMENT '设备信息JSON',
  `trade_time` datetime NOT NULL COMMENT '交易发起时间',
  `processed_time` datetime DEFAULT NULL COMMENT '交易处理完成时间',
  `expires_at` datetime DEFAULT NULL COMMENT '交易过期时间',
  `version` int NOT NULL DEFAULT '1' COMMENT '记录版本（乐观锁）',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `trade_id` (`trade_id`),
  KEY `operator_id` (`operator_id`),
  KEY `trade_records_from_user_id_created_at` (`from_user_id`,`created_at`),
  KEY `trade_records_to_user_id_created_at` (`to_user_id`,`created_at`),
  KEY `trade_records_trade_type_status` (`trade_type`,`status`),
  KEY `trade_records_related_id_related_type` (`related_id`,`related_type`),
  KEY `trade_records_trade_time` (`trade_time`),
  KEY `trade_records_status_verification_status` (`status`,`verification_status`),
  KEY `idx_trade_records_status_created_at` (`status`,`created_at`),
  CONSTRAINT `trade_records_ibfk_1` FOREIGN KEY (`from_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `trade_records_ibfk_2` FOREIGN KEY (`to_user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE,
  CONSTRAINT `trade_records_ibfk_3` FOREIGN KEY (`operator_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for user_inventory
-- ----------------------------
DROP TABLE IF EXISTS `user_inventory`;
CREATE TABLE `user_inventory` (
  `id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '库存物品唯一标识',
  `user_id` int NOT NULL COMMENT '用户ID',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '物品名称',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '物品描述',
  `icon` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '显示图标（用于UI展示的emoji或图标标识）',
  `type` enum('voucher','product','service') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '物品类型：优惠券/实物商品/服务',
  `value` int NOT NULL DEFAULT '0' COMMENT '物品价值（积分等价值）',
  `status` enum('available','pending','used','expired','transferred') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'available' COMMENT '物品状态',
  `source_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '获得来源：抽奖中奖/兑换获得/系统赠送等',
  `source_id` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '来源记录ID',
  `acquired_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '获得时间',
  `expires_at` timestamp NULL DEFAULT NULL COMMENT '过期时间（可选）',
  `used_at` timestamp NULL DEFAULT NULL COMMENT '使用时间',
  `verification_code` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '核销码',
  `verification_expires_at` timestamp NULL DEFAULT NULL COMMENT '核销码过期时间',
  `transfer_to_user_id` int DEFAULT NULL COMMENT '转让给的用户ID',
  `transfer_at` timestamp NULL DEFAULT NULL COMMENT '转让时间',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `market_status` enum('on_sale','sold','withdrawn') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '市场状态：在售/已售/已撤回',
  `selling_points` int DEFAULT NULL COMMENT '出售价格（积分）',
  `condition` enum('new','excellent','good','fair','poor') COLLATE utf8mb4_unicode_ci DEFAULT 'good' COMMENT '物品成色：全新/优秀/良好/一般/较差',
  `transfer_count` int NOT NULL DEFAULT '0' COMMENT '转让次数',
  `acquisition_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '获得方式：lottery/exchange/transfer/admin等',
  `acquisition_cost` int DEFAULT NULL COMMENT '获得成本（积分）',
  `can_transfer` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否可转让',
  `can_use` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否可使用',
  `item_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '物品名称（兼容新字段）',
  `item_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '物品类型（兼容新字段）',
  `is_available` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否可用',
  PRIMARY KEY (`id`),
  UNIQUE KEY `verification_code` (`verification_code`),
  UNIQUE KEY `user_inventory_verification_code` (`verification_code`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_type` (`type`),
  KEY `idx_status` (`status`),
  KEY `idx_source_type` (`source_type`),
  KEY `idx_acquired_at` (`acquired_at`),
  KEY `idx_expires_at` (`expires_at`),
  KEY `idx_verification_code` (`verification_code`),
  KEY `fk_user_inventory_transfer_to` (`transfer_to_user_id`),
  KEY `user_inventory_user_id_status` (`user_id`,`status`),
  KEY `user_inventory_type` (`type`),
  KEY `user_inventory_expires_at` (`expires_at`),
  KEY `user_inventory_source_type_source_id` (`source_type`,`source_id`),
  KEY `idx_user_inventory_market_status` (`market_status`),
  KEY `idx_user_inventory_user_market` (`user_id`,`market_status`),
  KEY `idx_user_inventory_selling_points` (`selling_points`),
  CONSTRAINT `fk_inventory_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_inventory_transfer_to` FOREIGN KEY (`transfer_to_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_user_inventory_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户物品库存表';

-- ----------------------------
-- Table structure for customer_sessions
-- ----------------------------
DROP TABLE IF EXISTS `customer_sessions`;
CREATE TABLE `customer_sessions` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '会话ID',
  `session_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '会话标识符',
  `user_id` int NOT NULL COMMENT '用户ID',
  `admin_id` int DEFAULT NULL COMMENT '分配的管理员ID（基于UUID角色系统验证管理员权限）',
  `status` enum('waiting','assigned','active','closed') COLLATE utf8mb4_unicode_ci DEFAULT 'waiting' COMMENT '会话状态',
  `source` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT 'mobile' COMMENT '来源渠道',
  `priority` int DEFAULT '1' COMMENT '优先级(1-5)',
  `last_message_at` datetime DEFAULT NULL COMMENT '最后消息时间',
  `closed_at` datetime DEFAULT NULL COMMENT '关闭时间',
  `satisfaction_score` int DEFAULT NULL COMMENT '满意度评分(1-5)',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `session_id` (`session_id`),
  KEY `idx_customer_sessions_user_id` (`user_id`),
  KEY `idx_customer_sessions_admin_id` (`admin_id`),
  KEY `idx_customer_sessions_status` (`status`),
  KEY `idx_customer_sessions_created_at` (`created_at`),
  CONSTRAINT `customer_sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `customer_sessions_ibfk_2` FOREIGN KEY (`admin_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户聊天会话表';

-- ----------------------------
-- Records of customer_sessions
-- ----------------------------
INSERT INTO customer_sessions (id, session_id, user_id, admin_id, status, source, priority, last_message_at, closed_at, satisfaction_score, created_at, updated_at) VALUES (1, 'session_1754985854512_4d116f10', 31, 31, 'active', 'mobile', 1, '2025-08-14 16:11:40', NULL, NULL, '2025-08-12 08:04:14', '2025-08-14 16:11:40');

-- ----------------------------
-- Table structure for chat_messages
-- ----------------------------
DROP TABLE IF EXISTS `chat_messages`;
CREATE TABLE `chat_messages` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '消息ID',
  `message_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '消息标识符',
  `session_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '会话标识符',
  `sender_id` int NOT NULL COMMENT '发送者ID',
  `sender_type` enum('user','admin') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '发送者类型',
  `message_source` enum('user_client','admin_client','system') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '消息来源：user_client=用户端，admin_client=管理员端，system=系统消息',
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '消息内容',
  `message_type` enum('text','image','system') COLLATE utf8mb4_unicode_ci DEFAULT 'text' COMMENT '消息类型',
  `status` enum('sending','sent','delivered','read') COLLATE utf8mb4_unicode_ci DEFAULT 'sent' COMMENT '消息状态',
  `reply_to_id` bigint DEFAULT NULL COMMENT '回复的消息ID',
  `temp_message_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '临时消息ID(前端生成)',
  `metadata` json DEFAULT NULL COMMENT '扩展数据(图片信息等)',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `message_id` (`message_id`),
  KEY `idx_chat_messages_session_id` (`session_id`),
  KEY `idx_chat_messages_sender_id` (`sender_id`),
  KEY `idx_chat_messages_created_at` (`created_at`),
  KEY `idx_chat_messages_temp_message_id` (`temp_message_id`),
  KEY `idx_chat_messages_source_type` (`message_source`,`sender_type`),
  CONSTRAINT `chat_messages_ibfk_1` FOREIGN KEY (`sender_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chat_messages_session_id` FOREIGN KEY (`session_id`) REFERENCES `customer_sessions` (`session_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=91 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天消息表';

-- ----------------------------
-- Records of chat_messages
-- ----------------------------
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (1, 'test_msg_1755016807840', 'session_1754985854512_4d116f10', 31, 'user', 'user_client', '测试消息 - 8/12/2025, 4:40:07 PM', 'text', 'sent', NULL, NULL, NULL, '2025-08-12 16:40:07', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (2, 'msg_1755018012807_realtime', 'session_1754985854512_4d116f10', 31, 'user', 'user_client', '[实时测试] 你好，我在用户界面发送这条消息，请问管理员能收到吗？- 8/12/2025, 5:00:12 PM', 'text', 'sent', NULL, NULL, NULL, '2025-08-12 17:00:12', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (3, 'websocket_test_1755018209535', 'session_1754985854512_4d116f10', 31, 'user', 'user_client', '[WebSocket修复测试] 这条消息应该实时通知管理员 - 8/12/2025, 5:03:29 PM', 'text', 'sent', NULL, NULL, NULL, '2025-08-12 17:03:29', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (4, 'final_test_1755018325458', 'session_1754985854512_4d116f10', 31, 'user', 'user_client', '[最终测试] 管理员您好！这是用户界面发送的消息，请确认是否能在管理员界面收到 - 8/12/2025, 5:05:25 PM', 'text', 'sent', NULL, NULL, NULL, '2025-08-12 17:05:25', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (6, 'msg_1755106553024_bf22dd76', 'session_1754985854512_4d116f10', 31, 'user', 'user_client', '123', 'text', 'sent', NULL, 'local_1755106594111', NULL, '2025-08-13 17:35:53', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (7, 'msg_1755106558954_a285aca7', 'session_1754985854512_4d116f10', 31, 'user', 'user_client', '11111', 'text', 'sent', NULL, 'local_1755106600062', NULL, '2025-08-13 17:35:58', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (8, 'msg_1755106953153_7c36875b', 'session_1754985854512_4d116f10', 31, 'user', 'user_client', '152233', 'text', 'sent', NULL, 'local_1755106994276', NULL, '2025-08-13 17:42:33', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (9, 'msg_1755113399260_071b5475', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '我是管理员13612227930，在用户界面测试发送消息', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 19:29:59', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (11, 'msg_1755113449386_6b59b7f6', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '我是管理员13612227930，在用户界面测试发送消息', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 19:30:49', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (13, 'msg_1755113620329_b0abb8a3', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '1222', 'text', 'sent', NULL, 'local_1755113661399', NULL, '2025-08-13 19:33:40', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (14, 'msg_1755114692746_ce6e44c1', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '[测试消息] 上午3:52:13', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 19:51:32', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (15, 'msg_1755114698475_f33f5634', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '[测试消息] 上午3:52:19', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 19:51:38', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (16, 'msg_1755114702278_f92d59df', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '[测试消息] 上午3:52:23', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 19:51:42', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (17, 'msg_1755114707640_45557d65', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '[测试消息] 上午3:52:28', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 19:51:47', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (18, 'msg_1755114861372_90468c06', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '[测试消息] 上午3:55:02', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 19:54:21', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (19, 'msg_1755115020232_b0fc62c3', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '[测试消息] 上午3:57:41', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 19:57:00', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (20, 'msg_1755115022999_2f0ff4fc', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '[测试消息] 上午3:57:44', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 19:57:02', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (21, 'msg_1755115355084_9a9c5746', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '[测试消息] 上午4:03:16', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 20:02:35', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (22, 'msg_1755115419673_58576163', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '12333', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 20:03:39', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (23, 'msg_1755115447113_57125d2c', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '12332', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 20:04:07', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (24, 'msg_1755115660538_29cd8703', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '11111', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 20:07:40', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (25, 'msg_1755115664321_18575608', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '111', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 20:07:44', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (26, 'msg_1755115677579_0a5b4350', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '333', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 20:07:57', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (27, 'msg_1755115923444_3cb4901c', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '测试API调用', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 20:12:03', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (28, 'msg_1755116240093_3fb9452c', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '修复测试', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 20:17:20', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (29, 'msg_1755116508856_1ba18c39', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '对对对', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 20:21:48', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (30, 'msg_1755116546474_ba6c1997', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '最终测试', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 20:22:26', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (31, 'msg_1755116554531_c8df71c4', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '最终测试', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 20:22:34', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (32, 'msg_1755116740174_b184118b', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', 'jxjdj', 'text', 'sent', NULL, 'local_1755116739434', NULL, '2025-08-13 20:25:40', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (33, 'msg_1755116761495_41b75a38', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', 'jsjs', 'text', 'sent', NULL, 'local_1755116760774', NULL, '2025-08-13 20:26:01', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (34, 'msg_1755125319598_837e96e4', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '1111', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 22:48:39', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (35, 'msg_1755125339189_43d38777', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '11111', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 22:48:59', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (36, 'msg_1755125362433_01eb0aff', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '11111', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 22:49:22', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (37, 'msg_1755125578124_92dbfdcd', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '11111', 'text', 'sent', NULL, NULL, NULL, '2025-08-13 22:52:58', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (38, 'msg_1755127308286_49e92d4a', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '888888', 'text', 'sent', NULL, 'local_1755127349364', NULL, '2025-08-13 23:21:48', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (39, 'msg_1755178166138_4299ce2a', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '12321', 'text', 'sent', NULL, 'local_1755178207596', NULL, '2025-08-14 13:29:26', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (40, 'msg_1755178172777_9a681a23', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '55555', 'text', 'sent', NULL, 'local_1755178214253', NULL, '2025-08-14 13:29:32', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (41, 'msg_1755178179011_7b0526e1', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '4564654654', 'text', 'sent', NULL, 'local_1755178220484', NULL, '2025-08-14 13:29:39', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (42, 'msg_1755178196182_61fbecd7', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '6454645', 'text', 'sent', NULL, 'local_1755178237663', NULL, '2025-08-14 13:29:56', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (43, 'msg_1755178200381_4ff67241', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '9876454', 'text', 'sent', NULL, 'local_1755178241848', NULL, '2025-08-14 13:30:00', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (44, 'msg_1755178210305_3300eee1', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '55555', 'text', 'sent', NULL, 'local_1755178251773', NULL, '2025-08-14 13:30:10', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (45, 'msg_1755178230605_8a5fde3e', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '55555', 'text', 'sent', NULL, 'local_1755178272073', NULL, '2025-08-14 13:30:30', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (46, 'msg_1755178616312_5314f0ad', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '11111', 'text', 'sent', NULL, 'local_1755178657746', NULL, '2025-08-14 13:36:56', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (47, 'msg_1755178625867_e63864d6', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '1111', 'text', 'sent', NULL, 'local_1755178667338', NULL, '2025-08-14 13:37:05', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (48, 'msg_1755179002426_89f0c5d5', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '555555', 'text', 'sent', NULL, 'local_1755179043897', NULL, '2025-08-14 13:43:22', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (49, 'msg_1755179015812_ed039a5f', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '5555555', 'text', 'sent', NULL, 'local_1755179057278', NULL, '2025-08-14 13:43:35', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (50, 'msg_1755179020363_9e3f7cd3', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '55555555', 'text', 'sent', NULL, 'local_1755179061798', NULL, '2025-08-14 13:43:40', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (51, 'msg_1755179030470_bf25e16b', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '999999', 'text', 'sent', NULL, 'local_1755179071936', NULL, '2025-08-14 13:43:50', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (52, 'msg_1755179036567_f2e8f636', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '666666', 'text', 'sent', NULL, 'local_1755179077928', NULL, '2025-08-14 13:43:56', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (53, 'msg_1755179555615_e19814d5', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '555555', 'text', 'sent', NULL, NULL, NULL, '2025-08-14 13:52:35', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (54, 'msg_1755179566865_ac710ac1', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '5201314', 'text', 'sent', NULL, NULL, NULL, '2025-08-14 13:52:46', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (55, 'msg_1755179869653_584d1b0c', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '*99999', 'text', 'sent', NULL, 'local_1755179911081', NULL, '2025-08-14 13:57:49', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (56, 'msg_1755179876801_29ce9fcd', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '88888', 'text', 'sent', NULL, 'local_1755179918250', NULL, '2025-08-14 13:57:56', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (57, 'msg_1755179880251_ad477c30', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '777777', 'text', 'sent', NULL, 'local_1755179921709', NULL, '2025-08-14 13:58:00', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (58, 'msg_1755179883746_81317d07', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '666666', 'text', 'sent', NULL, 'local_1755179925200', NULL, '2025-08-14 13:58:03', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (59, 'msg_1755180313154_88ac28d0', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '88888888', 'text', 'sent', NULL, NULL, NULL, '2025-08-14 14:05:13', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (60, 'msg_1755180327145_dd5b8df3', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '999999', 'text', 'sent', NULL, NULL, NULL, '2025-08-14 14:05:27', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (61, 'msg_1755180901251_02c46019', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '57272772', 'text', 'sent', NULL, 'local_1755180942689', NULL, '2025-08-14 14:15:01', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (62, 'msg_1755180905416_b64095e8', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '225255252', 'text', 'sent', NULL, 'local_1755180946862', NULL, '2025-08-14 14:15:05', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (63, 'msg_1755180908111_abdf592f', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '2288828228', 'text', 'sent', NULL, 'local_1755180949569', NULL, '2025-08-14 14:15:08', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (64, 'msg_1755183214484_60ccd116', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '888888', 'text', 'sent', NULL, NULL, NULL, '2025-08-14 14:53:34', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (65, 'msg_1755183236225_d009d34f', 'session_1754985854512_4d116f10', 31, 'user', 'user_client', '999999', 'text', 'sent', NULL, 'local_1755183277644', NULL, '2025-08-14 14:53:56', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (66, 'msg_1755183251644_13b185e1', 'session_1754985854512_4d116f10', 31, 'user', 'user_client', '1313131313131', 'text', 'sent', NULL, 'local_1755183293072', NULL, '2025-08-14 14:54:11', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (67, 'msg_1755183287708_338393bf', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '7878787878', 'text', 'sent', NULL, NULL, NULL, '2025-08-14 14:54:47', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (68, 'msg_1755183306712_35a10c91', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '8798798798798798', 'text', 'sent', NULL, NULL, NULL, '2025-08-14 14:55:06', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (69, 'msg_1755183338829_cdc92e73', 'session_1754985854512_4d116f10', 31, 'user', 'user_client', '00000000777878787', 'text', 'sent', NULL, 'local_1755183380234', NULL, '2025-08-14 14:55:38', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (70, 'msg_1755183348665_89ff0082', 'session_1754985854512_4d116f10', 31, 'user', 'user_client', '00000000006666666', 'text', 'sent', NULL, 'local_1755183390071', NULL, '2025-08-14 14:55:48', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (71, 'msg_1755183367637_c9a83e97', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '111111114444444', 'text', 'sent', NULL, NULL, NULL, '2025-08-14 14:56:07', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (72, 'msg_1755183372824_9db57719', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '111111112222222', 'text', 'sent', NULL, NULL, NULL, '2025-08-14 14:56:12', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (74, 'msg_1755187287222_bb532b59', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '1111118556855', 'text', 'sent', NULL, NULL, NULL, '2025-08-14 16:01:27', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (75, 'msg_1755187288724_da56eabd', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '1111118556855', 'text', 'sent', NULL, NULL, NULL, '2025-08-14 16:01:28', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (76, 'msg_1755187290671_b295e091', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '1111118556855', 'text', 'sent', NULL, NULL, NULL, '2025-08-14 16:01:30', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (77, 'msg_1755187292589_f356039f', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', '1111118556855', 'text', 'sent', NULL, NULL, NULL, '2025-08-14 16:01:32', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (78, 'msg_1755187308750_8e467af5', 'session_1754985854512_4d116f10', 31, 'user', 'user_client', '8888888', 'text', 'sent', NULL, 'local_1755187350200', NULL, '2025-08-14 16:01:48', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (79, 'msg_1755187313035_d3db3e7c', 'session_1754985854512_4d116f10', 31, 'user', 'user_client', '999999', 'text', 'sent', NULL, 'local_1755187354489', NULL, '2025-08-14 16:01:53', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (80, 'msg_1755187821547_6b9bf2da', 'session_1754985854512_4d116f10', 31, 'user', 'user_client', '889989898989898', 'text', 'sent', NULL, 'local_1755187862994', NULL, '2025-08-14 16:10:21', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (81, 'msg_1755187828735_3de3957a', 'session_1754985854512_4d116f10', 31, 'user', 'user_client', '9999999999', 'text', 'sent', NULL, 'local_1755187870184', NULL, '2025-08-14 16:10:28', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (82, 'msg_1755187837746_7a9b6b57', 'session_1754985854512_4d116f10', 31, 'user', 'user_client', '2222222222', 'text', 'sent', NULL, 'local_1755187879184', NULL, '2025-08-14 16:10:37', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (83, 'msg_1755187877668_b13cf621', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', 'zzzzzz', 'text', 'sent', NULL, NULL, NULL, '2025-08-14 16:11:17', '2025-08-24 15:08:01');
INSERT INTO chat_messages (id, message_id, session_id, sender_id, sender_type, message_source, content, message_type, status, reply_to_id, temp_message_id, metadata, created_at, updated_at) VALUES (84, 'msg_1755187900614_75b4afa9', 'session_1754985854512_4d116f10', 31, 'admin', 'admin_client', 'aaaaaaaa', 'text', 'sent', NULL, NULL, NULL, '2025-08-14 16:11:40', '2025-08-24 15:08:01');

-- ----------------------------
-- Table structure for user_sessions
-- ----------------------------
DROP TABLE IF EXISTS `user_sessions`;
CREATE TABLE `user_sessions` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '会话ID',
  `session_token` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '会话令牌（JWT Token的jti）',
  `user_type` enum('user','admin') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户类型',
  `user_id` int NOT NULL,
  `login_ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '登录IP',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '是否活跃',
  `last_activity` datetime NOT NULL COMMENT '最后活动时间',
  `expires_at` datetime NOT NULL COMMENT '过期时间',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `session_token` (`session_token`),
  UNIQUE KEY `session_token_2` (`session_token`),
  UNIQUE KEY `session_token_3` (`session_token`),
  UNIQUE KEY `user_sessions_session_token` (`session_token`),
  KEY `idx_user_sessions_token` (`session_token`),
  KEY `idx_user_sessions_user_active` (`user_type`,`user_id`,`is_active`),
  KEY `idx_user_sessions_expires` (`expires_at`,`is_active`),
  KEY `idx_user_sessions_user_created` (`user_id`,`created_at`),
  KEY `user_sessions_user_type_user_id_is_active` (`user_type`,`user_id`,`is_active`),
  KEY `user_sessions_expires_at_is_active` (`expires_at`,`is_active`),
  KEY `user_sessions_last_activity` (`last_activity`),
  CONSTRAINT `user_sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户会话管理表';

-- ----------------------------
-- Table structure for roles
-- ----------------------------
DROP TABLE IF EXISTS `roles`;
CREATE TABLE `roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `role_uuid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '角色UUID标识（安全不可推测）',
  `role_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '角色名称（仅内部使用）',
  `role_level` int NOT NULL DEFAULT '0' COMMENT '角色级别（0=普通用户，100=超级管理员）',
  `permissions` json DEFAULT NULL COMMENT '角色权限配置（JSON格式）',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '角色描述',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '角色是否启用',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `role_uuid` (`role_uuid`),
  UNIQUE KEY `role_name` (`role_name`),
  UNIQUE KEY `roles_role_uuid` (`role_uuid`),
  UNIQUE KEY `roles_role_name` (`role_name`),
  UNIQUE KEY `role_uuid_2` (`role_uuid`),
  UNIQUE KEY `role_name_2` (`role_name`),
  KEY `roles_role_level` (`role_level`),
  KEY `roles_is_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色管理表';

-- ----------------------------
-- Records of roles
-- ----------------------------
INSERT INTO roles (id, role_uuid, role_name, role_level, permissions, description, is_active, created_at, updated_at) VALUES (1, '5f2c25c2-d507-408d-b6c6-a5c448895afd', 'user', 0, '[object Object]', '普通用户', 1, '2025-09-28 17:01:17', '2025-09-29 20:24:47');
INSERT INTO roles (id, role_uuid, role_name, role_level, permissions, description, is_active, created_at, updated_at) VALUES (2, 'a4657bb4-c9f1-4506-a016-f2fd61580088', 'admin', 100, '[object Object]', '管理员', 1, '2025-09-28 17:01:17', '2025-09-29 20:24:47');

-- ----------------------------
-- Table structure for user_roles
-- ----------------------------
DROP TABLE IF EXISTS `user_roles`;
CREATE TABLE `user_roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `role_id` int NOT NULL,
  `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `assigned_by` int DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_role_unique` (`user_id`,`role_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_role_id` (`role_id`),
  KEY `idx_is_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Records of user_roles
-- ----------------------------
INSERT INTO user_roles (id, user_id, role_id, assigned_at, assigned_by, is_active, created_at, updated_at) VALUES (1, 31, 2, '2025-09-28 17:09:44', NULL, 1, '2025-09-28 17:09:44', '2025-09-28 17:09:44');
INSERT INTO user_roles (id, user_id, role_id, assigned_at, assigned_by, is_active, created_at, updated_at) VALUES (2, 34, 1, '2025-09-28 17:09:44', NULL, 1, '2025-09-28 17:09:44', '2025-09-28 17:09:44');
INSERT INTO user_roles (id, user_id, role_id, assigned_at, assigned_by, is_active, created_at, updated_at) VALUES (3, 36, 1, '2025-09-28 17:09:44', NULL, 1, '2025-09-28 17:09:44', '2025-09-28 17:09:44');
INSERT INTO user_roles (id, user_id, role_id, assigned_at, assigned_by, is_active, created_at, updated_at) VALUES (4, 37, 1, '2025-09-28 17:09:44', NULL, 1, '2025-09-28 17:09:44', '2025-09-28 17:09:44');
INSERT INTO user_roles (id, user_id, role_id, assigned_at, assigned_by, is_active, created_at, updated_at) VALUES (5, 38, 1, '2025-09-28 17:09:44', NULL, 1, '2025-09-28 17:09:44', '2025-09-28 17:09:44');
INSERT INTO user_roles (id, user_id, role_id, assigned_at, assigned_by, is_active, created_at, updated_at) VALUES (6, 39, 1, '2025-09-28 17:09:44', NULL, 1, '2025-09-28 17:09:44', '2025-09-28 17:09:44');
INSERT INTO user_roles (id, user_id, role_id, assigned_at, assigned_by, is_active, created_at, updated_at) VALUES (7, 40, 1, '2025-09-28 17:09:44', NULL, 1, '2025-09-28 17:09:44', '2025-09-28 17:09:44');
INSERT INTO user_roles (id, user_id, role_id, assigned_at, assigned_by, is_active, created_at, updated_at) VALUES (8, 173, 1, '2025-09-28 17:09:44', NULL, 1, '2025-09-28 17:09:44', '2025-09-28 17:09:44');
INSERT INTO user_roles (id, user_id, role_id, assigned_at, assigned_by, is_active, created_at, updated_at) VALUES (9, 174, 1, '2025-09-28 17:09:44', NULL, 1, '2025-09-28 17:09:44', '2025-09-28 17:09:44');
INSERT INTO user_roles (id, user_id, role_id, assigned_at, assigned_by, is_active, created_at, updated_at) VALUES (10, 175, 1, '2025-09-28 17:09:44', NULL, 1, '2025-09-28 17:09:44', '2025-09-28 17:09:44');
INSERT INTO user_roles (id, user_id, role_id, assigned_at, assigned_by, is_active, created_at, updated_at) VALUES (11, 279, 1, '2025-09-28 17:09:44', NULL, 1, '2025-09-28 17:09:44', '2025-09-28 17:09:44');
INSERT INTO user_roles (id, user_id, role_id, assigned_at, assigned_by, is_active, created_at, updated_at) VALUES (12, 2147483647, 2, '2025-09-28 17:09:44', NULL, 1, '2025-09-28 17:09:44', '2025-09-28 17:09:44');

-- ----------------------------
-- Table structure for system_announcements
-- ----------------------------
DROP TABLE IF EXISTS `system_announcements`;
CREATE TABLE `system_announcements` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '公告ID',
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '公告标题',
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '公告内容',
  `type` enum('system','activity','maintenance','notice') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'notice' COMMENT '公告类型：系统/活动/维护/通知',
  `priority` enum('high','medium','low') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium' COMMENT '优先级：高/中/低',
  `target_groups` json DEFAULT NULL COMMENT '目标用户组（管理员可见）',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否激活',
  `expires_at` datetime DEFAULT NULL COMMENT '过期时间',
  `admin_id` int NOT NULL COMMENT '发布公告的管理员ID（基于UUID角色系统验证管理员权限）',
  `internal_notes` text COLLATE utf8mb4_unicode_ci COMMENT '内部备注（管理员可见）',
  `view_count` int NOT NULL DEFAULT '0' COMMENT '查看次数',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `admin_id` (`admin_id`),
  CONSTRAINT `system_announcements_ibfk_1` FOREIGN KEY (`admin_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统公告表 - 支持首页公告功能';

-- ----------------------------
-- Records of system_announcements
-- ----------------------------
INSERT INTO system_announcements (id, title, content, type, priority, target_groups, is_active, expires_at, admin_id, internal_notes, view_count, created_at, updated_at) VALUES (1, '系统维护通知', '为提升系统性能，将于今晚进行系统维护', 'system', 'high', NULL, 1, NULL, 31, NULL, 13, '2025-09-29 15:51:36', '2025-09-29 17:46:34');

-- ----------------------------
-- Table structure for feedbacks
-- ----------------------------
DROP TABLE IF EXISTS `feedbacks`;
CREATE TABLE `feedbacks` (
  `id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '反馈ID（格式：fb_timestamp_random）',
  `user_id` int NOT NULL COMMENT '用户ID',
  `category` enum('technical','feature','bug','complaint','suggestion','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other' COMMENT '反馈分类',
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '反馈内容',
  `attachments` json DEFAULT NULL COMMENT '附件信息（图片URLs等）',
  `status` enum('pending','processing','replied','closed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '处理状态',
  `priority` enum('high','medium','low') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium' COMMENT '优先级',
  `user_ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户IP（管理员可见）',
  `device_info` json DEFAULT NULL COMMENT '设备信息（管理员可见）',
  `admin_id` int DEFAULT NULL COMMENT '处理反馈的管理员ID（基于UUID角色系统验证管理员权限）',
  `reply_content` text COLLATE utf8mb4_unicode_ci COMMENT '回复内容',
  `replied_at` datetime DEFAULT NULL COMMENT '回复时间',
  `internal_notes` text COLLATE utf8mb4_unicode_ci COMMENT '内部备注（管理员可见）',
  `estimated_response_time` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '预计响应时间',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `admin_id` (`admin_id`),
  CONSTRAINT `feedbacks_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `feedbacks_ibfk_2` FOREIGN KEY (`admin_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户反馈表 - 支持客服反馈功能';

-- ----------------------------
-- Table structure for image_resources
-- ----------------------------
DROP TABLE IF EXISTS `image_resources`;
CREATE TABLE `image_resources` (
  `resource_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '资源唯一标识符',
  `business_type` enum('lottery','exchange','trade','uploads','user_upload_review') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务类型：抽奖/兑换/交易/上传/用户上传审核',
  `category` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '资源分类：prizes/products/items/pending_review等',
  `context_id` int NOT NULL COMMENT '上下文ID：用户ID/奖品ID/商品ID等',
  `user_id` int DEFAULT NULL COMMENT '关联用户ID（上传用户）',
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件存储路径',
  `thumbnail_paths` json DEFAULT NULL COMMENT '缩略图路径集合：{small: "", medium: "", large: ""}',
  `original_filename` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '原始文件名',
  `file_size` int NOT NULL COMMENT '文件大小（字节）',
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'MIME类型',
  `status` enum('active','archived','deleted') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '资源状态',
  `review_status` enum('pending','approved','rejected','reviewing') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '审核状态',
  `reviewer_id` int DEFAULT NULL COMMENT '审核员ID',
  `review_reason` text COLLATE utf8mb4_unicode_ci COMMENT '审核说明',
  `reviewed_at` datetime DEFAULT NULL COMMENT '审核时间',
  `points_awarded` int DEFAULT NULL COMMENT '奖励积分数量',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `upload_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '上传记录业务ID（兼容原UploadReview）',
  `is_upload_review` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否为上传审核资源',
  `source_module` enum('system','lottery','exchange','user_upload','admin') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'system' COMMENT '来源模块',
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'IP地址',
  PRIMARY KEY (`resource_id`),
  UNIQUE KEY `upload_id` (`upload_id`),
  KEY `idx_business_category` (`business_type`,`category`),
  KEY `idx_user_business` (`user_id`,`business_type`,`status`),
  KEY `idx_review_status` (`review_status`,`business_type`,`created_at`),
  KEY `idx_context_category` (`context_id`,`category`,`status`),
  KEY `idx_created_status` (`created_at`,`status`),
  KEY `reviewer_id` (`reviewer_id`),
  CONSTRAINT `image_resources_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `image_resources_ibfk_2` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='统一图片资源管理表';

-- ----------------------------
-- Records of image_resources
-- ----------------------------
INSERT INTO image_resources (resource_id, business_type, category, context_id, user_id, file_path, thumbnail_paths, original_filename, file_size, mime_type, status, review_status, reviewer_id, review_reason, reviewed_at, points_awarded, created_at, upload_id, is_upload_review, source_module, ip_address) VALUES ('56dbae2c-abbe-455d-91a6-d7da7bb99695', 'lottery', 'prize_image', 1, NULL, '/prizes/prize_001.jpg', NULL, 'prize_001.jpg', 1024, 'image/jpeg', 'active', NULL, NULL, NULL, NULL, 0, '2025-09-22 17:15:43', NULL, 0, 'system', NULL);
INSERT INTO image_resources (resource_id, business_type, category, context_id, user_id, file_path, thumbnail_paths, original_filename, file_size, mime_type, status, review_status, reviewer_id, review_reason, reviewed_at, points_awarded, created_at, upload_id, is_upload_review, source_module, ip_address) VALUES ('a480312a-2bcb-4a44-bd0e-157dadf6fc41', 'user_upload_review', 'user_upload', 1, NULL, '/uploads/test_receipt.jpg', NULL, 'receipt.jpg', 2048, 'image/jpeg', 'active', 'approved', NULL, '上传凭证清晰有效', '2025-09-22 17:15:43', 10, '2025-09-22 17:15:42', NULL, 1, '', NULL);
INSERT INTO image_resources (resource_id, business_type, category, context_id, user_id, file_path, thumbnail_paths, original_filename, file_size, mime_type, status, review_status, reviewer_id, review_reason, reviewed_at, points_awarded, created_at, upload_id, is_upload_review, source_module, ip_address) VALUES ('e2b1de62-0e09-4428-b6c3-2a104774906b', 'user_upload_review', 'user_upload', 1, NULL, '/uploads/test_receipt.jpg', NULL, 'receipt.jpg', 2048, 'image/jpeg', 'active', 'pending', NULL, NULL, NULL, 0, '2025-09-22 17:15:27', NULL, 1, '', NULL);


SET FOREIGN_KEY_CHECKS = 1;

-- 备份完成
-- 总记录数: 99
