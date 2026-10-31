import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from '../../src/lta/circuit-breaker.js';

function setup() {
  let time = 0;
  const breaker = new CircuitBreaker({ failureThreshold: 3, openMs: 1_000, now: () => time });
  return { breaker, advance: (ms: number) => (time += ms) };
}

describe('CircuitBreaker', () => {
  it('stays closed below the failure threshold', () => {
    const { breaker } = setup();
    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.state).toBe('closed');
    expect(breaker.tryAcquire()).toBe(true);
  });

  it('opens after the threshold and refuses requests', () => {
    const { breaker } = setup();
    for (let i = 0; i < 3; i += 1) breaker.recordFailure();

    expect(breaker.state).toBe('open');
    expect(breaker.tryAcquire()).toBe(false);
  });

  it('lets exactly one trial request through once the open period ends', () => {
    const { breaker, advance } = setup();
    for (let i = 0; i < 3; i += 1) breaker.recordFailure();
    advance(1_000);

    expect(breaker.state).toBe('half-open');
    expect(breaker.tryAcquire()).toBe(true);
    expect(breaker.tryAcquire()).toBe(false);
  });

  it('closes again when the trial succeeds', () => {
    const { breaker, advance } = setup();
    for (let i = 0; i < 3; i += 1) breaker.recordFailure();
    advance(1_000);
    breaker.tryAcquire();
    breaker.recordSuccess();

    expect(breaker.state).toBe('closed');
    breaker.recordFailure();
    expect(breaker.state).toBe('closed');
  });

  it('reopens straight away when the trial fails', () => {
    const { breaker, advance } = setup();
    for (let i = 0; i < 3; i += 1) breaker.recordFailure();
    advance(1_000);
    breaker.tryAcquire();
    breaker.recordFailure();

    expect(breaker.state).toBe('open');
    advance(999);
    expect(breaker.state).toBe('open');
    advance(1);
    expect(breaker.state).toBe('half-open');
  });

  it('a success resets the failure count', () => {
    const { breaker } = setup();
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.state).toBe('closed');
  });

  it('can be tripped for a custom period', () => {
    const { breaker, advance } = setup();
    breaker.trip(5_000);

    expect(breaker.state).toBe('open');
    advance(4_999);
    expect(breaker.tryAcquire()).toBe(false);
    advance(1);
    expect(breaker.tryAcquire()).toBe(true);
  });
});
