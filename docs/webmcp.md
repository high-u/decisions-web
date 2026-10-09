# WebMCP 対応の設計

作成日: 2026-10-09

エージェントが、このアプリでシナリオの作成・更新・実行と、モデル・言語・モードの操作をできるように、WebMCP のツールを公開する。

## 方針

- ツールは命令的 API(`document.modelContext.registerTool()`)で登録する。
- シナリオの編集はタブ単位の一括作成・一括更新だけにする。入力欄ごとのツールや、質問単位のツールは作らない。
- ツールの引数のシナリオは、保存する JSON と同じ形(Jev API のリクエストボディから `model` を除いたもの)にする。
- ダイアログが絡む操作(開く、保存、名前を付けて保存、タブを閉じる)はツールにしない。
- ツールの説明、ヘルプ、応答のメッセージは英語で書く。
- 既存のソースの変更は最低限にする(`src/main.js` に 2 行)。

## 前提となる事実

### WebMCP

| 事実 | 出典 |
| --- | --- |
| ツールは `name`・`title`・`description`・`inputSchema`・`execute`・`annotations` で定義する | WebMCP 仕様 4.2 |
| `execute` の結果は JSON にシリアライズされてエージェントに渡る | WebMCP 仕様(`index.bs`) |
| 入力の JSON 文字列は、`execute` を呼ぶ前にブラウザが JavaScript の値に変換する | WebMCP 仕様(`index.bs`) |
| アノテーションは `readOnlyHint` / `untrustedContentHint` / `consequentialHint` / `debugging` | Chrome Imperative API |
| 文字数の推奨は、ツールの説明 500 字、パラメータの説明 150 字、名前 30 字、1 回の出力 1.5K 字 | Chrome WebMCP tool security |
| 「スキーマは緩く、検証はコードで厳密に」「ツールで変えた状態は画面にすぐ反映する」「機能の重なるツールを作らない」 | Chrome best practices |
| ファイルピッカーは、利用者の操作(transient activation)が無いと `SecurityError` になる | File System Access 仕様 |

### 実機(Chrome 151、`chrome-devtools-mcp`、2026-10-09)

| 確認したこと | 結果 |
| --- | --- |
| `execute` が例外を投げる | エージェントには `status: "Error", errorText: ""` だけが届き、メッセージは失われる |
| `execute` がオブジェクトを返す | そのまま届く |
| `inputSchema` の `required` 欠落・`enum` 違反 | 弾かれずに `execute` まで届く |
| 入れ子の `inputSchema`(`oneOf`、`additionalProperties`) | そのままエージェントに届く |
| `list_webmcp_tools` のアノテーション表示 | `readOnly` と `untrustedContent` だけ。`consequentialHint` は表示されない |
| `Alpine.$data()` で得た状態をツールから書き換える | 画面に反映され、未保存の印も付く |
| `chrome-devtools-mcp` 経由の入力のキーの順番 | アルファベット順に並べ替わる(ページ内の `executeTool` では保たれる)。state の項目・質問・choice の選択肢の順番は保たれず、score の段階(配列)は保たれる。WebMCP で使う場合は問題にしないと判断し、対応しない |

### このアプリ

| 事実 | 場所 |
| --- | --- |
| state は「テキスト」(文字列)か「項目」(1 階層の `{ 項目名: 文字列 }`) | `src/scenario.js`、`index.html` |
| 保存する JSON は `toRequest(form)` の `{ state, questions }` で、`model` は含まない | `src/scenario.js:44`、`src/main.js:84` |
| 未保存の判定は `JSON.stringify(tab.form) !== tab.savedText`。`addTab()` は作成時に `savedText` を現在の内容にするので、作ったタブは保存済みに見える | `src/main.js:85`、`src/main.js:92` |
| 新規タブの名前は `t('untitled', { n })` + `.json` で、言語によって変わる(「無題 n.json」 / 「Untitled n.json」) | `src/main.js:110`、`src/i18n.js` |
| サンプルは言語ごとに別(`SAMPLES.ja` / `SAMPLES.en`) | `samples.js` |
| モデルの状態は `checking / none / downloading / downloadFailed / loading / ready / loadFailed` | `src/model.js:9` |
| ダウンロードボタンは `none` / `downloadFailed` のときだけ押せる | `index.html:344` |
| 削除ボタンは `checking` / `none` のとき押せない。ダウンロード中の削除はダウンロードを中断する | `index.html:38`、`src/model.js:89` |
| 実行ボタンは実行中は押せない。モデルが無いと実行時にエラーになる | `index.html:254`、`src/main.js:250` |
| 言語とモードは `localStorage` に保存される | `src/i18n.js:202`、`src/main.js:217` |
| JavaScript のオブジェクトは、数字だけのキーを先頭に並べ替える(このアプリはその並びを保存できないとしている) | `src/scenario.js:60-73` |

