-- ============================================================
-- AI Novel Studio 数据库初始化脚本
-- 版本：2.1.0
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
  `name` varchar(50) NOT NULL COMMENT '分组名称：default/vip/admin',
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
  `temperature_preset` varchar(20) NOT NULL DEFAULT 'balanced' COMMENT '创作温度预设：precise/balanced/creative/wild/custom',
  `custom_temperature` decimal(3,2) DEFAULT NULL COMMENT '自定义创作温度，范围0-2，仅custom预设生效',
  `last_login_at` timestamp NULL DEFAULT NULL COMMENT '最后登录时间',
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
  KEY `idx_novel_user_updated` (`user_id`, `updated_at`),
  CONSTRAINT `novels_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.4 角色表 ----------
CREATE TABLE IF NOT EXISTS `characters` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `novel_id` int unsigned NOT NULL COMMENT '所属小说',
  `name` varchar(100) NOT NULL COMMENT '角色姓名',
  `age` varchar(50) DEFAULT NULL COMMENT '年龄（支持描述性文本，如25岁、十七八岁、中年等）',
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
  `allowed_tools` varchar(500) DEFAULT NULL COMMENT '允许的工具列表，逗号分隔',
  `system_prompt` text NOT NULL COMMENT '技能系统提示词，支持 {{变量}} 占位符',
  `phase` varchar(50) NOT NULL DEFAULT 'all' COMMENT '适用阶段：outline/characters/chapters_outline/write_chapter/all',
  `parameters_schema` json DEFAULT NULL COMMENT '可配置参数的 JSON Schema',
  `metadata` json DEFAULT NULL COMMENT '额外元数据',
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

-- ---------- 2.13 邮箱验证码表 ----------
CREATE TABLE IF NOT EXISTS `email_verifications` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned DEFAULT NULL COMMENT '关联用户ID（注册验证时可能为空）',
  `email` varchar(120) NOT NULL COMMENT '目标邮箱',
  `code` varchar(10) NOT NULL COMMENT '6位数字验证码',
  `type` varchar(30) NOT NULL COMMENT '类型：register/ reset_password/ change_email',
  `new_email` varchar(120) DEFAULT NULL COMMENT '变更邮箱时的新邮箱地址',
  `used` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否已使用',
  `expires_at` timestamp NOT NULL COMMENT '过期时间',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_email_type_used` (`email`,`type`,`used`),
  KEY `idx_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.14 模型 Token 限额表 ----------
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

-- ---------- 2.15 小说模板表 ----------
CREATE TABLE IF NOT EXISTS `novel_templates` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL COMMENT '模板标识名',
  `display_name` varchar(200) NOT NULL COMMENT '模板显示名称',
  `description` text NOT NULL COMMENT '模板描述',
  `category` varchar(50) NOT NULL DEFAULT '其他' COMMENT '分类：玄幻/都市/科幻/悬疑/历史/游戏/轻小说/其他',
  `cover_gradient` varchar(100) DEFAULT 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' COMMENT '卡片渐变背景色',
  `icon` varchar(50) DEFAULT 'BookOutlined' COMMENT 'Ant Design 图标名',
  `genre` varchar(100) DEFAULT NULL COMMENT '默认小说类型',
  `title_example` varchar(200) DEFAULT NULL COMMENT '示例标题',
  `theme` text COMMENT '预设核心主题',
  `setting` text COMMENT '预设世界观/背景设定',
  `main_plot` text COMMENT '预设主线剧情概述',
  `is_official` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否官方模板',
  `sort_order` int NOT NULL DEFAULT 0 COMMENT '排序权重',
  `enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '启用状态',
  `creator_id` int unsigned DEFAULT NULL COMMENT '创建者用户ID（社区模板）',
  `usage_count` int unsigned NOT NULL DEFAULT 0 COMMENT '使用次数统计',
  `review_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'approved' COMMENT '审核状态（社区模板）',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `novel_templates_name_unique` (`name`),
  KEY `novel_templates_creator_id_foreign` (`creator_id`),
  CONSTRAINT `novel_templates_creator_id_foreign` FOREIGN KEY (`creator_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.16 用户封禁记录表 ----------
