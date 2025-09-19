# agents.md

## Project Overview
This project is a **ComfyUI Parallel Batch Simulator**, implemented as a **React + Tailwind (Vite)** single-page web app.  
Its purpose is to **simulate batch job submission** to an image-generation API under different pairing strategies:

- **One-to-Many**: One set of shared reference images + multiple prompts.
- **Zip**: Each prompt paired with a corresponding reference group (1:1).
- **Cartesian**: Each prompt paired with all reference groups (cross product). Explicit empty groups mean "text-only jobs".

The simulator runs **fully offline**:
- Reference images are mocked by gradient-colored placeholders.
- API calls are replaced by simulated latency and random success/failure.
- Results are displayed as cards with `OK:#index` placeholders.

---

## Build & Run

### Prerequisites
- Node.js 18+ (recommended)
- npm (or pnpm/yarn)

### Development
```bash
git clone git@github.com:<your-username>/comfy-parallel-sim.git
cd comfy-parallel-sim
npm install
npm run dev
````

App runs at [http://localhost:5173](http://localhost:5173).

### Production Build

```bash
npm run build
```

Output is in `dist/`.

### Deployment

* **Vercel / Cloudflare Pages / Netlify**: deploy `dist/` directly (build command: `npm run build`).
* No backend required, unless extended to call a real ComfyUI API.

---

## Implementation Details

### Core Features

* **Prompts Editor**: Multiline input (`ListEditor`), each line = one prompt.
* **Reference Groups**: Adjustable groups of mock image placeholders, each group size can be set manually.
* **Pairing Modes**:

  * One-to-Many: Shared refs reused for all prompts.
  * Zip: Min(prompts, groups) pairs.
  * Cartesian: Prompts × Groups; explicit empty groups → text-only jobs.

### Job Lifecycle

1. **Build Jobs** → `buildJobs()` creates job objects from prompts + refs.
2. **Submit** → Jobs become `Handle`s with `status: running`.
3. **Simulate Run** → Random latency + simulated success/failure.
4. **Collect** → Align results back to job order, filling missing ones.
5. **Results** → Display as placeholder cards, CSV export available.

### Concurrency Control

* Slider (`maxConcurrency`) sets number of parallel jobs.
* Promise pool (`runWithConcurrency`) manages async execution.

### Latency

* Two sliders define `latencyMinSec` & `latencyMaxSec`.
* Jobs randomly complete within this range.

### Testing

* Built-in **TestPanel** validates `buildJobs()` logic.
* Covers edge cases:

  * Empty prompts
  * Empty refs
  * Mismatch lengths
  * Explicit empty group in Cartesian mode

---

## File Structure

```
comfy-parallel-sim/
├── src/
│   ├── App.tsx         # Main simulator component (UI + state + logic)
│   ├── index.css       # Tailwind base + custom global CSS (light mode, selection, full-width fix)
│   ├── main.tsx        # React entrypoint
│   └── ...
├── index.html
├── package.json
├── tailwind.config.js
├── postcss.config.js
└── agents.md           # This file
```

---

## Extension Roadmap

Future improvements:

* Replace mock simulation with **real API integration** (upload refs, call ComfyUI backend).
* Add **job queue persistence** (database / cloud KV).
* Provide **streamed progress updates** (WebSocket/SSE).
* Multi-user auth and team dashboards.
* Deploy backend extensions via **Cloudflare Workers/Queues** or **Vercel Functions**.

---