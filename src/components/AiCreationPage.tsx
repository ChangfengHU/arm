import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Send,
  Sparkles,
} from 'lucide-react';
import {
  fetchPresets,
  generatePresets,
  createArticle,
  getJob,
  getOutputText,
  fetchRemoteText,
  type Preset,
  type Job,
  type JobResult,
} from '../lib/smolagentApi';

interface AiCreationPageProps {
  onSendToTypesetter: (markdown: string) => void;
}

type Phase = 'form' | 'generating' | 'result';

const progressSteps = ['分析主题', '撰写内容', '生成配图', '整理输出'];

const toneOptions = ['正式', '轻松', '专业', '创意'];
const imageStyleOptions = ['摄影', '插画', '现代', '复古'];
const generationProfileOptions = ['speed', 'balanced', 'quality'] as const;

const normalizeTone = (value: string) => {
  if (value.includes('正式') || value.includes('权威')) return '正式';
  if (value.includes('专业') || value.includes('深度') || value.includes('严谨')) return '专业';
  if (value.includes('创意') || value.includes('有趣') || value.includes('新奇')) return '创意';
  if (value.includes('轻松') || value.includes('生动') || value.includes('口语')) return '轻松';
  return toneOptions.includes(value) ? value : '轻松';
};

const normalizeImageStyle = (value: string) => {
  if (value.includes('摄影') || value.includes('照片') || value.includes('写实')) return '摄影';
  if (value.includes('插画') || value.includes('绘画') || value.includes('手绘')) return '插画';
  if (value.includes('复古') || value.includes('怀旧')) return '复古';
  if (value.includes('现代') || value.includes('科技') || value.includes('极简')) return '现代';
  return imageStyleOptions.includes(value) ? value : '现代';
};

// 智能分析主题并生成参数
interface AnalysisResult {
  topic: string;
  audience: string;
  tone: string;
  imageStyle: string;
  sections: number;
  useWebSearch: boolean;
}

const analyzeTopicAndOptimize = (topic: string): AnalysisResult => {
  const originalTopic = topic.trim();
  const lowerTopic = topic.toLowerCase();

  // 检测目标受众
  let audience = '上班族';
  if (lowerTopic.includes('开发') || lowerTopic.includes('程序') || lowerTopic.includes('代码') || lowerTopic.includes('技术')) {
    audience = '开发者';
  } else if (lowerTopic.includes('学生') || lowerTopic.includes('校园') || lowerTopic.includes('教学') || lowerTopic.includes('初学')) {
    audience = '学生';
  } else if (lowerTopic.includes('创业') || lowerTopic.includes('融资') || lowerTopic.includes('商业')) {
    audience = '创业者';
  } else if (lowerTopic.includes('家长') || lowerTopic.includes('孩子') || lowerTopic.includes('教育') || lowerTopic.includes('育儿')) {
    audience = '家长';
  }

  // 检测语气风格
  let tone = '轻松';
  if (lowerTopic.includes('深度') || lowerTopic.includes('分析') || lowerTopic.includes('解析') || lowerTopic.includes('研究')) {
    tone = '专业';
  } else if (lowerTopic.includes('创意') || lowerTopic.includes('新奇') || lowerTopic.includes('趣') || lowerTopic.includes('有趣')) {
    tone = '创意';
  } else if (lowerTopic.includes('正式') || lowerTopic.includes('权威') || lowerTopic.includes('官方') || lowerTopic.includes('规范')) {
    tone = '正式';
  }

  // 检测配图风格
  let imageStyle = '现代';
  if (lowerTopic.includes('摄影') || lowerTopic.includes('照片') || lowerTopic.includes('人物') || lowerTopic.includes('生活')) {
    imageStyle = '摄影';
  } else if (lowerTopic.includes('插画') || lowerTopic.includes('艺术') || lowerTopic.includes('创意')) {
    imageStyle = '插画';
  } else if (lowerTopic.includes('复古') || lowerTopic.includes('怀旧') || lowerTopic.includes('历史')) {
    imageStyle = '复古';
  } else if (lowerTopic.includes('技术') || lowerTopic.includes('科技') || lowerTopic.includes('代码') || lowerTopic.includes('开发')) {
    imageStyle = '插画';
  }

  // 基于主题长度和复杂度判断段数
  const wordCount = topic.length;
  let sections = 5;
  if (wordCount < 20) {
    sections = 3;
  } else if (wordCount < 50) {
    sections = 4;
  } else if (wordCount > 80) {
    sections = 6;
  }

  // 检测是否需要联网搜索（时间敏感的关键词）
  const timeKeywords = ['最新', '2024', '2025', '2026', '当下', '趋势', '新闻', '动态', '近期', '今年', '明年', '最近'];
  const useWebSearch = timeKeywords.some(kw => lowerTopic.includes(kw));

  const optimizedTopic = /指南|解析|方法|清单|攻略|如何|为什么|怎么办/.test(originalTopic)
    ? originalTopic
    : `${originalTopic}：从问题到解决方案的完整指南`;

  return { topic: optimizedTopic, audience, tone, imageStyle, sections, useWebSearch };
};


