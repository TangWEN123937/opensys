import { DemoRunner } from "@/components/demo/demo-runner";

function detectMode(): { mode: "mock" | "real"; reason: string } {
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  return hasKey
    ? { mode: "real", reason: "已检测到 ANTHROPIC_API_KEY" }
    : { mode: "mock", reason: "未配 ANTHROPIC_API_KEY · 走脚本化演示" };
}

interface Props {
  searchParams: Promise<{ source?: string }>;
}

export default async function DemoRunPage({ searchParams }: Props) {
  const { source } = await searchParams;
  const { mode, reason } = detectMode();
  return (
    <DemoRunner
      initialMode={mode}
      initialReason={reason}
      forceClient={source === "client"}
    />
  );
}
