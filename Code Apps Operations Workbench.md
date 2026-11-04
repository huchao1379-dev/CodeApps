# Code Apps Operations Workbench

**基于 Microsoft Power Apps Code Apps 的可复用企业业务工作台框架**

> Building reusable, extensible, and maintainable enterprise business applications with Power Apps Code Apps.

## 1. 项目概述（Project Overview）

### 1.1 项目背景

随着 AI 辅助开发和现代前端技术的发展，企业业务应用的开发方式正在发生变化。

传统低代码平台能够帮助开发人员快速构建常规业务表单、数据管理和审批应用，但在复杂前端交互、高度定制化 UI、跨记录操作、复杂状态管理以及组件复用等场景下，可能面临一定的开发灵活性和维护成本限制。

Microsoft Power Apps Code Apps 为开发者提供了使用 React、TypeScript 等现代前端技术构建 Power Platform 应用的能力，同时保留与 Power Platform 数据和服务生态的集成方式。

这使得开发者可以结合专业前端开发能力与企业低代码平台的连接器、数据服务和自动化能力，探索更加灵活的企业业务应用开发模式。

本项目希望通过系统化学习、官方案例研究和真实业务实践，探索 Code Apps 在企业复杂业务场景中的应用价值。

### 1.2 项目定位

本项目不是单纯开发一个工单派发系统，也不是尝试构建一个能够适配所有业务的万能低代码平台。

项目的核心定位是：

**Code Apps Operations Workbench：一个面向企业内部运营管理场景的可复用业务工作台框架。**

采用：

**通用工作台框架 + 领域业务模块（Domain Modules）**

的设计模式。

通过抽象不同业务场景中重复出现的前端交互、数据访问、页面布局和工程化能力，形成统一的公共框架。

再通过不同的领域模块实现具体业务需求，例如：

- 工单派发与服务管理。
- 库存与资产管理。
- 企业运营管理。

第一个业务模块用于验证框架的基本能力，第二个业务模块用于验证框架的实际复用价值。

### 1.3 核心目标

项目分为三个主要目标。

**目标一：系统化学习 Power Apps Code Apps**

从零开始掌握 Code Apps 的产品定位、运行机制、开发模式、技术架构、数据集成和应用发布方式。

形成完整的学习文档和技术研究资料。

**目标二：探索 Code Apps 的企业应用价值**

研究 Code Apps 与 Canvas Apps、Model-driven Apps 的适用场景差异。

重点分析：

- React 与 TypeScript 带来的前端开发自由度。
- 复杂交互与跨记录操作。
- 通用组件与业务组件的复用。
- Power Fx 和 Delegation 的适用范围与限制。
- Dataverse 数据查询和多表关联。
- Power Automate 流程集成。
- SharePoint、Office 365 等企业连接器的使用。
- 企业级工程化、权限和部署管理。

**目标三：构建可复用业务工作台框架**

通过工单管理和库存管理两个业务场景，验证公共框架的可复用性、可扩展性和维护能力。

最终形成：

1. Code Apps 学习与技术研究文档。
2. Operations Workbench Starter Kit。
3. 工单运营管理应用。
4. 库存管理应用。
5. Code Apps 企业应用最佳实践总结。

## 2. 核心设计理念（Design Principles）

项目遵循以下设计原则。

| 设计原则               | 说明                                       |
| ---------------------- | ------------------------------------------ |
| Reusability            | 将不同业务场景重复出现的能力沉淀为公共组件 |
| Extensibility          | 通过领域模块适配不同业务需求               |
| Separation of Concerns | 前端展示、数据访问和业务规则分层           |
| Maintainability        | 使用标准化的工程结构和类型约束             |
| Scalability            | 支持未来接入更多业务模块                   |
| Security First         | 关键权限和业务规则由受信任的服务端控制     |
| Platform Integration   | 充分利用 Power Platform 生态能力           |

### 2.1 不做万能业务模板

本项目不试图通过一套 JSON 配置描述所有业务。

不同业务拥有不同的数据模型、状态流转和业务规则。

因此采用以下原则：

