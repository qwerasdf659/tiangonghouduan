/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.11.14-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: test-db-12-mysql.ns-br0za7uc.svc    Database: restaurant_points_dev
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
-- Table structure for table `authentication_sessions`
--

DROP TABLE IF EXISTS `authentication_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authentication_sessions` (
  `authentication_session_id` bigint NOT NULL AUTO_INCREMENT,
  `session_token` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '会话令牌（JWT Token的jti）',
  `user_type` enum('user','admin') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户类型',
  `user_id` int NOT NULL,
  `login_ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '登录IP',
  `login_platform` enum('web','wechat_mp','douyin_mp','alipay_mp','app') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '登录平台（展示标签，由 platformDetector 识别，调用方必传）',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '是否活跃',
  `last_activity` datetime NOT NULL COMMENT '最后活动时间',
  `expires_at` datetime NOT NULL COMMENT '过期时间',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `device_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备标识（前端生成的UUID）。NULL=未知设备(legacy存量数据)',
  PRIMARY KEY (`authentication_session_id`),
  UNIQUE KEY `session_token` (`session_token`),
  KEY `idx_user_sessions_expires` (`expires_at`,`is_active`),
  KEY `idx_user_sessions_user_created` (`user_id`,`created_at`),
  KEY `user_sessions_last_activity` (`last_activity`),
  KEY `idx_user_sessions_platform` (`user_type`,`user_id`,`login_platform`,`is_active`),
  KEY `idx_user_device` (`user_type`,`user_id`,`device_id`,`is_active`),
  CONSTRAINT `authentication_sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=22864 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户会话管理表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `authentication_sessions`
--

LOCK TABLES `authentication_sessions` WRITE;
/*!40000 ALTER TABLE `authentication_sessions` DISABLE KEYS */;
INSERT INTO `authentication_sessions` VALUES
(22388,'0185d11e-459d-451c-bb14-aa357bbb37a6','user',12798,'::ffff:127.0.0.1','wechat_mp',1,'2026-07-11 02:33:52','2026-07-18 02:33:52','2026-07-11 02:33:52','2026-07-11 02:33:52',NULL),
(22396,'6181c8f2-db09-4902-9182-0c22d6a94dc1','user',12798,'::ffff:127.0.0.1','wechat_mp',1,'2026-07-11 08:12:43','2026-07-18 08:12:43','2026-07-11 08:12:43','2026-07-11 08:12:43',NULL),
(22410,'8c7c237e-62ca-4420-aa09-f38c8bf84024','user',12798,'::ffff:127.0.0.1','wechat_mp',1,'2026-07-11 08:22:08','2026-07-18 08:22:08','2026-07-11 08:22:08','2026-07-11 08:22:08',NULL),
(22418,'ad555e7f-a46c-475b-bd72-f33f7f94e363','user',12798,'::ffff:127.0.0.1','wechat_mp',1,'2026-07-11 08:25:01','2026-07-18 08:25:01','2026-07-11 08:25:01','2026-07-11 08:25:01',NULL),
(22425,'a81252d0-177c-45d9-a84c-1b53225517d2','user',12823,'::ffff:127.0.0.1','web',1,'2026-07-11 08:27:44','2026-07-18 08:27:44','2026-07-11 08:27:44','2026-07-11 08:27:44',NULL),
(22438,'aac8813d-e0ed-40f4-928d-79cd69872a86','user',12798,'127.0.0.1','web',1,'2026-07-11 08:28:39','2026-07-18 08:28:39','2026-07-11 08:28:39','2026-07-11 08:28:39',NULL),
(22447,'91894808-0802-4d8a-af87-10743d8dac96','user',12798,'127.0.0.1','web',1,'2026-07-11 08:29:55','2026-07-18 08:29:55','2026-07-11 08:29:55','2026-07-11 08:29:55',NULL),
(22451,'1c019aec-301d-4d29-a57c-6f561041ff43','user',12823,'::ffff:127.0.0.1','web',1,'2026-07-11 08:31:16','2026-07-18 08:31:16','2026-07-11 08:31:16','2026-07-11 08:31:16',NULL),
(22456,'d5cbf17c-41b9-43ae-8c2b-7349676dc943','user',12823,'::ffff:127.0.0.1','web',1,'2026-07-11 08:32:06','2026-07-18 08:32:06','2026-07-11 08:32:06','2026-07-11 08:32:06',NULL),
(22500,'52a23be8-5a73-4b00-9f89-414b8d3351d1','user',12798,'::ffff:127.0.0.1','wechat_mp',1,'2026-07-11 09:06:34','2026-07-18 09:06:34','2026-07-11 09:06:34','2026-07-11 09:06:34',NULL),
(22510,'7cc58a2d-8ff3-4d34-8326-766edc0d92c0','user',12841,'::ffff:127.0.0.1','web',1,'2026-07-11 09:07:07','2026-07-18 09:07:07','2026-07-11 09:07:07','2026-07-11 09:07:07',NULL),
(22511,'71efa7f4-ef86-4903-b74b-9d656a577434','user',12841,'::ffff:127.0.0.1','web',1,'2026-07-11 09:07:07','2026-07-18 09:07:07','2026-07-11 09:07:07','2026-07-11 09:07:07',NULL),
(22523,'ec39c243-76ca-4233-aca2-52413a182854','user',12823,'::ffff:127.0.0.1','web',1,'2026-07-11 09:07:24','2026-07-18 09:07:24','2026-07-11 09:07:24','2026-07-11 09:07:24',NULL),
(22558,'fa9a5b64-46f1-4898-be18-1546c4b393ab','user',12798,'::ffff:127.0.0.1','wechat_mp',1,'2026-07-11 09:10:40','2026-07-18 09:10:40','2026-07-11 09:10:40','2026-07-11 09:10:40',NULL),
(22576,'4b6ce3e3-b863-4fca-b664-430c8f6405ca','user',12798,'::ffff:127.0.0.1','wechat_mp',1,'2026-07-11 09:39:51','2026-07-18 09:39:51','2026-07-11 09:39:51','2026-07-11 09:39:51',NULL),
(22586,'1ff85470-63c5-4b25-a95f-9a26ff097e7b','user',12850,'::ffff:127.0.0.1','web',1,'2026-07-11 09:40:27','2026-07-18 09:40:26','2026-07-11 09:40:26','2026-07-11 09:40:27',NULL),
(22587,'f8939205-4280-472e-aed0-6ed8275b0a58','user',12850,'::ffff:127.0.0.1','web',1,'2026-07-11 09:40:27','2026-07-18 09:40:27','2026-07-11 09:40:27','2026-07-11 09:40:27',NULL),
(22599,'79f14ce6-6abb-4f82-8815-1db464d89292','user',12823,'::ffff:127.0.0.1','web',1,'2026-07-11 09:40:43','2026-07-18 09:40:43','2026-07-11 09:40:43','2026-07-11 09:40:43',NULL),
(22653,'16085299-4249-4310-8ef2-c6e898899407','user',12798,'::ffff:127.0.0.1','wechat_mp',1,'2026-07-11 09:59:28','2026-07-18 09:59:28','2026-07-11 09:59:28','2026-07-11 09:59:28',NULL),
(22663,'f33b2b37-e42d-4879-bbf6-69c94bc849c3','user',12859,'::ffff:127.0.0.1','web',1,'2026-07-11 10:00:01','2026-07-18 10:00:01','2026-07-11 10:00:01','2026-07-11 10:00:01',NULL),
(22664,'60de12cb-be30-473e-9298-50b99b29e6b3','user',12859,'::ffff:127.0.0.1','web',1,'2026-07-11 10:00:01','2026-07-18 10:00:01','2026-07-11 10:00:01','2026-07-11 10:00:01',NULL),
(22676,'ec0ab27e-5e0e-40fe-be2d-4cac9459984d','user',12823,'::ffff:127.0.0.1','web',1,'2026-07-11 10:00:18','2026-07-18 10:00:18','2026-07-11 10:00:18','2026-07-11 10:00:18',NULL),
(22753,'34484544-a169-4215-91be-f0fe7aba2678','user',12873,'223.104.74.177','wechat_mp',1,'2026-07-12 00:30:14','2026-07-19 00:30:14','2026-07-12 00:30:14','2026-07-12 00:30:14','de8adcb4-d9df-4f3f-88b5-a2ee9e9ede6b'),
(22766,'1fe7d072-04f4-4aaf-8fd7-715852265cfc','user',12796,'14.26.145.118','wechat_mp',1,'2026-07-15 04:53:18','2026-07-22 04:53:18','2026-07-15 04:53:18','2026-07-15 04:53:18','12e60a08-7099-43e7-81b7-093e6e7f2794'),
(22775,'ea83c653-7e58-4cab-b86b-f978c69ebc3f','user',12798,'::ffff:127.0.0.1','wechat_mp',1,'2026-07-15 21:03:57','2026-07-22 21:03:57','2026-07-15 21:03:57','2026-07-15 21:03:57',NULL),
(22777,'09fc5326-0d75-48f2-9bd2-6ff400dfbca7','user',12798,'::ffff:127.0.0.1','wechat_mp',1,'2026-07-15 21:07:47','2026-07-22 21:07:47','2026-07-15 21:07:47','2026-07-15 21:07:47',NULL),
(22779,'25e39464-e011-4090-9847-b5c8d3f042d5','user',12798,'::ffff:127.0.0.1','wechat_mp',1,'2026-07-15 21:10:10','2026-07-22 21:10:10','2026-07-15 21:10:10','2026-07-15 21:10:10',NULL),
(22793,'b7e7b286-4330-487e-9485-f03cf00be28b','user',12798,'::ffff:127.0.0.1','wechat_mp',1,'2026-07-15 21:26:22','2026-07-22 21:26:21','2026-07-15 21:26:21','2026-07-15 21:26:22',NULL),
(22805,'24b0b80a-4d80-484a-96e1-67cbb79c0c24','user',12874,'::ffff:127.0.0.1','web',1,'2026-07-15 21:27:20','2026-07-22 21:27:20','2026-07-15 21:27:20','2026-07-15 21:27:20',NULL),
(22806,'dcede59a-76a6-49c8-8a62-42dc1865b063','user',12874,'::ffff:127.0.0.1','web',1,'2026-07-15 21:27:20','2026-07-22 21:27:20','2026-07-15 21:27:20','2026-07-15 21:27:20',NULL),
(22818,'2813a3b4-82da-4be1-92f4-e93d052fe0a9','user',12823,'::ffff:127.0.0.1','web',1,'2026-07-15 21:27:38','2026-07-22 21:27:38','2026-07-15 21:27:38','2026-07-15 21:27:38',NULL),
(22849,'4279da6d-474c-4d82-b6db-d2ca3f4e1c45','user',32,'::ffff:127.0.0.1','web',1,'2026-07-15 21:29:00','2026-07-22 21:29:00','2026-07-15 21:29:00','2026-07-15 21:29:00',NULL),
(22850,'304f4528-1f47-4eef-a030-4be019ce1726','user',32,'::ffff:127.0.0.1','web',1,'2026-07-15 21:29:00','2026-07-22 21:29:00','2026-07-15 21:29:00','2026-07-15 21:29:00',NULL),
(22851,'38bf2d95-e079-4497-a315-882be72758d1','user',32,'::ffff:127.0.0.1','web',1,'2026-07-15 21:29:05','2026-07-22 21:29:05','2026-07-15 21:29:05','2026-07-15 21:29:05',NULL),
(22852,'6d0d3cec-bc15-49cc-83fa-ebae39afc524','user',32,'::ffff:127.0.0.1','web',1,'2026-07-15 21:29:10','2026-07-22 21:29:10','2026-07-15 21:29:10','2026-07-15 21:29:10',NULL),
(22853,'e8431e93-f4a1-4913-9945-bd8e9d1476d4','user',32,'::ffff:127.0.0.1','web',1,'2026-07-15 21:29:15','2026-07-22 21:29:14','2026-07-15 21:29:14','2026-07-15 21:29:15',NULL),
(22854,'07fe51e5-1e49-4853-bcea-75e84b60b8c0','user',32,'::ffff:127.0.0.1','web',1,'2026-07-15 21:29:21','2026-07-22 21:29:21','2026-07-15 21:29:21','2026-07-15 21:29:21',NULL),
(22855,'93f15c31-ec65-4e6c-86f6-a96b69a4be60','user',32,'223.104.79.159','wechat_mp',1,'2026-07-15 21:48:09','2026-07-22 21:48:09','2026-07-15 21:48:09','2026-07-15 21:48:09','31b91d1d-5059-4f80-bb68-3d4370356c08'),
(22856,'9110801b-7f09-41a2-803b-712caa9368b7','user',32,'::ffff:127.0.0.1','wechat_mp',1,'2026-07-15 22:02:04','2026-07-22 22:02:00','2026-07-15 22:02:00','2026-07-15 22:02:04',NULL),
(22857,'770661e7-7e9a-439e-b57b-5cd60c82d798','user',12798,'::ffff:127.0.0.1','wechat_mp',1,'2026-07-15 22:02:01','2026-07-22 22:02:01','2026-07-15 22:02:01','2026-07-15 22:02:01',NULL),
(22858,'13e60ac4-de7f-4571-9306-81191b705ac7','user',32,'::ffff:127.0.0.1','wechat_mp',1,'2026-07-15 22:03:59','2026-07-22 22:03:53','2026-07-15 22:03:53','2026-07-15 22:03:59',NULL),
(22859,'d1c542c0-2610-4555-860d-0bf8359ac0a2','user',12798,'::ffff:127.0.0.1','wechat_mp',1,'2026-07-15 22:03:55','2026-07-22 22:03:55','2026-07-15 22:03:55','2026-07-15 22:03:55',NULL),
(22860,'6fb4253d-cec0-4970-86c5-57931920d337','user',32,'::ffff:127.0.0.1','wechat_mp',1,'2026-07-15 22:13:57','2026-07-22 22:13:54','2026-07-15 22:13:54','2026-07-15 22:13:57',NULL),
(22861,'31794f18-f18e-432b-bf56-6e735dd653c1','user',12798,'::ffff:127.0.0.1','wechat_mp',1,'2026-07-15 22:13:55','2026-07-22 22:13:55','2026-07-15 22:13:55','2026-07-15 22:13:55',NULL),
(22862,'fd494bd1-1092-4526-bc9a-50240be3762c','user',32,'223.104.79.159','wechat_mp',1,'2026-07-15 23:16:16','2026-07-22 23:16:16','2026-07-15 23:16:16','2026-07-15 23:16:16','a4c59928-bb2b-4922-b05c-18c04c8dbdd7'),
(22863,'d0420359-35c2-4ac5-b1d4-8e9eaaf38ad6','user',32,'223.104.79.159','wechat_mp',1,'2026-07-16 02:37:01','2026-07-23 02:37:01','2026-07-16 02:37:01','2026-07-16 02:37:01','dbd60d83-7caf-43ee-97f8-4f150b9df84d');
/*!40000 ALTER TABLE `authentication_sessions` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:48
