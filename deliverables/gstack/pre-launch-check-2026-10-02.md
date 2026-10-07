# 上线前检查 — ASJ Portal（asj-astro）

**日期**：2026-10-02
**场景**：上线前检查（代码审查 + 安全审计 + QA 测试与发布就绪）
**参与成员**：产品评审员（code review）+ 安全卫士（OWASP+STRIDE）+ 质量门神（QA + release readiness）
**审查对象**：`F:/astro` · `main` @ `0e83e7c`（领先 `origin/main` = `5c6f93b` **18 个 commit，从未 push**）+ 工作区 6 个未提交文件

---

## 📌 TL;DR（执行摘要）

- **整体结论：🔴 No-Go（今天无法上线）** — 但原因不是代码质量差，而是三个具体、可解的工程事实。
- **阻塞项数量：2 个 🔴 + 1 个 🟠 条件项**
- **决定性事实：`main` 的每次 push 自 2026-09-24 起全部被 Netlify 跳过（账户额度耗尽）** — 今天 push 不会发布任何东西。这不是代码问题，是账单问题。
- **本批次唯一"自己造成"的缺陷**：`verify:fetch-boundary` 红，由本批次 commit `2982cf1` 新增的裸 `fetch()` 触发，CI（`ci.yml:110` / `:372`）会失败。
- **代码本身是好的**：`tsc` 主仓 + indexer 各 **0 error**，`lint-ratchet` PASSED（debt −21），`review:gate --base=HEAD` **7/7 PASS**，工作区套件 `3 failed | 178 passed (181)`（3 红全部为环境伪影，已手工证明）。
- **下一步**：修 `fetch-boundary`（或按白名单惯例加条目）→ 把 6 个未提交文件并入批次 → 但**先恢复 Netlify 额度**，否则 push 只是空转。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| Go / No-Go | 🔴 **No-Go**（今天不可发布） |
| 严重度分布 | 🔴 2 / 🟠 7 / 🟡 6 |
| 关键行动项 | 5 条 |
| 建议负责人 | 业主（账单 + 风险接受）+ team-lead（`fetch-boundary` + 提交 6 文件） |
| 上线可否由工程师独立完成 | ❌ 否 — 卡在 Netlify 账单，非技术问题 |

---

## 1. 各成员核心结论

### 🔍 产品评审员（代码审查）
- **核心判断**：🟡 **有条件放行**。18 个 commit 本身是扎实的，且自己的门禁通过。但**这批 commit 不能单独发布**——6 个未提交的工作区文件对仓库的 indexer 门禁是**承重的**。
- **关键建议**：把 6 个文件并入批次再 push。若只推 commit，被部署的 revision 在它自带的 indexer 套件上就是红的。产品评审员明确指出这是与 `profileProgress.ts` R11 事故**同一类**，但这次在 push 前就被抓住。
- 已实测：`tsc` 双配置 0 error；类型收窄声明属实；两处诊断诚实性修复经检验**不会**变成静默通过（仍会 FAIL）；50 个新 i18n key 在 `i18n.ts` 与 `i18n-jp.ts` **双语齐备**；无新增 `status_kandidat`/`LULUS` 写入；XLSX 以 `inlineStr` + XML 转义写入（无公式注入）。

### 🛡️ 安全卫士（OWASP + STRIDE 审计）
- **核心判断**：🟡 **有条件放行**。**未发现认证绕过、未发现 SQL/PostgREST 注入、未发现任何已提交的密钥**（含完整 git 历史扫描）。两条 PII 暴露路径是其唯一想卡上线的项。
- **关键建议**：两条 PII 路径实为**代码中已明文记录的设计取舍**，非本批次引入（详见 §2 与 §4）。真正的可执行缺口是**限流**：`rateLimitChecks()`（`_lib/handlers.ts:101-131`）对未枚举的 action 返回 `[]`，公开读写端点没有 IP 桶。这是能同时钝化枚举问题的控制点。
- 已实测：HMAC-SHA256 会话 + `timingSafeEqual` + 强制 `exp` + bcrypt；登录限流与锁定；幂等键作用域 `identity|action|key`；`isAllowedDocumentUrl` 主机白名单守住了所有服务端 fetch；AI 输出经转义（`boldHtml` 先转义、`sanitizeAiHtml` 剥标签），密钥仅在服务端。

