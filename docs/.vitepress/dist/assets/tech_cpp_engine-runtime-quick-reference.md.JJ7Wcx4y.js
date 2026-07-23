import{_ as s,o as n,c as p,a1 as e}from"./chunks/framework.BKJzsOC1.js";const u=JSON.parse('{"title":"引擎运行时与渲染系统速览","description":"","frontmatter":{},"headers":[],"relativePath":"tech/cpp/engine-runtime-quick-reference.md","filePath":"tech/cpp/engine-runtime-quick-reference.md"}'),l={name:"tech/cpp/engine-runtime-quick-reference.md"};function i(t,a,c,d,r,o){return n(),p("div",null,[...a[0]||(a[0]=[e(`<h1 id="引擎运行时与渲染系统速览" tabindex="-1">引擎运行时与渲染系统速览 <a class="header-anchor" href="#引擎运行时与渲染系统速览" aria-label="Permalink to &quot;引擎运行时与渲染系统速览&quot;">​</a></h1><p>本篇用于快速回顾引擎中最重要的关系：数据由谁拥有、在哪个线程修改、何时能够读取、何时可以复用或销毁。</p><h2 id="一、整体数据流" tabindex="-1">一、整体数据流 <a class="header-anchor" href="#一、整体数据流" aria-label="Permalink to &quot;一、整体数据流&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>输入 / 网络</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>Game Thread 更新世界</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>Physics / Animation Jobs</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>Render Snapshot</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>Culling → RenderPacket → RenderQueue</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>RenderGraph → Command Buffer</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>GPU Pipeline</span></span></code></pre></div><p>资源管理器、任务系统和内存系统为这条主线提供基础能力。</p><h2 id="二、数据和所有权" tabindex="-1">二、数据和所有权 <a class="header-anchor" href="#二、数据和所有权" aria-label="Permalink to &quot;二、数据和所有权&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>GameObject：完整的游戏逻辑对象</span></span>
<span class="line"><span>Component：可独立管理的数据</span></span>
<span class="line"><span>System：处理一类组件或任务</span></span>
<span class="line"><span>Render Snapshot：某个时间点的稳定渲染输入</span></span>
<span class="line"><span>RenderPacket：从游戏对象提取的渲染数据</span></span>
<span class="line"><span>Handle：指向集中管理资源的可验证引用</span></span></code></pre></div><p>判断一个设计时，优先问：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>谁拥有它？</span></span>
<span class="line"><span>谁可以修改它？</span></span>
<span class="line"><span>谁只读借用它？</span></span>
<span class="line"><span>它什么时候失效？</span></span></code></pre></div><h2 id="三、线程边界" tabindex="-1">三、线程边界 <a class="header-anchor" href="#三、线程边界" aria-label="Permalink to &quot;三、线程边界&quot;">​</a></h2><p>常见职责划分：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Game Thread：输入、逻辑、世界状态</span></span>
<span class="line"><span>Worker Threads：动画、物理、裁剪、资源处理</span></span>
<span class="line"><span>Render Thread：渲染数据整理和命令录制</span></span>
<span class="line"><span>GPU：异步执行图形命令</span></span></code></pre></div><p>线程之间尽量通过稳定的数据快照、任务依赖或消息队列通信，减少多个线程直接修改同一对象。</p><p>如果两个线程共享可变数据：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>简单独立状态 → atomic</span></span>
<span class="line"><span>多个字段组成的不变量 → mutex</span></span>
<span class="line"><span>等待条件 → mutex + condition_variable</span></span>
<span class="line"><span>任务依赖 → task graph</span></span></code></pre></div><h2 id="四、渲染链路" tabindex="-1">四、渲染链路 <a class="header-anchor" href="#四、渲染链路" aria-label="Permalink to &quot;四、渲染链路&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>GameObject</span></span>
<span class="line"><span>    ↓ 提取渲染字段</span></span>
<span class="line"><span>RenderPacket</span></span>
<span class="line"><span>    ↓ 分类和排序</span></span>
<span class="line"><span>RenderQueue</span></span>
<span class="line"><span>    ↓ Pass 和资源依赖</span></span>
<span class="line"><span>RenderGraph</span></span>
<span class="line"><span>    ↓ 录制命令</span></span>
<span class="line"><span>Command Buffer</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>GPU</span></span></code></pre></div><p><code>RenderPacket</code> 不是完整的游戏对象，也不是 RenderQueue；它是一个对象或一批对象的绘制描述，通常保存 Mesh、Material、Pipeline、Transform 和排序信息。</p><h2 id="五、rendergraph-的作用" tabindex="-1">五、RenderGraph 的作用 <a class="header-anchor" href="#五、rendergraph-的作用" aria-label="Permalink to &quot;五、RenderGraph 的作用&quot;">​</a></h2><p>RenderGraph 用图描述 Pass 对资源的读写：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Shadow Pass → Opaque Pass → Post Process → UI Pass</span></span></code></pre></div><p>它可以根据依赖关系统一管理：</p><ul><li>Pass 顺序；</li><li>Barrier 和资源状态转换；</li><li>临时资源生命周期；</li><li>不重叠资源的显存复用；</li><li>无依赖 Pass 的并行机会。</li></ul><p>RenderGraph 描述渲染过程，Scene Graph 描述场景对象和空间层级，两者不是同一个系统。</p><h2 id="六、资源生命周期" tabindex="-1">六、资源生命周期 <a class="header-anchor" href="#六、资源生命周期" aria-label="Permalink to &quot;六、资源生命周期&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>请求资源</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>Loading</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>CPU 数据准备</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>GPU 上传</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>Ready</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>Handle 失效</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>等待使用者和 GPU 完成</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>物理释放</span></span></code></pre></div><p>不同机制负责不同边界：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>unique_ptr：唯一 CPU 所有权</span></span>
<span class="line"><span>shared_ptr：共享 CPU 生命周期</span></span>
<span class="line"><span>weak_ptr：观察，不延长生命周期</span></span>
<span class="line"><span>Handle + generation：验证逻辑引用</span></span>
<span class="line"><span>mutex：保护 CPU 共享状态</span></span>
<span class="line"><span>Fence：确认 GPU 使用完成</span></span></code></pre></div><p>锁住资源容器，不代表返回的裸指针在锁外仍然有效；CPU 对象存活，也不代表 GPU 已经不再使用底层资源。</p><h2 id="七、gpu-渲染重点" tabindex="-1">七、GPU 渲染重点 <a class="header-anchor" href="#七、gpu-渲染重点" aria-label="Permalink to &quot;七、GPU 渲染重点&quot;">​</a></h2><p>Graphics Pipeline 可以简化为：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Vertex Shader</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>Rasterization</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>Fragment Shader</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>Depth / Blend</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>Frame Buffer</span></span></code></pre></div><p>常见渲染资源：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Buffer：顶点、索引、常量、实例和骨骼数据</span></span>
<span class="line"><span>Texture：颜色、深度、阴影和中间结果</span></span>
<span class="line"><span>Descriptor：告诉 Shader 如何找到资源</span></span>
<span class="line"><span>Material：提供纹理和材质参数</span></span>
<span class="line"><span>Shader：定义计算方式</span></span></code></pre></div><p>移动端重点关注：</p><ul><li>外部内存带宽；</li><li>纹理压缩和 MipMap；</li><li>Shader 采样次数；</li><li>透明物体和 Overdraw；</li><li>阴影和后处理；</li><li>Render Target 的读写次数；</li><li>功耗和发热。</li></ul><h2 id="八、性能定位" tabindex="-1">八、性能定位 <a class="header-anchor" href="#八、性能定位" aria-label="Permalink to &quot;八、性能定位&quot;">​</a></h2><p>先区分三类瓶颈：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>CPU-bound：命令、Draw、排序、裁剪、状态切换或任务调度</span></span>
<span class="line"><span>GPU-bound：Shader、像素、阴影、后处理、带宽或 Overdraw</span></span>
<span class="line"><span>Synchronization-bound：锁、Fence、资源、线程或任务等待</span></span></code></pre></div><p>优化顺序通常是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>采样和时间线确认瓶颈</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>减少不可见工作</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>减少重复绘制和状态切换</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>改善数据布局与缓存</span></span>
<span class="line"><span>    ↓</span></span>
<span class="line"><span>针对 Shader、像素和带宽优化</span></span></code></pre></div><p>iOS 常用 Instruments：Time Profiler 看 CPU 热点，Allocations 和 VM Tracker 看分配与内存峰值，Metal System Trace 看 Command Buffer、GPU Duration 和 CPU-GPU 空洞，Energy Log 看持续负载、功耗与发热。Android 兼容性重点关注 Adreno/Mali/PowerVR 差异、OpenGL ES/Vulkan、ASTC/ETC2、Shader 精度、Render Target 格式、内存预算和热降频，并通过能力查询与分档配置适配设备。</p><h2 id="九、常用数据结构" tabindex="-1">九、常用数据结构 <a class="header-anchor" href="#九、常用数据结构" aria-label="Permalink to &quot;九、常用数据结构&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>vector：默认顺序容器，连续内存，注意扩容失效</span></span>
<span class="line"><span>unordered_map：平均 O(1)，注意 rehash 和 operator[] 插入</span></span>
<span class="line"><span>queue：任务队列、BFS</span></span>
<span class="line"><span>priority_queue：优先级调度、Top K</span></span>
<span class="line"><span>双指针：连续区间</span></span>
<span class="line"><span>二分：有单调性的答案范围</span></span>
<span class="line"><span>哈希：快速查找、去重和映射</span></span></code></pre></div><h2 id="十、dx11-与-dx12" tabindex="-1">十、DX11 与 DX12 <a class="header-anchor" href="#十、dx11-与-dx12" aria-label="Permalink to &quot;十、DX11 与 DX12&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>DX11：驱动和运行时管理较多，开发简单</span></span>
<span class="line"><span>DX12：应用显式管理资源、Command List、Descriptor、Barrier 和 Fence</span></span></code></pre></div><p>DX12 可以降低驱动开销并改善多线程命令录制，但也要求引擎正确管理：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Resource State</span></span>
<span class="line"><span>Descriptor Heap</span></span>
<span class="line"><span>Root Signature</span></span>
<span class="line"><span>Pipeline State Object</span></span>
<span class="line"><span>Command Allocator</span></span>
<span class="line"><span>Command Queue</span></span>
<span class="line"><span>Fence</span></span></code></pre></div><p>它不会自动带来性能提升，实际收益取决于 CPU 命令开销、资源管理、同步和实现质量。</p><h2 id="十一、最小知识主线" tabindex="-1">十一、最小知识主线 <a class="header-anchor" href="#十一、最小知识主线" aria-label="Permalink to &quot;十一、最小知识主线&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>对象是否活着？</span></span>
<span class="line"><span>    → 生命周期与所有权</span></span>
<span class="line"><span></span></span>
<span class="line"><span>数据是否被正确共享？</span></span>
<span class="line"><span>    → mutex、atomic、任务依赖</span></span>
<span class="line"><span></span></span>
<span class="line"><span>渲染数据是否稳定？</span></span>
<span class="line"><span>    → Snapshot、Packet、Queue</span></span>
<span class="line"><span></span></span>
<span class="line"><span>GPU 是否按正确顺序访问？</span></span>
<span class="line"><span>    → Barrier、RenderGraph</span></span>
<span class="line"><span></span></span>
<span class="line"><span>资源是否可以复用？</span></span>
<span class="line"><span>    → Fence、延迟销毁</span></span>
<span class="line"><span></span></span>
<span class="line"><span>帧为什么变慢？</span></span>
<span class="line"><span>    → CPU、GPU、内存带宽或同步分析</span></span></code></pre></div><p><a href="./rendering-pipeline-and-performance.html">← 上一章：图形渲染管线与性能基础</a> · <a href="./../cpp-engine-foundations.html">返回学习地图</a></p>`,52)])])}const g=s(l,[["render",i]]);export{u as __pageData,g as default};
