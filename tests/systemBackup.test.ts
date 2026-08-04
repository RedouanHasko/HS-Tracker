import assert from 'node:assert/strict';
import test from 'node:test';
import { Project } from '../src/types';
import { buildSystemBackup, parseSystemBackup } from '../src/utils/systemBackup';

const project = {
  id: 'project-1',
  name: 'Apartment B6',
  clientName: 'Owner',
  address: 'Tangier',
  description: '',
  startDate: '2026-01-01',
  estimatedEndDate: '2026-12-31',
  budget: 0,
  currency: 'DH',
  status: 'planning',
  projectType: 'rental',
  creatorEmail: 'owner@example.com',
  members: [],
  sections: [],
  expenses: [],
  tasks: [],
  photos: [],
  documents: [],
  rentalBookings: [],
} satisfies Project;

test('system backup round-trips every project without mutating source data', () => {
  const source = [project];
  const backup = buildSystemBackup(source, 'OWNER@EXAMPLE.COM');
  backup.projects[0].name = 'Changed in backup';

  assert.equal(source[0].name, 'Apartment B6');
  assert.equal(backup.exportedBy, 'owner@example.com');
  assert.equal(parseSystemBackup(JSON.stringify(buildSystemBackup(source, 'owner@example.com'))).projects[0].id, 'project-1');
});

test('system backup rejects mismatched counts and duplicate project IDs', () => {
  const backup = buildSystemBackup([project], 'owner@example.com');
  assert.throws(
    () => parseSystemBackup(JSON.stringify({ ...backup, projectCount: 2 })),
    /count does not match/
  );
  assert.throws(
    () => parseSystemBackup(JSON.stringify({ ...backup, projectCount: 2, projects: [project, project] })),
    /duplicate project ID/
  );
});
