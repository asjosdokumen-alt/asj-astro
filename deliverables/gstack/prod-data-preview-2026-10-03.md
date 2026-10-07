# Preview lokal ber-data produksi — blast radius + rencana uji manual

**Tanggal**：2026-10-03
**场景**：上线前检查（环境安全评估 + 手工测试计划）——preview lokal yang terhubung ke database produksi
**参与成员**：安全卫士（OWASP/STRIDE + blast radius） + 质量门神（QA + 测试计划）
**Permintaan owner**：*"preview lokal dengan data asli saya mau test semua manual"*

---

## 📌 TL;DR（执行摘要）

- **整体结论：🟡 有条件通过** — 安全卫士最初判 🔴「先别开始」，我随后**已把防护落地**并复测通过；现在可以安全地开始**只读**测试。
- **阻塞项数量：0**（原 3 项防护已应用）
- **最重要的发现（两位成员独立确认）：停止本地服务器不是隔离边界。** `kirimTawaranMassal` 写入**生产** `job_queue`，而**已部署站点的 cron**（`sweep-queue` 每 2 分钟）会继续排空同一个队列 —— 即使你的本地实例早已关闭，真实 WhatsApp 仍会发出。
- **无 staging。** 四个部署上下文（production / deploy-preview / branch-deploy / dev）全部指向**同一个** Supabase 项目 `bimqyugdhiuxcqltjjnt`。
- **只读测试现在可用**，已实测：`/loker` 渲染 10 个真实 lowongan 与计数器 **"10 / 158 lowongan"**，`200 get-app-data`，零 page error —— 在防护生效后依然如此。
- **下一步**：按 §5 的四阶段顺序测试，从 Fase 0–1（匿名只读）开始。
- ⚠️ **修订（2026-10-03，成员间核验后）**：Mail 的三个状态操作 **全部** 列入"绝不点击" —— `reviewForm`/`approveForm`/`rejectForm` 共用 `handleFormStatus`，会向真人手机发不可撤回的 FCM 推送；且 `rejectForm` 还会清空 `id_loker_pilihan` 且不留旧值。§5.3 已更新。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| Go / No-Go | 🟡 **条件 Go** — 只读可立即开始；写操作需逐条对照 §5 的破坏性清单 |
| 严重度分布 | 🔴 4 / 🟠 5 / 🟡 3 |
| 关键行动项 | 5 条 |
| 建议负责人 | owner（决定是否移动 FCM 密钥文件 + 更换 PIN）+ team-lead（已完成防护落地） |

---

## 1. 各成员核心结论

### 🛡️ 安全卫士（blast radius）
- **核心判断**：🔴 **先别开始**。本地实例**不会**启动定时器（好消息），但每一次写入都落在唯一的生产库上，若干操作不可逆，且 `job_queue` 与已部署站点**共享**。
- **关键建议**：先落 3 项防护 —— 清空 `FONNTE_TOKEN`、把 AI 供应商密钥置为无效值、把 `netlify/functions/secrets/firebase-service-account.json` 移开（因为 `fcm-server.ts` **优先读文件**，清空 env var 挡不住推送）。
- **它明确否定的一个幻想**：**不存在只读模式**。`grep` 全库找不到任何 `READ_ONLY`/`DRY_RUN` 开关。唯一真正的隔离是把 `SUPABASE_URL` 指向非生产库 —— 而那会杀死"真实数据"这个目的本身。

### ✅ 质量门神（QA + 测试计划）
- **核心判断**：测试**顺序不是偏好问题**。写操作会改变读操作所断言的那些行（计数、状态、候选人数据），且没有 staging 可回滚。所以必须 **只读 → 候选人 → 管理员只读 → 管理员写**，绝不倒置。
- **关键建议**：把破坏性操作**单独隔离成一节**，让 owner 一眼看清哪些按钮要避开；并列出一份"看起来坏了但其实没坏"的清单，避免把正确行为"修"坏。
- **它独立复现了安全卫士的队列发现**，并补充：停止服务器**不是**遏制边界。

---

## 2. 综合发现（去重合并，按严重度排序）

