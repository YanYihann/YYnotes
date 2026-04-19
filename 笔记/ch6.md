# Chapter 6: Synchronization Tools（第6章：同步工具）

[TOC]

## 1. Title Page（标题页）

**Operating System Concepts – 10th Edition**
**Chapter 6: Synchronization Tools（第6章：同步工具）**
Silberschatz, Galvin and Gagne ©2018

> 说明：本章主要讲并发执行时为什么会出现数据不一致，以及操作系统如何通过临界区、Peterson 算法、Memory Barrier、Mutex、Semaphore、Monitor 与 Liveness 相关机制来解决同步问题。
> 参考文件：

------

## 2. Outline（章节提纲）

- Background（背景）
- The Critical-Section Problem（临界区问题）
- Peterson’s Solution（Peterson 解决方案）
- Memory Barrier（内存屏障）
- Mutex Locks（互斥锁）
- Semaphores（信号量）
- Monitors（管程）
- Liveness（活性）

> 说明：本章的逻辑顺序是：先说明为什么会出错，再定义临界区问题，然后介绍几种典型同步方法，最后讨论“虽然加了同步工具，但程序仍可能一直等下去”的活性问题。

------

## 3. Objectives（学习目标）

- Describe the critical-section problem and illustrate a race condition
  描述临界区问题，并说明什么是竞争条件（race condition）
- Illustrate solutions to the critical-section problem
  展示临界区问题的解决方案
- Demonstrate how mutex locks, semaphores, monitors, and condition variables can be used to solve the critical section problem
  说明如何使用 mutex locks、semaphores、monitors 和 condition variables 来解决临界区问题

> 说明：学完这一章，核心不是只会背定义，而是要能判断：什么时候会发生 race condition、为什么某段代码属于 critical section、不同同步工具各自适合什么场景。

------

## 4. Background（背景）

### 4.1 Concurrent or parallel execution（并发或并行执行）

- Processes can execute concurrently or parallel
  进程可以并发执行，也可以并行执行。
- May be interrupted at any time, partially completing execution
  它们可能在任意时刻被中断，只完成部分执行。
- Concurrent access to shared data may result in data inconsistency
  对共享数据的并发访问可能导致数据不一致。
- Maintaining data consistency requires mechanisms to ensure the orderly execution of cooperating processes
  要保持数据一致性，就需要某种机制来保证协作进程按有序方式执行。

> 说明：只要多个执行流会“同时碰同一份数据”，就有可能出问题。关键点不在于速度快慢，而在于执行顺序是否失控。

### 4.2 Race Condition（竞争条件）

- We illustrated Bounded Buffer problem with use of a counter that is updated concurrently by the producer and consumer,. Which lead to race condition.
  我们曾在有界缓冲区问题中使用一个由 producer 和 consumer 并发更新的 counter，这会导致竞争条件。
- A race condition occurs when multiple processes access and manipulate shared data concurrently, and the final result depends on the order of execution.
  当多个进程并发访问并操作共享数据，且最终结果依赖于执行顺序时，就会发生竞争条件。
- This can lead to inconsistent or incorrect outcomes.
  这会导致不一致或错误的结果。

> 说明：race condition 的本质是：程序结果“不只取决于代码写了什么”，还取决于“谁先执行、谁后执行”。这正是并发程序难调试的根源。

### 4.3 Example: shared bank account（共享银行账户示例）

- Imagine you and your friend share a single bank account with $100. You both go to two different ATMs at the exact same time.
  假设你和朋友共享一个余额为 100 美元的账户，你们同时在两台不同的 ATM 上操作。
- You withdraw $50.
  你取走 50 美元。
- Your friend withdraws $50.
  你的朋友也取走 50 美元。
- ATM 1 reads the balance: $100.
  ATM 1 读取到余额 100。
- ATM 2 reads the balance: $100.
  ATM 2 也读取到余额 100。
