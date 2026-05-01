import type { Agent } from "@/lib/types";
import { AgentCard } from "@/components/agent-card";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

async function getAgents(): Promise<Agent[]> {
  try {
    const res = await fetch(`${BASE}/api/agents`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json() as Promise<Agent[]>;
  } catch {
    return [];
  }
}

export default async function AgentsPage() {
  const agents = await getAgents();

  return (
    <div className="p-8 space-y-6 max-w-6xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Agents</h2>
        <p className="text-muted-foreground mt-1">
          {agents.length} agent{agents.length !== 1 ? "s" : ""} configured
        </p>
      </div>

      {agents.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>No agents found. Run <code className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded">npm run db:init</code> to seed agents.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
