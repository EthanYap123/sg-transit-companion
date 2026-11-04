import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { callWhileWaking, isWakingError } from './wake';

const noAnswer = () => new ApiError(0, 'NETWORK', 'Could not reach the server');

describe('isWakingError', () => {
  it.each([
    ['no answer', noAnswer(), true],
    ['a gateway error from the host', new ApiError(502, 'UNKNOWN', 'Bad gateway'), true],
    ['LTA being down, a real answer', new ApiError(503, 'LTA_UNAVAILABLE', 'Down'), false],
    ['not found', new ApiError(404, 'NOT_FOUND', 'Missing'), false],
    ['a bug', new TypeError('boom'), false],
  ])('%s', (_label, err, expected) => {
    expect(isWakingError(err)).toBe(expected);
  });
});

describe('callWhileWaking', () => {
  it('returns straight away without saying the server is waking', async () => {
    vi.useFakeTimers();
    const onWaking = vi.fn();

    await expect(callWhileWaking(() => Promise.resolve('ok'), { onWaking })).resolves.toBe('ok');

    await vi.advanceTimersByTimeAsync(5_000);
    expect(onWaking).not.toHaveBeenCalled();
  });

  it('says the server is waking after 3 s without an answer', async () => {
    vi.useFakeTimers();
    const onWaking = vi.fn();
    void callWhileWaking(() => new Promise(() => undefined), { onWaking });

    await vi.advanceTimersByTimeAsync(2_999);
    expect(onWaking).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onWaking).toHaveBeenCalledTimes(1);
  });

  it('retries with growing waits until the server answers', async () => {
    vi.useFakeTimers();
    const call = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(noAnswer())
      .mockRejectedValueOnce(noAnswer())
      .mockResolvedValue('awake');

    const result = callWhileWaking(call, { onWaking: () => undefined });
    await vi.advanceTimersByTimeAsync(999);
    expect(call).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(call).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(result).resolves.toBe('awake');
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('gives up after 90 s', async () => {
    vi.useFakeTimers();
    const call = vi.fn(() => Promise.reject(noAnswer()));

    const result = callWhileWaking(call, { onWaking: () => undefined });
    const assertion = expect(result).rejects.toBeInstanceOf(ApiError);
    await vi.advanceTimersByTimeAsync(100_000);

    await assertion;
    // 1 + 2 + 4 + 8 s, then every 8 s until 90 s.
    expect(call.mock.calls.length).toBeGreaterThan(5);
    expect(call.mock.calls.length).toBeLessThan(15);
  });

  it('does not retry a real answer', async () => {
    const call = vi.fn(() => Promise.reject(new ApiError(404, 'NOT_FOUND', 'Missing')));

    await expect(callWhileWaking(call, { onWaking: () => undefined })).rejects.toThrow('Missing');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('stops waiting as soon as the caller cancels', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const call = vi.fn(() => Promise.reject(noAnswer()));

    const result = callWhileWaking(call, { onWaking: () => undefined, signal: controller.signal });
    const assertion = expect(result).rejects.toThrow('Aborted');
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();

    await assertion;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(call).toHaveBeenCalledTimes(1);
  });
});
