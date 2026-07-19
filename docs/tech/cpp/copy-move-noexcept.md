# 复制、移动、Rule of Five 与 `noexcept`

资源类型不仅要决定如何析构，还要回答：复制时是共享还是深复制？移动时如何转移所有权？操作失败后对象处于什么状态？

---

## 一、五个特殊成员函数

与资源生命周期密切相关的五个操作是：

```cpp
class Resource {
public:
    ~Resource();                            // 析构
    Resource(const Resource&);              // 复制构造
    Resource& operator=(const Resource&);   // 复制赋值
    Resource(Resource&&);                   // 移动构造
    Resource& operator=(Resource&&);        // 移动赋值
};
```

| 操作 | 需要回答的问题 |
|---|---|
| 析构 | 当前资源如何释放？ |
| 复制构造 | 新对象如何取得独立副本？ |
| 复制赋值 | 已存在对象如何释放旧状态并取得副本？ |
| 移动构造 | 新对象如何接管旧对象资源？ |
| 移动赋值 | 已存在对象如何释放旧资源并接管新资源？ |

## 二、只写析构函数为什么不够

```cpp
class Buffer {
public:
    explicit Buffer(std::size_t size)
        : data_(new std::byte[size]), size_(size)
    {
    }

    ~Buffer()
    {
        delete[] data_;
    }

private:
    std::byte* data_ = nullptr;
    std::size_t size_ = 0;
};
```

默认复制只复制成员值：

```cpp
Buffer a(1024);
Buffer b = a;
```

```text
a.data_ ──┐
          ├──→ 同一块内存
b.data_ ──┘
```

两个对象最终都会 `delete[]` 同一地址，造成重复释放。因此，直接管理资源的类型必须整体设计复制、移动与析构语义。

## 三、Rule of Three

Rule of Three 指出：如果类需要自定义析构、复制构造、复制赋值中的任何一个，通常都要检查另外两个。

### 深复制构造

```cpp
Buffer(const Buffer& other)
    : data_(new std::byte[other.size_]),
      size_(other.size_)
{
    std::copy_n(other.data_, size_, data_);
}
```

复制后两个对象内容相同，但拥有不同内存。

### Copy-and-swap 复制赋值

复制赋值的目标对象原本可能已经拥有资源：

```cpp
Buffer& operator=(const Buffer& other)
{
    if (this != &other) {
        Buffer temporary(other);
        swap(temporary);
    }

    return *this;
}

void swap(Buffer& other) noexcept
{
    std::swap(data_, other.data_);
    std::swap(size_, other.size_);
}
```

过程是：

```text
复制 other 得到 temporary
        ↓
交换当前对象与 temporary 的资源
        ↓
temporary 析构，释放当前对象原来的旧资源
```

如果复制 temporary 时分配失败，当前对象仍保持原值，这提供了强异常保证。

## 四、Rule of Five

C++11 增加移动语义后，还需要检查移动构造和移动赋值，这就是 Rule of Five。

### 移动构造

```cpp
Buffer(Buffer&& other) noexcept
    : data_(std::exchange(other.data_, nullptr)),
      size_(std::exchange(other.size_, 0))
{
}
```

移动前后：

```text
移动前：other.data_ → [数据]

移动后：新对象.data_ → [数据]
        other.data_   → nullptr
```

### 移动赋值

```cpp
Buffer& operator=(Buffer&& other) noexcept
{
    if (this != &other) {
        delete[] data_;
        data_ = std::exchange(other.data_, nullptr);
        size_ = std::exchange(other.size_, 0);
    }

    return *this;
}
```

移动赋值比移动构造多一步：目标对象已经存在，必须先释放自己原来的资源。

## 五、移动到底是什么

`std::move` 本身不搬运数据，只把表达式转换为右值，使移动重载可以参与选择：

```cpp
Buffer b = std::move(a);
```

概念过程是：

```text
std::move(a)
    ↓
把 a 表达成右值
    ↓
重载决议选择 Buffer(Buffer&&)
    ↓
移动构造函数实际转移资源
```

所以，写了 `std::move` 不等于一定发生低成本移动。如果类型没有移动构造，右值仍可能绑定到 `const T&` 并执行复制。

移动通常避免深复制，但不是零成本。它仍可能修改源对象、更新成员状态、释放目标原资源，某些类型甚至会在移动中分配内存。

移动后的源对象必须有效且可析构，但具体值通常未指定。除非类型明确承诺，最稳妥的操作是销毁它或重新赋值。

## 六、Rule of Zero

手写五个特殊函数容易出错。更好的上层设计是让已经正确管理资源的成员承担责任：

```cpp
class Buffer {
public:
    explicit Buffer(std::size_t size)
        : data_(size)
    {
    }

private:
    std::vector<std::byte> data_;
};
```

`vector` 已经实现正确的析构、深复制、移动和异常安全，Buffer 不再需要手写特殊成员函数。

```text
底层少数 RAII 类型
    ↓
负责文件、Socket、GPU Handle、专用内存

上层大量业务类型
    ↓
组合 RAII 成员，遵循 Rule of Zero
```

`= default` 要求编译器按成员生成默认操作；`= delete` 明确禁止操作：

```cpp
Resource(Resource&&) = default;
Resource(const Resource&) = delete;
```

## 七、自定义析构可能抑制自动移动

```cpp
class Data {
public:
    ~Data()
    {
        logDestruction();
    }

private:
    std::vector<int> values_;
};
```

虽然 `vector` 支持移动，但用户声明析构函数后，编译器不会自动隐式声明 Data 的移动构造和移动赋值。下面的写法可能最终调用复制构造：

