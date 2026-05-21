# AGENTS.md — Development Guide for Vetra

## 1. 目标

本文件用于约束 AI coding agents 和开发者在本仓库中的行为。

任何代码生成、重构、修复、测试、文档更新，都必须优先遵守本文件。

本项目目标是实现一个：

> Vetra：基于 TypeScript Core + React Renderer + Lexical Adapter + TanStack Virtual 的高性能虚拟化 Block Editor Runtime。

本项目不是 React-only editor。

本项目要求：

```text
Core 层 framework-agnostic
React 是首个官方 renderer
Lexical 只管 active block inline editing
Virtual List 只管可视区域渲染
Command System 管文档变更
```

---

## 2. 项目命名与包名规范

项目正式名称：

```text
Vetra
```

完整定位：

```text
Vetra — Virtualized Block Editor Runtime for Large Documents
```

中文定位：

```text
Vetra 是一个面向大文档场景的高性能虚拟化 Block Editor Runtime。
```

命名含义：

```text
Vetra = Virtualized Editor Runtime
```

对外命名必须统一使用：

```text
Vetra
```

package scope 必须统一使用：

```text
@vetra/*
```

推荐 package 命名：

```text
@vetra/core
@vetra/react
@vetra/lexical
@vetra/blocks-basic
@vetra/persistence-json
@vetra/import-markdown
@vetra/export-markdown
@vetra/import-plain-text
@vetra/export-plain-text
@vetra/import-html
@vetra/export-html
@vetra/devtools
```

命名职责：

```text
@vetra/core
  framework-agnostic editor runtime

@vetra/react
  official React renderer

@vetra/lexical
  internal Lexical active inline editor adapter

@vetra/blocks-basic
  basic block definitions and renderer bindings

@vetra/persistence-json
  internal document persistence adapter

@vetra/import-*
  optional external format import adapters

@vetra/export-*
  optional external format export adapters

@vetra/devtools
  runtime inspector and performance tools
```

禁止：

- 混用其他 package scope；
- 在 public package 中使用临时项目名；
- 使用 `block-editor`、`editor-runtime` 这类泛化名称作为正式包名；
- 让业务 package 直接依赖 `@vetra/*/src/internal`；
- 暴露与正式命名不一致的 public API。

允许：

- demo 应用使用 `vetra-demo`；
- benchmark 使用 `vetra-benchmark`；
- 文档站使用 `vetra-docs`；
- 内部临时实验 package 使用 `@vetra-labs/*`，但不能作为 stable package 发布。

---

## 3. 基本规则

### 2.1 Core 不绑定 framework

packages/core 禁止依赖：

- React；
- Vue；
- Svelte；
- Solid；
- Web Components；
- DOM；
- Lexical；
- TanStack Virtual；
- Browser Selection；
- PointerEvent；
- KeyboardEvent。

packages/core 只负责：

- DocumentState；
- block tree；
- block schema；
- command system；
- transaction；
- selection model；
- history；
- normalization；
- plugin contract；
- persistence contract；
- renderer-neutral adapter contract。

### 2.2 React 是首个官方 renderer

packages/react 是官方 renderer，可以使用：

- React Context；
- React hooks；
- React component composition；
- useSyncExternalStore；
- TanStack Virtual；
- Zustand / Jotai；
- Radix UI；
- Floating UI；
- dnd-kit；
- shadcn/ui 风格组件；
- Storybook；
- React ErrorBoundary。

但 React 相关能力不能反向污染 core。

### 2.3 文档变更必须走 command

所有文档结构变更必须通过 command / transaction。

禁止在 React 组件中直接做：

```ts
state.blocks[id] = nextBlock
state.children[parentId].splice(index, 1)
```

应该使用：

```ts
editor.dispatch({
  type: 'deleteBlock',
  blockId,
})
```

### 2.4 不要把所有逻辑都塞进组件

禁止：

- 在 React component 内直接写复杂文档变更；
- 在 render 阶段修改文档状态；
- 让 Virtual List 成为文档状态源；
- 让 Lexical editor instance 成为整篇文档状态源；
- 输入一个字符导致整个文档重渲染；
- 使用数组 index 作为 block identity；
- 全量渲染所有 block；
- 全量挂载所有 editor instance。

---

## 4. 推荐仓库结构

