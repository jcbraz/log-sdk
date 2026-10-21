import { Log } from "opendata-log";

type Notification = { type: "notification.sent"; userId: string };

const log = new Log({
  baseURL: process.env.LOG_URL ?? "http://localhost:8081",
});
const notifications = log.stream<Notification>("notifications");

// One counter numbers every key, so the log's end is a valid start for this key.
const start = await log.endSequence();
console.log("Starting at:", start.toString());

// Earlier notifications are skipped; this one is appended after the start.
const ack = await notifications.append({
  values: [{ type: "notification.sent", userId: crypto.randomUUID() }],
  awaitDurable: true,
});

// Limit the demo to its own event. Omit endSequence for a long-running handler.
for await (const entry of notifications.follow({
  startSequence: start,
  endSequence: ack.startSequence + 1n,
})) {
  console.log("Received:", entry.sequence.toString(), entry.value);
}