- ATM 1 subtracts $50, writes new balance: $50.
  ATM 1 减去 50，写回余额 50。
- ATM 2 subtracts $50, writes new balance: $50.
  ATM 2 也减去 50，写回余额 50。
- Result: You both got $50, but the account shows $50 instead of $0.
  结果是你们都取到了 50，但账户显示的余额却是 50，而不是 0。
- This is a race condition.
  这就是竞争条件。

> 说明：这个例子特别经典。问题不是“减法错了”，而是两次操作都基于旧值 100 来计算，导致一次更新覆盖了另一次更新。

------

## 5. The Critical-Section Problem（临界区问题）

### 5.1 Critical Section（临界区）

- A critical section is a segment of code where a process accesses shared resources (e.g., global variables, files, or data structure).
  临界区是进程访问共享资源（如全局变量、文件或数据结构）的一段代码。
- Only one process should execute in its critical section at any given time to prevent race conditions.
  为防止竞争条件，在任意时刻只应有一个进程执行其临界区。
- If multiple processes execute their critical sections simultaneously, race conditions occur, leading to:
  如果多个进程同时执行各自的临界区，就会发生竞争条件，并导致：
  - Data inconsistency
    数据不一致
  - Corrupted shared variables
    共享变量被破坏或被错误覆盖
  - Unexpected program behavior
    程序出现不可预期的行为

> 说明：凡是“读共享数据 + 改共享数据 + 写回共享数据”的这类代码，几乎都要优先怀疑它是不是临界区。

### 5.2 Diagram logic of critical section（临界区图示逻辑）

- Without Critical Section (BAD):
  没有临界区保护（错误）：
  - Process A: [READ] → [SUBTRACT] → [WRITE]
    进程 A：读取 → 减法 → 写回
  - Process B: [READ] → [SUBTRACT] → [WRITE]
    进程 B：读取 → 减法 → 写回
  - Result: balance = 50 (WRONG! Should be 0)
    结果：余额为 50（错误，本应为 0）
- With Critical Section (GOOD):
  有临界区保护（正确）：
  - Process A: [----CRITICAL SECTION----]
    进程 A：先完整执行临界区
  - Process B: [WAIT] … [----CRITICAL SECTION----]
    进程 B：先等待，再进入临界区
  - Result: balance = 0 (CORRECT!)
    结果：余额为 0（正确）

> 说明：图里表达的是最核心的一条原则：**同一时刻只能有一个执行流进入临界区**。另一个执行流必须等待。

### 5.3 Code example（代码示例）

- Without critical section protection - RACE CONDITION
   没有临界区保护——会发生竞争条件

```
int balance = 1000;

void withdraw(int amount) {
    if (balance >= amount) {
        // Context switch could occur here!
        balance = balance - amount; // Critical Section
    }
}
```

- With proper protection
   使用正确保护的版本

```
pthread_mutex_t lock;

void withdraw_safe(int amount) {
    pthread_mutex_lock(&lock);
    if (balance >= amount) {
        balance = balance - amount;
    }
    pthread_mutex_unlock(&lock);
}
```

> 说明：这里的 `balance = balance - amount;` 就是典型的临界区代码，因为它会修改共享变量。若不加锁，多个线程可能同时读取旧值并写回，造成 race condition。

### 5.4 Formal statement of the problem（问题的正式表述）

- The critical section problem arises when multiple processes or threads need to access shared resources concurrently.
  当多个进程或线程需要并发访问共享资源时，就会产生临界区问题。
- It deals with ensuring that when one process is executing in its critical section, no other process is allowed to execute in its critical section simultaneously.
  它关注的是：当一个进程正在执行临界区时，其他进程不允许同时执行它们的临界区。

### 5.5 General structure of process Pi（进程 Pi 的一般结构）

- entry section
  进入区
- critical section
  临界区
- exit section
  退出区
- remainder section
  剩余区

