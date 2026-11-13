// Runs long jobs a few milliseconds per frame, so building the world never causes a stutter.
// A job is a generator that `yield`s between small steps. Jobs run in the order they were added
// (nearest road section first). The interface is message-shaped (add / run / onDone) so the same
// jobs can move into a Web Worker in Phase 5 without changing their callers.
export class Scheduler {
  constructor(budgetMs = 5) {
    this.budget = budgetMs;
    this.jobs = new Map();
    this.stats = {lastMs: 0, worstStep: 0, finished: 0};
    this.typical = 1;   // running average of one step, in ms
  }
  add(key, generator, onDone) { this.jobs.set(key, {generator, onDone}); }
  has(key) { return this.jobs.has(key); }
  /** Finish every queued job now and hand each result to `fn` (used when everything is rebuilt). */
  drain(fn) { for (const [, job] of this.jobs) { let st; while (!(st = job.generator.next()).done); fn(st.value); } this.jobs.clear(); }
  get size() { return this.jobs.size; }

  /** Call once per frame. Works through jobs until the time budget is used. It does at least one step,
   *  then only starts another if a typical step still fits, so frames rarely run over the budget. */
  run() {
    if (!this.jobs.size) { this.stats.lastMs = 0; return; }
    const t0 = performance.now();
    let worst = 0, steps = 0;
    // road sections come before the far land: a section of road you are about to reach matters most
    const order = [...this.jobs].sort((a, b) => (a[0] === 'far') - (b[0] === 'far'));
    outer: for (const [key, job] of order) {
      for (;;) {
        const now = performance.now();
        if (steps > 0 && now - t0 + this.typical > this.budget) break outer;
        const step = job.generator.next(), took = performance.now() - now;
        steps++; this.typical = this.typical * .9 + took * .1;
        if (took > worst) worst = took;
        if (step.done) { this.jobs.delete(key); this.stats.finished++; job.onDone(step.value); break; }
      }
    }
    this.stats.lastMs = performance.now() - t0;
    this.stats.worstStep = Math.max(this.stats.worstStep * 0.995, worst);
  }
}