```text
vetra/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  AGENTS.md
  product.md

  packages/
    core/
      src/
        document/
        block/
        command/
        selection/
        history/
        transaction/
        schema/
        plugin/
        store/
        adapter/
        utils/
      tests/

    react/
      src/
        EditorRoot.tsx
        EditorProvider.tsx
        VirtualBlockList.tsx
        BlockRenderer.tsx
        context/
        hooks/
        store/
        selection/
        drag/
        menu/
      tests/

    lexical/
      src/
        LexicalBlockEditor.tsx
        commandBridge/
        serializers/
        plugins/
        nodes/
      tests/

    blocks-basic/
      src/
        paragraph/
        heading/
        quote/
        code/
        image/
        divider/
        list/
      tests/

    persistence-json/
      src/
        serialize.ts
        deserialize.ts
        migration.ts
      tests/

    devtools/
      src/

    demo/
      src/
        App.tsx
        fixtures/
        benchmark/

    storybook/
      stories/
```

---

## 5. Package 边界

### 4.1 packages/core

允许：

- TypeScript；
- 小型纯函数工具；
- framework-neutral store primitives；
- selector utilities；
- adapter contracts。

禁止：

- React component；
- React hook；
- Vue/Svelte 相关 API；
- DOM 操作；
- LexicalEditor 实例；
- 浏览器 selection；
- pointer event；
- keyboard event；
- TanStack Virtual 直接依赖。

职责：

- DocumentState；
- block tree；
- block schema；
- command system；
- transaction；
- selection model；
- history；
- normalization；
- serialization interface；
- store primitives；
- plugin contracts。

### 4.2 packages/react

允许依赖：

- React；
- @tanstack/react-virtual；
- packages/core；
- packages/blocks-basic；
- packages/lexical。

职责：

- EditorRoot；
- EditorProvider；
- VirtualBlockList；
- BlockRenderer；
- React Context；
- hooks；
- toolbar；
- slash menu；
- drag handle；
- selection overlay；
- React store adapter；
- Storybook stories。

### 4.3 packages/lexical

允许依赖：

- Lexical；
- React；
- packages/core。

职责：

- active block editor；
- Lexical editor lifecycle；
- inline rich text；
- content serialization；
- keyboard command bridge；
- paste bridge；
- IME handling。

注意：Lexical package 可以依赖 React，因为 Lexical 官方 React 适配会用于 active block editor。但 core 不能依赖 Lexical。

### 4.4 packages/blocks-basic

职责：

- 基础 block 定义；
- block schema；
- readonly renderer；
- active renderer；
- block-specific commands。

如果后续需要严格拆分，可以拆成：

```text
blocks-basic-core
blocks-basic-react
```

### 4.5 packages/persistence-json

职责：

- JSON export；
- JSON import；
- schema migration；
- version compatibility。

---

## 6. TypeScript 规范

### 5.1 TypeScript-first

本项目必须坚持 TypeScript-first。

要求：

- 所有源码使用 TypeScript；
- 所有 package 开启 strict；
- 公共 API 必须有明确类型；
- Command、Selection、Block、Transaction 必须类型先行；
- 禁止把复杂结构写成 `Record<string, any>`；
- 禁止为了省事绕过类型系统；
- 类型错误不能用 `as any` 粗暴压制。

允许使用 `unknown`，但必须在边界处显式 narrow。

### 5.2 必须开启 strict

所有 package 必须启用：

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### 5.3 禁止 any 滥用

禁止无理由使用 `any`。

可以使用：

```ts
unknown
Record<string, unknown>
generic type parameters
discriminated unions
```

如果必须使用 `any`，必须添加注释说明原因。

### 5.4 使用 discriminated union

Command、Selection、Block 类型应优先使用 discriminated union。

---

## 7. ESLint 规范

### 6.1 Strict ESLint

必须配置严格 ESLint，并作为 CI 门禁。

推荐配置：

- eslint；
- typescript-eslint；
- eslint-plugin-react；
- eslint-plugin-react-hooks；
- eslint-plugin-jsx-a11y；
- eslint-plugin-import 或 eslint-plugin-perfectionist；
- eslint-plugin-unicorn 可选；
- eslint-config-prettier。

建议规则方向：

- no unused vars；
- no floating promises；
- no implicit any；
- no unsafe assignment；
- no unsafe member access；
- no unstable React key；
- react hooks rules；
- jsx accessibility；
- import order；
- no restricted imports for package boundary。