> 说明：进入区负责“申请进入”，退出区负责“离开并释放权限”，剩余区则是不访问共享资源的普通代码。

### 5.6 Requirements for a Solution（解决方案必须满足的条件）

- **Mutual Exclusion** - If one process is executing in its critical section, no other process can be executing in their critical sections.
  **互斥**：如果一个进程正在执行临界区，其他进程不能同时执行它们的临界区。
- **Progress** - If no process is executing in its critical section and some processes want to enter, only those processes not executing in their remainder sections can participate in deciding which will enter next. This decision cannot be postponed indefinitely.
  **前进**：如果当前没有进程在临界区，而某些进程想进入，那么应由真正参与竞争的进程决定谁下一个进入，而且这个决定不能无限期拖延。
- **Bounded Waiting** - There must be a bound on the number of times other processes are allowed to enter their critical sections after a process has made a request to enter its critical section and before that request is granted. This prevents starvation.
  **有限等待**：一个进程提出进入请求后，在它真正进入之前，其他进程被允许先进入的次数必须有上限，这样可以避免饥饿。

> 说明：考试里最常考的就是这三个条件。
>
> - Mutual Exclusion：不许同时进
> - Progress：不能一直拖着不让进
> - Bounded Waiting：不能永远轮不到我

------

## 6. Peterson’s Solution（Peterson 解决方案）

### 6.1 Basic idea（基本思想）

- Software-based solution
  基于软件的解决方案。

- Two process solution
  只适用于两个进程。

- Assume that the load and store machine-language instructions are atomic; that is, cannot be interrupted
  假设机器级的 load/store 指令是原子的，即不能被中断。

- The two processes share two variables:
  两个进程共享两个变量：

  - ```C
    int turn;
    boolean flag[2];
    ```

    > 说明：`turn` 表示轮到谁进入临界区，`flag` 表示某个进程是否已经准备好进入临界区。

- The variable turn indicates whose turn it is to enter the critical section
  变量 `turn` 表示轮到谁进入临界区。

- The flag array is used to indicate if a process is ready to enter the critical section.
  数组 `flag` 用来表示某个进程是否准备进入临界区。

- `flag[i] = true` implies that process Pi is ready!
  `flag[i] = true` 表示进程 `Pi` 已准备好进入。

### 6.2 Algorithm for Process Pi（进程 Pi 的算法）

```c
do {
    flag[i] = true;      // Pi wants to enter
    turn = j;            // Give turn to Pj
    while (flag[j] && turn == j)
        ;                // Wait if Pj also wants to enter

    // Critical Section

    flag[i] = false;     // Pi leaves critical section

    // Remainder Section
} while (true);
```

> 说明：`Pi` 先声明“我想进入”（`flag[i] = true`），再把 `turn` 让给对方。若对方也想进且当前轮到对方，自己就等待。

### 6.3 Meaning of turn and flag（turn 和 flag 的含义）

- if `turn == i`, then process `Pi` is allowed to execute in its critical section.
  如果 `turn == i`，那么进程 `Pi` 被允许进入临界区。
- if `flag[i]` is true, `Pi` is ready to enter its critical section.
  如果 `flag[i]` 为 true，表示 `Pi` 已准备进入临界区。
- To enter the critical section, process `Pi` first sets `flag[i]` to be true and then sets `turn` to the value `j`.
  为进入临界区，进程 `Pi` 先把 `flag[i]` 设为 true，再把 `turn` 设为 `j`。

> 说明：这个设计很巧妙：
> `flag` 表示“我想进”，`turn` 表示“如果我们都想进，那就先让你进”。

### 6.4 Correctness（正确性）

- **Mutual exclusion is preserved**
  **互斥性得到保证**
- The Progress requirement is satisfied
  满足前进要求。
- The bounded-waiting requirement is met.
  满足有限等待要求。

### 6.5 Limitation on modern architectures（在现代体系结构上的局限）