CREATE TABLE IF NOT EXISTS `user_bans` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL COMMENT '被禁用户',
  `type` enum('ban','deactivate') NOT NULL DEFAULT 'ban' COMMENT '禁用类型：ban=管理员封禁 deactivate=用户注销',
  `reason` text COMMENT '封禁/注销原因（可留空）',
  `operator_id` int unsigned DEFAULT NULL COMMENT '操作人ID（管理员封禁时=管理员ID，注销时=用户自身ID）',
  `status` enum('active','lifted') NOT NULL DEFAULT 'active' COMMENT '状态：active=生效中 lifted=已解除',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ban_user` (`user_id`),
  KEY `idx_ban_status` (`status`),
  CONSTRAINT `user_bans_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_bans_operator_id_fk` FOREIGN KEY (`operator_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.17 用户申诉表 ----------
CREATE TABLE IF NOT EXISTS `user_appeals` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `ban_id` int unsigned NOT NULL COMMENT '关联封禁记录',
  `user_id` int unsigned NOT NULL COMMENT '申诉用户',
  `content` text NOT NULL COMMENT '申诉内容',
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT '审核状态',
  `reviewed_by` int unsigned DEFAULT NULL COMMENT '审核管理员ID',
  `review_note` text COMMENT '审核备注',
  `ai_result` json DEFAULT NULL COMMENT 'AI审核结果JSON',
  `ticket_id` int unsigned DEFAULT NULL COMMENT '关联工单ID',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_appeal_ban` (`ban_id`),
  KEY `idx_appeal_user` (`user_id`),
  KEY `idx_appeal_status` (`status`),
  KEY `idx_appeal_ticket` (`ticket_id`),
  CONSTRAINT `user_appeals_ban_id_fk` FOREIGN KEY (`ban_id`) REFERENCES `user_bans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_appeals_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_appeals_reviewed_by_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.18 AI 对话会话表 ----------
CREATE TABLE IF NOT EXISTS `chat_conversations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL COMMENT '所属用户',
  `title` varchar(200) NOT NULL COMMENT '对话标题',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_chat_conv_user` (`user_id`),
  CONSTRAINT `chat_conversations_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.19 AI 对话消息表 ----------
CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` int unsigned NOT NULL COMMENT '所属对话',
  `role` varchar(20) NOT NULL COMMENT '角色：user/assistant/system',
  `content` mediumtext NOT NULL COMMENT '消息内容',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_chat_msg_conv` (`conversation_id`),
  CONSTRAINT `chat_messages_conversation_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `chat_conversations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.20 系统通知表 ----------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL COMMENT '通知标题',
  `content` text NOT NULL COMMENT '通知正文',
  `show_popup` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否弹窗展示',
  `show_banner` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否顶部横幅展示',
  `show_inmail` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否发站内信',
  `show_email` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否发邮件',
  `enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '启用状态',
  `sort_order` int NOT NULL DEFAULT 0 COMMENT '排序权重',
  `inmail_sent_at` timestamp NULL DEFAULT NULL COMMENT '站内信批量发送完成时间',
  `email_sent_at` timestamp NULL DEFAULT NULL COMMENT '邮件批量发送完成时间',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.21 站内信表 ----------
CREATE TABLE IF NOT EXISTS `inmails` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL COMMENT '接收用户',
  `notification_id` int unsigned DEFAULT NULL COMMENT '关联系统通知ID',
  `title` varchar(200) NOT NULL COMMENT '站内信标题',
  `content` text NOT NULL COMMENT '站内信正文',
  `is_read` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否已读',
  `read_at` timestamp NULL DEFAULT NULL COMMENT '阅读时间',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_inmail_user` (`user_id`),
  KEY `idx_inmail_user_unread` (`user_id`,`is_read`),
  KEY `idx_inmail_notification` (`notification_id`),
  CONSTRAINT `inmails_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.22 工单表 ----------