### 6.2 Package boundary 必须由 ESLint 约束

建议增加 restricted imports。

示例规则方向：

```text
packages/core 不能 import react
packages/core 不能 import lexical
packages/core 不能 import @tanstack/react-virtual
packages/core 不能访问 DOM
packages/lexical 不能直接修改 document state
packages/react 不能绕过 command 修改核心文档结构
```

不要只靠约定，必须尽量用 lint 规则卡住。

---

## 8. 组件与依赖策略

### 7.1 尽量使用成熟组件，不要重复造轮子

本项目不是 UI 基础组件库。

优先采用成熟生态：

- Radix UI；
- shadcn/ui 风格组件；
- Floating UI；
- cmdk；
- dnd-kit；
- TanStack Virtual；
- Zustand / Jotai / useSyncExternalStore；
- class-variance-authority；
- tailwind-merge；
- clsx；
- Lucide React；
- DOMPurify；
- Shiki / highlight.js；
- zod。

禁止无理由自研：

- Popover；
- Tooltip；
- Dialog；
- Dropdown；
- Context Menu；
- Command Palette；
- Drag and Drop 底层能力；
- Virtual List 底层能力；
- Floating positioning；
- HTML sanitizer；
- Code highlighter。

可以自研：

- block model；
- command system；
- selection model；
- history integration；
- Lexical bridge；
- active block lifecycle；
- block-specific behaviors；
- persistence format；
- benchmark harness。

### 7.2 自研前必须说明理由

如果新增自研组件或自研基础能力，PR/变更说明必须回答：

1. 为什么现成组件不适合；
2. 现成组件评估了哪些；
3. 自研范围是否足够小；
4. 是否会增加维护成本；
5. 是否有测试覆盖。

---

## 9. Document Model 规范

### 8.1 Block 必须有稳定 ID

禁止使用数组下标作为 block 标识。

正确：

```ts
type BlockId = string
```

### 8.2 Block Map 与 Children 分离

推荐结构：

```ts
interface DocumentState {
  id: string
  version: number
  rootId: BlockId
  blocks: Record<BlockId, DocBlock>
  children: Record<BlockId, BlockId[]>
}
```

### 8.3 Block 内容和属性分离

推荐：

```ts
interface DocBlock {
  id: BlockId
  type: string
  props?: Record<string, unknown>
  content?: unknown
}
```

`props` 用于 block 元信息，例如图片地址、标题级别、代码语言。

`content` 用于可编辑内容。

### 8.4 Core 不直接暴露 Lexical 类型

Core 层不应该直接使用 Lexical 的类型作为 public model。

推荐抽象：

```ts
interface SerializedInlineContent {
  format: string
  version: number
  data: unknown
}
```

Lexical adapter 负责将 Lexical state 转成该结构。

### 8.5 Unknown Block 必须可降级展示

遇到未知 block type 时，不允许崩溃。

必须提供 fallback renderer。

---

## 10. Command 规范

### 9.1 Command 命名

使用动词开头：

- insertBlock
- deleteBlock
- moveBlock
- splitBlock
- mergeBlock
- updateBlock
- convertBlock
- indentBlock
- outdentBlock
- setSelection

### 9.2 Command 必须可测试

每个 command 至少测试：

- 正常路径；
- 边界路径；
- invalid block id；
- undo/redo 相关行为；
- document tree consistency。

### 9.3 Command 不允许依赖 UI Event

Command 不能依赖：

- React event；
- DOM node；
- LexicalEditor；
- pointer event；
- keyboard event。

UI 层应该把事件转换成 command。

---

## 11. Selection 规范

### 10.1 不要只依赖浏览器 Selection

浏览器 Selection 只能作为输入来源之一。

Editor 必须维护自己的 DocumentSelection。

### 10.2 Lexical selection 必须桥接

Lexical 内部 selection 与 DocumentSelection 之间必须有 bridge。

不要把 Lexical selection 直接暴露给整个 editor。

### 10.3 多 block selection 后置

V1 允许只实现：

- active block selection；
- single block text selection；
- block-level selection；
- keyboard navigation between blocks。

多 block selection 可以在 V2 实现。

---

## 12. Lexical Adapter 规范

### 11.1 Lexical 不拥有 DocumentState

Lexical editor 只拥有当前 active block 的编辑状态。

当 block 激活时：

