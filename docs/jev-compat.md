# Julia-1 と Jev（System One）互換のメモ

調査日: 2026-10-08

## 参照元

- TypeSafe ドキュメント
  - https://docs.typesafe.ai/concepts/system-one
  - https://docs.typesafe.ai/primitives
  - https://docs.typesafe.ai/api
  - https://docs.typesafe.ai/concepts/state
- Hugging Face ブログ: https://huggingface.co/blog/ggml-org/decision-models-in-llamacpp
- llama.cpp（`c811cb8`, 2026-10-08 時点の master）
  - `tools/server/server-decision.cpp` / `server-decision.h`: `/v1/systemone` の実装
  - `tools/server/README.md`: `POST /v1/systemone` の節
  - `conversion/bert.py`: Julia-1 の GGUF 変換（`ModernBertDecisionModel`）
  - `common/jinja/value.cpp`: テンプレートの `tojson`
- Julia-1 の設定: https://huggingface.co/SupersonicLabs/Julia-1/resolve/main/julia_config.json
- 同梱の Rust エンコーダー: `Julia-1-ONNX/rust/src/lib.rs`

## Jev（System One）とは

- 文章を生成せず、state（状態）に対して「型の決まった答え」と確率を返す decision model。
- 3 つの質問タイプ（primitive）がある。

| type | 用途 | criteria | 返り値 |
| --- | --- | --- | --- |
| `choice` | 順序の無い選択肢から 1 つ選ぶ | `{ キー: 説明 }`。説明は `null` でも良い | `choice`, `probabilities`, `confidence` |
| `score` | 順序のある段階で評価する | 段階の説明の配列（2〜10 個、低い順） | `score`, `legend`, `probabilities`, `confidence` |
| `noul` | yes/no の確率 | 省略可。`{ true: 説明, false: 説明 }` | `noul`（true の確率） |

### リクエスト（`POST /v1/systemone`）

```json
{
  "model": "jev-latest",
  "state": "Customer message: I was charged twice for my order last week and nobody has replied.",
  "questions": {
    "route": {
      "type": "choice",
      "instructions": "Which team should handle this?",
      "criteria": {
        "billing": "payments, charges, refunds, invoices",
        "shipping": "delivery, tracking, lost or late parcels",
        "technical": "bugs, errors, login problems"
      }
    }
  }
}
```

- `state`: 文字列、オブジェクト、配列のいずれか。オブジェクトで名前を付けて渡すのが推奨されている。
- `instructions`: 文字列、オブジェクト、配列のいずれか。
- 1 つの state に対して複数の質問を送れる。各質問は独立に評価される。

### レスポンス

```json
{
  "model": "...",
  "answers": {
    "route":   { "type": "choice", "choice": "billing", "probabilities": { "billing": 0.99, "shipping": 0.009, "technical": 0.0001 }, "confidence": 0.986 },
    "angry":   { "type": "noul", "noul": 0.93 },
    "urgency": { "type": "score", "score": 1.28, "legend": { "0": "can wait", "1": "this week", "2": "today", "3": "right now" },
                 "probabilities": { "0": 0.0001, "1": 0.72, "2": 0.28, "3": 0.0005 }, "confidence": 0.715 }
  },
  "usage": { "input_tokens": 110, "output_tokens": 0 }
}
```

## llama.cpp で Julia-1 がどう扱われるか

### モデルの種類

- Julia-1 は decision type **`LAYA`** として変換される（ModernBERT と head 2 層）。
- 選択肢ごとに `[MASK]` トークンを置き、その位置のスコア（logit）を読む。出力列は `qtype`（choice=0, score=1, noul=2）で選ぶ。
- ONNX 版の `marker_pos` と `qtype` の入力は、これと同じ仕組み。

### プロンプトの組み立て（Julia 用テンプレート）

```
[CLS]{type} question: {instructions}[SEP]
  ([MASK] {選択肢テキスト}) × 選択肢の数
[SEP]{state}[SEP]
```

- **選択肢テキスト（Julia だけの扱い）**: 説明があれば**説明だけ**を使い、無ければキー名を使う。キー名と説明を並べることはしない。
  - Laya など他のモデルは `key: description` の形にするが、Julia は説明でキー名を置き換える。
  - 説明が空かどうかは Jinja の真偽で判定する。`null`, `""`, `[]`, `{}` のときはキー名になる。