CREATE TABLE IF NOT EXISTS `tickets` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL COMMENT '提交用户',
  `type` enum('appeal','general') NOT NULL DEFAULT 'general' COMMENT '工单类型：appeal=申诉工单 general=通用工单',
  `title` varchar(200) NOT NULL COMMENT '工单标题',
  `content` text NOT NULL COMMENT '工单内容',
  `status` enum('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open' COMMENT '处理状态',
  `priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal' COMMENT '优先级',
  `source_type` varchar(30) NOT NULL DEFAULT 'manual' COMMENT '来源类型：manual/appeal',
  `source_id` int unsigned DEFAULT NULL COMMENT '来源记录ID（申诉ID等）',
  `ai_result` json DEFAULT NULL COMMENT 'AI分析结果JSON',
  `closed_at` timestamp NULL DEFAULT NULL COMMENT '关闭时间',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ticket_user` (`user_id`),
  KEY `idx_ticket_status` (`status`),
  KEY `idx_ticket_type` (`type`),
  KEY `idx_ticket_source` (`source_type`,`source_id`),
  CONSTRAINT `tickets_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.23 工单回复表 ----------
CREATE TABLE IF NOT EXISTS `ticket_replies` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `ticket_id` int unsigned NOT NULL COMMENT '所属工单',
  `sender_id` int unsigned NOT NULL COMMENT '发送者ID',
  `sender_type` enum('user','admin') NOT NULL DEFAULT 'user' COMMENT '发送者类型',
  `content` text NOT NULL COMMENT '回复内容',
  `is_ai` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否为AI自动回复',
  `notification_sent_at` timestamp NULL DEFAULT NULL COMMENT '通知发送时间',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reply_ticket` (`ticket_id`),
  CONSTRAINT `ticket_replies_ticket_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.24 用户逐阶段温度配置表 ----------
CREATE TABLE IF NOT EXISTS `user_temperature_config` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL COMMENT '用户ID',
  `phase` varchar(50) NOT NULL COMMENT '阶段标识',
  `temperature` decimal(3,2) NOT NULL COMMENT '温度值，范围0-2',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_phase` (`user_id`, `phase`),
  CONSTRAINT `utc_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2.25 模板分类表 ----------
CREATE TABLE IF NOT EXISTS `template_categories` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL COMMENT '分类名称',
  `enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '启用状态',
  `sort_order` int NOT NULL DEFAULT 0 COMMENT '排序权重',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `template_categories_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. 插入初始数据
-- ============================================================

-- ---------- 3.1 用户分组 ----------
INSERT INTO `user_groups` (`id`, `name`, `token_limit_per_day`, `rate_limit_per_minute`, `max_novels`, `max_chapters_per_novel`, `can_export`, `can_customize`, `can_choose_model`, `queue_priority`, `is_admin`, `description`) VALUES
(1, 'default',  5000,  3,  3,  10,  0, 0, 0, 10, 0, '默认用户'),
(2, 'vip',   50000, 10, 10, 30,  1, 1, 1, 20, 0, 'VIP用户'),
(3, 'admin', 999999, 60, 999, 999, 1, 1, 1, 30, 1, '管理员');

-- ---------- 3.2 站点配置 ----------
INSERT INTO `site_config` (`config_key`, `config_value`, `description`) VALUES
('site_name', 'AI Novel Studio', '网站名称'),
('site_description', '基于AI的小说创作平台', '网站描述'),

('max_tokens_per_request', '0', '单次请求最大token数（0=不限制）'),
-- 温度参数（管理员可逐阶段覆盖默认值）
('temp_outline', '0.7', '生成大纲温度'),
('temp_characters', '0.7', '生成人物设定温度'),
('temp_chapters_outline', '0.6', '生成逐章大纲温度'),
('temp_write_chapter', '0.85', '写章节正文温度'),
('temp_chapter_summary', '0.3', '章节摘要温度'),
('temp_plan_research', '0.7', '规划-搜索研究温度'),
('temp_plan_generate', '0.8', '规划-方案生成温度'),
('temp_plan_revise', '0.7', '规划-修订方案温度'),
('temp_context_assembly', '0.3', '写作任务书组装温度'),
('temp_polish', '0.5', '润色修复温度'),
('temp_revise', '0.7', '内容修订温度'),
('temp_review', '0.2', '章节审查温度'),
('temp_review_retry', '0.1', '审查重试温度'),
('temp_data_extraction', '0.15', '数据提取温度'),
('temp_import_title', '0.3', '导入-提取书名温度'),
('temp_import_chars', '0.3', '导入-提取角色温度'),
('temp_import_chapters', '0.2', '导入-提取章节温度'),
('temp_ban', '0.3', '内容审核温度'),
('temp_template', '0.1', '模板生成温度'),
('chapters_per_batch', '20', '章节大纲每批生成章节数'),
('allow_registration', 'true', '是否允许新用户注册（true/false）'),
('openai_api_key', '', '单Provider API Key'),
('openai_base_url', 'https://api.openai.com/v1', '单Provider API地址'),
('default_model', 'gpt-4o', '单Provider默认模型'),
('openai_providers', '', '多Provider JSON配置'),
('captcha_enabled', 'false', '是否启用登录验证码（true/false）'),
('cors_enabled', 'false', '是否启用 CORS 跨域（true/false，默认关闭）'),
('cors_origins', '', 'CORS 域名白名单（每行一个域名）'),
('login_rate_limit', '5', '登录接口每分钟最大尝试次数'),
('mcp_api_key', '', 'MCP 端点的 API Key（用于外部 AI 应用连接）'),
('resend_api_key', '', 'Resend API Key（用于发送验证邮件，在 resend.com 获取）'),
('email_from', '', '发件人邮箱地址（需在 resend.com 完成域名验证）'),
('email_from_name', 'AI Novel Studio', '发件人显示名称'),
('email_verification_enabled', 'false', '是否启用邮箱验证码功能（true/false）'),
('favicon_path', '', '自定义站点图标路径（上传后自动设置）'),
('favicon_original_name', '', '自定义站点图标原始文件名'),
('email_domain_whitelist_enabled', 'false', '是否启用注册邮箱域名白名单（true/false）'),
('email_domain_whitelist', '', '允许注册的邮箱域名白名单（每行一个域名，如 gmail.com）'),
('default_group', '1', '新用户注册时的默认分组ID');

-- ---------- 3.3 默认 MCP 服务器 ----------
INSERT INTO `mcp_servers` (`name`, `transport`, `url`, `headers`, `enabled`, `description`) VALUES
('anysearch', 'http', 'https://api.anysearch.com/mcp', '{"Authorization": "Bearer ${ANYSEARCH_API_KEY}"}', 1, '统一实时搜索引擎，为AI代理提供网页、新闻、图片等搜索能力。免费API Key申请: https://anysearch.com/console/api-keys');

-- ---------- 3.4 模板分类 ----------
INSERT INTO `template_categories` (`name`, `enabled`, `sort_order`) VALUES
('玄幻', 1, 1),
('都市', 1, 2),
('科幻', 1, 3),
('悬疑', 1, 4),
('历史', 1, 5),
('游戏', 1, 6),
('轻小说', 1, 7),
('其他', 1, 99);

-- ---------- 3.5 预设小说模板 ----------
INSERT INTO `novel_templates` (`name`, `display_name`, `description`, `category`, `cover_gradient`, `icon`, `genre`, `title_example`, `theme`, `setting`, `main_plot`, `is_official`, `sort_order`, `review_status`) VALUES
('xianxia_standard', '标准修仙', '凡人逆袭、步步登仙的经典修仙模板，包含完整的境界体系和宗门设定，适合长篇连载', '玄幻', 'linear-gradient(135deg, #0c0c2d 0%, #1a1a5e 40%, #6b3fa0 100%)', 'ThunderboltOutlined', '玄幻', '凡人仙途', '逆境中坚守本心，在力量与道心之间寻找平衡。探讨长生与凡人情感的冲突，问道与入世的抉择。', '九州大地，灵气充沛，万族林立。修炼体系分为：炼气、筑基、金丹、元婴、化神、合体、大乘、渡劫八大境界。每个境界又分初期、中期、后期、圆满四个小境界。天下宗门以"一殿二宗三谷四派"为尊，另有散修联盟、商会、炼丹师公会等势力。', '主角出身微末，偶得上古大能遗物/传承，踏上修炼之路。修炼途中遭遇宗门争斗、秘境探险、正魔大战。中期发现自身身世隐秘，牵涉到上古布局。后期对抗域外天魔/幕后黑手，最终证道飞升。', 1, 1, 'approved'),
('urban_romance', '都市甜宠', '现代都市背景的浪漫爱情故事，突出甜蜜互动与成长蜕变，适合女性向创作', '都市', 'linear-gradient(135deg, #f093fb 0%, #f5576c 50%, #fda085 100%)', 'HeartOutlined', '都市', '总裁的契约新娘', '爱是相互成就而非占有。在现实压力与情感冲动之间，每个人都需要找到属于自己的答案。', '现代都市，繁华的滨海城市。故事主要围绕商业精英、娱乐圈、豪门世家展开。经济发达，社会阶层分明。', '女主因意外与高冷总裁产生交集，被迫签订契约婚姻/恋爱协议。相处过程中逐渐发现彼此的真实一面。经历情敌挑衅、家族反对、商业阴谋等考验后，两人克服障碍，收获真爱。', 1, 2, 'approved'),
('sci_fi_interstellar', '星际科幻', '未来星际文明背景下的史诗冒险，融合机甲、基因进化、外星文明等经典科幻元素', '科幻', 'linear-gradient(135deg, #0c2b4f 0%, #1b5e8a 40%, #00d4aa 100%)', 'RocketOutlined', '科幻', '星海征途', '技术与人性的边界在哪里？当人类进入星际时代，古老的道德困境以新的形式呈现。探索未知不仅是征服星辰大海，更是对自我的认知。', '公元3587年，人类已建立横跨银河系的庞大星际联邦。科技以量子引擎、基因强化、AI意识上传为核心。机甲战士是战场主力，精神力觉醒者成为特殊战略资源。外星种族有虫族、灵族、硅基生命等。', '主角从偏远星球出发，意外发现远古文明遗迹，获得超越当前时代的科技/能力。被各方势力追逐的过程中，卷入星际联邦与虫族的全面战争。逐步揭开远古文明灭绝的真相，最终推动人类文明进入新纪元。', 1, 3, 'approved'),
('suspense_investigation', '悬疑推理', '环环相扣的案件推理模板，从微末线索中抽丝剥茧，揭开惊天真相', '悬疑', 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', 'SearchOutlined', '悬疑', '暗夜追踪', '真相往往藏于细节之中。正义的实现不在于惩罚，而在于还原每一个受害者的故事。', '现代都市背景下，围绕刑侦队、法医中心、犯罪心理学研究室展开。案件涉及连环犯罪、高科技作案、跨国组织等。', '一桩看似普通的案件，牵扯出多年前的悬案。主角凭借敏锐的观察力和缜密的推理，发现案件之间的隐秘关联。在查案过程中，自身也被卷入更大的阴谋，必须在限时内找到真相。', 1, 4, 'approved'),
('game_vrmmorpg', '虚拟网游', '全息虚拟现实游戏世界，从新手村到巅峰玩家的成长之路，游戏与现实的交织', '游戏', 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)', 'AppleOutlined', '游戏', '第二世界', '虚拟世界的价值如何衡量？当游戏装备可以改变现实命运，游戏不再是单纯的娱乐。在规则与漏洞之间，每个玩家都在书写自己的传奇。', '2045年，全球最大虚拟现实MMORPG《永恒大陆》上线。玩家通过意识接入舱进入100%拟真度的游戏世界。游戏经济与现实货币互通，职业玩家和公会体系成熟。', '主角因现实困境进入游戏，凭借前世的游戏记忆/特殊天赋，在新手村获得隐藏职业/装备。一步步建立自己的公会势力，参与游戏内的史诗级事件。随着游戏深入，发现游戏世界隐藏的秘密可能关乎人类文明的未来。', 1, 5, 'approved'),
('light_novel_campus', '校园轻小说', '轻松愉快的校园日常+超自然元素，适合轻快节奏的青春故事创作', '轻小说', 'linear-gradient(135deg, #a8edea 0%, #fed6e3 50%, #d4a5ff 100%)', 'SmileOutlined', '轻小说', '我与超能力者的日常', '青春最珍贵的不是超能力，而是身边愿意陪你犯傻的朋友。日常的点滴构成了最不平凡的回忆。', '明德中学，一所有着百年历史的名校。校园内隐藏着不为人知的秘密——部分学生觉醒了超能力。学生会在暗中维护校园的日常秩序，防止超能力事件影响普通学生的生活。', '转学第一天，主角意外卷入超能力者之间的争斗。阴差阳错加入学生会"特殊事务处理部"，在日常校园生活与超自然事件之间来回奔波。结识各具特色的同伴，一起解决校园内发生的各种奇异事件。', 1, 6, 'approved'),
('history_alternate', '架空历史', '穿越/重生到历史背景的平行世界，利用现代知识成就一番事业', '历史', 'linear-gradient(135deg, #3c2a21 0%, #6b4226 40%, #c9a96e 100%)', 'ReadOutlined', '历史', '大梁风华', '历史的车轮下，个人的选择能否改变命运？在已有的知识框架中，如何平衡预知与顺其自然。', '大梁王朝，国力正处于由盛转衰的关键节点。科举制度完备，商业发达但受到官僚压制。周边有北戎、南蛮、东夷等势力，海疆有倭寇侵扰。', '现代人意外穿越/重生为大梁王朝的一个小人物（书生/商人/庶子），凭借对历史的了解和现代管理知识，从地方开始逐步积累实力。通过科举入仕/经营商业/治军练兵等途径崛起，在王朝危机中力挽狂澜。', 1, 7, 'approved'),
('blank_custom', '空白模板', '完全空白的起点，仅包含基础的创作指引，让您从零自由发挥想象力', '其他', 'linear-gradient(135deg, #2d3748 0%, #4a5568 100%)', 'EditOutlined', NULL, NULL, NULL, NULL, NULL, 1, 99, 'approved');
