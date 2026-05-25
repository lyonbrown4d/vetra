# Product.md — Vetra Virtualized Block Editor Runtime

## 1. 项目定位

本项目定位为：

> 面向大文档场景的高性能虚拟化 Block Editor Runtime。

本项目不是普通富文本编辑器，也不是单纯的 Notion-like Block Editor UI。

本项目的核心是构建一套可长期演进的文档编辑运行时，支持：

- 大文档高性能渲染；
- Block-based document model；
- Virtualized rendering；
- Active block inline editing；
- Framework-agnostic core；
- React 官方 renderer；
- 可扩展 block schema；
- 可控的编辑体验；
- 后续支持协作、评论、增量持久化。

一句话：

> Core 层不绑定任何前端框架，React 是第一阶段官方视图实现。

---

## 2. 项目命名

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

Vetra 不是普通富文本编辑器，也不是单纯的 React Block Editor UI。

Vetra 的核心识别点是：

- 大文档；
- 虚拟渲染；
- Block Document Runtime；
- framework-agnostic core；
- React 官方 renderer；
- Lexical 内部 active inline editor adapter；
- 可扩展 block schema；
- 可插拔 import/export adapter；
- 严格工程质量门禁。

推荐包名规划：

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

其中：

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

命名约束：

- 对外统一使用 `Vetra`；
- package scope 统一使用 `@vetra/*`；
- 文档、代码示例、包名、public API 必须统一使用 `Vetra` / `@vetra/*`；
- 禁止在 public 文档、示例代码、package name、public API 中使用 `@editor/*` 等临时命名；
- 文档中避免继续使用泛化项目名作为正式名称；
- `Virtualized Block Editor Runtime` 作为产品定位保留；
- `Vetra` 作为品牌名和 package namespace 使用。

---

## 3. 核心判断

当前市面上 Block Editor 很多，例如 BlockNote、Editor.js、Plate、Tiptap、BlockSuite 等。

但它们大多不是专门围绕以下目标设计：

```text
Framework-agnostic Core
+
Block-level Virtualization
+
Active Block Editor Lifecycle
+
Large Document Rendering
+
Business Block Extensibility
```

本项目要做的是：

```text
Document Runtime
  + Block Store
  + Command System
  + Selection Model
  + History Manager
  + Virtualized Renderer Adapter
  + Active Inline Editor Adapter
  + Persistence Adapter
```

核心设计不是“一个大富文本编辑器管整篇文档”，而是：

```text
Core 负责文档模型、命令、selection、history、transaction
Renderer 负责视图渲染和交互组织
Virtual List 负责可视区域渲染
Lexical 只负责 active block 的 inline rich text
```

---

## 4. 设计原则

### 3.1 Core 层不绑定 framework

Core 层必须保持 framework-agnostic。

Core 不依赖：

- React；
- Vue；
- Svelte；
- Solid；
- Web Components；
- DOM；
- Browser Selection；
- Lexical Editor Instance；
- TanStack Virtual；
- Pointer / Keyboard Event。

Core 负责：

- DocumentState；
- block tree；
- block schema；
- command system；
- transaction；
- selection model；
- history；
- normalization；
- persistence interface；
- plugin interface；
- renderer-neutral adapter contracts。

这样做的原因：

- core 可单元测试；
- core 可用于 React/Vue/Svelte 等不同 renderer；
- core 可用于服务端导入导出；
- core 可用于未来协作层；
- core 不受 UI 生命周期污染；
- core 能长期稳定演进。

### 3.2 React 是首个官方 Renderer，不是 Core 依赖

第一阶段官方实现以 React 为主。

React 层可以充分利用：

- React Context；
- React hooks；
- React component composition；
- React memo；
- useSyncExternalStore；
- TanStack Virtual；
- Zustand / Jotai；
- Radix UI；
- shadcn/ui 风格组件；
- Floating UI；
- dnd-kit；
- Storybook。

但是这些只能出现在 React renderer package 中，不能污染 core。

推荐边界：

```text
packages/core
  framework-agnostic runtime

packages/react
  official React renderer

packages/lexical
  Lexical active block adapter

packages/blocks-basic
  basic block definitions + renderer bindings

packages/persistence-json
  JSON persistence adapter
```

### 3.3 Lexical 只作为 active block inline editor

Lexical 不负责整篇文档结构。

Lexical 负责：

- 段落内部富文本；
- 标题内部富文本；
- 引用内部富文本；
- 行内样式；
- link、mention、inline code；
- 当前 active block 的输入、组合输入、selection；
- 与外层 command system 的桥接。

Lexical 不负责：

- 整篇文档 block tree；
- block 顺序；
- block 拖拽；
- block 层级；
- 多 block selection；
- 跨 block undo / redo；
- 文档持久化协议；
- 虚拟滚动。

### 3.4 Virtual List 只负责视图虚拟化

Virtual List 不应该成为业务状态源。

它只负责：

- 根据滚动位置计算 visible range；
- 挂载可视区域附近的 block；
- 支持 overscan；
- 支持动态高度测量；
- 支持 scroll anchoring；
- 配合 block renderer 做按需渲染。

Virtual List 不负责：

- block 数据结构；
- selection；
- undo / redo；
- 持久化；
- 命令语义；
- block schema。

