import { Log } from "opendata-log";

type AgentRunEvent =
  | { type: "run.started"; agentId: string }
  | { type: "message.delta"; messageId: string; text: string }
  | { type: "tool.started"; toolCallId: string; name: string }
  | { type: "tool.finished"; toolCallId: string }
  | { type: "run.completed"; messageId: string }
  | { type: "run.failed"; message: string };

const log = new Log({
  baseURL: process.env.LOG_URL ?? "http://localhost:8081",
});
const runId = crypto.randomUUID();
const events = log.stream<AgentRunEvent>(`agent-runs/${runId}`);

// Your agent runner starts the run; the SDK records that fact.
await events.append({
  values: [{ type: "run.started", agentId: "support-agent" }],
  awaitDurable: true,
});

// Batch model chunks to reduce HTTP requests.
await events.append({
  values: [
    { type: "message.delta", messageId: "msg-1", text: "I found " },
    { type: "message.delta", messageId: "msg-1", text: "the answer." },
  ],
});

await events.append({
  values: [{ type: "run.completed", messageId: "msg-1" }],
  awaitDurable: true,
});

// A separate UI or worker can open the same stream using runId.
const run = log.stream<AgentRunEvent>(`agent-runs/${runId}`);

// This demo keeps its checkpoint in memory. Load a saved checkpoint to resume.
let checkpoint = 0n;

for await (const { sequence, value } of run.follow({
  startSequence: checkpoint,
})) {
  switch (value.type) {
    case "run.started":
      console.log("Run started:", runId, value.agentId);
      break;
    case "message.delta":
      process.stdout.write(value.text);
      break;
    case "tool.started":
      console.log("Tool running:", value.toolCallId, value.name);
      break;
    case "tool.finished":
      console.log("Tool finished:", value.toolCallId);
      break;
    case "run.completed":
      console.log("\nRun completed:", value.messageId);
      break;
    case "run.failed":
      console.error("Run failed:", value.message);
      break;
  }

  // Persist this position after handling the event in your application.
  checkpoint = sequence + 1n;
  const isRunFinished =
    value.type === "run.completed" || value.type === "run.failed";
  if (isRunFinished) break;
}

console.log("Next checkpoint:", checkpoint.toString());
