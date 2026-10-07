import { generateChunk } from './world.js';
self.onmessage = (e) => {
  const { ci, cj } = e.data;
  const { data, transfer } = generateChunk(ci, cj);
  self.postMessage(data, transfer);
};
