"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { employees, statusColor, statusLabel } from "@/lib/employees";
import { cn } from "@/lib/utils";

/**
 * 2.5D 等距办公室 · 俯视图
 * 6 个工位 + 中央老板位 + 飞书门 + 时钟 + 纸飞机动画
 *
 * 不用 SVG iso lib —— 手工 CSS transform 保证商业级像素精度。
 */
export function IsometricOffice() {
  const [plane, setPlane] = useState<{ from: string; to: string } | null>(null);

  // 每 3.8s 随机一对员工之间飞一只纸飞机（ACP 消息）
  useEffect(() => {
    const pairs = employees.flatMap((a, i) => employees.slice(i + 1).map((b) => [a.id, b.id]));
    const id = setInterval(() => {
      const [from, to] = pairs[Math.floor(Math.random() * pairs.length)];
      setPlane({ from, to });
      setTimeout(() => setPlane(null), 2400);
    }, 3800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative w-full max-w-[960px] mx-auto aspect-[4/3] select-none">
      {/* 地板 · 等距透视 */}
      <div
        className="absolute inset-[6%] rounded-[36px] border border-ink-line"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, #F1EBE1 0%, #E8E0D2 70%, #DDD2BF 100%)",
          transform: "perspective(1400px) rotateX(42deg)",
          transformStyle: "preserve-3d",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.8) inset, 0 50px 80px -40px rgba(15,15,18,0.28)",
        }}
      >
        {/* 地板木纹 · SVG 图案 */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.05]"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <defs>
            <pattern id="wood" width="80" height="8" patternUnits="userSpaceOnUse">
              <rect width="80" height="8" fill="transparent" />
              <line x1="0" y1="4" x2="80" y2="4" stroke="#0F0F12" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#wood)" />
        </svg>
      </div>

      {/* 飞书门 · 左下角 */}
      <FeishuDoor />

      {/* 中央老板位 */}
      <CenterBossDesk />

      {/* 6 员工工位 */}
      {employees.map((emp, idx) => (
        <EmployeeSeat key={emp.id} emp={emp} index={idx} />
      ))}

      {/* 纸飞机 · ACP 消息动画 */}
      {plane && <PaperPlane from={plane.from} to={plane.to} />}

      {/* 阳光从左上斜射 · 装饰光斑 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 18% 12%, rgba(217, 119, 87, 0.12), transparent 40%)",
        }}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════ */

function CenterBossDesk() {
  return (
    <div
      className="absolute"
      style={{
        left: "50%",
        top: "52%",
        transform: "translate(-50%, -50%)",
      }}
    >
      <div className="relative flex flex-col items-center">
        {/* 桌面圆盘 */}
        <div
          className="w-[150px] h-[86px] rounded-[48%] border border-ink-line"
          style={{
            background: "linear-gradient(180deg, #F1EBE1, #DDD2BF)",
            transform: "perspective(800px) rotateX(55deg)",
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.7) inset, 0 14px 22px -14px rgba(15,15,18,0.35)",
          }}
        />
        {/* 空椅子 + 老板标签 */}
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center">
          <div className="w-10 h-10 rounded-full bg-ink text-canvas font-display flex items-center justify-center text-[11px] tracking-wider">
            老板
          </div>
          <div className="mt-1 badge-tag text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-pending breathe-alert" />
            远程中
          </div>
        </div>
      </div>
    </div>
  );
}

function FeishuDoor() {
  return (
    <Link
      href="/feishu"
      className="absolute left-[8%] bottom-[18%] group"
      aria-label="飞书指令入口"
    >
      <div className="relative w-16 h-20 rounded-t-lg border-2 border-ink-line bg-paper-2 flex flex-col items-center justify-center transition-transform group-hover:-translate-y-0.5">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center text-base font-display text-canvas"
          style={{ background: "linear-gradient(135deg, #3370FF, #0D5BEF)" }}
        >
          飞
        </div>
        <span className="mt-1 text-[9px] font-mono uppercase tracking-widest text-ink-mid">
          Feishu
        </span>
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-ink-lo whitespace-nowrap">
          指令入口 →
        </span>
      </div>
    </Link>
  );
}

function EmployeeSeat({
  emp,
  index,
}: {
  emp: typeof employees[number];
  index: number;
}) {
  return (
    <Link
      href={`/employee/${emp.id}`}
      id={`seat-${emp.id}`}
      className="absolute group"
      style={{
        left: `${emp.seat.x}%`,
        top: `${emp.seat.y}%`,
        transform: "translate(-50%, -50%)",
        animation: `fade-up 0.6s var(--ease-out-slow) both ${0.1 * index}s`,
      }}
    >
      {/* 工位桌 · 小椭圆 */}
      <div
        className="absolute -z-10 left-1/2 -translate-x-1/2 top-[64px] w-[72px] h-[34px] rounded-[48%] border border-ink-line bg-paper-2"
        style={{
          transform: "perspective(600px) rotateX(56deg)",
          boxShadow: "0 10px 16px -10px rgba(15,15,18,0.35)",
        }}
      />

      {/* 头像圆环 + 状态灯 */}
      <div className="relative">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center font-display text-lg tracking-wider shadow-md transition-transform group-hover:scale-105"
          style={{ background: emp.bgColor, color: emp.accent }}
        >
          {emp.initials}
        </div>
        {/* 状态呼吸灯 */}
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-canvas",
            emp.status === "autonomous" && "breathe-sage",
            emp.status === "thinking"   && "breathe-alert",
            emp.status === "awaiting"   && "breathe-alert",
          )}
          style={{ background: statusColor[emp.status] }}
        />
      </div>

      {/* 标签 · 工牌 */}
      <div className="absolute top-[106px] left-1/2 -translate-x-1/2 flex flex-col items-center w-max">
        <span className="font-display text-[13px] text-ink leading-none whitespace-nowrap">
          {emp.name}
        </span>
        <span className="mt-1 text-[10px] font-mono text-ink-lo uppercase tracking-wider whitespace-nowrap">
          {emp.role} · {statusLabel[emp.status]}
        </span>
      </div>

      {/* 桌面工具 emoji */}
      <span
        className="absolute top-[58px] left-[calc(50%+16px)] text-sm"
        style={{ animation: "glyph-bob 3.2s ease-in-out infinite" }}
      >
        {emp.toolIcon}
      </span>
    </Link>
  );
}

function PaperPlane({ from, to }: { from: string; to: string }) {
  const a = employees.find((e) => e.id === from);
  const b = employees.find((e) => e.id === to);
  if (!a || !b) return null;
  const dx = b.seat.x - a.seat.x;
  const dy = b.seat.y - a.seat.y;
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${a.seat.x}%`,
        top: `${a.seat.y}%`,
        transform: "translate(-50%, -50%)",
        animation: "fly-plane 2.4s var(--ease-paper) forwards",
        ["--plane-dx" as string]: `${dx * 7.5}px`,
        ["--plane-dy" as string]: `${dy * 5}px`,
      } as React.CSSProperties}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" className="text-warmth">
        <path
          d="M1,10 L19,2 L13,18 L10,11 L2.5,10.5 Z"
          fill="currentColor"
          stroke="#0F0F12"
          strokeWidth="0.6"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