### 3.5 非 active block 默认 readonly render

大多数 block 不应该长期挂载编辑器实例。

推荐策略：

```text
readonly renderer -> 用户聚焦 -> active editor -> blur/滚出视口 -> serialize -> readonly renderer
```

这样可以控制：

- DOM 数量；
- editor instance 数量；
- event listener 数量；
- React reconciliation 成本；
- 内存占用。

---

## 5. 目标场景

### 4.1 第一阶段目标场景

- React 企业后台中的文档编辑；
- 技术文档编辑；
- 内部知识库；
- 长表单/流程文档；
- 业务说明文档；
- 带图片、代码块、表格的结构化文档；
- 内部平台中的富文本配置模块。

### 4.2 后续目标场景

- 类 Notion 文档；
- 类飞书文档；
- 可嵌入不同前端框架的文档编辑器；
- 支持本地优先的文档编辑器；
- 支持协作和评论的团队知识系统；
- 支持自定义业务 block 的低代码文档容器。

---

## 6. 非目标

V1 不追求以下能力：

- 完整多框架 renderer；
- 完整 Office 级排版；
- 完整 Notion 数据库能力；
- 完整多人协作；
- 完整评论系统；
- 完整版本 diff；
- 复杂表格编辑器；
- 公式编辑器；
- 页面级权限系统；
- AI 生成能力；
- 移动端深度优化。

Core 层需要为多 renderer 保持边界，但 V1 只实现 React renderer。

---

## 7. 技术选型

### 6.1 基础技术栈

- Language: TypeScript
- Package Manager: pnpm
- Core: framework-agnostic TypeScript
- Official Renderer: React
- Inline Editor: Lexical
- Virtualization: TanStack Virtual for React renderer
- State Management: core store primitives + React adapter
- UI Components: 优先采用成熟生态组件
- Build: Vite / tsup
- Unit Test: Vitest
- UI / E2E / Performance Test: Playwright
- Component Preview: Storybook
- Playground: React + Vite

### 6.2 为什么 Core 不绑定 framework

Framework-agnostic core 的优势：

- 核心模型稳定；
- 测试简单；
- 不被 UI 生命周期污染；
- 便于未来支持 Vue/Svelte；
- 便于服务端导入导出；
- 便于协作层接入；
- 便于长期维护。

### 6.3 为什么第一阶段使用 React renderer

React 是第一阶段官方 renderer，因为：

- 生态成熟；
- 复杂交互能力强；
- 与 TanStack Virtual、Radix UI、Floating UI、dnd-kit 结合自然；
- 适合开发 Storybook；
- 适合做组件级测试；
- 适合企业后台集成。

### 6.4 为什么选择 Lexical

Lexical 的优势：

- 编辑器内核偏性能；
- 有自己的 DOM reconciliation；
- EditorState 是可序列化 snapshot；
- 命令系统清晰；
- 插件模型适合做桥接；
- React 适配成熟；
- 适合做 active block 的局部 inline editor。

Lexical 不负责大文档虚拟渲染，大文档能力由 Core Runtime + Renderer Adapter 提供。

### 6.5 为什么选择 TanStack Virtual

TanStack Virtual 更适合底层自研：

- headless；
- 可控性强；
- 适合复杂 block；
- 可以自定义测量逻辑；
- 不强制 UI 结构；
- 适合封装到 React renderer。

如果后续发现动态高度处理成本过高，可以评估 React Virtuoso 作为 React renderer 的替代 adapter。

---

## 8. 总体架构

```text
┌───────────────────────────────────────────┐
│ Application                               │
│ - routing                                 │
│ - permissions                             │
│ - business state                          │
│ - persistence api                         │
└──────────────────────┬────────────────────┘
                       │
┌──────────────────────▼────────────────────┐
│ Official React Renderer                    │
│ - EditorRoot                               │
│ - toolbar                                  │
│ - slash menu                               │
│ - floating menu                            │
│ - block drag handle                        │
│ - shortcut layer                           │
│ - React Context / Hooks                    │
└──────────────────────┬────────────────────┘
                       │
┌──────────────────────▼────────────────────┐
│ Virtualized Block Renderer                 │
│ - TanStack Virtual                         │
│ - visible range                            │
│ - overscan                                 │
│ - dynamic height measurement               │
│ - scroll anchoring                         │
└──────────────────────┬────────────────────┘
                       │
┌──────────────────────▼────────────────────┐
│ Block Renderer Registry                    │
│ - readonly renderer                        │
│ - active renderer                          │
│ - custom business block renderer           │
└──────────────────────┬────────────────────┘
                       │
┌──────────────────────▼────────────────────┐
│ Lexical Active Block Adapter               │
│ - paragraph editor                         │
│ - heading editor                           │
│ - quote editor                             │
│ - inline marks                             │
│ - commands bridge                          │
└──────────────────────┬────────────────────┘
                       │
┌──────────────────────▼────────────────────┐
│ Framework-agnostic Core Runtime            │
│ - document state                           │
│ - block tree                               │
│ - schema registry                          │
│ - command system                           │
│ - transaction                              │
│ - selection model                          │
│ - history manager                          │
│ - normalization                            │
└──────────────────────┬────────────────────┘
                       │
┌──────────────────────▼────────────────────┐
│ Persistence / Future Collab Adapter        │
│ - JSON adapter                             │
│ - local storage / IndexedDB                │
│ - remote api                               │
│ - future Yjs adapter                       │
└───────────────────────────────────────────┘
```