- Although useful for demonstrating an algorithm, Peterson’s Solution is not guaranteed to work on modern architectures.
  虽然 Peterson 算法很适合用来说明同步思想，但在现代体系结构上并不保证一定正确。
- Peterson’s solution is restricted to two processes that alternate execution between their critical sections and remainder sections.
  Peterson 算法也只适用于两个在临界区和剩余区之间交替执行的进程。

> 说明：所以 Peterson 算法更像“教学用经典算法”，而不是现代系统中最常直接使用的工业方案。

------

## 7. Memory Barrier（内存屏障）

### 7.1 Why Peterson may fail（为什么 Peterson 可能失效）

- Two threads share the data:
   两个线程共享如下数据：

```c
boolean flag = false;
int x = 0;
```

- Thread 1 performs
   线程 1 执行：

```c
while (!flag)
    ;      // Busy wait

print x;
```

- Thread 2 performs
   线程 2 执行：

```c
x = 100;
flag = true;
```

> 说明：按直觉看，Thread 1 最后应该输出 100；但在现代体系结构中，由于指令可能重排序，实际结果可能不是这样。

### 7.2 Instruction reordering（指令重排序）

- However, since the variables `flag` and `x` are independent of each other, the instructions may be reordered.
  但是，因为 `flag` 和 `x` 彼此独立，这两条指令可能被重排序。
- If this occurs, the output may be 0!
  如果发生重排序，输出可能是 0！
- Signaling before updating the data.
  也就是“先发信号，再更新数据”。
- This allows both processes to be in their critical section at the same time!
  这甚至可能导致两个进程同时处于临界区！
- To ensure that Peterson’s solution will work correctly on modern computer architecture we must use **Memory Barrier**.
  为了让 Peterson 算法在现代计算机体系结构上正确工作，我们必须使用 **Memory Barrier**。

> 说明：现代 CPU 和编译器为了优化性能，可能改变指令实际执行顺序。程序员看到的先后顺序，不一定就是硬件执行的先后顺序。

### 7.3 Definition of memory model and barrier（内存模型与屏障定义）

- Memory model are the memory guarantees a computer architecture makes to application programs.
  内存模型是计算机体系结构对应用程序提供的内存可见性保证。
- Memory models may be either:
  内存模型可能有两类：
  - Strongly ordered
    强顺序：一个处理器对内存的修改会立刻对其他处理器可见
  - Weakly ordered
    弱顺序：一个处理器对内存的修改不一定立刻对其他处理器可见
- A memory barrier is an instruction that forces any change in memory to be propagated (made visible) to all other processors.
  内存屏障是一条指令，它强制内存中的修改被传播出去，并对其他处理器可见。

### 7.4 What barrier guarantees（内存屏障保证什么）

- When a memory barrier instruction is performed, the system ensures that all loads and stores are completed before any subsequent load or store operations are performed.
  当执行内存屏障指令时，系统会确保所有先前的 load/store 都完成之后，后续的 load/store 才能执行。
- Therefore, even if instructions were reordered, the memory barrier ensures that the store operations are completed in memory and visible to other processors before future load or store operations are performed.
  因此，即使发生过指令重排序，内存屏障仍能保证前面的写操作先真正完成并对其他处理器可见，再执行后续操作。

### 7.5 Example with barrier（带屏障的示例）

- If we add a memory barrier operation to Thread 1
   如果给线程 1 加上 memory barrier：

```c
while (!flag)
    memory_barrier();
print x;
```

- If we place a memory barrier between the assignments performed by Thread 2
   如果在线程 2 的赋值之间加入 memory barrier：

```c
x = 100;
memory_barrier();
flag = true;
```

> 说明：这样可以保证 `x = 100` 的写入先完成并对其他处理器可见，然后才执行 `flag = true`，避免“先发信号、后更新数据”的问题。



