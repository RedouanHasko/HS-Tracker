import { Project } from '../types';
import { APP_TIME_ZONE, appDateKey } from './dateTime';

const BACKUP_KIND = 'hs-tracker-system-backup';
const BACKUP_SCHEMA_VERSION = 1;

export interface SystemBackup {
  kind: typeof BACKUP_KIND;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  createdAt: string;
  businessTimeZone: string;
  exportedBy: string;
  projectCount: number;
  projects: Project[];
}

function cloneProjects(projects: Project[]): Project[] {
  return JSON.parse(JSON.stringify(projects)) as Project[];
}

export function buildSystemBackup(projects: Project[], exportedBy: string): SystemBackup {
  const cloned = cloneProjects(projects);
  return {
    kind: BACKUP_KIND,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    businessTimeZone: APP_TIME_ZONE,
    exportedBy: exportedBy.trim().toLowerCase(),
    projectCount: cloned.length,
    projects: cloned,
  };
}

export function parseSystemBackup(text: string): SystemBackup {
  const value = JSON.parse(text) as Partial<SystemBackup>;
  if (
    value.kind !== BACKUP_KIND ||
    value.schemaVersion !== BACKUP_SCHEMA_VERSION ||
    !Array.isArray(value.projects)
  ) {
    throw new Error('This file is not a supported HS Tracker backup.');
  }

  const ids = new Set<string>();
  value.projects.forEach((project) => {
    if (!project || typeof project.id !== 'string' || !project.id.trim()) {
      throw new Error('The backup contains a project without a valid ID.');
    }
    if (ids.has(project.id)) {
      throw new Error(`The backup contains duplicate project ID "${project.id}".`);
    }
    ids.add(project.id);
  });

  if (value.projectCount !== value.projects.length) {
    throw new Error('The backup project count does not match its contents.');
  }

  return value as SystemBackup;
}

export function downloadSystemBackup(projects: Project[], exportedBy: string): void {
  const backup = buildSystemBackup(projects, exportedBy);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `hs-tracker-backup-${appDateKey()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