- 通用交互由公共框架负责。
- 数据访问由领域适配器负责。
- 业务规则由具体领域模块及受信任的服务端逻辑负责。
- 页面差异通过模块扩展和少量元数据配置实现。

这样既可以保证复用，又能够避免过度抽象。

## 3. 技术选型与 Code Apps 价值（Technology Strategy）

### 3.1 为什么选择 Power Apps Code Apps？

Code Apps 的价值在于将专业前端开发能力与 Power Platform 企业生态结合。

传统 Canvas Apps 可以通过 Power Fx 和控件组合快速构建应用。

Code Apps 则允许开发人员利用现代 Web 开发技术，更灵活地组织页面、交互和代码。

本项目重点研究以下能力：

| 技术维度    | 研究内容                 | 应用价值           |
| ----------- | ------------------------ | ------------------ |
| Frontend    | React、TypeScript        | 灵活构建复杂页面   |
| Component   | 可复用 UI 组件           | 降低重复开发成本   |
| Interaction | 拖拽、批量操作、联动视图 | 实现复杂业务交互   |
| Data Access | Dataverse、API、分页     | 处理复杂数据查询   |
| Automation  | Power Automate           | 实现自动化业务流程 |
| Integration | SharePoint、Office 365   | 整合企业服务       |
| Engineering | Git、测试、CI/CD         | 提升工程化能力     |

### 3.2 与其他 Power Apps 开发方式的对比

本项目不会预设 Code Apps 在所有场景下都优于 Canvas Apps。

而是根据业务需求和实现成本进行技术选型。

| 对比维度   | Canvas Apps                    | Model-driven Apps  | Code Apps              |
| ---------- | ------------------------------ | ------------------ | ---------------------- |
| 开发方式   | 可视化低代码                   | 模型驱动           | 代码驱动               |
| 前端自由度 | 受控件和平台能力约束           | 受平台布局约束     | 高                     |
| UI 自定义  | 中                             | 较低               | 高                     |
| 复杂交互   | 可以实现，但可能增加公式复杂度 | 受标准交互模式约束 | 灵活                   |
| 组件复用   | Canvas 组件                    | 平台组件和配置     | React 组件及代码模块   |
| 数据查询   | Power Fx 与连接器              | 平台数据模型       | SDK、连接器及 API      |
| 跨记录交互 | 可实现                         | 适合标准记录操作   | 适合自定义复杂交互     |
| 工程化     | 平台化为主                     | 平台化为主         | 可采用现代前端工程实践 |
| 适用场景   | 表单、审批、轻量业务应用       | 标准化业务管理     | 高度定制的业务工作台   |

**核心研究问题：**

在什么情况下，使用 Code Apps 能够显著降低复杂业务应用的实现成本？

哪些场景仍然应该优先使用 Canvas Apps 或 Model-driven Apps？

### 3.3 重点技术研究方向

#### A. 前端与组件复用

- React 组件化开发。
- TypeScript 类型管理。
- Fluent UI。
- Tailwind CSS。
- 通用数据表格。
- 筛选器、分页器和排序。
- 详情侧栏。
- Kanban 看板。
- 时间轴。
- 图表与数据可视化。
- 响应式布局。

#### B. 复杂业务交互

- 跨记录批量操作。
- 拖拽式任务分配。
- 多维度组合筛选。
- 页面间状态联动。
- 动态视图切换。
- 多条记录的批量更新。
- 操作确认、冲突提示和失败恢复。

#### C. 数据访问与查询

- Dataverse CRUD。
- 多表关联。
- Lookup 字段。
- 服务端过滤。
- 分页与排序。
- 批量操作。
- 数据缓存。
- Power Fx Delegation 对比。
- API 限流和查询性能。

#### D. Power Platform 集成

- Dataverse。
- Power Automate。
- SharePoint。
- Office 365 Users。
- Outlook。
- Teams。
- Custom API。
- 外部 REST API。

具体连接方式和能力必须以当前 Code Apps SDK、连接器支持范围和官方文档为准。

## 4. 整体系统架构（Architecture）

### 4.1 总体架构

采用分层架构，将工作台公共能力与领域业务能力解耦。

