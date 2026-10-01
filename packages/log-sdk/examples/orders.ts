import { Log } from "opendata-log";

type OrderCreated = {
  type: "order.created";
  orderId: string;
  totalCents: number;
};

const log = new Log({
  baseURL: process.env.LOG_URL ?? "http://localhost:8081",
});
const orders = log.stream<OrderCreated>("orders"); // JSON codec by default

const ack = await orders.append({
  values: [
    { type: "order.created", orderId: crypto.randomUUID(), totalCents: 4995 },
  ],
  awaitDurable: true,
});

const endSequence = ack.startSequence + 1n;
const page = await orders.scan({
  startSequence: ack.startSequence,
  endSequence,
});

console.log("Scanned order:", page.values[0]?.value);

// This demo keeps its checkpoint in memory. Persist it after processing in a worker.
let checkpoint = ack.startSequence;

// Limit the demo to its own event. Omit endSequence for a long-running consumer.
for await (const entry of orders.follow({
  startSequence: checkpoint,
  endSequence,
})) {
  console.log("Processed order:", entry.value);
  checkpoint = entry.sequence + 1n;
}

console.log("Next checkpoint:", checkpoint.toString());
