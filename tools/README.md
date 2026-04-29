# tools/ — 辅助工具

## recorder_to_skill.py

把 Chrome DevTools Recorder 导出的 JSON 转换为 OpenSys 的 `SKILL.md` 草稿。

### 录制步骤 (在 Chrome 里做)

1. 打开目标页面 (如 `https://mail.qq.com`)
2. 按 `F12` 打开 DevTools
3. 左上角三个点菜单 → **More tools** → **Recorder** (中文: 更多工具 → 录制器)
4. **Create a new recording** → 起名 (如 `qq-mail-send`)
5. **Start recording** → 正常操作一遍 (写信/填收件人/发送等)
6. 完成后点 **End recording**
7. 右上角 **Export** → 选 **JSON** → 下载

### 录制小贴士

- 每步之间停顿 1 秒, Recorder 会自动插入 `waitForElement`
- 尽量用鼠标点击 (避免 Tab 切换, Recorder 对鼠标识别更稳)
- **密码字段不要输真实密码** (Recorder 会明文记录; 转换脚本会对 password 字段自动脱敏, 但保险起见别输)
- 手机号/邮箱/身份证会被脚本自动替换为占位符

### 运行转换

```bash
python tools/recorder_to_skill.py recording.json \
    --name qq-mail-send \
    --out data/skills/browser/qq-mail-send/SKILL.md
```

参数:

- `input` (必填): Recorder 导出的 JSON 路径
- `--name`: Skill 名称, 默认取 JSON 里的 title
- `--out`: 输出路径, 默认 `./<name>.SKILL.md`

### 输出内容

生成的 `SKILL.md` 包含:

- ✅ front matter 骨架 (`name` / `url_prefixes` 自动提取)
- ✅ 操作步骤列表 (录制轨迹, 含最稳定选择器)
- ✅ 敏感信息脱敏 (手机号/身份证/邮箱用户名/密码)
- ⚠️ 需人工补充: `triggers` / `key_rules` / ⛔强制规则 / ⚠️常见错误

### 选择器优先级

脚本从 Recorder 给的备选里挑最稳定的:

| 类型 | 分数 | 示例 |
|---|---|---|
| data-testid | 100 | `[data-testid="send-btn"]` |
| aria-label | 90 | `aria/写信` |
| name/placeholder | 80 | `[name="to"]` |
| #id | 70 | `#email-input` |
| 文本 | 60 | `text/发送` |
| 属性选择器 | 50 | `[role="button"]` |
| class | 30 | `.btn-primary` (不稳定, 避免) |
| xpath | 10 | 最兜底 |

### 后续迭代

当前是最小可用版本。如果 Recorder 不够用 (比如遇到 iframe/shadow DOM/复杂 SPA), 再考虑自研 Chrome 插件。