```
Code Apps Operations Workbench
│
├── 1. Workbench Shell
│   ├── Application Layout
│   ├── Navigation
│   ├── Theme & Design System
│   ├── Permission Awareness
│   ├── Error & Loading States
│   └── Logging & Monitoring
│
├── 2. Shared UI Components
│   ├── Data Table
│   ├── Filter & Search
│   ├── Pagination & Sorting
│   ├── Detail Drawer
│   ├── Kanban Board
│   ├── Timeline
│   ├── Bulk Actions
│   └── Drag & Drop
│
├── 3. Data Access Layer
│   ├── Dataverse Adapter
│   ├── SharePoint Adapter
│   ├── Office 365 Adapter
│   └── Custom API Adapter
│
├── 4. Domain Modules
│   ├── Work Orders
│   ├── Inventory
│   └── Operations Analytics
│
└── 5. Platform Services
    ├── Power Apps SDK
    ├── Power Automate
    ├── Dataverse
    ├── SharePoint
    └── Microsoft 365
```

### 4.2 Workbench Shell：通用工作台

负责所有业务模块共享的基础应用能力。

包括：

- 页面布局。
- 侧边导航。
- 顶部操作栏。
- 主题与样式。
- 页面路由。
- 加载状态。
- 错误提示。
- 空数据状态。
- 权限感知。
- 应用版本信息。

### 4.3 Shared UI Components：公共交互组件

负责不同业务模块中重复出现的 UI 和交互能力。

重点沉淀：

| 公共组件      | 功能       |
| ------------- | ---------- |
| DataTable     | 数据表格   |
| FilterPanel   | 组合筛选   |
| Pagination    | 分页       |
| DetailDrawer  | 详情侧栏   |
| KanbanBoard   | 看板       |
| Timeline      | 操作时间轴 |
| BulkActionBar | 批量操作   |
| StatusBadge   | 状态标签   |
| ConfirmDialog | 操作确认   |
| EmptyState    | 空数据展示 |
| ErrorState    | 异常展示   |
| LoadingState  | 加载状态   |

### 4.4 Data Access Layer：数据访问层

统一不同数据源的访问方式。

负责：

- 数据查询。
- 数据转换。
- 分页处理。
- 排序与过滤。
- 错误处理。
- 数据更新。
- 批量命令。
- API 调用封装。

不建议通用 UI 组件直接依赖具体 Dataverse 表结构。

### 4.5 Domain Modules：领域业务模块

每个业务模块负责自身的数据模型、业务规则和专属交互。

例如：

**Work Orders Module**

- 工单状态。
- 工单优先级。
- SLA。
- 技能匹配。
- 派单规则。

**Inventory Module**

- 库存余额。
- 入库与出库。
- 库存调拨。
- 库存盘点。
- 补货规则。

通用框架不负责理解这些领域规则。

## 5. 模块扩展设计（Domain Module Architecture）

### 5.1 领域模块接口

建议通过统一接口规范不同业务模块的数据访问和操作能力。

```
interface DomainAdapter<T> {
  list(query: Query): Promise<Page<T>>;

  getById(id: string): Promise<T>;

  getCommands(): CommandDefinition<T>[];

  executeCommand(
    command: string,
    ids: string[]
  ): Promise<CommandResult>;
}
```

业务模块通过独立定义提供页面、字段和数据适配能力：

```
interface DomainDefinition<T> {
  name: string;

  adapter: DomainAdapter<T>;

  views: ViewDefinition[];

  fields: FieldDefinition[];

  policies: PolicyDefinition[];
}
```

以上接口为初步设计示例，后续应根据实际 SDK 和业务需求调整。

### 5.2 模块接入方式

```
Workbench
   │
   ├── Register WorkOrder Module
   │      ├── WorkOrder Adapter
   │      ├── WorkOrder Views
   │      ├── WorkOrder Commands
   │      └── WorkOrder Rules
   │
   ├── Register Inventory Module
   │      ├── Inventory Adapter
   │      ├── Inventory Views
   │      ├── Inventory Commands
   │      └── Inventory Rules
   │
   └── Register Operations Module
          ├── Operations Adapter
          ├── Operations Views
          └── Operations Analytics
```

