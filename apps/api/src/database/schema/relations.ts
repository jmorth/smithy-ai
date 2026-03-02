import { relations } from 'drizzle-orm';
import { packages, packageFiles } from './packages';
import { workers, workerVersions } from './workers';
import { assemblyLines, assemblyLineSteps, workerPools, workerPoolMembers } from './workflows';
import { jobExecutions } from './jobs';

// --- packages ---

export const packagesRelations = relations(packages, ({ one, many }) => ({
  assemblyLine: one(assemblyLines, {
    fields: [packages.assemblyLineId],
    references: [assemblyLines.id],
  }),
  files: many(packageFiles),
  jobExecutions: many(jobExecutions),
}));

export const packageFilesRelations = relations(packageFiles, ({ one }) => ({
  package: one(packages, {
    fields: [packageFiles.packageId],
    references: [packages.id],
  }),
}));

// --- workers ---

export const workersRelations = relations(workers, ({ many }) => ({
  versions: many(workerVersions),
}));

export const workerVersionsRelations = relations(workerVersions, ({ one, many }) => ({
  worker: one(workers, {
    fields: [workerVersions.workerId],
    references: [workers.id],
  }),
  assemblyLineSteps: many(assemblyLineSteps),
  workerPoolMembers: many(workerPoolMembers),
  jobExecutions: many(jobExecutions),
}));

// --- workflows ---

export const assemblyLinesRelations = relations(assemblyLines, ({ many }) => ({
  steps: many(assemblyLineSteps),
  packages: many(packages),
}));

export const assemblyLineStepsRelations = relations(assemblyLineSteps, ({ one }) => ({
  assemblyLine: one(assemblyLines, {
    fields: [assemblyLineSteps.assemblyLineId],
    references: [assemblyLines.id],
  }),
  workerVersion: one(workerVersions, {
    fields: [assemblyLineSteps.workerVersionId],
    references: [workerVersions.id],
  }),
}));

export const workerPoolsRelations = relations(workerPools, ({ many }) => ({
  members: many(workerPoolMembers),
}));

export const workerPoolMembersRelations = relations(workerPoolMembers, ({ one }) => ({
  pool: one(workerPools, {
    fields: [workerPoolMembers.poolId],
    references: [workerPools.id],
  }),
  workerVersion: one(workerVersions, {
    fields: [workerPoolMembers.workerVersionId],
    references: [workerVersions.id],
  }),
}));

// --- jobs ---

export const jobExecutionsRelations = relations(jobExecutions, ({ one }) => ({
  package: one(packages, {
    fields: [jobExecutions.packageId],
    references: [packages.id],
  }),
  workerVersion: one(workerVersions, {
    fields: [jobExecutions.workerVersionId],
    references: [workerVersions.id],
  }),
}));
