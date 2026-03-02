import { describe, it, expect } from 'vitest';
import { Relations, extractTablesRelationalConfig, createTableRelationsHelpers } from 'drizzle-orm';
import { packages, packageFiles } from './packages';
import { workers, workerVersions } from './workers';
import { assemblyLines, assemblyLineSteps, workerPools, workerPoolMembers } from './workflows';
import { jobExecutions } from './jobs';
import {
  packagesRelations,
  packageFilesRelations,
  workersRelations,
  workerVersionsRelations,
  assemblyLinesRelations,
  assemblyLineStepsRelations,
  workerPoolsRelations,
  workerPoolMembersRelations,
  jobExecutionsRelations,
} from './relations';

// Full schema for extractTablesRelationalConfig — invokes all lazy relation config functions
const fullSchema = {
  packages,
  packageFiles,
  workers,
  workerVersions,
  assemblyLines,
  assemblyLineSteps,
  workerPools,
  workerPoolMembers,
  jobExecutions,
  packagesRelations,
  packageFilesRelations,
  workersRelations,
  workerVersionsRelations,
  assemblyLinesRelations,
  assemblyLineStepsRelations,
  workerPoolsRelations,
  workerPoolMembersRelations,
  jobExecutionsRelations,
};

describe('packagesRelations', () => {
  it('is a Relations instance', () => {
    expect(packagesRelations).toBeInstanceOf(Relations);
  });

  it('is bound to the packages table', () => {
    expect(packagesRelations.table).toBe(packages);
  });
});

describe('packageFilesRelations', () => {
  it('is a Relations instance', () => {
    expect(packageFilesRelations).toBeInstanceOf(Relations);
  });

  it('is bound to the packageFiles table', () => {
    expect(packageFilesRelations.table).toBe(packageFiles);
  });
});

describe('workersRelations', () => {
  it('is a Relations instance', () => {
    expect(workersRelations).toBeInstanceOf(Relations);
  });

  it('is bound to the workers table', () => {
    expect(workersRelations.table).toBe(workers);
  });
});

describe('workerVersionsRelations', () => {
  it('is a Relations instance', () => {
    expect(workerVersionsRelations).toBeInstanceOf(Relations);
  });

  it('is bound to the workerVersions table', () => {
    expect(workerVersionsRelations.table).toBe(workerVersions);
  });
});

describe('assemblyLinesRelations', () => {
  it('is a Relations instance', () => {
    expect(assemblyLinesRelations).toBeInstanceOf(Relations);
  });

  it('is bound to the assemblyLines table', () => {
    expect(assemblyLinesRelations.table).toBe(assemblyLines);
  });
});

describe('assemblyLineStepsRelations', () => {
  it('is a Relations instance', () => {
    expect(assemblyLineStepsRelations).toBeInstanceOf(Relations);
  });

  it('is bound to the assemblyLineSteps table', () => {
    expect(assemblyLineStepsRelations.table).toBe(assemblyLineSteps);
  });
});

describe('workerPoolsRelations', () => {
  it('is a Relations instance', () => {
    expect(workerPoolsRelations).toBeInstanceOf(Relations);
  });

  it('is bound to the workerPools table', () => {
    expect(workerPoolsRelations.table).toBe(workerPools);
  });
});

describe('workerPoolMembersRelations', () => {
  it('is a Relations instance', () => {
    expect(workerPoolMembersRelations).toBeInstanceOf(Relations);
  });

  it('is bound to the workerPoolMembers table', () => {
    expect(workerPoolMembersRelations.table).toBe(workerPoolMembers);
  });
});

describe('jobExecutionsRelations', () => {
  it('is a Relations instance', () => {
    expect(jobExecutionsRelations).toBeInstanceOf(Relations);
  });

  it('is bound to the jobExecutions table', () => {
    expect(jobExecutionsRelations.table).toBe(jobExecutions);
  });
});

describe('relational config resolution', () => {
  it('resolves all tables and their relations without error', () => {
    const { tables } = extractTablesRelationalConfig(fullSchema, createTableRelationsHelpers);
    expect(tables).toBeDefined();
    expect(Object.keys(tables)).toHaveLength(9);
  });

  it('packages table has assemblyLine, files, and jobExecutions relations', () => {
    const { tables } = extractTablesRelationalConfig(fullSchema, createTableRelationsHelpers);
    const rels = tables['packages'].relations;
    expect(rels['assemblyLine']).toBeDefined();
    expect(rels['files']).toBeDefined();
    expect(rels['jobExecutions']).toBeDefined();
  });

  it('packageFiles table has a package back-reference', () => {
    const { tables } = extractTablesRelationalConfig(fullSchema, createTableRelationsHelpers);
    expect(tables['packageFiles'].relations['package']).toBeDefined();
  });

  it('workers table has a versions relation', () => {
    const { tables } = extractTablesRelationalConfig(fullSchema, createTableRelationsHelpers);
    expect(tables['workers'].relations['versions']).toBeDefined();
  });

  it('workerVersions table has worker, assemblyLineSteps, workerPoolMembers, and jobExecutions', () => {
    const { tables } = extractTablesRelationalConfig(fullSchema, createTableRelationsHelpers);
    const rels = tables['workerVersions'].relations;
    expect(rels['worker']).toBeDefined();
    expect(rels['assemblyLineSteps']).toBeDefined();
    expect(rels['workerPoolMembers']).toBeDefined();
    expect(rels['jobExecutions']).toBeDefined();
  });

  it('assemblyLines table has steps and packages relations', () => {
    const { tables } = extractTablesRelationalConfig(fullSchema, createTableRelationsHelpers);
    const rels = tables['assemblyLines'].relations;
    expect(rels['steps']).toBeDefined();
    expect(rels['packages']).toBeDefined();
  });

  it('assemblyLineSteps table has assemblyLine and workerVersion relations', () => {
    const { tables } = extractTablesRelationalConfig(fullSchema, createTableRelationsHelpers);
    const rels = tables['assemblyLineSteps'].relations;
    expect(rels['assemblyLine']).toBeDefined();
    expect(rels['workerVersion']).toBeDefined();
  });

  it('workerPools table has members relation', () => {
    const { tables } = extractTablesRelationalConfig(fullSchema, createTableRelationsHelpers);
    expect(tables['workerPools'].relations['members']).toBeDefined();
  });

  it('workerPoolMembers table has pool and workerVersion relations', () => {
    const { tables } = extractTablesRelationalConfig(fullSchema, createTableRelationsHelpers);
    const rels = tables['workerPoolMembers'].relations;
    expect(rels['pool']).toBeDefined();
    expect(rels['workerVersion']).toBeDefined();
  });

  it('jobExecutions table has package and workerVersion relations', () => {
    const { tables } = extractTablesRelationalConfig(fullSchema, createTableRelationsHelpers);
    const rels = tables['jobExecutions'].relations;
    expect(rels['package']).toBeDefined();
    expect(rels['workerVersion']).toBeDefined();
  });
});

describe('schema/index re-exports relations', () => {
  it('re-exports all relation definitions', async () => {
    const idx = await import('./index');
    expect(idx.packagesRelations).toBeDefined();
    expect(idx.packageFilesRelations).toBeDefined();
    expect(idx.workersRelations).toBeDefined();
    expect(idx.workerVersionsRelations).toBeDefined();
    expect(idx.assemblyLinesRelations).toBeDefined();
    expect(idx.assemblyLineStepsRelations).toBeDefined();
    expect(idx.workerPoolsRelations).toBeDefined();
    expect(idx.workerPoolMembersRelations).toBeDefined();
    expect(idx.jobExecutionsRelations).toBeDefined();
  });
});