新增业务时，优先通过模块注册和扩展实现，而不是修改公共框架的核心逻辑。

### 5.3 适合配置化的内容

- 字段显示。
- 表格列顺序。
- 页面菜单。
- 状态颜色。
- 默认视图。
- 简单筛选条件。
- 功能开关。
- 页面布局。

### 5.4 不适合配置化的内容

- 状态流转规则。
- 审批条件。
- SLA 计算。
- 库存扣减。
- 并发控制。
- 技能匹配。
- 财务和合规规则。
- 核心业务权限。

核心业务规则应由具体领域模块和服务端负责。

## 6. 业务实践场景（Business Use Cases）

本项目采用两个主要业务模块进行验证。

### 6.1 Phase 1：IT Service Operations Platform

**企业 IT 服务工单运营管理平台**

这是第一个实践项目，也是框架设计和开发的主要验证场景。

#### 业务背景

企业 IT 服务部门需要处理大量用户工单，包括：

- IT 故障。
- 软件安装。
- 账号权限申请。
- 设备维修。
- 网络问题。
- 业务系统支持。

传统方式可能依赖人工查看、分配和跟踪工单。

本项目通过统一运营工作台，提高工单管理和人员调度的效率。

#### 核心功能模块

| 模块            | 主要功能                |
| --------------- | ----------------------- |
| Dashboard       | 工单总量、SLA、处理效率 |
| Ticket Center   | 工单查询、筛选、详情    |
| Dispatch Center | 工单派发、拖拽分配      |
| Resource Center | 工程师信息、技能、负载  |
| Workflow Center | 通知、审批、流程状态    |

#### 重点展示功能

**功能一：拖拽式工单派发**

- 待分配工单展示。
- 工程师任务看板。
- 拖拽分配。
- 工作量统计。
- 冲突检测。
- 分配结果确认。

**功能二：跨记录批量操作**

- 多选工单。
- 批量调整负责人。
- 批量修改优先级。
- 批量修改状态。
- 批量执行业务命令。
- 操作结果反馈。

**功能三：动态运营分析**

- 工单数量统计。
- SLA 超时监控。
- 工程师工作负载。
- 工单处理趋势。
- 多维度筛选。
- 图表与列表联动。

#### 建议的数据实体

| Dataverse 表     | 主要用途     |
| ---------------- | ------------ |
| WorkOrder        | 工单主数据   |
| Employee         | 工程师和员工 |
| Department       | 部门         |
| ServiceCategory  | 服务分类     |
| Assignment       | 派发记录     |
| WorkOrderHistory | 工单操作历史 |
| Skill            | 技能         |
| EmployeeSkill    | 员工技能关联 |

#### Power Platform 集成

- Dataverse：工单和人员业务数据。
- Power Automate：工单通知、SLA 提醒、审批。
- SharePoint：附件和处理文档。
- Office 365 Users：获取用户信息。
- Outlook / Teams：通知和协作。

### 6.2 Phase 2：Inventory Management Platform

**企业库存与资产管理平台**

第二个实践项目用于验证公共框架是否真正具有跨领域复用能力。

#### 业务背景

企业需要管理不同仓库、物料、库存和资产。

传统库存管理可能需要多个独立页面完成查询、入库、出库、调拨和盘点。

通过复用工作台框架，建立统一的库存管理界面。

#### 核心功能

| 模块                 | 主要功能             |
| -------------------- | -------------------- |
| Inventory Dashboard  | 库存总量、低库存预警 |
| Inventory Center     | 库存查询与筛选       |
| Warehouse Management | 仓库管理             |
| Stock Movement       | 入库、出库、调拨     |
| Inventory History    | 库存变更历史         |

#### 建议的数据实体

| Dataverse 表     | 主要用途   |
| ---------------- | ---------- |
| Product          | 产品和物料 |
| Warehouse        | 仓库       |
| InventoryBalance | 库存余额   |
| StockMovement    | 库存变更   |
| StockTransfer    | 库存调拨   |
| StockCount       | 库存盘点   |

#### 框架复用点

库存管理不需要重新开发：

