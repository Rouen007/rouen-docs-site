# 对象生命周期、RAII 与所有权

现代 C++ 的资源管理可以从一个问题开始：

> 谁拥有资源，资源应该在什么时候释放？

这里的资源不只是堆内存，还包括文件句柄、Socket、互斥锁、GPU Texture、Buffer、音频设备和操作系统对象。它们都有明确的获取与释放协议。

---

## 一、对象生命周期

对象生命周期是对象从正式存在到不再存在的时间区间：

```cpp
void update()
{
    Player player;  // 构造完成，生命周期开始
    player.move();
} // 执行析构，生命周期结束
```

概念上的过程是：

```text
准备存储空间
    ↓
执行构造函数
    ↓
对象进入生命周期
    ↓
使用对象
    ↓
执行析构函数
    ↓
对象生命周期结束
```

拥有一块足够大的原始内存，不代表其中已经存在某个类型的对象。对象只有经过符合语言规则的构造，才能按照该类型访问。

## 二、RAII：把资源绑定到对象

手动管理文件容易遗漏清理路径：

```cpp
void loadFile()
{
    FILE* file = std::fopen("data.bin", "rb");
    if (!file) {
        return;
    }

    if (!checkHeader(file)) {
        std::fclose(file);
        return;
    }

    if (!loadContent(file)) {
        std::fclose(file);
        return;
    }

    std::fclose(file);
}
```

RAII（Resource Acquisition Is Initialization）把资源有效期绑定到 C++ 对象：构造时获取资源，析构时释放资源。

```cpp
class File final {
public:
    explicit File(const char* path)
        : handle_(std::fopen(path, "rb"))
    {
        if (!handle_) {
            throw std::runtime_error("failed to open file");
        }
    }

    ~File()
    {
        if (handle_) {
            std::fclose(handle_);
        }
    }

private:
    std::FILE* handle_ = nullptr;
};
```

使用时不再需要在每条控制流上手动关闭：

```cpp
void loadFile()
{
    File file("data.bin");
    checkHeader(file);
    loadContent(file);
} // 正常返回、提前返回或异常展开都会触发析构
```

RAII 的价值不是少写一行清理代码，而是把清理从“依赖调用者记住”变成由对象生命周期确定性保证。

同样的思想也适用于锁：

```cpp
{
    std::lock_guard lock(mutex);
    updateSharedState();
} // 自动解锁
```

## 三、所有权与借用

裸指针只保存地址，无法单独表达是否可空、由谁释放以及能够存活多久。接口应尽量表达语义：

| 表达方式 | 常见含义 |
|---|---|
| `T` | 值语义，由当前对象直接拥有 |
| `T&` | 必须存在的可修改借用 |
| `const T&` | 必须存在的只读借用 |
| `T*` | 可空的非拥有借用，或与旧接口交互 |
| `std::unique_ptr<T>` | 唯一所有权 |
| `std::shared_ptr<T>` | 共享所有权 |
| `std::weak_ptr<T>` | 不延长生命周期的观察者 |

所有权通常分为三类：

```text
唯一所有权：Owner ──owns──→ Resource

共享所有权：Owner A ──┐
                     ├──owns──→ Resource
            Owner B ──┘

非拥有借用：Owner ──owns──→ Resource
                              ↑
            Observer ─borrows─┘
```

## 四、为什么资源包装器不能浅复制

如果让编译器直接复制前面的 `File`：

```cpp
File fileA("data.bin");
File fileB = fileA;
```

默认成员复制只会复制句柄地址：

```text
fileA.handle_ ──┐
                ├──→ 同一个 FILE
fileB.handle_ ──┘
```

两个对象析构时会重复关闭同一文件，产生未定义行为。唯一资源应禁止复制：

```cpp
File(const File&) = delete;
File& operator=(const File&) = delete;
```

但它可以允许移动，把所有权转交给另一个对象：

```cpp
File(File&& other) noexcept
    : handle_(std::exchange(other.handle_, nullptr))
{
}
```

移动后，新对象拥有文件，源对象为空且仍可安全析构。

