# Aisa — voice assistant

A voice-only conversational assistant: Gemini Live for speech, Search grounding,
and optional Google Drive context.

**Live:** https://misomalcek.github.io/aisa/

## Bring your own key

No API key is bundled and none is needed to load the app. Paste a Gemini key in
the UI to use it — it stays in the browser and is never committed here.

The Firebase values in `firebase-applet-config.json` are the web config, which is
public by design; access is governed by Firebase security rules rather than by
keeping the config secret.

## Running it

```
npm install
npm run dev
```

`npm run build` produces `dist/`, which is what the `gh-pages` branch serves.
