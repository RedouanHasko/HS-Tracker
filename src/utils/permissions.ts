import { Project, UserRole, Task, Expense } from '../types';

/** Capability flags derived from a member's project role */
export interface ProjectPermissions {
  canModifySettings: boolean;
  canManageMembers: boolean;
  canManageExpenses: boolean;
  canManageTasks: boolean;
  canManageReimbursements: boolean;
  canUploadTaskMedia: boolean;
  canViewActivityLog: boolean;
  isReadOnly: boolean;
}

const ROLE_LEVEL: Record<UserRole, number> = {
  read_only: 0,
  contributor: 1,
  editor: 2,
  manager: 3,
  co_owner: 4,
  owner: 4,
};

/** Resolve the signed-in user's role on a project */
export function resolveUserRole(project: Project, userEmail: string): UserRole {
  const email = userEmail.toLowerCase();
  if (project.creatorEmail.toLowerCase() === email) return 'owner';
  const member = project.members.find((m) => m.email.toLowerCase() === email);
  return member?.role ?? 'read_only';
}

/** Denormalized access lists written on every project save (Firestore rules + queries). */
export function buildProjectAccessFields(project: Project): {
  creatorEmail: string;
  memberEmails: string[];
  invitedEmails: string[];
  memberRoleByEmail: Record<string, UserRole>;
} {
  const creatorEmail = (project.creatorEmail || '').toLowerCase();
  const memberEmails = [
    ...new Set(
      (project.members || [])
        .filter((m) => !m.status || m.status === 'accepted')
        .map((m) => m.email.toLowerCase())
    ),
  ];
  if (creatorEmail && !memberEmails.includes(creatorEmail)) {
    memberEmails.push(creatorEmail);
  }
  const invitedEmails = [
    ...new Set(
      (project.members || [])
        .filter((m) => m.status === 'pending')
        .map((m) => m.email.toLowerCase())
    ),
  ];
  return {
    creatorEmail,
    memberEmails,
    invitedEmails,
    memberRoleByEmail: buildMemberRoleMap({ ...project, creatorEmail }),
  };
}

/** Map member emails → roles (stored on project doc for Firestore rules) */
export function buildMemberRoleMap(project: Project): Record<string, UserRole> {
  const map: Record<string, UserRole> = {};
  const creator = project.creatorEmail.toLowerCase();
  map[creator] = 'owner';
  for (const m of project.members || []) {
    const email = m.email.toLowerCase();
    // Creator always keeps owner role even if members[] lists another role
    map[email] = email === creator ? 'owner' : m.role;
  }
  return map;
}

/** True when denormalized Firestore access lists are out of date vs members[]. */
export function needsProjectAccessFieldSync(project: Project): boolean {
  const expected = buildProjectAccessFields(project);
  const storedEmails = [...(project.memberEmails || [])].map((e) => e.toLowerCase()).sort();
  const expectedEmails = [...expected.memberEmails].sort();
  if (JSON.stringify(storedEmails) !== JSON.stringify(expectedEmails)) return true;
  if ((project.creatorEmail || '').toLowerCase() !== expected.creatorEmail) return true;

  for (const [email, role] of Object.entries(expected.memberRoleByEmail)) {
    if (project.memberRoleByEmail?.[email] !== role) return true;
  }
  const storedInvited = [...(project.invitedEmails || [])].map((e) => e.toLowerCase()).sort();
  const expectedInvited = [...expected.invitedEmails].sort();
  if (JSON.stringify(storedInvited) !== JSON.stringify(expectedInvited)) return true;

  return false;
}

export function roleLevel(role: UserRole): number {
  return ROLE_LEVEL[role] ?? 0;
}

/**
 * Permission matrix:
 * - read_only: view only
 * - contributor: tasks + expenses
 * - editor: tasks + expenses (same content scope; invite UI may differ)
 * - manager / owner: settings, members, reimbursements, everything
 */
export function getProjectPermissions(role: UserRole): ProjectPermissions {
  const level = roleLevel(role);
  const isReadOnly = role === 'read_only';

  return {
    isReadOnly,
    canModifySettings: level >= ROLE_LEVEL.manager,
    canManageMembers: level >= ROLE_LEVEL.manager,
    canManageExpenses: level >= ROLE_LEVEL.contributor,
    canManageTasks: level >= ROLE_LEVEL.contributor,
    canManageReimbursements: level >= ROLE_LEVEL.manager,
    canUploadTaskMedia: level >= ROLE_LEVEL.contributor,
    canViewActivityLog: level >= ROLE_LEVEL.manager,
  };
}

