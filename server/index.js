import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';

const PORT = Number(process.env.RAPHAEL_API_PORT || process.env.PORT || 1034);
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const XHS_HEADERS = {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9',
    referer: 'https://www.xiaohongshu.com/explore',
    'user-agent': USER_AGENT,
};
const SMOLAGENT_BASE = process.env.SMOLAGENT_BASE || 'https://smolagent.vyibc.com';

const json = (res, status, data) => {
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type',
    });
    res.end(JSON.stringify(data));
};

const normalizeError = (error) => {
    if (!(error instanceof Error)) return '未知错误';
    const cause = error.cause;
    if (cause && typeof cause === 'object' && 'code' in cause) {
        const code = cause.code;
        const hostname = 'hostname' in cause ? cause.hostname : '';
        if (code === 'ENOTFOUND') return `网络解析失败：无法访问 ${hostname || '目标网站'}，请检查本机网络或代理`;
        if (code === 'ETIMEDOUT') return '网络请求超时，请稍后重试';
    }
    if (error.message === 'fetch failed') return '网络请求失败，请检查本机网络、代理或目标平台访问状态';
    return error.message;
};

const readBody = async (req) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : {};
};

const getCookieFileValue = (fileName) => {
    const filePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8').trim();
};

const getXhsCookie = () => process.env.XHS_COOKIE || getCookieFileValue('.xhs-cookie');
const getDouyinCookie = () => {
    try {
        const cookieFile = path.join(process.cwd(), '.douyin-cookie.json');
        if (fs.existsSync(cookieFile)) {
            const data = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
            if (data.cookie) return data.cookie;
        }
    } catch {
        // Ignore malformed local cookie files.
    }
    return process.env.DOUYIN_COOKIE || '';
};

const extractUrl = (text) => text.match(/https?:\/\/[^\s，。)）]+/)?.[0] || '';
const toNum = (value) => {
    const number = parseInt(String(value ?? '0'), 10);
    return Number.isFinite(number) ? number : 0;
};

const safeGet = (obj, fieldPath, fallback = '') => {
    try {
        return fieldPath.split('.').reduce((acc, key) => acc?.[key], obj) ?? fallback;
    } catch {
        return fallback;
    }
};

const formatXhsTime = (value) => {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return '';
    return new Date(raw).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
};

const extractXsecToken = (url) => {
    const tokenMatch = url.match(/xsec_token=([^&\s]+)/);
    return tokenMatch ? decodeURIComponent(tokenMatch[1]) : '';
};

const resolveXhsUrl = async (url) => {
    let currentUrl = url.startsWith('http') ? url : `https://${url}`;
    if (currentUrl.includes('xhslink.com')) {
        const headers = { ...XHS_HEADERS };
        const cookie = getXhsCookie();
        if (cookie) headers.cookie = cookie;
        const response = await fetch(currentUrl, { method: 'HEAD', headers, redirect: 'follow' });
        if (response.url) currentUrl = response.url;
    }

    const noteIdMatch = currentUrl.match(/(?:explore|discovery\/item)\/([a-f0-9]+)/);
    if (!noteIdMatch) return currentUrl;

    const noteId = noteIdMatch[1];
    const tokenMatch = currentUrl.match(/xsec_token=([^&\s]+)/);
    const xsecToken = tokenMatch ? tokenMatch[1] : '';
    return `https://www.xiaohongshu.com/discovery/item/${noteId}${xsecToken ? `?xsec_token=${xsecToken}&xsec_source=pc_feed` : ''}`;
};

const fetchXhsHtml = async (url) => {
    const headers = { ...XHS_HEADERS };
    const cookie = getXhsCookie();
    if (cookie) headers.cookie = cookie;
    const response = await fetch(url, { headers, redirect: 'follow' });
    if (!response.ok) {
        const hint = cookie ? '，Cookie 可能已失效' : '，请在当前项目根目录配置 .xhs-cookie 或 XHS_COOKIE';
        throw new Error(`小红书请求失败 HTTP ${response.status}${hint}`);
    }
    return response.text();
};

