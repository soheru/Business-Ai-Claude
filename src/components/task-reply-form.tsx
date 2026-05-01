"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TaskStatus } from "@/lib/types";

interface Props {
  taskId: string;
  taskStatus: TaskStatus;
}

/**
 * Lets the user send a follow-up message to an agent that has already run.
 * The server assembles the full conversation history and passes it as a
 * continuation prompt to the next run.
 */
export function TaskReplyForm({ taskId, taskStatus }: Props) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isRunning = taskStatus === "in_progress";
  const canSubmit = content.trim().length > 0 && !isRunning && !submitting;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/tasks/${taskId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `Server error: ${res.status}`);
      }

      setContent("");
      setSuccessMsg("Reply sent. Watching for response...");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send reply.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Reply / Continue conversation</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {isRunning ? (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <span>&#9881;&#65039;</span>
            <span>Agent is working... wait for it to finish before replying.</span>
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reply-content" className="text-sm">
                Your reply
              </Label>
              <Textarea
                id="reply-content"
                rows={4}
                placeholder="Type your reply or additional context..."
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  // Clear stale feedback as soon as the user starts typing again
                  if (successMsg) setSuccessMsg(null);
                  if (errorMsg) setErrorMsg(null);
                }}
                disabled={submitting}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                The agent will continue with full conversation history.
              </p>
            </div>

            {successMsg && (
              <p className="text-sm text-green-400">{successMsg}</p>
            )}

            {errorMsg && (
              <p className="text-sm text-red-400">{errorMsg}</p>
            )}

            <Button
              type="submit"
              disabled={!canSubmit}
              size="sm"
            >
              {submitting ? "Sending..." : "Send reply"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