| # | 严重度 | 类别 | 位置 | 问题 | 建议 | 来源 |
|---|--------|------|------|------|------|------|
| 1 | 🔴 | 共享队列 | `notify.ts:24` → `notifications/service.ts:192`；`sweep-queue.ts:152` (`*/2`) | `kirimTawaranMassal` 把 `wa.broadcast` 入队到**生产** `job_queue`。**已部署站点的 cron 会排空它** —— 本地关掉也挡不住真实 WhatsApp 发出 | 不要点击批量邀请（ListKandidat / Matchmaking / UndanganKelas）。**清空本地 token 挡不住这条路径**，因为发送发生在生产端 | 安全卫士 + 质量门神 |
| 2 | 🔴 | 不可逆删除 | `applications/service.ts:216,254`；`jobs/service.ts`（`hapusJobData`） | 硬删除，**无审计表、无审计触发器**（migrations 001–015），删除后无法从 UI 撤销，也无从知道是谁改了什么 | 绝不点击；如需演练，先确认 Supabase PITR 可用性（**未能只读验证，请视为不可用**） | 安全卫士 |
| 3 | 🔴 | 不可逆覆盖 | `docs/service.ts:158,761,588,902`；`storage.ts:143`（`hapusJenisVarian`） | 上传路径**先删除**已有的存储对象再覆盖 —— 旧文件永久消失 | 不要用真实候选人的资料测试上传 | 安全卫士 |
| 4 | 🔴 | 外部可见 + 不可逆 | `contexts/applications/service.ts:135-158`（`handleFormStatus`）、`:94-104`（`syncCandidateDariForm`） | **Mail 三个状态操作全部**（`reviewForm`/`approveForm`/`rejectForm`）向有 `fcm_tokens` 的候选人发**真实 FCM 推送**，推送不可撤回。`rejectForm` 还会把 `status_kandidat` 置 `GAGAL` 并**清空 `id_loker_pilihan`** —— 旧值无任何记录 ⇒ 实际不可逆 | 列入"绝不点击"；纯 DB 的 `ubahStatusJob`/`tandaiGagalJob` 才可测，且**先记录原值** | 安全卫士 + 质量门神（修正） |
| 5 | 🟠 | 计费 | `_lib/ai/providers.ts:348` (Gemini), `:413` (xAI)；`master-data/service.ts:366`（自动翻译） | AI copilot / 解析 / 自动翻译会真实消耗额度；`submitMasterForm` 在保存时**顺带调用 Gemini** | 已把密钥置无效 ⇒ `AI_UNAVAILABLE`，零消耗 | 安全卫士 |
| 6 | 🟠 | 全局配置 | `configuration/service.ts:17,59,76` | `updateSysConfig` 会改变**所有用户**看到的公告/下拉项 | 不要点击 | 安全卫士 |
| 7 | 🟠 | 候选人 PII | `registry/service.ts:19,117` | `updateCatatanKandidat` / `updateKandidatSuper` 直接改写候选人个人资料 | 不要点击 | 安全卫士 |
| 8 | 🟡 | 低风险写 | `registration/service.ts:42`；`contact/service.ts:77`；`identity/service.ts:201` | 公开表单写入 `siswa_baru` / `database_asj_kontak` / `database_candidate` | 会留下测试垃圾行；如需测试，记下你造了哪几行 | 安全卫士 |
| 9 | 🟡 | 认证锁定 | `handlers.ts:106` | 登录失败限流 5/分钟，连续 10 次锁定 5 分钟 | 不要用错误 PIN 反复试 | 安全卫士 |
| 10 | 🟡 | 凭据强度 | `identity/service.ts:39-52` | `ADMIN_MASTER_PIN` 长度 **6**，且 `masterPins()` 还接受 `PIN_KHOCI/SACHOU/AYOK/KHOLIS`，各**长度 4** ⇒ 主登录的有效强度约 **10⁴** | 更换 PIN；限流是唯一缓解 | 安全卫士 |

---

## 3. 🔴 最重要的一条：停止服务器 ≠ 隔离

这一条值得单独成节，因为它是反直觉的，而且是两位成员各自独立得到的结论。

```
点击「Undang Grup」
   → 本地 Functions 写一行 wa.broadcast 到 PRODUCTION job_queue
   → 你关闭本地服务器
   → 已部署站点的 sweep-queue (cron */2) 读同一张表
   → 真实 WhatsApp 发给了真实候选人
```

所以安全卫士的防护 #1（清空本地 `FONNTE_TOKEN`）**只能挡住"直接发送"的路径，挡不住"入队后由生产端发送"的路径**。唯一的防护是**不点击会入队的操作**。

**已验证的好消息**：`netlify dev` **不会**在本地运行定时函数。netlify-cli 17.38.1 只在 HTTP 请求路由到该函数时才调用它，CLI 内不存在 cron/timer（`grep` 无命中）。`sweep-queue.ts:152`（`*/2`）与 `agenda-reminders.ts:142`（`*/10`）只在真实部署上触发。**风险来自生产端，不是本地端。**

---