const extractInitialState = (html) => {
    const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/g;
    let match;
    while ((match = scriptRe.exec(html)) !== null) {
        const text = match[1].trim();
        if (!text.includes('window.__INITIAL_STATE__')) continue;
        try {
            const valueStr = text
                .replace(/^[\s\S]*?window\.__INITIAL_STATE__\s*=\s*/, '')
                .replace(/;\s*$/, '')
                .trim();
            const sandbox = { undefined };
            vm.runInNewContext(`__result = ${valueStr}`, sandbox, { timeout: 5000 });
            return sandbox.__result;
        } catch {
            continue;
        }
    }
    return null;
};

const extractNoteData = (state) => {
    const candidates = [
        () => {
            const map = state.note?.noteDetailMap;
            const key = map && Object.keys(map)[0];
            return key ? map[key]?.note : null;
        },
        () => state.note?.noteId && state.note,
        () => state.note?.data?.noteId && state.note.data,
        () => state.note?.data?.noteData?.noteId && state.note.data.noteData,
        () => {
            const map = state.noteDetailMap;
            const key = map && Object.keys(map)[0];
            return key ? map[key]?.note : null;
        },
        () => state.noteData?.data?.noteData,
        () => {
            const map = state.feed?.noteDetailMap;
            const key = map && Object.keys(map)[0];
            return key ? map[key]?.note : null;
        },
    ];

    for (const getCandidate of candidates) {
        try {
            const note = getCandidate();
            if (note?.noteId) return note;
        } catch {
            // Try the next known state shape.
        }
    }

    return null;
};

