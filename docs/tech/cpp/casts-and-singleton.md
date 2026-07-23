# 类型转换与单例模式

本篇整理 C++ 中常见的显式类型转换，以及单例的几种实现方式、适用边界和工程注意事项。

## 一、为什么要显式转换

C++ 允许很多隐式类型转换，但隐式转换可能隐藏精度损失、类型误判或所有权问题。显式 Cast 的价值是把“这里发生了类型转换”写出来，让代码意图更清楚，也方便编译器和代码审查发现风险。

```cpp
double value = 3.14;
int number = static_cast<int>(value); // 明确表示小数被截断
```

C++ 常见的四种 Cast 如下：

| Cast | 主要用途 | 是否运行时检查 |
| --- | --- | --- |
| `static_cast` | 普通数值转换、明确的继承关系转换 | 通常不检查 |
| `dynamic_cast` | 多态类型的安全向下转换 | 会检查 |
| `const_cast` | 增加或移除 `const` / `volatile` | 不检查对象属性 |
| `reinterpret_cast` | 重新解释地址或底层内存 | 基本不检查 |

## 二、`static_cast`

### 2.1 数值类型转换

```cpp
double value = 3.14;
int number = static_cast<int>(value); // 3

int a = 5;
int b = 2;
double result = static_cast<double>(a) / b; // 2.5
```

它表达的是“把这个值转换成另一种类型”。转换是否丢失精度，需要调用者自己确认。

### 2.2 继承关系转换

```cpp
Base* base = ...;
Derived* derived = static_cast<Derived*>(base);
```

这种写法不会在运行时确认真实类型。只有当程序能够保证 `base` 实际指向 `Derived` 时才安全，否则后续访问可能产生未定义行为。

## 三、`dynamic_cast`

`dynamic_cast` 用于带虚函数的多态层次中，运行时检查对象真实类型：

```cpp
class Base {
public:
    virtual ~Base() = default;
};

Base* base = ...;
Derived* derived = dynamic_cast<Derived*>(base);

if (derived != nullptr) {
    derived->run();
}
```

如果对象不是目标类型，指针转换得到 `nullptr`。它比 `static_cast` 安全，但有运行时检查成本，也说明代码可能需要重新考虑对象分类或接口设计。

## 四、`const_cast`

`const_cast` 只能修改类型上的 `const` 或 `volatile` 限定：

```cpp
void legacy_api(char* text);

const char* text = "data";
legacy_api(const_cast<char*>(text));
```

如果原对象本身就是 `const`，通过转换后的指针修改它会产生未定义行为。因此它主要用于适配无法修改的旧接口，而不应作为普通修改数据的手段。

## 五、`reinterpret_cast`

`reinterpret_cast` 不负责理解数据含义，而是把同一段地址或二进制表示按另一种类型重新解释：

```cpp
int value = 10;

std::uintptr_t address =
    reinterpret_cast<std::uintptr_t>(&value);

int* pointer = reinterpret_cast<int*>(address);
```

常见于：

- C 接口中的 `void*` 上下文指针；
- 平台句柄、原始地址和底层资源适配；
- 内存系统和二进制数据观察；
- 某些硬件或图形 API 的接口边界。

使用时必须同时确认：

- 地址对齐满足目标类型要求；
- 对象确实已经构造，且生命周期仍然有效；
- 访问不会违反严格别名规则；
- 二进制数据的字节序和布局符合预期。

下面的代码不能用来代替 `dynamic_cast`：

```cpp
Base* base = ...;
Derived* derived = reinterpret_cast<Derived*>(base); // 风险很高
```

它不会检查 `base` 的真实类型。普通业务代码和引擎高层逻辑应尽量避免使用 `reinterpret_cast`，把它限制在底层适配边界。

## 六、四种 Cast 的选择

```text
值的正常转换                 → static_cast
需要确认多态对象真实类型       → dynamic_cast
适配 const/volatile 接口       → const_cast
操作地址、句柄或底层二进制     → reinterpret_cast
```

