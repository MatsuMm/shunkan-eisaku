# よくある間違い（社内IT文脈）

日本語の感覚のまま英語にすると、**丁寧すぎる・強すぎる・意味がずれる**ことが多いです。

---

## 対比表（使うべき／避ける）

| ❌ 避けがち | ✅ 実務で無難 | 理由 |
|------------|--------------|------|
| Please check it quickly. | Could you please check this **by EOD (JST)**? | quickly は急かす印象。期限で伝える |
| We are checking now. | We're **looking into it** / **investigating** now. | checking だけだと軽く聞こえる |
| The cause is ~. | The issue **appears to be related to** ~. / We **suspect** ~. | 未確定の断定を避ける |
| It was fixed. | The issue **has been resolved**. | 障害連絡の定型 |
| I will do my best. | We'll **do our best**, but **no promises yet**. | 単独の best より期待値が明確 |
| Can you? (だけ) | **Could you please** ~? | 依頼は could の方が丁寧で標準的 |
| Inform you that ~ | **FYI**, ~ / **Please see** the details below. | inform that は硬く古い |
| According to my investigation... | We **checked the logs** and found ~. | 長い前置きより事実 |
| data sync problem | The systems appear to be **out of sync** | 名詞の組み合わせが自然 |
| please wait a little more | We might need **more time to investigate** | 曖昧な待ち依頼より状況説明 |
| ASAP (だけ) | **by EOD** / **by Friday (JST)** | ASAP は解釈が人によって違う |
| apologize for inconvenience (毎回長文) | Thank you for your patience.（復旧時） | 障害メールは短く要点優先 |

---

## 混同しやすい語

| 語 | 社内ITでの使い分け |
|----|-------------------|
| **affect** (動) / **effect** (名) | This **affects** 50 users. / The **effect** is limited to staging. |
| **investigate** / **research** | 障害・ログ → **investigate**。調査研究 → research |
| **issue** / **problem** | チケット・障害文脈では **issue** の方がよく使われる |
| **fix** / **resolve** | 顧客向けには **resolve** の方が無難（fix は口語的） |
| **config** / **configuration** | 口頭・チャットは config、正式メールは configuration 寄り |
| **error** / **failure** | API は **HTTP 5xx** / job **failed** / validation **error** |
| **since** / **for** | since 10:00 JST（開始時刻）/ for 2 hours（継続時間） |

---

## 日本語→英語の直訳ミス

| 日本語の意図 | ❌ 直訳 | ✅ 例 |
|-------------|--------|------|
| 確認お願いします | Please confirm it.（だけ） | **Just to confirm**, the outage started at **10:00 JST**, correct? |
| 原因調査中です | We are cause investigating. | We're **currently investigating** the issue. |
| 影響は限定的です | Impact is limited.（だけ） | The impact is **limited to** the staging environment. |
| 再現しました | We reproduced. | We **can reproduce** the issue **on our side**. |
| 仕様通りです | It is specification. | This is **expected behavior** / **working as designed**. |
| 対応します | I correspond. | **I'll take this action item.** / We'll **look into it**. |
| 至急 | urgent urgent | This is a **high priority** for us. / Please **by EOD (JST)**. |
| 連携がずれています | cooperation is wrong | The systems appear to be **out of sync**. |

---

## LLM添削時に自分で見る3点

1. **時刻にタイムゾーン**（JST / UTC）が付いているか  
2. **未確定の原因**を断定していないか（appears / suspect）  
3. **依頼に期限**があるか（EOD / 曜日）

詳細プロンプトは [llm-workflow.md](llm-workflow.md)。
