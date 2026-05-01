import { Suspense } from "react";
import { listAgents } from "@db/repos";
import { NewTaskForm } from "./new-task-form";

export default function NewTaskPage() {
  // Server-side load of all agents so the picker has the live list (including
  // any custom agents created via Settings) on first paint — no client fetch
  // flash, no "Loading agents…" placeholder.
  const agents = listAgents().filter((a) => a.isActive);

  return (
    <Suspense fallback={null}>
      <NewTaskForm initialAgents={agents} />
    </Suspense>
  );
}