> 说明：一句话记忆：**Memory Barrier 用来阻止关键内存操作被乱序观察到。**

------

## 8. Mutex Locks（互斥锁）

### 8.1 Basic idea（基本思想）

- Hardware-based solutions are complicated and generally inaccessible to application programmers
  基于硬件的解决方案比较复杂，应用程序员通常无法直接使用。
- OS designers build software tools to solve critical section problem
  因此操作系统设计者提供软件工具来解决临界区问题。
- Simplest is mutex lock (mutual exclusion)
  最简单的就是 mutex lock（互斥锁）。
- Boolean variable indicating if lock is available or not
  它通常可看作一个布尔状态，表示锁是否可用。
- Protect a critical section by:
  保护临界区的方法是：
  - First `acquire()` a lock
    先 `acquire()` 获取锁
  - Then `release()` the lock
    再 `release()` 释放锁
- Calls to `acquire()` and `release()` must be atomic
  `acquire()` 和 `release()` 的调用必须是原子的。

### 8.2 General structure（一般结构）

- `acquire lock`
  获取锁
- `critical section`
  进入临界区
- `release lock`
  释放锁
- `remainder section`
  执行剩余区代码

### 8.3 acquire and release（获取与释放）

- The definition of `acquire()` is as follows:
   `acquire()` 的定义如下：

```c
acquire() {
    while (!available)
        ;   /* busy wait */
    available = false;
}
```

- The definition of `release()` is as follows:
   `release()` 的定义如下：

```c
release() {
    available = true;
}
```

> 说明：这里的实现很直观，但缺点是会 busy waiting，也就是线程一直空转等待锁可用。

### 8.4 Busy waiting and spin lock（忙等待与自旋锁）

- The main disadvantage of the implementation given here is that it requires busy waiting.
  这种实现的主要缺点是需要忙等待。
- While a process is in its critical section, any other process that tries to enter its critical section must loop continuously in the call to `acquire()`
  当一个进程在临界区中时，其他想进入的进程只能在 `acquire()` 中不断循环。
- Busy waiting also wastes CPU cycles that some other process might be able to use productively.
  忙等待会浪费 CPU 周期，而这些周期本可以给其他进程使用。
- This type of lock is also called a spin-lock because the process “spins” while waiting for the lock to become available
  这种锁也叫 **spin-lock**，因为进程会一直“原地打转”等待锁变得可用。

> 说明：mutex 的概念不难，但它的实现方式很关键。这里这版实现简单清楚，但代价是会空转 CPU。

------

## 9. Semaphores（信号量）

### 9.1 Definition（定义）

- More sophisticated than Mutex locks
  比 mutex lock 更复杂、更灵活。
- A semaphore `S` is an integer variable that, apart from initialization, is accessed only through two standard atomic operations:
  信号量 `S` 是一个整数变量，除初始化外，只能通过两个标准原子操作访问：
  - `wait()`
    `wait()`
  - `signal()`
    `signal()`
- Originally called `P()` and `V()`
  它们最初分别叫 `P()` 和 `V()`。

### 9.2 wait and signal（wait 与 signal）

- Definition of the `wait()` operation
   `wait()` 操作定义如下：

```
wait(S) {
    while (S <= 0)
        ;   // busy wait
    S--;
}
```

- Definition of the `signal()` operation
   `signal()` 操作定义如下：

```
signal(S) {
    S++;
}
```

> 说明：`wait(S)` 表示申请一个资源单位；若当前没有可用资源，就先等待。`signal(S)` 表示归还一个资源单位。

- All modifications to the integer value of the semaphore in the `wait()` and `signal()` operations must be executed atomically.
  在 `wait()` 和 `signal()` 中，对信号量整数值的所有修改都必须原子执行。

### 9.3 Types of semaphores（信号量的类型）

- Counting semaphore – integer value can range over an unrestricted domain
  计数信号量：整数值可以在较大范围内变化。
