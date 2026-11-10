import assert from "node:assert/strict";
import { Duplex } from "node:stream";
import { test } from "node:test";
import * as direct from "../plugins/acp-steering/index.js";
import { steeringSource } from "../plugins/acp-steering/source.js";
const generated = await import(`data:text/javascript;base64,${Buffer.from(steeringSource).toString("base64")}`);
for (const [name, plugin] of [["module", direct], ["isolated source", generated]]) {
  test(`${name}: injects text through the native inbox, rejects idle input and cleans up`, () => {
    const output = [], received = [], removed = [], listeners = {};
    let disposed;
    const channel = new Duplex({ read() {}, write(chunk, encoding, done) { output.push(JSON.parse(String(chunk))); done(); } });
    const agent = { inbox: { remove(id) { removed.push(id); return true; } }, status: "running", session: { id: "s", header: { origin: "acp" } }, steer(message) { received.push(message); }, cancel() { this.status = "idle"; } };
    plugin.attach({ agents: { get(id) { return id === "s" ? agent : undefined; } }, on(event, handler) { listeners[event] = handler; }, effect(factory) { disposed = factory(); } }, channel);
    const send = (id, prompt, sessionId = "s") => channel.emit("data", JSON.stringify({ jsonrpc: "2.0", id, method: "steer", params: { sessionId, prompt } }) + "\n");
    assert.equal(output[0].method, "ready");
    const original = { id: "original", source: { kind: "user" }, content: [{ type: "text", text: "first" }] };
    listeners["session/event"](agent.session, { type: "agent/inbox/spliced", data: { target: "next-turn", inserted: [original, { ...original, source: { kind: "goal" } }] } });
    assert.deepEqual(output.at(-1).params, { sessionId: "s", messageId: "original", text: "first" });
    assert.equal(output.filter((message) => message.method === "enqueued").length, 1);
    listeners["agent/inbox/claimed"]({ agent, message: { id: "original" } });
    assert.equal(output.at(-1).method, "claimed");
    send(1, [{ type: "text", text: "change " }, { type: "text", text: "direction" }]);
    assert.equal(output.at(-1).result.accepted, true);
    assert.equal(received[0].content[0].text, "change direction");
    assert.equal(received[0].role, "user");
    assert.equal(received[0].source.kind, "user");
    assert.ok(Object.isFrozen(received[0].content[0]));
    assert.equal(output.at(-1).result.messageId, received[0].id);
    channel.emit("data", JSON.stringify({ jsonrpc: "2.0", method: "settle", params: { sessionId: "s" } }) + "\n");
    assert.deepEqual(removed, [received[0].id]);
    assert.equal(output.at(-1).method, "settled");
    send(5, [{ type: "text", text: "consumed" }]);
    listeners["agent/inbox/claimed"]({ agent, message: received[1] });
    channel.emit("data", JSON.stringify({ jsonrpc: "2.0", method: "settle", params: { sessionId: "s" } }) + "\n");
    assert.equal(removed.length, 1);
    send(2, [{ type: "image" }]);
    assert.equal(output.at(-1).error.code, -32602);
    send(3, [{ type: "text", text: "x" }], "unknown");
    assert.equal(output.at(-1).error.code, -32602);
    channel.emit("data", JSON.stringify({ jsonrpc: "2.0", method: "cancel", params: { sessionId: "s" } }) + "\n");
    send(4, [{ type: "text", text: "late" }]);
    assert.equal(output.at(-1).result.accepted, false);
    assert.equal(received.length, 2);
    disposed();
    assert.equal(channel.destroyed, true);
  });
}

for (const [name, plugin] of [["module", direct], ["isolated source", generated]]) {
  test(`${name}: a failed durable discard closes the channel without a successful settlement`, async () => {
    const output = [];
    let dispose;
    const channel = new Duplex({ read() {}, write(chunk, encoding, done) { output.push(JSON.parse(String(chunk))); done(); } });
    const failure = new Promise((resolve) => channel.once("error", resolve));
    const agent = { status: "running", session: { id: "s", header: { origin: "acp" } }, steer() {}, inbox: { remove() { throw new Error("disk write failed"); } } };
    plugin.attach({ agents: { get() { return agent; } }, on() {}, effect(factory) { dispose = factory(); } }, channel);
    channel.emit("data", JSON.stringify({ jsonrpc: "2.0", id: 1, method: "steer", params: { sessionId: "s", prompt: [{ type: "text", text: "correction" }] } }) + "\n");
    channel.emit("data", JSON.stringify({ jsonrpc: "2.0", method: "settle", params: { sessionId: "s" } }) + "\n");
    const error = await failure;
    assert.match(error.message, /queued state is unknown/);
    assert.equal(channel.destroyed, true);
    assert.equal(output.some((message) => message.method === "settled"), false);
    dispose();
  });
}
