# 任务 4 报告：CoreUI 产品壳层

## 状态

实现已完成，提交待创建。

## 上游核验

- 上游仓库：`https://github.com/coreui/coreui-free-react-admin-template`
- 固定提交：`1c09f27ef436a1e358be5d10daf3b1f27f2e20a6`
- 使用只读 `gh api` 读取并核验的文件：
  - `src/layout/DefaultLayout.jsx`
  - `src/components/AppSidebar.jsx`
  - `src/components/AppHeader.jsx`
  - `LICENSE`
- 许可证：MIT，版权声明为 `Copyright (c) 2026 creativeLabs Łukasz Holeczek.`
- 复制并改编的最小模式：固定侧边栏、头部和弹性内容容器。未复制或引入 Redux、路由、认证、主题、图标、用户菜单、演示导航与页脚。

## TDD

- RED：创建 `src/coreui/AppShell.test.tsx` 后运行
  `pnpm exec vitest run src/coreui/AppShell.test.tsx`。
- 结果：预期失败，Vite 无法解析尚不存在的 `./AppShell`；测试文件 1 个失败、0 个测试执行。
- 运行时恢复后重新创建同一行为测试并继续最小实现。
- GREEN：主任务使用稳定 `vmForks` 通道复核，`AppShell.test.tsx` 1/1 通过；测试本身 766ms，因 jsdom 环境启动总耗时 117.87 秒，超过单命令目标，已如实记录。

## 依赖环境阻塞

- 曾出现解析缓慢；后续 `pnpm install --offline --ignore-scripts --package-import-method=copy` 成功完成，CoreUI 运行时链接可解析。
- `package.json` 与 `pnpm-lock.yaml` 包含精确 CoreUI 运行时依赖：5.9.0、3.1.0、2.3.0、5.13.0。

## 修改范围

- 已创建受控的 `AppShell.tsx`、`AppSidebar.tsx`、`AppTopbar.tsx`、`navigation.ts`、`THIRD_PARTY_NOTICES.md` 和行为测试。
- 仅追加壳层样式与 README 内部文档链接；未修改应用接入、Provider 或业务功能。
- 验证：`git diff --check` 通过；主任务运行 `node ...tsc --noEmit` exit 0，运行 `node ...vite build` exit 0（仅既有大代码块警告）。
- 提交待创建。

## Native navigation keyboard fix

- RED: the new Enter and Space activation assertions each failed because keyboard activation plus the browser click called the callback twice.
- GREEN: removed the navigation button's manual `onKeyDown`; native button activation now uses only `onClick`.
- Verification: `AppShell.test.tsx` 3/3, `pnpm exec tsc --noEmit`, and `git diff --check` passed.

## 产品文案复审修复

- 经营筛选表单的辅助功能名称已从内部阶段性称谓改为中性业务用语“经营数据筛选”。
- 数据未就绪时不再将内部导入命令或来源标识渲染到产品页面；页面保留“请在数据管理流程中执行导入命令”的可执行引导。
- `ProductCopy.test.tsx` 真实渲染数据准备状态与筛选组件，验证产品可见和辅助功能文本均不含来源、许可或演示声明，并验证不存在被错误替换的命令。
- 验证：`ProductCopy.test.tsx` 1/1 通过（threads 单 worker）；`tsc --noEmit` 与 `git diff --check` 均通过。