### ✅ 质量门神（QA + 发布就绪）
- **核心判断**：🔴 **No-Go**。理由：每次 push 都被跳过（额度耗尽），push 不发布任何东西；且被推送的已提交树（HEAD `0e83e7c`）带 **4 个真实测试失败 + 一个红的 `verify:fetch-boundary`**。
- **关键建议**：区分"两棵树、两个答案"。工作区 = `3 failed | 178 passed (181)`（196.57 s）；**提交态 HEAD = `4 failed | 176 passed | 1 skipped` 文件、`7 failed | 2119 passed | 16 skipped` 测试**（138.67 s）。其中 4 个是**真实**红（陈旧计数器 + 生产文件），3 个是环境伪影。
- 已实测：13 道门禁逐条带退出码；`verify:rls` / `verify:schema` 因 `.env.local` 占位符配置错误（环境，非批次）；最后一个成功部署 = **2026-09-24T10:41:38Z @ `742e9561b`**，落后 HEAD **181 个 commit**；7 次连续 `state:error, skipped:true`。

---

## 2. 综合审查发现（去重合并，按严重度排序）

> 说明：安全卫士报告的两条 PII 项经 team-lead 独立复核后**下调严重度**——它们是代码中已明文记录的**既有设计取舍**，且本批次未触碰相关文件（`git log origin/main..HEAD` 对 `share-data.js` / `catalog/service.ts` / `documents/service.ts` / `handlers.ts` 返回**空**）。详见 §4。

| # | 严重度 | 类别 | 位置 | 问题描述 | 建议 | 来源成员 |
|---|--------|------|------|---------|------|---------|
| 1 | 🔴 | 发布 | Netlify site `be40978f…` | 自 2026-09-24 起 **7 次连续部署全部 `skipped`**，原因 `account credit usage exceeded`。最后成功部署 `742e9561b`，落后 HEAD **181 commit**。push 不发布任何东西。 | 恢复额度；**不要**用 `netlify deploy --prod --dir=dist` 绕过（`.env.local` 是占位符 Supabase URL，会把生产站指向假后端） | 质量门神 |
| 2 | 🔴 | 门禁 | `src/lib/cv-template-factory/renderers/rirekisho-xlsx.ts:273` | 裸 `fetch()` 未在白名单。由本批次 `2982cf1` 引入。`verify:fetch-boundary` exit 1。CI `ci.yml:110` 与 `:372` 都会跑它 ⇒ 流水线必红。 | 目标为**外部图片 URL**（非 Netlify function），正是白名单注释里已列的 `UploadBerkas`→Cloudinary 同一形状。按门禁自身教义加白名单条目（`max: 1` + 理由） | 质量门神 |
| 3 | 🟠 | 条件 | `indexer/src/build.test.ts` / `discover.test.ts` / `bind.ts` / `rirekisho-xlsx.ts` | **提交态 HEAD 自带 4 个真实红**：`fileCount` 529 vs 535、Phase-4 envelope 23923 > 23900、`prodGenuine` 3 处 `global-unknown`（`createImageBitmap`×2、`BlobPart`）、`count('ts')` 287 vs 293。修复全在**未提交**的 6 个文件里。 | 把 6 个文件并入批次再 push | 产品评审员 + 质量门神（独立测得一致） |
| 4 | 🟠 | 隐私 | `contexts/documents/service.ts:572-586` + 白名单 `:43-61` | 匿名 POST `getExistingCandidateJsonByWa`，凭猜测的印尼手机号返回 `nama/wa/gender/usia/tb/bb/pendidikan/tempatLahir/tglLahir/status`。**无认证、无限流**。 | **既有设计取舍**（见 §4）。可执行修法 = 给该 action 加 IP 限流桶；或要求 `verifyToken` | 安全卫士 |
| 5 | 🟠 | 隐私 | `share-data.js:27-47` + `contexts/catalog/service.ts:146-271` | 匿名 `GET ?job=<code>` 返回该 job 全部申请人 PII + 文档 URL，`Access-Control-Allow-Origin: *`。job code 短且可枚举。 | **既有设计取舍**，token 门于 `5909398` 主动撤除（见 §4）。业主需明示接受或重新加 token | 安全卫士 |
| 6 | 🟠 | 隐私 | `_lib/storage.ts:36-38` | 存储桶为 public，护照/CV 可凭 URL 直读。与 #5 叠加即真实暴露面。 | 私有桶 + 签名下载 URL | 安全卫士 |
| 7 | 🟠 | 配置 | `src/lib/cloudinary.ts:7-8` | 未签名 Cloudinary preset（`asjportal`）硬编码在客户端，任何人可向组织 CDN 上传任意文件（成本、恶意托管）。 | 改签名上传或限制 preset；在 Cloudinary 面板核实 | 安全卫士 |
| 8 | 🟠 | 可用性 | `documents/service.ts:367`、`registration/service.ts:42` | `submitApply` / `submitDaftarSiswa` 公开且**无限流**（`rateLimitChecks()` 返回 `[]`），匿名刷库。 | 加 IP 桶 | 安全卫士 |
| 9 | 🟠 | 门禁盲区 | `scripts/ci/review-gate.mjs` | `review:gate` **不含** `verify:fetch-boundary`，所以 `--base=HEAD` 报 7/7 PASS 的同时该门禁是红的。**绿灯不等于 CI 会过。** | 把 `fetch-boundary` 纳入 review-gate，或明确记录它需单独跑 | team-lead（复核 #2 时发现） |
| 10 | 🟡 | 信息泄露 | `contexts/identity/service.ts:262`、`:336` | 直接把 `e.message` 回给客户端，泄露 PostgREST 报文与表名；仓库其余位置均用 `safeError`。 | 改用 `safeError` | 安全卫士 |
| 11 | 🟡 | 配置 | `netlify.toml` | 未设置任何安全响应头（无 CSP / `X-Frame-Options` / `Referrer-Policy`）。 | 补响应头 | 安全卫士 |
| 12 | 🟡 | 密码学 | `metrics-receiver.ts:303`、`identity/service.ts:56` | 非恒定时间比较（`got !== 'Bearer '+expected`；master PIN 用 `pins.includes(pin)`）。风险低（有限流）。 | `timingSafeEqual` | 安全卫士 |
| 13 | 🟡 | 性能 | `AdminAiCopilot.tsx:~150` | 把**整个** `messages` 数组当 `history` 发送（原为 `.slice(-20)`）。服务端有 `lastHistory` 兜底，正确性无碍，但载荷随会话增长。 | 恢复客户端截断 | 产品评审员 |
| 14 | 🟡 | i18n | `RirekishoBuilder.tsx` | 硬编码字面量 `Ver.2025`（非 `t()` key）。可能是刻意的表单版本号。 | 确认是有意选择即可 | 产品评审员 |
| 15 | 🟡 | 潜伏缺陷 | `_lib/db/candidates.ts findCandidates()` | 仍对约 14 个非 AI 调用方返回 `[]`（`e6baf19` 关闭的静默 stub 同类）。非本批次引入，已记录。 | 排期修复 | 产品评审员 |
| 16 | 🟡 | 配置 | `astro.config.mjs:45` / `server.cjs:29` / `serve.cjs:10` | 三处代理目标一致指向 `boisterous-taiyaki-c61202.netlify.app`，但该主机**不是**绑定站点的别名（`domain_aliases: []`）。本地开发代理到外部站点。 | 仅影响本地开发，非部署阻塞 | 质量门神 |