- Binary semaphore – integer value can range only between 0 and 1
  二进制信号量：整数值只能在 0 和 1 之间变化。
- Same as a mutex lock
  二进制信号量的作用类似互斥锁。

### 9.4 Usage example（使用示例）

- Suppose we require that `S2` be executed only after `S1` has completed.
  假设我们要求 `S2` 必须在 `S1` 完成之后才能执行。

- `P1 and P2 share a common semaphore synch, initialized to 0.`
  `P1` 和 `P2` 共享一个初始化为 0 的信号量 `synch`。

  - In process `P1`, we insert the statements
     在进程 `P1` 中加入如下语句：

  ```c
  P1:
      S1;
      signal(synch);
  ```

  - In process `P2`, we insert the statements
     在进程 `P2` 中加入如下语句：

  ```c
  P2:
      wait(synch);
      S2;
  ```

  > 说明：因为 `synch` 初值为 0，所以 `P2` 必须先等 `P1` 执行完 `S1` 并调用 `signal(synch)`，之后才能执行 `S2`。

- Because `synch` is initialized to 0, `P2` will execute `S2` only after `P1` has invoked `signal(synch)`
  因为 `synch` 初始为 0，所以 `P2` 只有在 `P1` 执行了 `signal(synch)` 之后才能执行 `S2`。

> 说明：信号量不只是“锁”，还可以做“顺序控制”。这是它比 mutex 更强大的地方。

------

## 10. Monitors（管程）

### 10.1 Why monitors are needed（为什么需要管程）

- Semaphores provide a convenient and effective mechanism for process synchronization, using them incorrectly can result in timing errors that are difficult to detect
  信号量虽然有效，但如果使用不当，会导致难以发现的时序错误。
- Timing errors - if you forget `wait()` or `signal()`, or do them in wrong order, race conditions occur
  时序错误指的是：如果忘记写 `wait()` / `signal()`，或者顺序写错，就会产生竞争条件。

> 说明：Semaphore 很强，但也很容易写错。Monitor 的出现，就是为了把同步控制做得更高级、更安全。

### 10.2 Definition of monitor（管程定义）

- A monitor is a programming language construct
  管程是一种编程语言级别的结构。
- Encapsulation - shared data is private to the monitor
  **Encapsulation**：共享数据对管程外部是私有的。
- Mutual exclusion - only one thread can be active in the monitor at a time
  **Mutual exclusion**：同一时刻只有一个线程可以在管程内活动。
- Condition variables - for threads to wait for certain conditions
  **Condition variables**：用于让线程等待特定条件成立。

### 10.3 Monitor as ADT（管程作为抽象数据类型）

- A high-level abstraction that provides a convenient and effective mechanism for process synchronization
  管程是一种高级抽象，为进程同步提供方便且有效的机制。
- An abstract data type—or ADT—encapsulates data with a set of functions to operate on that data
  ADT（把数据和操作这些数据的函数封装在一起。
- A monitor type is an ADT that includes a set of programmer-defined operations that are provided with mutual exclusion within the monitor.
  管程类型就是一种 ADT，它包含一组程序员定义的操作，并且这些操作在管程内部天然具有互斥性。

### 10.4 SynStax of a monitor type（管程语法）

```C
monitor monitor-name
{
    // shared variable declarations
    procedure P1 (…) { …. }
    procedure P2 (…) { …. }
    procedure Pn (…) { …… }

    initialization code (…) { … }
}
```

> 说明：monitor 把共享数据、操作过程和初始化代码封装在一起，并自动保证同一时刻只有一个进程能在 monitor 内部执行。

- shared variable declarations
  共享变量声明
- procedure `P1`, `P2`, ..., `Pn`
  若干过程定义
- initialization code
  初始化代码
- Ensures that only one process at a time is active within the monitor.
  保证同一时刻只有一个进程在管程内部活动。