```text
block.content -> Lexical EditorState
```

当 block 失焦或需要提交时：

```text
Lexical EditorState -> block.content
```

### 11.2 Editor instance 数量限制

默认同一时间只允许一个 active Lexical editor。

可以后续支持 warm editors，但必须有上限。

### 11.3 禁止每个 visible block 都挂 Lexical

即使 virtual list 只渲染 100 个 block，也不允许 100 个 block 都挂 Lexical editor。

默认策略：

```text
visible block = readonly renderer
active block = Lexical editor
```

### 11.4 IME 必须专项处理

任何涉及 Enter、Backspace、blur、unmount 的逻辑，都必须考虑 composition 状态。

需要处理：

- compositionstart；
- compositionupdate；
- compositionend；
- 中文输入法；
- 日文输入法；
- 韩文输入法。

---

## 13. React Renderer 规范

### 12.1 不要让整个文档重渲染

React 层必须避免：

- 输入一个字符导致所有 block 重新 render；
- selection 改变导致所有 block 重新 render；
- scroll 改变导致 DocumentState 更新；
- 菜单状态污染 block renderer。

### 12.2 使用局部订阅

优先使用：

- block-level selector；
- memo；
- stable callbacks；
- stable keys；
- event delegation；
- context split；
- useSyncExternalStore。

### 12.3 BlockRenderer 必须轻量

BlockRenderer 不应该做：

- 大规模 tree traversal；
- schema normalize；
- markdown parse；
- HTML parse；
- remote fetch；
- heavy syntax highlight。

重型逻辑应提前计算或异步处理。

---

## 14. Virtualization 规范

### 13.1 必须使用 block id 作为 item key

禁止使用 index key。

### 13.2 动态高度必须可测量

支持：

- measureElement；
- ResizeObserver；
- height cache；
- scroll anchoring；
- async asset load update。

### 13.3 不允许虚拟列表成为状态源

Virtual List 输出 visible range。

它不应该修改 document tree。

---

## 15. Storybook 规范

### 14.1 必须引入 Storybook

Storybook 是组件预览、开发、交互测试和视觉回归的入口。

必须覆盖：

- 基础 block；
- readonly renderer；
- active renderer；
- toolbar；
- slash menu；
- floating menu；
- drag handle；
- selection overlay；
- error fallback；
- loading state；
- empty state。

### 14.2 每个 Block 至少提供 Story

每个基础 block 至少需要：

- Default；
- Empty；
- Readonly；
- Active；
- Selected；
- LongContent；
- ErrorFallback；
- NarrowContainer。

复杂 block 额外需要：

- Loading；
- Disabled；
- Focused；
- Overflow；
- KeyboardNavigation；
- HighDensity。

### 14.3 Storybook 不允许只做静态展示

Story 必须尽量包含交互状态。

例如：

- slash menu 可以键盘选择；
- toolbar 可以切换 active state；
- block 可以模拟 selected；
- drag handle 可以显示 hover；
- error boundary 可以展示 fallback；
- active editor 可以输入。

### 14.4 Storybook Test Runner

必须配置 Storybook Test Runner 或等效测试方案。

目标：

- 确保 story 可正常渲染；
- 确保核心交互不崩；
- 为后续视觉回归留接口。

---

## 16. Testing 规范

### 15.1 单元测试必须严格

严禁只有 E2E 没有 unit test。

必须为以下模块写单元测试：

- document model；
- block tree；
- command system；
- transaction；
- selection model；
- history；
- serializer；
- deserializer；
- migration；
- schema normalize；
- block plugin registry。

每个 command 至少覆盖：

- 正常路径；
- invalid input；
- boundary case；
- tree consistency；
- undo/redo。

### 15.2 UI 层必须测试

UI 层不是“可选测试”。

必须覆盖：

- EditorRoot；
- EditorProvider；
- hooks；
- BlockRenderer；
- active/readonly switch；
- VirtualBlockList；
- slash menu；
- toolbar；
- drag handle；
- selection overlay；
- error boundary；
- unknown block fallback。

推荐使用：

- Vitest；
- Testing Library；
- Storybook Test Runner；
- Playwright Component Testing。

### 15.3 Playwright 必须用于 E2E

必须配置 Playwright E2E。

E2E 主路径包括：

