const BASE = '';

export interface Preset {
  index: number;
  name: string;
  topic: string;
  audience: string;
  tone: string;
  section_count: number;
  use_web_search: boolean;
  image_style: string;
  aspect_ratio: string;
  resolution: string;
}

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface LogEntry {
  at: string;
  message: string;
}

export interface JobResult {
  draft?: {
    title: string;
    subtitle: string;
    tags: string[];
  };
  links?: {
    article_html: string;
    article_markdown: string;
  };
  cover_image?: {
    source_url: string;
    alt_text: string;
  };
  section_images?: Array<{
    source_url: string;
    alt_text: string;
  }>;
  article_html?: string;
  article_markdown?: string;
  article_json?: string;
  draft_markdown?: string;
  draft_json?: string;
  output_dir?: string;
  title?: string;
  summary?: string;
  tags?: string[];
  image_count?: number;
}

export interface Job {
  job_id: string;
  status: JobStatus;
  logs: LogEntry[];
  result: JobResult | null;
  error: string | null;
}

export interface ArticleParams {
  topic?: string;
  audience?: string;
  tone?: string;
  sections?: number;
  image_style?: string;
  aspect_ratio?: string;
  resolution?: string;
  use_web_search?: boolean;
  preset_index?: number;
  generation_profile?: 'speed' | 'balanced' | 'quality';
}

export const fetchPresets = async (): Promise<Preset[]> => {
  try {
    const response = await fetch(`${BASE}/api/presets`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch (err) {
    console.warn('fetchPresets error:', err);
    throw new Error('Failed to fetch presets');
  }
};

export const generatePresets = async (brief?: string, count: number = 3): Promise<Preset[]> => {
  try {
    // 如果没有提供 brief，使用一个通用的生成请求
    const finalBrief = brief || 'AI内容生成、AI工具应用、AI工作效率';

    console.log('%c[AI赋能] 📤 发送请求到 API', 'color: #0066cc; font-weight: bold', {
      url: `${BASE}/api/presets/generate`,
      brief: finalBrief,
      count,
    });

    const response = await fetch(`${BASE}/api/presets/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief: finalBrief, count }),
    });

    const responseText = await response.text();
    console.log(`%c[AI赋能] 📥 收到响应`, `color: ${response.ok ? '#22c55e' : '#ef4444'}; font-weight: bold`, {
      status: response.status,
      statusText: response.statusText,
      bodyPreview: responseText.slice(0, 300),
    });

    if (!response.ok) {
      console.warn(`[AI赋能] ❌ API 错误: ${response.status} ${response.statusText}`);
      return [];
    }

    try {
      const data = JSON.parse(responseText);
      // API 可能返回 { presets: [...] } 或直接返回数组
      const presets = Array.isArray(data) ? data : data.presets || [];

      console.log(`%c[AI赋能] ✅ 成功获取 ${presets.length} 个预设`, 'color: #22c55e; font-weight: bold', presets);

      return presets;
    } catch (parseErr) {
      console.error(`[AI赋能] ❌ JSON 解析错误:`, parseErr);
      return [];
    }
  } catch (err) {
    console.error('[AI赋能] ❌ 网络请求错误:', err);
    return [];
  }
};

export const createArticle = async (params: ArticleParams): Promise<string> => {
  const response = await fetch(`${BASE}/api/articles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error('Failed to create article');
  const data = await response.json();
  return data.job_id;
};

export const getJob = async (jobId: string): Promise<Job> => {
  const response = await fetch(`${BASE}/api/jobs/${jobId}`);
  if (!response.ok) throw new Error('Failed to get job status');
  return response.json();
};

export const getOutputText = async (jobId: string, filename: string): Promise<string> => {
  const response = await fetch(`${BASE}/api/outputs/${jobId}/${filename}`);
  if (!response.ok) throw new Error(`Failed to get output: ${filename}`);
  return response.text();
};

export const fetchRemoteText = async (url: string): Promise<string> => {
  const response = await fetch(`${BASE}/api/fetch-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) throw new Error('Failed to fetch generated output');
  return response.text();
};
