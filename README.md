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

## Deployment

### Deploying to Vercel

1. **Push your code to GitHub/GitLab/Bitbucket.** Vercel connects directly to a Git provider, so make sure the latest changes are available in a remote repository.
2. **Create a new project in Vercel.** From the Vercel dashboard, click **Add New… → Project** and import the repository. Grant access if prompted.
3. **Confirm the build settings.** Vercel auto-detects Vite apps, but double-check:
   - **Framework Preset:** `Vite`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
   - **Node.js Version:** `18.x` (or later)
4. **Deploy.** Vercel installs dependencies, runs the build, and hosts the static output. The first deployment becomes your production environment; subsequent pushes create preview deployments per branch/PR.
5. **(Optional) Configure the domain.** Use the generated `*.vercel.app` URL or assign a custom domain from the Vercel dashboard once the deployment succeeds.

#### CLI Deploy (optional)

If you prefer the Vercel CLI:

```bash
npm install -g vercel
vercel login              # authenticate once
vercel                    # deploy to a preview environment
vercel --prod             # promote the current build to production
```

The CLI uses the same build/output defaults and stores configuration in `.vercel/project.json` after the first run.

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