---

## 9. 模块划分

推荐 monorepo 结构：

```text
vetra/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  product.md
  AGENTS.md

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

    react/
      src/
        EditorRoot.tsx
        EditorProvider.tsx
        VirtualBlockList.tsx
        BlockRenderer.tsx
        hooks/
        context/
        store/
        selection/
        drag/
        menu/

    lexical/
      src/
        LexicalBlockEditor.tsx
        lexicalNodes/
        lexicalPlugins/
        serializers/
        commandBridge/

    blocks-basic/
      src/
        paragraph/
        heading/
        quote/
        code/
        image/
        divider/
        list/

    persistence-json/
      src/
        serialize.ts
        deserialize.ts
        migration.ts

    devtools/
      src/
        RuntimeInspector.tsx
        SelectionInspector.tsx
        PerformancePanel.tsx

    playground/
      src/
        App.tsx
        fixtures/
        benchmark/

    storybook/
      .storybook/
      stories/
```

### 8.1 packages/core

Framework-agnostic 文档运行时。

禁止依赖：

- React；
- Vue；
- Svelte；
- DOM；
- Lexical；
- TanStack Virtual；
- 浏览器事件对象。

负责：

- block model；
- document tree；
- command system；
- transaction；
- selection model；
- history；
- schema registry；
- normalization；
- serialization interface；
- plugin contract；
- renderer-neutral adapter contract。

### 8.2 packages/react

官方 React renderer。

负责：

- EditorRoot；
- EditorProvider；
- VirtualBlockList；
- BlockRenderer；
- React context；
- hooks；
- UI events；
- selection overlay；
- drag handle；
- menus；
- React store adapter；
- Storybook stories。

### 8.3 packages/lexical

Lexical 适配层。

负责：

- active block editor；
- lexical editor lifecycle；
- block content serialization；
- inline marks；
- keyboard command bridge；
- IME 兼容；
- paste bridge；
- Lexical state 与 block content 的转换。

### 8.4 packages/blocks-basic

基础 block 集合。

负责：

- paragraph；
- heading；
- quote；
- code；
- image；
- divider；
- list；
- callout。

可以拆分为：

```text
blocks-basic-core
blocks-basic-react
```

如果 V1 不想复杂化，可以先放在一个 package 中，但必须避免让 core 反向依赖 React。

### 8.5 packages/persistence-json

文档 JSON 持久化。

负责：

- export；
- import；
- schema migration；
- format version；
- backward compatibility。

---

## 10. 核心数据模型

### 9.1 DocumentState

```ts
export type BlockId = string

export interface DocumentState {
  id: string
  version: number
  rootId: BlockId
  blocks: Record<BlockId, DocBlock>
  children: Record<BlockId, BlockId[]>
  meta?: DocumentMeta
}
```

### 9.2 DocBlock

```ts
export interface DocBlock {
  id: BlockId
  type: string
  props?: Record<string, unknown>
  content?: unknown
  createdAt?: number
  updatedAt?: number
}
```

### 9.3 富文本 Block

```ts
export interface RichTextBlock extends DocBlock {
  type: 'paragraph' | 'heading' | 'quote'
  content: SerializedInlineContent
}
```

注意：Core 层不要直接暴露 Lexical 类型。Lexical serialized state 应在 lexical adapter 中转换为 core 可识别的 `SerializedInlineContent`。

### 9.4 非富文本 Block

```ts
export interface ImageBlock extends DocBlock {
  type: 'image'
  props: {
    src: string
    width?: number
    height?: number
    alt?: string
    caption?: SerializedInlineContent
  }
}
```

### 9.5 设计要求

- block 必须有稳定 id；
- block 顺序不依赖数组下标作为身份；
- block 内容和 block props 分离；
- block tree 与 block map 分离；
- block type 必须可注册；
- 自定义 block 应通过插件注册；
- unknown block 必须有 fallback renderer。

---

## 11. React API 设计

### 10.1 推荐使用方式

```tsx
import { EditorRoot } from '@vetra/react'
import { basicBlocks } from '@vetra/blocks-basic/react'

export function DocumentEditorPage() {
  return (
    <EditorRoot
      initialValue={document}
      blocks={basicBlocks}
      onChange={(nextDocument) => {
        // save or debounce persistence
      }}
    />
  )
}
```

### 10.2 Provider 入口

```tsx
<EditorProvider editor={editor}>
  <EditorToolbar />
  <VirtualBlockList />
</EditorProvider>
```

### 10.3 Hooks

推荐提供：

```ts
useEditor()
useDocument()
useBlock(blockId)
useBlockSelection()
useActiveBlock()
useEditorCommand()
useEditorStore()
useVisibleBlocks()
```

### 10.4 自定义 React Block

```tsx
const AlertBlock = defineReactBlock({
  type: 'alert',
  schema: {
    props: {
      level: 'info',
    },
  },
  readonlyRenderer: AlertReadonly,
  activeRenderer: AlertActive,
})
```

---

## 12. Command System

所有编辑行为都应抽象为 command。

例如：

