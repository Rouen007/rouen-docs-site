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

## 本篇结论

1. 游戏对象经过快照、裁剪和提取后，变成适合渲染的 RenderPacket。
2. RenderQueue 负责对象分类和排序，RenderGraph 负责 Pass 与资源依赖。
3. Command Buffer 是 GPU 命令的记录结果，Fence 负责异步完成后的复用和回收。
4. Mesh、Material、Shader、Pipeline State 和 Transform 共同描述一次绘制。
5. 移动端渲染重点通常是带宽、Overdraw、纹理、Shader 和功耗。
6. 性能优化必须先区分 CPU 瓶颈、GPU 瓶颈和同步等待。

[← 上一章：网络、动画与物理概览](./game-runtime-systems-overview.md) · [返回学习地图](../cpp-engine-foundations.md)