### 10.5 Key benefit（关键优点）

- The monitor construct ensures that only one process at a time is active within the monitor.
  管程结构保证同一时刻只有一个进程在管程中活动。
- Consequently, the programmer does not need to code this synchronization constraint explicitly
  因此，程序员不需要显式地自己去写这个同步约束。

> 说明：这句话非常重要，建议直接背：
> **Monitor 把互斥控制“内建”进语言结构里了。**

### 10.6 Condition Variables（条件变量）

- Automatic mutual exclusion is not enough
  自动互斥还不够。

- Sometimes you need a thread to wait for something before proceeding.
  有时线程还必须等待某个条件成立后才能继续。

- Example: Producer-Consumer
  例如生产者—消费者问题：

  - Consumer cannot take item if buffer is empty
    缓冲区空时，消费者不能取数据
  - Producer cannot add item if buffer is full
    缓冲区满时，生产者不能放数据

- Condition variables give you waiting ability inside the monitor.
  条件变量为管程内部提供了“等待”的能力。

  - Condition variables give you waiting ability inside the monitor.
     条件变量使线程可以在管程内部等待某个条件成立。

  ```c
  condition x, y;
  ```

  - Two operations are allowed on a condition variable:
     条件变量上允许两个基本操作：

  ```c
  x.wait();
  x.signal();
  ```

  > 说明：`x.wait()` 会让当前进程挂起，直到另一个进程执行 `x.signal()`。`x.signal()` 只唤醒一个等待在该条件变量上的进程；若没有等待者，则不产生效果。

- If no process is suspended, then the `signal()` operation has no effect
  如果没有进程在等待，那么 `signal()` 不产生任何效果。

> 说明：互斥解决的是“不能同时进”，条件变量解决的是“现在还不能做，要先等”。

------

## 11. Liveness（活性）

### 11.1 Basic idea（基本概念）

- Using synchronization tools coordinate access to critical section
  同步工具用于协调对临界区的访问。
- Possibility that a process attempting to enter its critical section will wait indefinitely.
  但是，一个试图进入临界区的进程可能会无限期等待。
- Waiting indefinitely violates the progress and bounded-waiting criteria
  无限等待违反了 progress 和 bounded waiting 的要求。
- Liveness refers to a set of properties that a system must satisfy to ensure processes make progress.
  活性指一组系统必须满足的性质，以保证进程能够持续向前推进。
- Indefinite waiting is an example of a liveness failure.
  无限等待就是一种活性失败。

> 说明：前面讲的是“别同时进”，这里讲的是“别永远进不去”。这两个问题不一样。

### 11.2 Deadlock（死锁）

- **Deadlock** – two or more processes are waiting indefinitely for an event that can be caused by only one of the waiting processes
  **死锁**：两个或多个进程无限期等待某个事件，而这个事件只能由这些正在等待的进程之一来触发。

- Let `S` and `Q` be two semaphores initialized to `1`
   设 `S` 和 `Q` 是两个初始化为 `1` 的信号量。

  ```C
  P0:
      wait(S);
      wait(Q);
      ...
      signal(S);
      signal(Q);
  P1:
      wait(Q);
      wait(S);
      ...
      signal(Q);
      signal(S);
  ```

  > 说明：如果 `P0` 先拿到 `S`，`P1` 先拿到 `Q`，接下来双方都会等待对方释放资源，从而形成死锁。

- Let `S` and `Q` be two semaphores initialized to 1
  设 `S` 和 `Q` 是两个初始化为 1 的信号量。

- Consider if `P0` executes `wait(S)` and `P1` `wait(Q)`.
  假设 `P0` 先执行 `wait(S)`，`P1` 先执行 `wait(Q)`。

- When `P0` executes `wait(Q)`, it must wait until `P1` executes `signal(Q)`.
  当 `P0` 再执行 `wait(Q)` 时，它必须等待 `P1` 执行 `signal(Q)`。

