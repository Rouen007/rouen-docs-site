# `map`、`unordered_map` 与 rehash

`map` 和 `unordered_map` 都保存键值对，但一个主要依赖有序平衡树，另一个依赖哈希与 Bucket。选择时需要同时考虑顺序、最坏复杂度、缓存、地址稳定性和增长尖峰。

---

## 一、`map`：有序平衡树

```cpp
std::map<int, std::string> players;

players.emplace(10, "Alice");
players.emplace(3, "Bob");
players.emplace(7, "Carol");
```

主流标准库通常使用红黑树实现 `map`：

```text
          7
        /   \
       3     10
```

每个节点通常包含父节点、左右子节点、平衡信息、键和值。树保持近似平衡，因此查找、插入和删除的复杂度通常为 `O(log n)`。

### 有序能力

遍历按键排序：

```cpp
for (const auto& [id, name] : players) {
    std::cout << id;
}
```

输出：

```text
3 7 10
```

还可以执行：

```cpp
players.lower_bound(7); // 第一个不小于 7 的键
players.upper_bound(7); // 第一个大于 7 的键
```

`map` 适合需要有序遍历、范围查询、稳定最坏复杂度或稳定节点引用的场景。

### 地址稳定性

插入新节点不会移动现有节点，因此原有迭代器、引用和指针保持有效。删除时，只有指向被删除节点的引用失效。

### 真实成本

节点之间通常不连续：

```text
根节点 → 跳到另一个地址 → 再跳到下一级
```

查找会产生指针追逐、分支判断和 Cache Miss；每个元素还承担多个指针与独立分配成本。因此，`O(log n)` 不等于硬件上的固定低延迟。

## 二、`unordered_map`：哈希与 Bucket

```cpp
std::unordered_map<std::string, TextureHandle> textures;
```

插入键时通常先计算哈希，再映射到 Bucket：

```cpp
std::size_t hash = std::hash<Key>{}(key);
std::size_t bucketIndex = hash % bucketCount;
```

概念结构：

```text
Bucket 0 → 空
Bucket 1 → [player_17]
Bucket 2 → [texture_grass] → [texture_sky]
Bucket 3 → 空
Bucket 4 → [entity_42]
```

## 三、哈希与相等关系

哈希函数把键转换成整数：

```text
"grass.png" → 748291...
"sky.png"   → 193874...
```

它应满足：

```text
如果 keyA == keyB
那么 hash(keyA) == hash(keyB)
```

反过来不成立，不同键可以产生相同哈希。哈希值只用于缩小候选范围，最终仍要使用键相等比较确认真正匹配。

## 四、哈希冲突

假设只有 4 个 Bucket：

```text
hash("grass") % 4 = 2
hash("sky")   % 4 = 2
```

两个不同键进入同一个 Bucket：

```text
Bucket 2 → [grass] → [sky]
```

查找 `sky` 时需要：

1. 计算哈希；
2. 定位 Bucket 2；
3. 检查 Bucket 中的候选元素；
4. 通过相等比较找到真正的键。

哈希分布均匀时，每个 Bucket 只有少量候选元素，平均查找接近 `O(1)`。如果大量键集中到同一个 Bucket，查找可能退化为 `O(n)`。

## 五、Load Factor

负载因子定义为：

```text
load_factor = 元素数量 / Bucket 数量
```

例如：

```text
100 个元素 / 128 个 Bucket ≈ 0.78
```

负载因子高时内存更紧凑，但冲突通常更多；负载因子低时冲突通常更少，但 Bucket 数组占用更多内存。

```cpp
table.load_factor();
table.max_load_factor();
table.max_load_factor(0.7f);
```

元素增长导致负载超过阈值时，容器可能执行 rehash。

## 六、rehash 发生什么

Bucket 数量从 4 增加到 8 后，映射规则从 `hash % 4` 变为 `hash % 8`。所有元素都需要重新归入 Bucket：

```text
旧 Bucket：                   新 Bucket：
0 → A                        0 → A
1 → B → C                    1 → B
2 → D                        2 → 空
3 → 空                       3 → D
                              4 → 空
                              5 → C
                              6 → 空
                              7 → 空
```

rehash 通常需要：

1. 分配新的 Bucket 数组；
2. 遍历所有元素；
3. 重新定位每个元素；
4. 连接到新的 Bucket；
5. 释放旧 Bucket 数组。

这是一次 `O(n)` 操作，可能造成明显的帧时间和峰值内存尖峰。

## 七、提前 `reserve`

如果能估计元素数量：

```cpp
std::unordered_map<std::string, TextureHandle> textures;
textures.reserve(expectedTextureCount);
```

`reserve(n)` 根据预计元素数和最大负载因子准备足够 Bucket。也可以直接指定 Bucket 数：

```cpp
textures.rehash(bucketCount);
```

业务代码通常更适合 `reserve`，因为它表达预计元素数量，而不是依赖 Bucket 实现细节。

## 八、标准 `unordered_map` 的失效规则

### 插入未触发 rehash

已有迭代器、引用和指针保持有效。

### 插入触发 rehash

所有迭代器失效，但未被删除元素的引用和指针通常保持有效。节点仍然存在，只是被重新连接到新 Bucket。

### 删除元素

只有指向被删除元素的迭代器、引用和指针失效。

### 主动 rehash

所有迭代器失效，遍历顺序可能改变。

```cpp
auto iterator = textures.find("grass");
TextureHandle* pointer = &iterator->second;

textures.reserve(10000); // 可能 rehash

// iterator 不可继续使用
// pointer 在元素未删除时通常仍有效
```

这些规则针对标准节点式 `unordered_map`。第三方 flat hash map 的 rehash 往往移动元素，使引用和指针也失效，必须查看具体容器文档。