- 创建文档；
- 输入文本；
- Enter 拆分 block；
- Backspace 合并 block；
- slash menu 插入 block；
- block 删除；
- block 移动；
- 保存；
- 重新加载；
- 导入 JSON；
- 导出 JSON；
- 粘贴 plain text；
- 粘贴 HTML；
- 打开大文档；
- 滚动并编辑远处 block。

### 15.4 Playwright 必须用于性能测试

必须建立 Playwright performance specs。

至少覆盖：

- 1,000 block 首屏渲染；
- 10,000 block 首屏渲染；
- 50,000 block 打开；
- 50,000 block 快速滚动；
- active block 输入延迟；
- block insert 延迟；
- block delete 延迟；
- block move 延迟；
- mounted block 数量；
- active editor instance 数量；
- memory usage；
- long task 观察。

性能测试可以先输出报告，后续再逐步设置硬阈值。

### 15.5 Benchmark fixtures 必须固定

不得每次随机生成不同文档导致 benchmark 不稳定。

fixtures 至少包含：

```text
fixtures/benchmark/blocks-1k.json
fixtures/benchmark/blocks-10k.json
fixtures/benchmark/blocks-50k.json
fixtures/benchmark/mixed-content.json
fixtures/benchmark/code-heavy.json
fixtures/benchmark/image-heavy.json
fixtures/benchmark/deep-nested.json
```

### 15.6 推荐测试脚本

```json
{
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc -b --pretty",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:storybook": "test-storybook",
    "test:e2e": "playwright test tests/e2e",
    "test:perf": "playwright test tests/performance",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build",
    "build": "pnpm -r build"
  }
}
```

### 15.7 CI 门禁

CI 必须至少执行：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build-storybook
pnpm test:storybook
pnpm test:e2e
pnpm test:perf
pnpm build
```

性能测试在早期可以只上传报告，不强制失败。

进入 beta 后，关键指标需要设置阈值。

---

## 17. Performance 规范

### 16.1 性能红线

禁止提交以下实现：

- 一次性渲染 10,000 个 block；
- 一次性挂载 10,000 个 editor；
- 每次输入 setState 整个 document；
- 每次滚动更新 DocumentState；
- 在 render 函数中深拷贝整个 document；
- 每个 block 创建大量 inline function；
- selection 每次变化导致所有 block re-render。

### 16.2 需要采集的指标

建议采集：

- 首屏可见时间；
- block mounted count；
- active editor count；
- scroll duration；
- input latency；
- React commit 时间；
- long task 数量；
- JS heap used size；
- dropped frames；
- operation duration。

### 16.3 性能测试原则

- 使用固定浏览器版本；
- 使用固定 viewport；
- 使用固定 fixtures；
- 测试前关闭无关动画；
- 每个测试至少运行多次取中位数；
- 报告需要保存为 artifact；
- 不要把性能测试写成不可复现的手工观察。

---

## 18. Persistence 规范

### 17.1 JSON 必须带版本

格式：

```ts
interface SerializedDocument {
  format: 'virtual-block-editor'
  version: number
  document: DocumentState
}
```

### 17.2 必须支持 migration

新增字段、block type、schema 改动必须通过 migration 处理。

不要直接破坏旧文档。

### 17.3 不要保存 UI 状态

不应该保存：

- hover 状态；
- menu open 状态；
- React component state；
- DOM selection；
- scroll transient state。

可以保存：

- document content；
- block order；
- block props；
- schema version；
- persistent selection；
- metadata。

---

## 19. Error Handling 规范

### 18.1 不要因为单个 block 崩溃整篇文档

Block renderer 必须有 ErrorBoundary。

未知 block、错误 block、损坏 content 应显示 fallback。

### 18.2 Core 应返回明确错误

不要 silent fail。

推荐返回：

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }
```

或者在内部统一使用明确的 error code。

---

## 20. Documentation 规范

任何重要变更必须同步更新：

- product.md；
- package README；
- API docs；
- benchmark notes；
- migration notes；
- Storybook stories。

新增能力必须说明：

- 解决什么问题；
- 属于哪个 package；
- 是否影响 schema；
- 是否影响 performance；
- 是否需要 migration；
- 是否需要 E2E；
- 是否需要 Storybook case。

---

## 21. Development Workflow

### 20.1 安装

```bash
pnpm install
```

### 20.2 开发

```bash
pnpm dev
```

### 20.3 Storybook

```bash
pnpm storybook
```

