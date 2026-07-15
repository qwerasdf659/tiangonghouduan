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
-- Table structure for table `approval_chain_instances`
--

DROP TABLE IF EXISTS `approval_chain_instances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `approval_chain_instances` (
  `instance_id` bigint NOT NULL AUTO_INCREMENT COMMENT '实例ID',
  `template_id` bigint NOT NULL COMMENT '使用的模板',
  `auditable_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务类型',
  `auditable_id` bigint NOT NULL COMMENT '业务记录ID',
  `content_review_record_id` bigint DEFAULT NULL COMMENT '关联的审核记录',
  `current_step` tinyint NOT NULL COMMENT '当前进行到的步骤',
  `total_steps` tinyint NOT NULL COMMENT '总步骤数',
  `status` enum('in_progress','completed','rejected','cancelled','timeout') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '整体状态',
  `submitted_by` int NOT NULL COMMENT '提交人',
  `submitted_at` datetime NOT NULL COMMENT '提交时间',
  `completed_at` datetime DEFAULT NULL COMMENT '完成时间',
  `final_result` enum('approved','rejected') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最终结果',
  `final_reason` text COLLATE utf8mb4_unicode_ci COMMENT '最终审批意见',
  `business_snapshot` json DEFAULT NULL COMMENT '提交时的业务数据快照',
  `idempotency_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等键',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (`instance_id`),
  UNIQUE KEY `uk_idempotency_key` (`idempotency_key`),
  KEY `idx_auditable` (`auditable_type`,`auditable_id`),
  KEY `idx_status_step` (`status`,`current_step`),
  KEY `idx_submitted_by` (`submitted_by`),
  KEY `fk_aci_template` (`template_id`),
  KEY `fk_aci_review` (`content_review_record_id`),
  CONSTRAINT `fk_aci_review` FOREIGN KEY (`content_review_record_id`) REFERENCES `content_review_records` (`content_review_record_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_aci_submitter` FOREIGN KEY (`submitted_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_aci_template` FOREIGN KEY (`template_id`) REFERENCES `approval_chain_templates` (`template_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=524 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审核链实例';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `approval_chain_instances`
--

LOCK TABLES `approval_chain_instances` WRITE;
/*!40000 ALTER TABLE `approval_chain_instances` DISABLE KEYS */;
INSERT INTO `approval_chain_instances` VALUES
(517,6,'consumption',3053,6283,2,2,'completed',32,'2026-06-12 05:22:51','2026-06-12 08:06:56','approved','审核通过','{\"store_id\": 11, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 2222}','approval_chain:consumption:3053','2026-06-12 05:22:51','2026-06-12 08:06:56'),
(518,6,'consumption',3054,6284,2,2,'completed',31,'2026-06-12 05:31:07','2026-06-12 08:06:48','approved','审核通过','{\"store_id\": 11, \"merchant_id\": 31, \"operator_id\": 31, \"submitted_by\": 31, \"consumption_amount\": 3666}','approval_chain:consumption:3054','2026-06-12 05:31:07','2026-06-12 08:06:48'),
(521,6,'consumption',3057,6287,2,2,'completed',31,'2026-06-13 02:31:05','2026-06-14 08:47:16','approved','核实无误，审核通过','{\"store_id\": 11, \"merchant_id\": 31, \"operator_id\": 31, \"submitted_by\": 31, \"consumption_amount\": 1369}','approval_chain:consumption:3057','2026-06-13 02:31:05','2026-06-14 08:47:16'),
(522,6,'consumption',3058,6288,2,2,'in_progress',32,'2026-06-13 02:32:26',NULL,NULL,NULL,'{\"store_id\": 11, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 3669}','approval_chain:consumption:3058','2026-06-13 02:32:26','2026-06-13 15:00:00'),
(523,6,'consumption',3059,6289,2,2,'completed',31,'2026-06-13 07:09:08','2026-06-13 07:29:15','approved','审核通过','{\"store_id\": 11, \"merchant_id\": 31, \"operator_id\": 31, \"submitted_by\": 31, \"consumption_amount\": 222}','approval_chain:consumption:3059','2026-06-13 07:09:08','2026-06-13 07:29:15');
/*!40000 ALTER TABLE `approval_chain_instances` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:09
