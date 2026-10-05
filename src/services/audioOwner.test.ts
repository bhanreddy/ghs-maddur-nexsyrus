import { acquireAudio, releaseAudio } from './audioOwner';
test('a slow ownership transfer cannot start stale audio after another owner wins', async () => {
  let resolve!: () => void;
  await acquireAudio('old', () => new Promise<void>(done => { resolve = done; }));
  const slow = acquireAudio('tour', () => {});
  const latest = await acquireAudio('read-aloud', () => {});
  resolve();
  expect(await slow).toBeNull(); expect(latest?.()).toBe(true);
  releaseAudio('read-aloud'); expect(latest?.()).toBe(false);
});
test('releasing another component does not interrupt current narration', async () => {
  const owns = await acquireAudio('tour', () => {});
  releaseAudio('read-aloud'); expect(owns?.()).toBe(true);
  releaseAudio('tour');
});