---

## 3. ✅ 行动清单

| # | 行动 | 负责方 | 紧急度 | 期望完成 |
|---|------|--------|--------|---------|
| 1 | **恢复 Netlify 账户额度**（或确认改用他法发布）。在此之前任何 push 都是空转，且 liveness check 无法察觉（冻结主机仍回 200）。 | 业主 | **P0** | 发布前 |
| 2 | 修 `verify:fetch-boundary`：在 `scripts/ci/fetch-boundary.mjs` 的 `ALLOWED` 中为 `src/lib/cv-template-factory/renderers/rirekisho-xlsx.ts` 加 `max: 1` 条目并写明理由（目标为外部图片 URL，非 function，与既有 `UploadBerkas`→Cloudinary 条目同形状）。**不要**放宽正则。 | team-lead | **P0** | 发布前 |
| 3 | 把 6 个未提交文件（`indexer/src/bind.ts`、`indexer/src/{boundary,build,discover}.test.ts`、`netlify/functions/_lib/fcm-server.test.ts`、`src/lib/cv-template-factory/renderers/rirekisho-xlsx.ts`）并入批次后**一并**提交。只推 commit 会发布一棵红树。 | team-lead | **P0** | 发布前 |
| 4 | 给公开读写 action（`getExistingCandidateJsonByWa`、`submitApply`、`submitDaftarSiswa`）加 IP 限流桶 —— 这是同时钝化 WA 枚举与刷库的**单一控制点**。 | 业主决策 → 实现 | P1 | 发布后首批 |
| 5 | 对两条既有 PII 取舍（`share-data` 公开、匿名 prefill）做**明示风险接受**并落纸，或重新加 token / 私有桶 + 签名 URL。 | 业主 | P1 | 发布后首批 |

---

## 4. ⚠️ 待完善 / 已知局限

