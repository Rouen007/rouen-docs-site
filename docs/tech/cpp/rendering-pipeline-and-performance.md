# 图形渲染管线与性能基础

渲染系统把场景中的游戏对象转换为 GPU 可以执行的绘制命令，并在有限的帧时间内完成可见性、资源、光照和后处理。理解它时，可以沿着“数据如何进入 GPU、GPU 如何处理、资源如何复用”三条线展开。

## 一、一帧渲染的整体流程

```text
游戏线程更新世界
    ↓
生成 Render Snapshot
    ↓
可见性裁剪
    ↓
生成 RenderPacket
    ↓
RenderQueue 分类与排序
    ↓
RenderGraph 安排 Pass 和资源依赖
    ↓
Render Thread 录制 Command Buffer
    ↓
GPU 执行 Graphics Pipeline
    ↓
显示到屏幕
```

游戏对象通常同时包含物理、网络、AI、技能和动画状态。渲染线程不必直接读取完整的游戏对象，而是消费一份稳定的渲染数据快照。

## 二、Render Snapshot 与 RenderPacket

### Render Snapshot

Render Snapshot 是某个时间点上、供渲染线程读取的数据集合：

```cpp
struct RenderSnapshot {
    std::vector<RenderPacket> packets;
    CameraData camera;
    LightingData lighting;
};
```

游戏线程生成快照，渲染线程只读快照。双缓冲或多缓冲可以避免游戏线程覆盖渲染线程仍在使用的数据。

### RenderPacket

RenderPacket 是从 GameObject 提取出来的渲染数据投影：

```cpp
struct RenderPacket {
    MeshHandle mesh;
    MaterialHandle material;
    PipelineHandle pipeline;
    Matrix transform;
    SortKey sortKey;
};
```

它不是完整的游戏对象，也不是 RenderQueue 本身：

```text
GameObject：完整的游戏逻辑对象
RenderPacket：一个对象或一批对象的绘制描述
RenderQueue：Packet 的分类和排序容器
Command Buffer：最终交给 GPU 的命令
```

Packet 通常保存 Handle、索引或值数据，不应依赖一个可能已经销毁的裸指针。

## 三、可见性裁剪与渲染队列

场景中很多物体当前不可见，不需要提交给 GPU。常见裁剪包括：

- Frustum Culling：物体是否在摄像机视锥体内；
- Occlusion Culling：物体是否被其他物体遮挡；
- Distance Culling：远处物体是否需要显示；
- LOD：根据距离降低模型或材质复杂度。

裁剪后，Packet 会按渲染阶段分类：

```text
Shadow Queue
Opaque Queue
Transparent Queue
UI Queue
```

不透明物体通常倾向于从近到远绘制，以便尽早利用深度测试；透明物体通常从远到近绘制，以保证颜色混合顺序。排序还要在深度、材质、Pipeline 和状态切换之间做权衡。

多个相同 Mesh 和 Material 的对象可以使用 Instancing：

```text
一个 Mesh
    + 多个 Transform
    ↓
一个批次绘制多个实例
```

## 四、RenderGraph

RenderGraph 用图描述渲染 Pass 和资源读写关系：

```text
Shadow Pass
    ↓ 写 ShadowMap
Opaque Pass
    ↓ 写 Color Buffer
Post Process
    ↓ 写 Back Buffer
UI Pass
```

每个 Pass 声明自己读取和写入的资源，RenderGraph 据此推导：

- Pass 的执行顺序；
- GPU Barrier 和资源状态转换；
- 临时资源的创建和释放；
- 生命周期不重叠时的显存复用；
- 没有依赖的 Pass 是否可以并行。

RenderGraph 不等于 Scene Graph：

```text
Scene Graph：场景对象与空间层级
RenderGraph：渲染 Pass 与 GPU 资源依赖
```

它也不能替代正确的资源声明。如果 Pass 错误地声明读写关系，图也无法自动修复。

## 五、Graphics Pipeline

简化的 GPU 图形管线如下：

```text
Vertex Input
    ↓
Vertex Shader
    ↓
Primitive Assembly
    ↓
Rasterization
    ↓
Fragment / Pixel Shader
    ↓
Depth Test
    ↓
Blend
    ↓
Frame Buffer
```

Vertex Shader 负责把顶点从模型空间转换到屏幕相关空间，也可以传递法线、UV、顶点颜色和骨骼权重。Fragment Shader 根据纹理、材质和光照计算像素颜色。

一个绘制对象通常由几部分组成：

```text
Mesh：顶点和索引，决定形状
Material：颜色、纹理和材质参数
Shader：定义计算方式
Pipeline State：深度、混合、光栅化等状态
Transform：位置、旋转和缩放
```

## 六、资源绑定与材质

Shader 需要读取摄像机、Transform、纹理和骨骼矩阵。Descriptor 或类似的资源绑定机制用于告诉 GPU：

```text
资源在哪里
资源是什么类型
Shader 应该从哪个槽位读取
```

常见分组：