const extractImageToken = (url) => {
    if (!url) return '';
    return url.replace(/^https?:\/\/[^/]+\//, '').split('!')[0];
};

const toOriginalImageUrl = (url) => {
    const token = extractImageToken(url);
    return token ? `https://sns-img-bd.xhscdn.com/${token}` : url;
};

const buildXhsImages = (imageList = []) => {
    return imageList.map((image, index) => {
        const rawUrl = image.urlDefault || image.url || '';
        const liveRaw = image.stream?.h264?.[0]?.masterUrl || '';
        return {
            index: index + 1,
            previewUrl: rawUrl,
            originalUrl: toOriginalImageUrl(rawUrl),
            liveUrl: liveRaw ? decodeURIComponent(liveRaw) : undefined,
            urlDefault: image.urlDefault || '',
            urlPre: image.urlPre || '',
            width: toNum(image.width),
            height: toNum(image.height),
        };
    });
};

const buildXhsVideo = (noteData, coverUrl) => {
    const originKey = safeGet(noteData, 'video.consumer.originVideoKey');
    if (originKey) return { url: `https://sns-video-bd.xhscdn.com/${originKey}`, coverUrl };

    const h264 = safeGet(noteData, 'video.media.stream.h264', []);
    const h265 = safeGet(noteData, 'video.media.stream.h265', []);
    const streams = [...(Array.isArray(h264) ? h264 : []), ...(Array.isArray(h265) ? h265 : [])];
    if (!streams.length) return undefined;
    streams.sort((a, b) => (a.height ?? 0) - (b.height ?? 0));
    const best = streams[streams.length - 1];
    const url = best.backupUrls?.[0] || best.masterUrl || '';
    return url ? { url, coverUrl, streams } : undefined;
};

const fetchXhsPost = async (url) => {
    const resolvedUrl = await resolveXhsUrl(url);
    const html = await fetchXhsHtml(resolvedUrl);
    const state = extractInitialState(html);
    if (!state) throw new Error('页面数据解析失败：未找到 __INITIAL_STATE__');

    const noteData = extractNoteData(state);
    if (!noteData) throw new Error('帖子数据提取失败：noteData 为空');

    const interact = noteData.interactInfo ?? {};
    const tags = (noteData.tagList ?? []).map((tag) => tag.name ?? '').filter(Boolean);
    const images = buildXhsImages(noteData.imageList ?? []);
    const coverUrl = images[0]?.previewUrl || images[0]?.originalUrl || '';
    const video = buildXhsVideo(noteData, coverUrl);
    const authorId = safeGet(noteData, 'user.userId');
    const type = noteData.type === 'video' ? 'video' : images.length > 0 ? 'image' : 'unknown';

    return {
        noteId: noteData.noteId,
        postUrl: url,
        resolvedUrl,
        xsecToken: String(noteData.xsecToken || extractXsecToken(resolvedUrl) || ''),
        title: noteData.title ?? '',
        desc: noteData.desc ?? '',
        type,
        author: {
            id: authorId,
            name: safeGet(noteData, 'user.nickname') || safeGet(noteData, 'user.nickName'),
            avatar: safeGet(noteData, 'user.avatar') || safeGet(noteData, 'user.avatarUrl'),
            profileUrl: authorId ? `https://www.xiaohongshu.com/user/profile/${authorId}` : '',
        },
        stats: {
            likes: toNum(interact.likedCount),
            comments: toNum(interact.commentCount),
            shares: toNum(interact.shareCount),
            collects: toNum(interact.collectedCount),
        },
        tags,
        publishTime: formatXhsTime(noteData.time),
        lastUpdateTime: formatXhsTime(noteData.lastUpdateTime),
        ipLocation: String(noteData.ipLocation || ''),
        coverUrl,
        shareInfo: noteData.shareInfo,
        images,
        video,
    };
};

const parseCookies = (cookieStr) => {
    return cookieStr
        .split(';')
        .map((cookie) => {
            const index = cookie.indexOf('=');
            return {
                name: cookie.slice(0, index).trim(),
                value: cookie.slice(index + 1).trim(),
                domain: '.douyin.com',
                path: '/',
            };
        })
        .filter((cookie) => cookie.name && cookie.value);
};

const parseDouyinWithPlaywright = async (videoId) => {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({
            userAgent: USER_AGENT,
            locale: 'zh-CN',
        });
        const cookie = getDouyinCookie();
        if (cookie) await context.addCookies(parseCookies(cookie));
        const page = await context.newPage();

        return await new Promise(async (resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Playwright 超时（60s）')), 60000);
            page.on('response', async (response) => {
                if (!response.url().includes('/aweme/v1/web/aweme/detail/')) return;
                try {
                    const data = await response.json();
                    const detail = data?.aweme_detail;
                    const h264Urls = detail?.video?.play_addr_h264?.url_list ?? [];
                    const playUrls = detail?.video?.play_addr?.url_list ?? [];
                    const downloadUrls = detail?.video?.download_addr?.url_list ?? [];
                    const videoUrl = h264Urls[0] || playUrls[0] || downloadUrls[0];
                    if (!videoUrl) return;
                    clearTimeout(timer);
                    resolve({
                        videoUrl,
                        title: detail?.desc ?? '',
                        watermark: !h264Urls[0] && !playUrls[0],
                    });
                } catch {
                    // Keep listening for another response.
                }
            });

            await page.goto(`https://www.douyin.com/video/${videoId}`, { waitUntil: 'load', timeout: 50000 }).catch(() => {});
            await page.waitForTimeout(5000).catch(() => {});
            reject(new Error('Playwright 未捕获到视频地址'));
        });
    } finally {
        if (process.env.KEEP_BROWSER_OPEN !== 'true') await browser.close();
    }
};

const parseDouyin = async (input) => {
    const url = extractUrl(input);
    if (!url || !/douyin\.com|iesdouyin\.com/.test(url)) throw new Error('未找到有效的抖音分享链接');

    const step1 = await fetch(url, {
        redirect: 'manual',
        headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' },
    });
    const redirectedUrl = step1.headers.get('location') || step1.url || url;
    const videoId = redirectedUrl.match(/\/video\/(\d+)/)?.[1] || url.match(/\/video\/(\d+)/)?.[1] || Date.now().toString();

    if (videoId && getDouyinCookie()) {
        try {
            const parsed = await parseDouyinWithPlaywright(videoId);
            return { platform: 'douyin', videoId, ...parsed };
        } catch (error) {
            console.warn('[douyin] Playwright failed, falling back:', error instanceof Error ? error.message : error);
        }
    }

    const pageResponse = await fetch(redirectedUrl, {
        headers: { 'user-agent': USER_AGENT, referer: 'https://www.douyin.com/' },
    });
    const html = await pageResponse.text();
    const internalVideoId = html.match(/video_id=(v[a-z0-9]+)/)?.[1];
    if (!internalVideoId) throw new Error('页面中未找到视频地址，可能需要配置 DOUYIN_COOKIE');

    const playResponse = await fetch(`https://aweme.snssdk.com/aweme/v1/playwm/?video_id=${internalVideoId}&ratio=720p&line=0`, {
        redirect: 'manual',
        headers: { 'user-agent': USER_AGENT, referer: 'https://www.douyin.com/' },
    });
    const cdnUrl = playResponse.headers.get('location');
    if (!cdnUrl) throw new Error('无法获取视频 CDN 地址');

    const title = html.match(/<title[^>]*>([^<]+)<\/title>/)?.[1]?.replace(/ - 抖音$/, '').trim() || '';
    return { platform: 'douyin', videoId, videoUrl: cdnUrl, title, watermark: true };
};

