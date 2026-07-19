# 对象模型、虚函数与多态

这一章讨论对象在内存中的常见布局、成员函数如何找到当前对象，以及运行时多态通常怎样通过虚表实现。

> C++ 标准规定可观察行为，不强制编译器必须使用某种 ABI。下面的 vptr、vtable 和布局图描述主流编译器的常见实现，不能当作所有平台上的固定标准。

---

## 一、对象主要保存实例数据

```cpp
class Player {
public:
    void update();

private:
    int health_;
    float speed_;
};
```

一个 Player 对象通常保存每个实例独有的数据：

```text
Player 对象
┌──────────────┐
│ health_      │
│ speed_       │
└──────────────┘
```

成员函数代码不会在每个对象中复制一份：

```text
Player A ──┐
Player B ──┼──调用同一份 Player::update 机器码
Player C ──┘
```

调用：

```cpp
player.update();
```

可以概念性地理解为把当前对象地址作为隐藏参数传给函数：

```cpp
Player::update(&player);
```

这个隐藏的当前对象地址就是 `this`。

## 二、对齐与填充

成员不一定紧密排列：

```cpp
struct Data {
    char a;
    int b;
    char c;
};
```

成员大小相加是 6 字节，但在常见平台上可能得到 12 字节：

```text
offset 0: a        1 字节
offset 1: padding  3 字节
offset 4: b        4 字节
offset 8: c        1 字节
offset 9: padding  3 字节
```

调整顺序可能减少填充：

```cpp
struct BetterData {
    int b;
    char a;
    char c;
};
```

常见布局可能是 8 字节。具体结果受平台、ABI、成员类型和编译器影响，应使用 `sizeof`、`alignof` 和工具验证，而不是依赖示意图。

对象数量很大时，少量填充也会放大：

```text
每个对象多 4 字节 × 1,000,000 个对象 ≈ 4 MB
```

## 三、普通调用与运行时多态

普通成员函数的目标在编译时已知：

```cpp
class Animal {
public:
    void speak();
};
```

```cpp
Animal animal;
animal.speak(); // 直接目标是 Animal::speak
```

运行时多态需要根据实际对象选择实现：

```cpp
class Animal {
public:
    virtual void speak();
};

class Dog : public Animal {
public:
    void speak() override;
};

class Cat : public Animal {
public:
    void speak() override;
};
```

```cpp
Dog dog;
Animal* animal = &dog;
animal->speak(); // 调用 Dog::speak
```

这里要区分：

- 静态类型：表达式在编译期看到的类型，此处是 `Animal*`；
- 动态类型：运行时对象的实际类型，此处是 `Dog`。

## 四、vptr 与 vtable 的常见实现

主流编译器通常给含虚函数的对象加入一个隐藏的虚表指针 vptr：

```text
Dog 对象
┌──────────────┐
│ vptr         │──────┐
├──────────────┤      │
│ Animal 数据   │      │
├──────────────┤      │
│ Dog 数据      │      │
└──────────────┘      │
                      ▼
              Dog Virtual Table
              ┌────────────────┐
              │ Dog::speak     │
              │ Dog::~Dog      │
              │ 其他虚函数……    │
              └────────────────┘
```

虚表通常由同一动态类型的对象共享：

```text
Dog A.vptr ──┐
Dog B.vptr ──┼──→ 同一张 Dog vtable
Dog C.vptr ──┘
```

对象一般只保存 vptr，不会在每个实例中保存整张函数表。

## 五、一次虚调用大致发生什么

```cpp
Animal* animal = getAnimal();
animal->speak();
```

概念过程：

```text
从对象读取 vptr
    ↓
在 vtable 中找到 speak 对应槽位
    ↓
读取最终函数地址
    ↓
间接调用目标函数，并传入 this
```

如果动态类型是 Dog：

```text
animal → Dog 对象 → Dog vtable → Dog::speak
```

如果动态类型是 Cat：

```text
animal → Cat 对象 → Cat vtable → Cat::speak
```

编译器在能够证明动态类型时，仍可能进行去虚拟化，把虚调用优化为直接调用甚至内联。

## 六、`override`、`final` 与纯虚函数

派生类应使用 `override` 验证签名：

```cpp
class Base {
public:
    virtual void update() const;
};

class Derived : public Base {
public:
    void update() const override;
};
```

如果漏写 `const`，`override` 会让编译器报错，避免意外创建一个新函数而不是重写基类函数。

`final` 可以禁止继续重写或继承：

```cpp
void update() final;

class MetalDevice final : public GraphicsDevice {
};
```

纯虚函数定义接口：

```cpp
class Renderer {
public:
    virtual ~Renderer() = default;
    virtual void beginFrame() = 0;
    virtual void draw() = 0;
    virtual void endFrame() = 0;
};
```

Renderer 是抽象类，不能直接实例化。平台实现可以分别继承：

