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
