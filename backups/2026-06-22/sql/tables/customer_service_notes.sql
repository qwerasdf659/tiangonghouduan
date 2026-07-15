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
-- Table structure for table `customer_service_notes`
--

DROP TABLE IF EXISTS `customer_service_notes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_service_notes` (
  `note_id` bigint NOT NULL AUTO_INCREMENT COMMENT '备注主键ID',
  `user_id` int NOT NULL COMMENT '关于哪个用户的备注',
  `issue_id` bigint DEFAULT NULL COMMENT '关联工单ID（可选）',
  `session_id` bigint DEFAULT NULL COMMENT '关联会话ID（可选）',
  `author_id` int NOT NULL COMMENT '备注作者（客服管理员user_id）',
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '备注内容',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`note_id`),
  KEY `session_id` (`session_id`),
  KEY `author_id` (`author_id`),
  KEY `idx_cs_notes_user_id` (`user_id`),
  KEY `idx_cs_notes_issue_id` (`issue_id`),
  CONSTRAINT `customer_service_notes_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_service_notes_ibfk_2` FOREIGN KEY (`issue_id`) REFERENCES `customer_service_issues` (`issue_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `customer_service_notes_ibfk_3` FOREIGN KEY (`session_id`) REFERENCES `customer_service_sessions` (`customer_service_session_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `customer_service_notes_ibfk_4` FOREIGN KEY (`author_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客服内部备注表 - 仅客服可见，用户不可见';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_service_notes`
--

LOCK TABLES `customer_service_notes` WRITE;
/*!40000 ALTER TABLE `customer_service_notes` DISABLE KEYS */;
/*!40000 ALTER TABLE `customer_service_notes` ENABLE KEYS */;
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