## ツール一覧

| ツール | 内容 | `readOnlyHint` | `untrustedContentHint` | `consequentialHint` |
| --- | --- | :-: | :-: | :-: |
| `get_help` | シナリオの書き方(Jev API) | ✔ | | |
| `get_app_state` | モデルの状態、言語、モード | ✔ | | |
| `get_tabs` | 全タブの情報と中身 | ✔ | ✔ | |
| `get_samples` | サンプルのシナリオ | ✔ | | |
| `create_tab` | シナリオを持つタブを作る | | | |
| `update_tab` | タブのシナリオを丸ごと置き換える | | | |
| `run_tab` | タブのシナリオを実行する | | ✔ | |
| `download_model` | モデルのダウンロードを始める | | | |
| `delete_model` | モデルを削除する | | | ✔ |
| `set_language` | 言語を切り替える | | | |
| `set_theme` | ライト/ダークを切り替える | | | |

- `untrustedContentHint` は、利用者や他人が書いた文章(タブ名、シナリオ、質問 id、選択肢のキー)を応答に含むツールに付ける。ファイルから開いたシナリオは、他人の書いた文章を含みうるため。
- `consequentialHint` は `delete_model` に付ける(削除すると、再度 約 610 MB のダウンロードが要る)。ただし `chrome-devtools-mcp` はこのヒントを表示しないので、説明文にも「利用者が求めたときに使う」と書く。

画面の操作のうち、次はツールにしない。

| 操作 | 理由 |
| --- | --- |
| 新規 | `create_tab` で足りる |
| 開く、名前を付けて保存、保存 | ファイルピッカーが利用者の操作を要する。保存は利用者が行う |
| タブを閉じる | 未保存なら確認ダイアログになる |
| タブの選択 | 作成・更新・実行したタブは、ツールが画面に表示する |

## 共通の規約

- **応答**: 成功は `{ ok: true, ... }`、失敗は `{ ok: false, error }`。`error` には、何が起きたかと次に何をすればよいかを英語で書く。例外はメッセージが失われるので投げない。各 `execute` を包み、想定外の例外も `ok: false` で返す。
- **検証**: スキーマは型と説明を示す程度にし、`execute` 内で全て確かめる(スキーマ違反は `execute` まで届くため)。
- **押せない状態**: 画面でボタンが押せない状態でツールが呼ばれたら、何もせず `ok: false` と、理由と現在の状態を返す。
- **画面との同期**: `create_tab` / `update_tab` / `run_tab` は、そのタブを表示する(`activeId` にする)。
- **`tabId`**: `update_tab` / `run_tab` では必須。存在しない id のときは、存在する id の一覧を `error` に入れる。

## 各ツール

### get_help

```
name: "get_help"
description: "Explains how to write a scenario for this app. A scenario is the request body of the Jev (System One) API without `model`. Read `overview` and `workflow` before creating or updating a tab."
input: { topic?: "overview" | "state" | "choice" | "score" | "noul" | "app" | "workflow" }
  topic: "Topic to read. Without it, `overview`."
```

- 応答: `{ ok: true, topic, text, topics }`。不明な `topic` は `ok: false` とトピックの一覧。
- 本文は「ヘルプの本文」に書く。

### get_app_state

```
name: "get_app_state"
description: "Returns the model status (`ready` means scenarios can run; while downloading, bytes loaded and total), the UI language and the theme."
input: {}
```

- 応答: `{ ok: true, model: { status, loaded, total, error }, language: "ja" | "en", theme: "light" | "dark" }`。
- `model` は `Alpine.store('model')`、`language` は `Alpine.store('i18n').lang`、`theme` は `app.dark` から作る。

### get_tabs

```
name: "get_tabs"
description: "Returns every open tab: id, name, whether it is shown, whether it has unsaved changes, its scenario, and the result of its last run."
input: {}
```

