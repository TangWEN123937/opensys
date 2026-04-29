---
name: 论文正文撰写
triggers: [论文撰写, 学术写作, 论文正文, 章节撰写, 论文写作, academic writing]
priority: 8
description: 按学术规范逐章撰写论文正文，确保论证严密、引用规范、风格统一
summary: 先确认写作参数（论文类型/大纲/引用格式/字数目标），再按大纲逐章串行撰写。每章包含核心论点+文献支撑+逻辑论证，行文使用学术语体（第三人称、被动句式、客观表述）。引用标记使用统一格式（如 [1] 或 (Author, Year)）。写完后自查学术规范、逻辑连贯和引用完整性。产出物为完整的论文正文 Markdown 文件。适用于 executor_sequential 串行撰写各章节（每章能参考前面已写章节）。
version: "1.3"
target_role: executor
no_web_tool: true
---

## 论文正文撰写流程（本技能被激活时执行）

### ⚠️ 核心原则（必须严格遵守）

**本任务是生成式写作任务。你的职责是撰写论文正文，而不是搜索信息。**

1. **你没有 web_tool 工具**（系统已移除），不要尝试搜索互联网
2. **写作素材来源**：用 `run_terminal` 调用下方的向量库检索脚本获取已入库的文献片段
3. **核心输出**：基于检索到的文献资料 + 上下文中的大纲，用学术语言撰写论文正文
4. **必须保存文件**：用 `write_and_run_script` 将撰写内容写入 `<任务目录>/drafts/` 下的 .md 文件（草稿阶段不写 output/，终稿由排版阶段输出）

### 向量知识库与检索脚本说明

#### 数据库信息
- **数据库**：ChromaDB（本地持久化），路径 `/app/data/chroma_db`
- **集合名称**：`documents`（所有 PDF 文献统一存储）
- **向量模型**：BGE-M3 Embedding（本地服务 `http://host.docker.internal:8100/api/v1/embed`）
- **Metadata 字段**：`source_file`（来源 PDF 文件名）、`section`（章节标题）、`topic`（LLM 自动分类的主题）、`doc_id`（PDF SHA256 前缀）

#### 预置检索脚本
- **路径**：`/app/data/skills/paper-writing/query_references.py`
- **检索方式**：混合检索（语义相似度 × 0.7 + 关键词匹配 × 0.3），Embedding 服务不可用时自动降级为纯关键词匹配
- **输出格式**：结构化 Markdown，每条结果包含来源文件、章节、综合/语义/关键词得分、文献正文片段（超过 1500 字自动截断）
- **参数**：
  - `--query`（必填）：检索关键词，支持自然语言描述
  - `--topic`（可选）：按 metadata.topic 过滤，限定主题分类
  - `--top_k`（可选）：返回条数，默认 10

### 第零步：检索向量知识库（写作前必做）

在撰写每个章节前，用 `run_terminal` 调用预置检索脚本，从 ChromaDB 获取相关文献片段：

```bash
# 示例：按章节主题检索
python /app/data/skills/paper-writing/query_references.py --query "雨污分流改造技术" --top_k 8
python /app/data/skills/paper-writing/query_references.py --query "非开挖修复 CIPP" --top_k 5
python /app/data/skills/paper-writing/query_references.py --query "城市更新 老旧小区 排水管网" --top_k 8
```

- 每个子任务开始时先检索 1-2 次（根据章节主题选择关键词）
- 检索结果将返回文献片段、来源文件、章节和相关度
- **检索到的内容作为写作素材**，用自己的语言转述融入正文，标注引用来源
- 如果检索结果为空（向量库无相关内容），则基于「阶段背景」中的文献综述摘要写作

### 第一步：确认写作参数

从「阶段背景」和「执行指导」中获取以下信息：

1. **论文大纲**：Phase 5 确认的完整大纲（章节结构+要点+字数分配）
2. **文献综述成果**：Phase 4 的文献综述和引用清单
3. **引用格式**：Phase 1 确定的引用格式规范
4. **字数目标**：当前章节的字数范围
5. **需求确认单**：Phase 1 的研究定位和创新点

### 第二步：逐章撰写

#### 学术写作基本规范