- 工作台布局。
- 页面导航。
- 数据表格。
- 筛选与分页。
- 详情侧栏。
- 状态标签。
- 批量操作。
- 日志和错误处理。

只需要新增库存领域的数据适配器、业务规则和专属交互。

库存扣减、调拨和并发一致性必须由服务端业务逻辑保障。

### 6.3 后续扩展场景

| 业务场景                 | 适配程度 | 说明                      |
| ------------------------ | -------- | ------------------------- |
| Operations Management    | 高       | 运营指标和任务管理        |
| Resource Scheduling      | 高       | 人员和资源调度            |
| Project Management       | 高       | 项目任务和进度            |
| Asset Management         | 高       | 资产生命周期              |
| Internal Portal          | 中       | 需要额外考虑用户访问模式  |
| External Customer Portal | 较低     | 应评估 Power Pages 等方案 |

## 7. Power Platform 集成策略（Integration Strategy）

### 7.1 Dataverse

作为主要业务数据存储。

负责：

- 业务实体。
- 表间关系。
- Lookup 关联。
- 数据查询。
- 数据更新。
- 安全角色。
- 记录级访问控制。

### 7.2 Power Automate

作为业务流程自动化平台。

负责：

- 工单通知。
- SLA 超时提醒。
- 审批流程。
- 库存预警。
- 异步业务任务。
- 与外部系统的流程集成。

原则：

高频同步交互尽量通过合适的数据访问接口完成。

异步通知、审批和后台流程使用 Power Automate。

避免让 Power Automate 成为所有前端 CRUD 请求的中间层。

### 7.3 SharePoint

主要用于：

- 工单附件。
- 解决方案文档。
- 操作说明。
- 库存相关文件。
- 企业知识库。

需要根据 Code Apps 当前支持的连接方式决定实际接入方案。

### 7.4 Office 365

主要用于：

- 获取用户资料。
- 用户身份关联。
- 邮件通知。
- Teams 协作。
- 日历相关业务。

所有连接均应考虑身份认证、权限范围和连接器支持情况。

## 8. 项目实施路线（Roadmap）

项目分为六个阶段。

| 阶段    | 核心任务           | 主要交付物     |
| ------- | ------------------ | -------------- |
| Phase 0 | 项目认知与方向确定 | 项目方案       |
| Phase 1 | Code Apps 基础学习 | 学习文档       |
| Phase 2 | 微软官方案例研究   | 案例分析       |
| Phase 3 | 技术架构与公共框架 | Starter Kit V1 |
| Phase 4 | 工单业务模块开发   | Work Order App |
| Phase 5 | 库存业务模块接入   | Inventory App  |
| Phase 6 | 复用性验证与总结   | 最佳实践报告   |

### Phase 0：项目认知

- 理解 Code Apps。
- 研究产品定位。
- 了解平台架构。
- 对比 Canvas Apps。
- 确定项目目标。

### Phase 1：基础学习

- React 基础。
- TypeScript 基础。
- Code Apps SDK。
- 开发环境。
- 项目创建。
- 应用发布。

### Phase 2：官方案例研究

重点研究：

- Microsoft PowerAppsCodeApps GitHub。
- HelloWorld。
- FluentSample。
- StaticAssetTracker。
- Dataverse 示例。
- Equipment Request Code App。

每个案例应记录：

1. 业务目标。
2. 技术栈。
3. 核心功能。
4. 数据交互方式。
5. 可复用的实现。
6. 对本项目的参考价值。

### Phase 3：公共框架开发

建立：

- Workbench Shell。
- Shared UI Components。
- Data Access Layer。
- Domain Module Interface。
- 基础路由。
- 错误处理。
- 测试规范。

### Phase 4：工单业务开发

优先完成：

1. 工单列表和详情。
2. 多维度筛选。
3. 跨记录批量操作。
4. 拖拽式派发。
5. 人员工作负载。
6. Dataverse 数据集成。
7. Power Automate 流程。

### Phase 5：库存业务开发

使用已经建立的公共框架，新增库存领域模块。

重点验证：

- 公共组件是否可以直接复用。
- 是否需要修改框架核心代码。
- 数据访问接口是否足够通用。
- 业务规则是否能够保持独立。
- 新模块开发成本是否明显下降。

