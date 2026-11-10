# DSH plugins

DeepSeek Harness 插件统一维护仓库。每个插件放在 `plugins/<name>/`；当前包含会话权限插件 `session-permission` 与 ACP 轮次中消息插件 `acp-steering`。原生 Auto review 的风险判定与工具执行逻辑继续由上游 `@deepseek-ai/dsh-experimental-auto-review` 提供，本仓库不复制审查器。

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

## ACP steering

`acp-steering` 是供宿主集成使用的插件，由 BB 的 `acp-compat` DSH adapter 自动部署到独立临时 overlay；不要再把它挂到普通 profile。它通过继承的私有双向管道接收纯文本消息，使用原生 `agent.steer()` 进入持久 inbox，并返回入队与消费回执。普通 ACP 请求、模型路由、工具、输出、后代等待及最终结算仍由官方 ACP 插件处理，不替换整个 ACP 实现。

插件只向运行中的根 Agent 投递；Agent 已空闲时返回未接受，由宿主作为普通下一轮提交。取消也走同一有序管道。宿主按新入队普通用户消息的文本和身份关联当前 prompt，等待该消息实际 claim 后才开放 steering，避免恢复 inbox 或 goal 消息提前放行；非纯文本主提示词使用 interrupt 回退。宿主必须在官方 ACP 结算后确认 steering 已被实际 claim，不能把入队回执直接当成投递完成。私有管道关闭时宿主停止对应 DSH 进程；插件卸载释放通道和监听器。通道要求 `DSH_ACP_STEERING_FD=3`，适用于 Linux/macOS，不开放网络端口。

BB 接入维护在 [bb-plugins/plugins/acp-compat](https://github.com/hxy91819/bb-plugins/tree/main/plugins/acp-compat)，沿用 `acp-dsh` provider。它通过固定 revision 的 `@hxy91819/dsh-plugins/acp-steering/source` 部署本插件，不需要 DSH 的 `fix/acp-mid-turn-steering` 补丁。纯文本 steering 由插件处理；图片等内容仍使用宿主的 interrupt 投递。单元测试同时检查模块与隔离源码，真实 DSH 同轮消费和取消恢复测试由 BB 接入仓库执行。

修改 `acp-steering/index.js` 后运行 `npm run generate` 更新隔离源码；`npm run check` 核对生成结果。隔离源码以字符串常量打包，避免宿主压缩变量名改变被部署插件中的引用。
