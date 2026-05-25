-- ============================================================
-- AI Novel Studio 数据库初始化脚本
-- 版本：2.0.0
-- 说明：创建数据库、所有表结构及初始数据
-- ============================================================

-- ---------- 1. 创建数据库 ----------
CREATE DATABASE IF NOT EXISTS `novel_writing`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `novel_writing`;

-- ============================================================
-- 2. 创建表结构
-- ============================================================

-- ---------- 2.1 用户分组表 ----------
CREATE TABLE IF NOT EXISTS `user_groups` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL COMMENT '分组名称：free/vip/admin',
  `token_limit_per_day` int unsigned NOT NULL DEFAULT 5000 COMMENT '每日token上限',
  `rate_limit_per_minute` int unsigned NOT NULL DEFAULT 5 COMMENT '每分钟请求数限制',
  `max_novels` int unsigned NOT NULL DEFAULT 3 COMMENT '可创建小说数上限',
  `max_chapters_per_novel` int unsigned NOT NULL DEFAULT 12 COMMENT '单小说章节上限',
  `can_export` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否可导出',
  `can_customize` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否可自定义参数',
  `can_choose_model` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否允许用户自选首选大模型',
  `queue_priority` int DEFAULT 10 COMMENT '队列优先级（默认10）',
  `is_admin` tinyint(1) DEFAULT 0 COMMENT '是否具有管理员权限',
  `description` varchar(255) DEFAULT NULL COMMENT '分组描述',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_groups_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.2 用户表 ----------
CREATE TABLE IF NOT EXISTS `users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL COMMENT '用户名',
  `email` varchar(120) NOT NULL COMMENT '邮箱',
  `password_hash` varchar(255) NOT NULL COMMENT 'bcrypt密码哈希',
  `group_id` int unsigned NOT NULL DEFAULT 1 COMMENT '所属用户组',
  `status` enum('active','disabled') NOT NULL DEFAULT 'active' COMMENT '账号状态',
  `daily_tokens_used` int unsigned NOT NULL DEFAULT 0 COMMENT '今日已用token',
  `last_token_reset_at` timestamp NULL DEFAULT NULL COMMENT '上次token重置时间',
  `preferred_model` varchar(255) DEFAULT NULL COMMENT '用户首选模型(null=按管理员优先级)，格式: provider_name::model_name',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_username_unique` (`username`),
  UNIQUE KEY `users_email_unique` (`email`),
  KEY `users_group_id_foreign` (`group_id`),
  CONSTRAINT `users_group_id_foreign` FOREIGN KEY (`group_id`) REFERENCES `user_groups` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.3 小说表 ----------
CREATE TABLE IF NOT EXISTS `novels` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL COMMENT '所属用户',
  `title` varchar(200) NOT NULL COMMENT '小说标题',
  `genre` varchar(100) DEFAULT NULL COMMENT '小说类型',
  `theme` text COMMENT '核心主题',
  `setting` text COMMENT '世界观/背景设定',
  `main_plot` text COMMENT '主线剧情概述',
  `sub_plots` json DEFAULT NULL COMMENT '支线剧情数组',
  `status` enum('draft','outline','characters','chapters_outline','writing','completed') NOT NULL DEFAULT 'draft' COMMENT '创作状态',
  `current_step` int unsigned NOT NULL DEFAULT 0 COMMENT '当前阶段 0-4',
  `chapter_count` int unsigned DEFAULT NULL COMMENT '总章数',
  `context_data` json DEFAULT NULL COMMENT 'ContextManager序列化状态',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `novels_user_id_foreign` (`user_id`),
  CONSTRAINT `novels_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.4 角色表 ----------
CREATE TABLE IF NOT EXISTS `characters` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `novel_id` int unsigned NOT NULL COMMENT '所属小说',
  `name` varchar(100) NOT NULL COMMENT '角色姓名',
  `age` int unsigned DEFAULT NULL COMMENT '年龄',
  `gender` varchar(10) DEFAULT NULL COMMENT '性别',
  `role` varchar(50) DEFAULT NULL COMMENT '主角/配角/反派',
  `appearance` text COMMENT '外貌描写',
  `personality` text COMMENT '性格特点',
  `background` text COMMENT '人物背景故事',
  `motivation` text COMMENT '核心动机/目标',
  `arc` text COMMENT '人物成长弧线',
  `relationships` json DEFAULT NULL COMMENT '与其他角色的关系数组',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `characters_novel_id_foreign` (`novel_id`),
  CONSTRAINT `characters_novel_id_foreign` FOREIGN KEY (`novel_id`) REFERENCES `novels` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.5 章节表 ----------
CREATE TABLE IF NOT EXISTS `chapters` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `novel_id` int unsigned NOT NULL COMMENT '所属小说',
  `chapter_number` int unsigned NOT NULL COMMENT '章节编号',
  `title` varchar(200) NOT NULL COMMENT '章节标题',
  `brief` varchar(500) DEFAULT NULL COMMENT '一句话概述',
  `scenes` json DEFAULT NULL COMMENT '场景描述数组',
  `conflict` varchar(500) DEFAULT NULL COMMENT '本章核心冲突',
  `turning_point` varchar(500) DEFAULT NULL COMMENT '转折点',
  `characters_involved` json DEFAULT NULL COMMENT '涉及角色列表',
  `emotional_tone` varchar(100) DEFAULT NULL COMMENT '情感基调',
  `ending_hook` varchar(500) DEFAULT NULL COMMENT '结尾悬念',
  `content` mediumtext COMMENT '正文内容（约2500字中文）',
  `summary` varchar(255) DEFAULT NULL COMMENT '自动生成的章节摘要',
  `status` enum('outline','writing','completed') NOT NULL DEFAULT 'outline' COMMENT '章节状态',
  `word_count` int unsigned DEFAULT 0 COMMENT '字数',
  `review_result` json DEFAULT NULL COMMENT '审查结果 JSON（issues 数组和 summary）',
  `extraction_result` json DEFAULT NULL COMMENT '数据提取结果 JSON（实体/状态变更/事件/场景/摘要）',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_novel_chapter` (`novel_id`,`chapter_number`),
  CONSTRAINT `chapters_novel_id_foreign` FOREIGN KEY (`novel_id`) REFERENCES `novels` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.6 队列任务表 ----------
