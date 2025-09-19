# ComfyUI Parallel Batch Simulator

Offline playground for experimenting with batch submission strategies against a ComfyUI-style image generation API. The simulator is built with **React**, **TypeScript**, **Vite**, and **Tailwind CSS**, and runs entirely in the browser without hitting external services.

> See `agents.md` for a deeper implementation brief.

## Features
- Pairing modes for prompt/reference batching: `one-to-many`, `zip`, and `cartesian` with explicit empty groups.
- Adjustable prompt lists, reference groups, latency ranges, and concurrency to mimic different production workloads.
- Full job lifecycle simulation with queueing, running, randomized success/failure, and CSV export of results.
- Gradient placeholders to stand in for reference images so the app stays 100% offline.
- Built-in `TestPanel` to exercise `buildJobs()` edge cases without leaving the UI.

## Getting Started

### Prerequisites
- Node.js 18 or newer
- npm (bundled with Node.js)

### Installation
```bash
git clone git@github.com:<your-username>/comfy-parallel-sim.git
cd comfy-parallel-sim
npm install
```

### Local Development
```bash
npm run dev
```

The dev server starts on [http://localhost:5173](http://localhost:5173) with hot module replacement enabled.

## Available Scripts
- `npm run dev` – launch the Vite dev server.
- `npm run build` – type-check via `tsc -b` and produce a production build in `dist/`.
- `npm run preview` – serve the build output locally for smoke testing.
- `npm run lint` – run ESLint across the project.

## Using the Simulator
- **Prompts Editor** – multiline editor where each line becomes a prompt input.
- **Reference Groups** – configure mock image groups per prompt or as shared references; empty groups create text-only jobs.
- **Pairing Mode Selector** – switch between `one-to-many`, `zip`, and `cartesian`; cartesian mode falls back to shared references when per-prompt groups are absent.
- **Controls** – sliders for `maxConcurrency`, minimum/maximum latency (in seconds), failure rate, and toggles for auto-collecting results.
- **Run Flow** – `Build Jobs` ➝ `Submit` (simulated concurrency) ➝ `Collect Results`; export the current state as CSV for quick inspection.
- **TestPanel** – rerun predefined checks that assert expected `buildJobs()` behavior against edge cases.

## Project Structure

```
comfy-parallel-sim/
├── src/
│   ├── App.tsx         # Main simulator UI + state + simulation logic
│   ├── main.tsx        # React bootstrap
│   ├── index.css       # Tailwind base styles and custom tweaks
│   └── ...             # Assets and helper modules
├── index.html
├── agents.md           # Product brief / feature overview
├── package.json
├── tailwind.config.js
├── postcss.config.js
└── vite.config.ts
```

## Roadmap Ideas
- Swap the simulated pipeline for real ComfyUI API calls.
- Persist job queues/results via a backing store (Cloudflare KV, Supabase, etc.).
- Stream progress updates with WebSockets or Server-Sent Events.
- Extend the UI for multi-user collaboration and team dashboards.

## License

This project is licensed under the MIT License. See `LICENSE` for details.
