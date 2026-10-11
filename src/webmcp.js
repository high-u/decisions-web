// WebMCP tools: agents create, update and run scenarios, and control the model, the language and the theme.
// Tools use only the operations and the state that the app exposes (see "app" in registerWebMCP), as the UI does,
// so this file does not depend on the UI library.
// A tool never throws: a thrown message does not reach the agent, so failures are returned as { ok: false, error }.
// Arguments are checked here, since the browser does not enforce inputSchema.
import { TYPES, APP_MODEL, checkRequest, fromRequest, toRequest, validate } from './scenario.js';
import { LANGS, translate, errorText } from './messages.js';
import { notifyError } from './notify.js';
import { SAMPLES } from '../samples.js';

const THEMES = ['light', 'dark'];

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const fail = error => ({ ok: false, error });

const HELP = {
  overview: `A scenario in this app is the request body of the Jev (System One) API, POST /v1/systemone:
{"model": "...", "state": ..., "questions": {"<id>": {"type": "choice" | "score" | "noul", "instructions": "...", "criteria": ...}}}
The model evaluates the state against every question. Each question is evaluated independently, and its answer comes back under the same <id>.
- The <id> is not sent to the model. Write the complete question in \`instructions\`.
- Put the questions about the same state in one scenario. The API evaluates the questions of one request in parallel.
- \`model\` is optional here and is not used to run. create_tab sets "${APP_MODEL}" when it is left out; update_tab keeps the tab's \`model\` when it is left out. To send a scenario to the Jev API, set "model": "jev-latest" (required there).
- This app runs the Julia-1 model in the browser. Its answers have the same shape as the API's, and this app has a few extra limits (topic: app).
Topics: state, choice, score, noul, app, workflow. get_samples returns complete examples.`,
  state: `\`state\` is the content to evaluate. In this app it is either:
- a non-empty string, or
- a flat object of named text fields, such as {"message": "...", "refund_policy": "..."}. Every value is a string, and at least one is not empty.
Use named fields when the content has several parts (a message, a record, a policy), so that each part has a clear name.
To ask about one field, name it in \`instructions\` in backticks: "Does \`message\` request a refund?"`,
  choice: `\`choice\` picks one option from a set with no order.
"criteria": {"billing": "payments, charges, refunds", "technical": "bugs, errors, login problems"}
- Keys are the option names. Values are descriptions, or null when the key says enough.
- In this app (Julia-1), the model sees only the description when there is one, and the key otherwise. Write descriptions that stand on their own.
- 2 to 20 options (the API allows up to 255).
- Add an "other" or "none" option when the options may not cover every input.
- Answer: \`choice\` (the chosen key), \`probabilities\` (one per option), \`confidence\` (0 to 1).`,
  score: `\`score\` rates the state on ordered levels.
"criteria": ["calm", "frustrated but civil", "very angry"]
- Levels go from the lowest to the highest. 2 to 10 levels.
- Describe what each level means.
- Answer: \`score\` (the position on the levels, starting at 0; it can fall between two levels), \`legend\` (level number to description), \`probabilities\`, \`confidence\`.
- For a judgment that depends on several factors, ask one score per factor and combine the answers.`,
  noul: `\`noul\` returns the probability that a yes/no statement is true, from 0 to 1.
{"type": "noul", "instructions": "Does the customer request a refund?"}
- \`criteria\` is optional: {"true": "...", "false": "..."} says what yes and no mean.
- Answer: \`noul\` only, with no confidence. Near 1 is yes, near 0 is no, near 0.5 is uncertain.
- 0.5 does not mean "medium". To measure a degree, use score.
- State the condition precisely. Avoid vague words such as "strong".`,
  app: `Limits of this app, not of the API:
- state: a non-empty string, or a flat object whose values are strings, at least one not empty. Nested objects and arrays are not accepted.
- instructions: a non-empty string.
- choice descriptions: strings or null. score levels and noul criteria: strings.
- At least one question. choice: 2 to 20 options. score: 2 to 10 levels.
- Question ids, option keys and state field names are not empty.
- Keys made only of digits are moved to the front by JSON objects; a scenario whose order would change is not accepted.
- Input length per question, in tokens: 8192 in all (state, instructions and options), of which 512 for the instructions and the options. A longer input fails when it runs.
- Running needs the model (about 610 MB). get_app_state shows \`model.status\`; download_model starts the download.
- Tabs you create or update stay unsaved. The user saves them.`,
  workflow: `1. get_app_state: \`model.status\` must be \`ready\` to run.
2. list_tabs: see the open tabs. get_tab: read the scenario of one tab.
3. create_tab with a scenario, or update_tab to replace the scenario of a tab. The tab is shown to the user.
4. If the response has \`ok: false\`, fix the scenario as \`error\` says and call again.
5. run_tab: read \`answers\`.
6. If an answer looks wrong, make \`instructions\` and the descriptions more specific. A low \`confidence\` is a reason to ask the user.`,
};
const TOPICS = Object.keys(HELP);

