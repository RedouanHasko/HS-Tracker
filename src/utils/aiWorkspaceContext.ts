import { Project } from '../types';
import { calculateSettlements } from './mockData';
import { resolveUserRole } from './permissions';

/** Compact list of all workspaces for dashboard / global AI mode */
export function buildWorkspaceContext(projects: Project[], userEmail: string): string {
  const email = userEmail.toLowerCase();

  const workspaces = projects.map((p) => {
    const { totalSpent } = calculateSettlements(p);
    const role = resolveUserRole(p, email);
    const myTasks = p.tasks
      .filter((t) => (t.assignedTo || '').toLowerCase() === email)
      .map((t) => ({ id: t.id, title: t.title, status: t.status }));

    return {
      projectId: p.id,
      name: p.name,
      clientName: p.clientName,
      address: p.address,
      status: p.status,
      budget: p.budget,
      currency: p.currency,
      totalSpent,
      remainingBudget: p.budget - totalSpent,
      userRole: role,
      taskCount: p.tasks.length,
      expenseCount: p.expenses.length,
      memberCount: p.members.length,
      myAssignedTasks: myTasks,
      recentTasks: p.tasks.slice(0, 12).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
      })),
      recentExpenses: p.expenses.slice(-8).map((e) => ({
        id: e.id,
        title: e.title,
        amount: e.amount,
        category: e.category,
      })),
    };
  });

  return JSON.stringify(
    {
      mode: 'WORKSPACE',
      userEmail,
      projectCount: projects.length,
      workspaces,
    },
    null,
    2
  );
}

export function resolveProjectFromParams(
  projects: Project[],
  params: Record<string, unknown>,
  fallback?: Project | null
): Project | null {
  const projectId = params.projectId as string | undefined;
  if (projectId) {
    const hit = projects.find((p) => p.id === projectId);
    if (hit) return hit;
  }
  const projectName = params.projectName as string | undefined;
  if (projectName) {
    const q = projectName.toLowerCase();
    const hit = projects.find((p) => p.name.toLowerCase().includes(q));
    if (hit) return hit;
  }
  return fallback ?? null;
}
