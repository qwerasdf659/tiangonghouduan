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
-- Table structure for table `customer_service_sessions`
--

DROP TABLE IF EXISTS `customer_service_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_service_sessions` (
  `user_id` int DEFAULT NULL COMMENT '外键引用（允许NULL）',
  `admin_id` int DEFAULT NULL COMMENT '分配的管理员ID（基于UUID角色系统验证管理员权限）',
  `status` enum('waiting','assigned','active','closed') COLLATE utf8mb4_unicode_ci DEFAULT 'waiting' COMMENT '会话状态',
  `source` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT 'mobile' COMMENT '来源渠道',
  `priority` int DEFAULT '1' COMMENT '优先级(1-5)',
  `last_message_at` datetime DEFAULT NULL COMMENT '最后消息时间',
  `closed_at` datetime DEFAULT NULL COMMENT '关闭时间',
  `close_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '关闭原因（最长500字符，如：问题已解决、用户未回复、恶意会话等）',
  `closed_by` int DEFAULT NULL COMMENT '关闭操作人ID（外键关联users表的user_id，记录哪个管理员关闭的会话）',
  `satisfaction_score` int DEFAULT NULL COMMENT '满意度评分(1-5)',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  `customer_service_session_id` bigint NOT NULL AUTO_INCREMENT,
  `is_active_session` tinyint(1) GENERATED ALWAYS AS ((case when (`status` in (_utf8mb4'waiting',_utf8mb4'assigned',_utf8mb4'active')) then 1 else NULL end)) VIRTUAL COMMENT '虚拟列:标识活跃会话(1=活跃,NULL=已关闭),用于部分唯一索引',
  `first_response_at` datetime DEFAULT NULL COMMENT '客服首次响应时间（用于计算响应时长）',
  `issue_id` bigint DEFAULT NULL COMMENT '关联工单ID（一个工单可关联多个会话）',
  `tags` json DEFAULT NULL COMMENT '会话标签JSON数组（如 ["交易纠纷","已补偿"]）',
  `resolution_summary` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '处理摘要（关闭时填写，历史会话Tab展示）',
  PRIMARY KEY (`customer_service_session_id`),
  UNIQUE KEY `idx_user_active_session` (`user_id`,`is_active_session`),
  KEY `idx_customer_sessions_user_id` (`user_id`),
  KEY `idx_customer_sessions_admin_id` (`admin_id`),
  KEY `idx_customer_sessions_status` (`status`),
  KEY `idx_customer_sessions_created_at` (`created_at`),
  KEY `idx_closed_by` (`closed_by`),
  KEY `idx_css_status_created_at` (`status`,`created_at`),
  KEY `idx_css_admin_status` (`admin_id`,`status`),
  KEY `idx_cs_sessions_issue_id` (`issue_id`),
  CONSTRAINT `customer_service_sessions_issue_id_foreign_idx` FOREIGN KEY (`issue_id`) REFERENCES `customer_service_issues` (`issue_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_customer_sessions_admin_id` FOREIGN KEY (`admin_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_customer_sessions_closed_by` FOREIGN KEY (`closed_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_customer_sessions_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2230 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户聊天会话表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_service_sessions`
--

LOCK TABLES `customer_service_sessions` WRITE;
/*!40000 ALTER TABLE `customer_service_sessions` DISABLE KEYS */;
INSERT INTO `customer_service_sessions` VALUES
(12799,32,'active','mobile',1,'2026-06-25 00:57:54',NULL,NULL,NULL,NULL,'2026-06-25 00:56:54','2026-06-25 00:57:54',2196,1,NULL,NULL,NULL,NULL),
(32,NULL,'closed','mobile',1,'2026-07-11 10:02:25',NULL,NULL,NULL,NULL,'2026-06-25 01:37:09','2026-07-11 10:02:25',2197,NULL,NULL,NULL,NULL,NULL),
(12800,NULL,'waiting','mobile',1,'2026-06-26 00:21:13',NULL,NULL,NULL,NULL,'2026-06-26 00:21:05','2026-06-26 00:21:13',2217,1,NULL,NULL,NULL,NULL),
(32,NULL,'waiting','system_notification',1,NULL,NULL,NULL,NULL,NULL,'2026-07-11 10:02:25','2026-07-11 10:02:25',2227,1,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `customer_service_sessions` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:49