## 五、`unique_ptr`：动态对象的默认所有权

```cpp
auto player = std::make_unique<Player>();
```

`unique_ptr` 禁止复制、允许移动，并在析构时自动删除对象：

```cpp
auto playerA = std::make_unique<Player>();
auto playerB = std::move(playerA);

// playerA == nullptr
// playerB 唯一拥有 Player
```

优先使用 `make_unique`：

```cpp
auto player = std::make_unique<Player>(name, health);
```

接口形式可以表达所有权转移：

```cpp
void update(Player& player);                    // 借用并修改
void inspect(const Player& player);             // 只读借用
void addPlayer(std::unique_ptr<Player> player); // 接管所有权
std::unique_ptr<Player> createPlayer();         // 返回所有权
```

`get()` 只取得非拥有地址：

```cpp
Player* borrowed = player.get();
```

不能通过 `borrowed` 删除对象。`release()` 会放弃所有权但不删除对象，容易造成泄漏，只适合把所有权交给明确接管裸指针的旧接口。

## 六、`shared_ptr`：真正的共享所有权

```cpp
auto textureA = std::make_shared<Texture>();
auto textureB = textureA;
```

此时两个 `shared_ptr` 共同拥有 Texture。最后一个强所有者离开时，Texture 才会析构。

### 控制块

`shared_ptr` 除了目标对象地址，还关联一个控制块。控制块通常包含：

- 强引用计数；
- 弱引用计数；
- 删除器；
- 分配器信息。

直接从裸指针构造通常涉及两次独立分配：

```cpp
std::shared_ptr<Texture> texture(new Texture());
```

```text
第一次分配                     第二次分配
┌──────────────┐              ┌─────────────────────┐
│   Texture    │              │ Control Block       │
│ 目标对象本身  │              │ strong / weak / ... │
└──────────────┘              └─────────────────────┘
```

`make_shared` 通常一次申请一块足够大的内存，再在其中构造控制块和 Texture：

```cpp
auto texture = std::make_shared<Texture>();
```

```text
一次堆分配得到的整块内存
┌─────────────────────┬──────────────┐
│ Control Block       │   Texture    │
│ strong / weak / ... │  目标对象本身 │
└─────────────────────┴──────────────┘
```

这只是概念图，具体顺序、间距和布局由标准库实现决定。一次分配表示只向堆分配器申请一次，不表示这块内存只能容纳一个 C++ 对象。

强引用归零时 Texture 会析构。如果仍有 `weak_ptr`，控制块必须继续存在；共同分配的整块内存也可能暂时无法归还给分配器。因此“对象已经析构”和“承载对象的内存已经释放”不一定发生在同一时刻。

### 引用计数安全不等于对象安全

不同 `shared_ptr` 副本对同一控制块进行引用计数操作，通常可以安全地发生在不同线程。但这不代表 Texture 自身可以被无锁并发修改：

```cpp
texture->setWidth(100); // 线程 A
texture->setWidth(200); // 线程 B：仍可能产生数据竞争
```

还要区分三层：

| 层次 | 是否由 `shared_ptr` 自动保证 |
|---|---|
| 控制块引用计数 | 通常安全 |
| 同一个 `shared_ptr` 变量被并发修改 | 不自动安全 |
| `shared_ptr` 指向的对象 | 不自动安全 |

## 七、`weak_ptr` 与引用环

两个对象如果用 `shared_ptr` 相互拥有，会形成引用环：

```cpp
struct Node {
    std::shared_ptr<Node> next;
};
```

```text
Node A ──shared_ptr──→ Node B
Node A ←─shared_ptr─── Node B
```

外部所有者离开后，两边强引用计数仍不为零，两个对象都无法销毁。

非拥有的反向关系可以使用 `weak_ptr`：

```cpp
struct Node {
    std::shared_ptr<Node> child;
    std::weak_ptr<Node> parent;
};
```

访问前使用 `lock()` 临时取得所有权：

```cpp
if (auto parent = node.parent.lock()) {
    parent->update();
}
```

