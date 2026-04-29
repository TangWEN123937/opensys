import { GoalTimeline } from "@/components/goals/goal-timeline";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function GoalTimelinePage({ params }: Props) {
  const { id } = await params;
  return <GoalTimeline goalId={id} />;
}