// what to do when a scenario cannot run, by model status
const NOT_READY = {
  checking: 'The app is checking whether the model is downloaded. Call get_app_state again shortly.',
  none: 'The model is not downloaded. Call download_model, then wait until get_app_state shows "ready".',
  downloading: 'The model is downloading. Call get_app_state until it shows "ready".',
  downloadFailed: 'The model download failed. Call download_model to try again.',
  loading: 'The model is loading. Call get_app_state until it shows "ready".',
  loadFailed: 'The model could not be loaded. Call delete_model, then download_model.',
  inOtherTab: 'The model is in use in another tab of this app, so it cannot be used in this tab. Tell the user to close the other tab, then reload this page.',
};

const SCENARIO = {
  type: 'object',
  description: 'The Jev API request body: {"model": ..., "state": ..., "questions": {...}}. `model` is optional. See get_help.',
  properties: {
    model: { type: 'string' },
    state: { oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: { type: 'string' } }] },
    questions: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: { type: { type: 'string', enum: TYPES }, instructions: { type: 'string' }, criteria: {} },
        required: ['type', 'instructions'],
      },
    },
  },
  required: ['state', 'questions'],
};

const TAB_ID = { type: 'string', description: 'The tab id from list_tabs.' };

// errors of scenario.js in English, one per line, each with where it is in the scenario
const listErrors = errors => errors.map(e => `- ${e.at || '(scenario)'}: ${errorText('en', e)}`).join('\n');

// what is wrong with a scenario given to a tool: the checks of an opened file, but nested values are not accepted
function scenarioErrors(scenario) {
  if (scenario === undefined) return ['"scenario" is required: the Jev API request body, {"state": ..., "questions": {...}}. See get_help.'];
  const invalid = checkRequest(scenario, { nested: false });
  const errors = invalid.length ? invalid : validate(fromRequest(scenario));
  return errors.length ? [`The scenario was not applied. Fix these and call again:\n${listErrors(errors)}`] : [];
}

// messages of the Julia-1 encoder when the input is too long, and what to do
const TOO_LONG = {
  'State exceeds lossless context budget': 'The state is too long: a question takes 8192 tokens in all (state, instructions and options). Shorten the state, then call update_tab and run_tab again.',
  'Question/options exceed lossless head budget': 'The instructions and the options of a question are too long: they take 512 tokens at most. Shorten them, then call update_tab and run_tab again.',
  'Question/options exceed sequence budget': 'The instructions and the options of a question are too long. Shorten them, then call update_tab and run_tab again.',
};

function lastRun(app, tab) {
  const { run } = tab;
  if (!run) return null;
  // the result stays shown after the scenario is changed; inputChanged says it no longer matches the scenario
  const inputChanged = app.runChanged(tab);
  if (run.status === 'done') return { status: 'done', inputChanged, ms: run.ms, answers: run.response.answers };
  if (run.status === 'error') return { status: 'error', inputChanged, error: run.error };
  return { status: run.status, inputChanged };
}

