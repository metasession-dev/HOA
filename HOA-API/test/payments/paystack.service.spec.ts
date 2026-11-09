import * as crypto from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { PaystackService } from '../../src/payments/paystack.service';

describe('PaystackService.validateSecretKey', () => {
  const svc = new PaystackService();
  const respond = (status: number) => jest.spyOn(global, 'fetch').mockResolvedValue({ ok: status < 300, status } as Response);

  it('returns valid on 200 and sends the key as a bearer token', async () => {
    const fetchSpy = respond(200);
    await expect(svc.validateSecretKey('sk_test_abc')).resolves.toBe('valid');
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as any).Authorization).toBe('Bearer sk_test_abc');
  });

  it.each([401, 403])('returns invalid on %i', async (status) => {
    respond(status);
    await expect(svc.validateSecretKey('sk_test_bad')).resolves.toBe('invalid');
  });

  it('returns unreachable on a 5xx', async () => {
    respond(503);
    await expect(svc.validateSecretKey('sk_test_abc')).resolves.toBe('unreachable');
  });

  it('returns unreachable on a network error', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    await expect(svc.validateSecretKey('sk_test_abc')).resolves.toBe('unreachable');
  });
});

describe('PaystackService.verifyWebhookSignature', () => {
  const svc = new PaystackService();
  const body = '{"event":"charge.success","data":{"reference":"hoa_1"}}';
  const sig = crypto.createHmac('sha512', 'sk_test_key').update(body).digest('hex');

  it('accepts a correct HMAC-SHA512 signature', () => {
    expect(() => svc.verifyWebhookSignature(body, sig, 'sk_test_key')).not.toThrow();
  });

  it('rejects a signature made with another key', () => {
    expect(() => svc.verifyWebhookSignature(body, sig, 'sk_test_other')).toThrow(UnauthorizedException);
  });

  it('rejects when the body was altered', () => {
    expect(() => svc.verifyWebhookSignature(body.replace('hoa_1', 'hoa_2'), sig, 'sk_test_key')).toThrow(UnauthorizedException);
  });

  it('rejects a missing signature', () => {
    expect(() => svc.verifyWebhookSignature(body, undefined, 'sk_test_key')).toThrow(UnauthorizedException);
  });
});
