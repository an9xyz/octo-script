// ==UserScript==
// @name         Octo AI 消息美化展示 (dev)
// @namespace    http://tampermonkey.net/
// @version      1.2.0-dev.7
// @description  美化 Octo(DMWork) 聊天消息：三档气泡(AI/自己/他人)、折叠会话自动展开、长消息限高「展开全文」，以及 @提及/引用/文件/合并转发等消息类型与暗色适配；左下角可切换消息主题(赛博紫·亮/暗、美加墨世界杯)。
// @author       DataSaver
// @homepageURL  https://github.com/an9xyz/octo-script
// @supportURL   https://github.com/an9xyz/octo-script/issues
// @downloadURL  https://raw.githubusercontent.com/an9xyz/octo-script/dev/octo-script.user.js
// @updateURL    https://raw.githubusercontent.com/an9xyz/octo-script/dev/octo-script.user.js
// @match        https://im.deepminer.com.cn/*
// @match        https://*.deepminer.com.cn/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const TAG = '[Octo AI 美化]';
    const VERSION = 'v1.2.0-dev.7';

    /* ============================================================
     * 0) 可调参数
     * ========================================================== */
    const CONFIG = {
        // 气泡最大宽度：按会话列宽百分比计算 + 上限
        bubbleMaxWidth: 'min(80%, 820px)',

        // 单条消息限高 + 点击展开
        enableClamp: true,
        clampHeight: 240,     // 超过该高度(px)折叠，点击展开
    };

    /* ============================================================
     * 1) 样式注入
     * ========================================================== */
    function injectStyles() {
        if (document.getElementById('octo-ai-flatten-css')) return;

        const style = document.createElement('style');
        style.id = 'octo-ai-flatten-css';
        style.textContent = `
            :root {
                --octo-bubble-max: ${CONFIG.bubbleMaxWidth};
                --octo-clamp-h: ${CONFIG.clampHeight}px;
                /* 赛博切角：右上 + 左下各切 13px */
                --octo-cut: polygon(0 0, calc(100% - 13px) 0, 100% 13px, 100% 100%, 13px 100%, 0 calc(100% - 13px));
            }

            /* ========== 隐藏折叠容器外壳 ========== */
            .wk-message-item-fold-session {
                background: transparent !important;
                border: none !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            .wk-message-item-fold-session-shell > .wk-message-item-fold-session-avatar,
            .wk-fold-session-title-row {
                display: none !important;
            }
            /* 折叠外壳原生 margin-left:15px → 清零，使折叠块左基准与普通消息一致 */
            .wk-message-item-fold-session-shell {
                margin-left: 0 !important;
            }
            .wk-fold-session-card {
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                margin: 0 !important;
                padding: 0 !important;
                max-width: none !important;
                width: 100% !important;
            }
            .wk-fold-session-card-head,
            .wk-fold-session-card-summary {
                display: none !important;
            }
            .wk-fold-session-card-expanded {
                display: block !important;
                max-width: none !important;
                width: 100% !important;
            }
            .wk-fold-session-card-expanded-inner {
                display: block !important;
                background: transparent !important;
                padding: 0 !important;
                margin: 0 !important;
                max-width: none !important;
                width: 100% !important;
            }

            /* ========================================================
             * AI 消息卡片 —— 冷紫 Geek 风 + gamer 元素
             * ====================================================== */
            /* 整行不加框，仅作布局容器：头像 + 头部留在框外 */
            .wk-msg-row:has(.ai-badge),
            .wk-msg-row--continue[data-ai-continue="true"] {
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                margin: 4px 12px !important;
                padding: 0 !important;
            }

            /* 连续消息：占位但隐藏头像，保持对齐 */
            .wk-msg-row--continue[data-ai-continue="true"] .wk-msg-row-avatar {
                display: flex !important;
                visibility: hidden !important;
            }

            /* 头像 - 简洁无边框 */
            .wk-msg-row:has(.ai-badge) .wk-msg-avatar {
                border-radius: 50% !important;
                padding: 0 !important;
                background: #fff !important;          /* 纯白底兜底：透明头像不透出页面底色 */
                box-shadow: none !important;
            }
            .wk-msg-row:has(.ai-badge) .wk-msg-avatar-img {
                border: none !important;
                border-radius: 50% !important;
            }

            /* @property 注册可动色相，驱动渐变 hue 循环（只重算文字渐变，不用 filter → 不染色徽章） */
            @property --octo-hue {
                syntax: "<angle>";
                inherits: false;
                initial-value: 0deg;
            }
            /* 名字 - 霓虹流光（键盘 RGB 风）：--octo-hue 循环使 hsl 色标每帧重算 → 背景值变化强制重绘，
             * 文字色彩流动；全程不用 filter，旁边/内部的 AI 徽章一律不受影响。 */
            .wk-msg-row:has(.ai-badge) .wk-msg-row-sender {
                font-weight: 600 !important;
                font-size: 14px !important;
                background: linear-gradient(90deg,
                    hsl(calc(248deg + var(--octo-hue)), 78%, 63%),
                    hsl(calc(190deg + var(--octo-hue)), 92%, 52%),
                    hsl(calc(248deg + var(--octo-hue)), 78%, 63%)) !important;
                background-size: 200% auto !important;
                -webkit-background-clip: text !important;
                background-clip: text !important;
                -webkit-text-fill-color: transparent !important;
                color: transparent !important;
            }
            /* 性能：名字平时静态渐变(零重绘)，仅 hover 时开流光动画。
             * (渐变随 --octo-hue 每帧重算才重绘，常驻会随屏上 AI 名字数量线性增加主线程占用) */
            .wk-msg-row:has(.ai-badge):hover .wk-msg-row-sender,
            .wk-fold-msg-name:hover,
            .wk-bot-detail-modal:hover .wk-bot-detail-name {
                animation: octo-name-wave 4s linear infinite !important;
            }
            @keyframes octo-name-wave {
                0%   { --octo-hue: 0deg;   background-position: 0% center; }
                100% { --octo-hue: 360deg; background-position: -200% center; }
            }
            @media (prefers-reduced-motion: reduce) {
                .wk-msg-row:has(.ai-badge) .wk-msg-row-sender,
                .wk-fold-msg-name,
                .wk-bot-detail-name,
                .wk-msg-row:has(.ai-badge):hover .wk-msg-row-sender,
                .wk-fold-msg-name:hover,
                .wk-bot-detail-modal:hover .wk-bot-detail-name { animation: none !important; }
            }

            /* AI 徽章 - 干净紫色标牌（赛博感交给卡片 HUD 角标，徽章不发光） */
            .wk-msg-row:has(.ai-badge) .ai-badge {
                background: linear-gradient(135deg, #7c6bf0, #5b58e8) !important;
                color: #fff !important;
                font-weight: 700 !important;
                font-size: 10px !important;
                padding: 3px 10px !important;
                height: auto !important;          /* 清除 ai-badge-default(16px)/small(14px) 的固定高差异 */
                line-height: 1 !important;         /* 统一行高，两种 size 渲染一致 */
                box-sizing: content-box !important;
                border-radius: 10px !important;
                box-shadow: 0 1px 2px rgba(91, 88, 232, 0.25) !important;
                border: none !important;
                letter-spacing: 0.5px !important;
                text-shadow: none !important;
                animation: none !important;
            }

            /* 时间戳 - faint */
            .wk-msg-row:has(.ai-badge) .wk-msg-row-timestamp,
            .wk-msg-row--continue[data-ai-continue="true"] .wk-msg-row-timestamp {
                color: #9da0b2 !important;
                font-size: 11px !important;
            }

            /* 内容气泡 —— 赛博切角卡片 */
            .wk-msg-row:has(.ai-badge) .wk-markdown,
            .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown {
                --octo-bg: #ffffff;
                --octo-accent: #7c6bf0;
                position: relative !important;
                background: #ffffff !important;
                border: 1px solid #e7e9f2 !important;
                border-left: 3px solid #5b58e8 !important;
                border-radius: 9px !important;
                filter: drop-shadow(0 1px 2px rgba(40, 40, 90, 0.10)) !important;
                padding: 12px 16px !important;
                margin-top: 8px !important;
                box-sizing: border-box !important;
                width: fit-content !important;
                max-width: var(--octo-bubble-max) !important;
                overflow-wrap: anywhere !important;
                color: #5a5a72 !important;
                line-height: 1.65 !important;
                font-size: 14px !important;
                transition: background .15s ease, filter .15s ease, transform .15s ease !important;
            }
            /* === HUD 取景角标（赛博朋克卡片造型，非辉光，青紫双色）===
             * 单伪元素 ::before + 8 段渐变画四角 L 形线，不占用 clamp 的 ::after。
             * 配色：左上/右下 青(#00e5ff)，右上/左下 紫(#7c6bf0)。 */
            .wk-msg-row:has(.ai-badge) .wk-markdown::before,
            .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown::before,
            .wk-fold-msg-text::before {
                content: "" !important;
                position: absolute !important;
                inset: 0 !important;
                pointer-events: none !important;
                z-index: 3 !important;           /* 盖过 clamp「展开全文」渐变蒙层(::after)，保证四角完整 */
                background-repeat: no-repeat !important;
                background-image:
                    linear-gradient(#00e5ff, #00e5ff), linear-gradient(#00e5ff, #00e5ff),
                    linear-gradient(#7c6bf0, #7c6bf0), linear-gradient(#7c6bf0, #7c6bf0),
                    linear-gradient(#7c6bf0, #7c6bf0), linear-gradient(#7c6bf0, #7c6bf0),
                    linear-gradient(#00e5ff, #00e5ff), linear-gradient(#00e5ff, #00e5ff) !important;
                background-size:
                    11px 2px, 2px 11px, 11px 2px, 2px 11px,
                    11px 2px, 2px 11px, 11px 2px, 2px 11px !important;
                background-position:
                    left top, left top, right top, right top,
                    left bottom, left bottom, right bottom, right bottom !important;
            }

            /* hover：去霓虹辉光，仅保留右移 + 背景微亮（赛博感靠角标，不靠发光） */
            .wk-msg-row:has(.ai-badge) .wk-markdown:hover,
            .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown:hover {
                background: #fbfbff !important;
                transform: translateY(-2px) !important;
                filter: drop-shadow(0 5px 14px rgba(40, 40, 90, 0.16)) !important;
            }

            .wk-msg-row:has(.ai-badge) .wk-markdown p,
            .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown p {
                color: #5a5a72 !important;
                margin: 0.4em 0 !important;
            }
            .wk-msg-row:has(.ai-badge) .wk-markdown a,
            .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown a {
                color: #5b58e8 !important;
                text-decoration: none !important;
            }
            .wk-msg-row:has(.ai-badge) .wk-markdown a:hover,
            .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown a:hover {
                text-decoration: underline !important;
            }
            /* inline code - 淡紫 chip */
            .wk-msg-row:has(.ai-badge) .wk-markdown code,
            .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown code {
                background: #f1efff !important;
                color: #5b50d6 !important;
                border: 1px solid #e3def8 !important;
                padding: 1px 6px !important;
                border-radius: 4px !important;
                font-family: 'SF Mono', 'Monaco', 'Consolas', monospace !important;
                font-size: 13px !important;
            }
            .wk-msg-row:has(.ai-badge) .wk-markdown strong,
            .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown strong {
                color: #1c1c2b !important;
                font-weight: 600 !important;
            }
            .wk-msg-row:has(.ai-badge) .wk-markdown ul,
            .wk-msg-row:has(.ai-badge) .wk-markdown ol,
            .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown ul,
            .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown ol {
                color: #5a5a72 !important;
            }

            /* ========================================================
             * 自己发送的消息（非 AI）—— 协调绿
             * ====================================================== */
            .wk-msg-row--send:not(:has(.ai-badge)) {
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                margin: 4px 12px !important;
                padding: 0 !important;
            }
            .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown {
                --octo-bg: #fafdfb;
                --octo-accent: #46a877;
                position: relative !important;
                background: #fafdfb !important;
                border: 1px solid #e3ece7 !important;
                border-left: 3px solid #46a877 !important;
                border-radius: 9px !important;
                filter: drop-shadow(0 1px 2px rgba(40, 90, 60, 0.10)) !important;
                padding: 12px 16px !important;
                margin-top: 8px !important;
                box-sizing: border-box !important;
                width: fit-content !important;
                max-width: var(--octo-bubble-max) !important;
                overflow-wrap: anywhere !important;
                transition: background .15s ease, filter .15s ease, transform .15s ease !important;
            }
            .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown:hover {
                background: #f3faf6 !important;
                transform: translateY(-2px) !important;
                filter: drop-shadow(0 5px 14px rgba(40, 90, 60, 0.16)) !important;
            }
            /* send 绿色卡片同样上 HUD 取景角标（绿 #46a877 + 薄荷 #19c39a 双色，
             * 与 AI 紫青呼应，统一 gamer 造型）。左上/右下薄荷，右上/左下绿。 */
            .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown::before {
                content: "" !important;
                position: absolute !important;
                inset: 0 !important;
                pointer-events: none !important;
                z-index: 3 !important;
                background-repeat: no-repeat !important;
                background-image:
                    linear-gradient(#19c39a, #19c39a), linear-gradient(#19c39a, #19c39a),
                    linear-gradient(#46a877, #46a877), linear-gradient(#46a877, #46a877),
                    linear-gradient(#46a877, #46a877), linear-gradient(#46a877, #46a877),
                    linear-gradient(#19c39a, #19c39a), linear-gradient(#19c39a, #19c39a) !important;
                background-size:
                    11px 2px, 2px 11px, 11px 2px, 2px 11px,
                    11px 2px, 2px 11px, 11px 2px, 2px 11px !important;
                background-position:
                    left top, left top, right top, right top,
                    left bottom, left bottom, right bottom, right bottom !important;
            }
            .wk-msg-row--send:not(:has(.ai-badge)) .wk-msg-row-sender {
                font-weight: 600 !important;
                color: #2f9163 !important;
            }

            /* ========================================================
             * 接收的普通用户消息（非 AI、非自己）—— 中性 slate 卡片
             * 排除：自己(--send) / AI(.ai-badge) / AI 连续(data-ai-continue)
             * 三档配色统一：AI 紫(+HUD 角标) / 自己 绿 / 他人 中性灰蓝(无 HUD，AI 专属)
             * ====================================================== */
            .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) {
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                margin: 4px 12px !important;
                padding: 0 !important;
            }
            .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown {
                --octo-bg: #ffffff;
                --octo-accent: #8b90a5;
                position: relative !important;
                background: #ffffff !important;
                border: 1px solid #e7e9f2 !important;
                border-left: 3px solid #aab0c2 !important;
                border-radius: 9px !important;
                filter: drop-shadow(0 1px 2px rgba(40, 40, 60, 0.10)) !important;
                padding: 12px 16px !important;
                margin-top: 8px !important;
                box-sizing: border-box !important;
                width: fit-content !important;
                max-width: var(--octo-bubble-max) !important;
                overflow-wrap: anywhere !important;
                color: #4a4a58 !important;
                line-height: 1.65 !important;
                font-size: 14px !important;
                transition: background .15s ease, filter .15s ease, transform .15s ease !important;
            }
            .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown:hover {
                background: #fbfbfd !important;
                transform: translateY(-2px) !important;
                filter: drop-shadow(0 5px 14px rgba(40, 40, 60, 0.16)) !important;
            }
            .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown p { color: #4a4a58 !important; margin: 0.4em 0 !important; }
            .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown a { color: #5b58e8 !important; text-decoration: none !important; }
            .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown a:hover { text-decoration: underline !important; }
            .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown code {
                background: #f2f3f7 !important;
                color: #555a6b !important;
                border: 1px solid #e4e6ee !important;
                padding: 1px 6px !important;
                border-radius: 4px !important;
                font-family: 'SF Mono', 'Monaco', 'Consolas', monospace !important;
                font-size: 13px !important;
            }
            .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown strong { color: #1c1c2b !important; font-weight: 600 !important; }
            .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown > :first-child { margin-top: 0 !important; }
            .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown > :last-child { margin-bottom: 0 !important; }

            /* ========================================================
             * 引用/回复消息块（新 .wk-reply-block + 旧 .wk-message-text-reply）统一精修
             * reply 块是 .wk-msg-row 后代但在 .wk-markdown 之外 → 在「行」上设 --octo-accent，
             * 引用块左条即可跟随各类型色：AI 紫 / 自己 绿 / 他人 灰蓝
             * ====================================================== */
            .wk-msg-row:has(.ai-badge),
            .wk-msg-row--continue[data-ai-continue="true"] { --octo-accent: #7c6bf0; }
            .wk-msg-row--send:not(:has(.ai-badge)) { --octo-accent: #46a877; }
            .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) { --octo-accent: #9aa0c2; }

            .wk-msg-row .wk-reply-block,
            .wk-msg-row .wk-message-text-reply {
                background: transparent !important;        /* markdown blockquote 风：去填充底色 */
                border-left: 3px solid var(--octo-accent, #9aa0c2) !important;
                border-radius: 0 !important;
                padding: 1px 0 1px 12px !important;        /* 仅左缩进，紧凑 */
                margin-bottom: 4px !important;
                box-sizing: border-box !important;   /* 防 padding/border 叠到 max-width 之外 → 横向溢出 */
                width: fit-content !important;        /* 缩到内容宽度，不再全宽灰条(与下方气泡观感一致，消除割裂) */
                max-width: var(--octo-bubble-max) !important;
                overflow: hidden !important;
                transition: background .15s ease !important;
            }
            /* 内部可伸缩项允许收缩 + 长摘要/名字单行省略，杜绝横向滚动条 */
            .wk-msg-row .wk-reply-block__content,
            .wk-msg-row .wk-reply-block__name-row {
                min-width: 0 !important;
            }
            .wk-msg-row .wk-reply-block__name,
            .wk-msg-row .wk-reply-block__digest,
            .wk-msg-row .wk-message-text-reply-content {
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                max-width: 100% !important;
                min-width: 0 !important;
            }
            .wk-msg-row .wk-reply-block:hover,
            .wk-msg-row .wk-message-text-reply:hover {
                background: rgba(28, 28, 35, 0.04) !important;
            }
            /* 原内置 2px bar 与新 border-left 重复 → 隐藏 */
            .wk-msg-row .wk-reply-block__bar { display: none !important; }
            .wk-msg-row .wk-reply-block__name,
            .wk-msg-row .wk-message-text-reply-authorname {
                font-weight: 600 !important;
                color: #6b6f86 !important;
            }
            .wk-msg-row .wk-reply-block__digest,
            .wk-msg-row .wk-message-text-reply-content {
                color: #888c9c !important;
            }

            /* ===== 折叠 AI 消息 ===== */
            .wk-fold-msg {
                display: flex !important;
                flex-direction: row !important;
                align-items: flex-start !important;
                gap: 12px !important;            /* 头像↔内容，对齐普通消息 .wk-msg-row */
                padding: 0 16px !important;      /* 左基准 16px，与 .wk-msg-row 一致 */
                margin: 12px 0 0 !important;     /* 去掉原左右 12px margin，避免右偏 */
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                width: 100% !important;
                max-width: none !important;
                box-sizing: border-box !important;
            }
            .wk-fold-msg-ava {
                display: block !important;
                flex-shrink: 0 !important;
                width: 36px !important;
                height: 36px !important;
                min-width: 36px !important;
                min-height: 36px !important;
                margin-right: 0 !important;      /* 间距交给容器 gap，避免与 gap 叠加成 24px */
                cursor: pointer !important;
                border-radius: 50% !important;
                padding: 0 !important;
                background: #fff !important;          /* 纯白底兜底：透明头像不透出页面底色 */
                box-shadow: none !important;
            }
            .wk-fold-msg-ava img {
                display: block !important;
                width: 36px !important;
                height: 36px !important;
                border-radius: 50% !important;
                object-fit: cover !important;
                border: none !important;
            }
            /* body / head：对齐普通消息 .wk-msg-row-content / -header 的布局 */
            .wk-fold-msg-body {
                flex: 1 !important;
                min-width: 0 !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 4px !important;              /* = .wk-msg-row-content gap */
            }
            .wk-fold-msg-head {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;              /* = .wk-msg-row-header gap，统一 名字/时间 间隔 */
                height: 22px !important;          /* = .wk-msg-row-header height */
                line-height: 22px !important;     /* = .wk-msg-row-header line-height，竖直基线对齐 */
                margin-bottom: 0 !important;      /* 间距交给 body 的 gap:4px */
            }
            .wk-fold-msg-name {
                font-weight: 600 !important;
                font-size: 14px !important;       /* 对齐普通消息 .wk-msg-row-sender 的 14px */
                cursor: pointer !important;
                background: linear-gradient(90deg,
                    hsl(calc(248deg + var(--octo-hue)), 78%, 63%),
                    hsl(calc(190deg + var(--octo-hue)), 92%, 52%),
                    hsl(calc(248deg + var(--octo-hue)), 78%, 63%)) !important;
                background-size: 200% auto !important;
                -webkit-background-clip: text !important;
                background-clip: text !important;
                -webkit-text-fill-color: transparent !important;
                color: transparent !important;
                padding: 0 !important;            /* 清除原生 Tag 的 2px 8px padding */
                height: auto !important;          /* 清除原生固定 20px 高 */
                border-radius: 0 !important;
            }
            .wk-fold-msg-name::after {
                content: "AI" !important;
                display: inline-flex !important;
                align-items: center !important;
                margin-left: 8px !important;      /* 对齐普通 header gap:8px（sender↔badge 间距） */
                padding: 3px 10px !important;
                font-size: 10px !important;
                font-weight: 700 !important;
                line-height: 1 !important;         /* 与普通 .ai-badge 一致 */
                box-sizing: content-box !important;
                letter-spacing: 0.5px !important;
                color: #fff !important;
                -webkit-text-fill-color: #fff !important;   /* 父级 text-fill 透明会继承到 ::after，这里强制恢复白字 */
                background: linear-gradient(135deg, #7c6bf0, #5b58e8) !important;
                border-radius: 10px !important;
                border: none !important;
                text-shadow: none !important;
                box-shadow: 0 1px 2px rgba(91, 88, 232, 0.25) !important;
                animation: none !important;
            }
            .wk-fold-msg-time {
                font-size: 11px !important;
                color: #9da0b2 !important;
                margin-left: 0 !important;         /* 间距交给 head 的 gap:8px */
            }
            .wk-fold-msg-text {
                --octo-bg: #ffffff;
                --octo-accent: #7c6bf0;
                position: relative !important;
                background: #ffffff !important;
                border: 1px solid #e7e9f2 !important;
                border-left: 3px solid #5b58e8 !important;
                border-radius: 9px !important;
                filter: drop-shadow(0 1px 2px rgba(40, 40, 90, 0.10)) !important;
                padding: 12px 16px !important;
                margin-top: 8px !important;
                box-sizing: border-box !important;
                width: fit-content !important;
                max-width: var(--octo-bubble-max) !important;
                overflow-wrap: anywhere !important;
                font-size: 14px !important;
                line-height: 1.65 !important;
                color: #5a5a72 !important;
                transition: background .15s ease, filter .15s ease, transform .15s ease !important;
            }
            .wk-fold-msg-text:hover {
                background: #fbfbff !important;
                transform: translateY(-2px) !important;
                filter: drop-shadow(0 5px 14px rgba(40, 40, 90, 0.16)) !important;
            }

            /* ===== HUD 取景角标「锁定」动效：hover 时四角准星「咔」一下内缩锁定 + 极淡青紫霓虹辉光 =====
             * 内缩靠 background-position 向中心偏移(带回弹 cubic-bezier 做出「咔」的过冲)，辉光靠 filter drop-shadow。
             * （基础 ::before 各属性均 !important，keyframe 会被压制，故用 hover 规则 + snappy transition 实现。）*/
            .wk-msg-row:has(.ai-badge) .wk-markdown::before,
            .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown::before,
            .wk-fold-msg-text::before,
            .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown::before {
                transition: background-position .15s cubic-bezier(.5, -0.4, .3, 1.35), background-size .15s ease, filter .2s ease !important;
            }
            /* 内缩锁定 + 辉光仅用于赛博皮肤：加 body:not([data-octo-skin]) 作用域, 避免 !important 渗进世界杯足球(位移/染青紫光) */
            body:not([data-octo-skin="worldcup"]) .wk-msg-row:has(.ai-badge) .wk-markdown:hover::before,
            body:not([data-octo-skin="worldcup"]) .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown:hover::before,
            body:not([data-octo-skin="worldcup"]) .wk-fold-msg-text:hover::before,
            body:not([data-octo-skin="worldcup"]) .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown:hover::before {
                background-position:
                    left 5px top 5px, left 5px top 5px, right 5px top 5px, right 5px top 5px,
                    left 5px bottom 5px, left 5px bottom 5px, right 5px bottom 5px, right 5px bottom 5px !important;
                filter: drop-shadow(0 0 3px rgba(0, 229, 255, 0.55)) drop-shadow(0 0 5px rgba(124, 107, 240, 0.5)) !important;
            }

            /* 无障碍：系统开启「减弱动态效果」时，关掉位移与角标外扩，仅保留静态背景/阴影变化 */
            @media (prefers-reduced-motion: reduce) {
                .wk-msg-row:has(.ai-badge) .wk-markdown:hover,
                .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown:hover,
                .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown:hover,
                .wk-fold-msg-text:hover {
                    transform: none !important;
                }
                body:not([data-octo-skin="worldcup"]) .wk-msg-row:has(.ai-badge) .wk-markdown:hover::before,
                body:not([data-octo-skin="worldcup"]) .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown:hover::before,
                body:not([data-octo-skin="worldcup"]) .wk-fold-msg-text:hover::before,
                body:not([data-octo-skin="worldcup"]) .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown:hover::before {
                    background-size:
                        11px 2px, 2px 11px, 11px 2px, 2px 11px,
                        11px 2px, 2px 11px, 11px 2px, 2px 11px !important;
                    background-position:
                        left top, left top, right top, right top,
                        left bottom, left bottom, right bottom, right bottom !important;
                    filter: none !important;
                }
            }
            .wk-fold-msg-text p { color: #5a5a72 !important; margin: 0.4em 0 !important; }
            .wk-fold-msg-text a { color: #5b58e8 !important; text-decoration: none !important; }
            .wk-fold-msg-text a:hover { text-decoration: underline !important; }
            .wk-fold-msg-text code {
                background: #f1efff !important;
                color: #5b50d6 !important;
                border: 1px solid #e3def8 !important;
                padding: 1px 6px !important;
                border-radius: 4px !important;
                font-family: 'SF Mono', 'Monaco', 'Consolas', monospace !important;
                font-size: 13px !important;
            }
            .wk-fold-msg-text strong { color: #1c1c2b !important; font-weight: 600 !important; }
            .wk-fold-msg-text ul,
            .wk-fold-msg-text ol,
            .wk-fold-msg-text li { color: #5a5a72 !important; }

            /* 首/尾子元素去外边距，避免气泡内顶部/底部多出空隙 */
            .wk-msg-row:has(.ai-badge) .wk-markdown > :first-child,
            .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown > :first-child,
            .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown > :first-child,
            .wk-fold-msg-text > :first-child { margin-top: 0 !important; }
            .wk-msg-row:has(.ai-badge) .wk-markdown > :last-child,
            .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown > :last-child,
            .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown > :last-child,
            .wk-fold-msg-text > :last-child { margin-bottom: 0 !important; }

            /* ========================================================
             * 单条消息限高 + 点击展开（纯 CSS，无 DOM 注入）
             * ====================================================== */
            .wk-markdown.octo-clamp:not(.octo-expanded),
            .wk-fold-msg-text.octo-clamp:not(.octo-expanded) {
                max-height: var(--octo-clamp-h) !important;
                overflow: hidden !important;
                cursor: zoom-in !important;
            }
            .wk-markdown.octo-clamp:not(.octo-expanded)::after,
            .wk-fold-msg-text.octo-clamp:not(.octo-expanded)::after {
                content: "展开全文 ▾" !important;
                position: absolute !important;
                left: 0 !important; right: 0 !important; bottom: 0 !important;
                display: flex !important;
                align-items: flex-end !important;
                justify-content: center !important;
                height: 56px !important;
                padding-bottom: 9px !important;
                font-size: 12px !important;
                font-weight: 600 !important;
                letter-spacing: 0.3px !important;
                color: var(--octo-accent, #5b58e8) !important;
                background: linear-gradient(transparent, var(--octo-bg, #fff) 70%) !important;
                pointer-events: none !important;
                border-radius: 0 0 9px 9px !important;
            }
            .wk-markdown.octo-clamp.octo-expanded,
            .wk-fold-msg-text.octo-clamp.octo-expanded { cursor: zoom-out !important; }

            /* ========================================================
             * Bot 详情弹窗 —— 全息卡牌（holographic trading card）
             * DOM: .wk-bot-detail-content
             *        > .wk-bot-detail-header (头像 / 名字+AiBadge / @id / [chip])
             *        > .wk-bot-detail-desc ×N (.wk-bot-detail-label + 值)
             *        > .wk-bot-detail-commands / 按钮组
             * 设计：有氛围的 mesh banner + 发光头像环 + 堆叠柔色信息卡 + 强调色按钮 + 入场微动效
             * 纯 CSS 覆盖，不动源码。
             * ====================================================== */
            @keyframes octo-bot-in {
                from { opacity: 0; transform: translateY(10px); }
                to   { opacity: 1; transform: none; }
            }
            /* 扫描带自上而下 sweep（第1层 100%×54px no-repeat）+ tron 网格滚动（第2/3层无缝） */
            @keyframes octo-bot-grid {
                from { background-position: 0 -60px, 0 0, 0 0; }
                to   { background-position: 0 180px, 16px 0, 0 16px; }
            }
            /* CP2077 glitch：每隔几秒一次短促水平抖动 */
            @keyframes octo-glitch {
                0%, 86%, 100% { transform: translate(0, 0); }
                87% { transform: translate(-3px, 0); }
                89% { transform: translate(3px, 0); }
                91% { transform: translate(-2px, 0); }
                93% { transform: translate(0, 0); }
            }
            /* 底部霓虹青横线 + 紫辉光：不规则霓虹管闪烁(flicker)，cyberpunk 质感 */
            @keyframes octo-bot-neon {
                0%, 100% { box-shadow: inset 0 -2px 0 0 rgba(0, 224, 255, 0.92), inset 0 -16px 22px -5px rgba(124, 60, 240, 0.44); }
                4%  { box-shadow: inset 0 -2px 0 0 rgba(0, 224, 255, 0.28), inset 0 -8px 12px -6px rgba(124, 60, 240, 0.12); }
                7%  { box-shadow: inset 0 -2px 0 0 rgba(0, 224, 255, 0.92), inset 0 -16px 22px -5px rgba(124, 60, 240, 0.44); }
                9%  { box-shadow: inset 0 -2px 0 0 rgba(0, 224, 255, 0.40), inset 0 -8px 12px -6px rgba(124, 60, 240, 0.16); }
                11% { box-shadow: inset 0 -2px 0 0 rgba(0, 224, 255, 0.92), inset 0 -16px 22px -5px rgba(124, 60, 240, 0.44); }
                48% { box-shadow: inset 0 -2px 0 0 rgba(0, 224, 255, 0.92), inset 0 -16px 22px -5px rgba(124, 60, 240, 0.44); }
                50% { box-shadow: inset 0 -2px 0 0 rgba(0, 224, 255, 0.35), inset 0 -8px 12px -6px rgba(124, 60, 240, 0.14); }
                52% { box-shadow: inset 0 -2px 0 0 rgba(0, 224, 255, 0.92), inset 0 -16px 22px -5px rgba(124, 60, 240, 0.44); }
                78% { box-shadow: inset 0 -2px 0 0 rgba(0, 224, 255, 0.92), inset 0 -16px 22px -5px rgba(124, 60, 240, 0.44); }
                80% { box-shadow: inset 0 -2px 0 0 rgba(0, 224, 255, 0.45), inset 0 -8px 12px -6px rgba(124, 60, 240, 0.18); }
                82% { box-shadow: inset 0 -2px 0 0 rgba(0, 224, 255, 0.92), inset 0 -16px 22px -5px rgba(124, 60, 240, 0.44); }
            }

            /* 外壳 → 卡牌本体：金箔全息卡框 + 斜向流光 + 浮起；随鼠标 3D 倾斜(见 JS bindBotCardTilt) */
            .wk-bot-detail-modal .wk-modal-shell {
                position: relative !important;
                border-radius: 16px !important;
                overflow: hidden !important;
                box-shadow: 0 30px 70px rgba(26, 22, 64, 0.38), 0 2px 8px rgba(26, 22, 64, 0.20) !important;
                transform: perspective(1100px) rotateX(var(--octo-card-rx, 0deg)) rotateY(var(--octo-card-ry, 0deg)) translateY(var(--octo-card-lift, 0px)) scale(var(--octo-card-sc, 1)) !important;
                transition: transform .12s ease, box-shadow .2s ease !important;
                will-change: transform !important;
            }
            .wk-bot-detail-modal .wk-modal-shell:hover {
                --octo-card-lift: -4px;
                --octo-card-sc: 1.015;
                box-shadow: 0 42px 92px rgba(26, 22, 64, 0.46), 0 3px 10px rgba(26, 22, 64, 0.24) !important;
            }
            /* 金箔全息卡框（渐变描边 + mask 挖空只留 3px 边）；渐变缓慢流动 = 更强的全息感。
             * --octo-frame 由稀有度覆盖(默认金箔)，UR=彩虹。 */
            .wk-bot-detail-modal .wk-modal-shell::after {
                content: "" !important;
                position: absolute !important;
                inset: 0 !important;
                border-radius: 16px !important;
                padding: 3px !important;
                background: var(--octo-frame, linear-gradient(135deg, #fff6d0 0%, #f2d98a 12%, #ffffff 26%, #c9a24b 42%, #8a6a24 56%, #f2d98a 70%, #ffffff 84%, #c9a24b 100%)) !important;
                background-size: 300% 300% !important;
                -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) !important;
                -webkit-mask-composite: xor !important;
                        mask-composite: exclude !important;
                pointer-events: none !important;
                z-index: 4 !important;
                animation: octo-frame-holo 6s linear infinite !important;
            }
            @keyframes octo-frame-holo {
                0%   { background-position: 0% 50%; }
                100% { background-position: 300% 50%; }
            }
            /* 全息流光：斜向高光带横扫(screen 混合只提亮，holo 卡质感)——加亮加宽 */
            .wk-bot-detail-modal .wk-modal-shell::before {
                content: "" !important;
                position: absolute !important;
                top: -30% !important;
                left: -70% !important;
                width: 65% !important;
                height: 160% !important;
                background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.5) 34%, rgba(120, 220, 255, 0.6) 46%, rgba(255, 190, 255, 0.6) 54%, rgba(255, 255, 255, 0.5) 66%, transparent 100%) !important;
                transform: skewX(-18deg) !important;
                mix-blend-mode: screen !important;
                pointer-events: none !important;
                z-index: 3 !important;
                animation: octo-card-holo 4.8s cubic-bezier(.5, 0, .5, 1) infinite !important;
            }
            @keyframes octo-card-holo {
                0%   { left: -70%; opacity: 0; }
                12%  { opacity: 1; }
                55%  { opacity: 1; }
                70%  { left: 150%; opacity: 0; }
                100% { left: 150%; opacity: 0; }
            }
            /* 稀有度 → 卡框配色(--octo-frame) + 高档外发光 */
            .wk-bot-detail-modal .wk-modal-shell[data-octo-rarity="N"]   { --octo-frame: linear-gradient(135deg,#d8dae2,#ffffff 28%,#b9bcc7 52%,#eef0f5 78%,#c7cad3) !important; }
            .wk-bot-detail-modal .wk-modal-shell[data-octo-rarity="R"]   { --octo-frame: linear-gradient(135deg,#bfe0ff,#ffffff 26%,#3d7bd9 50%,#8fc0ff 74%,#2f6fd0) !important; }
            .wk-bot-detail-modal .wk-modal-shell[data-octo-rarity="SR"]  { --octo-frame: linear-gradient(135deg,#f0d9ff,#ffffff 24%,#9b59e6 48%,#e0b3ff 72%,#7a3fd0) !important; }
            .wk-bot-detail-modal .wk-modal-shell[data-octo-rarity="SSR"] { --octo-frame: linear-gradient(135deg,#fff6d0,#f2d98a 18%,#ffffff 32%,#c9a24b 50%,#8a6a24 64%,#f2d98a 80%,#fff6d0) !important; }
            .wk-bot-detail-modal .wk-modal-shell[data-octo-rarity="UR"]  { --octo-frame: linear-gradient(135deg,#ff5ac6,#ffd75e 20%,#5be6ff 40%,#b06bff 60%,#ff8a5a 80%,#ff5ac6) !important; }
            .wk-bot-detail-modal .wk-modal-shell[data-octo-rarity="SSR"] { filter: drop-shadow(0 0 13px rgba(240,200,90,0.55)); }
            .wk-bot-detail-modal .wk-modal-shell[data-octo-rarity="UR"]  { filter: drop-shadow(0 0 15px rgba(150,120,255,0.6)) drop-shadow(0 0 26px rgba(120,220,255,0.4)); }
            /* 3D 倾斜后，Semi 外层容器(白底+阴影)若不动会露在卡片后面「露两层」→ 透明化, 只留卡片本体倾斜。
             * 同时 overflow:visible 让倾斜的卡片不被外层裁切。覆盖亮/暗两种(暗色段本给 .wk-modal 容器上过底色)。 */
            .wk-bot-detail-modal .semi-modal-content,
            .wk-bot-detail-modal .semi-modal-body,
            body[theme-mode="dark"] .wk-bot-detail-modal .semi-modal-content,
            body[theme-mode="dark"] .wk-bot-detail-modal .semi-modal-body {
                background: transparent !important;
                box-shadow: none !important;
                border: none !important;
                overflow: visible !important;
            }
            /* 内容：清顶 padding 给 banner，底部微暖白渐变，入场动效。
             * flex 列布局 + 主题配色变量(结构共享，各主题只改这些变量的值)。 */
            .wk-bot-detail-content {
                /* --- 配色变量：默认=赛博紫(亮)，暗色/世界杯各自覆盖 --- */
                --octo-bd-panel-bg: #f5f5fc;
                --octo-bd-panel-line: #e2e0f2;
                --octo-bd-panel-div: #ecebf6;
                --octo-bd-credit: #8a8ea6;
                --octo-bd-credit-label: #a6a8c4;
                display: flex !important;
                flex-direction: column !important;
                position: relative !important;
                padding: 0 22px 22px !important;
                background: radial-gradient(130% 70% at 50% 0%, #fbfbff 0%, #ffffff 58%) !important;
                animation: octo-bot-in .3s cubic-bezier(.22,.8,.28,1) both !important;
            }
            /* 跟手全息高光(glare)：hover 时在光标(--octo-card-mx/my, 由 JS 设)处浮现随动高光 + 微彩,
             * screen 混合只提亮；配合 3D 倾斜 = 全息卡转动反光感。默认隐藏, hover 显现。 */
            .wk-bot-detail-content::before {
                content: "" !important;
                position: absolute !important;
                inset: 0 !important;
                z-index: 2 !important;
                pointer-events: none !important;
                border-radius: 14px !important;
                background: radial-gradient(circle at var(--octo-card-mx, 50%) var(--octo-card-my, 50%), rgba(255, 255, 255, 0.38) 0%, rgba(150, 210, 255, 0.20) 16%, rgba(255, 180, 240, 0.14) 30%, transparent 46%) !important;
                mix-blend-mode: screen !important;
                opacity: var(--octo-card-glare, 0) !important;
                transition: opacity .22s ease !important;
            }
            .wk-bot-detail-modal .wk-modal-shell:hover { --octo-card-glare: 1; }

            /* 稀有度角标：左上角徽章，文字取自 data-octo-rarity(JS 每次开卡随机)。纯 ::after，不注入 DOM。
             * 右上角是关闭键 → 放左上角；默认 N 银色，各档配色见下；金箔/彩虹流光横扫。 */
            .wk-bot-detail-content::after {
                content: attr(data-octo-rarity) !important;
                position: absolute !important;
                top: 13px !important;
                left: 13px !important;
                z-index: 6 !important;
                font-family: -apple-system, "SF Pro Display", "PingFang SC", sans-serif !important;
                font-style: italic !important;
                font-weight: 900 !important;
                font-size: 13px !important;
                line-height: 1 !important;
                letter-spacing: 0.5px !important;
                color: #33363f !important;
                padding: 5px 10px !important;
                border-radius: 4px 9px 4px 9px !important;
                background: linear-gradient(115deg, #b9bcc7 0%, #eef0f5 48%, #b9bcc7 100%) !important;
                background-size: 220% 100% !important;
                box-shadow:
                    0 2px 7px rgba(0, 0, 0, 0.4),
                    inset 0 1px 0 rgba(255, 255, 255, 0.7),
                    inset 0 0 0 1px rgba(255, 255, 255, 0.35) !important;
                text-shadow: 0 1px 0 rgba(255, 255, 255, 0.3) !important;
                transform: rotate(-7deg) !important;
                transform-origin: top left !important;
                pointer-events: none !important;
                animation: octo-ssr-foil 3.2s linear infinite !important;
            }
            /* 无稀有度属性时不显示角标(避免抽卡前空白框) */
            .wk-bot-detail-content:not([data-octo-rarity])::after { content: none !important; }
            /* 各档配色 */
            .wk-bot-detail-content[data-octo-rarity="R"]::after {
                color: #eaf2ff !important;
                background: linear-gradient(115deg, #2f6fd0 0%, #9fc8ff 48%, #2f6fd0 100%) !important;
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.35) !important;
            }
            .wk-bot-detail-content[data-octo-rarity="SR"]::after {
                color: #f3e9ff !important;
                background: linear-gradient(115deg, #7a3fd0 0%, #d9b3ff 48%, #7a3fd0 100%) !important;
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.35) !important;
            }
            .wk-bot-detail-content[data-octo-rarity="SSR"]::after {
                color: #4a3208 !important;
                background: linear-gradient(115deg, #b8860b 0%, #f0c24a 30%, #fff6d0 48%, #f0c24a 62%, #b8860b 100%) !important;
                text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35) !important;
            }
            .wk-bot-detail-content[data-octo-rarity="UR"]::after {
                color: #3a2a00 !important;
                background: linear-gradient(115deg, #ff5ac6 0%, #ffd75e 25%, #5be6ff 50%, #b06bff 75%, #ff5ac6 100%) !important;
                background-size: 300% 100% !important;
                text-shadow: 0 1px 1px rgba(255, 255, 255, 0.4) !important;
                box-shadow:
                    0 2px 9px rgba(120, 80, 220, 0.5),
                    inset 0 1px 0 rgba(255, 255, 255, 0.8),
                    inset 0 0 0 1px rgba(255, 255, 255, 0.5) !important;
            }
            @keyframes octo-ssr-foil {
                0%   { background-position: 220% 0; }
                100% { background-position: -40% 0; }
            }
            @media (prefers-reduced-motion: reduce) {
                .wk-bot-detail-content::after { animation: none !important; }
                .wk-bot-detail-modal .wk-modal-shell::after { animation: none !important; }
            }

            /* 稀有度差异拉大：N 卡框静态(朴素)；SSR/UR 卡框发光脉动 */
            .wk-bot-detail-modal .wk-modal-shell[data-octo-rarity="N"]::after { animation: none !important; }
            .wk-bot-detail-modal .wk-modal-shell[data-octo-rarity="SSR"] { animation: octo-glow-ssr 2.2s ease-in-out infinite !important; }
            .wk-bot-detail-modal .wk-modal-shell[data-octo-rarity="UR"]  { animation: octo-glow-ur 1.9s ease-in-out infinite !important; }
            @keyframes octo-glow-ssr {
                0%, 100% { filter: drop-shadow(0 0 9px rgba(240,200,90,.45)); }
                50%      { filter: drop-shadow(0 0 20px rgba(255,210,100,.8)); }
            }
            @keyframes octo-glow-ur {
                0%, 100% { filter: drop-shadow(0 0 12px rgba(150,120,255,.5)) drop-shadow(0 0 22px rgba(120,220,255,.35)); }
                50%      { filter: drop-shadow(0 0 22px rgba(190,120,255,.85)) drop-shadow(0 0 40px rgba(120,220,255,.6)); }
            }
            @media (prefers-reduced-motion: reduce) {
                .wk-bot-detail-modal .wk-modal-shell[data-octo-rarity="SSR"],
                .wk-bot-detail-modal .wk-modal-shell[data-octo-rarity="UR"] { animation: none !important; }
            }

            /* ===== 抽卡揭晓全屏特效(JS 注入 .octo-gacha-fx 到 body，播完自移除) ===== */
            .octo-gacha-fx {
                position: fixed !important;
                inset: 0 !important;
                z-index: 99999 !important;
                pointer-events: none !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                overflow: hidden !important;
                --fx: #ffcf5e;                 /* 默认金 */
            }
            .octo-gacha-fx[data-octo-rarity="SR"]  { --fx: #b884ff; --dim: .22; }
            .octo-gacha-fx[data-octo-rarity="SSR"] { --fx: #ffcf5e; --dim: .34; }
            .octo-gacha-fx[data-octo-rarity="UR"]  { --fx: #6be3ff; --dim: .46; }
            /* 暗角背景:短暂压暗中心，让闪光/光线在浅色页面也能炸出来(screen 混合需要暗底) */
            .octo-gacha-fx::before {
                content: "" !important;
                position: absolute !important;
                inset: 0 !important;
                background: radial-gradient(circle at 50% 45%, rgba(8,6,24,var(--dim, .3)) 0%, rgba(8,6,24,calc(var(--dim, .3) * .7)) 38%, transparent 74%) !important;
                opacity: 0;
                animation: octo-fx-dim .85s ease-out forwards !important;
            }
            @keyframes octo-fx-dim {
                0%   { opacity: 0; }
                18%  { opacity: 1; }
                100% { opacity: 0; }
            }
            /* 中心闪光：径向爆闪 + 扩散淡出 */
            .octo-gacha-flash {
                position: absolute !important;
                inset: 0 !important;
                margin: auto !important;
                width: 64vmin !important;
                height: 64vmin !important;
                border-radius: 50% !important;
                background: radial-gradient(circle, #ffffff 0%, var(--fx) 32%, transparent 70%) !important;
                mix-blend-mode: screen !important;
                opacity: 0;
                animation: octo-fx-flash .72s ease-out forwards !important;
            }
            @keyframes octo-fx-flash {
                0%   { transform: scale(.2); opacity: 0; }
                16%  { opacity: 1; }
                100% { transform: scale(1.9); opacity: 0; }
            }
            /* 放射光线(sunburst)：仅 SSR/UR；conic 光芒 + 环形挖空 + 旋转放大淡出 */
            .octo-gacha-rays {
                display: none;
                position: absolute !important;
                inset: 0 !important;
                margin: auto !important;
                width: 150vmin !important;
                height: 150vmin !important;
                background: conic-gradient(from 0deg,
                    transparent 0 7deg, rgba(255,255,255,.55) 7deg 8.5deg,
                    transparent 8.5deg 22deg, var(--fx) 22deg 23.5deg,
                    transparent 23.5deg 37deg, rgba(255,255,255,.4) 37deg 38.5deg,
                    transparent 38.5deg 52deg, var(--fx) 52deg 53.5deg, transparent 53.5deg 67deg) !important;
                -webkit-mask: radial-gradient(circle, transparent 16%, #000 24%) !important;
                        mask: radial-gradient(circle, transparent 16%, #000 24%) !important;
                mix-blend-mode: screen !important;
                opacity: 0;
            }
            .octo-gacha-fx[data-octo-rarity="SSR"] .octo-gacha-rays,
            .octo-gacha-fx[data-octo-rarity="UR"] .octo-gacha-rays {
                display: block !important;
                animation: octo-fx-rays 1.05s ease-out forwards !important;
            }
            @keyframes octo-fx-rays {
                0%   { transform: rotate(-28deg) scale(.35); opacity: 0; }
                22%  { opacity: .95; }
                100% { transform: rotate(24deg) scale(1.35); opacity: 0; }
            }
            /* UR 彩虹光爆:整屏彩虹薄雾一闪 */
            .octo-gacha-fx[data-octo-rarity="UR"] .octo-gacha-flash {
                width: 90vmin !important; height: 90vmin !important;
                background: radial-gradient(circle, #ffffff 0%, #ffd75e 22%, #5be6ff 44%, #b06bff 64%, transparent 78%) !important;
            }
            /* 亮片 sparkle:仅 UR，一簇白点 twinkle */
            .octo-gacha-spark {
                display: none;
                position: absolute !important;
                inset: 0 !important;
                margin: auto !important;
                width: 6px !important; height: 6px !important; border-radius: 50% !important;
                background: #fff !important;
                box-shadow:
                    -30vmin -18vmin 0 0 #fff, 28vmin -22vmin 0 -1px #ffe9a8, -38vmin 14vmin 0 -1px #bfe6ff,
                    34vmin 16vmin 0 0 #fff, 8vmin -30vmin 0 -1px #fff, -14vmin 26vmin 0 0 #ffd7f2,
                    44vmin -6vmin 0 -1px #fff, -46vmin -4vmin 0 0 #d9c6ff !important;
                opacity: 0;
            }
            .octo-gacha-fx[data-octo-rarity="UR"] .octo-gacha-spark {
                display: block !important;
                animation: octo-fx-spark 1.15s ease-out forwards !important;
            }
            @keyframes octo-fx-spark {
                0%   { transform: scale(.4); opacity: 0; }
                30%  { opacity: 1; }
                100% { transform: scale(1.5); opacity: 0; }
            }
            @media (prefers-reduced-motion: reduce) {
                .octo-gacha-fx { display: none !important; }
            }

            /* 头部：左对齐，承载 banner */
            .wk-bot-detail-header {
                --octo-syn: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22120%22%20viewBox%3D%220%200%20400%20120%22%20preserveAspectRatio%3D%22xMidYMid%20slice%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22sky%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23180f3a%22%2F%3E%3Cstop%20offset%3D%220.62%22%20stop-color%3D%22%233a1f6e%22%2F%3E%3Cstop%20offset%3D%220.99%22%20stop-color%3D%22%237a2f86%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22sun%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%235be6ff%22%2F%3E%3Cstop%20offset%3D%220.5%22%20stop-color%3D%22%23b06bff%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23ff5ac6%22%2F%3E%3C%2FlinearGradient%3E%3CclipPath%20id%3D%22below%22%3E%3Crect%20x%3D%220%22%20y%3D%2284%22%20width%3D%22400%22%20height%3D%2236%22%2F%3E%3C%2FclipPath%3E%3C%2Fdefs%3E%3Crect%20width%3D%22400%22%20height%3D%22120%22%20fill%3D%22url(%23sky)%22%2F%3E%3Ccircle%20cx%3D%22270%22%20cy%3D%2284%22%20r%3D%2236%22%20fill%3D%22url(%23sun)%22%2F%3E%3Cg%20fill%3D%22%23180f3a%22%20opacity%3D%220.6%22%3E%3Crect%20x%3D%22228%22%20y%3D%2256%22%20width%3D%2284%22%20height%3D%223%22%2F%3E%3Crect%20x%3D%22226%22%20y%3D%2263%22%20width%3D%2288%22%20height%3D%224%22%2F%3E%3Crect%20x%3D%22224%22%20y%3D%2271%22%20width%3D%2292%22%20height%3D%225%22%2F%3E%3Crect%20x%3D%22222%22%20y%3D%2280%22%20width%3D%2296%22%20height%3D%226%22%2F%3E%3C%2Fg%3E%3Crect%20x%3D%220%22%20y%3D%2284%22%20width%3D%22400%22%20height%3D%2236%22%20fill%3D%22%230d0920%22%2F%3E%3Cg%20clip-path%3D%22url(%23below)%22%20stroke%3D%22%235be6ff%22%20stroke-opacity%3D%220.5%22%3E%3Cline%20x1%3D%220%22%20y1%3D%2284%22%20x2%3D%22400%22%20y2%3D%2284%22%2F%3E%3Cline%20x1%3D%220%22%20y1%3D%2291%22%20x2%3D%22400%22%20y2%3D%2291%22%2F%3E%3Cline%20x1%3D%220%22%20y1%3D%22102%22%20x2%3D%22400%22%20y2%3D%22102%22%2F%3E%3Cline%20x1%3D%220%22%20y1%3D%22118%22%20x2%3D%22400%22%20y2%3D%22118%22%2F%3E%3C%2Fg%3E%3Cg%20clip-path%3D%22url(%23below)%22%20stroke%3D%22%23b06bff%22%20stroke-opacity%3D%220.5%22%3E%3Cline%20x1%3D%22270%22%20y1%3D%2284%22%20x2%3D%22-60%22%20y2%3D%22120%22%2F%3E%3Cline%20x1%3D%22270%22%20y1%3D%2284%22%20x2%3D%2270%22%20y2%3D%22120%22%2F%3E%3Cline%20x1%3D%22270%22%20y1%3D%2284%22%20x2%3D%22170%22%20y2%3D%22120%22%2F%3E%3Cline%20x1%3D%22270%22%20y1%3D%2284%22%20x2%3D%22230%22%20y2%3D%22120%22%2F%3E%3Cline%20x1%3D%22270%22%20y1%3D%2284%22%20x2%3D%22270%22%20y2%3D%22120%22%2F%3E%3Cline%20x1%3D%22270%22%20y1%3D%2284%22%20x2%3D%22320%22%20y2%3D%22120%22%2F%3E%3Cline%20x1%3D%22270%22%20y1%3D%2284%22%20x2%3D%22400%22%20y2%3D%22120%22%2F%3E%3Cline%20x1%3D%22270%22%20y1%3D%2284%22%20x2%3D%22520%22%20y2%3D%22120%22%2F%3E%3C%2Fg%3E%3Crect%20x%3D%220%22%20y%3D%2282.5%22%20width%3D%22400%22%20height%3D%222%22%20fill%3D%22%237df0ff%22%2F%3E%3C%2Fsvg%3E") !important;
                align-items: flex-start !important;
                display: flex !important;
                flex-direction: column !important;
                order: 0 !important;
                position: relative !important;
                padding: 0 !important;
                margin: 0 0 6px !important;
                overflow: visible !important;
            }
            /* banner 主体 → synthwave/outrun 落日场景（内联 SVG 存于 --octo-syn；亮/暗共用, 世界杯另覆盖绿茵） */
            .wk-bot-detail-header::before {
                content: "" !important;
                position: absolute !important;
                top: 0 !important;
                left: -22px !important;
                right: -22px !important;
                bottom: auto !important;
                height: 176px !important;
                background: var(--octo-syn) center bottom / cover no-repeat, #150e34 !important;
                border-radius: 16px 16px 0 0 !important;
                box-shadow: inset 0 -3px 0 0 rgba(198, 160, 74, 0.9) !important;
                z-index: 0 !important;
            }
            /* banner 叠加 CRT 扫描线（synthwave 质感） */
            .wk-bot-detail-header::after {
                content: "" !important;
                position: absolute !important;
                top: 0 !important;
                left: -22px !important;
                right: -22px !important;
                height: 176px !important;
                background: repeating-linear-gradient(180deg, rgba(255, 255, 255, 0.045) 0 1px, transparent 1px 3px) !important;
                border-radius: 16px 16px 0 0 !important;
                pointer-events: none !important;
                z-index: 0 !important;
            }

            /* 头像：居中大圆头像 + 白环 + 金环(与金卡框呼应) + 浮起投影，浮在 banner 上 */
            .wk-bot-detail-avatar {
                position: relative !important;
                z-index: 1 !important;
                align-self: center !important;
                width: 150px !important;
                height: 150px !important;
                margin: 16px 0 0 !important;
                border-radius: 50% !important;
                overflow: hidden !important;
                background: #fff !important;
                box-shadow:
                    0 0 0 3px rgba(255, 255, 255, 0.92),
                    0 0 0 4px rgba(198, 160, 74, 0.95),
                    0 10px 22px rgba(0, 0, 0, 0.42) !important;
            }
            /* 头像内部不论 img / semi-image / WKAvatar(.wk-avatar)，统一放大并裁圆
             * (.wk-avatar 原生仅 40px，且 WKAvatar 不消费 size prop → 这里强制撑满父容器) */
            .wk-bot-detail-avatar > *,
            .wk-bot-detail-avatar .wk-avatar,
            .wk-bot-detail-avatar .semi-image,
            .wk-bot-detail-avatar .semi-image-img,
            .wk-bot-detail-avatar img {
                width: 100% !important;
                height: 100% !important;
                border-radius: 50% !important;
                object-fit: cover !important;
            }

            /* 名字 / handle：落到 banner 下白底，左对齐 */
            .wk-bot-detail-name {
                align-self: flex-start !important;
                margin-top: 16px !important;
                font-size: 21px !important;
                font-weight: 700 !important;
                letter-spacing: 0.2px !important;
                background: linear-gradient(90deg,
                    hsl(calc(248deg + var(--octo-hue)), 78%, 63%),
                    hsl(calc(190deg + var(--octo-hue)), 92%, 52%),
                    hsl(calc(248deg + var(--octo-hue)), 78%, 63%)) !important;
                background-size: 200% auto !important;
                -webkit-background-clip: text !important;
                background-clip: text !important;
                -webkit-text-fill-color: transparent !important;
                color: transparent !important;
            }
            /* 名字旁 AiBadge 是 flex 子元素：父级 text-fill 透明会继承下去 → 恢复白字，徽章不被流光染 */
            .wk-bot-detail-name .ai-badge {
                -webkit-text-fill-color: #fff !important;
                color: #fff !important;
            }
            .wk-bot-detail-id {
                align-self: flex-start !important;
                margin-top: 6px !important;
                font-size: 13px !important;
                color: #9a9db0 !important;
            }
            /* 状态 chip（🔌 未上报 Agent 信息 + ?）全主题隐藏 */
            .wk-bot-detail-octopush-chip {
                display: none !important;
            }

            /* 信息字段 → 备注/简介等「非创建者」合成一个大框(连续面板)；命令面板单独一块；
             * 创建者移到最底部作署名。颜色用主题变量(--octo-bd-panel-*)，结构全主题共享。
             * 字段由 JS 按标签打 data-octo-field / data-octo-group 标记(见 tagBotDetailFields)。 */
            .wk-bot-detail-desc,
            .wk-bot-detail-commands {
                position: relative !important;
                padding: 12px 15px !important;
                font-size: 14px !important;
                color: #2e2e44 !important;
                background: var(--octo-bd-panel-bg) !important;
            }
            /* 面板不再用霓虹左条(避免大框里多条竖线) */
            .wk-bot-detail-desc::before,
            .wk-bot-detail-commands::before { display: none !important; }
            /* 备注/简介等 → 连续大框 */
            .wk-bot-detail-desc:not([data-octo-field="creator"]) {
                order: 1 !important;
                margin: 0 !important;
                border-radius: 0 !important;
                border-left: 1px solid var(--octo-bd-panel-line) !important;
                border-right: 1px solid var(--octo-bd-panel-line) !important;
                border-top: none !important;
                border-bottom: none !important;
                clip-path: none !important;
            }
            .wk-bot-detail-desc[data-octo-group="first"],
            .wk-bot-detail-desc[data-octo-group="solo"] {
                border-top: 1px solid var(--octo-bd-panel-line) !important;
                border-radius: 12px 12px 0 0 !important;
                margin-top: 4px !important;
            }
            .wk-bot-detail-desc[data-octo-group="mid"],
            .wk-bot-detail-desc[data-octo-group="last"] {
                border-top: 1px solid var(--octo-bd-panel-div) !important;
            }
            .wk-bot-detail-desc[data-octo-group="last"] {
                border-bottom: 1px solid var(--octo-bd-panel-line) !important;
                border-radius: 0 0 12px 12px !important;
            }
            .wk-bot-detail-desc[data-octo-group="solo"] {
                border-bottom: 1px solid var(--octo-bd-panel-line) !important;
                border-radius: 12px !important;
            }
            /* 命令面板：单独一块(整框)，排在大框下、按钮上 */
            .wk-bot-detail-commands {
                order: 2 !important;
                margin: 12px 0 0 !important;
                border: 1px solid var(--octo-bd-panel-line) !important;
                border-radius: 12px !important;
                clip-path: none !important;
            }
            /* 发送/添加好友按钮排大框(及命令)下方 */
            .wk-bot-detail-modal .semi-button-block:not(.wk-bot-detail-manage-btn):not(.wk-bot-detail-claw-btn) {
                order: 3 !important;
            }
            /* 创建者 → 最底部作者署名(小字、居中、无框) */
            .wk-bot-detail-desc[data-octo-field="creator"] {
                order: 5 !important;
                margin: 12px 0 2px !important;
                padding: 0 !important;
                border: none !important;
                background: transparent !important;
                clip-path: none !important;
                text-align: center !important;
                font-size: 12px !important;
                color: var(--octo-bd-credit) !important;
                display: flex !important;
                justify-content: center !important;
                align-items: baseline !important;
                gap: 6px !important;
            }
            .wk-bot-detail-desc[data-octo-field="creator"] .wk-bot-detail-label {
                background: transparent !important;
                color: var(--octo-bd-credit-label) !important;
                padding: 0 !important;
                margin: 0 !important;
                font-size: 11px !important;
                letter-spacing: 0.06em !important;
                text-transform: none !important;
                clip-path: none !important;
            }
            .wk-bot-detail-desc[data-octo-field="creator"] .wk-bot-detail-label::before { content: "" !important; }
            /* 标签 → 浅紫 chip + 紫等宽字 + // 前缀（右下斜切，轻量 HUD tag，与 banner 同色系） */
            .wk-bot-detail-label {
                display: inline-block !important;
                text-transform: uppercase !important;
                letter-spacing: 1.2px !important;
                font-family: 'SF Mono', 'Monaco', 'Consolas', monospace !important;
                font-size: 10px !important;
                font-weight: 700 !important;
                color: #5b58e8 !important;
                background: rgba(124, 107, 240, 0.12) !important;
                padding: 2px 9px !important;
                margin-bottom: 8px !important;
                clip-path: polygon(0 0, 100% 0, calc(100% - 6px) 100%, 0 100%) !important;
            }
            .wk-bot-detail-label::before { content: "// " !important; opacity: 0.55 !important; }
            /* 编辑入口 → 赛博青 */
            .wk-bot-detail-edit-action,
            .wk-bot-detail-value-edit {
                color: #1493ad !important;
            }
            /* 空状态 */
            .wk-bot-detail-empty {
                color: #a6a8bd !important;
                font-style: italic !important;
            }
            .wk-bot-detail-cmd-name {
                color: #1493ad !important;
                font-family: 'SF Mono', 'Monaco', 'Consolas', monospace !important;
            }
            .wk-bot-detail-cmd-desc { color: #6b6f86 !important; }

            /* 底部主按钮（发送消息/聊天）：品牌紫渐变 + 浮起，接住消息气泡同色系。
             * 排除 Bot 管理 / 龙虾两个 light 次级按钮——Semi 默认 type=primary，
             * 否则它们会被套上紫渐变底却保留紫字 → 紫底紫字不可读。 */
            .wk-bot-detail-modal .semi-button-block.semi-button-primary:not(.wk-bot-detail-manage-btn):not(.wk-bot-detail-claw-btn) {
                background: linear-gradient(120deg, #6d5cf0, #5b58e8) !important;
                border: none !important;
                border-radius: 12px !important;
                height: 44px !important;
                font-weight: 600 !important;
                box-shadow: 0 6px 16px rgba(91, 88, 232, 0.35) !important;
                transition: transform .15s ease, box-shadow .15s ease, filter .15s ease !important;
            }
            .wk-bot-detail-modal .semi-button-block.semi-button-primary:not(.wk-bot-detail-manage-btn):not(.wk-bot-detail-claw-btn):hover {
                transform: translateY(-1px) !important;
                box-shadow: 0 9px 22px rgba(91, 88, 232, 0.45) !important;
                filter: brightness(1.05) !important;
            }

            /* 关闭按钮位于深色 synthwave banner 之上 → 浅色，保证可读 */
            .wk-bot-detail-modal .semi-modal-close,
            .wk-bot-detail-modal .semi-modal-close .semi-icon,
            .wk-bot-detail-modal .semi-modal-close svg {
                color: #dfe3ee !important;
                fill: #dfe3ee !important;
            }
            .wk-bot-detail-modal .semi-modal-close:hover {
                background: rgba(255, 255, 255, 0.14) !important;
                border-radius: 8px !important;
            }

            /* 无障碍：减弱动态时关闭 banner 的网格滚动与霓虹脉冲（保留静态 cyber 外观） */
            @media (prefers-reduced-motion: reduce) {
                .wk-bot-detail-header::before,
                .wk-bot-detail-header::after {
                    animation: none !important;
                }
                .wk-bot-detail-content { animation: none !important; }
                .wk-bot-detail-modal .wk-modal-shell::before { animation: none !important; opacity: 0 !important; }
                .wk-bot-detail-content::before { display: none !important; }
            }

            /* ========================================================
             * 用户资料卡（UserInfo，.wk-base-modal-userinfo）—— 套用同款 cyber-glass profile
             * DOM: .wk-userinfo > .wk-userinfo-content
             *        > .wk-userinfo-header > .wk-userinfo-user(头像+信息)
             *        > .wk-userinfo-sections > .wk-sections > .wk-section(.wk-section-title/-row)
             *      footer: .wk-userInfo-footer > .wk-userinfo-footer-sendbutton button
             * 注意：.wk-section* 是全 app 共用类，必须 scope 在 .wk-base-modal-userinfo 下。
             * ====================================================== */
            .wk-base-modal-userinfo .wk-modal-shell {
                border-radius: 18px !important;
                overflow: hidden !important;
                box-shadow: 0 24px 64px rgba(26, 22, 64, 0.30) !important;
            }
            .wk-base-modal-userinfo .wk-userinfo {
                background: #ffffff !important;
            }
            .wk-base-modal-userinfo .wk-userinfo-content {
                padding: 0 18px 16px !important;
                overflow-x: hidden !important;
                overflow-y: auto !important;
                background: radial-gradient(130% 60% at 50% 0%, #fbfbff 0%, #ffffff 58%) !important;
                animation: octo-bot-in .3s cubic-bezier(.22,.8,.28,1) both !important;
            }

            /* header：竖排（头像上、名字下），承载 banner */
            .wk-base-modal-userinfo .wk-userinfo-header {
                position: relative !important;
                padding-top: 128px !important;
                margin-bottom: 6px !important;
            }
            .wk-base-modal-userinfo .wk-userinfo-user {
                flex-direction: column !important;
                align-items: flex-start !important;
            }
            /* banner 主体（同款浅色 cyberpunk + 霓虹脉冲） */
            .wk-base-modal-userinfo .wk-userinfo-header::before {
                content: "" !important;
                position: absolute !important;
                top: 0 !important;
                left: -18px !important;
                right: -18px !important;
                height: 120px !important;
                background:
                    radial-gradient(62% 120% at 14% 0%, rgba(0, 220, 255, 0.32) 0%, transparent 56%),
                    radial-gradient(70% 130% at 92% 0%, rgba(255, 70, 210, 0.28) 0%, transparent 58%),
                    linear-gradient(118deg, #e7ecff 0%, #efe8ff 50%, #e0f3ff 100%) !important;
                border-radius: 18px 18px 0 0 !important;
                box-shadow:
                    inset 0 -2px 0 0 rgba(0, 224, 255, 0.60),
                    inset 0 -10px 16px -6px rgba(124, 60, 240, 0.28) !important;
                animation: octo-bot-neon 4s linear infinite, octo-glitch 5.5s linear infinite !important;
                z-index: 0 !important;
            }
            /* banner tron 网格滚动 */
            .wk-base-modal-userinfo .wk-userinfo-header::after {
                content: "" !important;
                position: absolute !important;
                top: 0 !important;
                left: -18px !important;
                right: -18px !important;
                height: 120px !important;
                background-image:
                    linear-gradient(180deg, transparent 40%, rgba(0, 229, 255, 0.5) 50%, transparent 60%),
                    repeating-linear-gradient(90deg, transparent 0 15px, rgba(124, 92, 240, 0.16) 15px 16px),
                    repeating-linear-gradient(0deg, transparent 0 15px, rgba(0, 196, 240, 0.14) 15px 16px) !important;
                background-size: 100% 54px, auto, auto !important;
                background-repeat: no-repeat, repeat, repeat !important;
                border-radius: 18px 18px 0 0 !important;
                animation: octo-bot-grid 3s linear infinite !important;
                pointer-events: none !important;
                z-index: 0 !important;
            }

            /* 头像：圆形 + 白环 + 紫光环，压在 banner 底边（取消原 margin-left/40% 圆角/灰底） */
            .wk-base-modal-userinfo .wk-userinfo-user-avatar {
                position: relative !important;
                z-index: 1 !important;
                width: 84px !important;
                height: 84px !important;
                margin: -50px 0 0 0 !important;
                border-radius: 50% !important;
                overflow: hidden !important;
                background: #fff !important;
                box-shadow:
                    0 0 0 4px #fff,
                    0 0 0 5px rgba(124, 107, 240, 0.5),
                    0 10px 24px rgba(40, 30, 90, 0.30) !important;
            }
            .wk-base-modal-userinfo .wk-userinfo-user-avatar > *,
            .wk-base-modal-userinfo .wk-userinfo-user-avatar .wk-avatar,
            .wk-base-modal-userinfo .wk-userinfo-user-avatar img {
                width: 100% !important;
                height: 100% !important;
                border-radius: 50% !important;
                object-fit: cover !important;
            }

            /* 名字 / 信息左对齐 */
            .wk-base-modal-userinfo .wk-userinfo-user-info {
                margin-left: 0 !important;
                margin-top: 12px !important;
            }
            .wk-base-modal-userinfo .wk-userinfo-user-info-name {
                font-size: 21px !important;
                font-weight: 700 !important;
                color: #1b1a2e !important;
            }
            .wk-base-modal-userinfo .wk-userinfo-user-info-others li {
                color: #9094a8 !important;
            }

            /* sections → 堆叠柔色卡片（仅在用户资料卡内生效，不污染全局 .wk-section） */
            .wk-base-modal-userinfo .wk-userinfo-sections {
                margin-top: 8px !important;
            }
            .wk-base-modal-userinfo .wk-userinfo-sections .wk-section {
                border: 1px solid #ecebf5 !important;
                border-radius: 12px !important;
                background: #f7f7fc !important;
                padding: 6px !important;
                margin-bottom: 8px !important;
            }
            .wk-base-modal-userinfo .wk-userinfo-sections .wk-section-title {
                font-size: 11.5px !important;
                font-weight: 600 !important;
                color: #9094a8 !important;
                padding: 4px 8px !important;
            }

            /* 可编辑行(.wk-list-item) hover 优化：柔和圆角紫高亮，替代全宽直角 #eee 灰块 */
            .wk-base-modal-userinfo .wk-userinfo-sections .wk-list-item {
                background-color: transparent !important;
                border-radius: 8px !important;
                transition: background-color .15s ease !important;
            }
            .wk-base-modal-userinfo .wk-userinfo-sections .wk-list-item:not(.wk-list-item-static):hover {
                background-color: rgba(124, 107, 240, 0.12) !important;
            }
            /* 非交互行（进群方式等）不高亮 */
            .wk-base-modal-userinfo .wk-userinfo-sections .wk-list-item-static,
            .wk-base-modal-userinfo .wk-userinfo-sections .wk-list-item-static:hover {
                background-color: transparent !important;
            }
            /* 可编辑行标题转品牌紫，强化「可点」暗示（静态行标题保持默认） */
            .wk-base-modal-userinfo .wk-userinfo-sections .wk-list-item:not(.wk-list-item-static) .wk-list-item-title {
                color: #5b58e8 !important;
            }

            /* footer 发送按钮 → 品牌紫渐变 */
            .wk-base-modal-userinfo .wk-userinfo-footer-sendbutton button {
                background: linear-gradient(120deg, #6d5cf0, #5b58e8) !important;
                border: none !important;
                border-radius: 12px !important;
                color: #fff !important;
                font-weight: 600 !important;
                box-shadow: 0 6px 16px rgba(91, 88, 232, 0.35) !important;
            }

            /* 关闭按钮 × → 深灰（浅 banner 上可读） */
            .wk-base-modal-userinfo .semi-modal-close,
            .wk-base-modal-userinfo .semi-modal-close .semi-icon,
            .wk-base-modal-userinfo .semi-modal-close svg {
                color: #4a4a5e !important;
                fill: #4a4a5e !important;
            }

            /* RoutePage 顶栏「秃头」修复：把灰色 56px 空导航条变透明并浮到 banner 上，
             * 内容上移铺满（--wk-height-route-header→0），× 移到右上角并改深灰。
             * 严格 scope 在 .wk-base-modal-userinfo 内（.wk-route* 全 app 共用，不可全局改）。 */
            .wk-base-modal-userinfo .wk-route {
                position: relative !important;
                --wk-height-route-header: 0px !important;
            }
            .wk-base-modal-userinfo .wk-route-header {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                height: 48px !important;
                padding: 0 !important;
                background: transparent !important;
                z-index: 5 !important;
                pointer-events: none !important;
            }
            .wk-base-modal-userinfo .wk-route-header-close {
                position: absolute !important;
                top: 4px !important;
                right: 10px !important;
                pointer-events: auto !important;
            }
            .wk-base-modal-userinfo .wk-route-header-close:hover {
                background-color: rgba(74, 74, 94, 0.12) !important;
            }
            /* × 由两条 background-color bar 组成 → 浅 banner 上改深灰可读 */
            .wk-base-modal-userinfo .wk-route-header-close-icon,
            .wk-base-modal-userinfo .wk-route-header-close-icon::before,
            .wk-base-modal-userinfo .wk-route-header-close-icon::after {
                background-color: #4a4a5e !important;
            }

            @media (prefers-reduced-motion: reduce) {
                .wk-base-modal-userinfo .wk-userinfo-header::before,
                .wk-base-modal-userinfo .wk-userinfo-header::after,
                .wk-base-modal-userinfo .wk-userinfo-content {
                    animation: none !important;
                }
            }

            /* =====================================================================
             * 主题切换按钮 —— 作为 NavRail 底部图标项注入到「语言切换」正上方，与原生导航项融为一体。
             * 复用 .wk-navrail__item 原生样式(56×44/透明底/hover 变色)，图标用 emoji(🌙/☀️)。
             * =================================================================== */
            #octo-theme-toggle { -webkit-appearance: none !important; appearance: none !important; }
            #octo-theme-toggle .octo-tt-ico {
                font-size: 17px !important;
                line-height: 1 !important;
                font-style: normal !important;
            }

            /* 主题选择弹出菜单（fixed 注入 body，锚定按钮右侧；暗色玻璃卡，亮/暗主题下均清晰） */
            #octo-theme-menu {
                position: fixed !important;
                z-index: 2147483600 !important;
                min-width: 188px !important;
                padding: 6px !important;
                background: #1b1830 !important;
                border: 1px solid rgba(124, 107, 240, 0.30) !important;
                border-radius: 12px !important;
                box-shadow: 0 12px 34px rgba(0, 0, 0, 0.40) !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 2px !important;
                font-size: 13px !important;
                -webkit-font-smoothing: antialiased !important;
            }
            #octo-theme-menu .octo-theme-menu__item {
                display: flex !important;
                align-items: center !important;
                gap: 10px !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 8px 10px !important;
                background: transparent !important;
                border: none !important;
                border-radius: 8px !important;
                color: #e7e8f1 !important;
                cursor: pointer !important;
                text-align: left !important;
                font: inherit !important;
                line-height: 1.2 !important;
                -webkit-appearance: none !important;
                appearance: none !important;
            }
            #octo-theme-menu .octo-theme-menu__item:hover { background: rgba(124, 107, 240, 0.22) !important; }
            #octo-theme-menu .octo-theme-menu__item.is-active { background: rgba(124, 107, 240, 0.16) !important; }
            #octo-theme-menu .octo-theme-menu__ico {
                font-size: 15px !important;
                line-height: 1 !important;
                width: 18px !important;
                text-align: center !important;
                font-style: normal !important;
            }
            #octo-theme-menu .octo-theme-menu__label { flex: 1 1 auto !important; white-space: nowrap !important; }
            #octo-theme-menu .octo-theme-menu__check {
                width: 12px !important;
                text-align: center !important;
                color: #9b8cff !important;
                font-weight: 700 !important;
            }

            /* =====================================================================
             * 暗色主题变体 —— 统一 scope 在 body[theme-mode="dark"] 下（与原生暗色同一开关）。
             * 原生界面(侧栏/会话/聊天区/输入框)由 app 自带 dark CSS 接管；以下把脚本钉死的
             * 浅色面翻暗。霓虹紫/青/绿强调色保留（暗底上更亮）。每条选择器复刻原浅色规则并加
             * body[theme-mode=dark] 前缀 → 特异性更高，覆盖原 !important 浅色值。
             * =================================================================== */

            /* ---- 修补原生暗色「遗漏的共享语义令牌」----
             * app 的 semantic.css 暗色段(body[theme-mode=dark]) 漏定义了下列颜色令牌，
             * 它们在 light :root 是近黑值(如 --wk-text-strong: rgba(28,28,35,.9))，
             * 暗底上保持近黑 → 左侧会话列表名字/图标「啥都看不见」。这里补上可读暗色值。
             * 全 app 共享令牌 → 同时修好其它用到它们的原生界面（导航/列表/标题等）。
             * （只补暗底文字/图标可见性，未动 --wk-brand-primary 等强调底色，避免误改全局观感。） */
            body[theme-mode="dark"] {
                --wk-text-strong: rgba(238, 240, 247, 0.95) !important;   /* 列表名字 .wk-conv-compact-name */
                --wk-icon-default: rgba(228, 230, 237, 0.62) !important;
                --wk-icon-muted: rgba(228, 230, 237, 0.40) !important;
                --wk-bg-item-hover: rgba(255, 255, 255, 0.06) !important;
                /* 幻影 bg 令牌：组件用 --wk-bg-*（如 webhook 卡 var(--wk-bg-primary,#fff)），但全工作区无定义
                 * （App.css 暗色变量叫 --bg-*，命名错配）→ 暗底上走 #fff 浅色兜底 = 白卡片。这里补暗色值。 */
                --wk-bg-primary: #1d1b29 !important;       /* 卡片/主表面 (webhook 卡等) */
                --wk-bg-secondary: #16151f !important;
                --wk-bg-tertiary: rgba(255, 255, 255, 0.06) !important;  /* 内层/图标底 */
                --wk-warning-bg: rgba(250, 173, 20, 0.15) !important;
                --wk-bg-tab: rgba(255, 255, 255, 0.05) !important;       /* 关注/最近 tab 轨道底（原浅色不可见）*/
                /* --wk-brand-primary 在 light 是 brand-black(黑)，暗色段漏改 → 用它当文字色的地方(如聊天
                 * header 频道名 .wk-chat-conversation-header-channel-info-name)黑字压暗底=隐形。改品牌紫，
                 * 文字可读、作主按钮/选中底色也 on-brand。 */
                --wk-brand-primary: #8b7cf0 !important;
                /* brand-tint 系列在 light 是 rgba(28,28,35,X)（近黑叠加，用于 hover/选中/边框等 subtle 面），
                 * 暗色段零覆盖 → 暗底上黑叠加全不可见（选中会话无高亮、header 底边线消失）。重映射为白 alpha。 */
                --wk-brand-tint-03: rgba(255, 255, 255, 0.03) !important;
                --wk-brand-tint-04: rgba(255, 255, 255, 0.04) !important;
                --wk-brand-tint-06: rgba(255, 255, 255, 0.06) !important;
                --wk-brand-tint-08: rgba(255, 255, 255, 0.08) !important;
                --wk-brand-tint-10: rgba(255, 255, 255, 0.10) !important;
                --wk-brand-tint-12: rgba(255, 255, 255, 0.12) !important;
                --wk-brand-tint-15: rgba(255, 255, 255, 0.15) !important;
                --wk-brand-tint-35: rgba(255, 255, 255, 0.32) !important;
                /* 整体配色优化：原生暗色是接近纯黑的中性灰、偏平。重映射核心表面为「微紫冷调 + 清晰层次」
                 * （deep < base < surface < elevated），呼应赛博紫主题，面与面之间有可辨识的层级。 */
                --wk-bg-deep: #0d0c13 !important;       /* 最底层：NavRail / 页面底 */
                --wk-bg-base: #131119 !important;       /* 主背景：列表 / 聊天区 */
                --wk-bg-surface: #191722 !important;    /* 面板：header / 输入框 / 卡片底 */
                --wk-bg-elevated: #201d2c !important;   /* 抬升层：tag / 系统消息 / 悬浮 */
            }

            /* ---- 关注/最近 tab：选中态原为纯白胶囊 var(--wk-color-white) → 暗底刺眼且浅字不可见，改紫选中态 ---- */
            body[theme-mode="dark"] .wk-sidebar-tabbar__btn--active {
                background: rgba(124, 107, 240, 0.25) !important;
            }
            /* ---- 选中会话高亮：原 .wk-conv-compact-item--selected 用 brand-tint-06，重映射后=白6%，会与 hover 撞
             * → 单独覆盖成醒目紫，明确区分「选中(紫)」vs「hover(中性白)」---- */
            body[theme-mode="dark"] .wk-conv-compact-item--selected {
                background: rgba(124, 107, 240, 0.26) !important;
            }
            /* ---- 底部输入框：原边框/引用条用硬编码近黑/浅色，暗底上边框消失、引用条变亮斑 → 修正 ---- */
            body[theme-mode="dark"] .wk-messageinput-card {
                background: var(--wk-bg-elevated) !important;   /* footer 内抬升的输入面，与 footer 区分 */
                border-color: rgba(255, 255, 255, 0.10) !important;
            }
            body[theme-mode="dark"] .wk-messageinput-card:focus-within {
                border-color: rgba(124, 107, 240, 0.65) !important;
            }
            body[theme-mode="dark"] .wk-replyview-new {
                background-color: rgba(255, 255, 255, 0.06) !important;
                border-color: rgba(255, 255, 255, 0.10) !important;
            }
            body[theme-mode="dark"] .wk-replyview-new-divider {
                background-color: rgba(255, 255, 255, 0.14) !important;
            }
            /* ---- 聊天三块底色统一：内容区原用 --wk-color-secondary-2(中性灰)与 header(微紫 surface)不搭。
             * 统一为「header=surface(顶部 chrome)、内容+footer=base(连续无色带)」，输入卡 elevated 浮于其上 ---- */
            body[theme-mode="dark"] .wk-conversation-content {
                background-color: var(--wk-bg-base) !important;
            }
            body[theme-mode="dark"] .wk-conversation-footer {
                background-color: var(--wk-bg-base) !important;
            }
            /* ---- 弹窗遮罩：Semi 用 --semi-color-overlay-bg(=brand-tint-35)，而 tint-35 被重映射为白(供
             * Mergeforward 文字等用)，导致遮罩变白纱把背景冲灰 → 单独把弹窗 scrim 覆盖成深色压暗 ---- */
            body[theme-mode="dark"] .wk-modal {
                --semi-color-overlay-bg: rgba(5, 4, 12, 0.6) !important;
            }
            /* ---- 消息时间：原生 .wk-msg-row-timestamp 用 rgba(28,28,35,.4) 近黑，暗底隐形(仅 AI 那档被脚本
             * 覆盖过 → 人类/自己档看不见)。统一覆盖为可读浅灰，与 AI 档一致 ---- */
            body[theme-mode="dark"] .wk-msg-row-timestamp,
            body[theme-mode="dark"] .wk-msg-row-timestamp-hover {
                color: #9da0b2 !important;
            }
            /* ---- 系统消息：历史分割线「以上为历史消息」(原文字/线均 rgba(9,30,66,..)近黑→暗底隐形) ---- */
            body[theme-mode="dark"] .wk-message-split-content {
                color: #9da0b2 !important;
            }
            body[theme-mode="dark"] .wk-message-split-line1 {
                background-image: linear-gradient(360deg, transparent, rgba(255, 255, 255, 0.16)) !important;
            }
            body[theme-mode="dark"] .wk-message-split-line2 {
                background-image: linear-gradient(360deg, rgba(255, 255, 255, 0.16), transparent) !important;
            }
            /* ---- 子区创建卡 .wk-thread-created-card(原卡底/左条/正文/参与者均近黑→暗底隐形) ---- */
            body[theme-mode="dark"] .wk-thread-created-card {
                background: rgba(255, 255, 255, 0.05) !important;
                border-left-color: #7c6bf0 !important;
            }
            body[theme-mode="dark"] .wk-thread-created-card:hover {
                background: rgba(255, 255, 255, 0.08) !important;
            }
            body[theme-mode="dark"] .wk-thread-created-preview {
                color: #e7e8f1 !important;
            }
            body[theme-mode="dark"] .wk-thread-created-link {
                color: #9b8cff !important;
            }
            body[theme-mode="dark"] .wk-thread-created-participants {
                color: #9da0b2 !important;
            }
            /* ---- 文件消息 .wk-message-file(原卡底/hover 近黑叠加、文件名/大小/扩展名/操作用近黑或 --wk-color-theme(#1C1C23)→暗底隐形) ---- */
            body[theme-mode="dark"] .wk-message-file {
                background: rgba(255, 255, 255, 0.05) !important;
            }
            body[theme-mode="dark"] .wk-message-file--clickable:hover {
                background: rgba(255, 255, 255, 0.08) !important;
            }
            body[theme-mode="dark"] .wk-message-file--clickable:active {
                background: rgba(255, 255, 255, 0.12) !important;
            }
            body[theme-mode="dark"] .wk-message-file--active {
                border-color: #7c6bf0 !important;
            }
            body[theme-mode="dark"] .wk-message-file-name {
                color: #e7e8f1 !important;
            }
            body[theme-mode="dark"] .wk-message-file-meta {
                color: #9da0b2 !important;
            }
            body[theme-mode="dark"] .wk-message-file-ext,
            body[theme-mode="dark"] .wk-message-file-action {
                color: #9b8cff !important;
            }
            /* 「自己发送」的文件消息(绿系)：扩展名/操作转绿，与发送气泡同色 */
            body[theme-mode="dark"] .wk-message-base-bubble-box.send .wk-message-file-ext,
            body[theme-mode="dark"] .wk-message-base-bubble-box.send .wk-message-file-action {
                color: #54cf90 !important;
            }
            /* ---- @提及 mention（TextContent 版 .mention-*：原 #6B3DD8 深紫 + 淡紫 chip，暗底太暗不明显）→ 提亮 ---- */
            body[theme-mode="dark"] .mention-highlight,
            body[theme-mode="dark"] .mention-fallback {
                color: #b39bff !important;
            }
            body[theme-mode="dark"] .mention-entity {
                color: #c2b3ff !important;
                background-color: rgba(124, 107, 240, 0.22) !important;
            }
            body[theme-mode="dark"] .mention-entity:hover {
                background-color: rgba(124, 107, 240, 0.32) !important;
            }
            /* ---- 合并转发卡片 .wk-mf-card(原卡底/边框/标题/预览/分割线/底标签均近黑→暗底隐形) ---- */
            body[theme-mode="dark"] .wk-mf-card {
                background: rgba(255, 255, 255, 0.05) !important;
                border-color: rgba(255, 255, 255, 0.10) !important;
            }
            body[theme-mode="dark"] .wk-mf-card:hover {
                background: rgba(255, 255, 255, 0.08) !important;
            }
            body[theme-mode="dark"] .wk-mf-card__title {
                color: #e7e8f1 !important;
            }
            body[theme-mode="dark"] .wk-mf-card__item {
                color: #b6b9cc !important;
            }
            body[theme-mode="dark"] .wk-mf-card__divider {
                background: rgba(255, 255, 255, 0.10) !important;
            }
            body[theme-mode="dark"] .wk-mf-card__footer {
                color: #9da0b2 !important;
            }
            /* ---- WKModal 弹窗底面板压暗：className 落在 Semi 内容上(.wk-modal)，但白底来自 Semi 的
             * .semi-modal-content/.semi-modal-body，靠 --semi-color-bg 令牌没压住 → 直接显式压暗。
             * 通用到所有 .wk-modal(自定义内容的 bot/用户卡有自己暗底覆盖其上，无害)，一次修好转发等弹窗发白。 */
            body[theme-mode="dark"] .wk-modal,
            body[theme-mode="dark"] .wk-modal.semi-modal-content,
            body[theme-mode="dark"] .wk-modal .semi-modal-content,
            body[theme-mode="dark"] .wk-modal .semi-modal-body,
            body[theme-mode="dark"] .wk-modal .wk-modal-content,
            body[theme-mode="dark"] .wk-modal .wk-modal-shell,
            body[theme-mode="dark"] .wk-modal .wk-modal-body {
                background-color: var(--wk-bg-surface) !important;
            }
            /* ---- 转发消息列表内容(MergeforwardMessageList)：名字/时间/正文近黑→暗底隐形 ---- */
            body[theme-mode="dark"] .wk-mergeforwardmessagelist-content-msg-info-first-name {
                color: #e7e8f1 !important;
            }
            body[theme-mode="dark"] .wk-mergeforwardmessagelist-content-msg-info-first-time {
                color: #9da0b2 !important;
            }
            body[theme-mode="dark"] .wk-mergeforwardmessagelist-content-msg-info-second-msgcontent {
                color: #cfd0e0 !important;
            }
            /* ---- 转发里的文件 .wk-mergeforward-file(卡底/文件名/大小近黑→隐形) ---- */
            body[theme-mode="dark"] .wk-mergeforward-file {
                background: rgba(255, 255, 255, 0.05) !important;
            }
            body[theme-mode="dark"] .wk-mergeforward-file--clickable:hover {
                background: rgba(255, 255, 255, 0.08) !important;
            }
            body[theme-mode="dark"] .wk-mergeforward-file__name {
                color: #e7e8f1 !important;
            }
            body[theme-mode="dark"] .wk-mergeforward-file__size {
                color: #9da0b2 !important;
            }
            /* ---- 输入框 @mention token：原 .wk-messageinput-editor .mention 用 --wk-color-theme(#1C1C23 近黑)→暗底不可读 ---- */
            body[theme-mode="dark"] .wk-messageinput-editor .mention {
                color: #b39bff !important;
            }
            /* 输入框内引用预览文字(原 #333/#555 暗底不可读) */
            body[theme-mode="dark"] .wk-replyview-new-content { color: #cfd0e0 !important; }
            body[theme-mode="dark"] .wk-replyview-new-text { color: #9da0b2 !important; }
            /* ---- @补全下拉 选中/hover 项：原 bg --wk-color-theme(近黑) + 文字 --wk-text-inverse(暗色下也是深色)→深字压深底 ---- */
            body[theme-mode="dark"] .mention-list.mention-list--mouse .mention-list-item:hover,
            body[theme-mode="dark"] .mention-list.mention-list--keyboard .mention-list-item.is-selected {
                background-color: #7c6bf0 !important;
                color: #fff !important;
            }
            body[theme-mode="dark"] .mention-list.mention-list--mouse .mention-list-item:hover .mention-list-item-space,
            body[theme-mode="dark"] .mention-list.mention-list--keyboard .mention-list-item.is-selected .mention-list-item-space {
                color: rgba(255, 255, 255, 0.85) !important;
            }
            /* ---- 折叠/文本消息正文：链路 TextContent → .wk-msg-text-content > MarkdownContent(.wk-markdown)。
             * .wk-markdown 的 p 无自身 color(继承父级即可)，但 blockquote 用 --semi-color-text-1(secondary 灰)、
             * 标题用 text-0；折叠(.wk-fold-msg-text)又不在 .wk-msg-row 下，AI 规则够不着 → 暗底发灰。
             * 统一把这两类容器内正文(含 blockquote/标题/段落/列表)强制提亮(code/链接/mention 各自色保留)。 */
            body[theme-mode="dark"] .wk-msg-text-content,
            body[theme-mode="dark"] .wk-fold-msg-text,
            body[theme-mode="dark"] .wk-msg-text-content .wk-markdown,
            body[theme-mode="dark"] .wk-fold-msg-text .wk-markdown,
            body[theme-mode="dark"] .wk-msg-text-content .wk-markdown :is(p, li, blockquote, h1, h2, h3, h4, h5, h6),
            body[theme-mode="dark"] .wk-fold-msg-text .wk-markdown :is(p, li, blockquote, h1, h2, h3, h4, h5, h6) {
                color: #e7e8f1 !important;
            }
            /* ---- 聊天 header 会话标题：原 color:var(--wk-brand-primary) 暗底偏暗 → 改清晰浅色（私聊/群聊同此类）---- */
            body[theme-mode="dark"] .wk-chat-conversation-header-channel-info-name {
                color: #eef0f6 !important;
            }

            /* ---- 隐藏 Bot 资料卡的「Bot 管理」「🦞 查看龙虾信息」按钮（两个主题都隐藏，非暗色专属）---- */
            .wk-bot-detail-manage-btn,
            .wk-bot-detail-claw-btn {
                display: none !important;
            }

            /* ---- AI 消息气泡 ---- */
            body[theme-mode="dark"] .wk-msg-row:has(.ai-badge) .wk-markdown,
            body[theme-mode="dark"] .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown {
                background: #1b1830 !important;
                color: #e7e8f1 !important;
            }
            body[theme-mode="dark"] .wk-msg-row:has(.ai-badge) .wk-markdown:hover,
            body[theme-mode="dark"] .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown:hover {
                background: #221d3a !important;
            }
            body[theme-mode="dark"] .wk-msg-row:has(.ai-badge) .wk-markdown p,
            body[theme-mode="dark"] .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown p,
            body[theme-mode="dark"] .wk-msg-row:has(.ai-badge) .wk-markdown ul,
            body[theme-mode="dark"] .wk-msg-row:has(.ai-badge) .wk-markdown ol,
            body[theme-mode="dark"] .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown ul,
            body[theme-mode="dark"] .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown ol {
                color: #e7e8f1 !important;
            }
            body[theme-mode="dark"] .wk-msg-row:has(.ai-badge) .wk-markdown a,
            body[theme-mode="dark"] .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown a {
                color: #9b8cff !important;
            }
            body[theme-mode="dark"] .wk-msg-row:has(.ai-badge) .wk-markdown code,
            body[theme-mode="dark"] .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown code {
                background: #2a2545 !important;
                color: #b7abff !important;
            }
            body[theme-mode="dark"] .wk-msg-row:has(.ai-badge) .wk-markdown strong,
            body[theme-mode="dark"] .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown strong {
                color: #f1f0fa !important;
            }

            /* ---- 自己发送(绿) ---- */
            body[theme-mode="dark"] .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown {
                background: #15211b !important;
                color: #cdd6d0 !important;
            }
            body[theme-mode="dark"] .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown p { color: #cdd6d0 !important; }
            body[theme-mode="dark"] .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown:hover { background: #1c2a22 !important; }
            body[theme-mode="dark"] .wk-msg-row--send:not(:has(.ai-badge)) .wk-msg-row-sender { color: #54cf90 !important; }
            body[theme-mode="dark"] .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown a { color: #7fd9ac !important; }
            body[theme-mode="dark"] .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown code { background: #22302a !important; color: #7fd9ac !important; }
            body[theme-mode="dark"] .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown strong { color: #eaf3ee !important; }

            /* ---- 他人(中性 slate) ---- */
            body[theme-mode="dark"] .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown {
                background: #1a1c24 !important;
                color: #c6c8d4 !important;
            }
            body[theme-mode="dark"] .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown:hover { background: #212430 !important; }
            body[theme-mode="dark"] .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown p { color: #c6c8d4 !important; }
            body[theme-mode="dark"] .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown a { color: #9b8cff !important; }
            body[theme-mode="dark"] .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown code { background: #262833 !important; color: #bcbfce !important; }
            body[theme-mode="dark"] .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown strong { color: #eef0f6 !important; }

            /* ---- 暗底收敛：浅灰外框 + 实色 HUD 角标在暗底上会变刺眼霓虹框 → 调暗/降透明 ---- */
            /* 外框转暗调细线，保留彩色 border-left 作身份强调（只覆盖上/右/下三边） */
            body[theme-mode="dark"] .wk-msg-row:has(.ai-badge) .wk-markdown,
            body[theme-mode="dark"] .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown {
                border-top-color: rgba(124, 107, 240, 0.20) !important;
                border-right-color: rgba(124, 107, 240, 0.20) !important;
                border-bottom-color: rgba(124, 107, 240, 0.20) !important;
            }
            body[theme-mode="dark"] .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown {
                border-top-color: rgba(70, 168, 119, 0.22) !important;
                border-right-color: rgba(70, 168, 119, 0.22) !important;
                border-bottom-color: rgba(70, 168, 119, 0.22) !important;
            }
            body[theme-mode="dark"] .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown {
                border-top-color: rgba(255, 255, 255, 0.08) !important;
                border-right-color: rgba(255, 255, 255, 0.08) !important;
                border-bottom-color: rgba(255, 255, 255, 0.08) !important;
            }
            body[theme-mode="dark"] .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown code {
                border-color: rgba(255, 255, 255, 0.08) !important;
            }
            /* HUD 取景角标整体降透明：保留赛博角标轮廓，但暗底上不刺眼 */
            body[theme-mode="dark"] .wk-msg-row:has(.ai-badge) .wk-markdown::before,
            body[theme-mode="dark"] .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown::before,
            body[theme-mode="dark"] .wk-fold-msg-text::before,
            body[theme-mode="dark"] .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown::before {
                opacity: 0.5 !important;
            }
            /* clamp「展开全文」渐隐蒙层 fade-to 颜色跟随暗底（否则长消息底部露白）。
             * 蒙层用 var(--octo-bg)，此处把各气泡的 --octo-bg 改成对应暗底即可。 */
            body[theme-mode="dark"] .wk-msg-row:has(.ai-badge) .wk-markdown,
            body[theme-mode="dark"] .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown { --octo-bg: #1b1830 !important; }
            body[theme-mode="dark"] .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown { --octo-bg: #15211b !important; }
            body[theme-mode="dark"] .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown { --octo-bg: #1a1c24 !important; }

            /* ---- 消息正文通用子元素兜底（标题/引用/列表/表格在暗底上保持可读）---- */
            body[theme-mode="dark"] .wk-msg-row .wk-markdown h1,
            body[theme-mode="dark"] .wk-msg-row .wk-markdown h2,
            body[theme-mode="dark"] .wk-msg-row .wk-markdown h3,
            body[theme-mode="dark"] .wk-msg-row .wk-markdown h4,
            body[theme-mode="dark"] .wk-msg-row .wk-markdown h5,
            body[theme-mode="dark"] .wk-msg-row .wk-markdown h6,
            body[theme-mode="dark"] .wk-msg-row .wk-markdown blockquote,
            body[theme-mode="dark"] .wk-msg-row .wk-markdown li,
            body[theme-mode="dark"] .wk-msg-row .wk-markdown td,
            body[theme-mode="dark"] .wk-msg-row .wk-markdown th {
                color: #d4d5e2 !important;
            }
            body[theme-mode="dark"] .wk-msg-row .wk-markdown pre { background: #15131f !important; }

            /* ---- 折叠 AI 消息 ---- */
            body[theme-mode="dark"] .wk-fold-msg-text {
                background: #1b1830 !important;
                --octo-bg: #1b1830 !important;
                border-top-color: rgba(124, 107, 240, 0.20) !important;
                border-right-color: rgba(124, 107, 240, 0.20) !important;
                border-bottom-color: rgba(124, 107, 240, 0.20) !important;
                color: #e7e8f1 !important;
            }
            body[theme-mode="dark"] .wk-fold-msg-text:hover { background: #221d3a !important; }

            /* ---- 引用/回复块（markdown blockquote 风：无填充，仅左竖条）---- */
            body[theme-mode="dark"] .wk-msg-row .wk-reply-block,
            body[theme-mode="dark"] .wk-msg-row .wk-message-text-reply {
                background: transparent !important;
            }
            body[theme-mode="dark"] .wk-msg-row .wk-reply-block:hover,
            body[theme-mode="dark"] .wk-msg-row .wk-message-text-reply:hover {
                background: rgba(255, 255, 255, 0.045) !important;
            }
            body[theme-mode="dark"] .wk-msg-row .wk-reply-block__name,
            body[theme-mode="dark"] .wk-msg-row .wk-message-text-reply-authorname {
                color: #b9bccd !important;
            }
            body[theme-mode="dark"] .wk-msg-row .wk-reply-block__digest,
            body[theme-mode="dark"] .wk-msg-row .wk-message-text-reply-content {
                color: #9296a8 !important;
            }

            /* ---- Bot 资料卡：暗色只改配色变量(结构继承基础层) ---- */
            body[theme-mode="dark"] .wk-bot-detail-content {
                --octo-bd-panel-bg: #211d38;
                --octo-bd-panel-line: rgba(124, 107, 240, 0.30);
                --octo-bd-panel-div: rgba(124, 107, 240, 0.16);
                --octo-bd-credit: #9a9db8;
                --octo-bd-credit-label: #8f92ad;
                background: radial-gradient(130% 70% at 50% 0%, #1a1733 0%, #121022 58%) !important;
            }
            body[theme-mode="dark"] .wk-bot-detail-header::before {
                background: var(--octo-syn) center bottom / cover no-repeat, #0d0920 !important;
            }
            body[theme-mode="dark"] .wk-bot-detail-desc,
            body[theme-mode="dark"] .wk-bot-detail-commands {
                color: #d4d5e4 !important;
            }
            body[theme-mode="dark"] .wk-bot-detail-label {
                color: #a99cff !important;
                background: rgba(124, 107, 240, 0.16) !important;
            }
            body[theme-mode="dark"] .wk-bot-detail-cmd-desc { color: #a4a7ba !important; }
            body[theme-mode="dark"] .wk-bot-detail-empty { color: #8a8da1 !important; }
            body[theme-mode="dark"] .wk-bot-detail-modal .semi-modal-close,
            body[theme-mode="dark"] .wk-bot-detail-modal .semi-modal-close .semi-icon,
            body[theme-mode="dark"] .wk-bot-detail-modal .semi-modal-close svg {
                color: #c9ccda !important;
                fill: #c9ccda !important;
            }
            body[theme-mode="dark"] .wk-bot-detail-modal .semi-modal-close:hover {
                background: rgba(255, 255, 255, 0.12) !important;
            }

            /* ---- 用户资料卡 ---- */
            body[theme-mode="dark"] .wk-base-modal-userinfo .wk-userinfo { background: #121022 !important; }
            body[theme-mode="dark"] .wk-base-modal-userinfo .wk-userinfo-content {
                background: radial-gradient(130% 60% at 50% 0%, #1a1733 0%, #121022 58%) !important;
            }
            body[theme-mode="dark"] .wk-base-modal-userinfo .wk-userinfo-header::before {
                background:
                    radial-gradient(62% 120% at 14% 0%, rgba(0, 220, 255, 0.32) 0%, transparent 56%),
                    radial-gradient(70% 130% at 92% 0%, rgba(255, 70, 210, 0.28) 0%, transparent 58%),
                    linear-gradient(118deg, #161430 0%, #1a1535 50%, #101a2e 100%) !important;
            }
            body[theme-mode="dark"] .wk-base-modal-userinfo .wk-userinfo-user-info-name { color: #f0f0f8 !important; }
            body[theme-mode="dark"] .wk-base-modal-userinfo .wk-userinfo-user-info-others li { color: #9498ac !important; }
            body[theme-mode="dark"] .wk-base-modal-userinfo .wk-userinfo-sections .wk-section {
                background: #211d38 !important;
                border-color: rgba(124, 107, 240, 0.16) !important;
            }
            body[theme-mode="dark"] .wk-base-modal-userinfo .wk-userinfo-sections .wk-section-title { color: #9296ab !important; }
            body[theme-mode="dark"] .wk-base-modal-userinfo .wk-userinfo-sections .wk-list-item:not(.wk-list-item-static):hover {
                background-color: rgba(124, 107, 240, 0.18) !important;
            }
            body[theme-mode="dark"] .wk-base-modal-userinfo .wk-userinfo-sections .wk-list-item:not(.wk-list-item-static) .wk-list-item-title {
                color: #a99cff !important;
            }
            body[theme-mode="dark"] .wk-base-modal-userinfo .semi-modal-close,
            body[theme-mode="dark"] .wk-base-modal-userinfo .semi-modal-close .semi-icon,
            body[theme-mode="dark"] .wk-base-modal-userinfo .semi-modal-close svg {
                color: #c9ccda !important;
                fill: #c9ccda !important;
            }
            body[theme-mode="dark"] .wk-base-modal-userinfo .wk-route-header-close-icon,
            body[theme-mode="dark"] .wk-base-modal-userinfo .wk-route-header-close-icon::before,
            body[theme-mode="dark"] .wk-base-modal-userinfo .wk-route-header-close-icon::after {
                background-color: #c9ccda !important;
            }
            body[theme-mode="dark"] .wk-base-modal-userinfo .wk-route-header-close:hover {
                background-color: rgba(255, 255, 255, 0.12) !important;
            }

            /* =====================================================================
             * 美加墨世界杯皮肤（body[data-octo-skin="worldcup"]）—— 体育画报 / 转播质感（浅色）
             *   palette  近白卡 #ffffff→#fdfbf7 + 暖墨字 #181818；三档=主办国珠宝深调身份：
             *            自己 Old Glory 深红 #C8102E / 他人 墨西哥松绿 #0B6E4F / AI 美队深藏蓝 #13294B
             *            金 = #C6A04A / #ECCB6E，作金底线 / AI 左轨金 trim / 名字铭牌 / 徽章金箔
             *   signature 右下角经典足球(::before, 静止淡角标, hover 踢球进球)坐同色「角落聚光」色晕
             *            + 金色底边线；近白卡 + 柔和景深阴影(浮起感) + 4px 珠宝色左轨；引用块=球门造型
             *   type     AI/Bot 名字=金箔铭牌：字距 +0.04em + 金属金流光（--octo-hue 每帧重绘）
             * 仅重塑「消息相关面」，侧栏/会话跟随浅色 base；worldcup 选择器带 body[attr] 覆盖基础 light。
             * =================================================================== */
            body[data-octo-skin="worldcup"] {
                /* 经典足球 SVG（navy 描边 + 填充五边形）；透明度交给 ::before 控制，以便 hover 踢球动画 */
                --octo-ball: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2064%2064'%3E%3Cg%20fill='%2313294b'%20stroke='%2313294b'%20stroke-width='2'%20stroke-linejoin='round'%3E%3Ccircle%20cx='32'%20cy='32'%20r='29'%20fill='none'/%3E%3Cpolygon%20points='32,21%2040.6,27.2%2037.3,37.4%2026.7,37.4%2023.4,27.2'/%3E%3Cg%20fill='none'%3E%3Cpath%20d='M32%2021V7'/%3E%3Cpath%20d='M40.6%2027.2L53.4%2022.8'/%3E%3Cpath%20d='M37.3%2037.4L45.5%2050.6'/%3E%3Cpath%20d='M26.7%2037.4L18.5%2050.6'/%3E%3Cpath%20d='M23.4%2027.2L10.6%2022.8'/%3E%3C/g%3E%3Cpolygon%20points='32,4%2042,8%2040.6,18.5%2023.4,18.5%2022,8'/%3E%3Cpolygon%20points='55,20%2059,31%2050,38%2042.5,28.5%2049,21'/%3E%3Cpolygon%20points='47,52%2036,57%2031,47%2040,40%2049,45'/%3E%3Cpolygon%20points='17,52%205,45%2014,40%2023,47%2018,57'/%3E%3Cpolygon%20points='9,20%2015,21%2021.5,28.5%2014,38%205,31'/%3E%3C/g%3E%3C/svg%3E");
                /* 装饰层：仅金色底边线（足球移到 ::before 以便缓静 + hover 踢球动画） */
                --octo-deco:
                    linear-gradient(rgba(198,160,74,0.6), rgba(198,160,74,0.6)) no-repeat left bottom / 100% 1px;
            }
            /* 公共：近白卡 + 柔和景深(替代基础 drop-shadow) + 圆角 + 过渡(含 box-shadow)
             * min-width：短文本(如「收到」「OK」)也留出宽度，让右下角足球有独立右侧车道、不压文字 */
            body[data-octo-skin="worldcup"] .wk-msg-row:has(.ai-badge) .wk-markdown,
            body[data-octo-skin="worldcup"] .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown,
            body[data-octo-skin="worldcup"] .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown,
            body[data-octo-skin="worldcup"] .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown,
            body[data-octo-skin="worldcup"] .wk-fold-msg-text {
                filter: none !important;
                border-radius: 12px !important;
                min-width: 100px !important;
                transition: background .15s ease, box-shadow .15s ease, transform .15s ease !important;
            }
            /* 名字金属流光：限定金/琥珀色相小幅摆动(每帧变色才会在 background-clip:text 下重绘) */
            @keyframes octo-name-wc {
                0%   { --octo-hue: 0deg;  background-position: 0% center; }
                50%  { --octo-hue: 14deg; }
                100% { --octo-hue: 0deg;  background-position: -200% center; }
            }

            /* ---- 三档 accent → 主办国珠宝深调（驱动左条 / 引用块条等）---- */
            body[data-octo-skin="worldcup"] .wk-msg-row:has(.ai-badge),
            body[data-octo-skin="worldcup"] .wk-msg-row--continue[data-ai-continue="true"] { --octo-accent: #13294B !important; }
            body[data-octo-skin="worldcup"] .wk-msg-row--send:not(:has(.ai-badge)) { --octo-accent: #C8102E !important; }
            body[data-octo-skin="worldcup"] .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) { --octo-accent: #0B6E4F !important; }

            /* ---- AI 气泡（含连续）+ 折叠气泡：近白卡 + 藏蓝左轨 + 金内嵌 trim + 角落足球聚光 ---- */
            body[data-octo-skin="worldcup"] .wk-msg-row:has(.ai-badge) .wk-markdown,
            body[data-octo-skin="worldcup"] .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown,
            body[data-octo-skin="worldcup"] .wk-fold-msg-text {
                --octo-bg: #ffffff !important;
                --octo-accent: #13294B !important;
                background:
                    var(--octo-deco),
                    radial-gradient(70% 70% at 100% 100%, rgba(19,41,75,0.13) 0%, transparent 62%),
                    linear-gradient(180deg, #ffffff 0%, #fdfbf7 100%) !important;
                border: 1px solid #EAE3D6 !important;
                border-left: 4px solid #13294B !important;
                box-shadow: inset 5px 0 0 -3px rgba(198,160,74,0.75), 0 1px 2px rgba(30,30,50,0.07), 0 8px 20px rgba(30,30,50,0.06) !important;
                color: #181818 !important;
            }
            body[data-octo-skin="worldcup"] .wk-msg-row:has(.ai-badge) .wk-markdown:hover,
            body[data-octo-skin="worldcup"] .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown:hover,
            body[data-octo-skin="worldcup"] .wk-fold-msg-text:hover {
                background:
                    var(--octo-deco),
                    radial-gradient(70% 70% at 100% 100%, rgba(19,41,75,0.18) 0%, transparent 62%),
                    linear-gradient(180deg, #ffffff 0%, #fdfbf7 100%) !important;
                transform: translateY(-2px) !important;
                box-shadow: inset 5px 0 0 -3px rgba(198,160,74,0.9), 0 4px 12px rgba(19,41,75,0.16), 0 16px 34px rgba(19,41,75,0.16) !important;
            }

            /* ---- 自己发送：Old Glory 深红 + 角落足球聚光 ---- */
            body[data-octo-skin="worldcup"] .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown {
                --octo-bg: #ffffff !important;
                --octo-accent: #C8102E !important;
                background:
                    var(--octo-deco),
                    radial-gradient(70% 70% at 100% 100%, rgba(200,16,46,0.12) 0%, transparent 62%),
                    linear-gradient(180deg, #ffffff 0%, #fdfbf7 100%) !important;
                border: 1px solid #EFDDD9 !important;
                border-left: 4px solid #C8102E !important;
                box-shadow: 0 1px 2px rgba(30,30,50,0.07), 0 8px 20px rgba(30,30,50,0.06) !important;
                color: #181818 !important;
            }
            body[data-octo-skin="worldcup"] .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown:hover {
                background:
                    var(--octo-deco),
                    radial-gradient(70% 70% at 100% 100%, rgba(200,16,46,0.17) 0%, transparent 62%),
                    linear-gradient(180deg, #ffffff 0%, #fdfbf7 100%) !important;
                transform: translateY(-2px) !important;
                box-shadow: 0 4px 12px rgba(200,16,46,0.15), 0 16px 34px rgba(200,16,46,0.14) !important;
            }
            body[data-octo-skin="worldcup"] .wk-msg-row--send:not(:has(.ai-badge)) .wk-msg-row-sender { color: #C8102E !important; letter-spacing: 0.02em !important; }

            /* ---- 他人：墨西哥松绿 + 角落足球聚光 ---- */
            body[data-octo-skin="worldcup"] .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown {
                --octo-bg: #ffffff !important;
                --octo-accent: #0B6E4F !important;
                background:
                    var(--octo-deco),
                    radial-gradient(70% 70% at 100% 100%, rgba(11,110,79,0.12) 0%, transparent 62%),
                    linear-gradient(180deg, #ffffff 0%, #fdfbf7 100%) !important;
                border: 1px solid #DCE8E1 !important;
                border-left: 4px solid #0B6E4F !important;
                box-shadow: 0 1px 2px rgba(30,30,50,0.07), 0 8px 20px rgba(30,30,50,0.06) !important;
                color: #181818 !important;
            }
            body[data-octo-skin="worldcup"] .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown:hover {
                background:
                    var(--octo-deco),
                    radial-gradient(70% 70% at 100% 100%, rgba(11,110,79,0.17) 0%, transparent 62%),
                    linear-gradient(180deg, #ffffff 0%, #fdfbf7 100%) !important;
                transform: translateY(-2px) !important;
                box-shadow: 0 4px 12px rgba(11,110,79,0.15), 0 16px 34px rgba(11,110,79,0.14) !important;
            }
            body[data-octo-skin="worldcup"] .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-msg-row-sender { color: #0B6E4F !important; letter-spacing: 0.02em !important; }

            /* ---- 角落足球：静止时淡角标(不旋转, 避免满屏都在动)；接管 ::before(原赛博角标作废) ---- */
            body[data-octo-skin="worldcup"] .wk-msg-row:has(.ai-badge) .wk-markdown::before,
            body[data-octo-skin="worldcup"] .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown::before,
            body[data-octo-skin="worldcup"] .wk-fold-msg-text::before,
            body[data-octo-skin="worldcup"] .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown::before,
            body[data-octo-skin="worldcup"] .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown::before {
                content: "" !important;
                position: absolute !important;
                top: auto !important; left: auto !important;
                right: 10px !important; bottom: 8px !important;
                width: 32px !important; height: 32px !important;
                background: var(--octo-ball) center / contain no-repeat !important;
                opacity: 0.18 !important;
                pointer-events: none !important;
                z-index: 2 !important;
                transform-origin: 50% 50% !important;
                transition: opacity .18s ease !important;
            }
            /* ---- hover：一脚把球踢起——更高更丝滑(上升渐缓→顶点→下落渐快→落地进球金光, 一次性) ---- */
            body[data-octo-skin="worldcup"] .wk-msg-row:has(.ai-badge) .wk-markdown:hover::before,
            body[data-octo-skin="worldcup"] .wk-msg-row--continue[data-ai-continue="true"] .wk-markdown:hover::before,
            body[data-octo-skin="worldcup"] .wk-fold-msg-text:hover::before,
            body[data-octo-skin="worldcup"] .wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown:hover::before,
            body[data-octo-skin="worldcup"] .wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown:hover::before {
                background-size: contain !important;
                opacity: 0.8 !important;
                animation: octo-ball-goal 1.15s linear 1 !important;
            }
            /* 踢球进球：起脚上升渐缓 → 顶点(蹬起 36px + 略放大) → 下落渐快 → 落地一圈金色微光 → 淡出。
             * 逐段 animation-timing-function 模拟自然重力, 比单一 ease 更丝滑。 */
            @keyframes octo-ball-goal {
                0%   { transform: rotate(0deg)   translateY(0)     scale(1);    filter: none; animation-timing-function: cubic-bezier(.25, .55, .3, 1); }
                44%  { transform: rotate(260deg) translateY(-36px) scale(1.18); filter: none; animation-timing-function: cubic-bezier(.5, 0, .7, .45); }
                80%  { transform: rotate(490deg) translateY(0)     scale(1);    filter: drop-shadow(0 0 9px rgba(230, 200, 110, 0.95)); animation-timing-function: ease-out; }
                100% { transform: rotate(560deg) translateY(0)     scale(1);    filter: drop-shadow(0 0 0 rgba(230, 200, 110, 0)); }
            }
            @media (prefers-reduced-motion: reduce) {
                body[data-octo-skin="worldcup"] .wk-markdown:hover::before,
                body[data-octo-skin="worldcup"] .wk-fold-msg-text:hover::before { animation: none !important; }
            }
            /* ---- 收起态(长消息 clamp 未展开)：底部有「展开全文 ▾」渐隐蒙层(::after)，
             *      此时藏掉角落足球(::before)，避免与蒙层/文案叠在右下角显乱；展开后自动恢复 ---- */
            body[data-octo-skin="worldcup"] .wk-markdown.octo-clamp:not(.octo-expanded)::before,
            body[data-octo-skin="worldcup"] .wk-fold-msg-text.octo-clamp:not(.octo-expanded)::before {
                display: none !important;
            }

            /* ---- 正文 / 段落 / 列表：暖纸上暖墨字 ---- */
            body[data-octo-skin="worldcup"] .wk-msg-text-content,
            body[data-octo-skin="worldcup"] .wk-fold-msg-text,
            body[data-octo-skin="worldcup"] .wk-markdown,
            body[data-octo-skin="worldcup"] .wk-markdown :is(p, li, blockquote, h1, h2, h3, h4, h5, h6),
            body[data-octo-skin="worldcup"] .wk-fold-msg-text :is(p, li, blockquote, h1, h2, h3, h4, h5, h6) {
                color: #1C1B19 !important;
            }
            /* 链接藏蓝、行内代码暖纸 chip */
            body[data-octo-skin="worldcup"] .wk-markdown a,
            body[data-octo-skin="worldcup"] .wk-fold-msg-text a { color: #13294B !important; }
            body[data-octo-skin="worldcup"] .wk-markdown code,
            body[data-octo-skin="worldcup"] .wk-fold-msg-text code {
                background: rgba(28, 27, 25, 0.05) !important;
                color: #1C1B19 !important;
                border: 1px solid rgba(28, 27, 25, 0.10) !important;
            }

            /* ---- AI/Bot 名字：金箔铭牌（字距 + 金属金流光；--octo-hue 每帧变色才会重绘）---- */
            body[data-octo-skin="worldcup"] .wk-msg-row:has(.ai-badge) .wk-msg-row-sender,
            body[data-octo-skin="worldcup"] .wk-fold-msg-name,
            body[data-octo-skin="worldcup"] .wk-bot-detail-name {
                letter-spacing: 0.04em !important;
                background: linear-gradient(95deg,
                    hsl(calc(40deg + var(--octo-hue)), 58%, 38%),
                    hsl(calc(45deg + var(--octo-hue)), 72%, 64%),
                    hsl(calc(40deg + var(--octo-hue)), 58%, 38%)) !important;
                background-size: 200% auto !important;
                -webkit-background-clip: text !important;
                background-clip: text !important;
                -webkit-text-fill-color: transparent !important;
                color: transparent !important;
            }
            /* 性能：世界杯名字同样平时静态、仅 hover 才流光 */
            body[data-octo-skin="worldcup"] .wk-msg-row:has(.ai-badge):hover .wk-msg-row-sender,
            body[data-octo-skin="worldcup"] .wk-fold-msg-name:hover,
            body[data-octo-skin="worldcup"] .wk-bot-detail-modal:hover .wk-bot-detail-name {
                animation: octo-name-wc 4s linear infinite !important;
            }
            @media (prefers-reduced-motion: reduce) {
                body[data-octo-skin="worldcup"] .wk-msg-row:has(.ai-badge) .wk-msg-row-sender,
                body[data-octo-skin="worldcup"] .wk-fold-msg-name,
                body[data-octo-skin="worldcup"] .wk-bot-detail-name,
                body[data-octo-skin="worldcup"] .wk-msg-row:has(.ai-badge):hover .wk-msg-row-sender,
                body[data-octo-skin="worldcup"] .wk-fold-msg-name:hover,
                body[data-octo-skin="worldcup"] .wk-bot-detail-modal:hover .wk-bot-detail-name { animation: none !important; }
            }
            /* ---- AI 徽章：金箔（带高光内嵌，含折叠名 ::after 徽章、bot 卡徽章）---- */
            body[data-octo-skin="worldcup"] .wk-msg-row:has(.ai-badge) .ai-badge,
            body[data-octo-skin="worldcup"] .wk-bot-detail-name .ai-badge {
                background: linear-gradient(160deg, #E8C56B 0%, #B68A2E 55%, #9A6E2E 100%) !important;
                color: #2A2206 !important;
                -webkit-text-fill-color: #2A2206 !important;   /* 覆盖基础规则的 #fff，否则金底白字糊 */
                box-shadow: inset 0 1px 0 rgba(255, 244, 214, 0.6), 0 1px 2px rgba(120, 90, 20, 0.35) !important;
            }
            body[data-octo-skin="worldcup"] .wk-fold-msg-name::after {
                background: linear-gradient(160deg, #E8C56B 0%, #B68A2E 55%, #9A6E2E 100%) !important;
                color: #2A2206 !important;
                -webkit-text-fill-color: #2A2206 !important;
            }

            /* ---- 世界杯下 Bot 卡「内胆」世界杯化：banner 绿茵球场 + 暖纸金面板 + 金按钮（卡框/流光/3D 仍是基础层）---- */
            /* 头部 → 方案B「悬浮完整头像」：上部深场球场渐变 banner，头像 contain 居中悬浮(完整不裁)，
             * 名字/@handle 落到 banner 下白底左对齐；状态 chip 隐藏。 */
            body[data-octo-skin="worldcup"] .wk-bot-detail-header {
                position: relative !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: flex-start !important;
                padding: 0 !important;
                margin: 0 0 6px !important;
                overflow: visible !important;
            }
            /* banner：深绿球场 → 夜蓝渐变(全宽出血)，托住悬浮头像，底部金色底线 */
            body[data-octo-skin="worldcup"] .wk-bot-detail-header::before {
                content: "" !important;
                position: absolute !important;
                top: 0 !important;
                left: -22px !important;
                right: -22px !important;
                bottom: auto !important;
                height: 176px !important;
                background:
                    radial-gradient(70% 90% at 50% 30%, rgba(255,216,130,0.28), transparent 60%),
                    radial-gradient(130% 100% at 50% 0%, #1d7a54 0%, #0f4374 55%, #0a2a52 100%) !important;
                border-radius: 16px 16px 0 0 !important;
                box-shadow: inset 0 -3px 0 0 rgba(198,160,74,0.95) !important;
                z-index: 0 !important;
                animation: none !important;
            }
            /* banner 金色 refractor 镀铬光(screen 提亮) */
            body[data-octo-skin="worldcup"] .wk-bot-detail-header::after {
                content: "" !important;
                position: absolute !important;
                top: 0 !important;
                left: -22px !important;
                right: -22px !important;
                bottom: auto !important;
                height: 176px !important;
                background:
                    repeating-linear-gradient(116deg, transparent 0 7px, rgba(255,240,200,0.10) 7px 8px),
                    radial-gradient(120% 80% at 74% 8%, rgba(255,220,130,0.30), transparent 55%) !important;
                border-radius: 16px 16px 0 0 !important;
                mix-blend-mode: screen !important;
                pointer-events: none !important;
                z-index: 0 !important;
                animation: none !important;
            }
            /* 头像 → 居中悬浮、完整展示(contain 零裁切)。固定 150×150 白底金边方框：
             * 无论头像原始比例如何，方框尺寸恒定 → 各卡头像方块大小一致(正方形填满、非方形框内留白)。 */
            body[data-octo-skin="worldcup"] .wk-bot-detail-avatar {
                position: relative !important;
                z-index: 1 !important;
                align-self: center !important;
                width: 150px !important;
                height: 150px !important;
                margin: 16px 0 0 !important;
                border-radius: 16px !important;
                overflow: hidden !important;
                background: #fff !important;
                box-shadow:
                    0 0 0 3px rgba(255,255,255,0.92),
                    0 0 0 4px rgba(198,160,74,0.95),
                    0 10px 22px rgba(0,0,0,0.42) !important;
            }
            body[data-octo-skin="worldcup"] .wk-bot-detail-avatar > *,
            body[data-octo-skin="worldcup"] .wk-bot-detail-avatar .wk-avatar,
            body[data-octo-skin="worldcup"] .wk-bot-detail-avatar .semi-image,
            body[data-octo-skin="worldcup"] .wk-bot-detail-avatar .semi-image-img,
            body[data-octo-skin="worldcup"] .wk-bot-detail-avatar img {
                width: 100% !important;
                height: 100% !important;
                border-radius: 14px !important;
                object-fit: contain !important;
                object-position: center !important;
            }
            /* 名字 → 落到 banner 下白底，左对齐斜体铭牌(金流光继承基础世界杯规则) */
            body[data-octo-skin="worldcup"] .wk-bot-detail-name {
                position: static !important;
                align-self: flex-start !important;
                margin: 16px 0 0 !important;
                font-size: 22px !important;
                font-weight: 800 !important;
                font-style: italic !important;
                letter-spacing: 0.04em !important;
            }
            /* @handle → 蓝位置条，名字下方 */
            body[data-octo-skin="worldcup"] .wk-bot-detail-id {
                position: static !important;
                align-self: flex-start !important;
                margin: 6px 0 0 !important;
                padding: 3px 12px !important;
                border-radius: 6px !important;
                background: linear-gradient(90deg, #123a86, #1e56b0) !important;
                color: #eaf1ff !important;
                font-weight: 700 !important;
                letter-spacing: 0.05em !important;
            }
            /* 状态 chip（🔌 未上报 Agent 信息 + ?）不展示 */
            body[data-octo-skin="worldcup"] .wk-bot-detail-octopush-chip { display: none !important; }
            /* 信息面板：赛博切角 HUD → 暖纸卡 + 金左条 */
            body[data-octo-skin="worldcup"] .wk-bot-detail-desc,
            body[data-octo-skin="worldcup"] .wk-bot-detail-commands {
                background: #FBF8F0 !important;
                border: 1px solid #EBE1CC !important;
                border-radius: 10px !important;
                clip-path: none !important;
                color: #1C1B19 !important;
            }
            body[data-octo-skin="worldcup"] .wk-bot-detail-desc::before,
            body[data-octo-skin="worldcup"] .wk-bot-detail-commands::before {
                background: linear-gradient(180deg, #C6A04A, #8a6a24) !important;
                box-shadow: none !important;
                width: 3px !important;
            }
            /* 标签 // HUD → 去前缀 + 金 chip */
            body[data-octo-skin="worldcup"] .wk-bot-detail-label {
                color: #8a6a24 !important;
                background: rgba(198, 160, 74, 0.16) !important;
                clip-path: none !important;
                border-radius: 4px !important;
            }
            body[data-octo-skin="worldcup"] .wk-bot-detail-label::before { content: "" !important; }
            /* 命令名 / 编辑入口：赛博青 → 松绿 */
            body[data-octo-skin="worldcup"] .wk-bot-detail-cmd-name,
            body[data-octo-skin="worldcup"] .wk-bot-detail-edit-action,
            body[data-octo-skin="worldcup"] .wk-bot-detail-value-edit { color: #0B6E4F !important; }
            body[data-octo-skin="worldcup"] .wk-bot-detail-cmd-desc { color: #5b5344 !important; }
            /* 发送键：品牌紫 → 金箔 + 深字 */
            body[data-octo-skin="worldcup"] .wk-bot-detail-modal .semi-button-block.semi-button-primary:not(.wk-bot-detail-manage-btn):not(.wk-bot-detail-claw-btn) {
                background: linear-gradient(120deg, #E8C56B, #C6A04A) !important;
                color: #1C1B19 !important;
                box-shadow: 0 6px 16px rgba(160, 120, 20, 0.35) !important;
            }
            /* 关闭键：深绿 banner 上 → 白色可见 */
            body[data-octo-skin="worldcup"] .wk-bot-detail-modal .semi-modal-close,
            body[data-octo-skin="worldcup"] .wk-bot-detail-modal .semi-modal-close .semi-icon,
            body[data-octo-skin="worldcup"] .wk-bot-detail-modal .semi-modal-close svg {
                color: #ffffff !important;
                fill: #ffffff !important;
            }

            /* ---- 世界杯 Bot 卡改版：圆形头像 + 备注/简介合成大框 + 创建者移到底部作署名 ----
             * 字段由 JS 按标签文字打 data-octo-field / data-octo-group 标记(见 tagBotDetailFields)，
             * 排序用 flex order(不搬 DOM，避免干扰 React)。 */
            body[data-octo-skin="worldcup"] .wk-bot-detail-content {
                display: flex !important;
                flex-direction: column !important;
            }
            body[data-octo-skin="worldcup"] .wk-bot-detail-header { order: 0 !important; }
            /* 圆形头像遮罩(保持 150 尺寸；白金环随之变圆) */
            body[data-octo-skin="worldcup"] .wk-bot-detail-avatar { border-radius: 50% !important; }
            body[data-octo-skin="worldcup"] .wk-bot-detail-avatar > *,
            body[data-octo-skin="worldcup"] .wk-bot-detail-avatar .wk-avatar,
            body[data-octo-skin="worldcup"] .wk-bot-detail-avatar .semi-image,
            body[data-octo-skin="worldcup"] .wk-bot-detail-avatar .semi-image-img,
            body[data-octo-skin="worldcup"] .wk-bot-detail-avatar img {
                border-radius: 50% !important;
                object-fit: cover !important;    /* 圆形头像用 cover 填满 */
            }
            /* 面板霓虹左条去掉(避免大框里出现多条竖线) */
            body[data-octo-skin="worldcup"] .wk-bot-detail-desc::before,
            body[data-octo-skin="worldcup"] .wk-bot-detail-commands::before { display: none !important; }
            /* 备注/简介等「非创建者」字段 → 合成一个大框(连续面板拼接) */
            body[data-octo-skin="worldcup"] .wk-bot-detail-desc:not([data-octo-field="creator"]) {
                order: 1 !important;
                margin: 0 !important;
                border-radius: 0 !important;
                border-left: 1px solid #EBE1CC !important;
                border-right: 1px solid #EBE1CC !important;
                border-top: none !important;
                border-bottom: none !important;
                background: #FBF8F0 !important;
            }
            /* 大框顶(第一项)：上圆角 + 上边框 + 组上间距 */
            body[data-octo-skin="worldcup"] .wk-bot-detail-desc[data-octo-group="first"],
            body[data-octo-skin="worldcup"] .wk-bot-detail-desc[data-octo-group="solo"] {
                border-top: 1px solid #EBE1CC !important;
                border-radius: 12px 12px 0 0 !important;
                margin-top: 4px !important;
            }
            /* 中段/末项：顶部加分隔线 */
            body[data-octo-skin="worldcup"] .wk-bot-detail-desc[data-octo-group="mid"],
            body[data-octo-skin="worldcup"] .wk-bot-detail-desc[data-octo-group="last"] {
                border-top: 1px solid #EFE7D2 !important;
            }
            /* 大框底(末项)：下圆角 + 下边框 */
            body[data-octo-skin="worldcup"] .wk-bot-detail-desc[data-octo-group="last"] {
                border-bottom: 1px solid #EBE1CC !important;
                border-radius: 0 0 12px 12px !important;
            }
            /* 只有一项时(solo)：四边成框 */
            body[data-octo-skin="worldcup"] .wk-bot-detail-desc[data-octo-group="solo"] {
                border-bottom: 1px solid #EBE1CC !important;
                border-radius: 12px !important;
            }
            /* 命令面板单独一块，排在大框下、按钮上 */
            body[data-octo-skin="worldcup"] .wk-bot-detail-commands { order: 2 !important; margin-top: 12px !important; }
            /* 发送/添加好友按钮排大框(及命令)下方 */
            body[data-octo-skin="worldcup"] .wk-bot-detail-modal .semi-button-block:not(.wk-bot-detail-manage-btn):not(.wk-bot-detail-claw-btn) {
                order: 3 !important;
            }
            /* 创建者 → 最底部作者署名(小字、居中、无框) */
            body[data-octo-skin="worldcup"] .wk-bot-detail-desc[data-octo-field="creator"] {
                order: 5 !important;
                margin: 12px 0 2px !important;
                padding: 0 !important;
                border: none !important;
                background: transparent !important;
                clip-path: none !important;
                text-align: center !important;
                font-size: 12px !important;
                color: #8a7a52 !important;
                display: flex !important;
                justify-content: center !important;
                align-items: baseline !important;
                gap: 6px !important;
            }
            body[data-octo-skin="worldcup"] .wk-bot-detail-desc[data-octo-field="creator"] .wk-bot-detail-label {
                background: transparent !important;
                color: #b0a074 !important;
                padding: 0 !important;
                margin: 0 !important;
                font-size: 11px !important;
                letter-spacing: 0.06em !important;
            }

            /* ---- 引用块 → 球门：accent 门框(横梁+门柱) + 淡菱形网；hover 踢球时球门网抖动(进球入网)联动 ---- */
            body[data-octo-skin="worldcup"] .wk-msg-row .wk-reply-block,
            body[data-octo-skin="worldcup"] .wk-msg-row .wk-message-text-reply {
                border-left: 2px solid var(--octo-accent, #13294B) !important;
                border-right: 2px solid var(--octo-accent, #13294B) !important;
                border-top: 3px solid var(--octo-accent, #13294B) !important;
                border-radius: 4px 4px 0 0 !important;
                padding: 7px 12px 6px 12px !important;
                margin-bottom: 5px !important;
                background:
                    repeating-linear-gradient(45deg,  transparent 0 6px, rgba(20, 25, 40, 0.05) 6px 6.8px),
                    repeating-linear-gradient(-45deg, transparent 0 6px, rgba(20, 25, 40, 0.05) 6px 6.8px) !important; /* 菱形球门网 */
                transform-origin: 50% 0 !important;   /* 横梁固定, 网往下鼓 */
            }
            body[data-octo-skin="worldcup"] .wk-msg-row .wk-reply-block__name,
            body[data-octo-skin="worldcup"] .wk-msg-row .wk-message-text-reply-authorname { color: #1C1B19 !important; }
            body[data-octo-skin="worldcup"] .wk-msg-row .wk-reply-block__digest,
            body[data-octo-skin="worldcup"] .wk-msg-row .wk-message-text-reply-content { color: #6E675A !important; }
            /* hover 踢球 → 球门网抖动(球进网)；延迟 0.52s 与球升到球门高度同步(若引用块不在 .wk-markdown 内则仅静态球门, 不影响) */
            body[data-octo-skin="worldcup"] .wk-markdown:hover .wk-reply-block,
            body[data-octo-skin="worldcup"] .wk-markdown:hover .wk-message-text-reply {
                animation: octo-net-ripple 0.55s ease-out 0.52s 1 !important;
            }
            @keyframes octo-net-ripple {
                0%   { transform: scaleY(1)    skewX(0deg); }
                28%  { transform: scaleY(1.10) skewX(-2deg); }
                55%  { transform: scaleY(0.97) skewX(1.2deg); }
                78%  { transform: scaleY(1.03) skewX(-0.6deg); }
                100% { transform: scaleY(1)    skewX(0deg); }
            }
            @media (prefers-reduced-motion: reduce) {
                body[data-octo-skin="worldcup"] .wk-markdown:hover .wk-reply-block,
                body[data-octo-skin="worldcup"] .wk-markdown:hover .wk-message-text-reply { animation: none !important; }
            }
        `;
        document.head.appendChild(style);

        try {
            if (!CSS.supports || !CSS.supports('selector(:has(*))')) {
                console.warn(TAG, '当前内核不支持 :has()，AI / 人类消息样式可能不生效（折叠消息样式不受影响）。');
            }
        } catch { /* noop */ }

        console.log(TAG, VERSION, '样式已加载');
    }

    /* ============================================================
     * 1.5) 暗色主题切换（浮动按钮 + 持久化 + 与原生 theme-mode 联动）
     *   - 暗色变体 CSS 统一 scope 在 body[theme-mode="dark"] 下，与原生暗色同一开关，
     *     故切换只需设/移除该属性：原生界面(侧栏/会话/聊天/输入框)与脚本元素一起变暗。
     *   - app 启动会强制亮色(WKApp.themeMode=light → 移除 body[theme-mode])，
     *     因此在按钮点击 / 启动 / observer / sync 中按存储选择「重申」，赢得竞争。
     *   - 默认亮色；选择记在 localStorage('octo-ai-theme')。@grant none，故用 localStorage。
     * ========================================================== */
    const THEME_KEY = 'octo-ai-theme';      // 复用旧键；旧版仅存 'light'/'dark'，新版存主题 id（读取时迁移）
    const TOGGLE_ID = 'octo-theme-toggle';
    const MENU_ID = 'octo-theme-menu';
    const DEFAULT_THEME = 'cyber-light';

    // 主题注册表（扁平列表，方便后续扩展）：
    //   base → 驱动 body[theme-mode]（light/dark，联动 app 原生暗色 + 脚本暗色变体）
    //   skin → 驱动 body[data-octo-skin]（消息皮肤覆盖，与 base 正交；'' 表示无皮肤）
    const THEMES = [
        { id: 'cyber-light', label: '赛博紫 · 亮', icon: '☀️',  base: 'light', skin: '' },
        { id: 'cyber-dark',  label: '赛博紫 · 暗', icon: '\u{1F319}',     base: 'dark',  skin: '' },
        { id: 'worldcup',    label: '美加墨世界杯', icon: '\u{1F3C6}',     base: 'light', skin: 'worldcup' },
    ];
    function themeById(id) {
        for (const t of THEMES) { if (t.id === id) return t; }
        return THEMES[0];
    }
    // 读取已存主题 id，并迁移旧版二元值（'light'→cyber-light，'dark'→cyber-dark）
    function storedThemeId() {
        let v = null;
        try { v = localStorage.getItem(THEME_KEY); } catch { v = null; }
        if (!v) return DEFAULT_THEME;
        if (v === 'light') return 'cyber-light';
        if (v === 'dark') return 'cyber-dark';
        return themeById(v).id === v ? v : DEFAULT_THEME;
    }
    function setStoredThemeId(id) {
        try { localStorage.setItem(THEME_KEY, id); } catch { /* 隐私模式等忽略 */ }
    }
    // 把主题落到 body 属性：base→[theme-mode]、skin→[data-octo-skin]（幂等，仅在不一致时动作）
    function reflectTheme(id) {
        const body = document.body;
        if (!body) return;
        const t = themeById(id);
        if (t.base === 'dark') {
            if (body.getAttribute('theme-mode') !== 'dark') body.setAttribute('theme-mode', 'dark');
        } else if (body.getAttribute('theme-mode') === 'dark') {
            body.removeAttribute('theme-mode');
        }
        if (t.skin) {
            if (body.getAttribute('data-octo-skin') !== t.skin) body.setAttribute('data-octo-skin', t.skin);
        } else if (body.hasAttribute('data-octo-skin')) {
            body.removeAttribute('data-octo-skin');
        }
    }
    function updateToggleUI(btn, id) {
        if (!btn) return;
        const t = themeById(id);
        btn.title = '主题：' + t.label + '（点击切换）';
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', document.getElementById(MENU_ID) ? 'true' : 'false');
        btn.innerHTML = '<span class="octo-tt-ico">' + t.icon + '</span>';
    }
    function applyTheme(id) {
        reflectTheme(id);
        updateToggleUI(document.getElementById(TOGGLE_ID), id);
    }

    /* ---- 主题选择弹出菜单（点击图标弹出，可勾选当前；点击外部 / Esc 关闭） ---- */
    let menuOutsideHandler = null;
    let menuKeyHandler = null;
    function closeMenu() {
        const menu = document.getElementById(MENU_ID);
        if (menu) menu.remove();
        if (menuOutsideHandler) { document.removeEventListener('mousedown', menuOutsideHandler, true); menuOutsideHandler = null; }
        if (menuKeyHandler) { document.removeEventListener('keydown', menuKeyHandler, true); menuKeyHandler = null; }
        const btn = document.getElementById(TOGGLE_ID);
        if (btn) btn.setAttribute('aria-expanded', 'false');
    }
    function selectTheme(id) {
        setStoredThemeId(id);
        applyTheme(id);
        closeMenu();
    }
    function openMenu() {
        const btn = document.getElementById(TOGGLE_ID);
        if (!btn) return;
        if (document.getElementById(MENU_ID)) { closeMenu(); return; }   // 再次点击收起
        const current = storedThemeId();
        const menu = document.createElement('div');
        menu.id = MENU_ID;
        menu.setAttribute('role', 'menu');
        menu.innerHTML = THEMES.map(t => {
            const on = t.id === current;
            return '<button type="button" class="octo-theme-menu__item' + (on ? ' is-active' : '') +
                '" role="menuitemradio" aria-checked="' + (on ? 'true' : 'false') +
                '" data-octo-theme-id="' + t.id + '">' +
                '<span class="octo-theme-menu__ico">' + t.icon + '</span>' +
                '<span class="octo-theme-menu__label">' + t.label + '</span>' +
                '<span class="octo-theme-menu__check">' + (on ? '✓' : '') + '</span>' +
                '</button>';
        }).join('');
        document.body.appendChild(menu);
        // 锚定到按钮右侧上沿（navrail 在最左）；超出视口底部则上贴
        const r = btn.getBoundingClientRect();
        menu.style.left = Math.round(r.right + 8) + 'px';
        menu.style.top = Math.round(r.top) + 'px';
        const mr = menu.getBoundingClientRect();
        if (mr.bottom > window.innerHeight - 8) {
            menu.style.top = Math.max(8, Math.round(window.innerHeight - 8 - mr.height)) + 'px';
        }
        menu.addEventListener('click', (e) => {
            const item = e.target.closest && e.target.closest('[data-octo-theme-id]');
            if (item) selectTheme(item.getAttribute('data-octo-theme-id'));
        });
        menuOutsideHandler = (e) => {
            if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closeMenu();
        };
        menuKeyHandler = (e) => { if (e.key === 'Escape') closeMenu(); };
        document.addEventListener('mousedown', menuOutsideHandler, true);
        document.addEventListener('keydown', menuKeyHandler, true);
        btn.setAttribute('aria-expanded', 'true');
    }
    // 作为 NavRail 底部图标项，注入到「语言切换」正上方；navrail 未挂载则返回 null（由 sync 重试）
    function ensureThemeToggle() {
        const exist = document.getElementById(TOGGLE_ID);
        if (exist) return exist;
        closeMenu();   // navrail 被 React 重渲染清掉按钮时，关掉可能残留的菜单
        const bottom = document.querySelector('.wk-navrail__bottom');
        if (!bottom) return null;
        const btn = document.createElement('button');
        btn.id = TOGGLE_ID;
        btn.type = 'button';
        btn.className = 'wk-navrail__item';   // 复用原生导航项样式 → 融为一体
        btn.addEventListener('click', (e) => { e.stopPropagation(); openMenu(); });
        const lang = bottom.querySelector('.wk-navrail__language-wrap');
        if (lang) bottom.insertBefore(btn, lang);   // 置于语言切换正上方
        else bottom.insertBefore(btn, bottom.firstChild);
        updateToggleUI(btn, storedThemeId());
        return btn;
    }
    // 监听 body[theme-mode]：app 启动强制亮色会移除它 → 按存储主题重申（reflectTheme 幂等，无回环）
    let themeObserverBound = false;
    function watchThemeAttr() {
        if (themeObserverBound || !document.body) return;
        themeObserverBound = true;
        const mo = new MutationObserver(() => { reflectTheme(storedThemeId()); });
        mo.observe(document.body, { attributes: true, attributeFilter: ['theme-mode'] });
    }
    function startTheme() {
        applyTheme(storedThemeId());
        ensureThemeToggle();
        watchThemeAttr();
    }

    /* ============================================================
     * 2) 折叠会话：展开 + 定向防回收
     * ========================================================== */
    const TOGGLE_SEL = '.wk-fold-session-card-toggle';
    const watchedToggles = new WeakSet();

    function expandToggle(btn) {
        if (btn && btn.getAttribute('aria-expanded') === 'false') btn.click();
    }
    function expandAllFoldSessions() {
        document.querySelectorAll(TOGGLE_SEL + '[aria-expanded="false"]').forEach(expandToggle);
    }
    function watchToggle(btn) {
        if (watchedToggles.has(btn)) return;
        watchedToggles.add(btn);
        const mo = new MutationObserver(() => {
            if (btn.getAttribute('aria-expanded') === 'false') expandToggle(btn);
        });
        mo.observe(btn, { attributes: true, attributeFilter: ['aria-expanded'] });
    }
    function watchAllToggles() {
        document.querySelectorAll(TOGGLE_SEL).forEach(watchToggle);
    }

    /* ============================================================
     * 3) 标记 AI 连续消息（continue 行继承上一条的 AI 状态）
     * ========================================================== */
    function markAIContinueMessages() {
        const allRows = document.querySelectorAll('.wk-msg-row');
        let currentSenderIsAI = false;
        allRows.forEach(row => {
            if (row.classList.contains('wk-msg-row--continue')) {
                if (currentSenderIsAI && row.getAttribute('data-ai-continue') !== 'true') {
                    row.setAttribute('data-ai-continue', 'true');
                } else if (!currentSenderIsAI && row.getAttribute('data-ai-continue') === 'true') {
                    row.removeAttribute('data-ai-continue');
                }
            } else {
                currentSenderIsAI = !!row.querySelector('.ai-badge');
            }
        });
    }

    /* ============================================================
     * 4) 单条消息限高（幂等：稳态不产生 DOM 变更）
     * ========================================================== */
    const CLAMP_SEL = [
        '.wk-msg-row:has(.ai-badge) .wk-markdown',
        '.wk-msg-row--continue[data-ai-continue="true"] .wk-markdown',
        '.wk-msg-row--send:not(:has(.ai-badge)) .wk-markdown',
        '.wk-msg-row:not(.wk-msg-row--send):not(:has(.ai-badge)):not([data-ai-continue="true"]) .wk-markdown',
        '.wk-fold-msg-text',
    ].join(',');

    function applyClamp() {
        if (!CONFIG.enableClamp) return;
        // 读写分离：先一次性量完所有高度(集中触发一次重排)，再统一改 class；
        // 避免「读 scrollHeight → 改 class → 再读」交错导致的多次强制同步重排(布局抖动)。
        const measures = [];
        document.querySelectorAll(CLAMP_SEL).forEach(el => {
            // scrollHeight 在限高(overflow:hidden)下仍返回完整内容高度
            measures.push([el, el.scrollHeight]);
        });
        measures.forEach(([el, full]) => {
            const tall = full > CONFIG.clampHeight + 8;
            if (tall) {
                el.classList.add('octo-clamp');           // add 已存在则无变更
            } else {
                el.classList.remove('octo-clamp', 'octo-expanded');
            }
        });
    }

    /* ============================================================
     * 4.6) Bot 资料卡字段按标签文字打标记（data-octo-field / data-octo-group）
     *   供 CSS 稳定排版：备注/简介等收进一个大框、创建者移到底部作署名。
     *   按标签文字识别 → 与字段顺序/有无无关；只写变化了的属性（幂等，不制造多余变更）。
     * ========================================================== */
    function tagBotDetailFields() {
        document.querySelectorAll('.wk-bot-detail-content').forEach(content => {
            const descs = content.querySelectorAll(':scope > .wk-bot-detail-desc');
            const infoMembers = [];
            descs.forEach(desc => {
                const label = desc.querySelector('.wk-bot-detail-label');
                const t = label ? label.textContent.trim() : '';
                let kind = 'other';
                if (t.indexOf('创建者') === 0) kind = 'creator';
                else if (t.indexOf('备注') === 0) kind = 'remark';
                else if (t.indexOf('简介') === 0) kind = 'intro';
                if (desc.getAttribute('data-octo-field') !== kind) desc.setAttribute('data-octo-field', kind);
                if (kind !== 'creator') infoMembers.push(desc);
            });
            // 标记大框首尾/中段（连续面板的圆角与分隔线用）
            infoMembers.forEach((d, i) => {
                const pos = infoMembers.length === 1 ? 'solo'
                    : i === 0 ? 'first'
                    : i === infoMembers.length - 1 ? 'last'
                    : 'mid';
                if (d.getAttribute('data-octo-group') !== pos) d.setAttribute('data-octo-group', pos);
            });
        });
    }

    /* ============================================================
     * 4.7) 开卡「抽卡」：每次打开 bot 资料卡随机一个稀有度(宝可梦式档位)，
     *   写到 shell/content 的 data-octo-rarity；CSS 据此渲染角标配色 + 全息强度。
     *   加权：越稀越少。每张卡实例只抽一次(shell 已有则沿用)，关闭重开=新实例=重抽。
     * ========================================================== */
    const RARITY_TIERS = [
        { key: 'N',   w: 40 },   // 普通 银
        { key: 'R',   w: 30 },   // 稀有 蓝
        { key: 'SR',  w: 18 },   // 超稀有 紫
        { key: 'SSR', w: 9 },    // 特级 金
        { key: 'UR',  w: 3 },    // 极稀 彩虹
    ];
    function pickRarity() {
        const total = RARITY_TIERS.reduce((s, t) => s + t.w, 0);
        let r = Math.random() * total;
        for (let i = 0; i < RARITY_TIERS.length; i++) {
            r -= RARITY_TIERS[i].w;
            if (r < 0) return RARITY_TIERS[i].key;
        }
        return 'N';
    }
    function rollBotCardRarity() {
        document.querySelectorAll('.wk-bot-detail-modal .wk-modal-shell').forEach(shell => {
            let rar = shell.getAttribute('data-octo-rarity');
            if (!rar) {
                rar = pickRarity();
                shell.setAttribute('data-octo-rarity', rar);
                try { playGachaReveal(rar); } catch (e) { /* noop */ }   // 新卡 → 播揭晓动画
            }
            // 同步到 content(角标 ::after 用 attr() 取值)
            const content = shell.querySelector('.wk-bot-detail-content');
            if (content && content.getAttribute('data-octo-rarity') !== rar) {
                content.setAttribute('data-octo-rarity', rar);
            }
        });
    }
    // 抽卡揭晓全屏特效：SR 起中心闪光，SSR/UR 加放射光线，UR 彩虹光爆 + 亮片。
    // 注入到 <body>(在 React 弹窗树之外，避免被 reconcile 清掉)，1.3s 后自移除。低档不放，反衬高档。
    function playGachaReveal(rarity) {
        if (rarity !== 'SR' && rarity !== 'SSR' && rarity !== 'UR') return;
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const fx = document.createElement('div');
        fx.className = 'octo-gacha-fx';
        fx.setAttribute('data-octo-rarity', rarity);
        fx.innerHTML = '<div class="octo-gacha-flash"></div><div class="octo-gacha-rays"></div><div class="octo-gacha-spark"></div>';
        (document.body || document.documentElement).appendChild(fx);
        setTimeout(() => { fx.remove(); }, 1300);
    }

    // 点击限高气泡 → 展开 / 收起（避开链接、代码、图片等）
    let clickBound = false;
    function bindClicks() {
        if (clickBound) return;
        clickBound = true;
        document.addEventListener('click', (e) => {
            const clamp = e.target.closest && e.target.closest('.octo-clamp');
            if (clamp && !e.target.closest('a, button, code, pre, img')) {
                clamp.classList.toggle('octo-expanded');
            }
        }, true);
    }

    /* ============================================================
     * 5) 统一的 DOM 变更处理（debounce，消除抖动 / 回环）
     * ========================================================== */
    function debounce(fn, wait) {
        let t = null;
        return function () {
            if (t) clearTimeout(t);
            t = setTimeout(fn, wait);
        };
    }

    /* ============================================================
     * 4.5) Bot 资料卡「卡牌」3D 倾斜：pointermove 跟手倾斜（CSS 变量驱动 shell 的 rotateX/Y）
     *   - 卡框/流光/浮起是纯 CSS；此处只补「跟随鼠标的 3D 倾斜」。
     *   - reduced-motion 下不绑定；每个 shell 只绑一次（WeakSet）。
     * ========================================================== */
    const botTiltBound = new WeakSet();
    function bindBotCardTilt() {
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        document.querySelectorAll('.wk-bot-detail-modal .wk-modal-shell').forEach(el => {
            if (botTiltBound.has(el)) return;
            botTiltBound.add(el);
            el.addEventListener('pointermove', (e) => {
                const r = el.getBoundingClientRect();
                if (!r.width || !r.height) return;
                const px = (e.clientX - r.left) / r.width - 0.5;   // -0.5 ~ 0.5
                const py = (e.clientY - r.top) / r.height - 0.5;
                el.style.setProperty('--octo-card-ry', (px * 11).toFixed(2) + 'deg');   // 左右 → rotateY
                el.style.setProperty('--octo-card-rx', (-py * 11).toFixed(2) + 'deg');  // 上下 → rotateX
                el.style.setProperty('--octo-card-mx', (px * 100 + 50).toFixed(1) + '%');   // 光标 X% → 跟手高光
                el.style.setProperty('--octo-card-my', (py * 100 + 50).toFixed(1) + '%');   // 光标 Y%
            });
            el.addEventListener('pointerleave', () => {
                el.style.setProperty('--octo-card-ry', '0deg');
                el.style.setProperty('--octo-card-rx', '0deg');
            });
        });
    }

    function sync() {
        // sync 自身会写 DOM(改 class/属性)；先断开 body observer，跑完再接，
        // 否则这些写入会再次触发 observer → 即使页面静止也每轮空转(回环卡顿)。
        if (document.hidden) return;            // 后台标签页不做任何工作
        if (bodyObserver) bodyObserver.disconnect();
        try {
            try { ensureThemeToggle(); reflectTheme(storedThemeId()); } catch (e) { console.warn(TAG, 'theme', e); }
            try { watchAllToggles(); } catch (e) { console.warn(TAG, 'watchAllToggles', e); }
            try { expandAllFoldSessions(); } catch (e) { console.warn(TAG, 'expandAllFoldSessions', e); }
            try { markAIContinueMessages(); } catch (e) { console.warn(TAG, 'markAIContinueMessages', e); }
            try { applyClamp(); } catch (e) { console.warn(TAG, 'applyClamp', e); }
            try { rollBotCardRarity(); } catch (e) { console.warn(TAG, 'rollBotCardRarity', e); }
            try { tagBotDetailFields(); } catch (e) { console.warn(TAG, 'tagBotDetailFields', e); }
            try { bindBotCardTilt(); } catch (e) { console.warn(TAG, 'bindBotCardTilt', e); }
        } finally {
            if (bodyObserver) bodyObserver.observe(document.body, OBSERVE_OPTS);
        }
    }

    const scheduleSync = debounce(sync, 250);

    let bodyObserver = null;
    const OBSERVE_OPTS = { childList: true, subtree: true };
    // 本批变更是否新插入了 bot 资料卡相关节点
    function mutationTouchesBotCard(records) {
        const SEL = '.wk-bot-detail-content, .wk-bot-detail-desc, .wk-bot-detail-modal';
        for (let i = 0; i < records.length; i++) {
            const added = records[i].addedNodes;
            for (let j = 0; j < added.length; j++) {
                const n = added[j];
                if (n.nodeType !== 1) continue;
                if ((n.matches && n.matches(SEL)) ||
                    (n.querySelector && n.querySelector('.wk-bot-detail-content, .wk-bot-detail-desc'))) {
                    return true;
                }
            }
        }
        return false;
    }
    // observer 回调：bot 卡一插入就「立即」打字段标记(同步，赶在首帧绘制前)，
    // 避免等 250ms 防抖 sync 后才重排 → 创建者从整块面板缩成底部署名造成的高度跳变。
    // 其余重活仍走防抖 sync。(observer 只监听 childList，setAttribute 不会回触发)
    function onBodyMutations(records) {
        if (mutationTouchesBotCard(records)) {
            try { rollBotCardRarity(); } catch (e) { /* noop */ }
            try { tagBotDetailFields(); } catch (e) { /* noop */ }
        }
        scheduleSync();
    }
    function observe() {
        bodyObserver = new MutationObserver(onBodyMutations);
        bodyObserver.observe(document.body, OBSERVE_OPTS);
        // 从后台切回前台时补一次同步(后台期间跳过了)
        document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(); });
    }

    /* ============================================================
     * 6) 启动
     * ========================================================== */
    function start() {
        startTheme();
        bindClicks();
        observe();
        sync();
        setTimeout(sync, 500);
    }

    function init() {
        console.log(TAG, '脚本', VERSION, '已加载');
        if (document.head) injectStyles();
        else document.addEventListener('DOMContentLoaded', injectStyles, { once: true });

        if (document.body) start();
        else document.addEventListener('DOMContentLoaded', start, { once: true });
    }

    init();
})();
