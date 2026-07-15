/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.11.14-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: dbconn.sealosbja.site    Database: restaurant_points_dev
-- ------------------------------------------------------
-- Server version	8.0.30

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `merchant_operation_logs`
--

DROP TABLE IF EXISTS `merchant_operation_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `merchant_operation_logs` (
  `merchant_operation_log_id` bigint NOT NULL AUTO_INCREMENT,
  `operator_id` int NOT NULL COMMENT '操作员ID（商家员工 user_id）',
  `store_id` int NOT NULL COMMENT '门店ID（操作发生的门店）',
  `operation_type` enum('scan_user','submit_consumption','view_consumption_list','view_consumption_detail','staff_login','staff_logout','staff_add','staff_transfer','staff_disable','staff_enable') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '操作类型（商家域专用枚举）',
  `action` enum('create','read','scan','update') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'create' COMMENT '操作动作',
  `target_user_id` int DEFAULT NULL COMMENT '目标用户ID（被扫码/被录入消费的用户，可为空）',
  `consumption_record_id` bigint DEFAULT NULL,
  `consumption_amount` decimal(10,2) DEFAULT NULL COMMENT '消费金额（仅提交消费记录时有值）',
  `result` enum('success','failed','blocked') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'success' COMMENT '操作结果',
  `error_message` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '错误信息（失败时记录）',
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'IP地址（支持 IPv4 和 IPv6）',
  `user_agent` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户代理字符串（User-Agent）',
  `request_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '请求ID（用于全链路追踪）',
  `idempotency_key` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '幂等键（关联业务操作，如消费提交的幂等键）',
  `extra_data` json DEFAULT NULL COMMENT '扩展数据（JSON 格式，存储其他上下文信息）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (`merchant_operation_log_id`),
  KEY `idx_merchant_logs_operator` (`operator_id`),
  KEY `idx_merchant_logs_store` (`store_id`),
  KEY `idx_merchant_logs_operation_type` (`operation_type`),
  KEY `idx_merchant_logs_target_user` (`target_user_id`),
  KEY `idx_merchant_logs_related_record` (`consumption_record_id`),
  KEY `idx_merchant_logs_result` (`result`),
  KEY `idx_merchant_logs_created_at` (`created_at`),
  KEY `idx_merchant_logs_request_id` (`request_id`),
  KEY `idx_merchant_logs_idempotency_key` (`idempotency_key`),
  KEY `idx_merchant_logs_store_operator_time` (`store_id`,`operator_id`,`created_at`),
  KEY `idx_merchant_logs_store_type_time` (`store_id`,`operation_type`,`created_at`),
  CONSTRAINT `fk_merchant_logs_consumption_record` FOREIGN KEY (`consumption_record_id`) REFERENCES `consumption_records` (`consumption_record_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `merchant_operation_logs_ibfk_1` FOREIGN KEY (`operator_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `merchant_operation_logs_ibfk_2` FOREIGN KEY (`store_id`) REFERENCES `stores` (`store_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `merchant_operation_logs_ibfk_3` FOREIGN KEY (`target_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `merchant_operation_logs_ibfk_5` FOREIGN KEY (`store_id`) REFERENCES `stores` (`store_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=327 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商家操作审计日志表（商家员工域权限体系升级 - 2026-01-12）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `merchant_operation_logs`
--

LOCK TABLES `merchant_operation_logs` WRITE;
/*!40000 ALTER TABLE `merchant_operation_logs` DISABLE KEYS */;
INSERT INTO `merchant_operation_logs` VALUES
(250,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_a9a71779-d912-477f-9193-8574faaf09a2',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-03-23 00:20:26'),
(251,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_06f34a20-7a56-48ef-bfdc-31118b2f9791',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-03-23 00:20:46'),
(252,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_c1e5d034-af9e-47cf-aba8-bc7a6ebae85c',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-03-23 08:14:33'),
(253,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_df40f4f2-4f1f-4e05-9192-80c054f807bb',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-03-23 08:33:10'),
(254,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_1d29cd3a-e3f7-4500-95bc-d9f218485acf',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-03-23 09:38:35'),
(255,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_87bee6f3-b61b-47f5-9d97-e4ea8f647e56',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-03-23 09:47:01'),
(256,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_8025df61-23d4-477f-b6c2-b2b27f9cf121',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-03-24 02:08:53'),
(257,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_b5db6159-a408-4c42-99c1-2bac54b0919a',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-03-24 02:21:45'),
(258,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_6feae075-9d30-4608-96a9-6800fd88fcb3',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-03-24 04:37:03'),
(259,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_5e4880a1-36d0-4d36-9bc3-72ddc0285a7b',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-03-24 04:38:04'),
(260,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_c2b84342-5f08-44f0-b8a2-09d52db5b8fe',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-03-24 04:38:34'),
(261,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_4174f6d7-a535-4c73-86d1-97a873837609',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-03-24 04:39:31'),
(262,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_003090b0-d9f3-4f91-81ad-adb4b688cd2b',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-03-24 04:41:44'),
(263,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_34e7deec-fead-4870-a83c-e2a46186510d',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-03-24 04:47:38'),
(264,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_35265243-aaa5-45e8-99e0-f65bf912c299',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-03-24 04:47:44'),
(265,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_dd3d3e43-ad21-4ecc-828f-9945d0fe54b0',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-03-24 05:00:03'),
(266,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_72333bfd-53ed-4db3-8076-29fff02e0efc',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-03-24 05:19:10'),
(267,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_88eb92ae-053e-45af-b0c3-5f091d6390e5',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-03-25 03:43:00'),
(268,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_b9547cc6-7d4b-429a-8d59-1c4ee8084c60',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-04-10 06:45:47'),
(269,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_a038d42d-6372-44ab-bb35-d2100fb4dc39',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-04-22 11:12:19'),
(270,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_01e3396f-a6e8-4258-b2bd-6419cb8bf8c7',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-04-22 11:13:47'),
(271,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_0e671d53-bd3e-49ee-babf-450a2836f34d',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-04-22 11:41:52'),
(272,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_16e1a49f-db34-4d24-84f5-a65536c3479d',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-04-22 11:44:24'),
(273,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_7ad72072-f61a-400e-9eda-9e53004df155',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-04-23 00:22:38'),
(274,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_b9ba7f62-8900-4690-a9a6-c680c89865fe',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-04-23 02:53:21'),
(275,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_6560b636-5fc5-45ed-baf7-3451041b2c35',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-04-23 02:57:05'),
(276,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_11991232-6b05-4923-bf33-e940152db335',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-04-23 03:00:39'),
(277,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_8770330d-f447-481c-b4f9-ca8a00b0f32f',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-04-24 03:39:47'),
(278,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_af80a700-f8e7-4aa6-b393-35fd6a9a7e7c',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-04-24 07:32:04'),
(279,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_16032e00-d1fc-4f4f-8f9e-c1a2c3e9c273',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-04-24 07:33:58'),
(280,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_dd733703-5ab1-40fa-9316-fc62281fe2da',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-04-24 07:41:15'),
(281,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_437483a3-87fe-4c85-9d4a-24c335974171',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-04-25 05:44:04'),
(282,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_51b80563-5ca0-4071-b8bd-39e4b495887f',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-04-25 06:35:16'),
(283,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_dbd40c1b-1587-4ed4-9179-5325ae220141',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-04-25 06:44:54'),
(284,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_dd72106c-724d-4b27-828d-a52c5b6a8057',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-04-25 06:54:04'),
(285,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_99f859f5-16d6-4dad-afd6-ea5be482467c',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-04-25 06:55:40'),
(286,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_c362f6ef-ee58-481f-b88f-2d4d8ee2b528',NULL,'{\"user_uuid\": \"f0bcb82a-1ee7-41fe-9712-140c4f244aad\"}','2026-04-25 09:06:25'),
(287,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_2015e3c5-926c-496c-94c8-99a37c784a39',NULL,'{\"user_uuid\": \"95476b83-e996-422d-a4da-53562692d4ee\"}','2026-05-26 03:51:05'),
(288,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_8031977b-0a84-444e-b030-6fe4651db89d',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-03 00:23:21'),
(289,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_ec7c8709-e835-4da7-85b3-3f9f402d13d9',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-03 01:33:26'),
(290,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_02f50c16-5d06-4f90-b953-52b963366620',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-03 01:43:04'),
(291,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_b79bddae-737f-49b0-8edb-73aa16279ebf',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-03 02:14:13'),
(292,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_7fce5603-4c8b-44d6-b816-933c8ac0dae7',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-03 03:01:03'),
(293,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_d3eb2d92-a6f3-4a5a-aff8-a8c996493698',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-03 03:09:35'),
(294,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_19a89770-69be-49b5-9f4b-6aa9ee42dd9c',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-03 03:37:10'),
(295,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_ede1274c-c268-4b98-9bd6-9094839b75c5',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-03 03:46:27'),
(296,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_61ac7a69-f3ae-442d-bfc5-f8e8e826c9cc',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-05 05:34:45'),
(297,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_c0d48156-17ff-4214-a265-fb1eb7b334c9',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-05 05:39:01'),
(298,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_d109b8a9-cb2d-4f78-9734-97617d940e91',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-05 11:10:36'),
(299,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_f783d3ff-069c-492f-ac61-1c6394754686',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-05 11:30:19'),
(300,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_f6e42eda-b020-45d1-b694-24f995476987',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-06 02:28:30'),
(301,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_3ebabcd9-692f-406d-a602-04a574487893',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-06 02:28:45'),
(302,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_06b498c6-e2f3-48ea-b507-4b2943153c05',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-06 02:29:04'),
(303,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_b84b3120-2334-4229-b22c-f3db6ebbbcdb',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-11 21:46:49'),
(304,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_2fa0e1b8-5b4f-455c-8a44-98a92e126de9',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-11 22:33:16'),
(305,32,11,'scan_user','scan',31,NULL,NULL,'success',NULL,'14.150.196.144','Mozilla/5.0 (Linux; Android 16; 24031PN0DC Build/BP2A.250605.031.A3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.178 Mobile Safari/537.36 XWEB/1460205 MMWEBSDK/20250201 MMWEBID/8907 MicroMessenger/8.0.58.2841(0x28003A52) WeChat/arm64 Weixin NetType/5G Language/zh_CN ABI/arm64 MiniProgramEnv/android','81a97765-5305-46df-9d44-0ae7a20b491a',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-12 05:22:47'),
(306,32,11,'submit_consumption','create',31,NULL,2222.00,'success',NULL,'14.150.196.144','Mozilla/5.0 (Linux; Android 16; 24031PN0DC Build/BP2A.250605.031.A3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.178 Mobile Safari/537.36 XWEB/1460205 MMWEBSDK/20250201 MMWEBID/8907 MicroMessenger/8.0.58.2841(0x28003A52) WeChat/arm64 Weixin NetType/5G Language/zh_CN ABI/arm64 MiniProgramEnv/android','5fecbd45-81dd-47e1-b250-98281e17b980','consumption_submit_1781212971736_112f2d0109f4cb82','{\"risk_alerts\": [], \"points_to_award\": 2222}','2026-06-12 05:22:51'),
(307,31,11,'scan_user','scan',32,NULL,NULL,'success',NULL,'14.150.196.144','Mozilla/5.0 (Linux; Android 16; 24031PN0DC Build/BP2A.250605.031.A3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.178 Mobile Safari/537.36 XWEB/1460205 MMWEBSDK/20250201 MMWEBID/8907 MicroMessenger/8.0.58.2841(0x28003A52) WeChat/arm64 Weixin NetType/5G Language/zh_CN ABI/arm64 MiniProgramEnv/android','8a0e31d2-a8ed-4c62-a8cf-5047ec308430',NULL,'{\"user_uuid\": \"cdfe43b0-d67b-4185-886e-185876cf3164\"}','2026-06-12 05:31:00'),
(308,31,11,'submit_consumption','create',32,NULL,3666.00,'success',NULL,'14.150.196.144','Mozilla/5.0 (Linux; Android 16; 24031PN0DC Build/BP2A.250605.031.A3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.178 Mobile Safari/537.36 XWEB/1460205 MMWEBSDK/20250201 MMWEBID/8907 MicroMessenger/8.0.58.2841(0x28003A52) WeChat/arm64 Weixin NetType/5G Language/zh_CN ABI/arm64 MiniProgramEnv/android','52b8ae75-c4ca-4cbb-ae53-e6307b9e5599','consumption_submit_1781213467123_85e0898ed248baa2','{\"risk_alerts\": [], \"points_to_award\": 3666}','2026-06-12 05:31:07'),
(309,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_9018128c-6907-4412-8a4c-e25bb2229d83',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-12 07:43:22'),
(310,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_1ea4ae2a-bc5b-461b-8ae0-e0526f3e8280',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-12 07:52:10'),
(311,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_da3a2454-e29d-47f9-a5ba-00f24d6d45bf',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-12 07:59:33'),
(312,31,11,'scan_user','scan',32,NULL,NULL,'success',NULL,'14.150.2.41','Mozilla/5.0 (Linux; Android 16; 24031PN0DC Build/BP2A.250605.031.A3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.178 Mobile Safari/537.36 XWEB/1460217 MMWEBSDK/20250201 MMWEBID/8907 MicroMessenger/8.0.58.2841(0x28003A52) WeChat/arm64 Weixin NetType/5G Language/zh_CN ABI/arm64 MiniProgramEnv/android','15197097-ebe7-4608-b83e-e11207a4c023',NULL,'{\"user_uuid\": \"cdfe43b0-d67b-4185-886e-185876cf3164\"}','2026-06-13 02:31:01'),
(313,31,11,'submit_consumption','create',32,NULL,1369.00,'success',NULL,'14.150.2.41','Mozilla/5.0 (Linux; Android 16; 24031PN0DC Build/BP2A.250605.031.A3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.178 Mobile Safari/537.36 XWEB/1460217 MMWEBSDK/20250201 MMWEBID/8907 MicroMessenger/8.0.58.2841(0x28003A52) WeChat/arm64 Weixin NetType/5G Language/zh_CN ABI/arm64 MiniProgramEnv/android','5a11d043-601b-4f93-8556-e976a907e009','consumption_submit_1781289064643_1a516254360b7276','{\"risk_alerts\": [], \"points_to_award\": 1369}','2026-06-13 02:31:05'),
(314,32,11,'scan_user','scan',31,NULL,NULL,'success',NULL,'113.78.95.223','Mozilla/5.0 (Linux; Android 15; ALI-AN00 Build/HONORALI-TN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.178 Mobile Safari/537.36 XWEB/1460217 MMWEBSDK/20250904 MMWEBID/8727 MicroMessenger/8.0.65.2960(0x28004156) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64 MiniProgramEnv/android','0c827884-11da-4392-bf8b-8234b9529aab',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-13 02:32:23'),
(315,32,11,'submit_consumption','create',31,NULL,3669.00,'success',NULL,'113.78.95.223','Mozilla/5.0 (Linux; Android 15; ALI-AN00 Build/HONORALI-TN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.178 Mobile Safari/537.36 XWEB/1460217 MMWEBSDK/20250904 MMWEBID/8727 MicroMessenger/8.0.65.2960(0x28004156) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64 MiniProgramEnv/android','36b2946b-4d27-4abc-863d-ccc3c68018c5','consumption_submit_1781289146246_8d91c645a30444db','{\"risk_alerts\": [], \"points_to_award\": 3669}','2026-06-13 02:32:26'),
(316,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_5fda89a5-6d98-49c9-9d31-54bcace072cb',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-13 04:20:29'),
(317,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_7d9fd3c9-cca9-448a-a7ce-98809c23329f',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-13 04:29:13'),
(318,31,7,'scan_user','scan',31,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_47fa29a5-6441-4878-bf9f-81256891b0c3',NULL,'{\"user_uuid\": \"ca1e1a37-73e7-46b9-969a-aeea66f5d510\"}','2026-06-13 04:37:33'),
(319,31,11,'scan_user','scan',32,NULL,NULL,'success',NULL,'14.150.2.41','Mozilla/5.0 (Linux; Android 15; ALI-AN00 Build/HONORALI-TN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.178 Mobile Safari/537.36 XWEB/1460217 MMWEBSDK/20250904 MMWEBID/8727 MicroMessenger/8.0.65.2960(0x28004156) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64 MiniProgramEnv/android','5dba29ab-5634-4619-abd9-88100326e042',NULL,'{\"user_uuid\": \"cdfe43b0-d67b-4185-886e-185876cf3164\"}','2026-06-13 07:07:13'),
(320,31,11,'submit_consumption','create',32,NULL,222.00,'success',NULL,'14.150.2.41','Mozilla/5.0 (Linux; Android 15; ALI-AN00 Build/HONORALI-TN00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.178 Mobile Safari/537.36 XWEB/1460217 MMWEBSDK/20250904 MMWEBID/8727 MicroMessenger/8.0.65.2960(0x28004156) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64 MiniProgramEnv/android','6a4143db-a8a5-46be-84fd-41ef8c7a7a48','consumption_submit_1781305747658_e522e115587bc128','{\"risk_alerts\": [], \"points_to_award\": 222}','2026-06-13 07:09:08'),
(321,32,7,'scan_user','scan',32,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_5f402a72-b2ca-471d-abc3-347360309242',NULL,'{\"user_uuid\": \"cdfe43b0-d67b-4185-886e-185876cf3164\"}','2026-06-15 08:46:49'),
(322,32,7,'scan_user','scan',32,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_a3544e44-e16e-4958-9df9-c29e5f97d874',NULL,'{\"user_uuid\": \"cdfe43b0-d67b-4185-886e-185876cf3164\"}','2026-06-16 04:19:47'),
(323,32,7,'scan_user','scan',32,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_86d501e4-cced-481a-a3e4-b1a9de312ce0',NULL,'{\"user_uuid\": \"cdfe43b0-d67b-4185-886e-185876cf3164\"}','2026-06-16 04:20:06'),
(324,32,7,'scan_user','scan',32,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_774fb664-8bf6-41a6-a5e7-a859ae453b7a',NULL,'{\"user_uuid\": \"cdfe43b0-d67b-4185-886e-185876cf3164\"}','2026-06-16 04:20:25'),
(325,32,7,'scan_user','scan',32,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_872f6387-edb8-4c75-8805-85dbe0cf3b78',NULL,'{\"user_uuid\": \"cdfe43b0-d67b-4185-886e-185876cf3164\"}','2026-06-16 04:43:04'),
(326,32,7,'scan_user','scan',32,NULL,NULL,'success',NULL,'127.0.0.1',NULL,'req_5f658388-b4ff-48f7-b617-39146213c34a',NULL,'{\"user_uuid\": \"cdfe43b0-d67b-4185-886e-185876cf3164\"}','2026-06-16 05:52:55');
/*!40000 ALTER TABLE `merchant_operation_logs` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:14