const parseTikTok = async (input) => {
    const url = extractUrl(input);
    if (!url || !/tiktok\.com/.test(url)) throw new Error('未找到有效的 TikTok 分享链接');
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    });

    try {
        const context = await browser.newContext({ userAgent: USER_AGENT, locale: 'en-US' });
        const page = await context.newPage();
        let foundTitle = '';
        const result = await new Promise(async (resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('TikTok 解析超时（90s）')), 90000);
            page.on('response', async (response) => {
                const responseUrl = response.url();
                if (responseUrl.includes('.mp4') && !responseUrl.includes('thumbnail')) {
                    clearTimeout(timer);
                    resolve({ videoUrl: responseUrl, title: foundTitle || 'TikTok Video', watermark: /watermark|wm/.test(responseUrl) });
                }
            });
            await page.goto(url, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
            foundTitle = (await page.title().catch(() => '')).replace(' | TikTok', '').trim();
            const videoSrc = await page.evaluate(() => document.querySelector('video')?.src || '').catch(() => '');
            if (videoSrc) {
                clearTimeout(timer);
                resolve({ videoUrl: videoSrc, title: foundTitle || 'TikTok Video', watermark: false });
                return;
            }
            await page.waitForTimeout(10000).catch(() => {});
            clearTimeout(timer);
            reject(new Error('未能获取 TikTok 视频下载地址'));
        });

        const videoId = url.match(/\/video\/(\d+)/)?.[1] || Date.now().toString();
        return { platform: 'tiktok', videoId, ...result };
    } finally {
        if (process.env.KEEP_BROWSER_OPEN !== 'true') await browser.close();
    }
};

const handleParse = async (req, res) => {
    const { url } = await readBody(req);
    if (!url || typeof url !== 'string') return json(res, 400, { error: '请提供分享链接' });
    const isDouyin = /v\.douyin\.com|douyin\.com|iesdouyin\.com/.test(url);
    const isXhs = /xiaohongshu\.com|xhslink\.com/.test(url);

    if (!isDouyin && !isXhs) return json(res, 400, { error: '暂不支持该平台，目前支持抖音、小红书' });

    if (isXhs) {
        const post = await fetchXhsPost(url);
        if (post.video?.url && post.type === 'video') {
            return json(res, 200, {
                success: true,
                platform: 'xiaohongshu',
                mediaType: 'video',
                videoId: post.noteId,
                title: post.title ?? '',
                desc: post.desc ?? '',
                videoUrl: post.video.url,
                ossUrl: post.video.url,
                coverUrl: post.coverUrl || post.images?.[0]?.previewUrl || '',
                noteData: post,
                watermark: false,
            });
        }

        if (!post.images.length) return json(res, 500, { error: '小红书笔记解析成功，但未找到可用图片或视频' });
        const images = post.images.map((image) => ({
            index: image.index,
            previewUrl: image.previewUrl,
            originalUrl: image.originalUrl,
            liveUrl: image.liveUrl,
            urlDefault: image.urlDefault,
            urlPre: image.urlPre,
            width: image.width,
            height: image.height,
        }));

        return json(res, 200, {
            success: true,
            platform: 'xiaohongshu',
            mediaType: 'image',
            videoId: post.noteId,
            title: post.title ?? '',
            desc: post.desc ?? '',
            videoUrl: '',
            ossUrl: images[0]?.previewUrl || images[0]?.originalUrl || '',
            coverUrl: post.coverUrl || images[0]?.previewUrl || '',
            images,
            imageCount: images.length,
            liveCount: images.filter((image) => image.liveUrl).length,
            noteData: post,
            watermark: false,
        });
    }

    const parsed = await parseDouyin(url);
    return json(res, 200, {
        success: true,
        platform: 'douyin',
        videoId: parsed.videoId,
        title: parsed.title ?? '',
        videoUrl: parsed.videoUrl,
        ossUrl: parsed.videoUrl,
        watermark: parsed.watermark,
    });
};

