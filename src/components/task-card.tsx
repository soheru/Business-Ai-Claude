import Link from "next/link";
import type { Task } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatTimeAgo } from "@/lib/utils";

interface TaskCardProps {
  task: Task;
  agentName?: string;
}

const priorityVariants: Record<
  string,
  { label: string; class: string }
> = {
  low: { label: "Low", class: "bg-slate-800 text-slate-400 border-slate-700" },
  medium: { label: "Med", class: "bg-blue-900/50 text-blue-400 border-blue-800" },
  high: { label: "High", class: "bg-orange-900/50 text-orange-400 border-orange-800" },
  urgent: { label: "Urgent", class: "bg-red-900/50 text-red-400 border-red-800" },
};

export function TaskCard({ task, agentName }: TaskCardProps) {
  const priority = priorityVariants[task.priority] ?? {
    label: task.priority,
    class: "bg-secondary text-secondary-foreground",
  };

  return (
    <Link href={`/dashboard/tasks/${task.id}`}>
      <Card className="cursor-pointer hover:border-ring/50 transition-colors">
        <CardContent className="p-3 space-y-2">
          <p className="text-sm font-medium leading-snug line-clamp-2">
            {task.title}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {agentName && (
              <Badge variant="secondary" className="text-xs">
                {agentName}
              </Badge>
            )}
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${priority.class}`}
            >
              {priority.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatTimeAgo(task.createdAt)}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
