import { generateChunk } from './world.js';
self.onmessage = (e) => {
  const { ci, cj, skip } = e.data;
  const { data, transfer } = generateChunk(ci, cj, skip ? new Set(skip) : null);
  self.postMessage(data, transfer);
};
