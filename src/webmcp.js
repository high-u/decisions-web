// WebMCP tools: agents create, update and run scenarios, and control the model, the language and the theme.
// Tools use only the operations and the state that the app exposes (see "app" in registerWebMCP), as the UI does,
// so this file does not depend on the UI library. See docs/webmcp.md.
// A tool never throws: a thrown message does not reach the agent, so failures are returned as { ok: false, error }.
// Arguments are checked here, since the browser does not enforce inputSchema.
import { TYPES, checkRequest, fromRequest, toRequest } from './scenario.js';
import { SAMPLES } from '../samples.js';

const LANGS = ['ja', 'en'];
const THEMES = ['light', 'dark'];

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const fail = error => ({ ok: false, error });

const HELP = {
  overview: `A scenario in this app is the request body of the Jev (System One) API, POST /v1/systemone, without \`model\`:
{"state": ..., "questions": {"<id>": {"type": "choice" | "score" | "noul", "instructions": "...", "criteria": ...}}}
The model evaluates the state against every question. Each question is evaluated independently, and its answer comes back under the same <id>.
- The <id> is not sent to the model. Write the complete question in \`instructions\`.
- Put the questions about the same state in one scenario. The API evaluates the questions of one request in parallel.
- To send a scenario to the Jev API, add "model": "jev-latest" (required there).
- This app runs the Julia-1 model in the browser. Its answers have the same shape as the API's, and this app has a few extra limits (topic: app).
Topics: state, choice, score, noul, app, workflow. get_samples returns complete examples.`,
  state: `\`state\` is the content to evaluate. In this app it is either:
- a string, or
- a flat object of named text fields, such as {"message": "...", "refund_policy": "..."}. Every value is a string.
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
- state: a string, or a flat object whose values are strings.
- instructions: a non-empty string.
- choice descriptions: strings or null. score levels and noul criteria: strings.
- At least one question.
- Question ids, option keys and state field names are not empty.
- Avoid keys made only of digits: JSON objects move them to the front, so their order is not kept.
- Running needs the model (about 610 MB). get_app_state shows \`model.status\`; download_model starts the download.
- Tabs you create or update stay unsaved. The user saves them.`,
  workflow: `1. get_app_state: \`model.status\` must be \`ready\` to run.
2. get_tabs: see the open tabs and their scenarios.
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
};

const SCENARIO = {
  type: 'object',
  description: 'The Jev API request body without "model": {"state": ..., "questions": {...}}. See get_help.',
  properties: {
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

const TAB_ID = { type: 'string', description: 'The tab id from get_tabs.' };

const invalid = errors => fail(`The scenario was not applied. Fix these and call again:\n${errors.join('\n')}`);

function lastRun(run) {
  if (!run) return null;
  if (run.status === 'done') return { status: 'done', ms: run.ms, answers: run.response.answers };
  if (run.status === 'error') return { status: 'error', error: run.error };
  return { status: run.status };
}

function tools(app) {
  const noTab = tabId =>
    fail(`No tab has the id "${tabId}". Open tabs: ${app.tabs.map(tab => tab.id).join(', ') || 'none'}. Call get_tabs.`);

  return [
    {
      name: 'get_help',
      description: 'Explains how to write a scenario for this app. A scenario is the request body of the Jev (System One) API without `model`. Read `overview` and `workflow` before creating or updating a tab.',
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
          model: { status, loaded, total, error: error || null },
          language: app.language,
          theme: app.dark ? 'dark' : 'light',
        };
      },
    },
    {
      name: 'get_tabs',
      description: 'Returns every open tab: id, name, whether it is shown, whether it has unsaved changes, its scenario, and the result of its last run.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({
        ok: true,
        tabs: app.tabs.map(tab => ({
          id: tab.id,
          name: tab.name,
          shown: tab.id === app.active?.id,
          unsaved: app.isDirty(tab),
          scenario: toRequest(tab.form),
          lastRun: lastRun(tab.run),
        })),
      }),
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
      description: 'Opens a new tab with the given scenario and shows it. The tab is left unsaved; the user saves it. Without `name`, the tab is named as the New button names it. See get_help for how to write a scenario.',
      inputSchema: {
        type: 'object',
        properties: { scenario: SCENARIO, name: { type: 'string', description: 'Tab name. `.json` is added when missing.' } },
        required: ['scenario'],
      },
      execute: ({ scenario, name }) => {
        if (name !== undefined && (typeof name !== 'string' || !name.trim())) return fail('"name" must be a non-empty string, or be left out.');
        const errors = checkRequest(scenario);
        if (errors.length) return invalid(errors);
        // unsaved until the user saves it: nothing the agent writes is in a file yet
        const tab = app.newTab({ name, form: fromRequest(scenario), unsaved: true });
        return { ok: true, tabId: tab.id, name: tab.name };
      },
    },
    {
      name: 'update_tab',
      description: 'Replaces the whole scenario of a tab and shows the tab. See get_help for how to write a scenario.',
      inputSchema: { type: 'object', properties: { tabId: TAB_ID, scenario: SCENARIO }, required: ['tabId', 'scenario'] },
      execute: ({ tabId, scenario }) => {
        const tab = app.findTab(tabId);
        if (!tab) return noTab(tabId);
        const errors = checkRequest(scenario);
        if (errors.length) return invalid(errors);
        app.setForm(tab, fromRequest(scenario));
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
        const tab = app.findTab(tabId);
        if (!tab) return noTab(tabId);
        if (!app.canRun(tab)) return fail('This tab is already running. Call get_tabs to see when it is done.');
        const { status } = app.modelState;
        if (status !== 'ready') return fail(`The model is not ready (status "${status}"). ${NOT_READY[status]}`);
        app.showTab(tab);
        const run = await app.runTab(tab);
        if (!run) return fail('This tab is already running. Call get_tabs to see when it is done.');
        if (run.status !== 'done') return fail(run.error);
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
// Used: tabs, active, findTab, newTab, setForm, showTab, isDirty, canRun, runTab, modelState, canDownloadModel,
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
      .catch(error => console.error(`WebMCP: could not register ${tool.name}`, error));
  }
}