## 九、`operator[]` 会隐式插入

```cpp
std::unordered_map<std::string, int> scores;
int score = scores["Alice"];
```

如果键不存在，`operator[]` 会插入：

```text
"Alice" → 0
```

所以只读查询不要无意中使用 `operator[]`：

```cpp
auto iterator = scores.find("Alice");
if (iterator != scores.end()) {
    int score = iterator->second;
}
```

C++20 可以用：

```cpp
if (scores.contains("Alice")) {
}
```

如果键必须存在，可以使用 `at()`；不存在时会抛出 `std::out_of_range`。

## 十、插入接口

| 接口 | 行为 |
|---|---|
| `insert` | 插入键值对，键已存在时不覆盖 |
| `emplace` | 使用参数构造键值对 |
| `try_emplace` | 键不存在时才构造 value |
| `insert_or_assign` | 不存在则插入，存在则覆盖 |
| `operator[]` | 不存在则默认构造 value |

需要注意，函数实参会在进入函数前求值：

```cpp
textures.try_emplace(textureId, loadTexture(path));
```

即使键已存在，`loadTexture(path)` 也可能已经执行。想延迟昂贵构造，应先查询，或传递构造 Texture 所需的轻量参数，让 value 在容器内部构造。

## 十一、自定义键和哈希

```cpp
struct AssetKey {
    std::uint64_t pathHash;
    std::uint32_t variant;
};

struct AssetKeyHash {
    std::size_t operator()(const AssetKey& key) const noexcept
    {
        std::size_t seed = std::hash<std::uint64_t>{}(key.pathHash);
        seed ^= std::hash<std::uint32_t>{}(key.variant)
              + 0x9e3779b9
              + (seed << 6)
              + (seed >> 2);
        return seed;
    }
};

struct AssetKeyEqual {
    bool operator()(const AssetKey& a, const AssetKey& b) const noexcept
    {
        return a.pathHash == b.pathHash &&
               a.variant == b.variant;
    }
};
```

必须保证 Equal 认为相等的两个键产生相同哈希，否则查找逻辑会被破坏。

## 十二、为什么 `unordered_map` 不一定更快

平均 `O(1)` 查找仍包含：

- 计算哈希；
- 定位 Bucket；
- 处理冲突；
- 键比较；
- 节点或槽位访问；
- rehash 长尾成本。

`map` 虽然是 `O(log n)`，但提供有序遍历、范围查询、稳定最坏复杂度和节点稳定性。

构建一次、读取很多的小型数据集，还可以使用排序 `vector`：

```text
[(key1, value1), (key2, value2), ...]
```

二分查找为 `O(log n)`，连续存储却具有更好的缓存局部性。插入是 `O(n)`，但如果构建结束后基本不再修改，整体可能优于节点式容器。

## 十三、Flat Hash Map

许多引擎使用开放寻址或 flat hash map：

```text
Bucket Array
[A][空][B][C][空][D]
```

元素直接或近似直接存放在 Bucket 数组中，减少独立节点分配和指针追逐，通常有更好的缓存局部性。

代价是：

- rehash 时元素可能被移动；
- 指针和引用稳定性更弱；
- 删除与探测规则更复杂；
- 增长时仍需控制峰值内存。

地址稳定性、缓存局部性和插入成本通常无法同时达到最优。

## 十四、字符串键的隐藏成本

高频查询如果不断创建临时字符串，可能产生分配、复制和重复哈希：

```cpp
textures.find(std::string(path));
```

引擎中常见流程是：

```text
字符串资源路径
    ↓ 加载或导入阶段
稳定 Asset ID
    ↓ 运行时
Handle / 整数索引
```

也可以使用预计算哈希、字符串驻留或透明查找。但哈希值不天然等于唯一身份；如果不保留原键，必须有明确的碰撞处理策略。

## 十五、并发安全

标准关联容器不会自动支持一个线程修改、另一个线程同时查询：

```text
线程 A：insert / erase / rehash
线程 B：find
```

没有同步会产生数据竞争。尤其 rehash 会改变整个 Bucket 结构，而不只影响新插入元素。

常见策略包括：

- 互斥锁保护容器；
- 读写锁服务读多写少结构；
- 分片哈希降低锁竞争；
- 构建新快照后原子切换；
- 把写入集中在单线程或安全阶段；
- 使用专门的并发容器。

## 十六、选择方法

| 需求 | 可以优先考虑 |
|---|---|
| 有序遍历和范围查询 | `map` |
| 高频精确查找，不要求顺序 | `unordered_map` |
| 构建后不变、读取很多 | 排序 `vector`、flat map |
| 需要稳定节点地址 | 节点式 `map` 或 `unordered_map` |
| 大规模运行时热路径 | Asset ID、Handle、专用 flat hash |

容器选择应结合真实键类型、数据规模、读写比例、地址稳定性和最坏延迟进行测量。

---

## 本章结论

1. `map` 通常基于平衡树，键有序，操作稳定在 `O(log n)`。
2. `unordered_map` 通过哈希定位 Bucket，平均查找接近 `O(1)`。
3. 哈希冲突无法完全避免，相等比较仍然必要。
4. 负载因子过高会增加冲突，并可能触发 `O(n)` rehash。
5. 实时系统应通过 `reserve` 控制 rehash 时机。
6. 标准 `unordered_map` rehash 使迭代器失效，但通常不使未删除元素的引用和指针失效。
7. `operator[]` 在键不存在时会隐式插入。
8. `unordered_map` 不一定总比 `map` 或排序 `vector` 快。
9. 引擎热路径通常将字符串键转换为 Asset ID 或 Handle。

[← 上一章：vector、list 与迭代器失效](./containers-vector-list.md) · [下一章：栈、堆与虚拟内存 →](./memory-stack-heap-virtual.md)
