import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test('profiles a seeded city at 4x with a busy network', async ({ page }, testInfo) => {
  await page.goto('/');
  // Real interaction prepares audio on the menu, as in normal play.
  await page.mouse.click(5, 5);
  const setup = await page.evaluate(
    ({ siteCount, settled }) => {
      const store = window.__game;
      store.getState().newGame({
        companyName: 'Performance lab',
        logo: 'x',
        difficulty: 'standard',
        cityName: 'Marmara',
        seed: 4242,
      });
      let g = store.getState().game;
      store.setState({
        game: {
          ...g,
          speed: 0,
          money: 100000000,
          tutorialDone: true,
          districts: g.districts.map((d) => ({ ...d, unlocked: true })),
        },
        autoConnect: true,
      });
      g = store.getState().game;
      const cells = g.districts
        .flatMap((d) => d.cells)
        .filter((c) => !g.nodes.some((n) => n.gx === c.gx && n.gy === c.gy));
      for (const c of cells.slice(0, siteCount)) store.getState().placeNode('access', c.gx, c.gy);
      store.getState().cancelBuild();
      if (settled) {
        const live = store.getState().game;
        store.setState({
          game: {
            ...live,
            minutes: 1430,
            autosaveAt: 0,
            buildings: live.buildings.map((b) => ({ ...b, connected: 0.65 })),
            districts: live.districts.map((d) => ({ ...d, coverage: 0.75 })),
          },
        });
      }
      return {
        buildings: g.buildings.length,
        nodes: store.getState().game.nodes.length,
        links: store.getState().game.links.length,
      };
    },
    { siteCount: Number(process.env.PERF_SITES ?? 40), settled: process.env.PERF_SETTLED === '1' },
  );
  await expect(page.getByRole('application', { name: /Interactive telecom network map/ })).toBeVisible();
  const client = await page.context().newCDPSession(page);
  const cpuSlowdown = Number(process.env.PERF_CPU_RATE ?? 4);
  await client.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown });
  await client.send('Performance.enable');
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  if (process.env.PERF_PROFILE) await client.send('Profiler.enable');
  if (process.env.PERF_PROFILE) await client.send('Profiler.start');
  const before = await client.send('Performance.getMetrics');
  const metrics = await page.evaluate(
    async ({ duration, pan }) => {
      const store = window.__game;
      const frames: number[] = [],
        longTasks: number[] = [],
        ticks: number[] = [];
      const slowEvents: Array<{ kind: string; duration: number; at: number; minute: number }> = [];
      const sampleStart = performance.now();
      let last = performance.now(),
        running = true;
      const map = document.querySelector('svg.map-surface')!;
      const box = map.getBoundingClientRect();
      const pointer = (type: string, x: number, y: number) =>
        map.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            isPrimary: true,
            pointerId: 99,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: x,
            clientY: y,
          }),
        );
      if (pan) pointer('pointerdown', box.x + box.width * 0.7, box.y + box.height * 0.3);
      const frame = (now: number) => {
        frames.push(now - last);
        last = now;
        if (pan && running)
          pointer(
            'pointermove',
            box.x + box.width * 0.7 + Math.sin(now / 800) * 70,
            box.y + box.height * 0.3 + Math.cos(now / 1100) * 45,
          );
        if (running) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      const observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          longTasks.push(e.duration);
          slowEvents.push({
            kind: 'longtask',
            duration: e.duration,
            at: e.startTime - sampleStart,
            minute: store.getState().game.minutes,
          });
        }
      });
      observer.observe({ type: 'longtask', buffered: false });
      const original = store.getState().tick;
      store.setState({
        tick: () => {
          const at = performance.now();
          original();
          const duration = performance.now() - at;
          ticks.push(duration);
          if (duration > 40)
            slowEvents.push({ kind: 'tick', duration, at: at - sampleStart, minute: store.getState().game.minutes });
        },
      });
      const startMinutes = store.getState().game.minutes;
      store.getState().setSpeed(4);
      await new Promise((r) => setTimeout(r, duration));
      store.getState().setSpeed(0);
      running = false;
      if (pan) pointer('pointerup', box.x + box.width * 0.7, box.y + box.height * 0.3);
      observer.disconnect();
      store.setState({ tick: original });
      const percentile = (a: number[], p: number) =>
        [...a].sort((a, b) => a - b)[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
      return {
        frames: frames.length,
        frameP95: percentile(frames, 0.95),
        frameMax: Math.max(...frames),
        longTasks: longTasks.length,
        longTaskMs: longTasks.reduce((a, b) => a + b, 0),
        tickP95: percentile(ticks, 0.95),
        minutesAdvanced: store.getState().game.minutes - startMinutes,
        autosaveAt: store.getState().game.autosaveAt,
        persistenceError: store.getState().persistenceError,
        duration,
        pan,
        slowEvents: slowEvents.slice(0, 20),
      };
    },
    { duration: Number(process.env.PERF_DURATION ?? 10000), pan: process.env.PERF_PAN === '1' },
  );
  if (process.env.PERF_PROFILE) {
    const profile = await client.send('Profiler.stop');
    fs.writeFileSync(process.env.PERF_PROFILE, JSON.stringify(profile));
  }
  const after = await client.send('Performance.getMetrics');
  const metricsByName = (result: typeof after) =>
    Object.fromEntries(result.metrics.map((metric) => [metric.name, metric.value]));
  const a = metricsByName(after),
    b = metricsByName(before);
  const summary = {
    cpuSlowdown,
    ...setup,
    ...metrics,
    scriptMs: (a.ScriptDuration - b.ScriptDuration) * 1000,
    layoutMs: (a.LayoutDuration - b.LayoutDuration) * 1000,
    styleMs: (a.RecalcStyleDuration - b.RecalcStyleDuration) * 1000,
    taskMs: (a.TaskDuration - b.TaskDuration) * 1000,
    domNodes: a.Nodes,
  };
  console.log(JSON.stringify(summary));
  fs.writeFileSync(
    process.env.PERF_OUTPUT ?? testInfo.outputPath('performance.json'),
    JSON.stringify(summary, null, 2),
  );
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.screenshot({ path: testInfo.outputPath('profile-city.png') });
  expect(metrics.minutesAdvanced).toBeGreaterThan(0);
});