```cpp
Data b = std::move(a);
```

如果确实需要自定义析构，又需要移动，应明确声明相应操作：

```cpp
Data(Data&&) noexcept = default;
Data& operator=(Data&&) noexcept = default;
Data(const Data&) = default;
Data& operator=(const Data&) = default;
```

不过没有必要的自定义析构最好删除，让类型回到 Rule of Zero。

---

## 八、`vector` 扩容时发生什么

`vector` 使用连续内存。当 `size() == capacity()` 后继续插入，通常需要：

1. 申请更大的连续内存；
2. 在新内存中复制或移动旧元素；
3. 构造新元素；
4. 销毁旧元素；
5. 释放旧内存。

```text
旧内存：[A][B][C]
           │ 搬运
           ▼
新内存：[A'][B'][C'][D][空余……]
```

扩容会使指向旧元素的迭代器、引用和指针失效，还可能在搬运期间同时持有新旧两块内存，形成峰值内存。

## 九、强异常保证为什么影响移动选择

标准容器通常希望：如果扩容失败，原容器仍保持操作前的内容。

### 复制失败容易回滚

复制不会修改旧元素。复制 B 时抛异常：

```text
旧内存：[A][B][C]     仍然完整
新内存：[A'][B' 构造失败]
```

容器可以销毁 A'、释放新内存，并继续保留原来的 A、B、C。

### 可能抛异常的移动难以回滚

```text
移动 A 成功：旧 A 进入 moved-from 状态
移动 B 成功：旧 B 进入 moved-from 状态
移动 C 失败：抛出异常
```

此时旧内存可能是：

```text
[moved-from A][moved-from B][C]
```

容器不知道如何通用地恢复 A 和 B；把它们移回去也可能再次失败。因此，可能抛异常的移动不利于维持强异常保证。

## 十、`noexcept` 给容器的承诺

```cpp
T(T&& other) noexcept;
```

表示移动构造不会向调用者传播异常。容器可以确信搬运不会进行一半后失败，因此更愿意使用移动。

选择逻辑可以用 `std::move_if_noexcept` 理解：

```cpp
if constexpr (std::is_nothrow_move_constructible_v<T> ||
              !std::is_copy_constructible_v<T>) {
    construct(std::move(oldElement));
} else {
    construct(oldElement); // copy
}
```

| 类型能力 | 扩容时的典型选择 | 原因 |
|---|---|---|
| 移动为 `noexcept` | 移动 | 成本较低且不会中途抛出 |
| 移动可能抛出，复制可用 | 复制 | 便于回滚并保留旧容器 |
| 移动可能抛出，复制不可用 | 只能尝试移动 | 异常保证可能减弱 |

这解释了为什么一个类型明明有移动构造，`vector` 扩容时仍可能调用复制构造。

## 十一、如何正确声明 `noexcept`

只转移指针和整数的移动通常可以不抛异常：

```cpp
class Buffer {
public:
    Buffer(Buffer&& other) noexcept
        : data_(std::exchange(other.data_, nullptr)),
          size_(std::exchange(other.size_, 0))
    {
    }

private:
    std::byte* data_ = nullptr;
    std::size_t size_ = 0;
};
```

默认生成移动函数时，编译器会根据成员和基类的移动能力推导异常说明：

```cpp
class TextureHandleOwner {
public:
    TextureHandleOwner(TextureHandleOwner&&) = default;
    TextureHandleOwner& operator=(TextureHandleOwner&&) = default;

private:
    std::unique_ptr<Resource> resource_;
    std::uint32_t id_ = 0;
};

static_assert(
    std::is_nothrow_move_constructible_v<TextureHandleOwner>
);
```

不能为了让容器使用移动而虚假标记 `noexcept`：

```cpp
Data(Data&& other) noexcept
{
    storage_ = new int[other.size_]; // new 仍可能抛出
}
```

如果 `noexcept` 函数抛出异常，程序会调用 `std::terminate`，而不是把异常正常传给上层。

`noexcept` 是契约，不是简单的性能开关。正确顺序是先让移动实现真正不会抛，再作出承诺。

## 十二、实时系统中的影响

假设一个 `vector<Mesh>` 扩容。如果 Mesh 的移动可能抛异常而复制可用，容器可能深复制所有 Mesh，造成：

- 大量内存分配；
- 数据复制；
- 瞬时内存峰值；
- 单帧耗时尖峰。

可以同时使用两类策略：

```cpp
meshes.reserve(expectedMeshCount);
```

- `reserve` 减少扩容次数；
- 正确的 `noexcept` 移动降低扩容发生时的搬运成本；
- 稳定 ID 或 Handle 避免长期保存会因扩容失效的元素地址；
- 固定上限数据可以使用定容容器或专用分配器。

平均摊销 `O(1)` 不代表每次操作都稳定。实时系统更关心最坏帧和长尾延迟。

---

## 本章结论

1. 直接管理资源的类型必须整体设计析构、复制和移动。
2. Rule of Zero 优先于手写 Rule of Five。
3. `std::move` 只改变表达式类别，真正转移由移动函数完成。
4. moved-from 对象有效但通常处于未指定状态。
5. `vector` 为维持异常保证，可能在扩容时从移动退回复制。
6. `noexcept` 必须反映真实行为，错误承诺可能直接终止程序。
7. `reserve` 与安全移动分别控制扩容频率和单次扩容成本。

[← 上一章：对象生命周期、RAII 与所有权](./lifetime-raii-ownership.md) · [下一章：对象模型、虚函数与多态 →](./object-model-polymorphism.md)
