# `vector`、`list` 与迭代器失效

选择标准容器不能只看大 O 复杂度，还要同时考虑数据布局、地址稳定性、分配次数、缓存局部性和实际访问模式。

---

## 一、`vector` 的连续内存

`std::vector<T>` 使用一段连续内存：

```cpp
std::vector<int> values = {10, 20, 30};
```

```text
低地址                       高地址
┌────┬────┬────┬────┬────┐
│ 10 │ 20 │ 30 │ 空 │ 空 │
└────┴────┴────┴────┴────┘
```

这里有两个重要概念：

```cpp
values.size();     // 已经构造的有效元素数量
values.capacity(); // 当前内存最多能容纳的元素数量
```

始终满足：

```text
size <= capacity
```

### `reserve` 和 `resize`

```cpp
values.reserve(100);
```

只预留至少可容纳 100 个元素的空间，不创建 100 个元素：

```text
size = 0
capacity >= 100
```

因此下面的访问仍然越界：

```cpp
values.reserve(100);
values[50] = 10; // 错误：size 仍为 0
```

而：

```cpp
values.resize(100);
```

会把有效元素数量改为 100，并构造新增元素。简单区分是：

> `reserve` 准备存储能力，`resize` 改变有效对象数量。

## 二、扩容为什么会使地址失效

容量不足时，`vector` 通常需要：

1. 申请更大的连续内存；
2. 复制或移动旧元素；
3. 构造新元素；
4. 销毁旧元素；
5. 释放旧内存。

```text
扩容前：旧内存 0x1000  [A][B]

扩容后：新内存 0x5000  [A][B][C][空]
        旧内存 0x1000  已释放
```

如果扩容前保存元素地址：

```cpp
Entity* player = &entities[0];
entities.push_back(Entity{}); // 可能扩容
player->update();             // player 可能已经悬空
```

扩容后，`player` 仍保存旧地址。继续访问属于未定义行为。

容易误判的原因是：

- 数据较少时没有触发扩容；
- 旧内存暂时尚未被覆盖；
- Debug 和 Release 的分配行为可能不同；
- 错误可能表现为延迟崩溃或随机状态损坏。

## 三、`vector` 的失效规则

### 发生重新分配

所有指向元素的指针、引用和迭代器都失效，过去的 `end()` 也失效。

可能触发重新分配的操作包括：

```cpp
push_back
emplace_back
insert
reserve
resize
```

是否真的重新分配取决于当前容量和操作参数。

### `push_back` 没有重新分配

已有元素的指针和引用保持有效，但过去的 `end()` 失效，因为逻辑末尾发生了变化。

### 中间插入且没有重新分配

插入位置之前的元素保持原位；插入位置及之后的元素会被向后移动，因此对应的指针、引用和迭代器失效。

```text
原来：[A][B][C][D]
          ↑ 在 B 前插入 X

结果：[A][X][B][C][D]
```

### 删除元素

```cpp
values.erase(iterator);
```

被删除位置以及之后的元素会被向前移动，因此相关迭代器、引用和指针失效。删除位置之前的元素保持有效。

## 四、`reserve` 能解决什么

```cpp
std::vector<Entity> entities;
entities.reserve(1000);
```

只要元素数量不超过预留容量，尾部插入就不会因为容量不足而重新分配。它可以：

- 减少分配次数；
- 减少元素搬运；
- 降低峰值内存；
- 避免关键帧发生扩容尖峰。

但 `reserve` 不能保证永久地址稳定。超过预留容量仍会扩容，中间插入和删除仍会移动元素。

## 五、索引与 Handle

扩容会改变地址，但不会改变元素在逻辑顺序中的索引：

```cpp
std::size_t playerIndex = 0;
entities[playerIndex].update();
```

不过删除、排序和 swap-and-pop 都可能改变索引。因此，需要稳定身份时，可以使用：

```cpp
struct EntityHandle {
    std::uint32_t index;
    std::uint32_t generation;
};
```

索引重新定位槽位，generation 验证槽位是否仍属于同一对象。

## 六、为什么 `vector` 遍历通常很快

连续元素具有良好的空间局部性：

```text
[A][B][C][D][E][F]
```

CPU 以缓存行为单位读取数据。假设缓存行是 64 字节，一个 `int` 是 4 字节，一次加载可以带入最多 16 个连续 `int`。

顺序遍历时，CPU 可以：

- 预测后续地址；
- 预取下一段数据；
- 减少 Cache Miss；
- 更容易自动向量化；
- 用更少的内存承载更多有效数据。

## 七、`list` 的节点式结构

`std::list<T>` 通常是双向链表，每个节点独立分配：

```text
Node A                    Node B                    Node C
┌──────────┐             ┌──────────┐             ┌──────────┐
│ previous │             │ previous │             │ previous │
│ value    │ ←─────────→ │ value    │ ←─────────→ │ value    │
│ next     │             │ next     │             │ next     │
└──────────┘             └──────────┘             └──────────┘
地址 0x1000               地址 0x9000               地址 0x3000
```