```text
Renderer
  ├── MetalRenderer
  ├── VulkanRenderer
  └── DirectXRenderer
```

## 七、虚析构函数

如果对象会通过基类指针删除，基类析构必须是虚函数：

```cpp
class Animal {
public:
    virtual ~Animal() = default;
};

Animal* animal = new Dog();
delete animal;
```

正确销毁顺序是：

```text
Dog::~Dog()
    ↓
Animal::~Animal()
    ↓
释放完整对象内存
```

如果基类析构非虚，通过基类指针删除派生对象属于未定义行为，派生类资源可能无法释放。

不是所有基类都必须有虚析构。如果设计明确禁止多态删除，可以使用受保护的非虚析构：

```cpp
class Base {
protected:
    ~Base() = default;
};
```

常见规则是二选一：

- 公有虚析构：允许通过基类指针删除；
- 受保护非虚析构：禁止这种删除方式。

## 八、对象切片

```cpp
Dog dog;
Animal animal = dog;
```

这里创建的是独立 Animal 对象，Dog 特有部分被截掉：

```text
原 Dog：                    复制后的 animal：
┌──────────────┐           ┌──────────────┐
│ Animal 部分   │           │ Animal 部分   │
├──────────────┤           └──────────────┘
│ Dog 部分      │
└──────────────┘
```

按基类值传参同样会切片：

```cpp
void speak(Animal animal); // 会复制为 Animal
```

需要保留动态类型时使用引用或指针：

```cpp
void speak(const Animal& animal)
{
    animal.speak();
}
```

## 九、构造与析构期间的虚调用

```cpp
class Base {
public:
    Base()
    {
        initialize();
    }

    virtual void initialize();
};

class Derived : public Base {
public:
    void initialize() override;
};
```

执行 Base 构造函数时，Derived 部分尚未构造完成，因此虚调用只分派到当前构造层次，不会调用尚未完成的 Derived 实现。

析构时同理：Derived 部分已经销毁后，Base 析构中的虚调用不会重新进入 Derived。

因此，不应依赖构造或析构期间的虚调用完成派生类初始化。可以在完整构造后显式初始化，或使用工厂函数组织流程。

## 十、虚函数的性能成本

一次虚调用的直接成本通常包括：

- 读取对象的 vptr；
- 从 vtable 读取函数地址；
- 执行一次间接跳转。

但热路径中更大的成本往往来自周边数据组织。

### 内联机会降低

普通调用目标固定，编译器更容易内联。虚调用目标可能在运行时才确定，虽然编译器有时可以去虚拟化，但不能始终依赖。

### 对象分散

```cpp
std::vector<std::unique_ptr<Component>> components;
```

对象可能分散在堆中：

```text
vector → pointer → Component A
       → pointer → Component B
       → pointer → Component C
```

遍历会产生指针追逐和缓存未命中。

### 调用目标分散

异构对象交替出现时，间接分支预测和指令缓存可能受到影响：

```text
Mesh → Audio → Script → Particle → Mesh
```

所以虚函数成本通常是间接调用、难以内联、对象分散和异构分支共同作用的结果，而不只是“查一次虚表”。

## 十一、引擎中如何选择

虚函数适合边界清晰、调用频率相对较低的模块：

- 图形设备与渲染后端；
- 文件系统和平台抽象；
- 编辑器插件；
- 输入、音频和系统服务接口；
- 数量较少的高层模块。

例如图形接口背后的操作本身较重，虚调用通常不是主要成本：

```cpp
class GraphicsDevice {
public:
    virtual ~GraphicsDevice() = default;
    virtual BufferHandle createBuffer(...) = 0;
    virtual void submit(...) = 0;
};
```

虚函数不一定适合海量数据的每帧热循环：

- 粒子更新；
- 骨骼计算；
- 可见性裁剪；
- 高频物理处理；
- 紧密数值循环。

这些场景可以考虑连续数组、按类型批处理、SoA、模板静态多态、`variant` 或 ECS。选择依据应是采样数据和访问模式，而不是机械地拒绝虚函数。

---

## 本章结论

1. 对象主要保存实例数据，成员函数代码由对象共享。
2. 成员顺序、对齐和填充会影响对象大小与缓存效率。
3. 主流编译器通常通过 vptr 和 vtable 实现运行时多态。
4. 多态基类需要明确是否允许通过基类指针删除。
5. 按基类值复制会发生对象切片。
6. 构造和析构期间的虚调用只作用于当前构造层次。
7. 虚函数的性能应结合内联、数据布局、缓存和分支预测一起判断。
8. 虚函数适合系统边界，不一定适合海量对象的热循环。

[← 上一章：复制、移动、Rule of Five 与 noexcept](./copy-move-noexcept.md) · [下一章：vector、list 与迭代器失效 →](./containers-vector-list.md)
