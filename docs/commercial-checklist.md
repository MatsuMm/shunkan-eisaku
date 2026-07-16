# 商業リリース チェックリスト（瞬間英作 v1.0.0）

販売モデル **A: BOOTH / DLsite ZIP 買い切り** 前提。

ステータス: `[ ]` 未 / `[x]` 完了 / `[~]` 出品者作業（ローカルでは不可）

---

## Phase 0 — 製品定義

- [x] 製品名: **瞬間英作（Shunkan Eisaku）**
- [x] 主ターゲット: **Android Chrome**
- [x] iOS 制限を正直に記載
- [x] localStorage のみ
- [x] ZIP 買い切り
- [x] 価格帯案: **1,980円**（調整可 1,480〜2,980）
- [x] サポート: **販売ページのメッセージ**（terms/privacy 記載）
- [x] バージョン: **v1.0.0**（`VERSION` / ヘッダー / CHANGELOG）

---

## Phase 1 — プロダクト

### コア

- [x] SRS 説明と実装一致（◯/△/×）
- [x] Lv1–5・シーン切替
- [x] 約970フレーズ + 社内IT 30
- [x] 一覧 / 復習 / 聞き取り / 文法14 / 会話23 / 読解20 / 語彙
- [x] TTS MP3 優先 + Web Speech
- [x] マイク OFF 設定
- [x] オンボーディング更新
- [x] 反応タイマー / 口に出した確認 / 今日の目標
- [x] 卒業ライン 80%
- [x] シャドウイング修正 / Gemini UI 削除 / ロードエラー

### 進捗

- [x] export / import
- [x] 全リセット確認ダイアログ
- [x] もう一度練習（進捗保持）

### PWA

- [x] manifest / icons
- [x] SW v23 network-first + 全 data JSON precache（it-support 含む）
- [x] オフライン方針を FAQ/設定に記載
- [ ] 実機オフライン確認（出品前に実施）

### 法務

- [x] legal/terms.html
- [x] legal/privacy.html
- [x] legal/start-here.html
- [x] アプリからリンク

### コンテンツ

- [x] コア QA 45 件（CONTENT_QA_LOG.md）
- [x] work-it → 社内IT シーン 30 問

---

## Phase 2 — ZIP

- [x] `scripts/build_release_zip.py`
- [x] `scripts/smoke_check.py`（errors=0）
- [x] START_HERE.md / CHANGELOG / VERSION
- [x] `.env` 除外
- [x] `python scripts/build_release_zip.py` → `dist/shunkan-eisaku-v1.0.0.zip`（約 **24.7 MB**）
- [x] sha256 同梱（`.sha256` ファイル）
- [ ] 販売ページに ZIP サイズ記載
- [ ] クリーン展開スモーク（出品前・実機）

---

## Phase 3 — 販売ページ

- [x] 原稿: docs/booth-listing.md
- [x] サポートテンプレ: docs/support-templates.md
- [~] BOOTH にタイトル・本文・価格・タグを入稿
- [~] スクリーンショット撮影
- [~] サムネ作成
- [~] 下書きプレビュー

---

## Phase 4 — ローンチ

- [~] ZIP アップロード
- [~] 販売開始
- [~] 告知（効果保証しない）

---

## リリース直前5項目（出品者）

1. [ ] Android: インストール → 10問 → 音声 → 再起動後進捗
2. [ ] legal 3ページが開ける
3. [ ] START_HERE の起動手順が通る
4. [ ] 販売文の iOS / バックアップ / 返金が現状一致
5. [ ] 再配布禁止が一文で読める

---

## 決定ログ

| 日付 | 決定 |
|------|------|
| 2026-07-17 | モデル A（ZIP 買い切り）。legal / README / booth 原稿 |
| 2026-07-17 | export/import・タイマー・目標・社内IT・コアQA・v1.0.0 パッケージ化 |
| 2026-07-17 | 推奨価格 1,980円。問い合わせは販売ページメッセージ |