### Phase 6：总结与评估

- 评估公共能力复用率。
- 对比两个业务模块的开发成本。
- 总结技术优势和局限。
- 输出适用场景指南。
- 整理企业最佳实践。

## 9. 技术栈（Technology Stack）

以下为初步技术选型，实际版本和依赖应以官方 Starter 模板及当前 SDK 兼容性为准。

| 分类            | 技术                 | 用途               |
| --------------- | -------------------- | ------------------ |
| Platform        | Power Apps Code Apps | 应用托管与平台集成 |
| Frontend        | React                | 页面开发           |
| Language        | TypeScript           | 类型管理           |
| Build           | Vite                 | 构建工具           |
| UI              | Fluent UI            | 企业级 UI 组件     |
| Styling         | Tailwind CSS         | 样式管理           |
| Routing         | React Router         | 页面路由           |
| Server State    | TanStack Query       | 服务端数据状态管理 |
| Data            | Dataverse            | 核心业务数据       |
| Workflow        | Power Automate       | 业务流程           |
| Document        | SharePoint           | 文件和文档         |
| Collaboration   | Microsoft 365        | 企业协作           |
| Testing         | Playwright           | E2E 测试           |
| Version Control | Git                  | 代码管理           |

## 10. 建议的项目目录结构（Repository Structure）

```
code-apps-operations-workbench/
│
├── README.md
│
├── docs/
│   ├── 01-product-overview/
│   ├── 02-official-examples/
│   ├── 03-technical-research/
│   ├── 04-integration/
│   ├── 05-architecture/
│   └── 06-best-practices/
│
├── apps/
│   ├── workbench/
│   └── inventory-demo/
│
├── packages/
│   ├── workbench-shell/
│   ├── ui-components/
│   ├── data-access/
│   ├── shared-types/
│   ├── shared-utils/
│   └── module-registry/
│
├── domains/
│   ├── work-orders/
│   ├── inventory/
│   └── operations/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
└── scripts/
```

说明：

- `apps/`：应用入口。
- `packages/`：公共框架和共享能力。
- `domains/`：独立业务领域模块。
- `docs/`：学习、研究和设计文档。
- `tests/`：测试代码。
- `scripts/`：构建与开发辅助脚本。

该结构是目标架构，不代表 Code Apps 原生支持任意 Monorepo 或多应用运行方式。实际实施时需要验证 Code Apps CLI、构建和发布流程，必要时采用单应用仓库与共享 npm 包的方式。

## 11. 成功标准与验收指标（Success Criteria）

本项目不能仅以第一个业务应用是否运行作为成功标准。

更重要的是验证公共框架是否能够支撑不同领域的业务需求。

### 11.1 技术验收

- 

  成功创建并运行 Code Apps。

- 

  完成 React 和 TypeScript 项目开发。

- 

  实现公共组件。

- 

  建立统一数据访问层。

- 

  完成 Dataverse 集成。

- 

  完成 Power Automate 集成。

- 

  完成 SharePoint 或其他适用连接器的验证。

- 

  实现服务端分页、过滤和排序。

- 

  建立错误处理和日志机制。

- 

  完成基础自动化测试。

### 11.2 业务验收

- 

  工单查询和详情。

- 

  多维度筛选。

- 

  跨记录批量操作。

- 

  拖拽派发。

- 

  人员负载分析。

- 

  工单自动通知。

- 

  库存查询和详情。

- 

  库存入库、出库和调拨。

### 11.3 复用性验收

| 指标                       | 目标               |
| -------------------------- | ------------------ |
| 公共前端能力复用率         | 目标 70% 以上      |
| 第二个模块对核心框架的修改 | 尽可能为零         |
| 统一数据访问接口遵循率     | 100%               |
| 关键业务规则服务端验证     | 100%               |
| 核心公共组件测试覆盖       | 按模块制定明确目标 |

复用率应按照预先定义的公共组件和功能清单统计，而不是简单通过代码行数计算。

## 12. 非目标与范围控制（Out of Scope）

为了避免项目无限扩张，第一阶段明确不做以下事情：