function tools(app) {
  // the tab a tool works on, or the failure to return
  const findTab = tabId => {
    if (typeof tabId !== 'string' || !tabId) return { error: fail('"tabId" is required: the id of a tab from list_tabs.') };
    const tab = app.findTab(tabId);
    if (!tab) return { error: fail(`No tab has the id "${tabId}". Open tabs: ${app.tabs.map(tab => tab.id).join(', ') || 'none'}. Call list_tabs.`) };
    return { tab };
  };

  return [
    {
      name: 'get_help',
      description: 'Explains how to write a scenario for this app. A scenario is the request body of the Jev (System One) API. Read `overview` and `workflow` before creating or updating a tab.',
      inputSchema: {
        type: 'object',
        properties: { topic: { type: 'string', enum: TOPICS, description: 'Topic to read. Without it, `overview`.' } },
      },
      annotations: { readOnlyHint: true },
      execute: ({ topic = 'overview' }) => HELP[topic]
        ? { ok: true, topic, text: HELP[topic], topics: TOPICS }
        : fail(`Unknown topic "${topic}". Topics: ${TOPICS.join(', ')}.`),
    },
    {
      name: 'get_app_state',
      description: 'Returns the model status (`ready` means scenarios can run; while downloading, bytes loaded and total), the UI language and the theme.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => {
        const { status, loaded, total, error } = app.modelState;
        return {
          ok: true,
          model: { status, loaded, total, error: error ? translate('en', error) : null },
          language: app.language,
          theme: app.dark ? 'dark' : 'light',
        };
      },
    },
    {
      name: 'list_tabs',
      description: 'Lists the open tabs: id, name, whether it is shown, whether it has unsaved changes, whether its input has errors, and the status of its last run. get_tab returns the scenario and the answers of one tab.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({
        ok: true,
        tabs: app.tabs.map(tab => ({
          id: tab.id,
          name: tab.name,
          shown: tab.id === app.active?.id,
          unsaved: app.isDirty(tab),
          hasErrors: validate(tab.form).length > 0,
          lastRun: tab.run ? { status: tab.run.status, inputChanged: app.runChanged(tab) } : null,
        })),
      }),
    },
    {
      name: 'get_tab',
      description: 'Returns one tab: its scenario, the errors of its input if any (then the scenario may not show every row, and the tab cannot be saved or run), and the result of its last run.',
      inputSchema: { type: 'object', properties: { tabId: TAB_ID }, required: ['tabId'] },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: ({ tabId }) => {
        const { tab, error: noTab } = findTab(tabId);
        if (noTab) return noTab;
        const errors = validate(tab.form);
        return {
          ok: true,
          tab: {
            id: tab.id,
            name: tab.name,
            shown: tab.id === app.active?.id,
            unsaved: app.isDirty(tab),
            scenario: toRequest(tab.form),
            ...(errors.length ? { errors: listErrors(errors) } : {}),
            lastRun: lastRun(app, tab),
          },
        };
      },
    },
    {
      name: 'get_samples',
      description: 'Returns the sample scenarios as JSON. Without `language`, returns the samples of the current UI language. The response says which language it returned.',
      inputSchema: {
        type: 'object',
        properties: { language: { type: 'string', enum: LANGS, description: '`ja` or `en`. Without it, the current UI language.' } },
      },
      annotations: { readOnlyHint: true },
      execute: ({ language = app.language }) => LANGS.includes(language)
        ? { ok: true, language, samples: SAMPLES[language].map(sample => ({ name: sample.name, scenario: sample.request })) }
        : fail(`Unknown language "${language}". Use one of: ${LANGS.join(', ')}.`),
    },
    {
      name: 'create_tab',
      description: 'Opens a new tab with the given scenario and shows it. The tab is left unsaved; the user saves it. Without `name`, the tab is named as the New button names it. Without `model` in the scenario, it is set to "SupersonicLabs/Julia-1". See get_help for how to write a scenario.',
      inputSchema: {
        type: 'object',
        properties: { scenario: SCENARIO, name: { type: 'string', description: 'Tab name. `.json` is added when missing.' } },
        required: ['scenario'],
      },
      execute: ({ scenario, name }) => {
        if (name !== undefined && (typeof name !== 'string' || !name.trim())) return fail('"name" must be a non-empty string, or be left out.');
        const [error] = scenarioErrors(scenario);
        if (error) return fail(error);
        // unsaved until the user saves it: nothing the agent writes is in a file yet
        const tab = app.newTab({ name, form: fromRequest({ model: APP_MODEL, ...scenario }), unsaved: true });
        return { ok: true, tabId: tab.id, name: tab.name };
      },
    },
    {
      name: 'update_tab',
      description: 'Replaces the whole scenario of a tab and shows the tab. Without `model` in the scenario, the tab keeps its `model`. See get_help for how to write a scenario.',
      inputSchema: { type: 'object', properties: { tabId: TAB_ID, scenario: SCENARIO }, required: ['tabId', 'scenario'] },
      execute: ({ tabId, scenario }) => {
        const { tab, error: noTab } = findTab(tabId);
        if (noTab) return noTab;
        const [error] = scenarioErrors(scenario);
        if (error) return fail(error);
        app.setForm(tab, fromRequest({ model: tab.form.model, ...scenario }));
        app.showTab(tab);
        return { ok: true, tabId: tab.id, unsaved: app.isDirty(tab) };
      },
    },
    {
      name: 'run_tab',
      description: 'Runs the scenario of a tab, shows the tab, and returns the answers. The model must be `ready` (see get_app_state).',
      inputSchema: { type: 'object', properties: { tabId: TAB_ID }, required: ['tabId'] },
      annotations: { untrustedContentHint: true },
      execute: async ({ tabId }) => {
        const { tab, error: noTab } = findTab(tabId);
        if (noTab) return noTab;
        if (!app.canRun(tab)) return fail('This tab is already running. Call get_tab to see when it is done.');
        const { status } = app.modelState;
        if (status !== 'ready') return fail(`The model is not ready (status "${status}"). ${NOT_READY[status]}`);
        app.showTab(tab);
        const run = await app.runTab(tab);
        if (!run) return fail('This tab is already running. Call get_tab to see when it is done.');
        if (run.status === 'invalid') return fail(`The tab was not run: its input has errors. Fix them with update_tab, then call run_tab again:\n${listErrors(run.errors)}`);
        if (run.status !== 'done') return fail(`The run failed: ${run.error}${TOO_LONG[run.error] ? `\n${TOO_LONG[run.error]}` : ''}`);
        const { model: name, answers, usage } = run.response;
        return { ok: true, tabId: tab.id, ms: run.ms, model: name, answers, usage };
      },
    },
    {
      name: 'download_model',
      description: 'Starts downloading the model (about 610 MB) and returns at once. Check progress with get_app_state; the status becomes `ready` when the model is loaded.',
      inputSchema: { type: 'object', properties: {} },
      execute: () => {
        if (!app.canDownloadModel()) {
          return fail(`The model cannot be downloaded now: its status is "${app.modelState.status}". It can be downloaded only when the status is "none" or "downloadFailed".`);
        }
        app.downloadModel(); // not awaited: progress is read with get_app_state
        return { ok: true, status: app.modelState.status };
      },
    },
    {
      name: 'delete_model',
      description: 'Deletes the downloaded model from the browser. Running scenarios then needs the model downloaded again (about 610 MB). Use when the user asks.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { consequentialHint: true },
      execute: async () => {
        if (!app.canDeleteModel()) return fail(`There is no model to delete: its status is "${app.modelState.status}".`);
        await app.deleteModel();
        return { ok: true, status: app.modelState.status };
      },
    },
    {
      name: 'set_language',
      description: 'Sets the UI language. The choice is saved in the browser as the user\'s preference. Use when the user asks.',
      inputSchema: { type: 'object', properties: { language: { type: 'string', enum: LANGS } }, required: ['language'] },
      execute: ({ language }) => {
        if (!LANGS.includes(language)) return fail(`Unknown language "${language}". Use one of: ${LANGS.join(', ')}.`);
        app.setLang(language);
        return { ok: true, language };
      },
    },
    {
      name: 'set_theme',
      description: 'Sets the theme. The choice is saved in the browser as the user\'s preference. Use when the user asks.',
      inputSchema: { type: 'object', properties: { theme: { type: 'string', enum: THEMES } }, required: ['theme'] },
      execute: ({ theme }) => {
        if (!THEMES.includes(theme)) return fail(`Unknown theme "${theme}". Use one of: ${THEMES.join(', ')}.`);
        app.setDark(theme === 'dark');
        return { ok: true, theme };
      },
    },
  ];
}

// app: the app as the UI sees it (the reactive data of the "app" component), so that changes made by tools reach the page.
// Used: tabs, active, findTab, newTab, setForm, showTab, isDirty, canRun, runTab, runChanged, modelState, canDownloadModel,
// downloadModel, canDeleteModel, deleteModel, language, setLang, dark, setDark.
export function registerWebMCP(app) {
  const modelContext = document.modelContext;
  if (typeof modelContext?.registerTool !== 'function') return;
  for (const { execute, ...tool } of tools(app)) {
    const safe = async input => {
      try {
        return await execute(isObject(input) ? input : {});
      } catch (error) {
        return fail(`Unexpected error: ${error?.message ?? error}`);
      }
    };
    (async () => modelContext.registerTool({ ...tool, execute: safe }))()
      .catch(error => notifyError(translate(app.language, 'toast.webmcpFailed'), `${tool.name}: ${error.message}`));
  }
}
