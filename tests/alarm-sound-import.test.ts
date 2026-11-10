import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pick: vi.fn(), prepare: vi.fn(), remove: vi.fn(), deleteCache: vi.fn(), uri: vi.fn(), prune: vi.fn(),
  sourceSize: 1024,
}));
vi.mock('../modules/navo-alarm-sounds', () => ({ default: { prepareSound: mocks.prepare, deleteSound: mocks.remove, getSoundUri: mocks.uri, pruneUnusedSounds: mocks.prune } }));
vi.mock('expo-document-picker', () => ({ getDocumentAsync: mocks.pick }));
vi.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  File: class {
    uri: string;
    exists = true;
    constructor(uri: string) { this.uri = uri; }
    get size() { return mocks.sourceSize; }
    delete() { mocks.deleteCache(); }
  },
}));
import { importAlarmSound } from '../src/services/imported-alarm-sounds';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sourceSize = 1024;
  mocks.pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/picked.mp3', name: 'My song.mp3' }] });
  mocks.prepare.mockResolvedValue({ durationSeconds: 25, sizeBytes: 1_102_544 });
  mocks.remove.mockResolvedValue(undefined);
  mocks.prune.mockResolvedValue(undefined);
});

describe('audio file import', () => {
  it('treats picker cancellation as a no-op', async () => {
    mocks.pick.mockResolvedValue({ canceled: true, assets: null });
    expect(await importAlarmSound([])).toBeNull();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.deleteCache).not.toHaveBeenCalled();
  });

  it('prepares a clip and records relative metadata, then removes the picker cache copy', async () => {
    const sound = await importAlarmSound([]);
    expect(mocks.pick).toHaveBeenCalledWith({ type: 'audio/*', multiple: false, copyToCacheDirectory: true });
    expect(sound).toMatchObject({ label: 'My song', durationSeconds: 25, sizeBytes: 1_102_544 });
    expect(sound?.fileName).toMatch(/^navo_imported_[a-z0-9-]+\.wav$/);
    expect(mocks.deleteCache).toHaveBeenCalledOnce();
  });

  it('rejects oversized inputs before decoding and cleans up the cache', async () => {
    mocks.sourceSize = 21 * 1024 * 1024;
    await expect(importAlarmSound([])).rejects.toThrow(/smaller than 20 MB/);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.deleteCache).toHaveBeenCalledOnce();
  });

  it('keeps a pre-existing clip safe if native preparation rejects before creating a file', async () => {
    mocks.prepare.mockRejectedValue(new Error('Sound already exists'));
    await expect(importAlarmSound([])).rejects.toThrow(/could not be imported/);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.deleteCache).toHaveBeenCalledOnce();
  });

  it('removes a newly prepared clip if its conversion metadata is invalid', async () => {
    mocks.prepare.mockResolvedValue({ durationSeconds: 35, sizeBytes: 1_102_544 });
    await expect(importAlarmSound([])).rejects.toThrow(/converted/);
    expect(mocks.remove).toHaveBeenCalledOnce();
  });

  it('never deletes an original file outside Navo’s picker cache', async () => {
    mocks.pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///documents/song.mp3', name: 'song.mp3' }] });
    await importAlarmSound([]);
    expect(mocks.deleteCache).not.toHaveBeenCalled();
  });

  it('can still import when orphan cleanup fails', async () => {
    mocks.prune.mockRejectedValue(new Error('Storage unavailable during cleanup'));
    expect(await importAlarmSound([])).toMatchObject({ label: 'My song' });
  });
});
