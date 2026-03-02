import { describe, it, expect } from 'vitest';
import { PackageStatus } from '@smithy/shared';
import {
  PACKAGE_STATUS_TRANSITIONS,
  PackageStatusMachine,
} from './package-status.machine';

describe('PACKAGE_STATUS_TRANSITIONS', () => {
  it('is exported as a constant', () => {
    expect(PACKAGE_STATUS_TRANSITIONS).toBeDefined();
  });

  it('covers every PackageStatus key', () => {
    const allStatuses = Object.values(PackageStatus);
    for (const s of allStatuses) {
      expect(PACKAGE_STATUS_TRANSITIONS).toHaveProperty(s);
    }
  });

  it('PENDING can transition to IN_TRANSIT, PROCESSING, FAILED', () => {
    expect(PACKAGE_STATUS_TRANSITIONS[PackageStatus.PENDING]).toEqual(
      expect.arrayContaining([
        PackageStatus.IN_TRANSIT,
        PackageStatus.PROCESSING,
        PackageStatus.FAILED,
      ]),
    );
    expect(PACKAGE_STATUS_TRANSITIONS[PackageStatus.PENDING]).toHaveLength(3);
  });

  it('IN_TRANSIT can transition to PROCESSING, FAILED', () => {
    expect(PACKAGE_STATUS_TRANSITIONS[PackageStatus.IN_TRANSIT]).toEqual(
      expect.arrayContaining([PackageStatus.PROCESSING, PackageStatus.FAILED]),
    );
    expect(PACKAGE_STATUS_TRANSITIONS[PackageStatus.IN_TRANSIT]).toHaveLength(2);
  });

  it('PROCESSING can transition to COMPLETED, FAILED', () => {
    expect(PACKAGE_STATUS_TRANSITIONS[PackageStatus.PROCESSING]).toEqual(
      expect.arrayContaining([PackageStatus.COMPLETED, PackageStatus.FAILED]),
    );
    expect(PACKAGE_STATUS_TRANSITIONS[PackageStatus.PROCESSING]).toHaveLength(2);
  });

  it('COMPLETED can transition to EXPIRED only', () => {
    expect(PACKAGE_STATUS_TRANSITIONS[PackageStatus.COMPLETED]).toEqual([
      PackageStatus.EXPIRED,
    ]);
  });

  it('FAILED is terminal — no outgoing transitions', () => {
    expect(PACKAGE_STATUS_TRANSITIONS[PackageStatus.FAILED]).toEqual([]);
  });

  it('EXPIRED is terminal — no outgoing transitions', () => {
    expect(PACKAGE_STATUS_TRANSITIONS[PackageStatus.EXPIRED]).toEqual([]);
  });
});

describe('PackageStatusMachine.getValidTransitions', () => {
  it('returns transitions for PENDING', () => {
    const result = PackageStatusMachine.getValidTransitions(PackageStatus.PENDING);
    expect(result).toEqual(PACKAGE_STATUS_TRANSITIONS[PackageStatus.PENDING]);
  });

  it('returns transitions for IN_TRANSIT', () => {
    const result = PackageStatusMachine.getValidTransitions(PackageStatus.IN_TRANSIT);
    expect(result).toEqual(PACKAGE_STATUS_TRANSITIONS[PackageStatus.IN_TRANSIT]);
  });

  it('returns transitions for PROCESSING', () => {
    const result = PackageStatusMachine.getValidTransitions(PackageStatus.PROCESSING);
    expect(result).toEqual(PACKAGE_STATUS_TRANSITIONS[PackageStatus.PROCESSING]);
  });

  it('returns transitions for COMPLETED', () => {
    const result = PackageStatusMachine.getValidTransitions(PackageStatus.COMPLETED);
    expect(result).toEqual([PackageStatus.EXPIRED]);
  });

  it('returns empty array for FAILED (terminal)', () => {
    const result = PackageStatusMachine.getValidTransitions(PackageStatus.FAILED);
    expect(result).toEqual([]);
  });

  it('returns empty array for EXPIRED (terminal)', () => {
    const result = PackageStatusMachine.getValidTransitions(PackageStatus.EXPIRED);
    expect(result).toEqual([]);
  });
});