如果只是为了让代码编译通过，不应直接选择风险最高的 Cast，而应先确认对象生命周期、真实类型、所有权和接口设计。

## 七、单例的基本目标

单例希望保证：

1. 一个类在进程内只有一个实例；
2. 外部无法随意创建第二个实例；
3. 所有访问都经过统一入口。

单例通常由私有构造函数、静态访问函数以及删除拷贝操作组成。

## 八、函数内静态对象

这是最简单、最常用的实现：

```cpp
class RenderManager {
public:
    static RenderManager& instance() {
        static RenderManager manager;
        return manager;
    }

    void render();

private:
    RenderManager() = default;
    RenderManager(const RenderManager&) = delete;
    RenderManager& operator=(const RenderManager&) = delete;
};
```

```cpp
RenderManager::instance().render();
```

C++11 之后，局部静态对象的首次初始化是线程安全的。但这只保证“创建一次”，不代表 `RenderManager` 内部的数据操作天然线程安全。

## 九、静态成员对象

```cpp
class Config {
public:
    static Config& instance() {
        return instance_;
    }

private:
    Config() = default;
    inline static Config instance_;
};
```

这种方式实现简单，实例通常会存活到程序结束。需要注意不同编译单元之间的静态初始化顺序。

## 十、`unique_ptr` 管理的单例

```cpp
class ResourceManager {
public:
    static ResourceManager& instance() {
        if (!instance_) {
            instance_ = std::make_unique<ResourceManager>();
        }
        return *instance_;
    }

    static void shutdown() {
        instance_.reset();
    }

private:
    ResourceManager() = default;
    inline static std::unique_ptr<ResourceManager> instance_;
};
```

它的优点是所有权明确，并且可以主动释放资源。适合需要明确启动和关闭顺序的资源系统，但首次创建和销毁过程仍然需要考虑多线程访问。

## 十一、显式初始化和销毁

对于渲染设备、音频设备等有明显生命周期的系统，可以把初始化和关闭写出来：

```cpp
class Engine {
public:
    static void initialize() {
        instance_ = std::make_unique<Engine>();
    }

    static void shutdown() {
        instance_.reset();
    }

    static Engine& instance() {
        assert(instance_ != nullptr);
        return *instance_;
    }

private:
    Engine() = default;
    inline static std::unique_ptr<Engine> instance_;
};
```

```cpp
Engine::initialize();
Engine::instance().update();
Engine::shutdown();
```

这种方式的重点不是“任何时候都能访问”，而是让系统的启动、使用和关闭顺序可见。

## 十二、顶层对象统一持有

很多时候不需要真正的全局单例，可以让引擎上下文统一持有各个系统：

```cpp
class EngineContext {
public:
    RenderManager renderManager;
    ResourceManager resourceManager;
};

void update(EngineContext& context) {
    context.renderManager.render();
}
```

这种方式能够明确表达依赖关系，也可以创建多个独立上下文，更容易测试和替换。通常应优先考虑这种方式，只有真正需要全局唯一的系统才使用单例。

## 十三、单例的工程边界

适合单例或全局唯一管理的对象：

```text
日志系统、平台接口、渲染设备、全局资源缓存、任务调度器
```

不适合单例的对象：

```text
普通业务对象、临时对象、需要多个实例的系统、需要方便替换测试的模块
```

还要区分两个概念：

```text
实例初始化线程安全
        ≠
实例内部成员访问线程安全
```

如果多个线程同时修改资源表、配置或任务队列，仍然需要互斥锁、读写锁或原子变量。

## 十四、最小知识主线

```text
正常值转换                 → static_cast
多态类型确认               → dynamic_cast
修改类型限定               → const_cast
地址和底层二进制适配       → reinterpret_cast

简单延迟初始化             → 函数内静态对象
需要主动释放               → unique_ptr 单例
需要明确启动关闭           → 显式 initialize/shutdown
依赖关系和测试更重要       → 顶层 Context 持有
```

[← 上一章：引擎运行时与渲染系统速览](./engine-runtime-quick-reference.md) · [返回学习地图](../cpp-engine-foundations.md)