- 応答: `{ ok: true, tabs: [{ id, name, shown, unsaved, scenario, lastRun }] }`。
  - `scenario` は `toRequest(tab.form)`。
  - `unsaved` は `app.isDirty(tab)`。
  - `lastRun` は `null`、`{ status: "running" }`、`{ status: "done", ms, answers }`、`{ status: "error", error }` のどれか。

### get_samples

```
name: "get_samples"
description: "Returns the sample scenarios as JSON. Without `language`, returns the samples of the current UI language. The response says which language it returned."
input: { language?: "ja" | "en" }
  language: "`ja` or `en`. Without it, the current UI language."
```

- 応答: `{ ok: true, language, samples: [{ name, scenario }] }`。`scenario` は `samples.js` の `request` をそのまま返す。

### create_tab

```
name: "create_tab"
description: "Opens a new tab with the given scenario and shows it. The tab is left unsaved; the user saves it. Without `name`, the tab is named as the New button names it. See get_help for how to write a scenario."
input: { scenario: Scenario, name?: string }
  name: "Tab name. `.json` is added when missing."
```

- 処理:
  1. `scenario` を検証する。
  2. `app.addTab(name, fromRequest(scenario))` を呼ぶ。
  3. 作成したタブの `savedText` を `null` にする。`isDirty()` が常に真になり、利用者が保存するまで未保存になる。
- `name` があれば、サンプルを開くときと同じく、末尾に `.json` が無ければ足す。無ければ `app.untitledCount` を 1 増やし、`app.t('untitled', { n })` + `.json` にする(画面の「新規」と同じ。言語で変わる)。
- 応答: `{ ok: true, tabId, name }`。

### update_tab

```
name: "update_tab"
description: "Replaces the whole scenario of a tab and shows the tab. See get_help for how to write a scenario."
input: { tabId: string, scenario: Scenario }
```

- 処理: 検証の後、`tab.form = fromRequest(scenario)` を行い、`app.activeId = tabId` にする。
- 応答: `{ ok: true, tabId, unsaved }`。

### run_tab

```
name: "run_tab"
description: "Runs the scenario of a tab, shows the tab, and returns the answers. The model must be `ready` (see get_app_state)."
input: { tabId: string }
```

- 画面の「実行」と同じく、実行中のタブには失敗を返す。
- モデルが `ready` でなければ、実行せずに失敗を返す。`error` には状態と次の手順を書く。
  - `none` / `downloadFailed`: `download_model`
  - `checking` / `downloading` / `loading`: 待って `get_app_state` で確認する
  - `loadFailed`: 画面の文言どおり、削除してからダウンロードし直す
- それ以外は `app.activeId = tabId` にし、`await app.runTab(tab)` の後で `tab.run` を読む。
  - 成功: `{ ok: true, tabId, ms, model, answers, usage }`
  - 失敗: `{ ok: false, error }`
- 失敗時は、画面にもトーストが出る(既存の動き)。

### download_model

```
name: "download_model"
description: "Starts downloading the model (about 610 MB) and returns at once. Check progress with get_app_state; the status becomes `ready` when the model is loaded."
input: {}
```

- `none` / `downloadFailed` 以外では失敗を返す。
- `app.downloadModel()` を待たずに呼び、`{ ok: true, status: "downloading" }` を返す。
  - 待たない理由: ダウンロードは約 610 MB あり、MCP クライアントがツールの応答をどれだけ待つかは確認していない。
- ダウンロード用のダイアログは開かない。
  - 理由: このダイアログは開いている間ページを操作できなくする(`x-trap.inert`)。利用者は、サイドバーの「ダウンロード」で進捗を見られる。

### delete_model

```
name: "delete_model"
description: "Deletes the downloaded model from the browser. Running scenarios then needs the model downloaded again (about 610 MB). Use when the user asks."
input: {}
```

- `checking` / `none` では失敗を返す。それ以外は `await app.deleteModel()` の後、`{ ok: true, status: "none" }` を返す。
- ダウンロード中に呼ばれた場合は、画面と同じくダウンロードを中断して削除する。

### set_language

```
name: "set_language"
description: "Sets the UI language. The choice is saved in the browser as the user's preference. Use when the user asks."
input: { language: "ja" | "en" }
```

- `app.setLang(language)`。応答: `{ ok: true, language }`。
- 既存のタブ名は変わらない。サンプルの一覧と、新しいタブの名前、画面の文言が変わる。