// 默认灵感预设（当 API 失败时使用）
const DEFAULT_PRESETS: Preset[] = [
  {
    index: 1,
    name: 'AI Agent 深度解析',
    topic: 'AI Agent 如何重塑微信公众号内容生产',
    audience: '关注 AI 生产，内容营销5个人品账的中文公众号读者',
    tone: '专业',
    section_count: 4,
    use_web_search: false,
    image_style: '插画',
    aspect_ratio: '16:9',
    resolution: '2k',
  },
  {
    index: 2,
    name: '普通职场人 AI 提效指南',
    topic: '普通上班族如何用 AI 在一周内提升工作效率',
    audience: '想提升工作、写作、表格整理和信息处理效率的中文职场人',
    tone: '轻松',
    section_count: 4,
    use_web_search: false,
    image_style: '现代',
    aspect_ratio: '16:9',
    resolution: '2k',
  },
  {
    index: 3,
    name: '视频创作工具选型',
    topic: 'AI 视频生成工具对标对比，如何选择最适合你的方案',
    audience: '内容创作者、短视频博主、需要快速生产视频的运营',
    tone: '正式',
    section_count: 5,
    use_web_search: true,
    image_style: '摄影',
    aspect_ratio: '16:9',
    resolution: '2k',
  },
];

interface PresetCardProps {
  preset: Preset;
  selected: boolean;
  onClick: () => void;
}

