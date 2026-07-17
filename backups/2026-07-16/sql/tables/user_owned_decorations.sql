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
-- Table structure for table `user_owned_decorations`
--

DROP TABLE IF EXISTS `user_owned_decorations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_owned_decorations` (
  `user_owned_decoration_id` bigint NOT NULL AUTO_INCREMENT COMMENT '用户拥有装饰主键',
  `user_id` int NOT NULL COMMENT '用户ID，FK→users.user_id',
  `decoration_sku_id` int NOT NULL COMMENT '装饰SKU ID，FK→decoration_sku.decoration_sku_id',
  `equipped` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否佩戴中（仅影响 UI 展示，不进任何业务计算）',
  `acquired_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '获得时间（北京时间）',
  `expires_at` datetime DEFAULT NULL COMMENT '到期时间（NULL=永久；限时装饰到期后由定时任务清理）',
  `status` enum('active','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '持有状态：active-有效 expired-已过期',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (`user_owned_decoration_id`),
  UNIQUE KEY `uk_user_owned_deco_user_sku` (`user_id`,`decoration_sku_id`),
  KEY `decoration_sku_id` (`decoration_sku_id`),
  KEY `idx_user_owned_deco_user_status` (`user_id`,`status`),
  KEY `idx_user_owned_deco_expires` (`expires_at`),
  CONSTRAINT `user_owned_decorations_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `user_owned_decorations_ibfk_2` FOREIGN KEY (`decoration_sku_id`) REFERENCES `decoration_sku` (`decoration_sku_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户拥有装饰表（佩戴态+到期，纯展示不进业务计算）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_owned_decorations`
--

LOCK TABLES `user_owned_decorations` WRITE;
/*!40000 ALTER TABLE `user_owned_decorations` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_owned_decorations` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:54
