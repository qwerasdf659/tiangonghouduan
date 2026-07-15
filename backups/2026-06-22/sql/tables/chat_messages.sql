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
-- Table structure for table `chat_messages`
--

DROP TABLE IF EXISTS `chat_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_messages` (
  `customer_service_session_id` bigint NOT NULL,
  `sender_id` int DEFAULT NULL COMMENT '发送者ID（系统消息为NULL）',
  `sender_type` enum('user','admin') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '发送者类型',
  `message_source` enum('user_client','admin_client','system') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '消息来源：user_client=用户端，admin_client=管理员端，system=系统消息',
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '消息内容',
  `message_type` enum('text','image','system','file') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'text' COMMENT '消息类型：text-文字 image-图片 system-系统 file-文件',
  `status` enum('sending','sent','delivered','read') COLLATE utf8mb4_unicode_ci DEFAULT 'sent' COMMENT '消息状态',
  `reply_to_id` bigint DEFAULT NULL COMMENT '回复的消息ID',
  `temp_message_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '临时消息ID(前端生成)',
  `metadata` json DEFAULT NULL COMMENT '扩展数据(图片信息等)',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `chat_message_id` bigint NOT NULL AUTO_INCREMENT,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '文件原始名（message_type=file 时使用，如 报告.pdf；其它类型为 NULL）',
  `file_size` bigint DEFAULT NULL COMMENT '文件字节数（message_type=file 时使用，用于前端展示文件大小；其它类型为 NULL）',
  PRIMARY KEY (`chat_message_id`),
  UNIQUE KEY `new_message_id` (`chat_message_id`),
  KEY `idx_chat_messages_session_id` (`customer_service_session_id`),
  KEY `idx_chat_messages_sender_id` (`sender_id`),
  KEY `idx_chat_messages_created_at` (`created_at`),
  KEY `idx_chat_messages_temp_message_id` (`temp_message_id`),
  KEY `idx_chat_messages_source_type` (`message_source`,`sender_type`),
  CONSTRAINT `fk_chat_messages_sender_id` FOREIGN KEY (`sender_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_chat_messages_session` FOREIGN KEY (`customer_service_session_id`) REFERENCES `customer_service_sessions` (`customer_service_session_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=22809 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天消息表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `chat_messages`
--

LOCK TABLES `chat_messages` WRITE;
/*!40000 ALTER TABLE `chat_messages` DISABLE KEYS */;
INSERT INTO `chat_messages` VALUES
(631,135,'admin','admin_client','测试消息 - 服务重启后','text','sent',NULL,NULL,NULL,'2026-01-09 08:18:11','2026-01-09 08:18:11',5756,NULL,NULL),
(631,135,'admin','admin_client','API测试消息','text','sent',NULL,NULL,NULL,'2026-01-09 08:18:29','2026-01-09 08:18:29',5757,NULL,NULL),
(2049,31,'admin','admin_client','1111','text','read',NULL,NULL,NULL,'2026-03-07 07:01:52','2026-06-16 19:06:00',22685,NULL,NULL),
(2156,32,'user','user_client','14111','text','read',NULL,NULL,NULL,'2026-04-27 08:46:05','2026-04-27 08:46:30',22739,NULL,NULL),
(2156,32,'user','user_client','你好','text','read',NULL,NULL,NULL,'2026-05-12 07:50:44','2026-05-27 01:51:51',22741,NULL,NULL),
(2156,32,'user','user_client','你好','text','read',NULL,NULL,NULL,'2026-05-12 07:50:52','2026-05-27 01:51:51',22742,NULL,NULL),
(2156,32,'user','user_client','宝宝👶🏻你好啊','text','read',NULL,NULL,NULL,'2026-05-27 01:51:42','2026-05-27 01:51:51',22744,NULL,NULL),
(2156,31,'admin','admin_client','您好，有什么可以帮助您的吗？','text','read',NULL,NULL,NULL,'2026-05-27 01:52:04','2026-05-27 02:07:12',22745,NULL,NULL),
(2156,31,'admin','admin_client','感谢您的反馈，我们会尽快处理','text','read',NULL,NULL,NULL,'2026-05-27 01:52:08','2026-05-27 02:07:12',22746,NULL,NULL),
(2156,31,'admin','admin_client','祝您使用愉快！','text','read',NULL,NULL,NULL,'2026-05-27 01:52:19','2026-05-27 02:07:12',22747,NULL,NULL),
(2156,32,'user','user_client','好好的','text','read',NULL,NULL,NULL,'2026-05-27 02:07:17','2026-05-27 02:59:11',22748,NULL,NULL),
(2156,32,'user','user_client','好说好说','text','read',NULL,NULL,NULL,'2026-05-27 02:46:11','2026-05-27 02:59:11',22749,NULL,NULL),
(2156,32,'user','user_client','1','text','read',NULL,NULL,NULL,'2026-05-28 05:12:38','2026-06-14 03:23:21',22750,NULL,NULL),
(2185,33,'user','user_client','好说好说','text','read',NULL,NULL,NULL,'2026-06-14 03:18:12','2026-06-14 03:19:11',22767,NULL,NULL),
(2156,32,'user','user_client','哈哈哈哈','text','read',NULL,NULL,NULL,'2026-06-14 03:23:13','2026-06-14 06:51:01',22768,NULL,NULL),
(2185,33,'user','user_client','1111','text','read',NULL,NULL,NULL,'2026-06-14 04:06:14','2026-06-14 04:21:27',22769,NULL,NULL),
(2185,33,'user','user_client','111','text','read',NULL,NULL,NULL,'2026-06-14 04:06:21','2026-06-14 04:21:27',22770,NULL,NULL),
(2185,33,'user','user_client','1111','text','read',NULL,NULL,NULL,'2026-06-14 04:06:29','2026-06-14 04:21:27',22771,NULL,NULL),
(2185,32,'admin','admin_client','11111','text','read',NULL,NULL,NULL,'2026-06-14 04:22:09','2026-06-14 04:22:20',22773,NULL,NULL),
(2185,32,'admin','admin_client','8888','text','sent',NULL,NULL,NULL,'2026-06-14 04:22:23','2026-06-14 04:22:23',22774,NULL,NULL),
(2156,32,'user','user_client','hdhhd','text','read',NULL,NULL,NULL,'2026-06-14 07:57:44','2026-06-14 07:57:50',22777,NULL,NULL),
(2185,32,'admin','admin_client','hdhs','text','sent',NULL,NULL,NULL,'2026-06-14 08:32:40','2026-06-14 08:32:40',22778,NULL,NULL),
(2156,32,'user','user_client','98765431','text','read',NULL,NULL,NULL,'2026-06-14 08:32:59','2026-06-14 08:33:03',22779,NULL,NULL),
(2186,12767,'user','user_client','您好','text','read',NULL,NULL,NULL,'2026-06-14 23:19:56','2026-06-15 01:51:41',22780,NULL,NULL),
(2186,32,'admin','admin_client','探探糖','text','sent',NULL,NULL,NULL,'2026-06-15 01:51:46','2026-06-15 01:51:46',22781,NULL,NULL),
(2156,32,'user','user_client','https://objectstorageapi.bja.sealos.run/br0za7uc-tiangong/chat-images/1781607772426_4a662204ffb97ae3.jpg','image','read',NULL,NULL,NULL,'2026-06-16 19:02:52','2026-06-16 19:03:23',22782,NULL,NULL),
(2156,32,'user','user_client','你姐姐','text','sent',NULL,NULL,NULL,'2026-06-22 03:00:26','2026-06-22 03:00:26',22808,NULL,NULL);
/*!40000 ALTER TABLE `chat_messages` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:11