## 4. 已应用的防护（team-lead 执行，可一键还原）

| # | 防护 | 变量 / 操作 | 后果 | 状态 |
|---|------|-------------|------|------|
| 1 | 关闭 WhatsApp 发送 | `FONNTE_TOKEN` 置空 | `notifications/service.ts:41` 抛 401 ⇒ 单条/批量发送报错。**注意：挡不住队列路径** | ✅ 已应用 |
| 2 | 关闭 AI 消耗 | `GEMINI_API_KEY`、`XAI_API_KEY` 置为 `disabled` | `providers.ts:542/618` 抛 `AI_UNAVAILABLE` ⇒ 零消耗；chat/解析/自动翻译失败 | ✅ 已应用 |
| 3 | 关闭 FCM 推送 | 移开 `netlify/functions/secrets/firebase-service-account.json` | 清空 env var **无效** —— `fcm-server.ts` 优先读该文件 | ⬜ **建议由 owner 执行**（这是您的私钥文件） |
| 4 | 不点击 | 见 §5 破坏性清单 | — | ⬜ owner 纪律 |
| 5 | 事后核查 | 查 `job_queue`（按 `created_at desc`）、`database_asj_form` / `database_candidate` / `master_database_candidate` 的 `updated_at`、`database_asj_kontak`、`siswa_baru`、存储桶列表 | — | ⬜ 测试后执行 |

**还原成完整模式（当您想测 WhatsApp / AI 时）：**
```bash
cp F:/tmp/env-bak/.env.local.full /f/astro/.env.local
```

**备份位置**：`F:/tmp/env-bak/.env.local.bak`（原始占位符版）· `.env.local.full`（生产全量版）· `F:/tmp/env.json`（生产 env dump）。三者都在**仓库之外**。

**实测确认防护不伤只读**：应用防护后重跑同一探针 —— `/loker` 仍渲染 10 个真实 lowongan、计数器仍为 **"10 / 158 lowongan"**、`200 get-app-data`、零 page error。

---

## 5. 手工测试计划（质量门神）

### 5.1 四阶段（顺序不可倒置）

| 阶段 | 表面 | 角色 |
|---|---|---|
| **0 预检** | 栈启动；金丝雀 `/loker` | 无 |
| **1 匿名只读** | `/`, `/loker`, `/public`, `/404`, `/share?job=<真实代码>`, `/apply`, `/siswa-baru`, `/ai-cv`, `/master`；`/candidate` 与 `/admin`（**应重定向**） | 无 |
| **2 候选人** | `/candidate` + 其 6 个 modal；`/master` prefill；`/ai-cv` 闸门 | kandidat |
| **3 管理员只读** | 10 个 tab + 17 个 modal | admin |
| **4 管理员写** | 逐条对照破坏性清单，一次一个 | admin |

### 5.2 关键断言（失败如何区别于成功）

| 表面 | 期望 | 失败长什么样 |
|---|---|---|
| `/loker` | 计数器 **"10 / 158 lowongan"**（4 urgent / 148 closed） | 计数器 `0` 或 `/0` ⇒ `get-app-data` **静默失败**，页面看起来仍然正常 |
| `/candidate` 匿名 | **重定向到 `/`** | 仪表盘直接渲染 ⇒ P0 |
| `/admin` 匿名 | **重定向到 `/`** | 面板直接渲染 ⇒ P0 |
| 10 个 admin tab | 每个都有行/计数、无 console error | 空表 = 读取失败 |
| 17 个 admin modal | `role=dialog`、有名字、关闭按钮 44px | 无名 dialog / 关闭按钮点不动 |

**17 个 admin modal 的打开位置**：Pemberkasan（pelamar）· UndanganKelas（wa）· CandidateProfile（pelamar 行）· EditCandidate（pelamar）· Matchmaking（agenda/dbjob）· AdminJobEdit（kelola → Edit）· AdminShare（kelola → Share）· InputManual（pelamar）· LaporanBulanan（pelamar）· RincianBiaya（tambah → "Buka Editor Rincian"）· RejectMail（mail 红色按钮）· Rirekisho（pelamar 天蓝）· **ListKandidat（dbjob → 点计数单元格 `td.cursor-pointer`；就是那个总被漏掉的）** · CekSiswa（kelola 事件）· LoginModal（**预期缺席**，见 §6）· WAPintar（pelamar 翠绿）· DocumentPreview（嵌套在 Pemberkasan/CandidateProfile 里，点文档）。外加 **AdminAiCopilot**（侧栏 "AI HR"）—— 第 18 个浮层，不在探针的 17 个里。

