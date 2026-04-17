---
name: 微信公众号文章发布
domain: wechat_publish
description: 适用于将已有文章内容（Markdown/纯文本/HTML）发布到微信公众号的场景。核心流程：确认文章内容 → pandoc 转 docx → 浏览器导入发布
keywords: [公众号, 微信公众号, 发布文章, 推文, 微信, mp.weixin, 公众平台, 发布, 推送]
version: "1.0"
---

## Phase 1: Understand
- description: 确认待发布的文章文件路径、标题、摘要等信息；如果用户未提供文章内容，先协助完成撰写
- method: agent
- skill: null
- required: true
- review: false

## Phase 2: Prepare
- description: 使用 pandoc 将文章源文件（Markdown/HTML/纯文本）转换为 .docx 格式，供微信公众号编辑器「文档导入」功能使用。命令示例：pandoc /app/output/article.md -o /app/output/article.docx
- method: executor
- skill: null
- required: true
- review: false

## Phase 3: Publish
- description: 登录微信公众号后台，创建图文消息，通过「文档导入」上传 docx 正文，设置标题、作者、封面（AI配图）、摘要，预览后让用户确认再发布
- method: browser
- skill: null
- required: true
- review: false
- url: https://mp.weixin.qq.com
- details: （由 Advisor 根据 Phase 1 确认的信息填入：文章标题、docx 文件路径、封面要求、摘要内容等）注意上传的细节你不需要写 browser自己知道即可

## Phase 4: Verify
- description: 确认文章是否成功发布，告知用户最终结果
- method: agent
- skill: null
- required: true
- review: false