```text
Per-Frame：摄像机、时间、环境光
Per-Material：纹理、颜色、粗糙度、金属度
Per-Object：Transform、对象颜色
Per-Skeleton：骨骼矩阵
```

按更新频率分组可以减少重复绑定。多个对象共享材质时，也可以共享大部分 Descriptor。

## 七、纹理与移动端约束

纹理系统需要处理尺寸、格式、颜色空间、MipMap、过滤和压缩。

MipMap 为同一纹理保存多个分辨率，远处使用较小的版本，可以减少闪烁和带宽。纹理压缩可以减少显存和外部内存读写，移动设备常用适合目标硬件的块压缩格式。

Roughness、Metallic、AO 等灰度参数有时可以打包到同一张纹理的不同通道，以减少纹理数量和采样次数。Texture Atlas 可以合并小纹理，减少切换，但需要处理 UV、Padding 和 MipMap 串色。

大型场景可以使用 Texture Streaming，根据距离、屏幕占比和显存预算动态加载不同清晰度的 Mip。

移动端通常特别关注：

- 显存和外部内存带宽；
- 透明物体和 Overdraw；
- 纹理采样次数；
- Render Target 的读写；
- Shader 复杂度和功耗。

## 八、阴影与后处理

Shadow Map 的基本方法是先从光源视角记录深度，再从摄像机视角比较当前像素到光源的距离：

```text
Light Pass：生成 Shadow Map
Main Pass：采样 Shadow Map，判断是否被遮挡
```

深度偏差过小可能产生 Shadow Acne，过大可能产生 Peter Panning。方向光常用级联阴影，把摄像机视锥体分段，近处使用更高分辨率。

后处理在场景图像生成后继续工作：

```text
Scene Color
    ↓
Bloom / Tone Mapping / Anti-Aliasing
    ↓
Back Buffer
```

HDR 用于保存更宽的亮度范围，Tone Mapping 将其压缩到显示范围；Bloom 提取高亮区域并模糊后叠加。屏幕空间效果依赖已有的 Color、Depth 或 Normal，因此无法直接获得屏幕外信息。

## 九、性能分析

先判断瓶颈位于 CPU、GPU 还是同步等待：

```text
CPU 高、GPU 低：命令构建、Draw、状态切换或裁剪可能是瓶颈
CPU 低、GPU 高：Shader、像素、带宽、阴影或后处理可能是瓶颈
两者都不高但帧很慢：可能在等待锁、Fence、资源或下一批命令
```

常见优化顺序：

```text
确认瓶颈
    ↓
减少不可见工作
    ↓
减少重复绘制和状态切换
    ↓
改善数据布局与缓存
    ↓
针对 Shader、像素和带宽优化
```

性能优化应结合 CPU/GPU 时间线、GPU Capture、Overdraw、Shader 时间和资源带宽分析，而不是只根据代码直觉判断。

### iOS Instruments 中的常用观察项

iOS 性能分析通常先用 Instruments 判断问题属于 CPU、内存、GPU 还是功耗，再回到具体代码和渲染资源定位。

| 工具或指标 | 主要观察内容 | 常见用途 |
| --- | --- | --- |
| Time Profiler | 函数的 Self Time、Total Time、调用次数 | 找 CPU 热点、主线程卡顿和单帧耗时过高的函数 |
| Allocations | Live Bytes、Overall Bytes、分配次数、对象类型 | 判断频繁分配、内存峰值和生命周期过长 |
| Leaks | 泄漏对象和引用路径 | 排查长期运行后持续增长的内存 |
| VM Tracker | Resident、Dirty、虚拟内存区域 | 区分堆内存、纹理/映射内存和系统内存压力 |
| Metal System Trace | Command Buffer、GPU Duration、提交间隔、等待 | 判断 GPU 是否忙、CPU 是否提交不及时、是否存在同步空洞 |
| Energy Log | CPU、GPU、网络和功耗活动 | 判断持续高负载、发热和降频风险 |
| os_signpost / Points of Interest | 自定义阶段和时间区间 | 将逻辑帧、资源加载、提交等事件标到系统时间线上 |

几个指标需要结合起来看：

- Time Profiler 中某函数 Total Time 高，说明它及其子调用占用时间多；Self Time 高，才更接近函数自身的直接开销。
- Metal System Trace 中 GPU Duration 高，通常需要继续检查 Shader、像素数量、带宽、Render Target 和后处理；CPU 提交间隔过大，则可能是主线程或渲染线程瓶颈。
- Allocations 的峰值和 Live Bytes 不能只看单帧数值，还要观察场景切换、资源加载和长时间运行后的趋势。

### Android 设备兼容性

Android 的兼容性不能只按系统版本判断，还要考虑 GPU 厂商、图形 API、驱动行为、内存预算和热状态。常见 GPU 主要包括 Adreno、Mali 和 PowerVR，不同设备对格式、精度和扩展的支持可能不同。

需要重点确认：

