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
) ENGINE=InnoDB AUTO_INCREMENT=692 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审核链实例';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `approval_chain_instances`
--

LOCK TABLES `approval_chain_instances` WRITE;
/*!40000 ALTER TABLE `approval_chain_instances` DISABLE KEYS */;
INSERT INTO `approval_chain_instances` VALUES
(524,6,'consumption',3060,6302,2,2,'completed',32,'2026-06-22 20:38:39','2026-06-25 04:32:17','approved','核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 2588}','approval_chain:consumption:3060','2026-06-22 20:38:39','2026-06-25 04:32:17'),
(525,6,'consumption',3061,6303,2,2,'completed',32,'2026-06-22 22:32:24','2026-06-25 04:32:19','approved','核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 365}','approval_chain:consumption:3061','2026-06-22 22:32:24','2026-06-25 04:32:19'),
(540,5,'consumption',3076,6318,1,1,'completed',32,'2026-06-24 20:41:32','2026-06-25 04:32:35','approved','核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 88.5}','approval_chain:consumption:3076','2026-06-24 20:41:32','2026-06-25 04:32:35'),
(541,5,'consumption',3077,6319,1,1,'completed',32,'2026-06-24 20:41:32','2026-06-25 04:32:38','approved','核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 50}','approval_chain:consumption:3077','2026-06-24 20:41:32','2026-06-25 04:32:38'),
(542,5,'consumption',3078,6320,1,1,'completed',32,'2026-06-24 21:03:07','2026-06-25 04:32:41','approved','核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 88.5}','approval_chain:consumption:3078','2026-06-24 21:03:07','2026-06-25 04:32:41'),
(543,5,'consumption',3079,6321,1,1,'completed',32,'2026-06-24 21:03:07','2026-06-25 04:32:44','approved','核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 50}','approval_chain:consumption:3079','2026-06-24 21:03:07','2026-06-25 04:32:44'),
(544,6,'consumption',3080,6322,2,2,'completed',12796,'2026-06-25 03:09:00','2026-06-25 03:16:09','approved','核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 12796, \"operator_id\": 12796, \"submitted_by\": 12796, \"consumption_amount\": 3999}','approval_chain:consumption:3080','2026-06-25 03:09:00','2026-06-25 03:16:09'),
(545,6,'consumption',3081,6323,2,2,'completed',12796,'2026-06-25 03:14:09','2026-06-25 04:32:48','approved','核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 12796, \"operator_id\": 12796, \"submitted_by\": 12796, \"consumption_amount\": 3336}','approval_chain:consumption:3081','2026-06-25 03:14:09','2026-06-25 04:32:48'),
(547,5,'consumption',3084,6324,2,2,'completed',12798,'2026-06-26 00:14:04','2026-06-26 00:18:01','approved','核实无误，审核通过','{\"store_id\": 838, \"merchant_id\": 12798, \"operator_id\": 12798, \"submitted_by\": 12798, \"consumption_amount\": 2580}','approval_chain:consumption:3084','2026-06-26 00:14:04','2026-06-26 00:18:01'),
(548,5,'consumption',3085,6325,2,2,'completed',12796,'2026-06-26 00:19:14','2026-06-26 00:20:30','approved','核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 12796, \"operator_id\": 12796, \"submitted_by\": 12796, \"consumption_amount\": 1000}','approval_chain:consumption:3085','2026-06-26 00:19:14','2026-06-26 00:20:30'),
(549,5,'consumption',3086,6326,2,2,'completed',12801,'2026-06-26 07:01:36','2026-06-26 07:06:48','approved','核实无误，审核通过','{\"store_id\": 838, \"merchant_id\": 12801, \"operator_id\": 12801, \"submitted_by\": 12801, \"consumption_amount\": 369}','approval_chain:consumption:3086','2026-06-26 07:01:36','2026-06-26 07:06:48'),
(550,5,'consumption',3087,6327,2,2,'completed',12801,'2026-06-27 06:28:53','2026-06-27 06:32:21','approved','审核通过','{\"store_id\": 838, \"merchant_id\": 12801, \"operator_id\": 12801, \"submitted_by\": 12801, \"consumption_amount\": 1000}','approval_chain:consumption:3087','2026-06-27 06:28:53','2026-06-27 06:32:21'),
(551,5,'consumption',3088,6328,2,2,'completed',12796,'2026-06-27 07:30:37','2026-06-27 07:30:54','approved','核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 12796, \"operator_id\": 12796, \"submitted_by\": 12796, \"consumption_amount\": 1000}','approval_chain:consumption:3088','2026-06-27 07:30:37','2026-06-27 07:30:54'),
(552,5,'consumption',3089,6329,2,2,'completed',32,'2026-06-27 07:53:22','2026-06-27 07:53:28','approved','核实无误，审核通过','{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 1000}','approval_chain:consumption:3089','2026-06-27 07:53:22','2026-06-27 07:53:28'),
(553,5,'consumption',3090,6330,2,2,'completed',32,'2026-06-27 08:02:51','2026-06-27 08:02:56','approved','核实无误，审核通过','{\"store_id\": 838, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 1000}','approval_chain:consumption:3090','2026-06-27 08:02:51','2026-06-27 08:02:56'),
(554,5,'consumption',3091,6331,2,2,'completed',32,'2026-06-28 01:54:48','2026-06-28 01:56:24','approved','核实无误，审核通过','{\"store_id\": 838, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 3000}','approval_chain:consumption:3091','2026-06-28 01:54:48','2026-06-28 01:56:24'),
(555,5,'consumption',3092,6332,2,2,'completed',32,'2026-06-28 02:35:24','2026-06-28 02:35:30','approved','核实无误，审核通过','{\"store_id\": 838, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 3000}','approval_chain:consumption:3092','2026-06-28 02:35:24','2026-06-28 02:35:30'),
(556,5,'consumption',3093,6333,2,2,'completed',32,'2026-06-28 03:06:31','2026-06-28 03:06:42','approved','核实无误，审核通过','{\"store_id\": 838, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 3000}','approval_chain:consumption:3093','2026-06-28 03:06:31','2026-06-28 03:06:42'),
(578,5,'consumption',3115,6355,1,2,'in_progress',32,'2026-06-28 08:00:09',NULL,NULL,NULL,'{\"store_id\": 838, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 3000}','approval_chain:consumption:3115','2026-06-28 08:00:09','2026-06-28 08:00:09'),
(600,5,'consumption',3137,6377,1,2,'in_progress',32,'2026-07-06 03:35:40',NULL,NULL,NULL,'{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 88.5}','approval_chain:consumption:3137','2026-07-06 03:35:40','2026-07-06 03:35:40'),
(601,5,'consumption',3138,6378,1,2,'in_progress',32,'2026-07-06 03:35:40',NULL,NULL,NULL,'{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 50}','approval_chain:consumption:3138','2026-07-06 03:35:40','2026-07-06 03:35:40'),
(630,5,'consumption',3168,6407,1,2,'in_progress',32,'2026-07-10 15:52:38',NULL,NULL,NULL,'{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 88.5}','approval_chain:consumption:3168','2026-07-10 15:52:38','2026-07-10 15:52:38'),
(631,5,'consumption',3169,6408,1,2,'in_progress',32,'2026-07-10 15:52:38',NULL,NULL,NULL,'{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 50}','approval_chain:consumption:3169','2026-07-10 15:52:38','2026-07-10 15:52:38'),
(632,5,'consumption',3170,6409,1,2,'in_progress',32,'2026-07-11 01:15:18',NULL,NULL,NULL,'{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 88.5}','approval_chain:consumption:3170','2026-07-11 01:15:18','2026-07-11 01:15:18'),
(633,5,'consumption',3171,6410,1,2,'in_progress',32,'2026-07-11 01:15:18',NULL,NULL,NULL,'{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 50}','approval_chain:consumption:3171','2026-07-11 01:15:18','2026-07-11 01:15:18'),
(676,5,'consumption',3214,6453,1,2,'in_progress',32,'2026-07-11 10:02:06',NULL,NULL,NULL,'{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 88.5}','approval_chain:consumption:3214','2026-07-11 10:02:06','2026-07-11 10:02:06'),
(677,5,'consumption',3215,6454,1,2,'in_progress',32,'2026-07-11 10:02:06',NULL,NULL,NULL,'{\"store_id\": 7, \"merchant_id\": 32, \"operator_id\": 32, \"submitted_by\": 32, \"consumption_amount\": 50}','approval_chain:consumption:3215','2026-07-11 10:02:06','2026-07-11 10:02:06');
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

-- Dump completed on 2026-07-16  3:11:48
