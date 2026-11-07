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
          on(event, handler) { assert.equal(event, "agent/created"); created = handler; },
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
