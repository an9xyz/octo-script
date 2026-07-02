# Octo AI 消息美化

一个 [Tampermonkey](https://www.tampermonkey.net/) 油猴脚本，美化 Octo（DMWork）网页版聊天消息。纯 CSS/DOM 覆盖，不改动 app 源码。

## 功能

- **三档消息气泡**：AI / 自己 / 他人分别配色，一眼区分发送者
- **折叠会话自动展开**，长消息限高 + 「展开全文」
- **多消息类型适配**：@提及、引用、文件、合并转发、系统分割线、子区创建卡、Bot/用户资料卡等
- **暗色适配**：补齐 app 原生暗色遗漏的语义令牌，联动 `body[theme-mode]`
- **可切换消息主题**（左下角导航栏图标弹出菜单，`localStorage` 记忆）：
  - 赛博紫 · 亮
  - 赛博紫 · 暗
  - 美加墨世界杯（浅色·球场风：珠宝色三档 + 角落足球 hover 踢球进球 + 引用块球门造型）

## 安装

1. 浏览器安装 Tampermonkey 扩展
2. 新建脚本，粘贴 [`octo-ai-unfold.user.js`](./octo-ai-unfold.user.js) 全部内容并保存
3. 打开 Octo 网页版即可生效

匹配域名：`https://im.deepminer.com.cn/*`、`https://*.deepminer.com.cn/*`（如你的部署域名不同，改脚本头部 `@match`）。

## 说明

- `@grant none`，主题选择用 `localStorage`
- 无障碍：`prefers-reduced-motion` 下关闭动效
- 需要内核支持 CSS `:has()`（现代 Chromium 均支持）
