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
-- Table structure for table `customer_service_agents`
--

DROP TABLE IF EXISTS `customer_service_agents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_service_agents` (
  `customer_service_agent_id` int NOT NULL AUTO_INCREMENT COMMENT '客服座席主键ID',
  `user_id` int NOT NULL COMMENT '关联用户ID（一个用户只能注册为一个客服座席）',
  `display_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客服显示名称（在客服工作台和用户端展示）',
  `max_concurrent_sessions` int NOT NULL DEFAULT '10' COMMENT '最大并发会话数（超过此数不再自动分配新会话）',
  `current_session_count` int NOT NULL DEFAULT '0' COMMENT '当前活跃会话数（反规范化字段，由业务逻辑维护）',
  `status` enum('active','inactive','on_break') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '座席状态：active=在岗可分配、inactive=离线/停用、on_break=暂时休息',
  `specialty` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '擅长领域标签（JSON数组字符串，如 ["售前咨询","技术支持","投诉处理"]）',
  `priority` int NOT NULL DEFAULT '0' COMMENT '分配优先级（数值越大越优先被分配）',
  `total_sessions_handled` int NOT NULL DEFAULT '0' COMMENT '累计处理会话总数',
  `average_satisfaction_score` decimal(3,2) NOT NULL DEFAULT '0.00' COMMENT '平均满意度评分（1.00-5.00）',
  `is_auto_assign_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否参与自动分配（false 则只能手动分配会话给该客服）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`customer_service_agent_id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `idx_cs_agents_status_priority` (`status`,`priority`),
  KEY `idx_cs_agents_auto_assign` (`is_auto_assign_enabled`,`status`),
  CONSTRAINT `customer_service_agents_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客服座席管理表（记录哪些用户是客服、配置、状态）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_service_agents`
--

LOCK TABLES `customer_service_agents` WRITE;
/*!40000 ALTER TABLE `customer_service_agents` DISABLE KEYS */;
/*!40000 ALTER TABLE `customer_service_agents` ENABLE KEYS */;
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
