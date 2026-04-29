"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot } from "lucide-react";

import { SCRIPT_ECOM_DM, TOTAL_STEPS } from "@/lib/agent/script-ecom-dm";
import { StepLedger } from "./step-ledger";
import { ThoughtPanel } from "./thought-panel";
import { PlayBar } from "./play-bar";
import { ModeBadge } from "./mode-badge";
import { ArtifactRenderer, ApprovalCard } from "./artifacts";
import { BreathingDot } from "@/components/motion/breathing-dot";
import { StarField } from "@/components/motion/star-field";
import type { RunnerState } from "./demo-runner-core";
import { stepNeedsApproval } from "./demo-runner-core";
import { useBackendRun } from "@/hooks/use-backend-run";

interface DemoRunnerProps {
  initialMode?: "mock" | "real";
  initialReason?: string;
  /** E2E 用：`/demo/run?source=client` 强制走本地脚本模式 */
  forceClient?: boolean;
}

/**
 * /demo/run 主 client 组件 · 双模式（backend 优先 · client 降级）
 *
 * 数据源：
 *   - backend mode：useBackendRun · 真 POST /api/runs + SSE /events
 *   - client mode：本地 SCRIPT_ECOM_DM · setTimeout 推进（fallback）
 *
 * UI 表达：
 *   - data-mode / ModeBadge 展示真数据 / 演示数据
 *   - 所有按钮的 onClick 动态 dispatch 到当前 source
 */
