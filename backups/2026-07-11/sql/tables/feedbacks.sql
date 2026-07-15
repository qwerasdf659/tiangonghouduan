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
-- Table structure for table `feedbacks`
--

DROP TABLE IF EXISTS `feedbacks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `feedbacks` (
  `feedback_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL COMMENT '外键引用（允许NULL）',
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
  PRIMARY KEY (`feedback_id`),
  KEY `idx_feedbacks_user_status` (`user_id`,`status`),
  KEY `idx_feedbacks_category_priority` (`category`,`priority`),
  KEY `idx_feedbacks_status_created` (`status`,`created_at`),
  KEY `idx_feedbacks_admin_id` (`admin_id`),
  CONSTRAINT `feedbacks_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `feedbacks_ibfk_2` FOREIGN KEY (`admin_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=429 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户反馈表 - 支持客服反馈功能';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `feedbacks`
--

LOCK TABLES `feedbacks` WRITE;
/*!40000 ALTER TABLE `feedbacks` DISABLE KEYS */;
INSERT INTO `feedbacks` VALUES
(393,32,'other','这是一条测试反馈内容',NULL,'pending','medium','::ffff:127.0.0.1','{\"platform\": \"unknown\"}',NULL,NULL,NULL,NULL,'72','2026-06-25 05:31:23','2026-06-25 05:31:23'),
(394,32,'other','这是一条测试反馈内容',NULL,'pending','medium','::ffff:127.0.0.1','{\"platform\": \"unknown\"}',NULL,NULL,NULL,NULL,'72','2026-06-25 05:32:10','2026-06-25 05:32:10'),
(395,32,'technical','测试反馈内容 1',NULL,'pending','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(396,32,'feature','测试反馈内容 2',NULL,'processing','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(397,32,'bug','测试反馈内容 3',NULL,'replied','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(398,32,'suggestion','测试反馈内容 4',NULL,'closed','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(399,32,'technical','测试反馈内容 5',NULL,'pending','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(400,32,'feature','测试反馈内容 6',NULL,'processing','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(401,32,'suggestion','测试反馈内容 8',NULL,'closed','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(402,32,'bug','测试反馈内容 7',NULL,'replied','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(403,32,'technical','测试反馈内容 9',NULL,'pending','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(404,32,'feature','测试反馈内容 10',NULL,'processing','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(405,32,'bug','测试反馈内容 11',NULL,'replied','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(406,32,'suggestion','测试反馈内容 12',NULL,'closed','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(407,32,'technical','测试反馈内容 13',NULL,'pending','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(408,32,'feature','测试反馈内容 14',NULL,'processing','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(409,32,'bug','测试反馈内容 15',NULL,'replied','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(410,32,'suggestion','测试反馈内容 16',NULL,'closed','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(411,32,'technical','测试反馈内容 17',NULL,'pending','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(412,32,'feature','测试反馈内容 18',NULL,'processing','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(413,32,'suggestion','测试反馈内容 20',NULL,'closed','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(414,32,'technical','测试反馈内容 21',NULL,'pending','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(415,32,'feature','测试反馈内容 22',NULL,'processing','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(416,32,'bug','测试反馈内容 23',NULL,'replied','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(417,32,'bug','测试反馈内容 19',NULL,'replied','medium',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-25 05:32:46','2026-06-25 05:32:46'),
(418,32,'other','这是一条测试反馈内容',NULL,'pending','medium','::ffff:127.0.0.1','{\"platform\": \"unknown\"}',NULL,NULL,NULL,NULL,'72','2026-07-06 03:19:18','2026-07-06 03:19:18'),
(419,32,'other','这是一条测试反馈内容',NULL,'pending','medium','::ffff:127.0.0.1','{\"platform\": \"unknown\"}',NULL,NULL,NULL,NULL,'72','2026-07-06 03:38:27','2026-07-06 03:38:27'),
(420,32,'other','这是一条测试反馈内容',NULL,'pending','medium','::ffff:127.0.0.1','{\"platform\": \"unknown\"}',NULL,NULL,NULL,NULL,'72','2026-07-06 03:39:01','2026-07-06 03:39:01'),
(421,32,'other','这是一条测试反馈内容',NULL,'pending','medium','::ffff:127.0.0.1','{\"platform\": \"unknown\"}',NULL,NULL,NULL,NULL,'72','2026-07-06 03:39:39','2026-07-06 03:39:39'),
(422,32,'other','这是一条测试反馈内容',NULL,'pending','medium','::ffff:127.0.0.1','{\"platform\": \"unknown\"}',NULL,NULL,NULL,NULL,'72','2026-07-06 03:39:53','2026-07-06 03:39:53'),
(423,32,'other','这是一条测试反馈内容',NULL,'pending','medium','::ffff:127.0.0.1','{\"platform\": \"unknown\"}',NULL,NULL,NULL,NULL,'72','2026-07-06 06:47:44','2026-07-06 06:47:44'),
(424,32,'other','这是一条测试反馈内容',NULL,'pending','medium','::ffff:127.0.0.1','{\"platform\": \"unknown\"}',NULL,NULL,NULL,NULL,'72','2026-07-11 01:48:50','2026-07-11 01:48:50'),
(425,32,'other','这是一条测试反馈内容',NULL,'pending','medium','::ffff:127.0.0.1','{\"platform\": \"unknown\"}',NULL,NULL,NULL,NULL,'72','2026-07-11 01:49:29','2026-07-11 01:49:29'),
(426,32,'other','这是一条测试反馈内容',NULL,'pending','medium','::ffff:127.0.0.1','{\"platform\": \"unknown\"}',NULL,NULL,NULL,NULL,'72','2026-07-11 01:51:13','2026-07-11 01:51:13'),
(427,32,'other','这是一条测试反馈内容',NULL,'pending','medium','::ffff:127.0.0.1','{\"platform\": \"unknown\"}',NULL,NULL,NULL,NULL,'72','2026-07-11 01:53:10','2026-07-11 01:53:10'),
(428,32,'other','这是一条测试反馈内容',NULL,'pending','medium','::ffff:127.0.0.1','{\"platform\": \"unknown\"}',NULL,NULL,NULL,NULL,'72','2026-07-11 01:53:40','2026-07-11 01:53:40');
/*!40000 ALTER TABLE `feedbacks` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-10 18:10:57
