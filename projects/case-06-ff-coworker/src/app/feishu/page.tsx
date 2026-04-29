import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default function FeishuPage() {
  return (
    <>
      <SiteHeader />

      <section className="py-16">
        <div className="container-pro">
          <div className="grid md:grid-cols-[1fr_1fr] gap-12 items-start">
            <div>
              <div className="badge-tag badge-tag-warmth mb-5">
                <span>飞书指挥入口</span>
              </div>
              <h1 className="font-display text-5xl text-ink leading-tight">
                扫码 · <span className="hand-underline">雇你的 AI 员工</span>
              </h1>
              <p className="mt-5 text-ink-mid text-base leading-relaxed">
                Hermes Agent 原生支持飞书机器人（<code className="px-1.5 py-0.5 rounded bg-paper-2 font-mono text-[12px]">gateway/platforms/feishu.py</code>）。
                添加机器人 · 在群里或私聊对话 · 指令就会路由到对应的 AI 员工。
              </p>

              <ol className="mt-10 space-y-5">
                <Step num={1} title="添加飞书机器人" body="用你的飞书 APP 扫右侧二维码 · 把 FF-CoWorker 添加到工作台。" />
                <Step num={2} title="下发指令" body="直接在对话里输入 @CTO 帮我修登录 bug，或用斜杠命令 /hire Creative 创建新员工。" />
                <Step num={3} title="回到办公室看响应" body="打开 /office 看办公室俯视图 · 对应员工会立刻亮起并开始工作。" />
              </ol>

              <div className="mt-12 paper p-5">
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-mid mb-3">
                  历史指令示例
                </div>
                <div className="space-y-3 text-[13px] font-mono">
                  <HistoryLine cmd="@陈昊 帮我修一下小程序登录回调 bug" reply="12 分钟后 · Gitee PR !234 已合并 · 部署到阿里云" />
                  <HistoryLine cmd="@江雨 跟进下昨天那个启明科技王总" reply="3 分钟后 · 已发企微 1V1 · 引用了对方上周脉脉发文" />
                  <HistoryLine cmd="/hire Analyst" reply="5 秒后 · 沈墨员工已创建 · 今日日报 9:00 送达" />
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center lg:sticky lg:top-16">
              <div className="paper paper-raised p-8 text-center">
                <div className="badge-tag mb-4">飞书 · 扫码</div>
                <div className="w-[260px] h-[260px] rounded-xl border-2 border-ink bg-canvas flex items-center justify-center">
                  <FakeQR />
                </div>
                <div className="mt-5 font-display text-lg text-ink">FF-CoWorker Bot</div>
                <div className="mt-1 font-mono text-[11px] text-ink-lo uppercase tracking-wider">
                  Scan with Feishu app
                </div>
              </div>
              <div className="mt-4 text-[12px] text-ink-lo font-mono text-center max-w-xs">
                （演示占位 · 真机请在设置页填入你的 APP_ID / APP_SECRET 后生成真实二维码）
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}

function Step({ num, title, body }: { num: number; title: string; body: string }) {
  return (
    <li className="flex items-start gap-4">
      <span className="w-9 h-9 rounded-full bg-ink text-canvas font-display text-lg flex items-center justify-center shrink-0">
        {num}
      </span>
      <div>
        <div className="font-display text-xl text-ink leading-tight">{title}</div>
        <div className="mt-1 text-ink-mid text-[13px] leading-relaxed">{body}</div>
      </div>
    </li>
  );
}

function HistoryLine({ cmd, reply }: { cmd: string; reply: string }) {
  return (
    <div className="flex items-start gap-2 pb-3 border-b border-ink-hair last:border-none">
      <div className="flex-1">
        <div className="text-warmth-deep">↪ {cmd}</div>
        <div className="text-ink-mid text-[12px] mt-1">{reply}</div>
      </div>
    </div>
  );
}

function FakeQR() {
  const size = 25;
  const cells: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) {
      const inCorner =
        (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
      if (inCorner) {
        const corner = (x >= size - 7 ? x - (size - 7) : x) % 7;
        const cornerY = (y >= size - 7 ? y - (size - 7) : y) % 7;
        const isFrame = corner === 0 || corner === 6 || cornerY === 0 || cornerY === 6;
        const isCore = corner >= 2 && corner <= 4 && cornerY >= 2 && cornerY <= 4;
        row.push(isFrame || isCore);
      } else {
        row.push(((x * 13 + y * 7 + x * y * 3) % 3) === 0);
      }
    }
    cells.push(row);
  }
  return (
    <svg width="220" height="220" viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#FBF7F1" />
      {cells.map((row, y) =>
        row.map((on, x) =>
          on ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#0F0F12" /> : null
        )
      )}
    </svg>
  );
}