```ts
export type EditorCommand =
  | InsertBlockCommand
  | DeleteBlockCommand
  | SplitBlockCommand
  | MergeBlockCommand
  | MoveBlockCommand
  | UpdateBlockCommand
  | SetSelectionCommand
  | IndentBlockCommand
  | OutdentBlockCommand
```

### 11.1 常见命令

- insertBlockAfter
- insertBlockBefore
- deleteBlock
- updateBlock
- splitBlock
- mergeBlock
- moveBlock
- indentBlock
- outdentBlock
- setActiveBlock
- setBlockSelection
- clearSelection
- convertBlockType
- duplicateBlock

### 11.2 设计要求

- command 必须可测试；
- command 不应该直接依赖 React event；
- command 不应该直接依赖 Lexical editor；
- command 应返回 transaction result；
- command 应支持 undo / redo；
- renderer 层只负责把 UI 事件转换为 command。

---

## 13. Selection Model

Selection 是本项目最关键的复杂点之一。

V1 可以先支持：

- active block selection；
- collapsed caret；
- 单 block 内选择；
- block-level selection；
- keyboard navigation between blocks。

V2 支持：

- 多 block selection；
- 跨 block copy；
- 跨 block delete；
- 跨 block paste；
- block range selection；
- shift + arrow 选择；
- mouse drag selection。

### 12.1 推荐数据结构

```ts
export type DocumentSelection = NoneSelection | BlockSelection | TextSelection | RangeBlockSelection

export interface BlockSelection {
  type: 'block'
  blockId: BlockId
}

export interface TextSelection {
  type: 'text'
  blockId: BlockId
  anchor: InlinePoint
  focus: InlinePoint
}

export interface RangeBlockSelection {
  type: 'range-block'
  anchorBlockId: BlockId
  focusBlockId: BlockId
}
```

### 12.2 注意事项

- Lexical selection 和 Document selection 需要桥接；
- 多个 Lexical editor instance 之间不能直接共享浏览器 selection；
- 跨 block 选择需要自研 overlay 和 selection model；
- copy / paste 必须支持自定义 MIME；
- selection 状态不能只存在 DOM 中。

---

## 14. History / Undo / Redo

V1 至少支持：

- 单 block 内 undo / redo；
- block 插入删除 undo / redo；
- block 移动 undo / redo；
- block 类型转换 undo / redo。

历史记录建议由 command runtime 统一管理。

Lexical 内部 history 可以用于 active block 的细粒度输入，但在 block commit 时需要与外部 history 合并。

推荐策略：

```text
active block 输入阶段：
  Lexical local history

block commit / blur / transaction boundary：
  Document history checkpoint
```

---

## 15. 渲染策略

### 14.1 状态流

```text
DocumentState
  -> Renderer Adapter
  -> visible block ids
  -> VirtualBlockList
  -> BlockRenderer
  -> readonly or active editor
```

### 14.2 Block 渲染生命周期

```text
block enters viewport
  -> render readonly view

user focuses block
  -> mount active editor
  -> load block content into inline editor

user edits
  -> local inline editor state update
  -> debounce/transaction commit to block store

user blurs or block leaves viewport
  -> serialize inline editor state
  -> update block store
  -> unmount inline editor
  -> render readonly view
```

### 14.3 Editor Instance 限制

V1 建议：

- 同时 active editor 数量：1；
- 可选 warm editor 数量：0 到 2；
- visible readonly blocks：由 virtual list 控制；
- overscan：根据 block 平均高度动态调整。

---

## 16. 性能目标

### 15.1 V1 性能指标

以本地 benchmark 文档为准：

- 1,000 blocks：打开流畅；
- 10,000 blocks：首屏可快速显示；
- 50,000 blocks：可滚动，可定位，可按需编辑；
- 可视区实际 DOM block 数量稳定；
- active editor 数量默认不超过 1；
- 普通输入不触发整篇文档重渲染；
- block store 更新应尽量局部化；
- 大文档滚动不应持续产生明显 GC 抖动。

### 15.2 性能原则

禁止：

- 全量渲染所有 block；
- 全量挂载所有 inline editor；
- 输入一个字符导致所有 block re-render；
- 用数组下标作为 block key；
- 在 render 阶段做复杂 schema normalize；
- 在组件中做大规模 tree traversal。

建议：

- 使用 memo；
- 使用 selector；
- 使用 block-level subscription；
- 使用 immutable update；
- 使用 lazy renderer；
- 使用 requestIdleCallback 做非关键计算；
- 使用 worker 做重型 import/export；
- 使用 benchmark fixture 持续压测。

---

## 17. 持久化

### 16.1 V1 JSON 格式

```ts
export interface SerializedDocument {
  format: 'virtual-block-editor'
  version: number
  document: DocumentState
}
```

### 16.2 持久化要求

- 支持 schema version；
- 支持 migration；
- 支持 block-level dirty tracking；
- 支持增量保存接口；
- 支持完整导入导出；
- 支持未知 block 的 fallback 展示；
- 不允许直接持久化 renderer component 状态。

### 16.3 后续扩展

- IndexedDB local-first；
- remote sync；
- CRDT adapter；
- markdown import/export；
- HTML import/export；
- docx export；
- PDF export。

---

## 18. 插件与扩展

插件类型：