**a. 两条"阻塞"级安全发现经复核后下调——它们是既有的、有意的设计取舍。**
team-lead 直接读码复核：
- `contexts/catalog/service.ts:140-145` 带**明文取舍说明**：只返回挂在该 job 下的候选人；`dokumen_share` 由管理员逐 job 设置；并直言 *"the files themselves live on a public bucket, so a leaked document URL was never protected by this gate anyway."* token 门于 `5909398 fix(share): restore the public share viewer — retire the token gate` **主动**撤除。
- `contexts/documents/service.ts:40-42` 显示白名单**已被刻意裁剪**（移除文档 URL、email、地址、TTL —— *"yang bisa dipakai enumerasi PII"*），匿名调用返回 `limited: true`。这是公开申请表单依赖的 prefill 契约。
- `git log origin/main..HEAD` 对这四处文件返回**空** ⇒ 本批次未触碰。因此它们是**业主的发布风险决策**，不是本批次引入的阻塞。

**b. 发布死局同时降低了安全发现的紧迫性，也否定了"上线"本身。**
额度耗尽 ⇒ 本批次任何改动**今天都不在线**。两条 PII 路径不是"今天新可达"，而是"额度恢复那天起可达"。

**c. 未覆盖。**
- `verify:batteries`（120 min）、`verify:db`、`bundle:size`、`cold:start`、`idx:gate`、Playwright e2e、真实生产部署与冒烟。
- `npm audit` / 依赖 CVE 未评估（安全卫士明确标注 "not assessed"）。
- RLS 迁移 007/012/014 **是否已应用到生产库**未验证（`verify:rls` 因占位符环境变量配置错误无法运行）。
- Cloudinary preset 是否已签名、Netlify 环境变量（`SESSION_SECRET` / `HEALTH_TOKEN` / `METRICS_RECEIVER_TOKEN`）是否设置，均未实测。
- 工作区未跑 build（遵守删除配额顺序规则）。
- 遗留陈旧 worktree `F:/tmp/astro-r11` @`5371c0b`（非本次产生）。

**d. 环境伪影（非缺陷，勿修）。**
本机无法从 vitest worker 派生进程（`spawnSync … EBUSY`），导致 `boundary.test.ts`（depcruise oracle）、`fcm-server.test.ts`（`.gitignore`）、`discover.test.ts`（`git ls-files`）三红。三者均已**在 vitest 之外手工跑通**（depcruise exit 0 / `git check-ignore` real=0、example=1、README=1），CI 中为绿。**但第 4 个红是真红。**

---

## 5. 🔄 回滚预案

| 路径 | 可用性 | 说明 |
|------|--------|------|
| Netlify 部署级 "restore previous deploy" | ✅ 当前唯一可行 | **不触发构建**，故不受额度耗尽影响 |
| 脚本化回滚（`scripts/ci/netlify-rollback.mjs` + `.github/workflows/rollback.yml`） | ✅ 存在 | 业主可执行 |
| `git revert` + push | ❌ 当前不可行 | push 同样被 `skipped`，额度恢复前无效 |

**结论**：由于线上版本落后 HEAD **181 个 commit**，且部署通道已死，回滚在今天**无从谈起**——没有"上一个新版本"可回退。恢复额度后，`git revert` + push 才重新成为有效路径（注意：每次 push 都消耗一次部署）。

---

## 📚 成员产出索引

- **产品评审员（code review）** 原始产出：以 `review` skill 7 个子审查员为骨架，覆盖 `origin/main..HEAD` 18 commit + 工作区 6 文件；实测 `tsc`×2、针对性 vitest（43 / 69 / 42 / 36 例）、i18n 双语 50 key、R11 存在性检查、`review:gate --base=HEAD` 7/7、`lint-ratchet` PASSED。**结论：🟡 有条件放行。**
- **安全卫士（OWASP+STRIDE）** 原始产出：OWASP Top 10 (2021) 逐类结论 + STRIDE 五大信任边界；完整 git 历史密钥扫描（无发现）；A06 明示未评估。**结论：🟡 有条件放行。**
- **质量门神（QA + 发布）** 原始产出：13 道门禁逐条退出码；双树套件对比（工作区 196.57 s / HEAD worktree 138.67 s）；逐失败归因表；`netlify api listSiteDeploys` 实测部署史；worktree `F:/tmp/wt-qa` 已干净拆除（0 文件残留，junction 已 unlink，真实 `node_modules` 完好）。**结论：🔴 No-Go。**
- **team-lead 复核**：独立验证 `share-data.js`、`files.js`、`documents/service.ts:43-61,572-586`、`catalog/service.ts:140-145`、`handlers.ts:101-131`；独立复现 `verify:fetch-boundary` exit 1 并定位到 `2982cf1`；确认 CI 接线（`ci.yml:110`、`:372`）与 review-gate 盲区。

---

> 本报告由软件工坊 AI 协作生成，关键决策请由工程负责人复核。
> 3 位成员结论一致指向：**代码可放行，发布通道不可用**。