const handleTikTok = async (req, res) => {
    const { url } = await readBody(req);
    if (!url || typeof url !== 'string') return json(res, 400, { error: '请提供 TikTok 分享链接' });
    const parsed = await parseTikTok(url);
    return json(res, 200, {
        success: true,
        platform: 'tiktok',
        videoId: parsed.videoId,
        title: parsed.title ?? '',
        videoUrl: parsed.videoUrl,
        ossUrl: parsed.videoUrl,
        watermark: parsed.watermark,
    });
};

const handleImageProxy = async (req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const targetUrl = requestUrl.searchParams.get('url');
    if (!targetUrl) {
        res.writeHead(400);
        res.end('Missing url');
        return;
    }
    const headers = { 'user-agent': USER_AGENT, referer: 'https://www.xiaohongshu.com/' };
    const cookie = getXhsCookie();
    if (cookie) headers.cookie = cookie;
    const upstream = await fetch(targetUrl, { headers });
    res.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
        'cache-control': 'public, max-age=3600',
        'access-control-allow-origin': '*',
    });
    if (upstream.body) {
        for await (const chunk of upstream.body) res.write(chunk);
    }
    res.end();
};

const proxySmolagent = async (req, res) => {
    const targetUrl = `${SMOLAGENT_BASE}${req.url}`;
    const headers = {
        accept: req.headers.accept || '*/*',
    };
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];

    const init = {
        method: req.method,
        headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        init.body = Buffer.concat(chunks);
    }

    const upstream = await fetch(targetUrl, init);
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.writeHead(upstream.status, {
        'content-type': contentType,
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type',
    });

    if (upstream.body) {
        for await (const chunk of upstream.body) res.write(chunk);
    }
    res.end();
};

const fetchTextFromRemoteUrl = async (req, res) => {
    const { url } = await readBody(req);
    if (!url || typeof url !== 'string') return json(res, 400, { error: 'Missing url' });
    if (!/^https?:\/\//i.test(url)) return json(res, 400, { error: 'Only http(s) urls are supported' });

    const upstream = await fetch(url, {
        headers: {
            'user-agent': USER_AGENT,
            accept: 'text/html,text/markdown,text/plain,application/json,*/*',
        },
    });

    const text = await upstream.text();
    res.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8',
        'access-control-allow-origin': '*',
    });
    res.end(text);
};

const server = http.createServer(async (req, res) => {
    try {
        if (req.method === 'OPTIONS') return json(res, 204, {});
        if (req.method === 'POST' && req.url === '/api/parse') return await handleParse(req, res);
        if (req.method === 'POST' && req.url === '/api/parse-tiktok') return await handleTikTok(req, res);
        if (req.method === 'GET' && req.url?.startsWith('/api/proxy/image')) return await handleImageProxy(req, res);
        if (req.method === 'GET' && req.url === '/api/health') return json(res, 200, { ok: true });
        if (req.method === 'POST' && req.url === '/api/fetch-text') return await fetchTextFromRemoteUrl(req, res);
        if (
            req.url === '/api/presets' ||
            req.url === '/api/presets/generate' ||
            req.url === '/api/articles' ||
            req.url?.startsWith('/api/jobs/') ||
            req.url?.startsWith('/api/outputs/')
        ) {
            return await proxySmolagent(req, res);
        }
        return json(res, 404, { error: 'Not found' });
    } catch (error) {
        console.error('[api error]', error);
        return json(res, 500, { error: normalizeError(error) });
    }
});

server.listen(PORT, () => {
    console.log(`[raphael-api] listening on http://localhost:${PORT}`);
});