export function DemoRunner({
  initialMode = "mock",
  initialReason,
  forceClient = false,
}: DemoRunnerProps) {
  const steps = SCRIPT_ECOM_DM;

  /* ─────────── Backend mode hook（挂载即尝试连接）─────────── */
  const backend = useBackendRun({
    enabled: !forceClient,
    scenario: "ecom-dm",
    speed: 3,
    autoPlay: true,
  });

  const useBackend =
    !forceClient && backend.state !== "error" && backend.runId !== null;

  /* ─────────── Client fallback state ─────────── */
  const [clientState, setClientState] = useState<RunnerState>("idle");
  const [clientIndex, setClientIndex] = useState(0);
  const [clientSpeed, setClientSpeed] = useState(1);
  const [clientApprovedAt, setClientApprovedAt] = useState<number | null>(null);
  const [lastAction, setLastAction] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);
  const clientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const clearClientTimer = () => {
    if (clientTimerRef.current) {
      clearTimeout(clientTimerRef.current);
      clientTimerRef.current = null;
    }
  };

  /* Client auto-play · 仅在非 backend 模式生效 */
  useEffect(() => {
    if (useBackend) return; // backend 推进由 SSE 处理 · client timer 关闭
    clearClientTimer();
    if (clientState !== "running") return;

    const step = steps[clientIndex];
    if (!step) return;

    if (stepNeedsApproval(step) && !clientApprovedAt) {
      setClientState("awaiting_approval");
      setLastAction("⚠ 需审批");
      return;
    }
    if (clientIndex >= steps.length - 1) {
      clientTimerRef.current = setTimeout(() => {
        setClientState("done");
        setLastAction("剧本结束");
      }, Math.max(600, step.durationMs / clientSpeed));
      return;
    }
    const delay = Math.max(300, step.durationMs / clientSpeed);
    clientTimerRef.current = setTimeout(() => {
      setClientIndex((i) => i + 1);
    }, delay);

    return clearClientTimer;
  }, [useBackend, clientState, clientIndex, clientSpeed, clientApprovedAt, steps]);

  /* ─────────── Unified derived state ─────────── */
  const currentIndex = useBackend ? backend.currentIndex : clientIndex;
  const currentStep = steps[currentIndex];
  const unifiedState: RunnerState = useBackend
    ? (mapBackendState(backend.state) as RunnerState)
    : clientState;
  const currentSpeed = useBackend ? backend.speed : clientSpeed;
  const activeLastAction = useBackend
    ? backendLastAction(backend.state, backend.latestEvent)
    : lastAction;

  /* ─────────── Unified actions ─────────── */
  const play = useCallback(async () => {
    if (useBackend) {
      if (backend.state === "done") {
        await backend.actions.reset({ autoPlay: true });
      } else if (backend.state === "paused") {
        await backend.actions.resume();
      }
      return;
    }
    if (clientState === "done") {
      setClientIndex(0);
      setClientApprovedAt(null);
    }
    setClientState("running");
    setLastAction("▶ 播放");
  }, [useBackend, backend, clientState]);

  const pause = useCallback(async () => {
    if (useBackend) {
      await backend.actions.pause();
      return;
    }
    setClientState("paused");
    setLastAction("⏸ 暂停");
    clearClientTimer();
  }, [useBackend, backend]);

  const next = useCallback(async () => {
    if (useBackend) {
      await backend.actions.advance();
      return;
    }
    clearClientTimer();
    if (stepNeedsApproval(currentStep) && !clientApprovedAt) {
      setClientState("awaiting_approval");
      setLastAction("⚠ 需审批才可继续");
      return;
    }
    setClientIndex((i) => Math.min(i + 1, steps.length - 1));
    setClientState("paused");
    setLastAction("下一步（手动）");
  }, [useBackend, backend, currentStep, clientApprovedAt, steps.length]);

  const prev = useCallback(() => {
    if (useBackend) return; // backend mode 不支持 prev · 按钮在 UI 层已 disabled
    clearClientTimer();
    setClientIndex((i) => Math.max(0, i - 1));
    setClientState("paused");
    setLastAction("上一步");
  }, [useBackend]);

  const reset = useCallback(async () => {
    if (useBackend) {
      await backend.actions.reset({ autoPlay: true });
      return;
    }
    clearClientTimer();
    setClientIndex(0);
    setClientApprovedAt(null);
    setClientState("idle");
    setLastAction("重置");
  }, [useBackend, backend]);

  const jumpTo = useCallback(
    (idx: number) => {
      if (useBackend) {
        // backend 模式：后端状态机无 jumpTo API · 点击仅做本地高亮（不推进）
        setLastAction(`查看 step ${idx + 1}（backend 模式不跳转）`);
        return;
      }
      clearClientTimer();
      setClientIndex(Math.min(Math.max(0, idx), steps.length - 1));
      setClientState("paused");
      setLastAction(`跳转到 step ${idx + 1}`);
    },
    [useBackend, steps.length]
  );

  const approve = useCallback(async () => {
    if (useBackend) {
      await backend.actions.approve();
      return;
    }
    setClientApprovedAt(Date.now());
    setClientState("running");
    setClientIndex((i) => Math.min(i + 1, steps.length - 1));
    setLastAction("✓ 已审批 · 继续执行");
  }, [useBackend, backend, steps.length]);

  const reject = useCallback(async () => {
    if (useBackend) {
      await backend.actions.reject();
      return;
    }
    setClientApprovedAt(null);
    setClientState("paused");
    setLastAction("✗ 已拒绝 · 已停止");
  }, [useBackend, backend]);

  const setSpeed = useCallback(
    async (s: number) => {
      if (useBackend) {
        await backend.actions.setSpeed(s);
        return;
      }
      setClientSpeed(s);
    },
    [useBackend, backend]
  );

  /* ─────────── Artifact element ─────────── */
  const artifactEl = useMemo(() => {
    if (!currentStep) return null;
    if (
      currentStep.artifact.type === "approval" &&
      unifiedState === "awaiting_approval"
    ) {
      return (
        <ApprovalCard
          data={
            currentStep.artifact.data as unknown as Parameters<
              typeof ApprovalCard
            >[0]["data"]
          }
          onApprove={approve}
          onReject={reject}
        />
      );
    }
    return <ArtifactRenderer step={currentStep} />;
  }, [currentStep, unifiedState, approve, reject]);

  /* ─────────── UI ─────────── */
  const modeForBadge: "real" | "mock" = useBackend ? "real" : initialMode;
  const reasonForBadge = useBackend
    ? `connected · run ${backend.runId?.slice(0, 8)} · events ${backend.events.length}`
    : backend.state === "error"
    ? `后端不可用（${backend.error ?? "连接失败"}） · 已降级 client 脚本`
    : initialReason;

  return (
    <div
      className="fixed inset-0 flex flex-col bg-void"
      data-testid="demo-root"
      data-hydrated={hydrated ? "true" : "false"}
      data-source={useBackend ? "backend" : "client"}
    >
      <StarField count={14} seed={77} className="opacity-30" />

      {/* Top Bar */}
      <header className="relative z-10 h-14 flex items-center justify-between px-5 border-b border-stroke bg-void/90 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            data-testid="btn-back"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm text-text-mid hover:bg-white/[0.04] hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回工作台
          </Link>
          <div className="h-4 w-px bg-stroke" />
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-alive" />
            <span className="text-sm font-medium">
              电商客服自动回复 · 剧本演示
            </span>
            <span className="text-[10px] font-mono text-text-lo">
              scenario / ecom-dm
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-text-mid"
            data-testid="runner-state"
          >
            <BreathingDot
              size="xs"
              tone={
                unifiedState === "running"
                  ? "alive"
                  : unifiedState === "awaiting_approval"
                  ? "pending"
                  : unifiedState === "done"
                  ? "success"
                  : "alive"
              }
            />
            {stateLabel(unifiedState)}
            {activeLastAction && (
              <span className="text-text-lo">· {activeLastAction}</span>
            )}
          </div>
          <ModeBadge mode={modeForBadge} reason={reasonForBadge} />
        </div>
      </header>

      {/* Three-pane body */}
      <div className="relative z-10 flex-1 grid grid-cols-[280px_minmax(360px,420px)_1fr] min-h-0">
        <StepLedger
          steps={steps}
          currentIndex={currentIndex}
          onJump={jumpTo}
        />
        {currentStep && (
          <ThoughtPanel
            step={currentStep}
            isActive={unifiedState === "running"}
          />
        )}
        <div className="h-full overflow-y-auto px-6 py-5">{artifactEl}</div>
      </div>

      {/* Play bar */}
      <PlayBar
        state={unifiedState}
        currentIndex={currentIndex}
        total={TOTAL_STEPS}
        speed={currentSpeed}
        onPlay={play}
        onPause={pause}
        onPrev={prev}
        onNext={next}
        onReset={reset}
        onSpeedChange={setSpeed}
      />

      {/* 底部一行运行源指示（调试友好 · prod 视觉保留） */}
      <div
        className="absolute bottom-1 right-3 text-[9px] font-mono text-text-lo/70 z-20 pointer-events-none"
        data-testid="source-indicator"
      >
        {useBackend
          ? `backend · sse ${backend.sseConnected ? "●" : "○"} · ev ${backend.events.length}`
          : `client · script ${currentIndex + 1}/${steps.length}`}
      </div>
    </div>
  );
}

/* ═══════ helpers ═══════ */

function mapBackendState(s: string): RunnerState {
  switch (s) {
    case "connecting":
      return "idle";
    case "running":
      return "running";
    case "paused":
      return "paused";
    case "awaiting_approval":
      return "awaiting_approval";
    case "done":
      return "done";
    case "error":
    default:
      return "idle";
  }
}

function backendLastAction(
  state: string,
  latest: { type: string; step_no: number | null } | null
): string {
  if (!latest) return "";
  switch (latest.type) {
    case "step_start":
      return `进入 step ${latest.step_no}`;
    case "approval_required":
      return "⚠ 等待审批";
    case "approved":
      return "✓ 已审批";
    case "rejected":
      return "✗ 已拒绝";
    case "run_done":
      return "剧本结束";
    default:
      return state === "running" ? "运行中" : "";
  }
}

function stateLabel(s: RunnerState) {
  switch (s) {
    case "idle":
      return "待机";
    case "running":
      return "运行中";
    case "paused":
      return "已暂停";
    case "awaiting_approval":
      return "等待审批";
    case "done":
      return "已完成";
  }
}
