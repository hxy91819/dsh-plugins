import { Socket } from "node:net";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";

export const name = "acp-steering";
export const inject = ["agents"];

export function attach(ctx, channel) {
  const agents = ctx.agents;
  const send = (message) => channel.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
  const lines = createInterface({ input: channel });
  const fail = (id, code, message) => send({ id, error: { code, message } });
  ctx.on("agent/inbox/claimed", ({ agent, message }) => {
    if (agent.session.header.origin !== "subagent") send({ method: "claimed", params: { sessionId: agent.session.id, messageId: message.id } });
  });
  lines.on("line", (line) => {
    let request;
    try { request = JSON.parse(line); } catch { return; }
    if (!request || request.jsonrpc !== "2.0" || !request.params || typeof request.params.sessionId !== "string") return;
    if (request.method === "settle") {
      send({ method: "settled", params: { sessionId: request.params.sessionId } });
      return;
    }
    const agent = agents.get(request.params.sessionId);
    if (request.method === "cancel") {
      if (agent && agent.session.header.origin !== "subagent") agent.cancel({ kind: "user" });
      return;
    }
    if (request.method !== "steer" || !["string", "number"].includes(typeof request.id)) return;
    const prompt = request.params.prompt;
    if (!Array.isArray(prompt) || prompt.length === 0 || prompt.some((block) => !block || block.type !== "text" || typeof block.text !== "string")) {
      fail(request.id, -32602, "DSH steering accepts non-empty text block arrays only");
      return;
    }
    if (!agent || agent.session.header.origin === "subagent") {
      fail(request.id, -32602, "Unknown root session");
      return;
    }
    if (agent.status !== "running") {
      send({ id: request.id, result: { accepted: false } });
      return;
    }
    try {
      const message = Object.freeze({ id: randomUUID(), role: "user", content: Object.freeze([Object.freeze({ type: "text", text: prompt.map((block) => block.text).join("") })]), source: Object.freeze({ kind: "user" }) });
      agent.steer(message);
      send({ id: request.id, result: { accepted: true, messageId: message.id } });
    } catch (error) {
      fail(request.id, -32000, error instanceof Error ? error.message : String(error));
    }
  });
  const dispose = () => { lines.close(); channel.destroy(); };
  ctx.effect(() => dispose);
  send({ method: "ready" });
}

export function apply(ctx) {
  if (process.env.DSH_ACP_STEERING_FD !== "3") throw new Error("acp-steering requires its host-managed private channel");
  const channel = new Socket({ fd: 3, readable: true, writable: true });
  channel.on("error", (error) => ctx.logger.warn(`ACP steering channel failed: ${error.message}`));
  attach(ctx, channel);
}