1. 不开发通用低代码平台。
2. 不支持任意业务的动态表单和动态工作流设计器。
3. 不建设复杂的插件市场。
4. 不实现所有 Power Platform 连接器的统一封装。
5. 不替代 Power Pages 的外部用户门户能力。
6. 不重复开发 Canvas Apps 和 Model-driven Apps 已经成熟解决的简单场景。
7. 不将复杂业务规则全部放到前端。
8. 不在尚未验证框架之前开发多个完整业务系统。

## 13. 风险与技术注意事项（Risks & Considerations）

### 13.1 Code Apps 平台能力限制

Code Apps 与 Canvas Apps 并非完全相同的开发环境。

必须提前验证：

- 当前 SDK 支持的连接方式。
- 身份认证和权限模型。
- 支持的连接器。
- 应用托管和发布方式。
- ALM 与环境迁移。
- 当前平台的限制和已知问题。

### 13.2 数据访问性能

使用 TypeScript 不意味着自动解决数据委托问题。

仍然需要考虑：

- 服务端分页。
- 查询条件下推。
- API 限流。
- 数据量。
- 并发更新。
- 缓存策略。

### 13.3 权限和安全

前端隐藏按钮不等于真正的权限控制。

必须通过 Dataverse Security Roles、记录级访问控制和受信任的服务端逻辑确保数据安全。

### 13.4 业务一致性

工单派发和库存调拨等操作涉及多个业务实体。

必须考虑：

- 并发冲突。
- 重复提交。
- 操作失败。
- 重试机制。
- 数据一致性。
- 操作审计。

### 13.5 过度抽象

第一阶段不应试图建立所有业务都能使用的完美框架。

先解决工单场景中真实存在的问题，再将重复出现的能力抽象出来，最后通过库存模块验证。

## 14. 项目最终交付物（Deliverables）

本项目最终形成三个层面的成果。

### 14.1 知识成果

Code Apps 系统学习与研究文档：

- 产品认知。
- 技术架构。
- 官方案例分析。
- Canvas Apps 对比。
- React 与组件复用。
- Delegation 与数据查询。
- Dataverse 集成。
- Power Automate 集成。
- SharePoint 与 Office 365 集成。
- 企业级最佳实践。

### 14.2 技术成果

Operations Workbench Starter Kit：

- 工作台基础框架。
- 公共 UI 组件库。
- 数据访问层。
- 领域模块接口。
- 模块注册机制。
- 工程化规范。
- 测试规范。

### 14.3 业务成果

两个完整的业务验证案例：

1. IT Service Operations Platform。
2. Inventory Management Platform。

最终形成一套经过真实业务场景验证的可复用企业应用开发模式。

## 15. 项目总结（Conclusion）

Code Apps 的价值不只是让开发人员能够使用 React 编写 Power Apps。

更重要的是，它提供了一种将专业前端开发能力与 Power Platform 企业生态结合的方式。

本项目希望通过可复用工作台框架的设计和实践，探索这种开发模式在复杂企业业务场景中的适用性。

**最终目标不是开发一个工单系统，也不是开发一个库存系统，而是沉淀一套能够持续支持不同企业业务应用的开发能力。**

> Build once, reuse across business domains.

## 16. 参考资料（References）

### Microsoft 官方文档

- [Power Apps Code Apps Documentation](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/)
- [Code Apps Overview](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview)
- [Code Apps Architecture](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/architecture)

### Microsoft 官方 GitHub

- [PowerAppsCodeApps](https://github.com/microsoft/PowerAppsCodeApps)
- [PowerApps-Samples](https://github.com/microsoft/PowerApps-Samples)

### Microsoft Learning

- [Build a Dataverse Equipment Request Code App](https://microsoftlearning.github.io/AB-400-microsoft-power-platform-developer/Instructions/Labs/04-dataverse-code-app.html)

**Project Status:** Planning / Research

**Project Type:** Technical Research + Framework Development + Business Application Practice

**Primary Platform:** Microsoft Power Apps Code Apps

**Core Architecture:** Reusable Workbench + Domain Modules

**Initial Business Domains:** Work Orders / Inventory / Operations