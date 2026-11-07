export const name = "session-permission";
export const inject = ["permissionPresets"];

export function apply(ctx) {
  const presets = ctx.permissionPresets;
  const requested = process.env.DSH_SESSION_PERMISSION_PRESET ?? "auto";
  ctx.on("agent/created", ({ agent }) => {
    if (agent.session.header.origin === "subagent") return;
    presets.set(agent.session, requested);
  });
}
