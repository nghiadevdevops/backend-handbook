// Measure event loop delay and utilization (node:perf_hooks, no dependency).
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const h = monitorEventLoopDelay({ resolution: 10 }); // sample every 10 ms
h.enable();
const elu0 = performance.eventLoopUtilization();

// Simulate a blocking handler: 5 times, block the loop for 200 ms with CPU work.
let n = 0;
const timer = setInterval(() => {
  const end = Date.now() + 200;
  while (Date.now() < end) { /* busy loop */ }
  if (++n === 5) {
    clearInterval(timer);
    setTimeout(report, 100);
  }
}, 300);

function report() {
  h.disable();
  const ms = (ns) => (ns / 1e6).toFixed(1);
  const elu = performance.eventLoopUtilization(elu0);
  console.log(`node=${process.version}`);
  console.log(`eventloop delay: mean=${ms(h.mean)}ms p99=${ms(h.percentile(99))}ms max=${ms(h.max)}ms`);
  console.log(`eventloop utilization=${elu.utilization.toFixed(2)}`);
}