`lock()` 把“确认对象仍然存在”和“取得临时强引用”组合成一个操作。单独先检查 `expired()` 再访问，会在多线程环境中留下检查后对象被销毁的竞态窗口。

## 八、为什么引擎资源常用 Manager + Handle

如果材质、UI 和异步任务都保存同一 Texture 的 `shared_ptr`：

```text
MaterialSystem ──shared_ptr──┐
UISystem       ──shared_ptr──┼──→ Texture
AsyncTask      ──shared_ptr──┘
```

生命周期由所有系统共同决定。场景已经退出时，只要一个异步任务仍持有强引用，纹理就继续占用 CPU 与 GPU 内存。

集中资源管理采用：

```text
TextureManager ──唯一拥有──→ Texture Storage
       ▲
       │ Handle 查询
       │
Material / UI / Entity / Task
```

外部只保存轻量句柄：

```cpp
struct TextureHandle {
    std::uint32_t index;
    std::uint32_t generation;
};
```

### Handle 为什么要增加一层间接访问

直接指针绑定的是某次加载产生的地址：

```text
Material → Texture* → 地址 0x1000
```

Handle 引用的是资源身份：

```text
Material → Handle → Manager Slot → 当前 Texture
```

所有访问经过管理器这个检查点，管理器因此可以：

- 检测旧引用是否已经失效；
- 在外部不改 Handle 的情况下热重载资源；
- 移动或重建内部对象；
- 统一执行加载、卸载、淘汰和内存预算；
- 查询失败时返回占位资源；
- 等待 GPU Fence 后再真正销毁资源。

### `index + generation` 如何识别旧句柄

资源表中有一个槽位：

```text
slot 2: generation=4, Texture B
```

外部拿到：

```text
TextureHandle { index=2, generation=4 }
```

资源被销毁后，槽位的 generation 增加：

```text
slot 2: generation=5, 空
```

旧 Handle `{2, 4}` 再来查询时 generation 不匹配，因此失效。即使 slot 2 以后被 Texture C 复用，旧 Handle 也不会错误访问新对象：

```text
旧 Handle {2, 4} → 无效
新 Handle {2, 5} → Texture C
```

简化的查询逻辑：

```cpp
Texture* TextureManager::get(TextureHandle handle)
{
    if (handle.index >= slots_.size()) {
        return nullptr;
    }

    Slot& slot = slots_[handle.index];
    if (slot.generation != handle.generation || !slot.texture) {
        return nullptr;
    }

    return slot.texture.get();
}
```

### 间接层的成本

Handle 不是免费方案：

| 增加的成本 | 获得的能力 |
|---|---|
| 每次访问需要查表 | 检测失效引用 |
| 多一次间接寻址 | 热重载与替换资源 |
| 需要处理查询失败 | 占位资源和降级路径 |
| 管理器实现更复杂 | 集中预算、加载和卸载 |
| 需要额外销毁协议 | 等待渲染或 GPU 安全点 |

Handle 也不会自动保证并发安全。渲染线程通过 Handle 得到 `Texture*` 后，管理器不能在另一个线程立刻销毁 Texture；仍需帧延迟销毁、Fence 或临时 pin 等机制保证实际使用期间的生命周期。

选择原则是：

- 少量、生命周期天然由业务对象共同决定的对象，可以使用 `shared_ptr`；
- 数量大、需要预算、流式加载、热重载和统一卸载的资源，更适合 Manager + Handle。

---

## 本章结论

1. RAII 把资源释放绑定到对象析构。
2. 所有权描述谁负责结束资源生命周期，借用只提供临时访问。
3. `unique_ptr` 是动态对象的默认所有权模型。
4. `shared_ptr` 只应用于真正存在多个独立所有者的情况。
5. `weak_ptr` 观察共享对象但不延长其生命周期。
6. Manager + Handle 用一次间接访问换取身份稳定、失效检测和集中生命周期控制。

[下一章：复制、移动、Rule of Five 与 noexcept →](./copy-move-noexcept.md)