1. **语体要求**：
   - 使用第三人称（"本研究"而非"我"）
   - 多用被动句式（"数据通过问卷收集"而非"我们用问卷收了数据"）
   - 客观表述，避免主观情感词汇
   - 专业术语首次出现时给出定义或解释

2. **引用规范**：
   - 每个非常识性论点必须标注文献来源
   - 引用标记格式与 Phase 1 确定的规范一致
   - 直接引用使用引号并标注页码
   - 间接引用用自己的语言转述并标注来源
   - 引用分布均匀，避免某段大量引用而另一段毫无引用

3. **段落结构**：
   - 每段围绕一个核心论点
   - 段内结构：论点 → 论据/引用 → 分析 → 小结/过渡
   - 段间使用过渡句连接（因此、然而、此外、与此同时等）
   - 单段不宜过长（200-400 字为宜）

4. **各章节撰写要点**：

**绪论/引言**：
- 从宏观背景到具体问题，逐步聚焦
- 明确指出研究问题和研究目的
- 说明研究意义（理论+实践）
- 概述研究方法和论文结构

**文献综述**：
- 直接使用 Phase 4 的文献综述成果
- 确保与大纲结构一致
- 末尾明确指出研究空白和本文定位

**研究方法**：
- 清楚说明方法选择的理由
- 详细描述数据来源、样本、分析过程
- 让读者能够复现研究

**分析与讨论**：
- 先呈现结果/发现，再进行分析解释
- 与文献综述中的已有研究对话
- 解释预期之外的发现
- 讨论结果的理论和实践意义

**结论**：
- 概括主要发现（不引入新内容）
- 总结理论贡献和实践启示
- 诚实讨论研究局限
- 提出未来研究方向

### 第 2.5 步：图表绘制（⚠️ 引用即必生成）

**铁律：正文中引用了图/表（如「图 2-1」「表 3-1」），就必须用 `write_and_run_script` 实际生成对应文件并保存到 drafts/ 目录。禁止只在正文写引用而不生成图表文件——这是审查不通过的首要原因之一。**

**数据红线：只有当文献或研究中存在真实数据时，才可以绘制图表。严禁凭空编造数据来生成图表。如果没有真实数据支撑，就不要在正文中引用图表。**

适用场景：
- 文献中给出了具体的实验数据、统计指标、对比参数等
- 研究方法中涉及模型模拟结果、效能对比数据
- 有真实的数量关系需要可视化呈现（趋势图、对比柱状图、流程图等）

#### 绘图库选择

| 需求 | 推荐库 | 原因 |
|---|---|---|
| 学术论文、科研绘图 | **Matplotlib + SciencePlots** | 精细控制每个像素，支持矢量图输出，满足出版要求 |
| 数据分析、统计图表 | **Seaborn** | API 简洁，默认样式美观，与 Pandas 完美集成 |

安装（脚本开头执行一次即可）：
```bash
pip install matplotlib seaborn SciencePlots -q
```

#### 设计原则（❗必须遵守）

图表**不是默认样式的占位图**，而是论文的视觉亮点，必须做到：

1. **一眼抓住读者**：用对比色、渐变色、高亮标注突出核心发现，让关键数据跳出画面
2. **有设计感**：使用 SciencePlots 的 `science` / `ieee` / `nature` 学术主题，或 Seaborn 的 `whitegrid` / `darkgrid` 配色
3. **信息层次分明**：主数据用粗线/深色，次要数据用细线/浅色，添加数据标注（annotate）突出关键点
4. **配色和谐专业**：禁止 matplotlib 默认的蓝/橙/绿随意配色，使用精心挑选的调色板（如 `tab10`, `Set2`, `coolwarm`, 或自定义 HEX 色值）
5. **细节到位**：网格线、坐标轴标签、图例、标题字号都要精心调整，高 DPI 输出（≥200）

#### 绘制流程

1. **确认数据来源**：数据必须来自向量库检索到的文献原文，或阶段上下文中明确给出的数据
2. **选择图表类型**：根据数据关系选择最有表现力的图表（对比→分组柱状图/雷达图、趋势→折线图+面积填充、分布→箱线图/小提琴图、占比→环形图/堆叠图）
3. **使用 `write_and_run_script` 绘图**：用推荐库生成图表，保存为 PNG
4. **插入 Markdown**：在正文中以 `![图 N-M 标题](文件名.png)` 格式引用

