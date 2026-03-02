import { PackageStatus } from '@smithy/shared';

/**
 * Defines the allowed state transitions for a Package.
 * Terminal states (EXPIRED) have no outgoing transitions.
 * FAILED is terminal for MVP; retry can be added by extending this map.
 */
export const PACKAGE_STATUS_TRANSITIONS: Record<PackageStatus, PackageStatus[]> = {
  [PackageStatus.PENDING]: [PackageStatus.IN_TRANSIT, PackageStatus.PROCESSING, PackageStatus.FAILED],
  [PackageStatus.IN_TRANSIT]: [PackageStatus.PROCESSING, PackageStatus.FAILED],
  [PackageStatus.PROCESSING]: [PackageStatus.COMPLETED, PackageStatus.FAILED],
  [PackageStatus.COMPLETED]: [PackageStatus.EXPIRED],
  [PackageStatus.FAILED]: [],
  [PackageStatus.EXPIRED]: [],
};

export const PackageStatusMachine = {
  /**
   * Returns the valid next states from `from`.
   */
  getValidTransitions(from: PackageStatus): PackageStatus[] {
    return PACKAGE_STATUS_TRANSITIONS[from];
  },

  /**
   * Returns true when the transition from → to is allowed or is a no-op (same status).
   */
  isValidTransition(from: PackageStatus, to: PackageStatus): boolean {
    if (from === to) return true;
    return PACKAGE_STATUS_TRANSITIONS[from].includes(to);
  },
};