- 图形 API：OpenGL ES、Vulkan 以及目标设备上的实际驱动版本；
- Shader：精度限定符、分支、纹理采样、编译器差异和特殊值处理；
- 纹理与 Render Target：ASTC/ETC2 等压缩格式、最大尺寸、颜色格式、深度格式和 MRT 支持；
- 渲染能力：Compute、Instancing、MSAA、后处理和其他扩展是否可用；
- 资源预算：显存/外部内存、分辨率、纹理清晰度、加载峰值和后台回收；
- 设备状态：温度、降频、电量模式和长时间运行后的帧时间变化。

引擎通常通过能力查询和分档配置适配设备，而不是在业务代码中到处判断型号。启动时记录 GPU、API、驱动和关键扩展，根据能力选择纹理格式、Shader 变体、分辨率、阴影等级和后处理路径；对于已知驱动问题，再集中维护少量 workaround。验证时应覆盖不同 GPU 厂商、低中高端设备、不同 API 和冷启动/长时间运行等场景。

## 十、DX11 与 DX12

DirectX 11 和 DirectX 12 的核心差异是抽象层次不同：

```text
DX11：驱动和运行时隐式管理更多工作
DX12：应用显式管理更多资源、命令和同步
```

### 主要区别

| 方面 | DX11 | DX12 |
| --- | --- | --- |
| 抽象层次 | 较高，使用相对简单 | 较低，接近硬件 |
| CPU 开销 | 驱动处理较多隐式工作 | 应用自行组织，控制力更强 |
| 多线程录制 | 支持有限，可能存在额外同步 | Command List 可以更好地并行录制 |
| 资源状态 | 运行时管理较多 | 需要显式 Resource Barrier |
| 内存管理 | 驱动和运行时参与较多 | 应用对 Heap、复用和驻留有更多控制 |
| 资源绑定 | SRV、RTV、DSV 等 View | Descriptor Heap 和 Descriptor Table |
| 同步 | 隐式同步较多 | Command Queue、Fence 等显式同步 |
| 复杂度 | 较低 | 较高，应用承担更多正确性责任 |

### DX11 的典型模型

```text
创建资源
    ↓
创建 View
    ↓
设置 Pipeline 状态
    ↓
绑定资源
    ↓
Draw
```

DX11 通过 Immediate Context 和 Deferred Context 提交命令，驱动和运行时会帮助处理部分资源状态、内存和同步问题。开发成本较低，但引擎对底层行为和多线程扩展的控制较少。

### DX12 的典型模型

```text
创建 Resource
    ↓
创建 Descriptor
    ↓
准备 Root Signature
    ↓
创建 Pipeline State Object
    ↓
录制 Command List
    ↓
插入 Resource Barrier
    ↓
提交 Command Queue
    ↓
Signal Fence
```

DX12 通常将命令存储、命令列表和执行队列分开：

```text
Command Allocator
    ↓
Command List
    ↓
Command Queue
    ↓
GPU
```

多个 Worker 可以并行录制不同的 Command List，之后再提交到队列。资源状态、Descriptor、Allocator 重置时机和 GPU 完成进度都需要由引擎明确管理。

### DX12 为什么可能降低 CPU 开销

```text
DX11：应用 → 驱动判断和管理 → GPU
DX12：应用组织资源和命令 → GPU
```

当 Draw Call 很多、状态切换频繁或命令录制成为 CPU 瓶颈时，DX12 的显式模型可以减少驱动开销并改善多线程扩展。但 DX12 不会自动让所有程序变快；错误的 Barrier、Descriptor、内存复用或同步设计可能导致性能下降或 GPU 错误。

### DX12 的关键管理对象

- Resource Barrier：描述资源从一种使用状态转换到另一种状态；
- Descriptor Heap：集中存放资源绑定描述；
- Root Signature：规定 Shader 如何访问资源；
- Pipeline State Object：组合 Shader、Blend、Rasterizer、Depth 等管线状态；
- Command Allocator：保存命令记录所需的底层内存；
- Fence：判断 Command Allocator、Upload Buffer 和 GPU Resource 何时可以复用。

DX11 和 DX12 都可以构建高性能渲染器，选择取决于目标平台、引擎抽象、驱动情况和维护成本。DX12 的价值主要是显式控制和可扩展性，而不是单纯替换 API 就获得性能提升。

## 本篇结论

1. 游戏对象经过快照、裁剪和提取后，变成适合渲染的 RenderPacket。
2. RenderQueue 负责对象分类和排序，RenderGraph 负责 Pass 与资源依赖。
3. Command Buffer 是 GPU 命令的记录结果，Fence 负责异步完成后的复用和回收。
4. Mesh、Material、Shader、Pipeline State 和 Transform 共同描述一次绘制。
5. 移动端渲染重点通常是带宽、Overdraw、纹理、Shader 和功耗。
6. 性能优化必须先区分 CPU 瓶颈、GPU 瓶颈和同步等待。
7. DX11 抽象较高、开发简单；DX12 把资源状态、命令、Descriptor、内存和同步更多地交给引擎显式管理。

[← 上一章：网络、动画与物理概览](./game-runtime-systems-overview.md) · [返回学习地图](../cpp-engine-foundations.md)
