import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle,
    Bookmark,
    Check,
    CircleCheck,
    Clipboard,
    Download,
    ExternalLink,
    FileText,
    Heart,
    Image,
    Loader2,
    MessageCircle,
    Play,
    Send,
    Share2,
    Sparkles,
    Trash2,
    User,
    Video,
    X,
    Zap,
} from 'lucide-react';

type PlatformId = 'xiaohongshu' | 'douyin' | 'tiktok';

type XhsAuthor = {
    id: string;
    name: string;
    avatar: string;
    profileUrl?: string;
};

type XhsImageResult = {
    index: number;
    previewUrl: string;
    originalUrl: string;
    ossUrl?: string;
    liveUrl?: string;
    width?: number;
    height?: number;
};

type XhsNoteData = {
    noteId: string;
    postUrl: string;
    title: string;
    desc: string;
    type: 'image' | 'video' | 'unknown';
    author: XhsAuthor;
    stats: {
        likes: number;
        comments: number;
        shares: number;
        collects: number;
    };
    tags: string[];
    publishTime: string;
    ipLocation?: string;
    coverUrl?: string;
    images: XhsImageResult[];
    video?: {
        url: string;
        coverUrl?: string;
    };
};

type ParseResult = {
    success: boolean;
    platform: string;
    mediaType?: 'video' | 'image';
    videoId: string;
    title: string;
    desc?: string;
    videoUrl: string;
    ossUrl: string;
    coverUrl?: string;
    images?: XhsImageResult[];
    imageCount?: number;
    liveCount?: number;
    watermark?: boolean;
    noteData?: XhsNoteData;
    error?: string;
};

type MaterialParserPageProps = {
    onSendToTypesetter: (markdown: string) => void;
};

type PreviewMedia = {
    type: 'video' | 'image' | 'live';
    url: string;
    poster?: string;
    label: string;
};

const parseApiBase = (import.meta.env.VITE_PARSE_API_BASE ?? '').replace(/\/$/, '');

const platforms: Array<{
    id: PlatformId;
    label: string;
    title: string;
    description: string;
    placeholder: string;
}> = [
    {
        id: 'xiaohongshu',
        label: '小红书',
        title: '小红书视频文案提取',
        description: '支持笔记文案、图片、Live 图和视频资源解析。',
        placeholder: '粘贴小红书笔记分享链接或分享口令，例如：https://www.xiaohongshu.com/explore/...',
    },
    {
        id: 'douyin',
        label: '抖音',
        title: '抖音视频去水印解析',
        description: '沿用已验证的抖音解析链路，解析后自动返回可用视频地址。',
        placeholder: '粘贴抖音分享链接或口令，例如：https://v.douyin.com/...',
    },
    {
        id: 'tiktok',
        label: 'TikTok',
        title: 'TikTok 视频解析',
        description: '支持 TikTok 链接解析，适合跨平台素材收集。',
        placeholder: '粘贴 TikTok 视频链接，例如：https://www.tiktok.com/@user/video/...',
    },
];

const progressSteps = ['识别平台', '请求解析服务', '提取媒体资源', '整理结果'];

const featureCards = [
    { title: '文案提取', desc: '提取标题、正文、标签与基础数据，方便二次创作。', icon: FileText },
    { title: '视频解析', desc: '复用参考项目已验证的视频解析接口，返回视频地址。', icon: Video },
    { title: '图片资源', desc: '小红书图文笔记支持图片列表、Live 图地址展示。', icon: Image },
    { title: '一键排版', desc: '解析结果可转成 Markdown，直接送入排版大师。', icon: Send },
];

const scenarios = ['内容创作者收集选题', '电商运营拆解种草笔记', '素材库快速沉淀', '市场调研保存案例'];

const trimTrailingUrlPunctuation = (url: string) => url.trim().replace(/[.,!?;:，。！？；：、)\]）】》]+$/u, '');