- Core Block Plugin；
- Renderer Block Plugin；
- Inline Editor Plugin；
- Command Plugin；
- Shortcut Plugin；
- Persistence Plugin；
- Future Collab Plugin。

### 17.1 Core Block Plugin

```ts
export interface BlockPlugin<TBlock extends DocBlock = DocBlock> {
  type: string
  schema: BlockSchema<TBlock>
  normalize?: BlockNormalize<TBlock>
  commands?: BlockCommand[]
  serializer?: BlockSerializer<TBlock>
}
```

### 17.2 React Block Plugin

```ts
export interface ReactBlockPlugin<TBlock extends DocBlock = DocBlock> {
  type: string
  readonlyRenderer: React.ComponentType<BlockRendererProps<TBlock>>
  activeRenderer?: React.ComponentType<BlockRendererProps<TBlock>>
}
```

### 17.3 插件原则

- core plugin 不能依赖 renderer；
- renderer plugin 可以绑定具体 framework；
- 插件不能绕过 command system 修改 DocumentState；
- 插件可以注册 serializer；
- 插件可以注册 shortcut；
- 插件不能破坏 block id 稳定性。

---

## 19. V1 功能范围

### 18.1 必须实现

- framework-agnostic core runtime；
- React official renderer；
- block store；
- command system；
- paragraph block；
- heading block；
- quote block；
- todo block；
- callout block；
- divider block；
- code block 简版；
- virtualized block renderer；
- active block Lexical editor；
- Enter 拆分 block；
- Backspace 合并 block；
- block insert；
- block delete；
- block move；
- slash menu 简版，包括 alias / keyword query 和 icon metadata；
- readonly renderer；
- JSON import/export；
- Storybook；
- playground 页面；
- playground runtime inspector；
- benchmark fixture；
- 单元测试；
- Playwright E2E；
- Playwright performance tests。

### 18.2 可以延后

- 完整多框架 renderer；
- 多人协作；
- 评论；
- 复杂表格；
- Markdown 完整兼容；
- 多 block selection；
- AI block；
- 权限系统；
- 页面模板；
- 移动端优化。

### 18.3 Playground Notion-like 交互基线

Playground 应作为下游调用方理解 Vetra 能力的完整示例，而不是只展示静态 demo。

当前 React renderer / playground 的 Notion-like 基线包括：

- 编辑画布不使用 card 外框，active block 不弹出卡片化容器；
- slash menu 使用 Floating UI 在 active block 附近浮层定位，不占据文档流；
- slash menu 支持 `/h1`、`/h2`、`/todo`、`/note`、`/code js` 等 alias / token query，并用现有 icon library 展示 block action；
- 每个 block 前展示 gutter controls，包括加号插入段落和拖拽手柄；
- block reorder 通过 dnd-kit 在 React renderer 内完成交互编排，并通过 core `moveBlock` command 修改文档顺序；
- playground inspector 展示 document version、active block、selected count、mounted block count、active editor count 和 activity log；
- V1 只支持 root-level visible block reorder，nested indent / outdent 和跨层级拖拽后续迭代。

这些能力属于 `@vetra/react` 和 playground 展示层，不允许反向污染 `@vetra/core`。

---

## 20. 里程碑

### M0：技术验证

目标：

- 验证 Virtual List + active Lexical block 是否可行；
- 验证 block 进入/离开 viewport 时内容不丢；
- 验证 10,000 blocks 滚动流畅；
- 验证 Enter / Backspace 跨 block 行为。

产出：

- React playground；
- benchmark fixture；
- 初始核心模型；
- 技术风险记录。

### M1：Core Runtime

目标：

- 完成 document model；
- 完成 framework-agnostic block store；
- 完成 command system；
- 完成 selection model V1；
- 完成 history V1；
- 完成 JSON persistence。

产出：

- packages/core；
- packages/persistence-json；
- 单元测试；
- 核心 API 文档。

### M2：React Renderer

目标：

- 完成 EditorRoot；
- 完成 EditorProvider；
- 完成 VirtualBlockList；
- 完成 BlockRendererRegistry；
- 完成 basic block；
- 完成 slash menu 简版。

产出：

- packages/react；
- packages/blocks-basic；
- playground app；
- Storybook。

### M3：Lexical Adapter

目标：

- 完成 paragraph / heading / quote active editor；
- 完成 serializer；
- 完成 command bridge；
- 完成 IME 基础验证；
- 完成 paste 基础能力。

产出：

- packages/lexical；
- 编辑体验闭环。

### M4：测试与性能基线

目标：

- 完成严格单元测试；
- 完成 Storybook stories；
- 完成 Playwright E2E；
- 完成 Playwright performance tests；
- 固定 benchmark fixtures；
- 完成 CI 质量门禁。

产出：

- alpha release；
- playground site；
- benchmark report。

---

## 21. 主要风险

### 20.1 跨 block selection

这是最大风险。

多个独立 inline editor instance 之间不会天然共享 selection。

需要自研 DocumentSelection、selection overlay、copy/paste bridge。

### 20.2 Undo / Redo 边界

Lexical 内部 history 和外部 command history 需要协调。

否则会出现：

- 输入撤销正常，但 block 结构撤销异常；
- block 合并后无法恢复；
- 跨 block 操作历史混乱。

