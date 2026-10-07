# Zombie Arena Online

オンライン 2D シューティングゲーム。Supabase を使ってログイン・プロフィール保存・ランク情報・フレンド機能を利用できます。

## 使い方

1. Supabase で新規プロジェクトを作成
2. SQL Editor で `supabase.sql` を実行
3. `config.js` に Supabase の URL と anon key を入れる
4. ブラウザで `index.html` を開く

## 1. Supabase プロジェクト作成

- https://supabase.com にアクセス
- 新しいプロジェクトを作成
- Project Settings → API で以下を確認
  - Project URL
  - anon/public key

## 2. SQL の実行

`supabase.sql` を Supabase の SQL Editor に貼り付けて実行します。

## 3. config.js の設定

```js
window.GAME_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxxxxxxx.supabase.co",
  SUPABASE_KEY: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
};
```

## 4. ローカル起動

ブラウザから `index.html` を直接開いても動きますが、CORS やローカルファイル制約で壊れる場合があるため、ローカルサーバーを推奨します。

```bash
python -m http.server 8000
```

その後、ブラウザで以下を開く:

```text
http://localhost:8000
```

## ゲーム操作

- WASD / 矢印キー: 移動
- マウス: 照準・射撃
- R: リロード

## 機能

- オンラインログイン
- プロフィール保存
- ランクポイント (RP)
- コイン収集
- 武器強化
- HP 強化
- フレンド申請
- チャット
- ランクマッチ / ゾンビモード

## 補足

- `auth.users` に対してプロフィールが自動生成されます
- `profiles` テーブルに保存されます
- `friendships` テーブルでフレンド関係を管理します

## 注意

- `SUPABASE_KEY` は `anon` キーを使います
- 本番では RLS と権限設計を十分に確認してください
- `public` キーはブラウザから読めるため、慎重に扱ってください
