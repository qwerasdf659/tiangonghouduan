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
-- Table structure for table `user_hierarchy`
--

DROP TABLE IF EXISTS `user_hierarchy`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_hierarchy` (
  `user_hierarchy_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '用户ID（当前用户）',
  `superior_user_id` int DEFAULT NULL COMMENT '上级用户ID（NULL表示顶级区域负责人）',
  `role_id` int NOT NULL COMMENT '当前角色ID（关联roles表）',
  `store_id` int DEFAULT NULL COMMENT '所属门店ID（仅业务员有值，业务经理和区域负责人为NULL）',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '层级关系是否有效（1=激活，0=已停用）',
  `activated_at` datetime DEFAULT NULL COMMENT '激活时间（首次激活或重新激活时记录），时区：北京时间（GMT+8）',
  `deactivated_at` datetime DEFAULT NULL COMMENT '停用时间（停用时记录），时区：北京时间（GMT+8）',
  `deactivated_by` int DEFAULT NULL COMMENT '停用操作人ID（谁停用的？外键关联users.user_id）',
  `deactivation_reason` text COLLATE utf8mb4_unicode_ci COMMENT '停用原因（如：离职、调动、违规等）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间，时区：北京时间（GMT+8）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间，时区：北京时间（GMT+8）',
  PRIMARY KEY (`user_hierarchy_id`),
  UNIQUE KEY `uk_user_role` (`user_id`,`role_id`),
  KEY `idx_user_hierarchy_superior` (`superior_user_id`),
  KEY `idx_user_hierarchy_active` (`is_active`),
  KEY `fk_user_hierarchy_role` (`role_id`),
  KEY `fk_user_hierarchy_store` (`store_id`),
  KEY `fk_user_hierarchy_deactivator` (`deactivated_by`),
  CONSTRAINT `fk_user_hierarchy_deactivator` FOREIGN KEY (`deactivated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_user_hierarchy_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_user_hierarchy_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`store_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_user_hierarchy_superior` FOREIGN KEY (`superior_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_user_hierarchy_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户层级关系表（简化版：仅保留核心字段和必要索引）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_hierarchy`
--

LOCK TABLES `user_hierarchy` WRITE;
/*!40000 ALTER TABLE `user_hierarchy` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_hierarchy` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-10 18:11:00
