import { build } from 'esbuild';
await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: process.argv.includes('--min'),
  format: 'iife',
  target: 'es2020',
  outfile: 'game.js',
  logLevel: 'info',
});
