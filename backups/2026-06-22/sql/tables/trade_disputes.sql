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
-- Table structure for table `trade_disputes`
--

DROP TABLE IF EXISTS `trade_disputes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `trade_disputes` (
  `trade_dispute_id` bigint NOT NULL AUTO_INCREMENT COMMENT '售后申诉主键ID',
  `user_id` int NOT NULL COMMENT '申诉人（买家）用户ID → users.user_id',
  `order_type` enum('redemption','consumption') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '订单类型：redemption-兑换订单 / consumption-消费核销（C2C trade/auction 已随 C2C 下线移除）',
  `order_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '关联订单ID（多态值，统一字符串存储兼容 BIGINT 和 UUID）',
  `dispute_type` enum('item_not_received','item_mismatch','quality_issue','fraud','other') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '纠纷类型：未收到物品/物品不符/质量问题/欺诈/其他',
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '申诉标题',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '申诉描述',
  `evidence` json DEFAULT NULL COMMENT '证据（截图URL数组、订单快照等，对应旧 dispute_evidence）',
  `status` enum('open','reviewing','arbitrating','resolved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open' COMMENT '申诉状态机：open→reviewing→arbitrating→resolved/rejected',
  `priority` enum('low','medium','high','urgent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'high' COMMENT '申诉优先级',
  `assigned_to` int DEFAULT NULL COMMENT '处理客服用户ID（内部字段，下发小程序时脱敏）',
  `approval_chain_instance_id` bigint DEFAULT NULL COMMENT '仲裁审批链实例ID（内部字段，下发小程序时脱敏）',
  `deadline` datetime DEFAULT NULL COMMENT '处理截止时间（超时升级，对应旧 dispute_deadline）',
  `resolution` text COLLATE utf8mb4_unicode_ci COMMENT '处理结果说明（下发小程序的用户可见摘要）',
  `resolved_at` datetime DEFAULT NULL COMMENT '处理完成时间',
  `created_by` int DEFAULT NULL COMMENT '发起人用户ID（自助=买家本人，代发=客服）',
  `created_at` datetime NOT NULL COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL COMMENT '更新时间（北京时间）',
  PRIMARY KEY (`trade_dispute_id`),
  KEY `idx_trade_disputes_user_id` (`user_id`),
  KEY `idx_trade_disputes_status` (`status`),
  KEY `idx_trade_disputes_order_polymorphic` (`order_type`,`order_id`),
  KEY `idx_trade_disputes_assigned_to` (`assigned_to`),
  KEY `idx_trade_disputes_created_at` (`created_at`),
  CONSTRAINT `fk_trade_disputes_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=123 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='交易售后申诉表（用户可见的纠纷/售后流程，由方案A 从客服工单表拆出）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `trade_disputes`
--

LOCK TABLES `trade_disputes` WRITE;
/*!40000 ALTER TABLE `trade_disputes` DISABLE KEYS */;
INSERT INTO `trade_disputes` VALUES
(120,32,'consumption','3059','item_not_received','ttt','444那我你是你是男的女的奶奶的嫩嫩多娜多娜多娜多娜',NULL,'open','high',NULL,NULL,'2026-06-23 02:08:11',NULL,NULL,32,'2026-06-16 02:08:11','2026-06-16 02:08:11');
/*!40000 ALTER TABLE `trade_disputes` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:15