const extractUrl = (text: string) => {
    const match = text.match(/https?:\/\/[^\s"'<>]+/);
    return match ? trimTrailingUrlPunctuation(match[0]) : '';
};

const extractXhsUrl = (text: string) => {
    const input = text.trim();
    const matches = input.matchAll(/https?:\/\/[^\s"'<>]+/gi);
    for (const match of matches) {
        const candidate = trimTrailingUrlPunctuation(match[0]);
        try {
            const host = new URL(candidate).hostname.toLowerCase();
            if (host === 'xhslink.com' || host.endsWith('.xhslink.com') || host === 'xiaohongshu.com' || host.endsWith('.xiaohongshu.com')) {
                return candidate;
            }
        } catch {
            // Continue scanning the next URL candidate.
        }
    }

    const bareUrlMatch = input.match(/(?:^|[\s"'<>])((?:www\.)?(?:xiaohongshu\.com|xhslink\.com)\/[^\s"'<>]+)/i);
    if (!bareUrlMatch?.[1]) return '';
    return `https://${trimTrailingUrlPunctuation(bareUrlMatch[1])}`;
};

const detectPlatform = (input: string): PlatformId | null => {
    const lowerInput = input.toLowerCase();
    if (lowerInput.includes('xiaohongshu.com') || lowerInput.includes('xhslink.com')) return 'xiaohongshu';
    if (lowerInput.includes('douyin.com') || lowerInput.includes('iesdouyin.com')) return 'douyin';
    if (lowerInput.includes('tiktok.com') || lowerInput.includes('vm.tiktok.com')) return 'tiktok';
    return null;
};

const platformName = (platform: string) => {
    if (platform === 'xiaohongshu') return '小红书';
    if (platform === 'douyin') return '抖音';
    if (platform === 'tiktok') return 'TikTok';
    return platform || '未知平台';
};

const formatStat = (value?: number) => {
    const num = Number(value ?? 0);
    if (num >= 10000) return `${(num / 10000).toFixed(1)}w`;
    return String(num);
};

const proxyAssetUrl = (url?: string) => {
    if (!url) return '';
    const normalized = url.startsWith('//') ? `https:${url}` : url.startsWith('http://') ? `https://${url.slice(7)}` : url;
    if (!normalized.includes('xhscdn.com') && !normalized.includes('xiaohongshu.com')) return normalized;
    return `${parseApiBase}/api/proxy/image?url=${encodeURIComponent(normalized)}`;
};

const buildMarkdown = (result: ParseResult) => {
    const note = result.noteData;
    const title = result.title || note?.title || '素材解析结果';
    const desc = result.desc || note?.desc || '';
    const hasIndependentVideo = result.mediaType === 'video' || note?.type === 'video';
    const videoUrl = hasIndependentVideo ? result.ossUrl || result.videoUrl || note?.video?.url || '' : '';
    const imageUrls = (result.images || note?.images || [])
        .map((image) => image.ossUrl || image.originalUrl || image.previewUrl)
        .filter(Boolean);
    const liveUrls = (result.images || note?.images || []).map((image) => image.liveUrl).filter(Boolean);
    const tags = note?.tags?.length ? `\n\n${note.tags.map((tag) => `#${tag}`).join(' ')}` : '';

    return `# ${title}

> 来源：${platformName(result.platform)}
> 作品 ID：${result.videoId || note?.noteId || '-'}

${desc || '这里可以补充素材摘要、爆点拆解和改写方向。'}${tags}

## 媒体资源

${videoUrl ? `- 视频：${videoUrl}` : ''}
${imageUrls.map((url, index) => `- 图片 ${index + 1}：${url}`).join('\n')}
${liveUrls.map((url, index) => `- Live 动图 ${index + 1}：${url}`).join('\n')}

## 拆解笔记

- 开头钩子：
- 内容结构：
- 可复用标题：
- 适合改写方向：
`;
};

export default function MaterialParserPage({ onSendToTypesetter }: MaterialParserPageProps) {
    const [selectedPlatform, setSelectedPlatform] = useState<PlatformId>('xiaohongshu');
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(-1);
    const [result, setResult] = useState<ParseResult | null>(null);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState('');
    const [selectedPreview, setSelectedPreview] = useState<PreviewMedia | null>(null);
    const [modalPreview, setModalPreview] = useState<PreviewMedia | null>(null);
    const [playingLiveIndex, setPlayingLiveIndex] = useState<number | null>(null);
    const timersRef = useRef<number[]>([]);
    const resultSectionRef = useRef<HTMLDivElement>(null);

    const detectedPlatform = useMemo(() => detectPlatform(input), [input]);
    const activePlatform = platforms.find((platform) => platform.id === (detectedPlatform ?? selectedPlatform)) ?? platforms[0];
    const sourceUrl = useMemo(() => {
        const platform = detectPlatform(input);
        if (platform === 'xiaohongshu') return extractXhsUrl(input);
        return extractUrl(input);
    }, [input]);
    const markdown = useMemo(() => (result ? buildMarkdown(result) : ''), [result]);

    const clearTimers = () => {
        timersRef.current.forEach((timer) => window.clearTimeout(timer));
        timersRef.current = [];
    };

    const handleParse = async (event?: FormEvent) => {
        event?.preventDefault();
        const trimmedInput = input.trim();
        const platform = detectPlatform(trimmedInput);

        if (!trimmedInput) return;
        if (!platform) {
            setError('请输入有效的抖音、小红书或 TikTok 分享链接');
            return;
        }

        clearTimers();
        setLoading(true);
        setStep(0);
        setError('');
        setResult(null);
        setCopied('');

        timersRef.current = [
            window.setTimeout(() => setStep(1), 600),
            window.setTimeout(() => setStep(2), 1800),
            window.setTimeout(() => setStep(3), 3200),
        ];

        try {
            const endpoint = platform === 'tiktok' ? '/api/parse-tiktok' : '/api/parse';
            const normalizedInput = platform === 'xiaohongshu' ? extractXhsUrl(trimmedInput) || trimmedInput : trimmedInput;
            const response = await fetch(`${parseApiBase}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: normalizedInput }),
            });
            const data = await response.json();

            clearTimers();
            if (!response.ok || !data.success) {
                throw new Error(data.error || '解析失败，请检查链接是否有效');
            }

            setStep(progressSteps.length);
            setResult(data);
        } catch (err) {
            clearTimers();
            setStep(-1);
            setError(err instanceof Error ? err.message : '解析服务请求失败');
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async (text: string, key: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(key);
        window.setTimeout(() => setCopied(''), 1600);
    };

    const handleClear = () => {
        clearTimers();
        setInput('');
        setResult(null);
        setError('');
        setStep(-1);
        setCopied('');
        setPlayingLiveIndex(null);
        setModalPreview(null);
    };

    const displayImages = result?.images || result?.noteData?.images || [];
    const useCompactImageGrid = displayImages.length > 0 && displayImages.length <= 4;
    const hasIndependentVideo = result?.mediaType === 'video' || result?.noteData?.type === 'video';
    const videoUrl = hasIndependentVideo ? result?.ossUrl || result?.videoUrl || result?.noteData?.video?.url || '' : '';
    const coverUrl = proxyAssetUrl(result?.coverUrl || result?.noteData?.coverUrl || displayImages[0]?.previewUrl);

    useEffect(() => {
        if (!result) {
            setSelectedPreview(null);
            return;
        }

        if (videoUrl) {
            setSelectedPreview({ type: 'video', url: videoUrl, poster: coverUrl, label: '独立视频' });
            return;
        }

        setSelectedPreview(null);
        setPlayingLiveIndex(null);
    }, [coverUrl, displayImages, result, videoUrl]);

    useEffect(() => {
        if (!result) return;
        window.setTimeout(() => {
            resultSectionRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        }, 120);
    }, [result]);

    return (
        <main className="flex-1 overflow-auto bg-[#f7f8fc] text-[#101828] dark:bg-black dark:text-[#f5f5f7]">
            <section className="relative overflow-hidden border-b border-[#e5e7eb] bg-[linear-gradient(135deg,#fdf2f8_0%,#eff6ff_48%,#ffffff_100%)] dark:border-white/10 dark:bg-[linear-gradient(135deg,#2a0c1d_0%,#071a33_52%,#050505_100%)]">
                <div className="pointer-events-none absolute left-[-120px] top-[-140px] h-80 w-80 rounded-full bg-pink-300/30 blur-3xl dark:bg-pink-500/10" />
                <div className="pointer-events-none absolute right-[-120px] top-10 h-96 w-96 rounded-full bg-blue-300/35 blur-3xl dark:bg-blue-500/10" />

                <div className="relative mx-auto flex max-w-5xl flex-col gap-5 px-5 py-6 md:px-8 lg:py-8">
                    <div className="text-center">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-3 py-1 text-xs font-bold text-[#db2777] shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/8 dark:text-pink-200">
                            <Sparkles size={14} />
                            视频文案提取 · 去水印素材解析
                        </div>
                        <h1 className="mx-auto mt-3 max-w-3xl text-3xl font-black tracking-tight text-[#0f172a] dark:text-white md:text-4xl">
                            一键解析短视频素材，直接进入公众号排版
                        </h1>
                        <p className="mx-auto mt-3 max-w-3xl text-sm leading-7 text-[#475569] dark:text-[#cbd5e1]">
                            粘贴小红书、抖音或 TikTok 链接，快速提取标题、正文、图片、Live 图和视频资源，再一键整理成可继续排版的公众号草稿。
                        </p>

                        <div className="mx-auto mt-4 grid max-w-xl gap-2 sm:grid-cols-3">
                            {[
                                ['50+', '平台能力可扩展'],
                                ['3步', '粘贴解析保存'],
                                ['1键', '送入排版大师'],
                            ].map(([value, label]) => (
                                <div key={label} className="rounded-2xl border border-white/80 bg-white/75 px-4 py-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/8">
                                    <div className="text-xl font-black text-[#0f172a] dark:text-white">{value}</div>
                                    <div className="mt-1 text-xs font-semibold text-[#64748b] dark:text-[#a1a1a6]">{label}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <form
                        onSubmit={handleParse}
                        className="mx-auto w-full max-w-3xl rounded-[34px] border border-white bg-white/92 p-4 shadow-[0_30px_90px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-white/10 dark:bg-[#111]/88 md:p-5"
                    >
                        <div className="rounded-[28px] border border-[#eef2f7] bg-[#f8fafc] p-4 dark:border-white/10 dark:bg-black/50">
                            <div className="flex flex-wrap gap-2">
                                {platforms.map((platform) => {
                                    const isActive = activePlatform.id === platform.id;
                                    return (
                                        <button
                                            key={platform.id}
                                            type="button"
                                            onClick={() => setSelectedPlatform(platform.id)}
                                            className={`cursor-pointer rounded-full px-4 py-2 text-sm font-bold transition-all ${
                                                isActive
                                                    ? 'bg-[#0f172a] text-white shadow-lg shadow-slate-300/60 dark:bg-white dark:text-black dark:shadow-black/40'
                                                    : 'bg-white text-[#64748b] hover:bg-[#eef2ff] hover:text-[#1d4ed8] dark:bg-white/8 dark:text-[#cbd5e1] dark:hover:bg-white/12'
                                            }`}
                                        >
                                            {platform.label}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-5 flex items-start justify-between gap-4">
                                <div>
                                    <label htmlFor="video-parse-input" className="text-lg font-black text-[#0f172a] dark:text-white">
                                        {activePlatform.title}
                                    </label>
                                    <p className="mt-1 text-sm text-[#64748b] dark:text-[#a1a1a6]">{activePlatform.description}</p>
                                </div>
                                {sourceUrl && (
                                    <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 sm:inline-flex">
                                        已识别链接
                                    </span>
                                )}
                            </div>

                            <textarea
                                id="video-parse-input"
                                value={input}
                                onChange={(event) => setInput(event.target.value)}
                                disabled={loading}
                                placeholder={activePlatform.placeholder}
                                className="mt-4 min-h-[170px] w-full resize-none rounded-3xl border border-[#e5e7eb] bg-white p-4 text-sm leading-7 text-[#0f172a] outline-none transition-all placeholder:text-[#94a3b8] focus:border-[#db2777]/40 focus:ring-4 focus:ring-[#db2777]/10 disabled:opacity-70 dark:border-white/10 dark:bg-[#050505] dark:text-white dark:focus:border-pink-300/40"
                            />

                            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                                <button
                                    type="submit"
                                    disabled={!input.trim() || loading}
                                    className="inline-flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#ec4899] px-6 text-sm font-black text-white shadow-lg shadow-pink-200 transition-colors hover:bg-[#db2777] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none dark:shadow-none"
                                >
                                    {loading ? <Loader2 className="animate-spin" size={17} /> : <Play size={17} />}
                                    {loading ? '正在解析...' : '开始提取'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigator.clipboard.readText().then((text) => text && setInput(text))}
                                    disabled={loading}
                                    className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[#e5e7eb] bg-white px-5 text-sm font-bold text-[#475569] transition-colors hover:bg-[#f8fafc] disabled:opacity-60 dark:border-white/10 dark:bg-white/8 dark:text-[#d1d5db] dark:hover:bg-white/12"
                                >
                                    <Clipboard size={16} />
                                    粘贴
                                </button>
                                <button
                                    type="button"
                                    onClick={handleClear}
                                    disabled={loading}
                                    className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[#e5e7eb] bg-white px-5 text-sm font-bold text-[#475569] transition-colors hover:bg-[#f8fafc] disabled:opacity-60 dark:border-white/10 dark:bg-white/8 dark:text-[#d1d5db] dark:hover:bg-white/12"
                                >
                                    <Trash2 size={16} />
                                    清空
                                </button>
                            </div>
                        </div>

                        {(loading || error) && (
                            <div className="mt-4 rounded-3xl border border-[#eef2f7] bg-white p-4 dark:border-white/10 dark:bg-black/40">
                                {loading && (
                                    <div className="space-y-3">
                                        {progressSteps.map((label, index) => (
                                            <div key={label} className="flex items-center gap-3">
                                                <span
                                                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                                                        index < step
                                                            ? 'bg-emerald-500 text-white'
                                                            : index === step
                                                              ? 'bg-[#ec4899] text-white'
                                                              : 'bg-[#e5e7eb] text-[#94a3b8] dark:bg-white/10'
                                                    }`}
                                                >
                                                    {index < step ? <Check size={14} /> : index + 1}
                                                </span>
                                                <span className={`text-sm ${index === step ? 'font-bold text-[#0f172a] dark:text-white' : 'text-[#64748b] dark:text-[#a1a1a6]'}`}>
                                                    {label}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {error && (
                                    <div className="flex items-start gap-3 rounded-2xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
                                        <AlertCircle className="mt-0.5 flex-none" size={17} />
                                        <span>{error}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </form>
                </div>
            </section>

            <section
                className={`mx-auto grid max-w-7xl gap-6 px-5 py-8 md:px-8 ${
                    result ? 'xl:grid-cols-1' : 'xl:grid-cols-[360px_minmax(0,1fr)]'
                }`}
            >
                {!result && (
                <div className="min-w-0 space-y-6">
                    <div className="min-w-0 rounded-[30px] border border-[#e5e7eb] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#101010]">
                        <h2 className="text-lg font-black text-[#0f172a] dark:text-white">强大功能特性</h2>
                        <p className="mt-2 text-sm leading-7 text-[#64748b] dark:text-[#a1a1a6]">面向素材收集和公众号创作，把“下载保存”延伸到“直接排版”。</p>
                        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                            {featureCards.map(({ title, desc, icon: Icon }) => (
                                <div key={title} className="rounded-3xl border border-[#eef2f7] bg-[#f8fafc] p-4 dark:border-white/10 dark:bg-white/5">
                                    <div className="flex items-start gap-3">
                                        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-[#ec4899]/10 text-[#db2777] dark:bg-pink-500/12 dark:text-pink-200">
                                            <Icon size={19} />
                                        </span>
                                        <div>
                                            <h3 className="text-sm font-black text-[#0f172a] dark:text-white">{title}</h3>
                                            <p className="mt-1 text-xs leading-6 text-[#64748b] dark:text-[#a1a1a6]">{desc}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="min-w-0 rounded-[30px] border border-[#e5e7eb] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#101010]">
                        <h2 className="text-lg font-black text-[#0f172a] dark:text-white">使用步骤</h2>
                        <div className="mt-5 space-y-4">
                            {['复制作品链接', '粘贴链接提取', '复制资源或送去排版'].map((label, index) => (
                                <div key={label} className="flex gap-3">
                                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#0f172a] text-sm font-black text-white dark:bg-white dark:text-black">
                                        {index + 1}
                                    </span>
                                    <div>
                                        <p className="text-sm font-black text-[#0f172a] dark:text-white">{label}</p>
                                        <p className="mt-1 text-xs leading-6 text-[#64748b] dark:text-[#a1a1a6]">
                                            {index === 0 && '从 App 或网页复制视频/笔记分享链接。'}
                                            {index === 1 && '系统自动调用解析服务，提取文案和媒体资源。'}
                                            {index === 2 && '结果支持复制、打开、下载，也可转为排版草稿。'}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                )}

                <div
                    ref={resultSectionRef}
                    className={`min-w-0 scroll-mt-6 rounded-[34px] border border-[#e5e7eb] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#101010] ${result ? 'order-1' : ''}`}
                >
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-black text-[#0f172a] dark:text-white">提取结果</h2>
                            <p className="mt-1 text-sm text-[#64748b] dark:text-[#a1a1a6]">解析成功后展示视频、图片、文案和一键排版入口。</p>
                        </div>
                        {result && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                                <CircleCheck size={14} />
                                已解析
                            </span>
                        )}
                    </div>

                    {!result ? (
                        <div className="mt-5 flex min-h-[560px] items-center justify-center rounded-[28px] border border-dashed border-[#cbd5e1] bg-[#f8fafc] p-8 text-center dark:border-white/12 dark:bg-black/35">
                            <div className="max-w-sm">
                                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[#ec4899]/10 text-[#db2777] dark:bg-pink-500/12 dark:text-pink-200">
                                    <Zap size={28} />
                                </div>
                                <p className="mt-5 text-base font-black text-[#0f172a] dark:text-white">准备开始提取素材了吗？</p>
                                <p className="mt-2 text-sm leading-7 text-[#64748b] dark:text-[#a1a1a6]">
                                    粘贴链接并点击“开始提取”，这里会出现视频预览、图片资源、文案内容和排版入口。
                                </p>
                                <div className="mt-5 flex flex-wrap justify-center gap-2">
                                    {scenarios.map((scenario) => (
                                        <span key={scenario} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#64748b] dark:bg-white/8 dark:text-[#d1d5db]">
                                            {scenario}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-5 space-y-5">
                            <div className="rounded-[28px] border border-[#eef2f7] bg-[#f8fafc] p-4 dark:border-white/10 dark:bg-black/35">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-[#0f172a] px-3 py-1 text-xs font-bold text-white dark:bg-white dark:text-black">
                                        {platformName(result.platform)}
                                    </span>
                                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#64748b] dark:bg-white/8 dark:text-[#d1d5db]">
                                        {result.mediaType === 'image' ? '图文笔记' : '视频素材'}
                                    </span>
                                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#64748b] dark:bg-white/8 dark:text-[#d1d5db]">
                                        ID: {result.videoId}
                                    </span>
                                </div>
                                <h3 className="mt-4 text-xl font-black text-[#0f172a] dark:text-white">{result.title || result.noteData?.title || '未命名素材'}</h3>
                                {(result.desc || result.noteData?.desc) && (
                                    <p className="mt-3 whitespace-pre-line text-sm leading-7 text-[#475569] dark:text-[#d1d5db]">
                                        {result.desc || result.noteData?.desc}
                                    </p>
                                )}
                            </div>

                            {result.noteData && (
                                <div className="rounded-[28px] border border-[#eef2f7] bg-white p-4 dark:border-white/10 dark:bg-[#0c0c0c]">
                                    <div className="flex items-center gap-3">
                                        {result.noteData.author?.avatar ? (
                                            <img src={proxyAssetUrl(result.noteData.author.avatar)} alt={result.noteData.author.name} className="h-12 w-12 rounded-full object-cover" />
                                        ) : (
                                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f1f5f9] text-[#64748b] dark:bg-white/8">
                                                <User size={20} />
                                            </span>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-black text-[#0f172a] dark:text-white">{result.noteData.author?.name || '未知作者'}</p>
                                            <p className="truncate text-xs text-[#64748b] dark:text-[#a1a1a6]">{result.noteData.author?.id || result.noteData.ipLocation || '-'}</p>
                                        </div>
                                        {result.noteData.author?.profileUrl && (
                                            <a href={result.noteData.author.profileUrl} target="_blank" rel="noreferrer" className="rounded-full bg-[#f8fafc] px-3 py-1 text-xs font-bold text-[#475569] hover:text-[#db2777] dark:bg-white/8 dark:text-[#d1d5db]">
                                                主页
                                            </a>
                                        )}
                                    </div>
                                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                        {[
                                            [Heart, '点赞', result.noteData.stats?.likes],
                                            [Bookmark, '收藏', result.noteData.stats?.collects],
                                            [MessageCircle, '评论', result.noteData.stats?.comments],
                                            [Share2, '分享', result.noteData.stats?.shares],
                                        ].map(([Icon, label, value]) => {
                                            const StatIcon = Icon as typeof Heart;
                                            return (
                                                <div key={String(label)} className="rounded-2xl bg-[#f8fafc] p-3 text-center dark:bg-white/5">
                                                    <StatIcon className="mx-auto text-[#db2777] dark:text-pink-200" size={16} />
                                                    <p className="mt-1 text-sm font-black text-[#0f172a] dark:text-white">{formatStat(Number(value))}</p>
                                                    <p className="text-[11px] text-[#64748b] dark:text-[#a1a1a6]">{String(label)}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {selectedPreview && (
                                <div className="overflow-hidden rounded-[28px] border border-[#111827] bg-black">
                                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                                        <span className="text-xs font-bold text-white/80">{selectedPreview.label}</span>
                                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">
                                            视频
                                        </span>
                                    </div>
                                    <video src={selectedPreview.url} poster={selectedPreview.poster || undefined} controls playsInline className="max-h-[520px] w-full bg-black object-contain" preload="metadata" />
                                </div>
                            )}

                            {displayImages.length > 0 && (
                                <div className="rounded-[28px] border border-[#eef2f7] bg-white p-4 dark:border-white/10 dark:bg-[#0c0c0c]">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <h3 className="text-sm font-black text-[#0f172a] dark:text-white">
                                                图片资源 · {displayImages.length} 张{result.liveCount ? ` · Live ${result.liveCount} 条` : ''}
                                            </h3>
                                            <p className="mt-1 text-xs text-[#64748b] dark:text-[#a1a1a6]">
                                                {useCompactImageGrid ? '少量素材自动铺满展示，Live 图点击后可在卡片内播放。' : '固定两行横向浏览，Live 图点击后可在卡片内播放。'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleCopy(displayImages.map((image) => image.originalUrl || image.previewUrl).join('\n'), 'images')}
                                            className="cursor-pointer rounded-full bg-[#f8fafc] px-3 py-1 text-xs font-bold text-[#475569] hover:text-[#db2777] dark:bg-white/8 dark:text-[#d1d5db]"
                                        >
                                            {copied === 'images' ? '已复制' : '复制图片'}
                                        </button>
                                    </div>
                                    <div className={`mt-4 overflow-x-auto pb-2 ${useCompactImageGrid ? '' : 'no-scrollbar'}`}>
                                        <div
                                            className={
                                                useCompactImageGrid
                                                    ? 'grid min-w-[760px] grid-cols-4 gap-4'
                                                    : 'grid grid-flow-col grid-rows-2 gap-4 auto-cols-[180px] sm:auto-cols-[220px] lg:auto-cols-[250px]'
                                            }
                                        >
                                        {displayImages.map((image) => (
                                            <button
                                                key={image.index}
                                                type="button"
                                                onClick={() => {
                                                    if (image.liveUrl) {
                                                        setPlayingLiveIndex((current) => (current === image.index ? null : image.index));
                                                    }
                                                }}
                                                onDoubleClick={() => {
                                                    const imagePreviewUrl = proxyAssetUrl(image.previewUrl || image.originalUrl);
                                                    setModalPreview(
                                                        image.liveUrl
                                                            ? {
                                                                  type: 'live',
                                                                  url: image.liveUrl,
                                                                  poster: imagePreviewUrl,
                                                                  label: `Live 图 #${image.index}`,
                                                              }
                                                            : {
                                                                  type: 'image',
                                                                  url: imagePreviewUrl,
                                                                  label: `图片 #${image.index}`,
                                                              }
                                                    );
                                                }}
                                                className="group cursor-pointer overflow-hidden rounded-2xl border border-[#eef2f7] bg-[#f8fafc] text-left transition-all hover:border-[#ec4899]/40 hover:shadow-lg dark:border-white/10 dark:bg-white/5"
                                            >
                                                {playingLiveIndex === image.index && image.liveUrl ? (
                                                    <video src={image.liveUrl} poster={proxyAssetUrl(image.previewUrl || image.originalUrl)} controls playsInline autoPlay muted className="aspect-[9/16] w-full bg-black object-contain" />
                                                ) : (
                                                    <img src={proxyAssetUrl(image.previewUrl || image.originalUrl)} alt={`素材图片 ${image.index}`} className="aspect-[9/16] w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                                                )}
                                                <div className="flex items-center justify-between px-3 py-2 text-[11px] font-bold text-[#64748b] dark:text-[#a1a1a6]">
                                                    <span>#{image.index}</span>
                                                    {image.liveUrl && <span className="text-[#db2777]">点击播放 Live</span>}
                                                </div>
                                            </button>
                                        ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="grid gap-3 sm:grid-cols-2">
                                {selectedPreview?.url && (
                                    <a href={selectedPreview.url} target="_blank" rel="noreferrer" className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#0f172a] px-5 text-sm font-black text-white transition-colors hover:bg-black dark:bg-white dark:text-black">
                                        <ExternalLink size={16} />
                                        打开当前视频
                                    </a>
                                )}
                                {selectedPreview?.url && (
                                    <a href={selectedPreview.url} download className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[#e5e7eb] px-5 text-sm font-black text-[#475569] transition-colors hover:bg-[#f8fafc] dark:border-white/10 dark:text-[#d1d5db] dark:hover:bg-white/8">
                                        <Download size={16} />
                                        下载当前视频
                                    </a>
                                )}
                                <button
                                    onClick={() => handleCopy(markdown, 'markdown')}
                                    className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[#e5e7eb] px-5 text-sm font-black text-[#475569] transition-colors hover:bg-[#f8fafc] dark:border-white/10 dark:text-[#d1d5db] dark:hover:bg-white/8"
                                >
                                    {copied === 'markdown' ? <Check size={16} /> : <Clipboard size={16} />}
                                    {copied === 'markdown' ? '已复制草稿' : '复制排版草稿'}
                                </button>
                                <button
                                    onClick={() => onSendToTypesetter(markdown)}
                                    className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#ec4899] px-5 text-sm font-black text-white transition-colors hover:bg-[#db2777]"
                                >
                                    <Send size={16} />
                                    送去排版大师
                                </button>
                            </div>

                            <details className="rounded-[24px] border border-[#eef2f7] bg-[#f8fafc] p-4 dark:border-white/10 dark:bg-black/35">
                                <summary className="cursor-pointer text-sm font-black text-[#0f172a] dark:text-white">查看 Markdown 输出</summary>
                                <pre className="mt-4 max-h-[260px] overflow-auto whitespace-pre-wrap text-sm leading-7 text-[#334155] dark:text-[#d1d5db]">{markdown}</pre>
                            </details>
                        </div>
                    )}
                </div>
            </section>

            {modalPreview && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/78 p-4 backdrop-blur-sm"
                    onClick={() => setModalPreview(null)}
                >
                    <div
                        className="relative max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="absolute left-4 right-4 top-4 z-10 flex items-center justify-between">
                            <span className="rounded-full bg-black/45 px-3 py-1 text-xs font-bold text-white backdrop-blur">
                                {modalPreview.label}
                            </span>
                            <button
                                type="button"
                                onClick={() => setModalPreview(null)}
                                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/70"
                                aria-label="关闭预览"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        {modalPreview.type === 'image' ? (
                            <img src={modalPreview.url} alt={modalPreview.label} className="max-h-[92vh] w-full object-contain" />
                        ) : (
                            <video
                                src={modalPreview.url}
                                poster={modalPreview.poster || undefined}
                                controls
                                autoPlay
                                playsInline
                                className="max-h-[92vh] w-full bg-black object-contain"
                            />
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}
