// UI strings. English labels use the API terms (state, questions, type, instructions, criteria, ...).
// t(key, params) replaces {name} with params.name; a missing key shows the key itself.

const LANG_KEY = 'decision-web:lang';

const messages = {
  ja: {
    sidebar: 'サイドバー',
    model: 'モデル',
    download: 'ダウンロード',
    'download.title': 'モデルのダウンロード',
    'download.body': 'モデル（約 610 MB）をダウンロードします。',
    'download.close': '閉じる',
    delete: '削除',
    operations: '操作',
    new: '新規',
    open: '開く',
    save: '保存',
    saveAs: '名前を付けて保存',
    samples: 'サンプル',
    language: '言語',
    mode: 'モード',
    light: 'ライト',
    dark: 'ダーク',

    'model.downloaded': 'モデル（約 610 MB）はダウンロード済み。',
    'model.downloading': 'ダウンロード中… {loaded} MB',
    'model.downloadingTotal': 'ダウンロード中… {loaded} / {total} MB',
    'model.downloadFailed': 'ダウンロードできませんでした（{error}）',
    'model.loadFailed': 'モデルを読み込めませんでした（{error}）。モデルを削除してから、再度ダウンロードをお試しください。',

    untitled: '無題 {n}',
    unsaved: '未保存',
    closeTab: '閉じる',

    'toast.openFailed': '開けませんでした',
    'toast.saveFailed': '保存できませんでした',
    'toast.saveInvalid': '入力にエラーがあるため保存できません',
    'toast.downloadFailed': 'モデルをダウンロードできませんでした',
    'toast.loadFailed': 'モデルを読み込めませんでした',
    'toast.runFailed': '実行できませんでした',
    'close.title': '保存されていない変更があります',
    'close.body': '「{name}」の変更は保存されていません。閉じると変更は失われます。',
    'close.cancel': 'キャンセル',
    'close.confirm': '保存せずに閉じる',
    'samples.title': 'サンプルを開く',

    state: '状態',
    'state.text': 'テキスト',
    'state.items': '項目',
    'state.key': '項目名',
    'state.value': '内容',
    'state.add': '項目を追加',
    questions: '質問',
    id: 'ID',
    type: '種類',
    instructions: '質問文',
    'criteria.choice': '選択肢',
    'criteria.score': '基準',
    'criteria.noul': '基準',
    'question.delete': '質問を削除',
    'question.add': '質問を追加',
    'type.choice': '選択肢から 1 つ選ぶ',
    'type.score': '基準で評価する',
    'type.noul': 'True/False の確率',
    'choice.key': 'キー',
    'choice.desc': '説明',
    'choice.add': '選択肢を追加',
    'score.desc': '説明',
    'score.add': '基準を追加',
    'noul.desc': '説明',
    remove: '削除',

    run: '実行',
    'run.notDownloaded': 'モデルがダウンロードされていません。「ダウンロード」を押してください',
    'run.loading': 'モデルを読み込み中です。読み込みが終わってから実行してください',
    'run.notLoaded': 'モデルが読み込まれていません',
    'run.time': 'レスポンスタイム: {ms} ms',
    'result.choice': '選択',
    'result.noul': 'true の確率',
    'result.score': 'スコア',
    'result.confidence': '確信度',
    'result.key': 'キー',
    'result.legend': '基準',
    'result.probabilities': '確率',

    'err.empty': '{label}が空です',
    'err.duplicate': '{label}「{key}」が重複しています',
    'err.numeric': '数字だけの{label}は自動的に先頭へ並び替えられるため、この並び順では保存できません',
    'label.item': '項目名',
    'label.id': 'ID',
    'label.key': 'キー',

  },
  en: {
    sidebar: 'Sidebar',
    model: 'Model',
    download: 'Download',
    'download.title': 'Download the model',
    'download.body': 'Downloads the model (about 610 MB).',
    'download.close': 'Close',
    delete: 'Delete',
    operations: 'Actions',
    new: 'New',
    open: 'Open',
    save: 'Save',
    saveAs: 'Save as',
    samples: 'Samples',
    language: 'Language',
    mode: 'Mode',
    light: 'Light',
    dark: 'Dark',

    'model.downloaded': 'The model (about 610 MB) is downloaded.',
    'model.downloading': 'Downloading… {loaded} MB',
    'model.downloadingTotal': 'Downloading… {loaded} / {total} MB',
    'model.downloadFailed': 'Download failed ({error})',
    'model.loadFailed': 'Could not load the model ({error}). Delete the model, then try downloading it again.',

    untitled: 'Untitled {n}',
    unsaved: 'Unsaved',
    closeTab: 'Close',

    'toast.openFailed': 'Could not open',
    'toast.saveFailed': 'Could not save',
    'toast.saveInvalid': 'Not saved: the input has errors',
    'toast.downloadFailed': 'Could not download the model',
    'toast.loadFailed': 'Could not load the model',
    'toast.runFailed': 'Could not run',
    'close.title': 'Unsaved changes',
    'close.body': 'Changes to "{name}" are not saved. They will be lost if you close it.',
    'close.cancel': 'Cancel',
    'close.confirm': 'Close without saving',
    'samples.title': 'Open a sample',

    state: 'State',
    'state.text': 'Text',
    'state.items': 'Items',
    'state.key': 'Name',
    'state.value': 'Value',
    'state.add': 'Add item',
    questions: 'Questions',
    id: 'ID',
    type: 'Type',
    instructions: 'Instructions',
    'criteria.choice': 'Criteria',
    'criteria.score': 'Criteria',
    'criteria.noul': 'Criteria',
    'question.delete': 'Delete question',
    'question.add': 'Add question',
    'type.choice': 'Choice',
    'type.score': 'Score',
    'type.noul': 'Noul',
    'choice.key': 'Key',
    'choice.desc': 'Description',
    'choice.add': 'Add option',
    'score.desc': 'Description',
    'score.add': 'Add level',
    'noul.desc': 'Description',
    remove: 'Delete',

    run: 'Run',
    'run.notDownloaded': 'The model is not downloaded. Press "Download"',
    'run.loading': 'The model is loading. Run it after loading finishes',
    'run.notLoaded': 'The model is not loaded',
    'run.time': 'Response time: {ms} ms',
    'result.choice': 'Choice',
    'result.noul': 'Noul',
    'result.score': 'Score',
    'result.confidence': 'Confidence',
    'result.key': 'Key',
    'result.legend': 'Legend',
    'result.probabilities': 'Probabilities',

    'err.empty': '{label} is empty',
    'err.duplicate': 'Duplicate {label} "{key}"',
    'err.numeric': 'A {label} made of digits only is moved to the front automatically, so this order cannot be saved',
    'label.item': 'Item name',
    'label.id': 'ID',
    'label.key': 'key',

  },
};

function savedLang() {
  try { return localStorage.getItem(LANG_KEY); } catch { return null; }
}

// the browser language unless the user chose one
const initial = savedLang() ?? (navigator.language?.toLowerCase().startsWith('ja') ? 'ja' : 'en');

export const i18n = {
  lang: messages[initial] ? initial : 'en',
  t(key, params = {}) {
    const text = messages[this.lang][key] ?? key;
    return text.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '');
  },
  // saved only when the user switches
  set(lang) {
    this.lang = lang;
    document.documentElement.lang = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch {}
  },
};

document.documentElement.lang = i18n.lang;
