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
-- Table structure for table `customer_service_user_assignments`
--

DROP TABLE IF EXISTS `customer_service_user_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_service_user_assignments` (
  `customer_service_user_assignment_id` int NOT NULL AUTO_INCREMENT COMMENT '分配记录主键ID',
  `user_id` int NOT NULL COMMENT '被分配的用户ID（客户）',
  `agent_id` int NOT NULL COMMENT '分配到的客服座席ID',
  `assigned_by` int NOT NULL COMMENT '执行分配操作的管理员ID',
  `status` enum('active','expired','transferred') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '分配状态：active=生效中、expired=已过期、transferred=已转移',
  `notes` text COLLATE utf8mb4_unicode_ci COMMENT '分配备注说明',
  `expired_at` datetime DEFAULT NULL COMMENT '过期时间（null 表示永不过期）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（即分配时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`customer_service_user_assignment_id`),
  UNIQUE KEY `uk_cs_user_assign_active` (`user_id`,`status`),
  KEY `assigned_by` (`assigned_by`),
  KEY `idx_cs_user_assign_agent` (`agent_id`,`status`),
  KEY `idx_cs_user_assign_status` (`status`),
  CONSTRAINT `customer_service_user_assignments_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_service_user_assignments_ibfk_2` FOREIGN KEY (`agent_id`) REFERENCES `customer_service_agents` (`customer_service_agent_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_service_user_assignments_ibfk_3` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客服用户分配表（记录用户被分配给哪个客服）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_service_user_assignments`
--

LOCK TABLES `customer_service_user_assignments` WRITE;
/*!40000 ALTER TABLE `customer_service_user_assignments` DISABLE KEYS */;
/*!40000 ALTER TABLE `customer_service_user_assignments` ENABLE KEYS */;
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
