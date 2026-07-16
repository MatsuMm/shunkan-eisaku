# Changelog

## v1.0.0 — 2026-07-17

商用 ZIP 買い切り向けの初回リリース。

### 学習・効果
- 反応タイマー（既定 3 秒、設定で OFF 可）
- 「口に出した」確認（答え表示前の自己欺瞞防止）
- 今日の目標バーと達成トースト
- レベルバナーに卒業ライン（80% 学習済）表示
- セッション完了後「もう一度練習」（進捗を消さない）

### 信頼性・完成度
- シャドウイング採点バグ修正（`normalizeForDict`）
- 未実装の Gemini TTS UI を削除
- 教材ロード失敗時のエラー画面
- ヘッダーに進捗・本日残を再表示
- 進捗のエクスポート／インポート（JSON）
- マイク入力の設定 OFF
- Service Worker v22+: 全 data JSON / icons / legal を precache

### コンテンツ
- 社内 IT シーン（30 フレーズ）を追加（チケット・障害・定例）
- コア問題の品質パス（CONTENT_QA_LOG 参照）

### 法務・配布
- `legal/terms.html` / `legal/privacy.html`
- `START_HERE.md`（購入者向け起動手順）
- BOOTH 原稿: `docs/booth-listing.md`
- 出荷チェックリスト: `docs/commercial-checklist.md`
- リリース ZIP ビルド: `scripts/build_release_zip.py`
