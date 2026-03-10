import { base } from "@smithy/eslint-config";

export default [
  { ignores: ["dist/"] },
  ...base,
  {
    // NestJS relies on emitDecoratorMetadata for DI, which requires value
    // imports. consistent-type-imports would convert them to type-only
    // imports that get erased at runtime, breaking dependency injection.
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
];
