export const PackageType = {
  USER_INPUT: 'USER_INPUT',
  SPECIFICATION: 'SPECIFICATION',
  CODE: 'CODE',
  IMAGE: 'IMAGE',
  PULL_REQUEST: 'PULL_REQUEST',
} as const;
export type PackageType = (typeof PackageType)[keyof typeof PackageType];
