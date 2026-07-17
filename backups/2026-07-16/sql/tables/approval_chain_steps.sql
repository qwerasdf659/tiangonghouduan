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
-- Table structure for table `approval_chain_steps`
--

DROP TABLE IF EXISTS `approval_chain_steps`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `approval_chain_steps` (
  `step_id` bigint NOT NULL AUTO_INCREMENT COMMENT '步骤ID',
  `instance_id` bigint NOT NULL COMMENT '所属实例',
  `node_id` bigint NOT NULL COMMENT '对应的节点定义',
  `step_number` tinyint NOT NULL COMMENT '步骤编号',
  `assignee_user_id` int DEFAULT NULL COMMENT '实际被分配的审核人',
  `assignee_role_id` int DEFAULT NULL COMMENT '分配的角色（角色池模式）',
  `status` enum('waiting','pending','approved','rejected','skipped','timeout') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '步骤状态',
  `action_reason` text COLLATE utf8mb4_unicode_ci COMMENT '审批意见',
  `actioned_by` int DEFAULT NULL COMMENT '实际操作人',
  `actioned_at` datetime DEFAULT NULL COMMENT '操作时间',
  `is_final` tinyint(1) NOT NULL COMMENT '是否终审步骤',
  `timeout_at` datetime DEFAULT NULL COMMENT '超时截止时间',
  `auto_approved` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否自动审批通过',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  `store_id` int DEFAULT NULL COMMENT '该步所属门店（来源 consumption_records.store_id），门店隔离校验与统计免回查',
  `approve_mode` enum('single','countersign') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'single' COMMENT '审批模式（实例化时从节点固化）：single=单签，countersign=会签',
  `required_approvals` int NOT NULL DEFAULT '1' COMMENT '会签需通过人数（实例化时从节点固化，single 恒为 1）',
  `approved_count` int NOT NULL DEFAULT '0' COMMENT '会签已通过人数（凑够 required_approvals 才推进）',
  `is_escalated` tinyint NOT NULL DEFAULT '0' COMMENT '是否越级/超时升级代审（1=该步由上级越级或超时转交代审）',
  `original_assignee_role_id` int DEFAULT NULL COMMENT '越级时原应审角色ID（留痕，记录本应由谁审）',
  `escalated_from_user_id` int DEFAULT NULL COMMENT '由谁超时/越级转交而来（留痕，记录原审核人）',
  PRIMARY KEY (`step_id`),
  KEY `idx_instance_step` (`instance_id`,`step_number`),
  KEY `idx_assignee_user_status` (`assignee_user_id`,`status`),
  KEY `idx_assignee_role_status` (`assignee_role_id`,`status`),
  KEY `idx_timeout` (`timeout_at`),
  KEY `fk_acs_node` (`node_id`),
  KEY `fk_acs_actioned_by` (`actioned_by`),
  KEY `idx_acs_store_status` (`store_id`,`status`),
  CONSTRAINT `fk_acs_actioned_by` FOREIGN KEY (`actioned_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_acs_assignee_role` FOREIGN KEY (`assignee_role_id`) REFERENCES `roles` (`role_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_acs_assignee_user` FOREIGN KEY (`assignee_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_acs_instance` FOREIGN KEY (`instance_id`) REFERENCES `approval_chain_instances` (`instance_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_acs_node` FOREIGN KEY (`node_id`) REFERENCES `approval_chain_nodes` (`node_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=849 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审核链步骤执行记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `approval_chain_steps`
--

LOCK TABLES `approval_chain_steps` WRITE;
/*!40000 ALTER TABLE `approval_chain_steps` DISABLE KEYS */;
INSERT INTO `approval_chain_steps` VALUES
(531,524,9,3,NULL,7,'approved','核实无误，审核通过',32,'2026-06-24 02:47:43',0,'2026-06-23 08:38:39',0,'2026-06-22 20:38:39','2026-06-24 02:47:43',7,'single',1,1,1,7,32),
(532,524,10,9,NULL,2,'approved','核实无误，审核通过',32,'2026-06-25 04:32:17',1,'2026-06-24 14:47:43',0,'2026-06-22 20:38:39','2026-06-25 04:32:17',7,'single',1,1,0,NULL,NULL),
(533,525,9,3,NULL,7,'approved','审核通过',32,'2026-06-25 04:32:09',0,'2026-06-23 10:32:24',0,'2026-06-22 22:32:24','2026-06-25 04:32:09',7,'single',1,1,1,7,32),
(534,525,10,9,NULL,2,'approved','核实无误，审核通过',32,'2026-06-25 04:32:19',1,'2026-06-25 16:32:09',0,'2026-06-22 22:32:24','2026-06-25 04:32:19',7,'single',1,1,0,NULL,NULL),
(549,540,5,9,NULL,2,'approved','核实无误，审核通过',32,'2026-06-25 04:32:35',1,'2026-06-25 08:41:32',0,'2026-06-24 20:41:32','2026-06-25 04:32:35',7,'single',1,1,0,NULL,NULL),
(550,541,5,9,NULL,2,'approved','核实无误，审核通过',32,'2026-06-25 04:32:38',1,'2026-06-25 08:41:32',0,'2026-06-24 20:41:32','2026-06-25 04:32:38',7,'single',1,1,0,NULL,NULL),
(551,542,5,9,NULL,2,'approved','核实无误，审核通过',32,'2026-06-25 04:32:41',1,'2026-06-25 09:03:07',0,'2026-06-24 21:03:07','2026-06-25 04:32:41',7,'single',1,1,0,NULL,NULL),
(552,543,5,9,NULL,2,'approved','核实无误，审核通过',32,'2026-06-25 04:32:44',1,'2026-06-25 09:03:07',0,'2026-06-24 21:03:07','2026-06-25 04:32:44',7,'single',1,1,0,NULL,NULL),
(553,544,9,3,NULL,7,'approved','核实无误，审核通过',32,'2026-06-25 03:15:43',0,'2026-06-25 15:09:00',0,'2026-06-25 03:09:00','2026-06-25 03:15:43',7,'single',1,1,1,7,32),
(554,544,10,9,NULL,2,'approved','核实无误，审核通过',32,'2026-06-25 03:16:09',1,'2026-06-25 15:15:43',0,'2026-06-25 03:09:00','2026-06-25 03:16:09',7,'single',1,1,0,NULL,NULL),
(555,545,9,3,NULL,7,'approved','审核通过',32,'2026-06-25 04:32:13',0,'2026-06-25 15:14:09',0,'2026-06-25 03:14:09','2026-06-25 04:32:13',7,'single',1,1,1,7,32),
(556,545,10,9,NULL,2,'approved','核实无误，审核通过',32,'2026-06-25 04:32:48',1,'2026-06-25 16:32:13',0,'2026-06-25 03:14:09','2026-06-25 04:32:48',7,'single',1,1,0,NULL,NULL),
(559,547,17,2,NULL,NULL,'approved','核实无误，审核通过',32,'2026-06-26 00:17:58',0,'2026-06-26 12:14:04',0,'2026-06-26 00:14:04','2026-06-26 00:17:58',838,'single',1,1,1,NULL,32),
(560,547,5,3,NULL,2,'approved','核实无误，审核通过',32,'2026-06-26 00:18:01',1,'2026-06-26 12:17:58',0,'2026-06-26 00:14:04','2026-06-26 00:18:01',838,'single',1,1,0,NULL,NULL),
(561,548,17,2,NULL,NULL,'approved','核实无误，审核通过',32,'2026-06-26 00:20:24',0,'2026-06-26 12:19:14',0,'2026-06-26 00:19:14','2026-06-26 00:20:24',7,'single',1,1,1,NULL,32),
(562,548,5,3,NULL,2,'approved','核实无误，审核通过',32,'2026-06-26 00:20:30',1,'2026-06-26 12:20:24',0,'2026-06-26 00:19:14','2026-06-26 00:20:30',7,'single',1,1,0,NULL,NULL),
(563,549,17,2,NULL,NULL,'approved','核实无误，审核通过',12798,'2026-06-26 07:02:48',0,'2026-06-26 19:01:36',0,'2026-06-26 07:01:36','2026-06-26 07:02:48',838,'single',1,1,0,NULL,NULL),
(564,549,5,3,NULL,2,'approved','核实无误，审核通过',32,'2026-06-26 07:06:48',1,'2026-06-26 19:02:48',0,'2026-06-26 07:01:36','2026-06-26 07:06:48',838,'single',1,1,0,NULL,NULL),
(565,550,17,2,NULL,NULL,'approved','核实无误，审核通过',12798,'2026-06-27 06:29:38',0,'2026-06-27 18:28:53',0,'2026-06-27 06:28:53','2026-06-27 06:29:38',838,'single',1,1,0,NULL,NULL),
(566,550,5,3,NULL,2,'approved','审核通过',32,'2026-06-27 06:32:21',1,'2026-06-27 18:29:38',0,'2026-06-27 06:28:53','2026-06-27 06:32:21',838,'single',1,1,0,NULL,NULL),
(567,551,17,2,NULL,NULL,'approved','核实无误，审核通过',32,'2026-06-27 07:30:51',0,'2026-06-27 19:30:37',0,'2026-06-27 07:30:37','2026-06-27 07:30:51',7,'single',1,1,1,NULL,32),
(568,551,5,3,NULL,2,'approved','核实无误，审核通过',32,'2026-06-27 07:30:54',1,'2026-06-27 19:30:51',0,'2026-06-27 07:30:37','2026-06-27 07:30:54',7,'single',1,1,0,NULL,NULL),
(569,552,17,2,NULL,NULL,'approved','核实无误，审核通过',32,'2026-06-27 07:53:26',0,'2026-06-27 19:53:22',0,'2026-06-27 07:53:22','2026-06-27 07:53:26',7,'single',1,1,1,NULL,32),
(570,552,5,3,NULL,2,'approved','核实无误，审核通过',32,'2026-06-27 07:53:28',1,'2026-06-27 19:53:26',0,'2026-06-27 07:53:22','2026-06-27 07:53:28',7,'single',1,1,0,NULL,NULL),
(571,553,17,2,NULL,NULL,'approved','核实无误，审核通过',32,'2026-06-27 08:02:54',0,'2026-06-27 20:02:51',0,'2026-06-27 08:02:51','2026-06-27 08:02:54',838,'single',1,1,1,NULL,32),
(572,553,5,3,NULL,2,'approved','核实无误，审核通过',32,'2026-06-27 08:02:56',1,'2026-06-27 20:02:54',0,'2026-06-27 08:02:51','2026-06-27 08:02:56',838,'single',1,1,0,NULL,NULL),
(573,554,17,2,NULL,NULL,'approved','核实无误，审核通过',32,'2026-06-28 01:56:21',0,'2026-06-28 13:54:48',0,'2026-06-28 01:54:48','2026-06-28 01:56:21',838,'single',1,1,1,NULL,32),
(574,554,5,3,NULL,2,'approved','核实无误，审核通过',32,'2026-06-28 01:56:24',1,'2026-06-28 13:56:21',0,'2026-06-28 01:54:48','2026-06-28 01:56:24',838,'single',1,1,0,NULL,NULL),
(575,555,17,2,NULL,NULL,'approved','核实无误，审核通过',32,'2026-06-28 02:35:28',0,'2026-06-28 14:35:24',0,'2026-06-28 02:35:24','2026-06-28 02:35:28',838,'single',1,1,1,NULL,32),
(576,555,5,3,NULL,2,'approved','核实无误，审核通过',32,'2026-06-28 02:35:30',1,'2026-06-28 14:35:28',0,'2026-06-28 02:35:24','2026-06-28 02:35:30',838,'single',1,1,0,NULL,NULL),
(577,556,17,2,NULL,NULL,'approved','核实无误，审核通过',32,'2026-06-28 03:06:39',0,'2026-06-28 15:06:31',0,'2026-06-28 03:06:31','2026-06-28 03:06:39',838,'single',1,1,1,NULL,32),
(578,556,5,3,NULL,2,'approved','核实无误，审核通过',32,'2026-06-28 03:06:42',1,'2026-06-28 15:06:39',0,'2026-06-28 03:06:31','2026-06-28 03:06:42',838,'single',1,1,0,NULL,NULL),
(621,578,17,2,NULL,NULL,'pending',NULL,NULL,NULL,0,'2026-06-28 20:00:09',0,'2026-06-28 08:00:09','2026-06-28 08:00:09',838,'single',1,0,0,NULL,NULL),
(622,578,5,3,NULL,2,'waiting',NULL,NULL,NULL,1,NULL,0,'2026-06-28 08:00:09','2026-06-28 08:00:09',838,'single',1,0,0,NULL,NULL),
(665,600,17,2,NULL,NULL,'pending',NULL,NULL,NULL,0,'2026-07-06 15:35:40',0,'2026-07-06 03:35:40','2026-07-06 03:35:40',7,'single',1,0,0,NULL,NULL),
(666,600,5,3,NULL,2,'waiting',NULL,NULL,NULL,1,NULL,0,'2026-07-06 03:35:40','2026-07-06 03:35:40',7,'single',1,0,0,NULL,NULL),
(667,601,17,2,NULL,NULL,'pending',NULL,NULL,NULL,0,'2026-07-06 15:35:40',0,'2026-07-06 03:35:40','2026-07-06 03:35:40',7,'single',1,0,0,NULL,NULL),
(668,601,5,3,NULL,2,'waiting',NULL,NULL,NULL,1,NULL,0,'2026-07-06 03:35:40','2026-07-06 03:35:40',7,'single',1,0,0,NULL,NULL),
(725,630,17,2,NULL,NULL,'pending',NULL,NULL,NULL,0,'2026-07-11 03:52:38',0,'2026-07-10 15:52:38','2026-07-10 15:52:38',7,'single',1,0,0,NULL,NULL),
(726,630,5,3,NULL,2,'waiting',NULL,NULL,NULL,1,NULL,0,'2026-07-10 15:52:38','2026-07-10 15:52:38',7,'single',1,0,0,NULL,NULL),
(727,631,17,2,NULL,NULL,'pending',NULL,NULL,NULL,0,'2026-07-11 03:52:38',0,'2026-07-10 15:52:38','2026-07-10 15:52:38',7,'single',1,0,0,NULL,NULL),
(728,631,5,3,NULL,2,'waiting',NULL,NULL,NULL,1,NULL,0,'2026-07-10 15:52:38','2026-07-10 15:52:38',7,'single',1,0,0,NULL,NULL),
(729,632,17,2,NULL,NULL,'pending',NULL,NULL,NULL,0,'2026-07-11 13:15:18',0,'2026-07-11 01:15:18','2026-07-11 01:15:18',7,'single',1,0,0,NULL,NULL),
(730,632,5,3,NULL,2,'waiting',NULL,NULL,NULL,1,NULL,0,'2026-07-11 01:15:18','2026-07-11 01:15:18',7,'single',1,0,0,NULL,NULL),
(731,633,17,2,NULL,NULL,'pending',NULL,NULL,NULL,0,'2026-07-11 13:15:18',0,'2026-07-11 01:15:18','2026-07-11 01:15:18',7,'single',1,0,0,NULL,NULL),
(732,633,5,3,NULL,2,'waiting',NULL,NULL,NULL,1,NULL,0,'2026-07-11 01:15:18','2026-07-11 01:15:18',7,'single',1,0,0,NULL,NULL),
(817,676,17,2,NULL,NULL,'pending',NULL,NULL,NULL,0,'2026-07-11 22:02:06',0,'2026-07-11 10:02:06','2026-07-11 10:02:06',7,'single',1,0,0,NULL,NULL),
(818,676,5,3,NULL,2,'waiting',NULL,NULL,NULL,1,NULL,0,'2026-07-11 10:02:06','2026-07-11 10:02:06',7,'single',1,0,0,NULL,NULL),
(819,677,17,2,NULL,NULL,'pending',NULL,NULL,NULL,0,'2026-07-11 22:02:06',0,'2026-07-11 10:02:06','2026-07-11 10:02:06',7,'single',1,0,0,NULL,NULL),
(820,677,5,3,NULL,2,'waiting',NULL,NULL,NULL,1,NULL,0,'2026-07-11 10:02:06','2026-07-11 10:02:06',7,'single',1,0,0,NULL,NULL);
/*!40000 ALTER TABLE `approval_chain_steps` ENABLE KEYS */;
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