### set_theme

```
name: "set_theme"
description: "Sets the theme. The choice is saved in the browser as the user's preference. Use when the user asks."
input: { theme: "light" | "dark" }
```

- `app.setDark(theme === "dark")`。応答: `{ ok: true, theme }`。

## シナリオ(`Scenario`)の検証

`create_tab` と `update_tab` は、次を全て満たすときだけ変更する。満たさないときは何も変えず、違反した全ての場所を `error` に並べる(形式は `systemone.js` に合わせて `questions.<id>: ...`)。

| 対象 | 規則 | 根拠 |
| --- | --- | --- |
| 最上位 | オブジェクト。キーは `state`、`questions`、`model`(無視する)だけ | |
| `state` | 文字列、または値が全て文字列の 1 階層のオブジェクト。項目名は空にしない | 画面の「テキスト」「項目」 |
| `questions` | 1 個以上の質問を持つオブジェクト。id は空にしない | `systemone.js` が空を受け付けない |
| 質問のキー | `type`、`instructions`、`criteria` だけ | |
| `type` | `choice` / `score` / `noul` | |
| `instructions` | 空でない文字列 | 画面は文字列のみ |
| choice の `criteria` | 2〜20 個のオブジェクト。キーは空にしない。値は文字列か `null` | 画面の最少 2 行。上限は `docs/jev-compat.md`(Rust エンコーダーの制限) |
| score の `criteria` | 2〜10 個の文字列の配列 | `systemone.js`、API リファレンス |
| noul の `criteria` | 省略、または `true` / `false`(どちらも省略可)を文字列で持つオブジェクト | 画面の「基準」 |

数字だけのキーは、`execute` が受け取る時点で、すでに並べ替えられている。そのため、エージェントが書いた順番は検出できない。ヘルプで避けるよう書く。

## ヘルプの本文

各トピックは 1,500 字以内。

### overview

```
A scenario in this app is the request body of the Jev (System One) API, POST /v1/systemone, without `model`:
{"state": ..., "questions": {"<id>": {"type": "choice" | "score" | "noul", "instructions": "...", "criteria": ...}}}
The model evaluates the state against every question. Each question is evaluated independently, and its answer comes back under the same <id>.
- The <id> is not sent to the model. Write the complete question in `instructions`.
- Put the questions about the same state in one scenario. The API evaluates the questions of one request in parallel.
- To send a scenario to the Jev API, add "model": "jev-latest" (required there).
- This app runs the Julia-1 model in the browser. Its answers have the same shape as the API's, and this app has a few extra limits (topic: app).
Topics: state, choice, score, noul, app, workflow. get_samples returns complete examples.
```

### state

```
`state` is the content to evaluate. In this app it is either:
- a string, or
- a flat object of named text fields, such as {"message": "...", "refund_policy": "..."}. Every value is a string.
Use named fields when the content has several parts (a message, a record, a policy), so that each part has a clear name.
To ask about one field, name it in `instructions` in backticks: "Does `message` request a refund?"
```

### choice

```
`choice` picks one option from a set with no order.
"criteria": {"billing": "payments, charges, refunds", "technical": "bugs, errors, login problems"}
- Keys are the option names. Values are descriptions, or null when the key says enough.
- In this app (Julia-1), the model sees only the description when there is one, and the key otherwise. Write descriptions that stand on their own.
- 2 to 20 options (the API allows up to 255).
- Add an "other" or "none" option when the options may not cover every input.
- Answer: `choice` (the chosen key), `probabilities` (one per option), `confidence` (0 to 1).
```

### score

```
`score` rates the state on ordered levels.
"criteria": ["calm", "frustrated but civil", "very angry"]
- Levels go from the lowest to the highest. 2 to 10 levels.
- Describe what each level means.
- Answer: `score` (the position on the levels, starting at 0; it can fall between two levels), `legend` (level number to description), `probabilities`, `confidence`.
- For a judgment that depends on several factors, ask one score per factor and combine the answers.
```

### noul

```
`noul` returns the probability that a yes/no statement is true, from 0 to 1.
{"type": "noul", "instructions": "Does the customer request a refund?"}
- `criteria` is optional: {"true": "...", "false": "..."} says what yes and no mean.
- Answer: `noul` only, with no confidence. Near 1 is yes, near 0 is no, near 0.5 is uncertain.
- 0.5 does not mean "medium". To measure a degree, use score.
- State the condition precisely. Avoid vague words such as "strong".
```