/** Email of who created a task (legacy tasks → project owner) */
export function taskCreatorEmail(task: Task, project: Project): string {
  return (task.createdBy || project.creatorEmail).toLowerCase();
}

export function expenseCreatorEmail(expense: Expense, project: Project): string {
  return (expense.createdBy || project.creatorEmail).toLowerCase();
}

export function isProjectOwner(project: Project, userEmail: string): boolean {
  return project.creatorEmail.toLowerCase() === userEmail.toLowerCase();
}

/** Co-owners and the project creator can change any task or expense */
export function hasFullContentAccess(project: Project, userEmail: string, role: UserRole): boolean {
  return isProjectOwner(project, userEmail) || role === 'co_owner';
}

export function isAdminRole(role: UserRole): boolean {
  return roleLevel(role) >= ROLE_LEVEL.manager;
}

/**
 * Task edit/delete rules:
 * - Project owner & co-owners can change anything
 * - Tasks created by the project owner can only be changed by owner/co-owner
 * - Managers can change tasks created by others (not the owner's)
 * - Contributors/editors can only change tasks they created
 */
export function canEditTask(task: Task, project: Project, userEmail: string, role: UserRole): boolean {
  const email = userEmail.toLowerCase();
  if (role === 'read_only' || !permCanManageTasks(role)) return false;
  if (hasFullContentAccess(project, email, role)) return true;

  const creator = taskCreatorEmail(task, project);
  const owner = project.creatorEmail.toLowerCase();
  if (creator === owner) return false;

  if (isAdminRole(role)) return true;
  return creator === email;
}

export function canDeleteTask(task: Task, project: Project, userEmail: string, role: UserRole): boolean {
  return canEditTask(task, project, userEmail, role);
}

export function canEditExpense(expense: Expense, project: Project, userEmail: string, role: UserRole): boolean {
  const email = userEmail.toLowerCase();
  if (role === 'read_only' || !permCanManageExpenses(role)) return false;
  if (hasFullContentAccess(project, email, role)) return true;

  const creator = expenseCreatorEmail(expense, project);
  const owner = project.creatorEmail.toLowerCase();
  if (creator === owner) return false;

  if (isAdminRole(role)) return true;
  return creator === email;
}

export function canDeleteExpense(expense: Expense, project: Project, userEmail: string, role: UserRole): boolean {
  return canEditExpense(expense, project, userEmail, role);
}

/**
 * Human-readable reason a task cannot be edited, so the UI can explain the lock instead of
 * leaving a viewer guessing. Returns null when editing is allowed.
 */
export function taskEditDenialReason(
  task: Task,
  project: Project,
  userEmail: string,
  role: UserRole,
  language: 'en' | 'fr' | 'ar' = 'en'
): string | null {
  if (canEditTask(task, project, userEmail, role)) return null;
  if (role === 'read_only' || !permCanManageTasks(role)) {
    return language === 'fr'
      ? 'Accès en lecture seule — demandez un rôle de contributeur au propriétaire.'
      : language === 'ar'
        ? 'صلاحيات قراءة فقط — اطلب دور مساهم من المالك.'
        : 'Read-only access — ask the project owner for a contributor role.';
  }
  const creator = taskCreatorEmail(task, project);
  const owner = project.creatorEmail.toLowerCase();
  if (creator === owner) {
    return language === 'fr'
      ? 'Tâche créée par le propriétaire du projet — seul le propriétaire peut la modifier.'
      : language === 'ar'
        ? 'أنشأها مالك المشروع — يمكن للمالك وحده تعديلها.'
        : 'Created by the project owner — only the owner can change it.';
  }
  return language === 'fr'
    ? 'Seuls son créateur, un gestionnaire ou le propriétaire peuvent modifier cette tâche.'
    : language === 'ar'
      ? 'يمكن لمنشئها أو مدير أو المالك وحدهم تعديل هذه المهمة.'
      : 'Only its creator, a manager, or the project owner can change this task.';
}

function permCanManageTasks(role: UserRole): boolean {
  return roleLevel(role) >= ROLE_LEVEL.contributor;
}

function permCanManageExpenses(role: UserRole): boolean {
  return roleLevel(role) >= ROLE_LEVEL.contributor;
}
