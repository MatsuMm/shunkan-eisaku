# シーン：海外ベンダーへのサポートチケット

テンプレ本体は [templates.md §1](templates.md#1-サポートチケットベンダークラウド向け)。ここでは **完成例** と **日本語メモからの組み立て** です。

---

## 完成例 1（ログイン障害・断続）

```
Subject: [Product] Intermittent login failure for some users

Summary
- Some users cannot log in intermittently since 2026-05-20 09:00 JST.

Environment
- Tenant/Account: [REDACTED]
- Region: ap-northeast-1
- Client: Chrome 136 / Windows 11
- Network: Corporate VPN

Steps to reproduce
1) Open the login page
2) Enter valid credentials
3) Click Sign in

Expected
- User is redirected to the dashboard

Actual
- Login fails with HTTP 500 intermittently (~30% of attempts)
- Error message: "Internal Server Error"

Impact
- Affects ~120 users in Tokyo office
- Users cannot access internal tools during failures

Troubleshooting tried
- Checked service health dashboard (no regional outage reported)
- Collected HAR files from 3 affected users
- Verified SSO metadata was not changed on our side

Logs / Screenshots
- Attached: sample HAR (3 users), app log excerpt
- Correlation IDs: abc-111, abc-222, abc-333

Questions
- Could you confirm whether there were any deployments around 09:00 JST?
- Do you have any known issues related to intermittent 500 errors on login?
```

---

## 完成例 2（API連携・レート制限）

```
Subject: [API] HTTP 429 rate limit on incremental sync job

Summary
- Our nightly incremental sync job started failing with HTTP 429 since 2026-05-19 02:15 UTC.

Environment
- API endpoint: [REDACTED]/v2/records
- Auth: OAuth 2.0 (client credentials)
- Job schedule: every 15 minutes, ~2,000 requests per run

Steps to reproduce
1) Run the sync job with cursor from checkpoint table
2) Job calls GET /v2/records?updated_since=...
3) After ~800 requests, responses return HTTP 429

Expected
- Job completes and updates cursor

Actual
- Job fails; response body: "rate limit exceeded"
- Retry after 60s still returns 429 for ~10 minutes

Impact
- Downstream CRM is out of sync (delay ~6 hours)
- No customer-facing outage, but sales reports are stale

Troubleshooting tried
- Reduced concurrency from 10 to 2 (no improvement)
- Added exponential backoff (1s, 2s, 4s, 8s) — still failing
- Verified token is valid (401 not observed)

Logs / Screenshots
- Attached: request timestamps, sample 429 response
- Request ID: req-9f2a...

Questions
- What is the recommended rate limit and retry policy for this endpoint?
- Is there a bulk/export API we should use instead of polling?
```

---

## 完成例 3（データ連携・スキーマ不一致）

```
Subject: [Integration] Schema validation error on field "deleted_at"

Summary
- Ingest job failed since 2026-05-18 18:00 UTC due to schema validation errors.

Environment
- Source: System A (webhook)
- Target: System B (idempotent upsert)
- Payload format: JSON

Steps to reproduce
1) Receive webhook event type "record.updated"
2) Transform payload per mapping v3
3) POST to System B /upsert

Expected
- Record is upserted successfully

Actual
- Job fails with: "Unknown field: deleted_at"
- ~15% of events in the last batch

Impact
- 3,400 records not synced; reconciliation needed

Troubleshooting tried
- Compared payload samples before/after 18:00 UTC
- Confirmed mapping v3 does not include deleted_at
- Rolled back transform to v2 (temporary workaround)

Logs / Screenshots
- Attached: 5 sample payloads, validation error log
- Available upon request: full batch ID

Questions
- Was deleted_at added in a recent schema change?
- Should we treat it as optional, or handle delete events separately?
- Do you have a changelog for API/schema updates?
```

---

## 日本語メモから英文化（型）

| 日本語メモ | 英語にするときの型 |
|-----------|-------------------|
| 昨日からたまに失敗 | since **(date/time JST or UTC)** / **intermittently** |
| 再現できた | We **can reproduce** the issue **on our side**. |
| 再現できない | We **can't reproduce** it on our side. |
| ログ添付 | **Attached:** ... / **Available upon request** |
| 急ぎではないが優先度高 | This is a **high priority** for us. |
| こちらでは設定変更していない | We **verified** ~ was **not changed on our side**. |

間違えやすい表現 → [common-mistakes.md](common-mistakes.md)

---

## このシーンの練習ルーティン（週2回）

1. 日本語で5行メモ（時刻・影響・再現・試したこと・質問）  
2. [templates.md](templates.md) に当てはめる  
3. [llm-workflow.md §1](llm-workflow.md#1-チケット文章を作る不足情報を質問させる) で下書き  
4. [送信前チェックリスト](templates.md#送信前チェックリスト5項目) で確認してから送信  

必修フレーズ（phrasebook）: §2 確認、§4 切り分け、§11 連携
