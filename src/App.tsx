import React, { useState, useEffect } from "react";

/**
 * ComfyUI Parallel Batch Simulator (One-to-Many / Zip / Cartesian)
 * - 100% offline: reference images & results use text placeholders (no network requests)
 * - Full pipeline: Build → Submit (concurrency) → Collect → Results (OK:#index)
 * - Cartesian (updated): treat each per-prompt ref group as a WHOLE option (no implicit empty).
 *   · Example: prompts a/b/c; groups: [], [P2_1], [P3_1,P3_2]
 *     => a: ([], [P2_1], [P3_1,P3_2]), b: ([], [P2_1], [P3_1,P3_2]), c: ([], [P3_1,P3_2]) → 9 jobs when explicit empty exists
 *   · If you want a text-only job, set a group length to 0 explicitly (UI supports per-group count editing).
 * - Fallback: if no per-prompt groups provided, Cartesian uses sharedRefs per-image (legacy behavior)
 */

const PairingMode = {
  ONE_TO_MANY: "one-to-many",
  ZIP: "zip",
  CARTESIAN: "cartesian",
} as const;

type Mode = typeof PairingMode[keyof typeof PairingMode];

type Job = {
  index: number;
  prompt: string;
  refs: string[];
  payload?: Record<string, any>;
};

type Handle = {
  job_id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  job: Job;
  submit_ts: number;
  finish_ts?: number;
  result_placeholder?: string;
  error?: string;
};

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function hashCode(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}