const PresetCard = ({ preset, selected, onClick }: PresetCardProps) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-[20px] border-2 p-4 text-left transition-all cursor-pointer ${
      selected
        ? 'border-[#0066cc] bg-[#0066cc]/10 shadow-lg shadow-[#0066cc]/20 dark:border-[#0a84ff] dark:bg-[#0a84ff]/15 dark:shadow-[#0a84ff]/20'
        : 'border-[#e5e7eb] bg-white hover:border-[#0066cc] hover:shadow-md dark:border-white/10 dark:bg-[#0c0c0c] dark:hover:border-[#0a84ff]'
    }`}
  >
    <div className="flex items-start justify-between gap-2 mb-2">
      <h3 className={`font-bold text-sm ${selected ? 'text-[#0066cc] dark:text-[#0a84ff]' : 'text-[#0f172a] dark:text-white'}`}>
        {preset.name}
      </h3>
      {selected && <Check size={18} className="text-[#0066cc] dark:text-[#0a84ff] flex-none mt-0.5" strokeWidth={3} />}
    </div>
    <p className="text-xs text-[#64748b] dark:text-[#a1a1a6] line-clamp-2">{preset.topic}</p>
    <div className="mt-3 flex flex-wrap gap-1">
      <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-semibold text-[#64748b] dark:bg-white/8 dark:text-[#d1d5db]">
        {preset.audience.slice(0, 15)}...
      </span>
      <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-semibold text-[#64748b] dark:bg-white/8 dark:text-[#d1d5db]">
        {preset.tone.slice(0, 15)}...
      </span>
    </div>
  </button>
);

export default function AiCreationPage({ onSendToTypesetter }: AiCreationPageProps) {
  const [phase, setPhase] = useState<Phase>('form');
  const [presets, setPresets] = useState<Preset[]>(DEFAULT_PRESETS);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(-1);

  // Form fields
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('上班族');
  const [tone, setTone] = useState('轻松');
  const [sections, setSections] = useState(5);
  const [imageStyle, setImageStyle] = useState('现代');
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [generationProfile, setGenerationProfile] = useState<'speed' | 'balanced' | 'quality'>('balanced');

  // Job state
  const [jobId, setJobId] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<JobResult | null>(null);
  const [htmlContent, setHtmlContent] = useState('');
  const [mdContent, setMdContent] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [generatingParams, setGeneratingParams] = useState(false);

  // Load presets on mount
  useEffect(() => {
    const loadPresets = async () => {
      try {
        setPresetsLoading(true);
        const data = await fetchPresets();
        if (data && data.length > 0) {
          setPresets(data);
        }
      } catch (err) {
        console.error('Failed to load presets, using defaults:', err);
      } finally {
        setPresetsLoading(false);
      }
    };
    loadPresets();
  }, []);

  // Poll job status
  useEffect(() => {
    if (!jobId || phase !== 'generating') return;

    const timer = setInterval(async () => {
      try {
        const j = await getJob(jobId);
        setJob(j);

        if (j.status === 'succeeded') {
          clearInterval(timer);
          try {
            const jobResult = j.result;
            if (!jobResult) throw new Error('生成结果为空');

            const htmlUrl = jobResult.article_html || jobResult.links?.article_html;
            const markdownUrl = jobResult.article_markdown || jobResult.links?.article_markdown;

            const [html, md] = await Promise.all([
              htmlUrl ? fetchRemoteText(htmlUrl) : getOutputText(jobId, 'article.html'),
              markdownUrl ? fetchRemoteText(markdownUrl) : getOutputText(jobId, 'article.md'),
            ]);
            setHtmlContent(html);
            setMdContent(md);
            setResult(jobResult);
            setPhase('result');
          } catch (err) {
            setError(`获取生成结果失败：${err instanceof Error ? err.message : '未知错误'}`);
            setPhase('form');
          }
        } else if (j.status === 'failed') {
          clearInterval(timer);
          setError(j.error ?? '生成失败');
          setPhase('form');
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [jobId, phase]);

  const handlePresetSelect = (index: number) => {
    setSelectedPresetIndex(index);
    const preset = presets[index];
    if (preset) {
      setTopic(preset.topic);
      setAudience(preset.audience);
      setTone(normalizeTone(preset.tone));
      setSections(preset.section_count);
      setImageStyle(normalizeImageStyle(preset.image_style));
      setUseWebSearch(preset.use_web_search);
    }
  };

  const handleAiEnhance = async () => {
    if (!topic.trim()) {
      setError('请先输入文章主题');
      return;
    }

    try {
      setGeneratingParams(true);
      setError('');
      setSelectedPresetIndex(-1);

      console.log('%c[🧠 智能分析] 开始分析主题', 'color: #6366f1; font-weight: bold', { topic });

      // 首先使用本地智能分析
      const analysis = analyzeTopicAndOptimize(topic);
      console.log('%c[🧠 智能分析] 分析结果', 'color: #06b6d4; font-weight: bold', analysis);

      // 应用智能分析结果
      setTopic(analysis.topic);
      setAudience(analysis.audience);
      setTone(analysis.tone);
      setSections(analysis.sections);
      setImageStyle(analysis.imageStyle);
      setUseWebSearch(analysis.useWebSearch);

      // 同时尝试从 API 获取更多增强（但不阻塞 UI）
      try {
        console.log('%c[🚀 API 增强] 调用 API 获取更多建议', 'color: #ec4899; font-weight: bold');
        const generatedPresets = await generatePresets(topic, 1);

        if (generatedPresets && generatedPresets.length > 0) {
          const preset = generatedPresets[0];
          console.log('%c[🎯 API 结果] 获得 API 预设', 'color: #f59e0b; font-weight: bold', preset);
          if (preset.topic) setTopic(preset.topic);
          if (preset.audience) setAudience(preset.audience);
          if (preset.tone) setTone(normalizeTone(preset.tone));
          if (preset.section_count) setSections(preset.section_count);
          if (preset.image_style) setImageStyle(normalizeImageStyle(preset.image_style));
          if (typeof preset.use_web_search === 'boolean') setUseWebSearch(preset.use_web_search);
        }
      } catch (apiErr) {
        console.warn('%c[⚠️ API 失败] 但本地分析已生效', 'color: #f97316; font-weight: bold', apiErr);
        // API 失败不影响用户体验，本地分析已生效
      }

      // 显示成功提示
      setSuccess('✨ AI 已优化主题和参数，请查看下方表单');

      // 3 秒后清除成功消息
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err) {
      console.error('%c[❌ 分析失败]', 'color: #ef4444; font-weight: bold', err);
      setError(`AI 赋能失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setGeneratingParams(false);
    }
  };

  const handleRefreshPresets = async () => {
    try {
      setPresetsLoading(true);
      setSelectedPresetIndex(-1);

      const briefOptions = [
        // AI 与技术领域
        'AI Agent 如何重塑内容创作流程和工作方式',
        'AI 视频生成工具的对标对比和应用场景',
        'AI 文案生成如何提升社媒运营效率',
        'Claude、ChatGPT 等大模型在实际工作中的应用技巧',
        'AI 音视频处理工具的创意应用和最佳实践',

        // 短视频与直播
        '短视频创作的全流程优化和涨粉策略',
        '抖音、小红书、微博平台运营的差异化策略',
        '直播带货的选品、话术和转化提升技巧',
        '短视频脚本创意和素材搭配的高效方法',
        '视频剪辑软件对比和创作工作流优化',

        // 个人品牌与运营
        '自媒体矩阵运营和账号增长的系统方法论',
        '微信公众号内容策略和粉丝变现方式',
        '个人品牌打造和IP运营的核心要素',
        '社交媒体内容日历规划和高效排期',
        '粉丝互动和社区运营的增强用户粘性技巧',

        // 职场与知识管理
        '职场人士的时间管理和效率提升系统',
        '知识管理体系搭建和个人学习成长加速法',
        '远程工作的协作工具和团队沟通最佳实践',
        '职场沟通技巧和跨部门协作的关键方法',
        '员工职业发展规划和技能提升路径',

        // 营销与增长
        '营销漏斗优化和用户转化率提升策略',
        '社群运营和粉丝经济变现的全套方法',
        '产品launch和新品发布的营销策略',
        '品牌故事讲述和情感连接的实战案例',
        '数据驱动的营销决策和ROI优化',

        // 生活方式与自我提升
        '健身减肥的科学方法和日常坚持技巧',
        '时尚穿搭和个人形象提升的实战指南',
        '家居改造和生活品质提升的低成本方案',
        '养生保健和健康生活方式的完整指南',
        '亲子教育和家庭教养的现代化方法',

        // 创业与商业
        '创业融资的路径和投资人关系管理',
        '商业模式创新和市场差异化竞争策略',
        '创业初期的财务管理和成本控制',
        '团队招聘和组织文化建设要点',
        '产品市场匹配和用户反馈迭代方法',
      ];
      const randomBrief = briefOptions[Math.floor(Math.random() * briefOptions.length)];

      const data = await generatePresets(randomBrief, 3);
      if (data && data.length > 0) {
        setPresets(data);
      } else {
        try {
          const fallback = await fetchPresets();
          if (fallback && fallback.length > 0) {
            setPresets(fallback);
          }
        } catch {
          // 保持现有预设
        }
      }
    } catch (err) {
      console.error('Failed to refresh presets:', err);
    } finally {
      setPresetsLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim()) return;

    try {
      setError('');
      setPhase('generating');
      setJob(null);
      setResult(null);

      const jid = await createArticle({
        topic,
        audience,
        tone,
        sections,
        image_style: imageStyle,
        aspect_ratio: '16:9',
        resolution: '2k',
        use_web_search: useWebSearch,
        generation_profile: generationProfile,
      });

      setJobId(jid);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
      setPhase('form');
    }
  };

  const handleRegenerate = () => {
    setPhase('form');
    setJobId('');
    setJob(null);
    setResult(null);
    setHtmlContent('');
    setMdContent('');
  };

  const downloadMarkdown = () => {
    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AI_Article_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getCurrentStepIndex = () => {
    if (!job?.logs.length) return 0;
    const lastLog = job.logs[job.logs.length - 1].message.toLowerCase();
    if (lastLog.includes('分析') || lastLog.includes('analyzing')) return 0;
    if (lastLog.includes('撰写') || lastLog.includes('writing')) return 1;
    if (lastLog.includes('配图') || lastLog.includes('image') || lastLog.includes('图片')) return 2;
    if (lastLog.includes('整理') || lastLog.includes('output') || lastLog.includes('finalize')) return 3;
    return 0;
  };

  if (phase === 'form') {
    return (
      <main className="flex-1 overflow-auto bg-[#f7f8fc] text-[#101828] dark:bg-black dark:text-[#f5f5f7]">
        <section className="border-b border-[#e5e7eb] bg-white px-5 py-3 dark:border-white/10 dark:bg-[#0c0c0c]">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-[#0066cc] dark:text-[#0a84ff]" />
              <h1 className="text-lg font-black text-[#0f172a] dark:text-white">AI 创作</h1>
              <p className="ml-auto hidden sm:block text-xs text-[#64748b] dark:text-[#a1a1a6]">输入方向，AI 自动生成完整参数和文章内容</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-4 md:px-8">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-sm font-bold text-[#0f172a] dark:text-white">推荐灵感 (可选)</h2>
            <button
              onClick={handleRefreshPresets}
              disabled={presetsLoading}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-xs font-semibold text-[#475569] transition-colors hover:bg-[#f8fafc] disabled:opacity-50 dark:border-white/10 dark:bg-white/8 dark:text-[#d1d5db] dark:hover:bg-white/12"
            >
              {presetsLoading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCcw size={12} />
              )}
              换一批
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 mb-6">
            {presetsLoading ? (
              <div className="col-span-3 flex justify-center py-8">
                <Loader2 className="animate-spin" size={28} />
              </div>
            ) : presets.length > 0 ? (
              presets.map((preset, idx) => (
                <PresetCard
                  key={`preset-${idx}`}
                  preset={preset}
                  selected={selectedPresetIndex === idx}
                  onClick={() => handlePresetSelect(idx)}
                />
              ))
            ) : (
              <div className="col-span-3 text-center py-8 text-[#64748b] dark:text-[#a1a1a6]">
                暂无灵感推荐
              </div>
            )}
          </div>

          <div className="rounded-[20px] border border-[#eef2f7] bg-white p-5 dark:border-white/10 dark:bg-[#0c0c0c]">
            <h3 className="text-sm font-bold text-[#0f172a] dark:text-white mb-4">自定义参数</h3>

            {selectedPresetIndex >= 0 && presets[selectedPresetIndex] && (
              <div className="mb-6 rounded-2xl bg-[#f8fafc] p-4 dark:bg-white/5 border border-[#e5e7eb] dark:border-white/10">
                <p className="text-xs font-semibold text-[#64748b] dark:text-[#a1a1a6] mb-3">当前选中预设详情</p>

                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs font-semibold text-[#94a3b8] dark:text-[#64748b] mb-1">预设名称</p>
                    <p className="text-[#0f172a] dark:text-white font-medium">{presets[selectedPresetIndex].name}</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-[#94a3b8] dark:text-[#64748b] mb-1">受众</p>
                    <p className="text-[#475569] dark:text-[#d1d5db]">{presets[selectedPresetIndex].audience}</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-[#94a3b8] dark:text-[#64748b] mb-1">语气风格</p>
                    <p className="text-[#475569] dark:text-[#d1d5db]">{presets[selectedPresetIndex].tone}</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-[#94a3b8] dark:text-[#64748b] mb-1">配图风格</p>
                    <p className="text-[#475569] dark:text-[#d1d5db]">{presets[selectedPresetIndex].image_style}</p>
                  </div>

                  <div className="flex gap-4 pt-2">
                    <div>
                      <p className="text-xs font-semibold text-[#94a3b8] dark:text-[#64748b] mb-1">段数</p>
                      <p className="text-[#0f172a] dark:text-white font-medium">{presets[selectedPresetIndex].section_count}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#94a3b8] dark:text-[#64748b] mb-1">分辨率</p>
                      <p className="text-[#0f172a] dark:text-white font-medium">{presets[selectedPresetIndex].resolution}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#94a3b8] dark:text-[#64748b] mb-1">宽高比</p>
                      <p className="text-[#0f172a] dark:text-white font-medium">{presets[selectedPresetIndex].aspect_ratio}</p>
                    </div>
                  </div>

                  {presets[selectedPresetIndex].use_web_search && (
                    <div className="text-xs bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-1 rounded inline-block font-medium">
                      ✓ 联网搜索已启用
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-[#0f172a] dark:text-white mb-2">
                  文章主题 *
                </label>
                <div className="relative">
                  <textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="例如：如何在 React 中使用 Hooks"
                    className="w-full rounded-2xl border border-[#e5e7eb] bg-white p-3 pr-12 text-sm focus:border-[#0066cc]/40 focus:ring-4 focus:ring-[#0066cc]/10 outline-none transition-all dark:border-white/10 dark:bg-black/50 dark:text-white dark:focus:border-[#0a84ff]/40"
                    rows={3}
                  />
                  <button
                    type="button"
                    onClick={handleAiEnhance}
                    disabled={generatingParams || !topic.trim()}
                    title={topic.trim() ? '点击：AI 优化主题并自动生成其他参数' : '请先输入文章主题'}
                    className={`absolute bottom-3 right-3 p-2.5 rounded-lg transition-all ${
                      !topic.trim()
                        ? 'text-[#cbd5e1] cursor-not-allowed dark:text-[#4a5568]'
                        : 'text-[#0066cc] hover:text-[#0052a3] hover:bg-[#0066cc]/10 dark:text-[#0a84ff] dark:hover:text-[#0063d8] dark:hover:bg-[#0a84ff]/10'
                    }`}
                  >
                    {generatingParams ? (
                      <Loader2 size={18} className="animate-spin text-[#0066cc] dark:text-[#0a84ff]" />
                    ) : (
                      <Sparkles size={18} />
                    )}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-[#64748b] dark:text-[#a1a1a6] font-semibold">
                    输入主题后，点击 AI 优化主题，自动改写主题并填充【受众】【语气】【配图风格】【段数】等参数
                  </p>
                  <button
                    type="button"
                    onClick={handleAiEnhance}
                    disabled={generatingParams || !topic.trim()}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#0066cc]/20 bg-[#0066cc]/10 px-3 text-xs font-bold text-[#0066cc] transition-colors hover:bg-[#0066cc]/15 disabled:cursor-not-allowed disabled:border-[#e5e7eb] disabled:bg-[#f1f5f9] disabled:text-[#94a3b8] dark:border-[#0a84ff]/20 dark:bg-[#0a84ff]/10 dark:text-[#0a84ff] dark:disabled:border-white/10 dark:disabled:bg-white/8 dark:disabled:text-[#64748b]"
                  >
                    {generatingParams ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    AI 优化主题
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-[#0f172a] dark:text-white mb-1.5">
                    目标受众
                  </label>
                  <select
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    className="w-full rounded-lg border border-[#e5e7eb] bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-black/50 dark:text-white"
                  >
                    {['上班族', '学生', '创业者', '家长', '开发者'].map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0f172a] dark:text-white mb-1.5">
                    语气风格
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {toneOptions.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setTone(opt)}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                          tone === opt
                            ? 'bg-[#0066cc] text-white dark:bg-[#0a84ff]'
                            : 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e5e7eb] dark:bg-white/8 dark:text-[#d1d5db] dark:hover:bg-white/12'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-[#0f172a] dark:text-white mb-1.5">
                    段数：{sections}
                  </label>
                  <input
                    type="range"
                    min="3"
                    max="8"
                    value={sections}
                    onChange={(e) => setSections(parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0f172a] dark:text-white mb-1.5">
                    配图风格
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {imageStyleOptions.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setImageStyle(opt)}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                          imageStyle === opt
                            ? 'bg-[#0066cc] text-white dark:bg-[#0a84ff]'
                            : 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e5e7eb] dark:bg-white/8 dark:text-[#d1d5db] dark:hover:bg-white/12'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-[#0f172a] dark:text-white mb-1.5">
                    生成档位
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {generationProfileOptions.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setGenerationProfile(opt)}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                          generationProfile === opt
                            ? 'bg-[#0066cc] text-white dark:bg-[#0a84ff]'
                            : 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e5e7eb] dark:bg-white/8 dark:text-[#d1d5db] dark:hover:bg-white/12'
                        }`}
                      >
                        {opt === 'speed' ? '快速' : opt === 'balanced' ? '均衡' : '质量'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="web-search"
                  checked={useWebSearch}
                  onChange={(e) => setUseWebSearch(e.target.checked)}
                  className="rounded cursor-pointer"
                />
                <label
                  htmlFor="web-search"
                  className="cursor-pointer text-xs font-semibold text-[#0f172a] dark:text-white"
                >
                  联网搜索（更新信息）
                </label>
              </div>

              <button
                onClick={handleGenerate}
                disabled={!topic.trim()}
                className="mt-4 w-full h-10 rounded-lg bg-[#0066cc] px-4 text-xs font-black text-white transition-colors hover:bg-[#0052a3] disabled:bg-[#cbd5e1] disabled:cursor-not-allowed dark:bg-[#0a84ff] dark:hover:bg-[#0063d8] dark:disabled:bg-[#4a5568]"
              >
                开始生成
              </button>

              {success && (
                <div className="flex items-start gap-3 rounded-2xl bg-green-50 p-3 text-sm text-green-700 dark:bg-green-500/10 dark:text-green-300 animate-pulse">
                  <Check className="mt-0.5 flex-none" size={17} />
                  <span>{success}</span>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-3 rounded-2xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  <AlertCircle className="mt-0.5 flex-none" size={17} />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (phase === 'generating') {
    const currentStep = getCurrentStepIndex();

    return (
      <main className="flex-1 overflow-auto bg-[#f7f8fc] text-[#101828] dark:bg-black dark:text-[#f5f5f7] flex flex-col items-center justify-center gap-8 px-5 py-10">
        <div className="w-full max-w-2xl">
          <div className="space-y-3">
            {progressSteps.map((label, index) => (
              <div key={label} className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black flex-none ${
                    index < currentStep
                      ? 'bg-emerald-500 text-white'
                      : index === currentStep
                        ? 'bg-[#0066cc] text-white dark:bg-[#0a84ff] animate-pulse'
                        : 'bg-[#e5e7eb] text-[#94a3b8] dark:bg-white/10'
                  }`}
                >
                  {index < currentStep ? (
                    <Check size={16} />
                  ) : index === currentStep ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={`text-sm font-medium ${
                    index <= currentStep
                      ? 'font-bold text-[#0f172a] dark:text-white'
                      : 'text-[#64748b] dark:text-[#a1a1a6]'
                  }`}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {job?.logs && job.logs.length > 0 && (
          <div className="w-full max-w-2xl">
            <div className="rounded-2xl bg-black/5 dark:bg-white/5 border border-[#eef2f7] dark:border-white/10 overflow-hidden max-h-[200px] overflow-y-auto">
              <div className="p-4 space-y-2">
                {job.logs.map((log, idx) => (
                  <div
                    key={`${log.at}-${idx}`}
                    className="text-xs text-[#64748b] dark:text-[#a1a1a6] font-mono"
                  >
                    [{log.at}] {log.message}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="text-center">
          <p className="text-sm text-[#64748b] dark:text-[#a1a1a6]">
            生成约需 60-120 秒，请稍候...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-auto bg-[#f7f8fc] text-[#101828] dark:bg-black dark:text-[#f5f5f7]">
      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="rounded-[28px] border border-[#eef2f7] bg-white overflow-hidden dark:border-white/10 dark:bg-[#0c0c0c]">
            <div className="flex items-center justify-between border-b border-[#eef2f7] bg-[#f8fafc] px-4 py-3 dark:border-white/10 dark:bg-black/40">
              <span className="text-sm font-bold text-[#0f172a] dark:text-white">AI 生成预览</span>
              {htmlContent && (
                <a
                  href={`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#0066cc] hover:text-[#0052a3] dark:text-[#0a84ff] dark:hover:text-[#0063d8]"
                  title="在新标签打开"
                >
                  <ExternalLink size={16} />
                </a>
              )}
            </div>
            {htmlContent && (
              <iframe
                srcDoc={htmlContent}
                sandbox="allow-scripts allow-same-origin"
                className="w-full min-h-[600px] border-0"
              />
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-[#eef2f7] bg-white p-5 dark:border-white/10 dark:bg-[#0c0c0c]">
              <h3 className="text-sm font-black text-[#0f172a] dark:text-white mb-3">文章信息</h3>

              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-[#64748b] dark:text-[#a1a1a6] mb-1">
                    标题
                  </p>
                  <p className="text-sm font-bold text-[#0f172a] dark:text-white">
                    {result?.draft?.title || result?.title || '-'}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-[#64748b] dark:text-[#a1a1a6] mb-1">
                    副标题
                  </p>
                  <p className="text-sm text-[#475569] dark:text-[#d1d5db]">
                    {result?.draft?.subtitle || result?.summary || '-'}
                  </p>
                </div>

                {((result?.draft?.tags && result.draft.tags.length > 0) || (result?.tags && result.tags.length > 0)) && (
                  <div>
                    <p className="text-xs font-semibold text-[#64748b] dark:text-[#a1a1a6] mb-2">
                      标签
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(result?.draft?.tags || result?.tags || []).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-[#f1f5f9] px-2 py-1 text-xs font-semibold text-[#0066cc] dark:bg-white/8 dark:text-[#0a84ff]"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {result?.cover_image && (
              <div className="rounded-[28px] border border-[#eef2f7] bg-white overflow-hidden p-3 dark:border-white/10 dark:bg-[#0c0c0c]">
                <p className="text-xs font-semibold text-[#64748b] dark:text-[#a1a1a6] mb-2 px-2">
                  封面图
                </p>
                <img
                  src={result.cover_image.source_url}
                  alt={result.cover_image.alt_text || '封面图'}
                  className="w-full rounded-lg object-cover max-h-[180px]"
                />
              </div>
            )}

            {result?.section_images && result.section_images.length > 0 && (
              <div className="rounded-[28px] border border-[#eef2f7] bg-white p-5 dark:border-white/10 dark:bg-[#0c0c0c]">
                <p className="text-sm font-black text-[#0f172a] dark:text-white mb-3">
                  配图（{result.section_images.length} 张）
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {result.section_images.map((img, idx) => (
                    <img
                      key={idx}
                      src={img.source_url}
                      alt={img.alt_text || `配图 ${idx + 1}`}
                      className="w-full rounded-lg object-cover aspect-square"
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={() => onSendToTypesetter(mdContent)}
                className="w-full h-12 rounded-2xl bg-[#0066cc] px-5 text-sm font-black text-white transition-colors hover:bg-[#0052a3] dark:bg-[#0a84ff] dark:hover:bg-[#0063d8] flex items-center justify-center gap-2"
              >
                <Send size={16} />
                导入到排版大师
              </button>

              <button
                onClick={handleRegenerate}
                className="w-full h-12 rounded-2xl border border-[#e5e7eb] bg-white px-5 text-sm font-black text-[#475569] transition-colors hover:bg-[#f8fafc] dark:border-white/10 dark:bg-white/8 dark:text-[#d1d5db] dark:hover:bg-white/12 flex items-center justify-center gap-2"
              >
                <RefreshCcw size={16} />
                重新生成
              </button>

              <button
                onClick={downloadMarkdown}
                className="w-full h-12 rounded-2xl border border-[#e5e7eb] bg-white px-5 text-sm font-black text-[#475569] transition-colors hover:bg-[#f8fafc] dark:border-white/10 dark:bg-white/8 dark:text-[#d1d5db] dark:hover:bg-white/12 flex items-center justify-center gap-2"
              >
                <Download size={16} />
                下载 Markdown
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
