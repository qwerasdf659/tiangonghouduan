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
-- Table structure for table `approval_chain_templates`
--

DROP TABLE IF EXISTS `approval_chain_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `approval_chain_templates` (
  `template_id` bigint NOT NULL AUTO_INCREMENT COMMENT '模板ID',
  `template_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模板编码（如 consumption_default）',
  `template_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模板名称（如"消费审核-标准链"）',
  `auditable_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '关联业务类型（consumption/merchant_points/exchange）',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '描述',
  `total_nodes` tinyint NOT NULL COMMENT '审核节点数（1-8，不含提交节点）',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `priority` int NOT NULL DEFAULT '0' COMMENT '优先级（多个模板时按条件匹配优先级，数值越大优先级越高）',
  `match_conditions` json DEFAULT NULL COMMENT '匹配条件（JSON，如 {"min_amount":200}）',
  `created_by` int DEFAULT NULL COMMENT '创建人',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`template_id`),
  UNIQUE KEY `uk_template_code` (`template_code`),
  KEY `idx_auditable_type_active` (`auditable_type`,`is_active`),
  KEY `fk_act_created_by` (`created_by`),
  CONSTRAINT `fk_act_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审核链模板';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `approval_chain_templates`
--

LOCK TABLES `approval_chain_templates` WRITE;
/*!40000 ALTER TABLE `approval_chain_templates` DISABLE KEYS */;
INSERT INTO `approval_chain_templates` VALUES
(5,'consumption_default','消费审核-默认链','consumption','所有消费记录的默认审核链（1级admin终审），兜底配置',1,1,0,'{}',NULL,'2026-03-10 08:18:51','2026-03-10 08:18:51'),
(6,'consumption_large','消费审核-大额链','consumption','消费金额≥200元的审核链（2级：业务经理初审→admin终审）',2,0,10,'{\"min_amount\": 200}',NULL,'2026-03-10 08:18:51','2026-06-25 04:40:41'),
(7,'merchant_points_default','商家积分审核-默认链','merchant_points','商家积分申请的默认审核链（1级admin终审）',1,1,0,'{}',NULL,'2026-03-10 08:18:51','2026-03-10 08:18:51'),
(9,'merchant_points_large','商家积分审核-大额链','merchant_points','商家积分申请≥1000的审核链（2级：业务经理初审→admin终审）',2,1,10,'{\"min_amount\": 1000}',NULL,'2026-06-13 04:03:40','2026-06-13 04:03:40');
/*!40000 ALTER TABLE `approval_chain_templates` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:48