function gradientStyleForRef(refId: string) {
  const hue = Math.abs(hashCode(refId)) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hue},70%,82%), hsl(${(hue + 40) % 360},70%,72%))`,
  } as React.CSSProperties;
}

function toArraySafe<T>(x: any, fallback: T[]): T[] {
  return Array.isArray(x) ? (x as T[]) : fallback;
}

function buildJobs({
  mode,
  sharedRefs,
  prompts,
  perPromptRefs,
  extraPayload,
}: {
  mode: Mode;
  sharedRefs?: string[];
  prompts: string[];
  perPromptRefs?: (string[] | undefined)[];
  extraPayload?: Record<string, any>;
}): Job[] {
  const jobs: Job[] = [];

  const cleanedSharedRefs = toArraySafe<string>(sharedRefs, []).filter(Boolean);
  const cleanedPerPrompt: string[][] = toArraySafe<(string[] | undefined)[]>(perPromptRefs, [])
    .map((g) => toArraySafe<string>(g, []));

  if (mode === PairingMode.ONE_TO_MANY) {
    prompts.forEach((p, idx) => {
      jobs.push({ index: idx, prompt: p, refs: cleanedSharedRefs, payload: extraPayload });
    });
    return jobs;
  }

  if (mode === PairingMode.ZIP) {
    const n = Math.min(prompts.length, cleanedPerPrompt.length);
    for (let i = 0; i < n; i++) {
      jobs.push({ index: i, prompt: prompts[i], refs: cleanedPerPrompt[i], payload: extraPayload });
    }
    return jobs;
  }

  // CARTESIAN (groups-as-whole; no implicit empty)
  {
    let idx = 0;

    if (cleanedPerPrompt.length > 0) {
      for (let i = 0; i < prompts.length; i++) {
        for (let g = 0; g < cleanedPerPrompt.length; g++) {
          const group = cleanedPerPrompt[g]; // may be empty => text-only (explicit)
          jobs.push({ index: idx++, prompt: prompts[i], refs: group, payload: extraPayload });
        }
      }
      return jobs;
    }

    // Fallback: no per-prompt -> shared per-image Cartesian
    for (let i = 0; i < prompts.length; i++) {
      for (let r = 0; r < cleanedSharedRefs.length; r++) {
        jobs.push({ index: idx++, prompt: prompts[i], refs: [cleanedSharedRefs[r]], payload: extraPayload });
      }
    }
    return jobs;
  }
}

function simulateSubmit(job: Job): Handle {
  const job_id = uid("job");
  return { job_id, status: "queued", job, submit_ts: Date.now() };
}

function simulateRunJob(
  handle: Handle,
  latencyMsRange: [number, number] = [300, 900],
  failRate = 0.06
): Promise<Handle> {
  const [min, max] = latencyMsRange;
  const ms = Math.floor(min + Math.random() * (max - min));
  return new Promise((resolve) => {
    setTimeout(() => {
      const failed = Math.random() < failRate;
      if (failed) {
        resolve({ ...handle, status: "failed", error: "Simulated error", finish_ts: Date.now() });
      } else {
        resolve({
          ...handle,
          status: "succeeded",
          result_placeholder: `OK:${handle.job.index}`,
          finish_ts: Date.now(),
        });
      }
    }, ms);
  });
}

async function runWithConcurrency<T, R>(
  items: T[],
  worker: (t: T) => Promise<R>,
  k = 3,
  onProgress?: (r: R) => void
) {
  const q = items.slice();
  const res: R[] = [];
  let inFlight = 0,
    i = 0;
  return await new Promise<R[]>((resolve) => {
    const pump = () => {
      while (inFlight < k && i < q.length) {
        const item = q[i++];
        inFlight++;
        worker(item)
          .then((r) => {
            res.push(r);
            onProgress?.(r);
          })
          .finally(() => {
            inFlight--;
            res.length === items.length ? resolve(res) : pump();
          });
      }
    };
    pump();
  });
}

/** ---------- UI ---------- */

function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="w-full bg-white rounded-2xl shadow p-4 border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 border border-gray-200">
      {children}
    </span>
  );
}

function ListEditor({
  label,
  items,
  setItems,
}: {
  label: string;
  items: string[];
  setItems: (v: string[]) => void;
}) {
  const [text, setText] = useState(items.join("\n"));
  useEffect(() => setText(items.join("\n")), [items]);
  return (
    <Section title={label} right={<Chip>{items.length} items</Chip>}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() =>
          setItems(
            text
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
          )
        }
        className="w-full h-36 rounded-xl border border-gray-200 p-3 focus:outline-none focus:ring"
        placeholder="One prompt per line"
      />
      <div className="mt-2 text-xs text-gray-500">
        Blur (click outside) to apply changes
      </div>
    </Section>
  );
}

function RefThumb({ id }: { id: string }) {
  return (
    <div
      className="aspect-[3/4] border rounded-xl overflow-hidden flex items-center justify-center"
      style={gradientStyleForRef(id)}
    >
      <div className="text-xs font-mono bg-white/70 px-2 py-1 rounded">{id}</div>
    </div>
  );
}

/** ---------- Tests ---------- */

function runBuildJobsTests(): { name: string; pass: boolean; detail?: string }[] {
  const tests: { name: string; pass: boolean; detail?: string }[] = [];
  const shared = ["S1", "S2"];
  const prompts = ["p1", "p2", "p3"];

  try {
    const out = buildJobs({
      mode: PairingMode.ONE_TO_MANY,
      sharedRefs: shared,
      prompts,
    });
    tests.push({
      name: "One-to-Many: 3 jobs with shared refs",
      pass: out.length === 3 && out.every((j) => j.refs.length === 2),
    });
  } catch (e: any) {
    tests.push({ name: "One-to-Many threw", pass: false, detail: String(e) });
  }

  try {
    const out = buildJobs({ mode: PairingMode.ZIP, prompts });
    tests.push({
      name: "Zip: perPromptRefs undefined -> 0 jobs",
      pass: out.length === 0,
    });
  } catch (e: any) {
    tests.push({ name: "Zip (undefined) threw", pass: false, detail: String(e) });
  }

  try {
    const per = [["A"], ["B", "C"], ["D"]];
    const out = buildJobs({
      mode: PairingMode.ZIP,
      prompts,
      perPromptRefs: per,
    });
    tests.push({
      name: "Zip: 3 jobs with per-group refs",
      pass: out.length === 3 && out[1].refs.length === 2,
    });
  } catch (e: any) {
    tests.push({ name: "Zip (groups) threw", pass: false, detail: String(e) });
  }

  try {
    const out = buildJobs({
      mode: PairingMode.CARTESIAN,
      prompts,
      sharedRefs: shared,
    });
    tests.push({
      name: "Cartesian: fallback to shared refs (3x2=6)",
      pass: out.length === 6,
    });
  } catch (e: any) {
    tests.push({
      name: "Cartesian (fallback) threw",
      pass: false,
      detail: String(e),
    });
  }

  try {
    const per = [[], ["B", "C"], ["D"]];
    const out = buildJobs({
      mode: PairingMode.CARTESIAN,
      prompts,
      perPromptRefs: per,
    });
    const textOnly = out.filter((j) => j.refs.length === 0).length;
    tests.push({
      name: "Cartesian: groups-as-whole (+explicit empty) 3x3=9",
      pass: out.length === 9 && textOnly === prompts.length,
    });
  } catch (e: any) {
    tests.push({
      name: "Cartesian (groups-as-whole) threw",
      pass: false,
      detail: String(e),
    });
  }

  try {
    const out = buildJobs({
      mode: PairingMode.ONE_TO_MANY,
      prompts: [],
      sharedRefs: shared,
    });
    tests.push({ name: "Edge: empty prompts -> 0", pass: out.length === 0 });
  } catch (e: any) {
    tests.push({
      name: "Edge (empty prompts) threw",
      pass: false,
      detail: String(e),
    });
  }

  try {
    const out = buildJobs({
      mode: PairingMode.ZIP,
      prompts: ["p1", "p2", "p3", "p4"],
      perPromptRefs: [["r1"], ["r2"]],
    });
    tests.push({
      name: "Zip: mismatch uses min length",
      pass: out.length === 2,
    });
  } catch (e: any) {
    tests.push({
      name: "Zip (mismatch) threw",
      pass: false,
      detail: String(e),
    });
  }

  try {
    const out = buildJobs({
      mode: PairingMode.CARTESIAN,
      prompts: ["a", "b"],
      sharedRefs: [],
    });
    tests.push({ name: "Cartesian: no refs -> 0", pass: out.length === 0 });
  } catch (e: any) {
    tests.push({
      name: "Cartesian (no refs) threw",
      pass: false,
      detail: String(e),
    });
  }

  try {
    const out = buildJobs({
      mode: PairingMode.ONE_TO_MANY,
      prompts: ["x", "y"],
      sharedRefs: [],
    });
    tests.push({
      name: "One-to-Many: 2 jobs with 0 refs",
      pass: out.length === 2 && out.every((j) => j.refs.length === 0),
    });
  } catch (e: any) {
    tests.push({
      name: "One-to-Many (0 refs) threw",
      pass: false,
      detail: String(e),
    });
  }

  return tests;
}

function TestPanel() {
  const [results, setResults] = useState<
    { name: string; pass: boolean; detail?: string }[]
  >([]);
  useEffect(() => {
    setResults(runBuildJobsTests());
  }, []);
  return (
    <Section title="Tests: buildJobs()">
      <button
        className="px-3 py-1.5 rounded-xl bg-gray-900 text-white text-sm mb-3"
        onClick={() => setResults(runBuildJobsTests())}
      >
        Run Tests
      </button>
      <ul className="space-y-1 text-sm">
        {results.map((t, i) => (
          <li key={i} className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded-full text-xs ${
                t.pass
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {t.pass ? "PASS" : "FAIL"}
            </span>
            <span>{t.name}</span>
            {t.detail && <span className="text-red-600">— {t.detail}</span>}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>(PairingMode.ONE_TO_MANY);

  const [sharedRefs, setSharedRefs] = useState<string[]>([]);
  const [prompts, setPrompts] = useState<string[]>([
    "street style, soft daylight",
    "museum interior, reflections",
    "urban dusk, neon bokeh",
  ]);
  const [perPromptRefs, setPerPromptRefs] = useState<string[][]>([[], [], []]);

  const [latencyMinSec, setLatencyMinSec] = useState<number>(1);
  const [latencyMaxSec, setLatencyMaxSec] = useState<number>(5);
  const clampLatency = (minS: number, maxS: number) => {
    let a = Math.max(0, Math.min(60, Math.round(minS)));
    let b = Math.max(0, Math.min(60, Math.round(maxS)));
    if (a > b) [a, b] = [b, a];
    setLatencyMinSec(a);
    setLatencyMaxSec(b);
  };

  const [globalGroupCount, setGlobalGroupCount] = useState<number>(2);
  const makePlaceholders = (groupIdx: number, count: number) =>
    Array.from({ length: Math.max(0, count) }, (_, i) => `P${groupIdx + 1}_${i + 1}`);

  useEffect(() => {
    setPerPromptRefs((prev) => {
      const next = prev.slice(0, prompts.length);
      while (next.length < prompts.length) next.push([]);
      return next;
    });
  }, [prompts.length]);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [handles, setHandles] = useState<Handle[]>([]);
  const [results, setResults] = useState<Handle[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [maxConcurrency, setMaxConcurrency] = useState<number>(3);
  const [autoCollect, setAutoCollect] = useState<boolean>(true);

  function loadSampleShared() {
    setSharedRefs(["REF_A", "REF_B", "REF_C", "REF_D"]);
  }
  function loadSamplePerPrompt() {
    setPerPromptRefs([
      makePlaceholders(0, globalGroupCount),
      makePlaceholders(1, globalGroupCount),
      makePlaceholders(2, globalGroupCount),
    ]);
  }

  function syncGroupsToPrompts(fill = false) {
    setPerPromptRefs((prev) => {
      const next = prev.slice(0, prompts.length);
      while (next.length < prompts.length) next.push([]);
      if (fill) {
        return next.map((g, i) =>
          g.length === 0 ? makePlaceholders(i, globalGroupCount) : g
        );
      }
      return next;
    });
  }

  function onBuildJobs() {
    const j = buildJobs({
      mode,
      sharedRefs,
      prompts,
      perPromptRefs,
      extraPayload: { size: "768x1024" },
    });
    setJobs(j);
    setHandles([]);
    setResults([]);
  }

  async function onSubmit() {
    if (!jobs.length) return;
    setSubmitting(true);
    const queued: Handle[] = jobs.map((job) => ({
      ...simulateSubmit(job),
      status: "running",
    }));
    setHandles(queued);

    const worker = async (h: Handle) => {
      const finished = await simulateRunJob(h, [
        latencyMinSec * 1000,
        latencyMaxSec * 1000,
      ]);
      setResults((prev) => {
        const exists = prev.find((x) => x.job_id === finished.job_id);
        if (exists) return prev.map((x) => (x.job_id === finished.job_id ? finished : x));
        return [...prev, finished];
      });
      return finished;
    };

    await runWithConcurrency(queued, worker, maxConcurrency);
    setSubmitting(false);
    if (autoCollect) await onCollect();
  }

  async function onCollect() {
    setCollecting(true);
    const byIndex: Record<number, Handle> = {};
    results.forEach((r) => {
      byIndex[r.job.index] = r;
    });
    const aligned: Handle[] = jobs.map(
      (j) =>
        byIndex[j.index] || {
          job_id: `pending_${j.index}`,
          status: "queued",
          job: j,
          submit_ts: Date.now(),
        }
    );
    setResults(aligned);
    await new Promise((r) => setTimeout(r, 200));
    setCollecting(false);
  }

  function exportCSV() {
    const rows = [
      ["index", "job_id", "status", "prompt", "refs_count", "submit_ts", "finish_ts", "error", "result"],
    ];
    const list = results.length ? results : handles;
    list.forEach((it) => {
      rows.push([
        String(it.job.index ?? ""),
        it.job_id ?? "",
        it.status ?? "",
        (it.job.prompt || "").replace(/\n/g, " "),
        String(it.job.refs ? it.job.refs.length : 0),
        it.submit_ts ? new Date(it.submit_ts).toISOString() : "",
        it.finish_ts ? new Date(it.finish_ts).toISOString() : "",
        it.error || "",
        it.result_placeholder || "",
      ]);
    });
    const csv = rows
      .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `status_${new Date().toISOString().slice(0, 19)}.csv`;
    a.click();
  }

  const totalSucceeded = results.filter((r) => r.status === "succeeded").length;
  const totalFailed = results.filter((r) => r.status === "failed").length;

  return (
    <div className="w-full max-w-screen-2xl mx-auto p-6">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">ComfyUI Parallel Batch Simulator</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm">Pairing Mode:</span>
          <div className="bg-white rounded-2xl shadow border border-gray-100 p-1 flex">
            {Object.values(PairingMode).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 rounded-2xl text-sm ${
                  mode === m ? "bg-gray-900 text-white" : "hover:bg-gray-100"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-7 space-y-4 min-w-0">
          {mode === PairingMode.ONE_TO_MANY && (
            <Section
              title="Shared Reference Images (Placeholders)"
              right={
                <button
                  className="px-3 py-1.5 rounded-xl bg-gray-900 text-white text-sm"
                  onClick={loadSampleShared}
                >
                  Load Samples
                </button>
              }
            >
              <div className="grid grid-cols-6 gap-3">
                {sharedRefs.map((id, i) => (
                  <RefThumb key={i} id={id} />
                ))}
                {sharedRefs.length === 0 && (
                  <div className="col-span-6 text-sm text-gray-500">
                    Empty — click Load Samples
                  </div>
                )}
              </div>
            </Section>
          )}

          {mode !== PairingMode.ONE_TO_MANY && (
            <Section
              title="Per-Prompt Reference Groups (Placeholders)"
              right={
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <span>Images per group</span>
                    <input
                      type="number"
                      min={0}
                      max={12}
                      value={globalGroupCount}
                      onChange={(e) =>
                        setGlobalGroupCount(
                          Math.max(0, Math.min(12, Number(e.target.value)))
                        )
                      }
                      className="w-16 border rounded px-2 py-1 text-sm"
                    />
                  </label>
                  <button
                    className="px-3 py-1.5 rounded-xl bg-gray-900 text-white text-sm"
                    onClick={() => syncGroupsToPrompts(true)}
                  >
                    Sync to Prompts & Fill
                  </button>
                </div>
              }
            >
              <div className="grid grid-cols-3 gap-3">
                {perPromptRefs.map((group, idx) => (
                  <div key={idx} className="bg-white border rounded-2xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium">
                        Prompt #{idx + 1} Refs
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={12}
                          value={group.length}
                          onChange={(e) => {
                            const n = Math.max(
                              0,
                              Math.min(12, Number(e.target.value))
                            );
                            setPerPromptRefs((prev) =>
                              prev.map((g, gi) =>
                                gi === idx
                                  ? Array.from(
                                      { length: n },
                                      (_, i) => `P${idx + 1}_${i + 1}`
                                    )
                                  : g
                              )
                            );
                          }}
                          className="w-16 border rounded px-2 py-1 text-xs"
                          title="Set image count for this group"
                        />
                        <Chip>{group.length}</Chip>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      {group.map((id, i) => (
                        <RefThumb key={i} id={id} />
                      ))}
                      {group.length === 0 && (
                        <div className="col-span-2 text-xs text-gray-500">
                          Empty
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <ListEditor label="Prompts" items={prompts} setItems={setPrompts} />
        </div>

        <div className="col-span-5 space-y-4 min-w-0">
          <Section title="BatchJobBuilder → Jobs">
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={onBuildJobs}
                className="px-3 py-1.5 rounded-xl bg-gray-900 text-white text-sm"
              >
                Build Jobs
              </button>
              <Chip>{jobs.length} jobs</Chip>
            </div>
            <div className="max-h-56 overflow-auto border rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left p-2">#</th>
                    <th className="text-left p-2">Prompt</th>
                    <th className="text-left p-2">Refs</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.index} className="border-t">
                      <td className="p-2 align-top">{j.index}</td>
                      <td
                        className="p-2 align-top max-w-[240px] truncate"
                        title={j.prompt}
                      >
                        {j.prompt}
                      </td>
                      <td className="p-2 align-top">{j.refs?.length || 0}</td>
                    </tr>
                  ))}
                  {jobs.length === 0 && (
                    <tr>
                      <td className="p-3 text-gray-500" colSpan={3}>
                        No jobs yet. Click "Build Jobs".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="AsyncSubmitter (offline)">
            <div className="space-y-3 mb-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm">Concurrency</span>
                  <input
                    type="range"
                    min={1}
                    max={8}
                    value={maxConcurrency}
                    onChange={(e) => setMaxConcurrency(Number(e.target.value))}
                    className="w-64 max-w-full"
                  />
                  <Chip>{maxConcurrency}</Chip>
                </div>
                <label className="flex items-center gap-2 text-sm ml-auto">
                  <input
                    type="checkbox"
                    checked={autoCollect}
                    onChange={(e) => setAutoCollect(e.target.checked)}
                  />{" "}
                  Auto-Collect
                </label>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">Latency (s)</span>
                  <Chip>
                    {latencyMinSec}s – {latencyMaxSec}s
                  </Chip>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs w-10 shrink-0">Min</label>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    value={latencyMinSec}
                    onChange={(e) =>
                      clampLatency(Number(e.target.value), latencyMaxSec)
                    }
                    className="flex-1 min-w-[160px]"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs w-10 shrink-0">Max</label>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    value={latencyMaxSec}
                    onChange={(e) =>
                      clampLatency(latencyMinSec, Number(e.target.value))
                    }
                    className="flex-1 min-w-[160px]"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                disabled={!jobs.length || submitting}
                onClick={onSubmit}
                className={`px-3 py-1.5 rounded-xl text-sm ${
                  submitting ? "bg-gray-300" : "bg-gray-900 text-white"
                }`}
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
              <button
                onClick={onCollect}
                className={`px-3 py-1.5 rounded-xl text-sm ${
                  collecting ? "bg-gray-300" : "bg-gray-100"
                }`}
              >
                {collecting ? "Collecting…" : "Collect Results"}
              </button>
              <button
                onClick={exportCSV}
                className="px-3 py-1.5 rounded-xl bg-gray-100 text-sm"
              >
                Export CSV
              </button>
            </div>

            <div className="mt-3 text-sm text-gray-600">Queue & Progress</div>
            <div className="max-h-56 overflow-auto border rounded-xl mt-1">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left p-2">#</th>
                    <th className="text-left p-2">Job ID</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Prompt</th>
                    <th className="text-left p-2">Refs</th>
                  </tr>
                </thead>
                <tbody>
                  {(results.length ? results : handles).map((h) => (
                    <tr key={h.job_id} className="border-t">
                      <td className="p-2 align-top">{h.job.index}</td>
                      <td className="p-2 align-top font-mono text-xs">
                        {h.job_id}
                      </td>
                      <td className="p-2 align-top">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            h.status === "succeeded"
                              ? "bg-green-100 text-green-800"
                              : h.status === "failed"
                              ? "bg-red-100 text-red-800"
                              : h.status === "running"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100"
                          }`}
                        >
                          {h.status || "-"}
                        </span>
                      </td>
                      <td
                        className="p-2 align-top max-w-[220px] truncate"
                        title={h.job.prompt}
                      >
                        {h.job.prompt}
                      </td>
                      <td className="p-2 align-top">{h.job.refs?.length || 0}</td>
                    </tr>
                  ))}
                  {results.length === 0 && handles.length === 0 && (
                    <tr>
                      <td className="p-3 text-gray-500" colSpan={5}>
                        No handles yet. Submit to see queue and progress.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-sm">
              Succeeded: <b>{totalSucceeded}</b> · Failed: <b>{totalFailed}</b> ·
              Total: <b>{results.length || handles.length || 0}</b>
            </div>
          </Section>

          <Section title="ResultCollector → Outputs (offline)">
            <div className="grid grid-cols-3 gap-3">
              {(results.length ? results : []).map((r) => (
                <div key={r.job_id} className="border rounded-2xl overflow-hidden">
                  <div
                    className="aspect-[3/4] flex items-center justify-center"
                    style={gradientStyleForRef(
                      r.job.refs[0] || `IDX_${r.job.index}`
                    )}
                  >
                    <div className="text-sm font-mono bg-white/80 px-2 py-1 rounded">
                      {r.status === "succeeded"
                        ? r.result_placeholder
                        : r.status}
                    </div>
                  </div>
                  <div className="p-2 text-xs">
                    <div className="truncate" title={r.job.prompt}>
                      <span className="text-gray-500">Prompt:</span> {r.job.prompt}
                    </div>
                    <div className="text-gray-500">
                      Refs: {r.job.refs?.length || 0}
                    </div>
                    {r.error && <div className="text-red-600">{r.error}</div>}
                  </div>
                </div>
              ))}
              {!results.length && (
                <div className="col-span-3 text-sm text-gray-500">
                  No results yet. Submit and collect to preview.
                </div>
              )}
            </div>
          </Section>

          <TestPanel />
        </div>
      </div>
    </div>
  );
}
