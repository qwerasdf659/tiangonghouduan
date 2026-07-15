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
  `message_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'text' COMMENT '消息内容类型（合法值来自 system_dictionaries.dict_type=message_type：text/image/file/location）',
  `status` enum('sending','sent','delivered','read') COLLATE utf8mb4_unicode_ci DEFAULT 'sent' COMMENT '消息状态',
  `reply_to_id` bigint DEFAULT NULL COMMENT '回复的消息ID',
  `temp_message_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '临时消息ID(前端生成)',
  `metadata` json DEFAULT NULL COMMENT '扩展数据(图片信息等)',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `chat_message_id` bigint NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`chat_message_id`),
  UNIQUE KEY `new_message_id` (`chat_message_id`),
  KEY `idx_chat_messages_session_id` (`customer_service_session_id`),
  KEY `idx_chat_messages_sender_id` (`sender_id`),
  KEY `idx_chat_messages_created_at` (`created_at`),
  KEY `idx_chat_messages_temp_message_id` (`temp_message_id`),
  KEY `idx_chat_messages_source_type` (`message_source`,`sender_type`),
  CONSTRAINT `fk_chat_messages_sender_id` FOREIGN KEY (`sender_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_chat_messages_session` FOREIGN KEY (`customer_service_session_id`) REFERENCES `customer_service_sessions` (`customer_service_session_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=22843 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天消息表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `chat_messages`
--

LOCK TABLES `chat_messages` WRITE;
/*!40000 ALTER TABLE `chat_messages` DISABLE KEYS */;
INSERT INTO `chat_messages` VALUES
(2196,12799,'user','user_client','好说好说','text','read',NULL,NULL,NULL,'2026-06-25 00:56:58','2026-06-25 00:57:18',22809),
(2196,32,'admin','admin_client','您好啊 怎么了','text','read',NULL,NULL,NULL,'2026-06-25 00:57:25','2026-06-25 00:57:27',22810),
(2196,12799,'user','user_client','tmp_3f99e5ed2f6adf401c357cdc73dd8f17d7a80d69c889a2bac51327f9e864440e.xlsx','file','read',NULL,NULL,'{\"file_url\": \"https://objectstorageapi.bja.sealos.run/br0za7uc-tiangong/chat-files/1782320274815_d16bbf971bd09768.xlsx\", \"file_name\": \"tmp_3f99e5ed2f6adf401c357cdc73dd8f17d7a80d69c889a2bac51327f9e864440e.xlsx\", \"file_size\": 14694}','2026-06-25 00:57:54','2026-06-25 05:43:06',22811),
(2197,32,'user','user_client','好说好说','text','read',NULL,NULL,NULL,'2026-06-25 01:37:12','2026-06-25 01:37:23',22812),
(2197,32,'user','user_client','[图片]','image','read',NULL,NULL,'{\"image_url\": \"https://objectstorageapi.bja.sealos.run/br0za7uc-tiangong/chat-images/1782322639431_c8c0ae7cf4c07003.jpg\"}','2026-06-25 01:37:19','2026-06-25 05:43:06',22813),
(2197,32,'user','user_client','[图片]','image','read',NULL,NULL,'{\"image_url\": \"https://objectstorageapi.bja.sealos.run/br0za7uc-tiangong/chat-images/1782322650496_55724decd05074d6.jpg\"}','2026-06-25 01:37:30','2026-06-25 05:43:06',22814),
(2197,32,'user','user_client','tmp_b101e62dc94fa4da491030837112989dfd4a6a9daf273160.pdf','file','read',NULL,NULL,'{\"file_url\": \"https://objectstorageapi.bja.sealos.run/br0za7uc-tiangong/chat-files/1782322791586_baa5b39d066a291c.pdf\", \"file_name\": \"tmp_b101e62dc94fa4da491030837112989dfd4a6a9daf273160.pdf\", \"file_size\": 105183}','2026-06-25 01:39:51','2026-06-25 05:43:06',22815),
(2197,32,'user','user_client','tmp_d6b86e3e70e26de737f81408fd437405dd5d0b466c8c3e21.pdf','file','read',NULL,NULL,'{\"file_url\": \"https://objectstorageapi.bja.sealos.run/br0za7uc-tiangong/chat-files/1782323280457_3a9b2dc8e0f008cd.pdf\", \"file_name\": \"tmp_d6b86e3e70e26de737f81408fd437405dd5d0b466c8c3e21.pdf\", \"file_size\": 106119}','2026-06-25 01:48:00','2026-06-25 05:43:06',22816),
(2217,12800,'user','user_client','哈哈哈','text','read',NULL,NULL,NULL,'2026-06-26 00:21:08','2026-07-06 08:47:15',22839),
(2217,12800,'user','user_client','广东省东莞市东莞市连升中路辅路','location','read',NULL,NULL,'{\"name\": \"东莞市虎门不夜天美食广场(连升中路西)\", \"address\": \"广东省东莞市东莞市连升中路辅路\", \"latitude\": 22.808989, \"longitude\": 113.68616}','2026-06-26 00:21:13','2026-07-06 08:47:15',22840);
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

-- Dump completed on 2026-07-10 18:10:56