### 20.3 IME 输入

中文输入法、日文输入法、组合输入场景必须专项测试。

尤其是：

- Enter；
- Backspace；
- compositionstart；
- compositionupdate；
- compositionend；
- blur；
- editor unmount。

### 20.4 动态高度测量

图片、代码块、表格、折叠块会导致高度变化。

需要处理：

- measureElement；
- resize observer；
- scroll anchoring；
- block height cache；
- async content load。

### 20.5 粘贴与复制

需要支持：

- plain text；
- HTML；
- markdown；
- 自定义 block MIME；
- 从外部网页粘贴；
- 从本编辑器复制多 block。

---

## 22. 工程实现风格

### 21.1 TypeScript-first

本项目必须坚持 TypeScript-first。

要求：

- 所有核心代码使用 TypeScript；
- 默认开启 strict；
- 公共 API 必须有明确类型；
- 不允许无理由使用 any；
- 类型设计优先于运行时猜测；
- block schema、command、selection、transaction 都应使用明确类型建模；
- 对外暴露 API 时优先使用泛型和 discriminated union。

TypeScript 不只是类型检查工具，而是本项目的核心设计工具。

### 21.2 Strict ESLint

项目必须配置严格 ESLint。

建议包含：

- eslint；
- typescript-eslint；
- eslint-plugin-react；
- eslint-plugin-react-hooks；
- eslint-plugin-jsx-a11y；
- eslint-plugin-import 或 eslint-plugin-perfectionist；
- eslint-plugin-unicorn 可选；
- eslint-config-prettier。

必须要求：

- CI 中 eslint 不通过则构建失败；
- 禁止未使用变量；
- 禁止隐式 any；
- 禁止滥用 non-null assertion；
- 禁止 React hooks 规则违规；
- 禁止不稳定 key；
- 禁止在 render 中执行副作用；
- 禁止直接使用数组 index 作为 block key；
- 禁止复杂组件中混入文档变更逻辑。

### 21.3 尽量采用成熟组件，不重复造轮子

本项目的核心壁垒是：

```text
Virtualized Block Editor Runtime
+
Large Document Rendering
+
Active Block Editing Lifecycle
+
Command / Selection / History
```

不是普通 UI 组件。

因此 UI 层应尽量采用成熟组件和生态能力。

优先复用：

- Radix UI；
- shadcn/ui 风格组件；
- Floating UI；
- cmdk；
- TanStack Virtual；
- Zustand / Jotai / useSyncExternalStore；
- dnd-kit；
- Lucide React；
- class-variance-authority；
- tailwind-merge；
- clsx；
- zod 可用于 schema 校验；
- DOMPurify 用于 HTML sanitize；
- Shiki 或 highlight.js 用于代码高亮。

不建议自研：

- Dropdown；
- Popover；
- Tooltip；
- Dialog；
- Context Menu；
- Command Palette；
- Drag and Drop 基础能力；
- 虚拟滚动基础能力；
- 复杂浮层定位；
- 代码高亮引擎；
- HTML sanitize。

但以下部分需要自研：

- block document model；
- command system；
- selection model；
- active editor lifecycle；
- Lexical bridge；
- block-level persistence；
- performance benchmark；
- editor-specific keyboard behavior。

### 21.4 Storybook 作为组件预览与开发入口

项目必须引入 Storybook。

Storybook 用途：

- 预览基础 block；
- 预览 readonly renderer；
- 预览 active renderer；
- 预览 toolbar；
- 预览 slash menu；
- 预览 floating menu；
- 预览 drag handle；
- 预览 selection overlay；
- 预览异常 block fallback；
- 构造极端 UI 状态；
- 做组件级交互测试；
- 做视觉回归测试的基础。

每个基础 block 至少需要提供：

- default story；
- active story；
- readonly story；
- empty story；
- selected story；
- error/fallback story；
- long content story。

Storybook 不只是展示工具，也是组件开发和验收入口。

---

## 23. 测试策略

### 22.1 单元测试必须严格

本项目必须坚持严格单元测试。

核心原则：

- command 必须可单测；
- document model 必须可单测；
- selection model 必须可单测；
- history 必须可单测；
- persistence migration 必须可单测；
- block schema normalize 必须可单测；
- serializer/deserializer 必须可单测。

测试不能只覆盖 happy path。

### 22.2 UI 层也必须测试

UI 层不能只靠人工点。

React 组件需要覆盖：

- EditorRoot 初始化；
- EditorProvider context；
- BlockRenderer 选择正确 renderer；
- active/readonly 切换；
- slash menu 打开和关闭；
- toolbar 状态；
- drag handle 展示；
- selection overlay；
- unknown block fallback；
- error boundary；
- block-level subscription 是否避免无关重渲染。

组件测试可以使用：

- Vitest；
- Testing Library；
- Storybook Test Runner；
- Playwright Component Testing。

### 22.3 Playwright 必须用于 E2E 与性能测试

项目必须引入 Playwright。

Playwright 不只用于 E2E，也用于 UI 行为测试和性能基准测试。

E2E 必须覆盖：

