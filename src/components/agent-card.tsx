import Link from "next/link";
import type { Agent } from "@/lib/types";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AgentCardProps {
  agent: Agent;
}

const roleColors: Record<string, string> = {
  ceo: "bg-purple-900/50 text-purple-300 border-purple-800",
  marketer: "bg-pink-900/50 text-pink-300 border-pink-800",
  developer: "bg-blue-900/50 text-blue-300 border-blue-800",
  pm: "bg-orange-900/50 text-orange-300 border-orange-800",
  ux: "bg-teal-900/50 text-teal-300 border-teal-800",
  qa: "bg-green-900/50 text-green-300 border-green-800",
};

export function AgentCard({ agent }: AgentCardProps) {
  const roleColorClass =
    roleColors[agent.role] ?? "bg-secondary text-secondary-foreground";

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{agent.name}</CardTitle>
          <div className="flex gap-1.5 flex-shrink-0">
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${roleColorClass}`}
            >
              {agent.role.toUpperCase()}
            </span>
          </div>
        </div>
        <CardDescription className="text-xs font-mono bg-muted/50 rounded px-1.5 py-0.5 w-fit">
          {agent.model}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
          {agent.systemPrompt.length > 200
            ? agent.systemPrompt.slice(0, 200) + "…"
            : agent.systemPrompt}
        </p>
        {agent.capabilities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {agent.capabilities.slice(0, 3).map((cap) => (
              <Badge key={cap} variant="secondary" className="text-xs">
                {cap}
              </Badge>
            ))}
            {agent.capabilities.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{agent.capabilities.length - 3}
              </Badge>
            )}
          </div>
        )}
        <div className="flex gap-2 mt-auto pt-2">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link href={`/dashboard/agents/${agent.id}`}>View History</Link>
          </Button>
          <Button asChild size="sm" className="flex-1">
            <Link href={`/dashboard/tasks/new?agent=${agent.role}`}>
              New Task
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