### app

```
Limits of this app, not of the API:
- state: a string, or a flat object whose values are strings.
- instructions: a non-empty string.
- choice descriptions: strings or null. score levels and noul criteria: strings.
- At least one question.
- Question ids, option keys and state field names are not empty.
- Avoid keys made only of digits: JSON objects move them to the front, so their order is not kept.
- Running needs the model (about 610 MB). get_app_state shows `model.status`; download_model starts the download.
- Tabs you create or update stay unsaved. The user saves them.
```

### workflow

```
1. get_app_state: `model.status` must be `ready` to run.
2. get_tabs: see the open tabs and their scenarios.
3. create_tab with a scenario, or update_tab to replace the scenario of a tab. The tab is shown to the user.
4. If the response has `ok: false`, fix the scenario as `error` says and call again.
5. run_tab: read `answers`.
6. If an answer looks wrong, make `instructions` and the descriptions more specific. A low `confidence` is a reason to ask the user.
```

## ソースの変更

| ファイル | 変更 |
| --- | --- |
| `src/webmcp.js`(新規) | `registerWebMCP(app)`。ツールの定義、ヘルプの本文、シナリオの検証。`document.modelContext?.registerTool` が無ければ何もしない |
| `src/main.js` | `import { registerWebMCP } from './webmcp.js';` と、`init()` の最後に `registerWebMCP(this);` の 2 行 |

- `init()` の `this` は、既存のコードがリアクティブな状態として使っている(`this.newTab()` など)。ツールからの書き換えも、これを通す。
- 使う既存の関数は次のとおり。
  - `app`: `addTab`、`isDirty`、`runTab`、`downloadModel`、`deleteModel`、`setLang`、`setDark`、`t`
  - `scenario.js`: `fromRequest`、`toRequest`
  - `samples.js`: `SAMPLES`

## 検証の手順

実装後、`chrome-devtools-mcp` の `list_webmcp_tools` / `execute_webmcp_tool` で確かめる。

1. 11 個のツールが、説明・スキーマ・アノテーション付きで見える。
2. `get_samples` で得たシナリオを `create_tab` に渡すと、タブが表示され、未保存の印が付く。名前を省略すると「新規」と同じ名前になる(日本語と英語の両方)。
3. `update_tab` の後に `get_tabs` を呼ぶと、渡したシナリオが返る。
4. `run_tab` の答えが、画面の「実行」の答えと一致する。
5. 失敗の経路。いずれも何も変えずに `ok: false` を返し、次の手順を `error` に書く。
   - 検証規則の違反(1 つずつ)
   - 存在しない `tabId`
   - 実行中の `run_tab`
   - モデルが `ready` でない `run_tab`
   - `ready` での `download_model`
   - `none` での `delete_model`
6. `download_model` の後、`get_app_state` で `downloading` → `loading` → `ready` と進む。
7. `set_language` / `set_theme` が画面に反映され、再読み込み後も残る。
8. 各応答の文字数。

## 未確認の事項

- MCP クライアントが、時間のかかるツールの応答をどれだけ待つか。`download_model` は待たない設計にした。
- Vite の HMR で `main.js` が再評価されたとき、同名の登録が拒否されるか(仕様では拒否される)。拒否されたら、登録に `AbortSignal` を渡して解除する。
- `run_tab` の応答が 1.5K 字を超える条件。`docs/jev-compat.md` の 3 問の例は、圧縮した JSON で 428 字。

## 参照元

- WebMCP 仕様: https://webmachinelearning.github.io/webmcp/
- WebMCP リポジトリ: https://github.com/webmachinelearning/webmcp
- Chrome Imperative API: https://developer.chrome.com/docs/ai/webmcp/imperative-api
- Chrome WebMCP best practices: https://developer.chrome.com/docs/ai/webmcp/best-practices
- Chrome WebMCP tool security: https://developer.chrome.com/docs/ai/webmcp/secure-tools
- File System Access: https://wicg.github.io/file-system-access/
- chrome-devtools-mcp: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md
- TypeSafe API リファレンス: https://docs.typesafe.ai/api
- TypeSafe Primitives: https://docs.typesafe.ai/primitives
- TypeSafe State: https://docs.typesafe.ai/concepts/state
- このリポジトリ: `docs/jev-compat.md`
