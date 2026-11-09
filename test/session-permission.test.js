import { test } from "node:test";
import assert from "node:assert/strict";
import * as direct from "../plugins/session-permission/index.js";
import { selectorSource } from "../plugins/session-permission/source.js";

const generated = await import("data:text/javascript;base64," + Buffer.from(selectorSource).toString("base64"));
for (const [surface, plugin] of [["module", direct], ["isolated source", generated]]) {
  for (const requested of [undefined, "auto", "danger-full-access", "workspace-write"]) {
    test(`${surface}: root creation and resume select ${requested ?? "default auto"}; children retain their own policy`, () => {
      const original = process.env.DSH_SESSION_PERMISSION_PRESET;
      if (requested === undefined) delete process.env.DSH_SESSION_PERMISSION_PRESET;
      else process.env.DSH_SESSION_PERMISSION_PRESET = requested;
      try {
        const selected = [];
        let created;
        plugin.apply({
          permissionPresets: { set: (session, preset) => selected.push([session, preset]) },
          on(event, handler) { if (event === "agent/created") created = handler; },
        });
        const fresh = { header: {} };
        const resumed = { header: { origin: "user" } };
        created({ agent: { session: fresh } });
        created({ agent: { session: resumed } });
        created({ agent: { session: { header: { origin: "subagent" } } } });
        assert.deepEqual(selected, [[fresh, requested ?? "auto"], [resumed, requested ?? "auto"]]);
      } finally {
        if (original === undefined) delete process.env.DSH_SESSION_PERMISSION_PRESET;
        else process.env.DSH_SESSION_PERMISSION_PRESET = original;
      }
    });
  }
}

for (const [surface, plugin] of [["module", direct], ["isolated source", generated]]) {
  for (const configured of [undefined, "max"]) {
  test(`${surface}: reviews use ${configured ?? "default high"} while execution and other model calls retain their effort`, async () => {
    const original = process.env.DSH_AUTO_REVIEW_REASONING_EFFORT;
    if (configured === undefined) delete process.env.DSH_AUTO_REVIEW_REASONING_EFFORT;
    else process.env.DSH_AUTO_REVIEW_REASONING_EFFORT = configured;
    try {
      let route;
      const dispatched = [];
      const llm = {
        stream(options) {
          return route(options, () => {
            dispatched.push(options);
            return (async function* () { yield { type: "finish", reason: { kind: "stop" } }; })();
          });
        },
      };
      plugin.apply({
        llm,
        permissionPresets: {},
        on(event, handler) { if (event === "llm/stream") route = handler; },
      });
      for (const purpose of ["auto-review", "agent-loop", "session-title"]) {
        const request = Object.freeze({ purpose, provider: "ollama-cloud", model: "deepseek-v4.1-flash", reasoningEffort: "max", messages: Object.freeze([]), signal: new AbortController().signal });
        const chunks = [];
        for await (const chunk of llm.stream(request)) chunks.push(chunk);
        assert.equal(chunks.length, 1);
        const sent = dispatched.at(-1);
        assert.equal(sent.reasoningEffort, purpose === "auto-review" ? configured ?? "high" : "max");
        assert.equal(sent.provider, request.provider);
        assert.equal(sent.model, request.model);
        assert.equal(sent.messages, request.messages);
        assert.equal(sent.signal, request.signal);
        assert.equal(request.reasoningEffort, "max");
        if (purpose !== "auto-review") assert.equal(sent, request);
      }
      assert.equal(dispatched.length, 3);
    } finally {
      if (original === undefined) delete process.env.DSH_AUTO_REVIEW_REASONING_EFFORT;
      else process.env.DSH_AUTO_REVIEW_REASONING_EFFORT = original;
    }
  });
}
}
