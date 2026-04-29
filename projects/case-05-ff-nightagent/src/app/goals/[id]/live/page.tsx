import { GoalLive } from "@/components/goals/goal-live";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function GoalLivePage({ params }: Props) {
  const { id } = await params;
  return <GoalLive goalId={id} />;
}
