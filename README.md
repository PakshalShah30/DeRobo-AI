# DeRobo AI

A polished, responsive AI writing humanizer interface. Paste writing, select a style and humanization intensity, then produce a more natural draft while preserving the original intent.

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

> The current humanizer runs in the browser with conservative phrase and flow transformations. For production-grade semantic guarantees, connect the `humanize()` function in `app.js` to a server-side language model and add evaluation tests for meaning preservation.
