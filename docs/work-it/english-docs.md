# シーン：英語ドキュメントを読んで設定する

読む → 要点を日本語メモ → 手順どおり実施、の流れ向けです。

---

## 読むときの5ステップ（15分）

1. **見出しと Warning/Note だけ**先に読む（全体像）  
2. **Prerequisites / Requirements** を抜き出す（足りないものを先に潰す）  
3. **手順番号**だけ英語のままメモ（Step 1, 2, 3…）  
4. わからない語は **最大5語**だけ調べる（多すぎると止まる）  
5. LLMに [読解プロンプト](llm-workflow.md#4-ドキュメント読解要点だけ抜く) で要約チェック  

---

## ドキュメントでよく出る見出し

| 英語 | 意味 | 先に読む？ |
|------|------|-----------|
| Prerequisites | 前提条件 | ✅ |
| Before you begin | 開始前の注意 | ✅ |
| Quick start | 最短手順 | ✅ |
| Configuration | 設定項目 | ✅ |
| Troubleshooting | うまくいかないとき | 失敗後 |
| Limitations | 制限・できないこと | ✅ |
| Deprecated | 非推奨（使わない） | ✅ |
| Breaking changes | 互換性が壊れる変更 | アップデート時 |

---

## 完成例：読んだあとに残すメモ（日本語）

原文は社外秘なので伏せ字。形式だけ真似する。

```
## Doc: [Product] SSO setup guide (section 3)

### 手順
1. Create an app registration in the admin console
2. Set redirect URI to https://[URL]/callback
3. Assign API permissions: read_users, read_groups
4. Upload certificate and enable SAML

### 前提
- Admin role required on tenant
- Changes may take up to 30 minutes to propagate

### 注意
- Do not use legacy endpoint (deprecated)
- Redirect URI must match exactly (trailing slash matters)

### 失敗しがち
- 403 after login → check redirect URI mismatch
- Groups not syncing → verify read_groups permission

### 用語
- tenant = テナント
- propagate = 設定反映に時間がかかる
- deprecated = 非推奨
```

---

## 英語のままメモする1段落（設定チームへの共有用）

```
FYI, I reviewed the SSO setup guide (section 3).

- Steps: app registration → redirect URI → API permissions → SAML cert
- Prerequisite: tenant admin role; propagation may take ~30 minutes
- Risk: legacy endpoint is deprecated; redirect URI must match exactly

Next step: we’ll test in staging on Friday (JST).
```

---

## わからないときに聞く英文（社内・ベンダー）

- Just to confirm, does the redirect URI need a **trailing slash**?  
- Could you clarify whether **read_groups** is required for group sync?  
- The doc mentions a **legacy endpoint**. Should we avoid it entirely?  
- We followed steps 1–4, but we’re getting **HTTP 403** after login. Any known causes?  

フレーズ集: [phrasebook.md §2](phrasebook.md)、§10 IT表現

---

## 練習ルーティン（週2回）

| 回 | やること | 時間 |
|----|----------|------|
| A | 英語ドキュメント1セクション → 自分で日本語要約 | 15分 |
| B | 要約をLLMにチェック → 用語5語を phrasebook に追記 | 10分 |

初週は [getting-started.md](getting-started.md) から開始。
