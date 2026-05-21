# 実務テンプレ（そのまま使える）

社内ITで英語が必要になった時に、まず困るのが「何を書けばいいか」。
ここは **型** に寄せて、必要情報を漏らさず、短く書く。

完成例はシーン別の章を参照：

- [vendor-ticket.md](vendor-ticket.md) — チケット3例
- [meetings.md](meetings.md) — 定例3例
- [english-docs.md](english-docs.md) — 読解メモの型

---

## 送信前チェックリスト（5項目）

送信・投稿の直前に30秒だけ確認する。

- [ ] **時刻にタイムゾーン**がある（JST / UTC）。「昨日から」だけになっていない  
- [ ] **影響範囲**が書いてある（誰・何台・どの環境）。「一部のユーザー」だけで終わっていない  
- [ ] **未確定の原因**を断定していない（appears / suspect / investigating）  
- [ ] **依頼や次更新**に期限がある（by EOD / by Friday (JST) / next update by ~）  
- [ ] **社外秘・個人情報**を伏せている（[REDACTED]、ログは要約または数行）

よくある直訳ミス → [common-mistakes.md](common-mistakes.md)

---

## 1) サポートチケット（ベンダー/クラウド向け）

```
Subject: [Product] Intermittent login failure for some users

Summary
- Users cannot log in intermittently since (time).

Environment
- Tenant/Account: [REDACTED]
- Region: (e.g., ap-northeast-1)
- Client: (Browser/App) + version
- Network: (Corp VPN / Office / Home)

Steps to reproduce
1) ...
2) ...
3) ...

Expected
- ...

Actual
- ...
- Error message: "..."

Impact
- Affects ~ users / systems
- Business impact: (e.g., cannot process requests)

Troubleshooting tried
- Checked ...
- Tried ...
- Verified ...

Logs / Screenshots
- Attached / Available upon request

Questions
- Could you confirm whether ...?
- Do you have any known issues related to ...?
```

---

## 2) 障害連絡（社内向け・短文）

```
Subject: [Incident] Service degradation on [System] (Investigating)

Hi all,

We’re currently investigating an issue affecting [System/Service].

- Status: Investigating
- Impact: Some users may experience ...
- Start time: (time, timezone)
- Workaround: (if any)
- Next update: by (time)

We’ll provide an update as soon as we have more information.

Best regards,
[Name]
```

### 進捗更新（Update）

```
Subject: [Incident] Service degradation on [System] (Update)

Update:
- Findings: ...
- Actions taken: ...
- Current status: ...
- ETA: ... (if available)
- Next update: by ...
```

### 復旧連絡（Resolved）

```
Subject: [Incident] Service degradation on [System] (Resolved)

The issue has been resolved.

- Resolution time: ...
- Root cause (summary): ...
- Preventive action: ...

Thank you for your patience.
```

---

## 3) 変更連絡（メンテ/リリース）

```
Subject: [Change Notice] Maintenance for [System] on (date/time)

Hi all,

We will perform maintenance on [System].

- Date/Time: (start) to (end), (timezone)
- Expected impact: (no impact / brief downtime / intermittent)
- Scope: ...
- Rollback plan: ...

If you have any concerns, please let us know.

Best regards,
[Name]
```

---

## 4) 会議の超定型（3行で言う）

### 進捗

```
Quick update: We’re (on track / slightly behind).
Main blocker is ...
Next step is ... (ETA ...)
```

### 依頼

```
Could you please ... by ...?
This is needed for ...
Let me know if you need anything from our side.
```
