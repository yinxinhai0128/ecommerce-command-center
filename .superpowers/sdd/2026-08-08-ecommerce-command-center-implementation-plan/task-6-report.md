# Task 6：DeepSeek 分析服务报告

## 交付

- 新增 `/api/analysis` 的 Zod 输入/输出边界校验、DeepSeek 调用和确定性本地降级。
- `AnalysisContext`、`AnalysisResult` 和全部五种 `fallbackReason` 已共享到 `src/domain/types.ts`。
- 无密钥、上游错误、网络错误、12 秒中止、空内容、无效 JSON、缺字段和越界模型响应均返回本地结果。
- 开发环境由 Vite 将 `/api` 代理到 `127.0.0.1:8787`；生产服务静态 `dist` 并保留 `/api` 的 404/错误响应。

## TDD 证据

### RED

命令：

```powershell
pnpm test -- tests/server/analysisRoute.test.ts
```

关键输出：

```text
FAIL  tests/server/analysisRoute.test.ts
Error: Failed to resolve import "../../server/index"
```

此时服务模块不存在，测试尚未执行；随后才新增生产实现。

### GREEN

聚焦测试命令：

```powershell
pnpm exec vitest run tests/server/analysisRoute.test.ts
```

输出：

```text
Test Files  1 passed (1)
Tests  15 passed (15)
```

全量测试命令：

```powershell
pnpm test
```

输出：

```text
Test Files  9 passed (9)
Tests  50 passed (50)
```

其他检查：

```powershell
pnpm exec tsc --noEmit
pnpm build
git diff --check
```

三项均以退出码 0 完成。构建成功；Vite 仅报告既有客户端 bundle 超过 500KB 的提示，未阻断构建。

## 复审第 1 轮

### 修改

- 新增公共 `AnalysisRequest`，将扁平 POST payload 的可选 `question` 纳入共享契约，并与运行时 schema 双向静态对齐。
- 将 `AnalysisResult` 固定为 signals、causes、risks、actions 和问句形式 followUps 的精确子结构；同步 DeepSeek 提示、解析与本地生成。
- 本地生成将数组限制为 12 项、字符串限制为 1,000 字符，保留至少一个数据支撑的 action，并让 follow-up 始终是可点击问句。
- 将完整 `/api` 命名空间的 JSON 404 前置于静态服务；外层上游响应 JSON 解析失败归类为 `invalid_response`。

### RED

命令：

```powershell
pnpm exec tsc --noEmit
pnpm exec vitest run tests/server/analysisRoute.test.ts
```

关键输出：

```text
TS2724: has no exported member named 'AnalysisRequest'
Tests  5 failed | 14 passed (19)
```

五个失败分别覆盖旧的本地结果字段、旧的 DeepSeek 子结构、外层 JSON 被错标为 `network_error`、13 条合法长告警无法形成合规结果，以及静态文件覆盖 `/api/missing`。

### GREEN

聚焦测试：

```powershell
pnpm exec vitest run tests/server/analysisRoute.test.ts --reporter=dot
```

输出：

```text
Test Files  1 passed (1)
Tests  19 passed (19)
```

全量验证：

```powershell
pnpm test -- --reporter=dot
pnpm exec tsc --noEmit
pnpm build
git diff --check
```

输出：

```text
Test Files  9 passed (9)
Tests  54 passed (54)
✓ built in 989ms
```

类型检查与差异检查均以退出码 0 完成。构建仍只有既有客户端 bundle 大小提示。

## 复审第 2 轮

### 修改

- 新增 `FollowUpQuestion` 公共模板字面量类型，并将 `AnalysisResult.followUps` 收紧为该类型数组；Zod 后续问题 schema 通过 transform 输出同一类型，且保留最小长度与问号校验。
- 对本地 action rationale 的所有拼接路径统一截断，确保 1,000 字符贡献者标签不会令结果超过响应 schema 上限。

### RED

命令：

```powershell
pnpm exec tsc --noEmit
pnpm exec vitest run tests/server/analysisRoute.test.ts --reporter=dot
```

关键输出：

```text
TS2305: has no exported member 'FollowUpQuestion'
Tests  1 failed | 19 passed (20)
```

失败路由测试提交了合法的 1,000 字符贡献者标签；服务返回 200，但 `analysisResultSchema.safeParse(response.body).success` 为 `false`，证明超长 rationale 会越过公共输出边界。

### GREEN

聚焦测试：

```powershell
pnpm exec vitest run tests/server/analysisRoute.test.ts --reporter=dot
```

输出：

```text
Test Files  1 passed (1)
Tests  20 passed (20)
```

全量验证：

```powershell
pnpm test -- --reporter=dot
pnpm exec tsc --noEmit
pnpm build
git diff --check
```

输出：

```text
Test Files  9 passed (9)
Tests  55 passed (55)
✓ built in 1.14s
```

类型检查与差异检查均以退出码 0 完成；构建仍只有既有客户端 bundle 大小提示。