### 5.3 破坏性操作（全部打到生产，除非有意为之请避开）

- **公开写**：`submitApply`（/apply 提交）· `submitDaftarSiswa`（/siswa-baru）· `kirimPesanKontak`（联系表单）· `daftarKandidat`（注册）· AI 发送类（花费 + 写入）
- **候选人**：`simpanUpdateMaster` · `simpanBerkasTahapan` / `simpanBiodataLengkap` · `simpanDataTtdNaitei` · `simpanHasilWawancara` / `processAiInterview` · `gantiPasswordKandidat` · `simpanRevisiKandidat` · `uploadBerkasToStorage`
- **管理员**：`simpanJobBaru` · `editLokerFull` · `updateKandidatSuper` · `simpanKandidatDanUpload` · `simpanJadwalBaru` · `saveRincianPreset`/`deleteRincianPreset` · `submitMasterForm`

#### 🚫 绝不点击（外部可见 / 不可撤销）—— 修订于 2026-10-03

质量门神在安全卫士核验代码后**修正了分类**：Mail 的三个状态操作**全部**都要算进来，不只 approve/reject。

| 操作 | 为什么不可点 |
|---|---|
| **`reviewForm` / `approveForm` / `rejectForm`** | 三者共用 `handleFormStatus`（`contexts/applications/service.ts:135-158`）：只要候选人有一行 `fcm_tokens`，就会发出**真实 FCM 推送**（reject 的标题是 `'Dokumen <code> perlu revisi'`）。**推送无法撤回。** |
| `rejectForm`（数据库侧，追加发现） | 它**不是**"只改状态"：`syncCandidateDariForm`（`service.ts:94-104`）还会把 `database_candidate.status_kandidat` 置为 `'GAGAL'` 并**清空 `id_loker_pilihan`**。**没有任何地方记录旧值 ⇒ 实际不可逆。** |
| `kirimTawaranMassal`（含 ListKandidat / Matchmaking / UndanganKelas） | 写入生产 `job_queue`，生产端 cron 会继续发送 |
| `kirimSatuPesanFonnte` | 真实 WA |
| `hapusJobData` · `hapusFormTerpilih` · `deleteForm` | 硬删除，无审计，不可撤销 |
| 覆盖已有文件的上传 | `hapusJenisVarian` **先删后写** ⇒ 重传失败即永久丢失原文件 |
| "Simpan Master" / CV-AI 类 | 调用 Gemini，真实花费（已被防护 #2 拦住） |
| `updateSysConfig` | 改变**所有用户**看到的公告 |

#### ✅ 已核验为纯数据库操作（可测，但见下方前置条件）

- **`ubahStatusJob`** —— `patchJob(code,{status})`；`contexts/jobs/` 中**零** `emit`/`fcm`/`fonnte`/`notify`/`fetch`。
- **`tandaiGagalJob`** —— 纯 DB，无推送。

> ⚠️ **所有剩余的可逆写操作的前置条件**：先**截图/记录原值**。系统**不记录任何旧值**，所以"可逆"只在测试者自己留了底的前提下成立。

**爆炸半径最大**：`kirimTawaranMassal` · `hapusJobData` · `hapusFormTerpilih` · `updateSysConfig` · **Mail 三个状态操作**。

### 5.4 通过规则

**出现任一情况即不可发布**：`/loker` 计数器 ≠ 158 或 = 0 · 任一读取路由 404/空白/console error · 匿名能进 `/admin` 或 `/candidate` · 应成功的写静默无效 · 应被阻止的写却成功 · 真实 PII 出现在错误表面。

**可以发布**：所有读取表面符合、鉴权边界守住、每个写都给出 toast **且**重新读取能反映它、且 §6 的"假故障"是唯一意外。

> 注意：此处的"可以发布"指**这套代码行为正确**。线上站点仍冻结在 **2026-09-24** 的构建，Netlify 额度未恢复前什么都不会真正上线。

---

## 6. 看起来坏了但其实没坏（不要"修"）

