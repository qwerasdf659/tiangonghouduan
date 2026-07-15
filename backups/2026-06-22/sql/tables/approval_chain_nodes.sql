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
-- Table structure for table `approval_chain_nodes`
--

DROP TABLE IF EXISTS `approval_chain_nodes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `approval_chain_nodes` (
  `node_id` bigint NOT NULL AUTO_INCREMENT COMMENT '节点ID',
  `template_id` bigint NOT NULL COMMENT '所属模板',
  `step_number` tinyint NOT NULL COMMENT '步骤编号（1=提交位，2-9=审核位）',
  `node_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '节点名称（如"店长初审"）',
  `assignee_type` enum('role','user','submitter_manager') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '分配方式',
  `assignee_role_id` int DEFAULT NULL COMMENT '按角色分配时的角色ID',
  `assignee_user_id` int DEFAULT NULL COMMENT '按指定人分配时的用户ID',
  `is_final` tinyint(1) NOT NULL COMMENT '是否终审节点',
  `auto_approve_enabled` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否启用自动审批',
  `auto_approve_conditions` json DEFAULT NULL COMMENT '自动审批条件',
  `timeout_hours` int NOT NULL DEFAULT '12' COMMENT '超时小时数（默认12小时）',
  `timeout_action` enum('none','auto_approve','escalate','notify') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'escalate' COMMENT '超时动作',
  `escalate_to_node` bigint DEFAULT NULL COMMENT '超时升级到的节点',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  `exclude_parties` tinyint NOT NULL DEFAULT '1' COMMENT '当事人回避开关(1=排除当事人审核,默认;0=不回避)。开启时操作人为该业务当事人则拒绝审核,即使持admin角色',
  `approve_mode` enum('single','countersign') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'single' COMMENT '审批模式：single=单签（一人通过即推进），countersign=会签（需 N 人通过）',
  `required_approvals` int NOT NULL DEFAULT '1' COMMENT '会签需通过人数（single 恒为 1；countersign 为需凑够的 approve 人数）',
  PRIMARY KEY (`node_id`),
  KEY `idx_template_step` (`template_id`,`step_number`),
  KEY `idx_assignee_role` (`assignee_role_id`),
  KEY `fk_acn_user` (`assignee_user_id`),
  KEY `fk_acn_escalate` (`escalate_to_node`),
  CONSTRAINT `fk_acn_escalate` FOREIGN KEY (`escalate_to_node`) REFERENCES `approval_chain_nodes` (`node_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_acn_role` FOREIGN KEY (`assignee_role_id`) REFERENCES `roles` (`role_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_acn_template` FOREIGN KEY (`template_id`) REFERENCES `approval_chain_templates` (`template_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_acn_user` FOREIGN KEY (`assignee_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审核链节点定义';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `approval_chain_nodes`
--

LOCK TABLES `approval_chain_nodes` WRITE;
/*!40000 ALTER TABLE `approval_chain_nodes` DISABLE KEYS */;
INSERT INTO `approval_chain_nodes` VALUES
(5,5,9,'管理员终审','role',2,NULL,1,0,NULL,12,'notify',NULL,1,'2026-03-10 08:18:51','2026-03-10 08:18:51',1,'single',1),
(8,7,9,'管理员终审','role',2,NULL,1,0,NULL,12,'notify',NULL,1,'2026-03-10 08:18:51','2026-03-10 08:18:51',1,'single',1),
(9,6,3,'业务经理初审','role',7,NULL,0,0,NULL,12,'escalate',NULL,0,'2026-03-21 00:20:25','2026-03-21 00:20:25',1,'single',1),
(10,6,9,'管理员终审','role',2,NULL,1,0,NULL,12,'notify',NULL,0,'2026-03-21 00:20:25','2026-03-21 00:20:25',1,'single',1),
(13,9,3,'业务经理初审（商家积分大额）','role',7,NULL,0,0,NULL,12,'escalate',NULL,0,'2026-06-13 04:03:40','2026-06-13 04:03:40',1,'single',1),
(14,9,9,'管理员终审（商家积分大额）','role',2,NULL,1,0,NULL,12,'notify',NULL,1,'2026-06-13 04:03:40','2026-06-13 04:03:40',1,'single',1);
/*!40000 ALTER TABLE `approval_chain_nodes` ENABLE KEYS */;
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