#### 示例1：学术风格对比图（Matplotlib + SciencePlots）

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

# 尝试使用 SciencePlots 学术主题
try:
    plt.style.use(['science', 'no-latex'])
except:
    plt.style.use('seaborn-v0_8-whitegrid')

plt.rcParams['font.sans-serif'] = ['Noto Sans CJK SC', 'SimHei', 'WenQuanYi Micro Hei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

# 数据（必须来自文献真实数据）
categories = ['传统开挖', 'CIPP内衬', '管道爆裂', '螺旋缠绕']
efficiency = [65.3, 89.7, 78.2, 82.5]
cost = [100, 72, 85, 68]

# 专业配色（蓝色系渐变 + 高亮最优方案）
colors = ['#8ECAE6', '#023047', '#FFB703', '#FB8500']
# 最优值高亮
highlight = [efficiency.index(max(efficiency))]

fig, ax1 = plt.subplots(figsize=(10, 6))

bars = ax1.bar(categories, efficiency, color=colors, width=0.6,
               edgecolor='white', linewidth=1.5, zorder=3)

# 高亮最优方案 + 数据标注
for i, (bar, val) in enumerate(zip(bars, efficiency)):
    ax1.text(bar.get_x() + bar.get_width()/2, val + 1.5,
             f'{val}%', ha='center', va='bottom',
             fontsize=12, fontweight='bold' if i in highlight else 'normal',
             color='#023047')

ax1.set_ylabel('修复效率 (%)', fontsize=13, fontweight='bold')
ax1.set_title('不同非开挖修复技术效能对比', fontsize=15, fontweight='bold', pad=15)
ax1.set_ylim(0, 105)
ax1.spines['top'].set_visible(False)
ax1.spines['right'].set_visible(False)
ax1.grid(axis='y', alpha=0.3, linestyle='--')

plt.tight_layout()
plt.savefig('<任务目录>/drafts/fig_4_1.png', dpi=200, bbox_inches='tight',
            facecolor='white', edgecolor='none')
print('图表已保存: fig_4_1.png')
```

#### 示例2：统计分布图（Seaborn）

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np

plt.rcParams['font.sans-serif'] = ['Noto Sans CJK SC', 'SimHei', 'WenQuanYi Micro Hei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

sns.set_theme(style="whitegrid", palette="muted", font_scale=1.2)

# 示例：多组数据对比（来自文献真实数据）
data = pd.DataFrame({
    '改造方案': ['方案A']*5 + ['方案B']*5 + ['方案C']*5,
    '管网达标率(%)': [78, 82, 85, 80, 83,  90, 92, 88, 91, 93,  72, 75, 70, 74, 71]
})

fig, ax = plt.subplots(figsize=(9, 6))
sns.violinplot(data=data, x='改造方案', y='管网达标率(%)',
               inner='box', palette=['#8ECAE6', '#023047', '#FFB703'], ax=ax)
ax.set_title('不同改造方案管网达标率分布', fontsize=15, fontweight='bold', pad=15)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)

plt.tight_layout()
plt.savefig('<任务目录>/drafts/fig_3_1.png', dpi=200, bbox_inches='tight')
print('图表已保存: fig_3_1.png')
```

正文中引用示例：`如图 4-1 所示，CIPP 内衬修复技术的综合效率最高（89.7%），显著优于传统开挖方式[3]。`

**图表命名规则**：`fig_章号_序号.png`（如第四章第2张图为 `fig_4_2.png`）

#### ⚠️ 图表红线（再次强调）
- **没有真实数据就不要画图**——宁可不画也不能造假
- 图表中的数值必须能在文献引用中找到出处
- 图表标题和编号必须在正文中被引用
- **禁止使用 matplotlib 默认样式输出**——必须使用主题或手动调配色/字号/间距

### 第三步：自检清单

撰写完成后，逐条自检：
- [ ] 是否覆盖了大纲中的所有要点
- [ ] 各章节之间是否有逻辑断层
- [ ] 是否每个论点都有文献支撑或论据
- [ ] 引用标记是否完整且格式统一
- [ ] 语言风格是否全文统一（学术语体）
- [ ] **字数是否在目标的 ±30% 范围内**（见下方字数验证流程）
- [ ] 专业术语是否准确
- [ ] **图表一致性（必检）**：正文引用的每张图/表（如「图 2-1」）是否都有对应的实际文件（如 `fig_2_1.png`）存在于 drafts/ 目录中；反之，drafts/ 中的图表文件是否都在正文中被引用
- [ ] 是否存在口语化或非学术表达

#### ⚠️ 字数验证流程（写完必做，禁止跳过）

**每个章节写完保存后，必须立即验证字数是否符合大纲分配的目标。字数偏差超过 ±30% 时，必须当场修改至合格再保存，不得留到后续阶段返工。**

1. 保存文件时脚本会自动统计汉字数并输出
2. 对照大纲中该章节的字数目标，计算偏差比例
3. 偏差在 ±30% 以内 → 合格，继续下一步
4. 偏差超出 ±30% → **必须立即调整**：
   - 字数过少：补充论述、增加论据、展开分析
   - 字数过多：精简冗余表述、删除重复论点、压缩过长的引用转述
5. 调整后重新保存并再次验证，直到字数合格

**为什么不能留到后面改？** 因为后续阶段（合并、引用整理、排版）都依赖章节内容的稳定性，如果到审查阶段才发现字数不合格要大改，会导致引用编号、图表编号、参考文献全部需要返工，代价远大于写作时就控制好字数。

### 第四步：保存文件（必须）

**每个子任务完成撰写后，必须使用 `write_and_run_script` 工具将内容写入文件：**

#### ❗ 文件命名硬规则（严格遵守）

**每章固定一个文件名，永远覆盖更新，禁止创建新文件名：**

| 章节 | 固定文件名 |
|---|---|
| 第一章 引言 | `chapter_1.md` |
| 第二章 文献综述 | `chapter_2.md` |
| 第三章 | `chapter_3.md` |
| 第四章 | `chapter_4.md` |
| 第五章 | `chapter_5.md` |
| 第六章 | `chapter_6.md` |
| 第七章 结论 | `chapter_7.md` |
| 摘要 + 关键词 | `abstract.md` |
| 全文合并稿 | `paper_draft.md` |

- 所有章节草稿存放在 `<任务目录>/drafts/` 下（不是 output/）
- **禁止**创建 `chapter_3_status_analysis.md`、`chapter_3_4_combined.md`、`paper_full_text.md` 等变体文件名
- 返工时直接覆盖原文件，不创建新版本
- 一个子任务负责多章时，分别写入对应的 `chapter_N.md`

#### 写入示例

```python
content = """# 第一章 引言

## 1.1 研究背景

城市更新背景下...
"""

import os, re
drafts_dir = "<任务目录>/drafts"  # 如 /app/output/20260420_1435_xxx/drafts
os.makedirs(drafts_dir, exist_ok=True)
with open(f"{drafts_dir}/chapter_1.md", "w", encoding="utf-8") as f:
    f.write(content)

# 字数统计与验证
chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', content))
target_words = 2000  # ← 替换为大纲中该章节的字数目标
deviation = (chinese_chars - target_words) / target_words * 100
print(f"已保存到 drafts/chapter_1.md：汉字 {chinese_chars} 字（目标 {target_words} 字，偏差 {deviation:+.1f}%）")
if abs(deviation) > 30:
    print(f"⚠️ 字数偏差超过 ±30%！{'字数过少，需补充内容' if deviation < 0 else '字数过多，需精简内容'}，请立即修改后重新保存")
else:
    print(f"✅ 字数合格（偏差在 ±30% 以内）")
```

#### 全文合并（最后一个子任务执行）

**合并不是简单的 `cat`！各章独立撰写时引用编号可能各自从 [1] 开始，合并时必须全文统一重编号。**

使用 `write_and_run_script` 执行以下 Python 合并脚本：

```python
import os, re

drafts_dir = "<任务目录>/drafts"  # 章节草稿所在目录

# 按顺序读取各章节文件
chapter_files = [
    "abstract.md",
    "chapter_1.md", "chapter_2.md", "chapter_3.md",
    "chapter_4.md", "chapter_5.md", "chapter_6.md", "chapter_7.md",
]

# 第一遍：收集所有引用编号，建立全局重编号映射
global_ref_counter = 0
# old_to_new[chapter_file][(old_num)] = new_num
old_to_new = {}
all_contents = {}

for fname in chapter_files:
    fpath = os.path.join(drafts_dir, fname)
    if not os.path.isfile(fpath):
        continue
    text = open(fpath, "r", encoding="utf-8").read()
    all_contents[fname] = text
    # 提取该章出现的所有引用编号（按首次出现顺序）
    seen = []
    for m in re.finditer(r'\[(\d+)\]', text):
        num = int(m.group(1))
        if num not in seen:
            seen.append(num)
    mapping = {}
    for old_num in seen:
        global_ref_counter += 1
        mapping[old_num] = global_ref_counter
    old_to_new[fname] = mapping

# 第二遍：替换引用编号并合并
merged_parts = []
for fname in chapter_files:
    if fname not in all_contents:
        continue
    text = all_contents[fname]
    mapping = old_to_new[fname]
    if mapping:
        # 先用占位符替换避免冲突
        for old_num, new_num in mapping.items():
            text = re.sub(rf'\[{old_num}\]', f'[__REF_{new_num}__]', text)
        # 还原占位符
        text = re.sub(r'\[__REF_(\d+)__\]', r'[\1]', text)
    merged_parts.append(text)

merged = "\n\n".join(merged_parts)
out_path = os.path.join(drafts_dir, "paper_draft.md")  # 合并稿也放 drafts/，终稿由排版阶段输出到 output/
with open(out_path, "w", encoding="utf-8") as f:
    f.write(merged)

cn_chars = len(re.findall(r'[\u4e00-\u9fff]', merged))
print(f"合并完成：{out_path}")
print(f"总引用数：{global_ref_counter}，汉字：{cn_chars}")
print(f"编号映射：{dict(list(old_to_new.items())[:3])}...")  # 打印前3章映射
```

⚠️ **合并后必须检查**：
- 引用编号是否全文连续无间断（[1] [2] [3] ...）
- 同一文献在不同章节引用时是否使用了同一编号（如不是，需手动合并）
- `references.md` 中的参考文献顺序是否与正文引用顺序一致

### 注意事项

- **严禁编造数据**：所有数据和事实必须来自文献或实际研究
- **严禁编造图表数据**：图表中的每一个数值都必须有文献出处，没有真实数据就不画图
- **⛔ 引用即必生成**：正文中写了 `图 N-M` 引用，就必须用 `write_and_run_script` 生成对应的 `fig_N_M.png` 文件。如果决定不画某张图，必须同时删除正文中对该图的所有引用。禁止出现「引用了图但没生成文件」的情况
- **严禁抄袭**：即使引用也必须用自己的语言转述，直接引用比例应极低
- **严禁搜索代替写作**：你没有 web_tool，不要试图搜索互联网。必须基于向量库检索结果自己撰写学术文本
- **草稿写入 drafts/**：每个子任务必须用 write_and_run_script 将撰写内容保存到 `<任务目录>/drafts/` 下，不要写入 output/
- **串行撰写时**：用 `run_terminal` 执行 `cat` 读取前面已写章节的内容，确保术语定义、缩写、引用编号风格与前面章节一致。引用编号应接续前面章节的编号继续递增，不要从 [1] 重新开始
- **章节衔接**：每章开头应有承上启下的过渡段
- **合并必须重编号**：全文合并时必须用 Python 脚本统一重排引用编号，禁止简单 `cat` 拼接
- **摘要必须最后写**：摘要（abstract.md）是全文内容的浓缩，必须在所有正文章节完成后才撰写，不得与正文章节并行。摘要子任务同时负责全文合并（用上方的 Python 合并脚本，不用简单 cat）
- **⛔ 字数必须一次做对**：每章写完保存后立即检查字数偏差，超出目标 ±30% 必须当场修改至合格。禁止写完不管字数留到审查阶段才发现不合格再返工——这会导致引用编号、图表编号、参考文献全部需要重做