- `state` や `instructions` が文字列でないときは、テンプレートの `tojson` で JSON にする。
  - キーは書かれた順のまま（並び替えない）。
  - 区切りは `", "` と `": "`。
  - ASCII 以外の文字はエスケープしない。
- 入力に `[MASK]` の文字列が含まれていたら空白に置き換える。
- 長さの予算: 質問と選択肢で 256 トークン（`max_head_tokens`）、選択肢 1 つあたり 48 トークン。超えた分は切り詰める。

### 選択肢の並び

| type | モデルに渡す選択肢 |
| --- | --- |
| choice | `criteria` に書いた順。ソートしない |
| score | 配列の順に、キー `"0"`, `"1"`, … を付ける |
| noul | `[false, true]` の順 |

### 確率と各フィールドの計算（`format_answer`）

- 確率は `softmax(logit / temperature)` で計算する。
  - temperature はモデルファイルのメタデータから読む。
  - Julia-1 の `julia_config.json` には temperature が無いので、**1.0** になる。
  - つまり、logit をそのまま softmax しただけの確率。丸めやしきい値の処理は無い。
- `choice`
  - `choice`: 確率が最大の選択肢のキー
  - `confidence = max(0, (p_max − 1/n) / (1 − 1/n))`
- `score`
  - `score = Σ i·p_i`（期待値。段階の間の値も取る）
  - `legend = { "0": 説明0, … }`
  - `confidence = max(0, 1 − Σ p_i·|i − mode| ÷ Σ |i − (n−1)/2| / n)`
- `noul`
  - `noul = p(true)`。`confidence` は無い。
- コードには「confidence の式は TypeSafe が公開しているもの」とコメントがある。

## このプロジェクトでの実装（`systemone.js`）

```js
import { systemone } from './systemone.js';
const res = await systemone(engine, { state, questions });   // engine は JuliaCPU
```

- llama.cpp の `/v1/systemone` と同じ形のリクエストを受け取り、同じ形のレスポンスを返す。
- 入力チェックと、エラーメッセージの形（`questions.<id>: ...`）も llama.cpp に合わせている。
- 全質問を 1 回の `engine.logits()` でまとめて推論する（バッチ）。
- `state` と `instructions` は llama.cpp の `tojson` と同じ形式で文字列にしてから、エンコーダーに渡す。
- 確率は生の softmax（temperature 1.0）。`julia.js` の `predict()` は表示用に丸めるので使わない。
- `model` は `"julia-1"` 固定。`usage.input_tokens` は、エンコーダーが出したトークン数の合計。

### 動作確認（2026-10-08、Chrome、マルチスレッド CPU）

ブログの例（`I was charged twice ...`）で、次の結果になった。ブログの記述と一致している。

- 説明なし（`billing/shipping/technical` が `null`）: `shipping`（0.94）
- 説明あり: `billing`（0.9907）。1 問で 31 ms。

## llama.cpp との違い・制約

| 項目 | このプロジェクト | llama.cpp |
| --- | --- | --- |
| 選択肢の数 | 2〜20（Rust エンコーダーの制限） | 最大 255 |
| 長すぎる入力 | strict モード（既定）ではエラー | 切り詰める |
| 全体の長さ | 1024 トークン（`maxLength`） | `--ubatch-size` に収まる必要がある |
| 浮動小数の JSON 表記 | JS の表記（`0.1`, `3.14159265`） | C++ の ostream（有効数字 6 桁） |
| 画像・音声 | 非対応 | Julia-1 は非対応（他のモデルは一部対応） |

### 補足: Rust エンコーダーの state の扱い

- オブジェクトや配列の state を Rust エンコーダーにそのまま渡すと、`serde_json` で JSON になる。
  - キーがアルファベット順に並び替えられ、区切りは `,` `:`（空白無し）になる。
  - これは llama.cpp と異なる。
- `systemone.js` では、文字列にしてから渡すことで、この差を避けている。

## 未決事項

- 入力長の上限と、strict モードにするか切り詰めるか。
- UI で選択肢の説明をどう入力・表示するか。
