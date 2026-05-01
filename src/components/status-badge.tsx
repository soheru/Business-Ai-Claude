import type { TaskStatus, RunStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: TaskStatus | RunStatus;
  className?: string;
}

const statusConfig: Record<
  TaskStatus | RunStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" }
> = {
  backlog: { label: "Backlog", variant: "secondary" },
  in_progress: { label: "In Progress", variant: "info" },
  in_review: { label: "In Review", variant: "warning" },
  done: { label: "Done", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  running: { label: "Running", variant: "info" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "secondary" },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, variant: "outline" as const };
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
