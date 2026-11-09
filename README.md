# DSH plugins

DeepSeek Harness 插件统一维护仓库。每个插件放在 `plugins/<name>/`；当前包含会话权限插件 `session-permission`。原生 Auto review 的风险判定与工具执行逻辑继续由上游 `@deepseek-ai/dsh-experimental-auto-review` 提供，本仓库不复制审查器。

## Session permission

插件在根 Agent 新建或恢复时，通过 DSH 的 `permissionPresets.set()` 选择权限模式。`DSH_SESSION_PERMISSION_PRESET` 支持原生 preset，例如 `auto`、`workspace-write`、`danger-full-access`；省略时使用 `auto`。委派子 Agent 保留 DSH 自己继承的审批策略。非法 preset 或缺失的原生 Auto integration 由 DSH 拒绝，不回退成 Full access。

插件同时通过 DSH 的 `llm/stream` 路由扩展，将 `purpose: auto-review` 的请求单独设为 `reasoningEffort: high`，执行、标题等其他模型请求保持原配置。模型和授权判定仍由原生审查器提供，不复制或修改其风险规则。可用 `DSH_AUTO_REVIEW_REASONING_EFFORT` 覆盖审批强度；值必须非空且受当前模型支持，不支持时由原生 LLM 校验拒绝请求，不自动降级。变更环境变量后需重新启动或恢复 DSH 进程，已运行的进程继续沿用启动时设置。

BB 已自动加载这份插件，使用 BB 时无需再安装到它的 ACP profile。独立使用 DSH CLI 时，在 DSH 0.2.2-rc.1 环境创建单独 profile 并安装固定 Git revision：

```sh
dsh --profile standalone-auto --from-default-profile acp --dump-config
dsh plugin --profile standalone-auto add 'https://codeload.github.com/hxy91819/dsh-plugins/tar.gz/<commit>'
DSH_SESSION_PERMISSION_PRESET=auto dsh --profile standalone-auto
```

根 bundle 挂载原生 Auto review 与 session-permission。已经挂载原生 Auto review 的 profile 应改用单独插入 `@hxy91819/dsh-plugins/session-permission` 的 overlay，避免重复挂载。挂载插件本身不提供 ACP 权限切换协议；外部宿主应在每次启动时设置期望模式，改变模式时重建并恢复原会话。

BB 的接入继续维护在 [bb-plugins/plugins/provider-acp](https://github.com/hxy91819/bb-plugins/tree/main/plugins/provider-acp)，沿用 `acp-dsh`。BB 将本仓库固定到 Git commit，并从 `@hxy91819/dsh-plugins/session-permission/source` 获取由实际插件实现生成的隔离加载源码；BB 只保存部署副本，维护时只改本仓库。

## 开发与交付

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run pack:check
```

本仓库没有运行时第三方依赖。测试同时通过正常模块和生成源码加载插件，覆盖根会话新建/恢复、各权限模式与子 Agent 不被覆盖。真实 DSH 和 BB 审批/模式切换验证由 BB 接入仓库执行；模块测试不代替真实工具执行验证。发布到 main 后检查 CI，再把需要引用新实现的宿主依赖更新到确切 Git SHA。
