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
-- Table structure for table `customer_service_issues`
--

DROP TABLE IF EXISTS `customer_service_issues`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_service_issues` (
  `issue_id` bigint NOT NULL AUTO_INCREMENT COMMENT '工单主键ID',
  `user_id` int NOT NULL COMMENT '关联用户ID',
  `created_by` int NOT NULL COMMENT '创建人（客服管理员user_id）',
  `assigned_to` int DEFAULT NULL COMMENT '指派给（客服管理员user_id）',
  `session_id` bigint DEFAULT NULL COMMENT '关联的首次客服会话ID',
  `issue_type` enum('asset','lottery','item','account','consumption','other') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '工单问题类型（对应业务模块，纠纷已迁出至 trade_disputes）',
  `priority` enum('low','medium','high','urgent') COLLATE utf8mb4_unicode_ci DEFAULT 'medium' COMMENT '优先级：低/中/高/紧急',
  `status` enum('open','processing','resolved','closed') COLLATE utf8mb4_unicode_ci DEFAULT 'open' COMMENT '工单状态：待处理/处理中/已解决/已关闭',
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '工单标题',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '问题描述',
  `resolution` text COLLATE utf8mb4_unicode_ci COMMENT '处理结果',
  `compensation_log` json DEFAULT NULL COMMENT '补偿记录JSON（自动填充，格式：[{type, asset_code, amount, item_template_id, quantity}]）',
  `resolved_at` datetime DEFAULT NULL COMMENT '解决时间',
  `closed_at` datetime DEFAULT NULL COMMENT '关闭时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `order_type` enum('redemption','consumption') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '关联订单类型：redemption=兑换订单, consumption=消费核销（trade 已随 C2C 下线移除）',
  `order_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '关联订单ID（多态值，统一字符串存储兼容 BIGINT 和 UUID）',
  `feedback_id` int DEFAULT NULL COMMENT '聚合引用：关联的意见反馈ID → feedbacks.feedback_id',
  `dispute_id` bigint DEFAULT NULL COMMENT '聚合引用：关联的售后申诉ID → trade_disputes.trade_dispute_id',
  PRIMARY KEY (`issue_id`),
  KEY `created_by` (`created_by`),
  KEY `session_id` (`session_id`),
  KEY `idx_cs_issues_user_id` (`user_id`),
  KEY `idx_cs_issues_assigned_to` (`assigned_to`),
  KEY `idx_cs_issues_status` (`status`),
  KEY `idx_cs_issues_created_at` (`created_at`),
  KEY `idx_cs_issues_type` (`issue_type`),
  KEY `idx_issues_order_polymorphic` (`order_type`,`order_id`),
  KEY `idx_cs_issues_feedback_id` (`feedback_id`),
  KEY `idx_cs_issues_dispute_id` (`dispute_id`),
  CONSTRAINT `customer_service_issues_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_service_issues_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_service_issues_ibfk_3` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `customer_service_issues_ibfk_4` FOREIGN KEY (`session_id`) REFERENCES `customer_service_sessions` (`customer_service_session_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=168 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客服工单表 - GM工作台问题跟踪';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_service_issues`
--

LOCK TABLES `customer_service_issues` WRITE;
/*!40000 ALTER TABLE `customer_service_issues` DISABLE KEYS */;
/*!40000 ALTER TABLE `customer_service_issues` ENABLE KEYS */;
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