### 20.4 测试

```bash
pnpm test
```

### 20.5 类型检查

```bash
pnpm typecheck
```

### 20.6 E2E

```bash
pnpm test:e2e
```

### 20.7 性能测试

```bash
pnpm test:perf
```

### 20.8 构建

```bash
pnpm build
```

以上命令可以根据实际仓库脚本调整，但 pnpm 是唯一包管理器。

---

## 22. Agent 执行任务时的流程

AI agent 或开发者处理任务时，应按以下顺序：

1. 阅读本 AGENTS.md；
2. 阅读 product.md；
3. 判断修改属于哪个 package；
4. 检查是否破坏 package 边界；
5. 先补测试或确认测试点；
6. 实现最小可行变更；
7. 运行 lint；
8. 运行 typecheck；
9. 运行相关 tests；
10. 更新 Storybook，如涉及 UI；
11. 更新必要文档；
12. 给出变更摘要和风险说明。

---

## 23. 常见任务指导

### 22.1 新增 block type

需要修改：

- core block schema；
- renderer block plugin；
- React readonly renderer；
- React active renderer；
- serializer；
- tests；
- Storybook stories；
- docs。

不能绕过 command system 修改文档。

### 22.2 新增 command

需要修改：

- packages/core command；
- transaction；
- history；
- tests；
- React event bridge，如需要；
- Lexical command bridge，如需要。

### 22.3 优化性能

必须先明确瓶颈来源：

- core calculation；
- renderer render；
- DOM paint；
- Lexical update；
- virtual list measurement；
- serialization；
- syntax highlight；
- image layout。

不要盲目 memo。

### 22.4 修复 selection

必须同时考虑：

- DocumentSelection；
- browser selection；
- Lexical selection；
- active block；
- virtualized unmount；
- copy/paste；
- keyboard navigation；
- IME composition。

### 22.5 修改 persistence schema

必须：

- 增加 version；
- 增加 migration；
- 增加旧格式测试；
- 更新 product.md；
- 更新 migration notes。

---

## 24. 代码风格

### 23.1 命名

- 类型使用 PascalCase；
- 函数使用 camelCase；
- command type 使用动词短语；
- block type 使用 kebab-case 或明确的小写字符串；
- package name 使用统一 scope。

### 23.2 函数设计

优先：

- 小函数；
- 明确输入输出；
- 可测试；
- UI 和 command 分离。

避免：

- 巨大组件；
- 隐式全局状态；
- 魔法字符串；
- 深层嵌套；
- 在 UI 层混入复杂 core 逻辑。

### 23.3 注释

注释应该解释“为什么”，不要重复“做了什么”。

复杂边界必须注释：

- selection；
- history；
- transaction；
- IME；
- virtualization measurement；
- migration。

---

## 25. 安全与稳定性

### 24.1 外部 HTML 输入

粘贴 HTML 时必须 sanitize。

不允许直接信任外部 HTML。

### 24.2 URL 字段

图片、链接、iframe 等 URL 必须经过校验。

### 24.3 Custom Block

自定义 block 不应执行任意脚本。

后续如果支持 embed，需要 sandbox 策略。

---

## 26. Release 原则

Vetra V1 alpha 标准：

- Core 不依赖 React / DOM / Lexical；
- React renderer 可用；
- 能编辑基础文档；
- 能保存/加载；
- 能处理 10,000 block benchmark；
- 不全量挂载 editor；
- 核心命令有测试；
- Storybook 可运行；
- demo 可运行；
- Playwright E2E 主路径可运行。

Vetra V1 beta 标准：

- 主要编辑路径稳定；
- 常见快捷键可用；
- 基础 copy/paste 可用；
- 性能面板可查看；
- 文档格式具备 migration；
- E2E 覆盖核心路径；
- 性能测试有报告；
- CI 质量门禁完整。

---

## 28. InlineContent 与外部格式边界

### 27.1 Core 不允许暴露 Lexical

packages/core 禁止：

- import lexical；
- export Lexical 类型；
- export Lexical EditorState；
- 将 Lexical serialized state 作为 public model；
- 在 DocumentState / DocBlock / InlineContent 中出现 Lexical 专属字段；
- 要求调用方传入 Lexical config；
- 要求调用方理解 Lexical node。

Lexical 只能存在于：

```text
packages/lexical
```

