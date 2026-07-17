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
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `role_id` int NOT NULL AUTO_INCREMENT,
  `role_uuid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '角色UUID标识（安全不可推测）',
  `role_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '角色名称（仅内部使用）',
  `role_level` int NOT NULL DEFAULT '0' COMMENT '角色级别（0=普通用户，100=超级管理员）',
  `permissions` json DEFAULT NULL COMMENT '角色权限配置（JSON格式）',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '角色描述',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '角色是否启用',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `role_uuid` (`role_uuid`),
  UNIQUE KEY `role_name` (`role_name`),
  KEY `roles_role_level` (`role_level`),
  KEY `roles_is_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=262 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色管理表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES
(1,'5f2c25c2-d507-408d-b6c6-a5c448895afd','user',0,'{\"points\": [\"read\"], \"lottery\": [\"read\", \"participate\"], \"profile\": [\"read\", \"update\"]}','普通用户',1,'2025-09-29 01:01:17','2025-09-30 04:24:47'),
(2,'a4657bb4-c9f1-4506-a016-f2fd61580088','admin',100,'{\"*\": [\"*\"]}','管理员',1,'2025-09-29 01:01:17','2025-09-30 04:24:47'),
(5,'ec2145e1-48f8-40a0-ae02-b4ff105948e3','campaign_2',10,'\"{\\\"campaign\\\":[\\\"access\\\"],\\\"description\\\":\\\"活动参与权限\\\"}\"','餐厅积分抽奖权限',1,'2025-10-03 06:25:38','2025-10-03 06:25:38'),
(6,'efb852c0-edd8-4e8f-a086-3c61a0e74ff0','regional_manager',80,'{\"staff\": [\"read\", \"create\", \"update\", \"delete\"], \"users\": [\"read\", \"create\", \"update\", \"delete\"], \"stores\": [\"read\", \"create\", \"update\", \"delete\"], \"reports\": [\"read\"], \"hierarchy\": [\"read\", \"create\", \"update\", \"delete\"], \"consumption\": [\"read\", \"create\", \"update\", \"delete\"]}','区域负责人（可管理业务经理和业务员，查看所有业务数据，权限级别80）',1,'2025-11-08 06:28:17','2025-11-08 06:28:17'),
(7,'4edf8681-a05b-4c45-8029-e99175a07dcf','business_manager',60,'{\"staff\": [\"read\", \"create\", \"update\"], \"stores\": [\"read\", \"update\"], \"reports\": [\"read\"], \"hierarchy\": [\"read\"], \"consumption\": [\"read\", \"create\", \"update\", \"delete\"]}','业务经理（可管理业务员，录入和管理消费记录，查看业务报表，权限级别60）',1,'2025-11-08 06:28:17','2025-11-08 06:28:17'),
(8,'18728b8a-d78e-4860-8721-38d41f023f21','sales_staff',40,'{\"stores\": [\"read\"], \"profile\": [\"read\", \"update\"], \"consumption\": [\"read\", \"create\"]}','业务员（可录入消费记录，查看分配门店信息，管理个人信息，权限级别40）',1,'2025-11-08 06:28:17','2025-11-08 06:28:17'),
(9,'c7010363-eb63-11f0-8c85-c63f831111ac','ops',30,'{\"auth\": [\"read\"], \"assets\": [\"read\"], \"config\": [\"read\"], \"system\": [\"read\"], \"material\": [\"read\"], \"settings\": [\"read\"], \"analytics\": [\"read\"], \"prize-pool\": [\"read\"], \"marketplace\": [\"read\"], \"lottery-quota\": [\"read\"], \"popup-banners\": [\"read\"], \"campaign-budget\": [\"read\"], \"user-management\": [\"read\"], \"asset-adjustment\": [\"read\"], \"customer-service\": [\"read\"], \"lottery-management\": [\"read\"]}','运营只读角色（可查询所有后台数据，不可修改）',1,'2026-01-07 08:57:02','2026-01-07 08:57:02'),
(10,'0cd0b3fd-ef0b-11f0-8c85-c63f831111ac','merchant_staff',20,'{\"consumption\": [\"create\", \"read\", \"scan_user\"]}','商家员工角色（可执行消费录入，不可管理员工）',1,'2026-01-12 00:31:58','2026-01-12 01:48:33'),
(11,'0cd16546-ef0b-11f0-8c85-c63f831111ac','merchant_manager',40,'{\"staff\": [\"manage\", \"read\"], \"store\": [\"read\"], \"consumption\": [\"create\", \"read\", \"scan_user\"]}','商家店长角色（可执行消费录入，可管理本店员工）',1,'2026-01-12 00:31:58','2026-01-12 01:48:33'),
(100,'1188fcde-730f-4618-b26c-4bdf4a43b88d','system_job',-1,'{\"system\": [\"execute_scheduled_tasks\", \"manage_frozen_assets\", \"audit_log_write\"]}','系统定时任务专用角色（用于孤儿冻结检测、自动清理等后台任务）',1,'2026-01-15 06:14:22','2026-01-15 06:14:22'),
(107,'1db1efdc-caa9-404a-8c49-474070b18b20','test_role_api',15,'{\"users\": [\"read\", \"update\"], \"reports\": [\"read\"]}','更新后的测试角色描述',0,'2026-01-26 18:35:39','2026-01-26 18:35:47'),
(254,'133bd716-5b45-4cf3-8d70-5c262ca4fde0','super_admin',110,'{\"*\": [\"*\"]}','超级管理员（顶层，可管理其他管理员的角色/级别；平级互锁之上的唯一上层）',1,'2026-06-13 07:15:30','2026-06-13 07:15:30');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:52
