import { build } from 'esbuild';
const min = process.argv.includes('--min');
// 1) chunk generator worker, bundled to a string that is embedded in the game bundle (works from file://)
const w = await build({ entryPoints: ['src/worker.js'], bundle: true, minify: min, format: 'iife', target: 'es2020', write: false, logLevel: 'error' });
const workerSrc = w.outputFiles[0].text;
// 2) game
await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: min,
  format: 'iife',
  target: 'es2020',
  outfile: 'game.js',
  define: { __WORKER_SRC__: JSON.stringify(workerSrc) },
  logLevel: 'info',
});