逻辑相邻不代表物理内存相邻。遍历需要不断读取 next 指针并跳到另一个地址，容易产生指针追逐和 Cache Miss。

每个节点还要承担：

- 前驱和后继指针；
- 单独分配的元数据与对齐成本；
- 分配器调用；
- 更差的缓存密度。

## 八、`O(1)` 插入为什么不一定更快

`list` 在已经持有目标迭代器时，插入只需链接节点，复杂度是 `O(1)`。但实际工作可能包含：

1. 分配新节点；
2. 构造对象；
3. 读取前后节点；
4. 修改多个指针；
5. 在未来遍历中承担缓存代价。

`vector` 中间插入是 `O(n)`，但如果元素很小且数据已经在 Cache 中，连续搬运一段内存可能比一次节点分配和多次随机访问更快。

> 大 O 描述规模增长趋势，不直接等于特定硬件上的实际耗时。

## 九、`list` 什么时候合适

除非节点本身被删除，`list` 中其他节点的指针、引用和迭代器通常保持有效。

它适合：

- 必须保持节点地址稳定；
- 已经持有目标迭代器；
- 频繁在链表之间 `splice`；
- 不需要随机访问；
- 遍历性能不是主要瓶颈。

```cpp
runningJobs.splice(
    runningJobs.end(),
    waitingJobs,
    jobIterator
);
```

`splice` 可以重新连接节点，不必移动 Job 对象。但如果必须先线性搜索目标节点，查找仍然是 `O(n)`。

## 十、容器特征对比

| 维度 | `vector` | `list` |
|---|---|---|
| 内存布局 | 连续 | 节点分散 |
| 随机访问 | `O(1)` | `O(n)` |
| 顺序遍历 | 通常很快 | 通常较慢 |
| 尾部插入 | 摊销 `O(1)` | `O(1)` |
| 中间插入 | `O(n)` 搬运 | 已知位置时 `O(1)` 链接 |
| 每元素额外开销 | 较小 | 前后指针与分配开销 |
| 地址稳定性 | 扩容、插入、删除会影响 | 未删除节点通常稳定 |
| CPU Cache | 友好 | 通常较差 |
| SIMD 与批处理 | 友好 | 不友好 |

默认可以先考虑 `vector`，只有确实需要节点稳定或链表操作时再选择 `list`。

## 十一、删除策略

### 不要求保持顺序：swap-and-pop

```cpp
void removeAt(std::vector<Entity>& entities, std::size_t index)
{
    entities[index] = std::move(entities.back());
    entities.pop_back();
}
```

```text
原来：[A][B][C][D]
          ↑ 删除 B

移动 D：[A][D][C][D]
删除尾部：[A][D][C]
```

复杂度接近 `O(1)`，但元素顺序改变。如果外部保存 ID 到索引的映射，还必须同步更新被移动对象的新索引。

### 保持顺序：erase-remove

```cpp
entities.erase(
    std::remove_if(
        entities.begin(),
        entities.end(),
        [](const Entity& entity) {
            return entity.isDead();
        }
    ),
    entities.end()
);
```

`remove_if` 把保留元素向前移动并返回新的逻辑末尾；`erase` 再销毁尾部元素。C++20 可以使用 `std::erase_if` 简化。

## 十二、容量复用与 `shrink_to_fit`

```cpp
commands.clear();
```

`clear()` 销毁元素并把 size 设为 0，但通常保留 capacity，适合下一帧复用已有内存。

```cpp
commands.shrink_to_fit();
```

只是请求缩小 capacity，标准不保证一定执行。若执行，可能重新分配并搬运所有元素，使迭代器、引用和指针失效，也可能造成耗时尖峰，因此不适合高频调用。

## 十三、引擎实践

- 高频遍历数据优先连续容器，如 Transform、Particle、DrawCommand。
- 已知规模时提前 `reserve`。
- 不长期保存可能扩容的 `vector` 元素裸指针。
- 稳定身份使用 Handle、Slot Map、对象池或 ID 到索引映射。
- 大量删除可以先标记，再集中压缩。
- 每帧临时容器通过 `clear()` 复用容量，避免反复分配。
- 是否更换容器应由采样数据和访问模式决定。

---

## 本章结论

1. `vector` 连续存放元素，具有良好的缓存局部性。
2. `size` 是有效元素数，`capacity` 是当前存储能力。
3. 扩容使所有旧元素地址、引用和迭代器失效。
4. `reserve` 减少扩容，但不保证永久地址稳定。
5. `list` 提供稳定节点和常数复杂度链接操作，但承担分配与缓存成本。
6. `O(1)` 链表插入不一定比连续内存中的 `O(n)` 搬运更快。
7. 引擎热路径通常优先连续数据，稳定身份通过额外索引层解决。

[← 上一章：对象模型、虚函数与多态](./object-model-polymorphism.md) · [下一章：map、unordered_map 与 rehash →](./map-unordered-map.md)