React renderer 可以使用 lexical adapter，但不能把 Lexical 类型泄漏到 public API。

### 27.2 Core 必须使用自有 InlineContent

Core 中的富文本内容必须使用 editor 自有的 InlineContent AST。

推荐 public model：

```ts
export interface InlineContent {
  type: 'inline-content'
  version: number
  children: InlineNode[]
}

export type InlineNode = TextInlineNode | LinkInlineNode | MentionInlineNode | InlineCodeNode

export interface TextInlineNode {
  type: 'text'
  text: string
  marks?: InlineMark[]
}

export interface LinkInlineNode {
  type: 'link'
  href: string
  children: InlineNode[]
}

export interface MentionInlineNode {
  type: 'mention'
  id: string
  label: string
}

export interface InlineCodeNode {
  type: 'inline-code'
  text: string
}

export type InlineMark = 'bold' | 'italic' | 'underline' | 'strike' | 'code'
```

如果需要新增 inline node，必须：

- 更新类型；
- 更新 serializer；
- 更新 deserializer；
- 更新 lexical adapter；
- 更新 tests；
- 更新 migration，如影响已保存数据；
- 更新 Storybook 相关 case，如影响 UI。

### 27.3 Lexical Adapter 只做转换和编辑

packages/lexical 负责：

```text
InlineContent -> Lexical EditorState
Lexical EditorState -> InlineContent
```

禁止：

- 让 DocumentState 直接保存 Lexical EditorState；
- 让 persistence-json 保存 Lexical 原始结构；
- 让 core command 操作 Lexical node；
- 让业务代码依赖 Lexical node 作为文档协议。

### 27.4 Markdown / Plain Text / HTML 不进入 Core

Core 不负责解析外部格式。

禁止在 packages/core 中引入：

- markdown parser；
- HTML parser；
- DOMPurify；
- unified / remark / rehype；
- plain text import 策略；
- HTML sanitize 逻辑。

正确做法：

```text
外部格式 -> import adapter / 调用方 parser -> DocumentState -> editor
```

### 27.5 Import / Export Adapter 必须独立

Markdown、Plain Text、HTML 的 import/export 必须作为独立 package 或由下游调用方实现。

推荐 package：

```text
packages/import-markdown
packages/export-markdown
packages/import-plain-text
packages/export-plain-text
packages/import-html
packages/export-html
```

这些包可以依赖外部 parser。

但是它们不能反向污染 core。

依赖方向必须是：

```text
import-markdown -> core
export-markdown -> core
import-html -> core
export-html -> core
```

禁止：

```text
core -> import-markdown
core -> import-html
core -> DOMPurify
core -> remark / rehype
```

### 27.6 下游调用方拥有转换策略

如果业务要渲染 Markdown，应由业务或 import adapter 负责：

```text
Markdown
  -> Markdown AST
  -> DocumentState
  -> Editor Renderer
```

如果业务要导入 Plain Text，应由业务或 import adapter 负责：

```text
Plain Text
  -> 自定义拆分策略
  -> DocumentState
  -> Editor Renderer
```

不要在 core 中默认规定：

- 按行拆；
- 按空行拆；
- 自动识别标题；
- 自动识别列表；
- 自动识别代码块。

这些属于 importer 策略，不属于 editor core。

### 27.7 Persistence 保存内部格式

persistence-json 只能保存 editor 内部结构：

```text
DocumentState
InlineContent
Block props
Block tree
Schema version
```

禁止把以下内容作为主持久化格式：

- Markdown 原文；
- Plain Text 原文；
- HTML 原文；
- Lexical EditorState；
- 外部 parser AST。

如果业务要保存原始输入内容，应在业务系统 metadata 或外部存储中处理。

### 27.8 测试要求

必须增加测试覆盖：

- InlineContent -> Lexical -> InlineContent roundtrip；
- unknown inline node fallback；
- marks 序列化；
- link 序列化；
- mention 序列化；
- inline code 序列化；
- persistence 不包含 Lexical 专属字段；
- core package 不引入 lexical；
- core package 不引入 markdown/html parser；
- import adapter 输出合法 DocumentState。

### 27.9 ESLint 边界规则

必须通过 restricted imports 或等效规则约束：

```text
packages/core/** 禁止 import lexical
packages/core/** 禁止 import @lexical/*
packages/core/** 禁止 import react
packages/core/** 禁止 import remark / rehype / unified
packages/core/** 禁止 import dompurify
packages/core/** 禁止 import @tanstack/react-virtual
```