describe('PackageStatusMachine.isValidTransition', () => {
  // ── same-status (idempotent) ─────────────────────────────────────────────
  it('allows PENDING → PENDING (idempotent)', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.PENDING, PackageStatus.PENDING)).toBe(true);
  });

  it('allows IN_TRANSIT → IN_TRANSIT (idempotent)', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.IN_TRANSIT, PackageStatus.IN_TRANSIT)).toBe(true);
  });

  it('allows PROCESSING → PROCESSING (idempotent)', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.PROCESSING, PackageStatus.PROCESSING)).toBe(true);
  });

  it('allows COMPLETED → COMPLETED (idempotent)', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.COMPLETED, PackageStatus.COMPLETED)).toBe(true);
  });

  it('allows FAILED → FAILED (idempotent)', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.FAILED, PackageStatus.FAILED)).toBe(true);
  });

  it('allows EXPIRED → EXPIRED (idempotent)', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.EXPIRED, PackageStatus.EXPIRED)).toBe(true);
  });

  // ── valid forward transitions ────────────────────────────────────────────
  it('allows PENDING → IN_TRANSIT', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.PENDING, PackageStatus.IN_TRANSIT)).toBe(true);
  });

  it('allows PENDING → PROCESSING', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.PENDING, PackageStatus.PROCESSING)).toBe(true);
  });

  it('allows PENDING → FAILED', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.PENDING, PackageStatus.FAILED)).toBe(true);
  });

  it('allows IN_TRANSIT → PROCESSING', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.IN_TRANSIT, PackageStatus.PROCESSING)).toBe(true);
  });

  it('allows IN_TRANSIT → FAILED', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.IN_TRANSIT, PackageStatus.FAILED)).toBe(true);
  });

  it('allows PROCESSING → COMPLETED', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.PROCESSING, PackageStatus.COMPLETED)).toBe(true);
  });

  it('allows PROCESSING → FAILED', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.PROCESSING, PackageStatus.FAILED)).toBe(true);
  });

  it('allows COMPLETED → EXPIRED', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.COMPLETED, PackageStatus.EXPIRED)).toBe(true);
  });

  // ── invalid transitions ──────────────────────────────────────────────────
  it('rejects PENDING → COMPLETED', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.PENDING, PackageStatus.COMPLETED)).toBe(false);
  });

  it('rejects PENDING → EXPIRED', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.PENDING, PackageStatus.EXPIRED)).toBe(false);
  });

  it('rejects IN_TRANSIT → PENDING', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.IN_TRANSIT, PackageStatus.PENDING)).toBe(false);
  });

  it('rejects IN_TRANSIT → COMPLETED', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.IN_TRANSIT, PackageStatus.COMPLETED)).toBe(false);
  });

  it('rejects IN_TRANSIT → EXPIRED', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.IN_TRANSIT, PackageStatus.EXPIRED)).toBe(false);
  });

  it('rejects PROCESSING → PENDING', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.PROCESSING, PackageStatus.PENDING)).toBe(false);
  });

  it('rejects PROCESSING → IN_TRANSIT', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.PROCESSING, PackageStatus.IN_TRANSIT)).toBe(false);
  });

  it('rejects PROCESSING → EXPIRED', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.PROCESSING, PackageStatus.EXPIRED)).toBe(false);
  });

  it('rejects COMPLETED → PENDING', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.COMPLETED, PackageStatus.PENDING)).toBe(false);
  });

  it('rejects COMPLETED → FAILED', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.COMPLETED, PackageStatus.FAILED)).toBe(false);
  });

  it('rejects FAILED → PENDING', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.FAILED, PackageStatus.PENDING)).toBe(false);
  });

  it('rejects FAILED → PROCESSING', () => {
    expect(PackageStatusMachine.isValidTransition(PackageStatus.FAILED, PackageStatus.PROCESSING)).toBe(false);
  });

  it('rejects EXPIRED → any status', () => {
    const nonExpired = Object.values(PackageStatus).filter(s => s !== PackageStatus.EXPIRED);
    for (const s of nonExpired) {
      expect(PackageStatusMachine.isValidTransition(PackageStatus.EXPIRED, s)).toBe(false);
    }
  });
});
