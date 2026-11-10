export const name = "session-permission";
export const inject = ["permissionPresets", "llm"];

export function apply(ctx) {
  const presets = ctx.permissionPresets;
  const llm = ctx.llm;
  const reasoningEffort = process.env.DSH_AUTO_REVIEW_REASONING_EFFORT ?? "high";
  if (reasoningEffort.trim().length === 0) {
    throw new Error("DSH_AUTO_REVIEW_REASONING_EFFORT must be a non-empty model-supported effort");
  }
  ctx.on("llm/stream", (options, next) => {
    if (options.purpose !== "auto-review" || options.reasoningEffort === reasoningEffort) return next();
    return llm.stream(Object.freeze({ ...options, reasoningEffort }));
  }, { prepend: true });
  const requested = process.env.DSH_SESSION_PERMISSION_PRESET ?? "danger-full-access";
  ctx.on("agent/created", ({ agent }) => {
    if (agent.session.header.origin === "subagent") return;
    presets.set(agent.session, requested);
  });
}
