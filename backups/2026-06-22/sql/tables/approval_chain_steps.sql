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
) ENGINE=InnoDB AUTO_INCREMENT=531 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审核链步骤执行记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `approval_chain_steps`
--

LOCK TABLES `approval_chain_steps` WRITE;
/*!40000 ALTER TABLE `approval_chain_steps` DISABLE KEYS */;
INSERT INTO `approval_chain_steps` VALUES
(517,517,9,3,NULL,7,'approved','批量审核验证（非终审推进下一步）',31,'2026-06-12 07:45:26',0,'2026-06-12 17:22:51',0,'2026-06-12 05:22:51','2026-06-12 07:45:26',NULL,'single',1,0,0,NULL,NULL),
(518,517,10,9,NULL,2,'approved','审核通过',31,'2026-06-12 08:06:56',1,'2026-06-12 19:45:26',0,'2026-06-12 05:22:51','2026-06-12 08:06:56',NULL,'single',1,0,0,NULL,NULL),
(519,518,9,3,NULL,7,'approved','批量审核验证（非终审推进下一步）',31,'2026-06-12 07:45:26',0,'2026-06-12 17:31:07',0,'2026-06-12 05:31:07','2026-06-12 07:45:26',NULL,'single',1,0,0,NULL,NULL),
(520,518,10,9,NULL,2,'approved','审核通过',31,'2026-06-12 08:06:48',1,'2026-06-12 19:45:26',0,'2026-06-12 05:31:07','2026-06-12 08:06:48',NULL,'single',1,0,0,NULL,NULL),
(525,521,9,3,NULL,7,'timeout','超时自动升级（12小时未处理）',NULL,'2026-06-13 15:00:00',0,'2026-06-13 14:31:05',0,'2026-06-13 02:31:05','2026-06-13 15:00:00',NULL,'single',1,0,0,NULL,NULL),
(526,521,10,9,NULL,2,'approved','核实无误，审核通过',32,'2026-06-14 08:47:16',1,'2026-06-14 03:00:00',0,'2026-06-13 02:31:05','2026-06-14 08:47:16',NULL,'single',1,0,0,NULL,NULL),
(527,522,9,3,NULL,7,'timeout','超时自动升级（12小时未处理）',NULL,'2026-06-13 15:00:00',0,'2026-06-13 14:32:26',0,'2026-06-13 02:32:26','2026-06-13 15:00:00',NULL,'single',1,0,0,NULL,NULL),
(528,522,10,9,NULL,2,'pending',NULL,NULL,NULL,1,'2026-06-14 03:00:00',0,'2026-06-13 02:32:26','2026-06-13 15:00:00',NULL,'single',1,0,0,NULL,NULL),
(529,523,9,3,NULL,7,'approved','审核通过',32,'2026-06-13 07:29:05',0,'2026-06-13 19:09:08',0,'2026-06-13 07:09:08','2026-06-13 07:29:05',NULL,'single',1,0,0,NULL,NULL),
(530,523,10,9,NULL,2,'approved','审核通过',32,'2026-06-13 07:29:15',1,'2026-06-13 19:29:05',0,'2026-06-13 07:09:08','2026-06-13 07:29:15',NULL,'single',1,0,0,NULL,NULL);
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

-- Dump completed on 2026-06-21 19:08:09