- 创建文档；
- 输入文本；
- Enter 创建新 block；
- Backspace 合并 block；
- slash menu 插入 block；
- block 拖拽；
- 保存文档；
- 重新加载文档；
- 导入 JSON；
- 导出 JSON；
- 打开大文档；
- 滚动到远处 block；
- 编辑远处 block；
- 粘贴 plain text；
- 粘贴 HTML；
- 中文输入法基础场景。

性能测试必须覆盖：

- 1,000 block 首屏渲染；
- 10,000 block 首屏渲染；
- 50,000 block 打开与滚动；
- 大文档快速滚动；
- active block 输入延迟；
- block 插入延迟；
- block 删除延迟；
- block 移动延迟；
- 滚动过程中 mounted block 数量；
- active editor instance 数量；
- React commit duration；
- memory usage 观察。

性能测试需要形成固定 benchmark fixtures，避免每次手工测试。

### 22.4 推荐测试分层

```text
Unit Test
  -> core command / model / selection / history / persistence

Component Test
  -> React component / hooks / renderer / menu / toolbar

Storybook Test
  -> component state / interaction / visual baseline

Playwright E2E
  -> real browser editing flow

Playwright Performance
  -> large document / scroll / input latency / memory
```

### 22.5 CI 质量门禁

CI 至少包含：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:storybook
pnpm test:e2e
pnpm test:perf
pnpm build
```

其中：

- lint 不通过不能合并；
- typecheck 不通过不能合并；
- unit test 不通过不能合并；
- E2E 主路径不通过不能合并；
- 性能测试如果超过阈值需要标记失败或至少输出告警报告；
- benchmark 结果需要可追踪。

---

## 24. 验收标准

V1 可认为完成，当满足：

- core 层不依赖 React / DOM / Lexical；
- 可以在 React 应用中直接使用；
- 可以创建、编辑、保存、加载文档；
- 支持 paragraph / heading / quote / code / divider；
- 10,000 block 文档可以打开和滚动；
- active editor 不会随所有 block 一起挂载；
- Enter / Backspace 具备基本跨 block 行为；
- block insert / delete / move 可用；
- JSON import/export 可用；
- 有 Storybook；
- 有基础 benchmark；
- 有严格单元测试；
- 有 Playwright E2E；
- 有 Playwright performance tests；
- CI 质量门禁可运行。

---

## 26. 输入格式与 InlineContent 边界

### 25.1 Core 不暴露 Lexical 依赖

Lexical 是内部 active inline editor adapter，不是 public data model。

Core 层禁止：

- 暴露 Lexical 类型；
- 暴露 Lexical EditorState；
- 要求调用方传入 Lexical config；
- 要求调用方理解 Lexical node；
- 将 Lexical serialized JSON 作为标准文档格式；
- 在 DocumentState 中出现 lexical 专属字段。

调用方不应该知道当前 inline editor 使用 Lexical。

对调用方而言，稳定协议只有：

```text
DocumentState
DocBlock
InlineContent
Command
Selection
Plugin Contract
```

Lexical 只是实现细节。

### 25.2 Core 使用自有 InlineContent AST

Core 应定义 editor 自有的 inline content 结构。

推荐结构：

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

富文本 block 使用该结构：

```ts
export interface ParagraphBlock extends DocBlock {
  type: 'paragraph'
  content: InlineContent
}

export interface HeadingBlock extends DocBlock {
  type: 'heading'
  props: {
    level: 1 | 2 | 3 | 4 | 5 | 6
  }
  content: InlineContent
}
```

### 25.3 Lexical Adapter 负责双向转换

Lexical adapter 负责：

```text
InlineContent -> Lexical EditorState
Lexical EditorState -> InlineContent
```

该转换只存在于 `packages/lexical`。

Core 和 persistence 不应该保存 Lexical 原始结构。

推荐边界：

```text
DocumentState
  -> InlineContent
  -> Lexical Adapter
  -> Lexical EditorState
  -> Active Editor UI
```

编辑完成后：

```text
Lexical EditorState
  -> Lexical Adapter
  -> InlineContent
  -> DocumentState
```

这样未来即使替换 Lexical，也不会影响：

- DocumentState；
- persistence；
- import/export；
- business block；
- renderer plugin；
- 历史文档格式。

### 25.4 Markdown / Plain Text / HTML 不属于 Core 职责

Markdown、Plain Text、HTML 都属于外部输入格式，不是 core 内部模型。

Core 不负责：

- Markdown parse；
- Markdown render；
- Plain Text 拆段策略；
- HTML parse；
- HTML sanitize；
- 外部文档格式推断；
- 业务文本格式识别。

正确流程是：

```text
Markdown / Plain Text / HTML / 外部 JSON
        ↓
调用方 parser 或 import adapter
        ↓
DocumentState
        ↓
Editor Runtime
        ↓
Renderer
```

例如 Markdown：

```ts
import { markdownToDocument } from '@vetra/import-markdown'

const document = markdownToDocument(markdown)

editor.load(document)
```

或者调用方自行处理：

```ts
const ast = parseMarkdown(markdown)
const document = convertMarkdownAstToDocument(ast)

editor.load(document)
```

Plain Text 同理：

```ts
import { plainTextToDocument } from '@vetra/import-plain-text'

const document = plainTextToDocument(text)