这类边界不能只靠人工 code review。

---

## 30. Prettier、Husky、pnpm 与 Node.js 版本

### 29.1 必须使用 Prettier

项目必须引入 Prettier，并作为格式化唯一标准。

要求：

- Prettier 管格式；
- ESLint 管代码质量；
- 两者不要职责重叠；
- CI 必须执行 `pnpm format:check`；
- 提交前必须执行格式化或格式检查。

推荐脚本：

```json
{
  "scripts": {
    "format": "prettier . --write",
    "format:check": "prettier . --check"
  }
}
```

推荐配置：

```json
{
  "semi": false,
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all",
  "arrowParens": "always"
}
```

### 29.2 必须使用 Husky

项目必须引入 Husky 管理 Git hooks。

Husky 不只是格式化工具，必须用于提交前质量门禁。

推荐依赖：

```text
husky
lint-staged
prettier
eslint
typescript
vitest
```

推荐脚本：

```json
{
  "scripts": {
    "prepare": "husky"
  }
}
```

### 29.3 pre-commit 规则

pre-commit 至少执行：

```text
lint-staged
pnpm typecheck
```

推荐 `.husky/pre-commit`：

```bash
pnpm lint-staged
pnpm typecheck
```

推荐 `lint-staged`：

```json
{
  "*.{ts,tsx,js,jsx,json,md,css,scss,yml,yaml}": ["prettier --write"],
  "*.{ts,tsx}": ["eslint --fix"]
}
```

注意：

- lint-staged 只处理 staged files；
- typecheck 仍然需要全量执行；
- 不允许提交类型错误代码；
- 不允许提交格式漂移代码。

### 29.4 pre-push 规则

pre-push 建议执行：

```text
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

推荐 `.husky/pre-push`：

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

如果仓库规模变大，本地 pre-push 可以只保留关键检查，但 CI 必须完整执行。

### 29.5 pnpm 是唯一包管理器

项目只使用 pnpm。

禁止提交：

```text
package-lock.json
yarn.lock
bun.lockb
```

必须提交：

```text
pnpm-lock.yaml
```

根 `package.json` 必须声明：

```json
{
  "name": "vetra",
  "packageManager": "pnpm@latest"
}
```

如需稳定复现，可以改成明确版本：

```json
{
  "packageManager": "pnpm@10.x"
}
```

### 29.6 Node.js 版本策略

项目 Node.js 版本策略：

```text
开发基线：当前时间线下的 Node.js Current 稳定发布线
兼容目标：当前 LTS + 当前 Current
```

截至 2026-05-21：

```text
Node.js Current: 26.x
Node.js Latest LTS: 24.x
```

推荐 `package.json`：

```json
{
  "engines": {
    "node": ">=24 <27",
    "pnpm": ">=10"
  }
}
```

推荐本地开发版本：

```text
Node.js 26.x
```

CI matrix 至少覆盖：

```text
24.x
26.x
```

如果代码使用了 Node.js 26 专属能力，必须：

- 更新 `engines.node`；
- 更新 `.node-version` 和 `.nvmrc`；
- 更新 CI matrix；
- 在文档中说明原因；
- 确认 Storybook、Playwright、Vite、ESLint、TypeScript 等工具链兼容。

### 29.7 版本文件

仓库根目录建议维护：

```text
.node-version
.nvmrc
```

内容示例：

```text
26
```

如果团队使用 Volta，可以在 `package.json` 增加：

```json
{
  "volta": {
    "node": "26.2.0",
    "pnpm": "10.x"
  }
}
```

Volta 不强制，但 Node/pnpm 版本必须有明确记录。

### 29.8 CI 不能依赖本地 hooks

Husky 是本地保护，CI 是最终门禁。

CI 必须独立执行：

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build-storybook
pnpm test:storybook
pnpm test:e2e
pnpm test:perf
pnpm build
```

任何本地 hook 可以跳过的检查，CI 都必须补上。

---

## 31. 最重要的三条

1. Core 层不绑定 React / DOM / Lexical。
2. Lexical 只做 active block inline editor，不做整篇文档状态源。
3. Virtual List 只做视图虚拟化，不做业务状态源。

违反这三条，项目会逐渐退化成难维护的普通富文本编辑器。
