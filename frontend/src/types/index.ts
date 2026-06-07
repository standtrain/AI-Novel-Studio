// 用户信息
export interface UserInfo {
  id: number;
  username: string;
  email: string;
  group: UserGroup;
  status: string;
  dailyTokensUsed: number;
  preferredModel?: string | null;
  temperaturePreset?: TemperaturePreset;
  customTemperature?: number | null;
  lastLoginAt?: string | null;
  createdAt: string;
}

export type TemperaturePreset = 'precise' | 'balanced' | 'creative' | 'wild' | 'custom';

// 用户分组
export interface UserGroup {
  id: number;
  name: string;
  tokenLimitPerDay: number;
  rateLimitPerMinute: number;
  maxNovels: number;
  maxChaptersPerNovel: number;
  canExport: boolean;
  canCustomize: boolean;
  canChooseModel: boolean;
  isAdmin?: boolean;
}

// 小说
export interface Novel {
  id: number;
  user_id: number;
  title: string;
  genre?: string;
  theme?: string;
  setting?: string;
  main_plot?: string;
  sub_plots?: string[];
  status: NovelStatus;
  current_step: number;
  chapter_count?: number;
  created_at: string;
  updated_at: string;
}

export type NovelStatus =
  | 'draft'
  | 'outline'
  | 'characters'
  | 'chapters_outline'
  | 'writing'
  | 'completed';

// 角色
export interface Character {
  id?: number;
  novel_id?: number;
  name: string;
  age?: string;
  gender?: string;
  role?: string;
  appearance?: string;
  personality?: string;
  background?: string;
  motivation?: string;
  arc?: string;
  relationships?: string[];
}

// 章节
export interface Chapter {
  id?: number;
  novel_id?: number;
  chapter_number: number;
  title: string;
  brief?: string;
  scenes?: string[];
  conflict?: string;
  turning_point?: string;
  characters_involved?: string[];
  emotional_tone?: string;
  ending_hook?: string;
  content?: string;
  summary?: string;
  status: 'outline' | 'writing' | 'completed';
  word_count: number;
  review_result?: string;
  extraction_result?: string;
}

// SSE 事件类型
export type SSEEventType = 'progress' | 'chunk' | 'result' | 'error' | 'done' | 'model_fallback' | 'context_brief' | 'review_result' | 'extraction_result' | 'polish_start' | 'polish_done';

// 审查问题
export interface ReviewIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'setting' | 'timeline' | 'continuity' | 'character' | 'logic' | 'ai_flavor' | 'pacing' | 'other';
  location: string;
  description: string;
  evidence: string;
  fix_hint: string;
  blocking: boolean;
}

// 数据提取结果
export interface ExtractionResult {
  entities_appeared: Array<{ id: string; name: string; type: string; is_new?: boolean; confidence?: number }>;
  state_deltas: Array<{ entity_id: string; field: string; old: string; new: string; confidence?: number }>;
  accepted_events: Array<{ event_id: string; chapter: number; event_type: string; subject: string }>;
  scenes: Array<{ index: number; location: string; summary: string; characters: string[] }>;
  summary_text: string;
  hook_type: string;
  hook_strength: string;
}

// 小说详情（含角色和章节）
export interface NovelDetail extends Novel {
  characters: Character[];
  chapters: Chapter[];
}

// 分页响应
export interface PaginatedResponse<T> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
}

// 导入小说数据格式（与导出 JSON 一致）
export interface ImportNovelData {
  title?: string;
  genre?: string;
  novel?: {
    title?: string;
    genre?: string;
    theme?: string;
    setting?: string;
    main_plot?: string;
    sub_plots?: string[];
    chapter_count?: number;
  };
  characters?: Character[];
  chapters?: Chapter[];
}

// 导入预览摘要（前端预览展示用）
export interface ImportPreview {
  title: string;
  genre: string;
  characterCount: number;
  chapterCount: number;
  totalWords: number;
  status: string;
  currentStep: number;
}

// 智能导入 AI 分析结果类型
export interface ImportAnalysisCharacter {
  name: string;
  role: string;
  personality: string;
  abilities?: string;
  relationships: Array<{ with: string; type: string }>;
  importance: 'high' | 'medium' | 'low';
}

export interface ImportAnalysisChapter {
  chapter_number: number;
  title?: string;
  summary: string;
  key_events: string[];
  characters_involved: string[];
  hook?: string;
}

export interface ImportAnalysisResult {
  novel: ImportNovelData['novel'];
  characters: ImportAnalysisCharacter[];
  chapters: ImportAnalysisChapter[];
  warnings?: string[];
}

// Skills 类型
export type SkillPhase = 'outline' | 'characters' | 'chapters_outline' | 'write_chapter' | 'context_assembly' | 'review' | 'polish' | 'data_extraction' | 'all';

export interface Skill {
  id: number;
  name: string;
  display_name: string;
  description: string;
  icon?: string;
  system_prompt: string;
  phase: SkillPhase;
  parameters_schema?: Record<string, any>;
  enabled: boolean;
  sort_order: number;
  allowed_tools?: string | null;
  metadata?: Record<string, any> | null;
}

export interface UserSkill extends Skill {
  user_enabled: boolean | null;
  user_parameters: Record<string, any> | null;
}

// MCP 类型
export interface McpServerConfig {
  id: number;
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  enabled: boolean;
  description?: string;
}

export interface UserMcpConfig extends McpServerConfig {
  user_enabled: boolean | null;
  user_api_key?: string;
  user_extra_config?: Record<string, any>;
}

// 模型 Token 限额配置
export interface ModelTokenLimit {
  id: number;
  provider_name: string;
  model_name: string;
  daily_limit: number;
  monthly_limit: number;
  daily_used: number;
  monthly_used: number;
  enabled: boolean;
}

// 系统通知
export interface Notification {
  id: number;
  title: string;
  content: string;
  show_popup: boolean;
  show_banner: boolean;
  show_inmail: boolean;
  show_email: boolean;
  enabled: boolean;
  sort_order: number;
  inmail_sent_at?: string | null;
  email_sent_at?: string | null;
  created_at: string;
  updated_at: string;
}

// 站内信
export interface Inmail {
  id: number;
  user_id: number;
  notification_id: number | null;
  title: string;
  content: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

// 可选模型（供用户偏好选择）
export interface SelectableModel {
  providerName: string;
  models: { name: string; phases: string[] }[];
}