CREATE TABLE IF NOT EXISTS `queue_tasks` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL COMMENT '用户ID',
  `novel_id` int unsigned NOT NULL COMMENT '小说ID',
  `phase` varchar(50) NOT NULL COMMENT '请求阶段',
  `user_group_priority` int NOT NULL COMMENT '用户组队列优先级',
  `status` varchar(20) DEFAULT 'waiting' COMMENT 'waiting/running/completed/cancelled/interrupted',
  `interrupted_reason` varchar(255) DEFAULT NULL COMMENT '中断原因',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `queue_tasks_user_id_status_index` (`user_id`,`status`),
  KEY `queue_tasks_user_group_priority_index` (`user_group_priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.7 用量日志表 ----------
CREATE TABLE IF NOT EXISTS `usage_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL COMMENT '用户',
  `novel_id` int unsigned DEFAULT NULL COMMENT '关联小说',
  `request_type` varchar(50) NOT NULL COMMENT '请求类型：outline/characters/chapter_outline/write_chapter',
  `tokens_used` int unsigned NOT NULL DEFAULT 0 COMMENT '消耗token总数',
  `prompt_tokens` int unsigned DEFAULT 0 COMMENT '提示词token',
  `completion_tokens` int unsigned DEFAULT 0 COMMENT '生成token',
  `model` varchar(50) DEFAULT NULL COMMENT '使用的模型',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `usage_logs_novel_id_foreign` (`novel_id`),
  KEY `idx_usage_user_date` (`user_id`,`created_at`),
  CONSTRAINT `usage_logs_novel_id_foreign` FOREIGN KEY (`novel_id`) REFERENCES `novels` (`id`) ON DELETE SET NULL,
  CONSTRAINT `usage_logs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.8 站点配置表 ----------
CREATE TABLE IF NOT EXISTS `site_config` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `config_key` varchar(100) NOT NULL COMMENT '配置键名',
  `config_value` text NOT NULL COMMENT '配置值',
  `description` varchar(255) DEFAULT NULL COMMENT '配置说明',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `site_config_config_key_unique` (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.9 技能定义表 ----------
CREATE TABLE IF NOT EXISTS `skills` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL COMMENT '技能唯一标识名',
  `display_name` varchar(200) NOT NULL COMMENT '技能显示名称',
  `description` text NOT NULL COMMENT '技能描述',
  `icon` varchar(50) DEFAULT NULL COMMENT 'Ant Design 图标名称',
  `system_prompt` text NOT NULL COMMENT '技能系统提示词，支持 {{变量}} 占位符',
  `phase` varchar(50) NOT NULL DEFAULT 'all' COMMENT '适用阶段：outline/characters/chapters_outline/write_chapter/all',
  `parameters_schema` json DEFAULT NULL COMMENT '可配置参数的 JSON Schema',
  `enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '全局启用状态',
  `sort_order` int NOT NULL DEFAULT 0 COMMENT '排序权重',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `skills_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.10 用户技能配置表 ----------
CREATE TABLE IF NOT EXISTS `user_skills` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL COMMENT '用户 ID',
  `skill_id` int unsigned NOT NULL COMMENT '技能 ID',
  `enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '用户启用状态',
  `parameters` json DEFAULT NULL COMMENT '用户自定义参数',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_skills_user_id_skill_id_unique` (`user_id`,`skill_id`),
  KEY `user_skills_skill_id_foreign` (`skill_id`),
  CONSTRAINT `user_skills_skill_id_foreign` FOREIGN KEY (`skill_id`) REFERENCES `skills` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_skills_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.11 MCP 服务器定义表 ----------
CREATE TABLE IF NOT EXISTS `mcp_servers` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL COMMENT '服务器名称',
  `transport` varchar(20) NOT NULL DEFAULT 'http' COMMENT '传输协议：stdio/http/sse',
  `command` varchar(255) DEFAULT NULL COMMENT 'stdio 模式下的启动命令',
  `args` json DEFAULT NULL COMMENT 'stdio 模式下的命令参数数组',
  `url` varchar(500) DEFAULT NULL COMMENT 'HTTP/SSE 模式下的服务端点 URL',
  `headers` json DEFAULT NULL COMMENT '自定义请求头，如 {"Authorization": "Bearer xxx"}',
  `enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '全局启用状态',
  `description` text COMMENT '服务器描述/备注',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `mcp_servers_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.12 用户 MCP 配置表 ----------
CREATE TABLE IF NOT EXISTS `user_mcp_configs` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL COMMENT '用户 ID',
  `server_id` int unsigned NOT NULL COMMENT 'MCP 服务器 ID',
  `enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '用户启用状态',
  `api_key` varchar(500) DEFAULT NULL COMMENT '用户个人 API Key（覆盖全局）',
  `extra_config` json DEFAULT NULL COMMENT '用户自定义额外配置',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_mcp_configs_user_id_server_id_unique` (`user_id`,`server_id`),
  KEY `user_mcp_configs_server_id_foreign` (`server_id`),
  CONSTRAINT `user_mcp_configs_server_id_foreign` FOREIGN KEY (`server_id`) REFERENCES `mcp_servers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_mcp_configs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.13 模型 Token 限额表 ----------
CREATE TABLE IF NOT EXISTS `model_token_limits` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `provider_name` varchar(100) NOT NULL COMMENT 'Provider名称',
  `model_name` varchar(255) NOT NULL COMMENT '模型名称',
  `daily_limit` int unsigned NOT NULL DEFAULT 0 COMMENT '每日token上限(0=不限制)',
  `monthly_limit` int unsigned NOT NULL DEFAULT 0 COMMENT '每月token上限(0=不限制)',
  `daily_used` int unsigned NOT NULL DEFAULT 0 COMMENT '今日已用token',
  `monthly_used` int unsigned NOT NULL DEFAULT 0 COMMENT '本月已用token',
  `last_daily_reset_at` timestamp NULL DEFAULT NULL COMMENT '上次日重置时间',
  `last_monthly_reset_at` timestamp NULL DEFAULT NULL COMMENT '上次月重置时间',
  `enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否启用该限额',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_provider_model` (`provider_name`,`model_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. 插入初始数据
-- ============================================================

-- ---------- 3.1 用户分组 ----------
INSERT INTO `user_groups` (`id`, `name`, `token_limit_per_day`, `rate_limit_per_minute`, `max_novels`, `max_chapters_per_novel`, `can_export`, `can_customize`, `can_choose_model`, `queue_priority`, `is_admin`, `description`) VALUES
(1, 'free',  5000,  3,  3,  10,  0, 0, 0, 10, 0, '免费用户'),
(2, 'vip',   50000, 10, 10, 30,  1, 1, 1, 20, 0, 'VIP用户'),
(3, 'admin', 999999, 60, 999, 999, 1, 1, 1, 30, 1, '管理员');

-- ---------- 3.2 站点配置 ----------
INSERT INTO `site_config` (`config_key`, `config_value`, `description`) VALUES
('site_name', 'AI Novel Studio', '网站名称'),
('site_description', '基于AI的小说创作平台', '网站描述'),
('max_tokens_per_request', '0', '单次请求最大token数（0=不限制）'),
('default_temperature', '0.7', '默认temperature参数'),
('chapters_per_batch', '20', '章节大纲每批生成章节数'),
('allow_registration', 'true', '是否允许新用户注册（true/false）'),
('openai_api_key', '', '单Provider API Key'),
('openai_base_url', 'https://api.openai.com/v1', '单Provider API地址'),
('default_model', 'gpt-4o', '单Provider默认模型'),
('openai_providers', '', '多Provider JSON配置');