editor.load(document)
```

### 25.5 Import / Export Adapter 是可选包

Markdown、Plain Text、HTML 的导入导出能力应该作为独立 adapter package，而不是塞进 core。

推荐 package：

```text
packages/
  import-markdown/
  export-markdown/
  import-plain-text/
  export-plain-text/
  import-html/
  export-html/
```

这些包负责：

- 外部格式解析；
- 外部 AST 到 DocumentState 的转换；
- DocumentState 到外部格式的转换；
- 业务可定制转换策略。

这些包可以依赖对应 parser，例如 markdown parser、HTML parser、sanitize 工具等。

但是：

```text
packages/core 不能依赖这些 import/export adapter
```

### 25.6 Downstream 可以自行定义转换策略

不同业务对 Markdown / Plain Text / HTML 的转换策略不一样。

例如 Plain Text 可以有多种策略：

```text
按空行拆 paragraph
按每行拆 paragraph
识别标题
识别列表
识别代码块
识别业务模板
识别工单格式
```

这些策略不应该写死在 core。

Core 只接收最终转换完成的 `DocumentState`。

### 25.7 Persistence 保存 Editor 内部结构

`persistence-json` 保存的是 editor 内部结构，不保存外部输入格式。

即：

```text
保存 DocumentState
保存 InlineContent
不保存 Markdown 原文作为主格式
不保存 Plain Text 原文作为主格式
不保存 Lexical EditorState 作为主格式
```

如果业务需要保留原始 Markdown，可以放在业务自己的 metadata 或外部系统中，不应该作为 editor core 的默认持久化格式。

### 25.8 这条规则的核心目的

这条规则是为了保证：

- Core 稳定；
- 外部格式解耦；
- Lexical 可替换；
- 文档格式长期可迁移；
- 下游业务有充分转换自由；
- editor runtime 不被 Markdown/HTML/Plain Text 细节污染。

---

## 28. 格式化、提交门禁与运行时版本

### 27.1 必须引入 Prettier

项目必须使用 Prettier 统一代码格式。

Prettier 负责格式，ESLint 负责质量规则，两者职责必须分离。

要求：

- 所有源码、配置、Markdown、JSON、YAML 都应纳入格式化；
- CI 中必须校验格式；
- 本地提交前必须执行格式校验或自动格式化；
- 不允许因为个人 IDE 配置导致格式漂移；
- 不允许用 ESLint 规则替代 Prettier 的格式职责。

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

具体格式细节可以后续调整，但项目必须保证全仓库格式一致。

### 27.2 Husky 提交前必须严格校验

项目必须引入 Husky 作为 Git hooks 管理工具。

提交前必须执行严格校验，不能只做格式化。

推荐组合：

```text
husky
lint-staged
prettier
eslint
typescript
vitest related tests
```

pre-commit 至少执行：

```text
lint-staged
pnpm typecheck
```

lint-staged 至少执行：

```json
{
  "*.{ts,tsx,js,jsx,json,md,css,scss,yml,yaml}": ["prettier --write"],
  "*.{ts,tsx}": ["eslint --fix"]
}
```

如果仓库规模变大，`pnpm typecheck` 可以放到 pre-push，但 CI 必须完整执行。

### 27.3 Pre-push 建议执行更严格校验

pre-push 建议执行：

```text
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

如果本地执行成本过高，可以保留在 CI 中强制执行，但主分支合并前必须全部通过。

### 27.4 pnpm 是唯一包管理器

本项目只使用 pnpm。

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

建议在 `package.json` 中声明：

```json
{
  "packageManager": "pnpm@latest"
}
```

如果后续需要固定版本，可以改成明确版本号。

### 27.5 Node.js 版本策略

本项目的 Node.js 版本策略：

```text
开发基线：当前时间线下的 Node.js Current 稳定发布线
兼容目标：当前 LTS + 当前 Current
```

截至 2026-05-21：

```text
Node.js Current: 26.x
Node.js Latest LTS: 24.x
```

建议配置：

```json
{
  "engines": {
    "node": ">=24 <27",
    "pnpm": ">=10"
  }
}
```

推荐本地开发使用：

```text
Node.js 26.x
```

CI 建议至少覆盖：

```text
Node.js 24.x LTS
Node.js 26.x Current
```

如果项目使用了 Node.js 26 专属能力，必须：

- 在文档中说明原因；
- 更新 engines；
- 移除 24.x CI；
- 确认 Storybook、Playwright、Vite、ESLint、TypeScript 等工具链兼容。

### 27.6 推荐版本文件

建议在仓库根目录维护：

```text
.node-version
.nvmrc
```

示例：

```text
26
```

如果使用 Volta，也可以在 `package.json` 中补充：

```json
{
  "volta": {
    "node": "26.2.0",
    "pnpm": "10.x"
  }
}
```

是否使用 Volta 可根据团队习惯决定，不强制。

### 27.7 CI 必须验证格式与提交门禁等价能力

CI 不能只依赖 Husky。

Husky 是本地门禁，CI 是最终门禁。

CI 至少执行：

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

本地 hook 可以为了速度做裁剪，但 CI 不能缺失核心质量检查。

---

## 29. 一句话总结

本项目的核心不是“做一个 React-only 编辑器”。

本项目的核心是：

> 构建一个 core framework-agnostic、React 作为首个官方 renderer、高性能、可虚拟化、可扩展、面向大文档的 Block Editor Runtime。