- However, `P1` is waiting until `P0` execute `signal(S)`
  但是 `P1` 又在等待 `P0` 执行 `signal(S)`。

- Since these `signal()` operations will never be executed, `P0` and `P1` are deadlocked
  由于这些 `signal()` 永远不会发生，`P0` 和 `P1` 就死锁了。

> 说明：死锁可以理解成“你等我，我等你，谁都动不了”。

### 11.3 Priority Inversion（优先级反转）

- A scheduling challenge arises when a higher-priority process needs to read or modify kernel data that are currently being accessed by a lower-priority process
  当高优先级进程需要访问正被低优先级进程占用的内核数据时，会出现调度问题。
- Since kernel data are typically protected with a lock, the higher-priority process will have to wait for a lower-priority one to finish with the resource.
  因为这些内核数据通常受锁保护，所以高优先级进程不得不等待低优先级进程释放资源。
- The situation becomes more complicated if the lower-priority process is preempted in favor of another process with a higher priority.
  如果低优先级进程又被另一个中优先级或更高优先级进程抢占，情况会更复杂。
- This liveness problem is known as **priority inversion**
  这种活性问题称为 **优先级反转**。
- Typically avoided by implementing a **priority-inheritance protocol**
  通常通过实现 **优先级继承协议** 来避免。

### 11.4 Example of priority inversion（优先级反转示例）

- Assume we have three processes—`L`, `M`, and `H`—whose priorities follow the order `L < M < H`.
  假设有三个进程 `L`、`M`、`H`，优先级满足 `L < M < H`。
- Assume that process `H` requires a semaphore `S`, which is currently being accessed by process `L`.
  假设高优先级进程 `H` 需要信号量 `S`，但此时 `S` 正被低优先级进程 `L` 使用。
- Ordinarily, process `H` would wait for `L` to finish using resource `S`.
  正常情况下，`H` 只需等待 `L` 用完资源 `S`。
- However, now suppose that process `M` becomes runnable, thereby preempting process `L`.
  但是如果此时中优先级进程 `M` 变成可运行态，它就可能抢占 `L`。
- Indirectly, a process with a lower priority—process `M`—has affected how long process `H` must wait for `L`.
  这样一来，优先级比 `H` 低的 `M` 间接影响了 `H` 的等待时间。

### 11.5 Priority inheritance（优先级继承）

- All processes that are accessing resources needed by a higher-priority process inherit the higher priority until they are finished with the resources in question.
  所有占用着高优先级进程所需资源的进程，都会暂时继承那个更高的优先级，直到它们释放相关资源。
- When they are finished, their priorities revert to their original values.
  当资源释放后，它们的优先级再恢复为原来的值。

> 说明：优先级继承的目的就是让“挡路的低优先级进程”先把事做完、先把锁放掉，别被中间别人一直打断。

------

## 12. End of Chapter（本章小结）

- **Race condition** 的根源是多个执行流无序访问共享数据。
- **Critical section** 是访问共享资源的关键代码段。
- 合格的临界区解法必须满足：**Mutual Exclusion / Progress / Bounded Waiting**。
- **Peterson’s Solution** 是经典软件解法，但在现代体系结构下会受到指令重排序影响。
- **Memory Barrier** 用于保证关键内存操作的可见性与顺序。
- **Mutex Locks** 简单直接，但可能带来 busy waiting / spin-lock 问题。
- **Semaphores** 不仅能做互斥，还能做同步顺序控制。
- **Monitors + Condition Variables** 提供更高级、更安全的同步抽象。
- **Liveness** 关注的是系统是否能持续推进，典型问题包括 **Deadlock** 和 **Priority Inversion**。

> 说明：复习时建议按这条主线背诵：
> race condition → critical section → 三个要求 → Peterson → memory barrier → mutex → semaphore → monitor → liveness。
> 这样不容易把各个概念割裂开来。

