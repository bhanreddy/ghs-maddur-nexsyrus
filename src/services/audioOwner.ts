// All speech/audio entry points acquire ownership before playback. A stale async
// acquisition cannot start sound after another component has taken ownership.
let generation = 0;
let current: { owner: string; stop: () => void | Promise<void> } | null = null;
export async function acquireAudio(owner: string, stop: () => void | Promise<void>): Promise<(() => boolean) | null> {
  const token = ++generation;
  const old = current;
  current = null;
  await Promise.resolve(old?.stop()).catch(() => undefined);
  if (token !== generation) return null;
  current = { owner, stop };
  return () => token === generation;
}
export function releaseAudio(owner: string) {
  if (current?.owner === owner) { generation++; current = null; }
}

export const audioOwnedBy = (owner: string) => current?.owner === owner;
