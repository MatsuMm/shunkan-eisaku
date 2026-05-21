# 瞬間英作 (Shunkan Eisaku)

会話頻出フレーズで「日本語 → 英語」を瞬時に口に出す練習をするための PWA。
Android のホーム画面に追加してアプリのように使えます。

## 特徴

- **B1 レベル 50問** から開始 (会話頻出フレーズ・イディオム・文法)
- **自己採点 + SRS**: ◯=3日後 / △=明日 / ×=本日中に再出題 (森沢メソッド準拠)
- **音声出力**: Web Speech API (ブラウザ標準・無料・オフライン可)
- **音声入力**: 自分の発音をテキスト化して確認可能 (任意)
- **オフライン動作**: Service Worker でキャッシュ
- **進捗保存**: 端末 LocalStorage のみ (サーバー不要)

## ローカルで動かす

静的ファイルだけなので、何かしらの HTTP サーバーで配信すれば動きます。
Python があれば一発:

```bash
cd C:/projects/shunkan-eisaku
python -m http.server 8765
```

ブラウザで `http://localhost:8765/` を開く。

## スマホで使う (Android)

1. PC とスマホを同じ Wi-Fi に繋ぐ
2. PC で `python -m http.server 8765 --bind 0.0.0.0`
3. PC の IP を確認 (`ipconfig` → IPv4 アドレス、例: `192.168.1.42`)
4. Android Chrome で `http://192.168.1.42:8765/` を開く
5. メニュー → 「ホーム画面に追加」

## GitHub Pages で公開する (任意)

```bash
git remote add origin git@github.com:<your-name>/shunkan-eisaku.git
git push -u origin main
# GitHub repo → Settings → Pages → Branch: main / root を選択
```

公開 URL を Android Chrome で開いて「ホーム画面に追加」。

## 問題を増やす

`data/problems-b1.json` を編集するだけ。フォーマット:

```json
{
  "id": "b1-051",
  "jp": "日本語文",
  "en": "模範英訳",
  "alt": ["別解1", "別解2"],
  "tag": "カテゴリ (任意)",
  "note": "解説 (任意)"
}
```

将来 B2 を作る時は `data/problems-b2.json` に分離予定。

## 仕事英語（社内IT向けメモ）

会話練習アプリとは別に、チケット・障害連絡・定例向けの定型と LLM 練習手順があります。

→ **[docs/work-it/README.md](docs/work-it/README.md)**（1週間スターター・フレーズ集・テンプレ）

## Gemini TTS (任意・将来追加)

より自然な音声を使いたい時用。今は Web Speech API のみ実装。
`.env.example` をコピーして `.env` に API キーを書く準備だけ済んでいます。

## ファイル構成

```
shunkan-eisaku/
├── index.html         # PWA エントリ
├── app.js             # メインロジック (SRS, TTS, STT)
├── styles.css         # 暗色テーマ
├── manifest.json      # PWA マニフェスト
├── sw.js              # Service Worker
├── data/
│   └── problems-b1.json
├── docs/
│   └── work-it/       # 社内IT向け（フレーズ・テンプレ・LLM手順）
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── scripts/
│   └── make_icons.py  # アイコン生成 (再生成は不要)
├── .env.example
├── .gitignore
└── README.md
```

## ライセンス

個人利用。問題文・解説は AI 生成。
