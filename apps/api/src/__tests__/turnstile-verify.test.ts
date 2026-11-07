import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireTurnstile, verifyTurnstile, verifyTurnstileDetailed } from '../lib/turnstile';
import { normalizeAgenda } from '../modules/events/routes';

// Pure unit tests: no database, no network (fetch is mocked).
function mockSiteverify(body: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Turnstile verification', () => {
  it('rejects a missing token without calling Cloudflare', async () => {
    const f = mockSiteverify({ success: true });
    expect(await verifyTurnstileDetailed('')).toEqual({ success: false, reason: 'MISSING_TOKEN' });
    expect(f).not.toHaveBeenCalled();
  });

  it('accepts a token Cloudflare validates and never sends remoteip', async () => {
    const f = mockSiteverify({ success: true, hostname: 'smart-campus-event-management.pages.dev' });
    expect(await verifyTurnstile('real-looking-token')).toBe(true);
    const body = String(((f.mock.calls[0] as unknown[])[1] as RequestInit).body);
    expect(body).toContain('response=real-looking-token');
    expect(body).not.toContain('remoteip');
  });

  it.each([
    [['invalid-input-response'], 'INVALID_TOKEN'],
    [['timeout-or-duplicate'], 'EXPIRED_OR_USED'],
    [['invalid-input-secret'], 'SERVER_MISCONFIGURED'],
    [['missing-input-secret'], 'SERVER_MISCONFIGURED'],
    [['internal-error'], 'UPSTREAM_UNAVAILABLE'],
  ])('maps siteverify %j to %s', async (codes, reason) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockSiteverify({ success: false, 'error-codes': codes }, 200);
    const r = await verifyTurnstileDetailed('some-token');
    expect(r.success).toBe(false);
    expect(r.reason).toBe(reason);
  });

  it('reads error codes even from a 4xx siteverify response', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockSiteverify({ success: false, 'error-codes': ['timeout-or-duplicate'] }, 400);
    expect((await verifyTurnstileDetailed('t')).reason).toBe('EXPIRED_OR_USED');
  });

  it('reports upstream failure on network error/timeout', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    expect((await verifyTurnstileDetailed('t')).reason).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('does not leak the token or secret in logs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockSiteverify({ success: false, 'error-codes': ['invalid-input-response'], hostname: 'x.pages.dev' });
    await verifyTurnstileDetailed('SUPER-SECRET-TOKEN-VALUE');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('SUPER-SECRET');
  });

  it('requireTurnstile throws TURNSTILE_FAILED with a safe reason', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockSiteverify({ success: false, 'error-codes': ['timeout-or-duplicate'] });
    const req = { headers: {}, body: { turnstileToken: 'abc' } } as any;
    await expect(requireTurnstile(req, {} as any)).rejects.toMatchObject({
      code: 'TURNSTILE_FAILED',
      statusCode: 403,
      details: { reason: 'EXPIRED_OR_USED' },
    });
  });

  it('requireTurnstile passes with the test token in test mode', async () => {
    const req = { headers: {}, body: { turnstileToken: 'test-pass' } } as any;
    await expect(requireTurnstile(req, {} as any)).resolves.toBeUndefined();
  });
});

describe('normalizeAgenda', () => {
  it('keeps valid sessions, drops editor ids and blank rows, maps speakerOrLocation', () => {
    expect(
      normalizeAgenda([
        { id: 'x', time: ' 10:00 AM ', title: ' Keynote ', speakerOrLocation: 'Hall A' },
        { id: 'y', time: '', title: '   ' },
        { time: '11:00', title: 'Workshop', speaker: 'Dr. Rao' },
      ])
    ).toEqual([
      { time: '10:00 AM', title: 'Keynote', speaker: 'Hall A' },
      { time: '11:00', title: 'Workshop', speaker: 'Dr. Rao' },
    ]);
  });
  it('rejects non-array and non-object entries', () => {
    expect(() => normalizeAgenda('g')).toThrow();
    expect(() => normalizeAgenda(['g'])).toThrow();
  });
});
