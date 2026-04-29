import Link from "next/link";
import { AppShell } from "@/components/dashboard/app-shell";
import { MetricGrid } from "@/components/dashboard/metric-grid";
import { PlanTree } from "@/components/dashboard/plan-tree";
import { LiveThoughtStream } from "@/components/dashboard/live-thought-stream";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Button } from "@/components/ui/button";
import { BreathingDot } from "@/components/motion/breathing-dot";
import { MOCK_GOALS } from "@/lib/mock-data";
import { ArrowRight, Pause, Inbox } from "lucide-react";

export default function DashboardPage() {
  const goal = MOCK_GOALS[0];

  return (
    <AppShell active="goals">
      <header className="sticky top-0 z-20 border-b border-stroke bg-void/70 backdrop-blur-xl px-8 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <BreathingDot />
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-mono text-text-lo">
                <span>goal / {goal.id}</span>
                <span className="h-1 w-1 rounded-full bg-success" />
                <span className="text-success">运行中</span>
              </div>
              <h1 className="text-lg font-semibold tracking-tight truncate max-w-2xl">
                {goal.title}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <Pause className="h-3.5 w-3.5" />
              接管
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/approvals">
                <Inbox className="h-3.5 w-3.5" />
                2 条待审
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/goals/${goal.id}/timeline`}>
                行车记录 <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/demo/run">
                观看演示 <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button variant="accent" size="sm" asChild>
              <Link href="/goals/new">
                新目的地 <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
        <p className="mt-2 text-sm text-text-mid max-w-3xl">{goal.description}</p>
      </header>

      <div className="px-8 py-6 space-y-6">
        <MetricGrid metrics={goal.metrics} />

        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 lg:col-span-5">
            <PlanTree tasks={goal.plan} />
          </div>
          <div className="col-span-12 lg:col-span-7">
            <LiveThoughtStream goalId={goal.id} />
          </div>
        </div>

        <ActivityFeed />
      </div>
    </AppShell>
  );
}