1. **3 个单元测试红** —— `spawnSync EBUSY`（boundary / fcm-server / discover）；在 CI 里是绿的。这台机器无法创建子进程。
2. **`/admin` 抽屉被停在画布外**（x=1280）—— 朴素探针会读成"横向溢出"，但它就是被设计成停在那里的。
3. **`RirekishoBuilder` 里 10px 的字** —— 那是**打印文档**，不是 11px 的界面下限（F24）。
4. **`RirekishoBuilder` 没有标题** —— 所有者决策（F22）；`e2e:headings` 要求恰好一个 `h1`。
5. **AdminShareModal 的 16×16 复选框 / MatchmakingModal 的 13×13 单选** —— 它们的 `<label>` 是 44px，真实目标够大（已用 `elementFromPoint` 证明）。
6. **`LoginModal` 在 `/admin` 打不开**（F23）—— `showHeader=false`，没有 SiteNav 去触发事件。**缺席是正确的**。
7. **"Kata Alumni" 网格为空** —— 刻意为之，不编造推荐语。
8. **第 7 个合作伙伴位置为空** —— 只在有具名时才渲染。
9. **浅色主题的 shim 缺口** —— 11 个已登记的非缺陷（5 个非文本面、5 个实测通过、1 个 disabled 豁免）；只有 3 个是真缺陷，已修。
10. **关掉 JS 时受限路由空白** —— `client:only`，页面会显示 `<noscript>`。
11. **EditCandidateModal / WAPintarModal 的 depth-4 表面**（F25）—— 所有者决策。
12. **`parseDocsShare` 对非字符串会产出垃圾** —— 不可达，契约就是字符串。
13. **候选人看到的是 `catatanExt`，不是 `catatan_admin`** —— 刻意的，防止管理员备注泄露。
14. **MasterFullForm 里的 `bg-amber-500/90`** —— 有意不 shim 的成对设计，实测通过。

---

## ✅ 行动清单

| # | 行动 | 负责方 | 紧急度 |
|---|------|--------|--------|
| 1 | 按 §5.1 顺序开始 **Fase 0–1（匿名只读）**，用 §5.2 的断言逐条核对 | owner | **P0** |
| 2 | 决定是否移开 `netlify/functions/secrets/firebase-service-account.json`（硬遏制推送）；不移也可，但那时 §5.3 的纪律是唯一防线 | owner | P1 |
| 3 | 更换 `ADMIN_MASTER_PIN`（长度 6，且 4 位 PIN 系列使其有效强度约 10⁴） | owner | P1 |
| 4 | 测试任何"可逆"写操作前，**先截图记录原值** —— 系统不记录任何旧值，"可逆"只在你留了底时成立 | owner | P1 |
| 5 | 测试结束后按 §4 防护 #5 核查是否留下了写入 | owner | P1 |
| 6 | 若确认 Supabase 有 PITR/备份，记录下来 —— 目前**未能只读验证，应视为没有** | owner | P2 |

---

## ⚠️ 待完善 / 已知局限

- **没有 staging 可用**：四个部署上下文同指一个 Supabase 项目，这是本次评估的前提，也是全部风险的来源。
- **不存在只读模式**：全库无 `READ_ONLY`/`DRY_RUN` 开关。真正的隔离只有换库，而那会消灭"真实数据"这个目的。
- **无审计轨迹**：migrations 001–015 里没有审计表、没有审计触发器（013 的触发器是写入守卫，不是日志）。**无法知道谁改了什么**。
- **不可逆清单**：硬删除（`deleteForm`、`hapusFormTerpilih`、`hapusJobData`）与存储覆盖（`hapusJenisVarian` 先删后写）**无法从 UI 撤销，且不留痕迹**。状态变更只有在你知道旧值时才可手工还原。
- **未覆盖**：生产 cron 当前是否真的在跑（未验证）；Supabase 备份/PITR；AI 输出正确性（需真实调用 + 花费）；生产 RLS/schema 复核；Netlify env 变量核对；Cloudinary 签名；响应式断点重测；hover/active/disabled 对比度；完整 batteries；build。
- 两位成员都**没有**启动服务器、没有调用 AI/Fonnte/FCM、没有执行任何写入 —— 全部证据来自读代码与只读 HTTP。

---

## 📚 成员产出索引

- **gstack-security-officer（安全卫士）**：写表面清单（含 `file:line`）、无本地定时器的证明（netlify-cli 17.38.1 源码）、队列共享风险、防护排序、恢复能力评估、`ADMIN_MASTER_PIN` 强度分析。
- **gstack-qa-lead（质量门神）**：四阶段测试计划、逐表面断言表、17+1 个 modal 的打开位置、破坏性操作隔离清单、14 条"假故障"、通过规则。使用 `qa` skill 的 issue 分类学。
- **team-lead**：环境搭建与实测（env 拉取、真实数据连通性证明、防护落地与复测）、两位成员结论的交叉确认、本报告汇编。

---

> 本报告由软件工坊 AI 协作生成，关键决策请由工程负责人复核。
> **最重要的一句话**：停止本地服务器**不是**隔离边界 —— 生产端的 cron 会继续排空你写入的队列。
