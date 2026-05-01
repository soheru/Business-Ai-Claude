import { listAgents } from "@db/repos";
import { AgentEditForm } from "@/components/agent-edit-form";
import { AddAgentForm } from "@/components/add-agent-form";

export default async function SettingsPage() {
  const agents = listAgents();

  return (
    <div className="space-y-8 p-6 max-w-4xl">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure each agent&apos;s model and system prompt. Changes apply on the next run.
        </p>
      </header>

      <div className="space-y-4">
        <AddAgentForm />
        {agents.map((agent) => (
          <AgentEditForm key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
