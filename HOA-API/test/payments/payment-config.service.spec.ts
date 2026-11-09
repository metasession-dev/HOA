import { PaymentConfigService } from '../../src/payments/payment-config.service';
import { encrypt } from '../../src/common/encryption';

const actor = { userId: 'u1', role: 'hoa_admin' };

function setup(initial: any = null) {
  let stored: any = initial;
  const paystack = { validateSecretKey: jest.fn().mockResolvedValue('valid') };
  const prisma: any = {
    paystackConfig: {
      findUnique: async () => stored,
      upsert: async ({ create, update }: any) => (stored = stored ? { ...stored, ...update } : { id: 'c1', ...create }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const service = new PaymentConfigService(prisma, paystack as any);
  return { service, paystack, prisma, getStored: () => stored };
}

describe('PaymentConfigService.update — key / test-mode checks', () => {
  it('rejects a live secret key while test mode is on', async () => {
    const { service } = setup();
    await expect(service.update('o1', actor, { secretKey: 'sk_live_abc', testMode: true })).rejects.toThrow(/not a test key/);
  });

  it('rejects a test secret key while test mode is off', async () => {
    const { service } = setup();
    await expect(service.update('o1', actor, { secretKey: 'sk_test_abc', testMode: false })).rejects.toThrow(/not a live key/);
  });

  it('rejects a public key from the other mode', async () => {
    const { service } = setup();
    await expect(
      service.update('o1', actor, { secretKey: 'sk_test_abc', publicKey: 'pk_live_x', testMode: true }),
    ).rejects.toThrow(/public key must be a test key/);
  });

  it('checks a toggle-only change against the stored secret', async () => {
    const { service, paystack } = setup({ id: 'c1', organizationId: 'o1', testMode: true, secretKeyEncrypted: encrypt('sk_test_abc') });

    await expect(service.update('o1', actor, { testMode: false })).rejects.toThrow(/not a live key/);
    // No new secret entered → no call to Paystack.
    expect(paystack.validateSecretKey).not.toHaveBeenCalled();
  });

  it('refuses a secret key Paystack rejects', async () => {
    const { service, paystack } = setup();
    paystack.validateSecretKey.mockResolvedValue('invalid');
    await expect(service.update('o1', actor, { secretKey: 'sk_test_abc', testMode: true })).rejects.toThrow(/rejected/);
  });

  it('refuses to save when Paystack cannot be reached', async () => {
    const { service, paystack } = setup();
    paystack.validateSecretKey.mockResolvedValue('unreachable');
    await expect(service.update('o1', actor, { secretKey: 'sk_test_abc', testMode: true })).rejects.toThrow(/Could not reach/);
  });

  it('refuses to enable payments without a secret key', async () => {
    const { service } = setup();
    await expect(service.update('o1', actor, { isEnabled: true })).rejects.toThrow(/secret key is required/);
  });

  it('saves matching, verified keys, encrypts the secret and never returns it', async () => {
    const { service, paystack, getStored, prisma } = setup();

    const result = await service.update('o1', actor, { secretKey: 'sk_test_abc', publicKey: 'pk_test_x', testMode: true, isEnabled: true });

    expect(paystack.validateSecretKey).toHaveBeenCalledWith('sk_test_abc');
    expect(getStored().secretKeyEncrypted).toBeDefined();
    expect(getStored().secretKeyEncrypted).not.toContain('sk_test_abc');
    expect(result).toMatchObject({ publicKey: 'pk_test_x', isEnabled: true, testMode: true, secretKeySet: true });
    expect(JSON.stringify(result)).not.toContain('sk_test_abc');
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain('sk_test_abc');
  });
});
