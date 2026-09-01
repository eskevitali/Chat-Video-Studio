import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sampleRate = 48000;

const createWav = (durationSeconds, frequencies) => {
  const sampleCount = Math.floor(durationSeconds * sampleRate);
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const phrase = Math.floor(time / 0.42);
    const gatePhase = time % 0.42;
    const envelope = gatePhase < 0.3
      ? Math.min(1, gatePhase / 0.025) * Math.min(1, (0.3 - gatePhase) / 0.04)
      : 0;
    const frequency = frequencies[phrase % frequencies.length];
    const sample = Math.sin(2 * Math.PI * frequency * time) * envelope * 0.055;
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + index * 2);
  }
  return buffer;
};

await mkdir(resolve(root, 'public/audio'), {recursive: true});
await mkdir(resolve(root, 'output'), {recursive: true});
await writeFile(resolve(root, 'public/audio/demo-user.wav'), createWav(3.6, [220, 247, 262]));
await writeFile(resolve(root, 'public/audio/demo-assistant.wav'), createWav(11.8, [165, 196, 220, 196]));
console.log('Demo audio created in public/audio.');
