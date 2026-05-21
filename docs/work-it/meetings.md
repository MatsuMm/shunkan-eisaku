# シーン：海外拠点との定例（進捗・課題・依頼）

**3行で話す**ことを最優先。長い説明はチャットかメールに回す。

---

## 定例の型（5分スピーチ）

```
1) Quick update: ...
2) Main blocker: ...
3) Next step: ... (ETA ...)
4) Ask: Could you please ... by ...?
```

---

## 完成例 1（順調）

```
Quick update: We’re on track for the SSO migration.
We completed staging tests yesterday (JST).
Main blocker: none right now.
Next step: production change on Tuesday 3pm JST (ETA: 2 hours).
Could you please confirm the maintenance window on your side?
```

---

## 完成例 2（遅れ・調査中）

```
Quick update: We’re slightly behind schedule on the API integration.
We’re currently investigating intermittent HTTP 429 errors.
Main blocker: we need clarity on the recommended rate limit.
Next step: we’ll share sample logs by EOD (JST).
Could you clarify the retry policy for this endpoint?
```

---

## 完成例 3（依頼・担当のすり合わせ）

```
Quick update: data reconciliation is in progress.
Main blocker: ~3,400 records are out of sync since May 18 UTC.
Next step: we’ll share a mismatch report by Friday (JST).
I’ll take the action item to update the mapping on our side.
Could you take a look on your side and confirm whether deleted_at is new?
```

---

## よく使う短い返答

| 状況 | 英文 |
|------|------|
| 聞き取れなかった | Sorry, could you repeat the last part? |
| 確認したい | Just to confirm, you mean **~**, correct? |
| 後で答える | I’ll check and get back to you by **EOD (JST)**. |
| 担当を引き受ける | I’ll take this action item. |
| 会議を終える | Let’s sync again next week. I’ll post updates in the channel. |

---

## 日本語の頭の中 → 英語の順番

| ❌ いきなり詳細から | ✅ 定例の順 |
|--------------------|------------|
| ログを見たら429が… | Quick update → blocker → next step → ask |
| すみません遅れて… | We’re **slightly behind**. Main blocker is **~**. |
| 〜してもらえますか（長い理由付き） | **Could you please** ~ **by Friday**? |

---

## 練習（週2回）

1. 日本語で「進捗・ブロッカー・次・依頼」を各1行メモ  
2. 上の型に当てはめて **声に出す**（3分）  
3. [LLMロールプレイ](llm-workflow.md#3-会議ロールプレイミスを固定化させない)（10分）  
4. 出てきた **必修フレーズ5つ** を次回の定例まで使う  

必修フレーズ（phrasebook）: §7 会議、§6 期限、§8 難しい時（期待値調整）

初週は [getting-started.md](getting-started.md) の Day 6–7。
