# Decisions Web

- Runs Julia-1, a Decisions Model, in the browser.
- Works in a structure modeled on TypeSafe's Jev (System One).
- The model (about 610 MB) is stored in the browser's Cache Storage.
- Exposes WebMCP tools so that AI agents can operate the app.

## Usage

```sh
npm install
npm run dev
```

- The app works only in a secure context: HTTPS, or `localhost` for development.
- In Chrome 151, the WebMCP tools are not registered when the app is opened at `127.0.0.1`.
- A downloaded model is stored per origin.
