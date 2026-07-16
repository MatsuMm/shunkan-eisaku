# 瞬間英作（Shunkan Eisaku）

日本語を見て、英語を**瞬時に口に出す**練習用の PWA（Progressive Web App）。  
サーバー不要の静的ファイル構成で、Android Chrome を主対象にホーム画面追加してアプリのように使えます。

> **販売形態（v1）**: BOOTH / DLsite 等での **ZIP 一式の買い切り**（サブスクなし）  
> 本リポジトリ／パッケージは**商用個人製品**です。オープンソースの自由再配布ライセンスではありません。→ [ライセンス](#ライセンス) / [legal/](legal/)

---

## できること

| モード | 内容 |
|--------|------|
| **学習** | 日→英の瞬間英作。自己採点 + SRS |
| **一覧** | フレーズ検索・英語表示切替・状態確認 |
| **復習** | プレイリスト再生（JP→EN 間隔・ループ・学習済みのみ等） |
| **聞き取り** | 音声を聞いて単語を並べて完成させるディクテーション |
| **文法** | 会話で使う型に絞った解説 **14** セクション |
| **会話** | 相手発話 → 自分の番を瞬間英作する対話 **23** 本 |
| **読解** | メール／お知らせ等の短文読解 + 理解クイズ **20** 本 |
| **語彙** | フレーズから拾った語の選択式トレーニング |

### コンテンツ規模（目安）

- **レベル**: Lv1〜Lv5（目安 CEFR A1〜B2+/C1）
- **シーン**: 全般・仕事・**社内IT**・旅行・飲食店・日常・謝罪確認・感情反応・リダクション特訓 など
- **フレーズ**: 約 **970** 問（v1.0.0）
- **音声**: Edge TTS 等で事前生成した MP3 約 **2,000** ファイル（`audio/`）  
  → 再生は MP3 優先、欠落時はブラウザ Web Speech にフォールバック

### v1.0.0 の学習サポート

- **反応タイマー**（既定 3 秒）
- **「口に出した」確認**（答えの前）
- **今日の目標**バー
- レベル **卒業ライン**（80% 学習済）表示
- セッション完了後の **もう一度練習**（進捗は消さない）

### SRS（自己採点ルール）

森沢式に近いシンプル間隔反復:

| ボタン | 意味 | 次の出題 |
|--------|------|----------|
| **◯** | 言えた | **3日後**（連続 ◯ で間隔が伸びる） |
| **△** | 惜しい | **明日** |
| **×** | 言えなかった | **同じセッション内で再出題**（＋翌日扱いの due） |

進捗・設定は **端末の localStorage のみ**（専用バックエンドなし）。  
**進捗のエクスポート／インポート**は設定パネルから利用できます（機種変更・再インストール前に必須）。

購入者向け起動手順: [START_HERE.md](START_HERE.md) / [legal/start-here.html](legal/start-here.html)  
変更履歴: [CHANGELOG.md](CHANGELOG.md)

### マイク（任意）

- Web Speech Recognition で発音確認・シャドウイング用（設定でオフ可）
- Chrome ではクラウド認識になる場合あり → 詳細は [legal/privacy.html](legal/privacy.html)

### オフライン

- Service Worker は **network-first**（オンラインなら最新を取りに行き、失敗時のみキャッシュ）
- HTML/JS/CSS/主要 JSON はプリキャッシュ。MP3 は再生時に都度キャッシュ
- 初回に必要なデータを一度取らないと、オフラインで音声が足りないことがあります

---

## 対応環境

| 環境 | 位置づけ |
|------|----------|
| **Android + Chrome** | **主対応**。ホーム画面追加推奨 |
| PC ブラウザ | 開発・学習可（サポート優先度は Android 次点） |
| **iOS Safari** | 制限あり（PWA／音声／マイク／ストレージ等）。完全動作は保証しない |

---

## ローカルで動かす

静的ファイルのみです。HTTP で配信してください（`file://` 直開きは SW や音声で不安定になりがちです）。

```bash
cd path/to/shunkan-eisaku
python -m http.server 8765
```

ブラウザで `http://localhost:8765/` を開く。

### リリース ZIP を作る（販売用）

```bash
python scripts/build_release_zip.py
# → dist/shunkan-eisaku-v1.0.0.zip と .sha256
python scripts/smoke_check.py
```

### スマホ（Android）で使う

1. PC とスマホを同じ Wi-Fi に接続  
2. `python -m http.server 8765 --bind 0.0.0.0`  
3. PC の IPv4 を確認（例: `ipconfig`）  
4. Android Chrome で `http://192.168.x.x:8765/` を開く  
5. メニュー → **「ホーム画面に追加」**

ZIP 購入版も同様に、展開先をローカルサーバーで配信するか、配布手順書の案内に従ってください。

---

## ファイル構成（概要）

```
shunkan-eisaku/
├── index.html          # エントリ
├── app.js              # メインロジック（編集時は配布方針に注意）
├── styles.css
├── manifest.json       # PWA
├── sw.js               # Service Worker (network-first)
├── audio/              # 事前生成 MP3（多数）
├── data/
│   ├── index.json      # レベル定義・ソース一覧
│   ├── levels/         # Lv1–5 フレーズ
│   ├── scenes/         # シーン別フレーズ
│   ├── grammar.json
│   ├── dialogues.json
│   └── reading.json
├── icons/
├── legal/
│   ├── terms.html      # 利用規約
│   └── privacy.html    # プライバシー
├── docs/
│   ├── commercial-checklist.md
│   ├── booth-listing.md
│   └── work-it/        # 社内IT向け別メモ（アプリ本体とは別枠）
├── scripts/            # 音声生成・アイコン等の開発用
└── README.md
```

---

## 開発メモ（メンテ用）

- フレーズ追加: `data/levels/` / `data/scenes/` と `data/index.json` の `sources`
- 音声再生成: `scripts/generate_audio.py` 等（Edge TTS 前提の開発スクリプト）
- SW のキャッシュ名を上げるとクライアントの古いキャッシュ破棄が走りやすい

アプリ本体（`app.js` / `index.html` / `styles.css` / `sw.js`）の変更方針は開発者向け。購入者向けの説明は販売ページ・本 README・legal を正とする。

---

## ライセンス（商用個人製品）

- **著作権**: 提供者に帰属（プログラム・データ・音声・文言を含む）
- **購入者に許諾される範囲**: 個人の英語学習目的での利用（同一世帯の個人利用は可）
- **禁止**: 再配布・再販売・ミラー公開・教材転載・組織への無断一括配布・OSS としての再ライセンス
- コンテンツは **AI 支援生成 + 編集方針による調整**を含みます。唯一解や公式試験との一致は保証しません
- 詳細は必ず以下を読んでください:
  - [legal/terms.html](legal/terms.html) — 利用規約
  - [legal/privacy.html](legal/privacy.html) — プライバシーポリシー

販売・掲載用の文案と出荷チェック:

- [docs/booth-listing.md](docs/booth-listing.md)
- [docs/commercial-checklist.md](docs/commercial-checklist.md)

---

## 仕事英語メモ（別枠）

会話アプリ本体とは別に、社内 IT 向けの定型・LLM 練習メモがあります。

→ [docs/work-it/README.md](docs/work-it/README.md)
