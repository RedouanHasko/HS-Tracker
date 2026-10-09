import { Project } from '../types';
import { calculateSettlements } from './mockData';
import { resolveUserRole } from './permissions';
import { loadDocumentParties } from './documentProfiles';
import { taskOwnerEmail } from './taskState';

/** Compact project snapshot for the AI system prompt */
export function buildProjectContext(project: Project, userEmail: string): string {
  const { totalSpent, settlements, paidMap } = calculateSettlements(project);
  const role = resolveUserRole(project, userEmail);
  const remaining = project.budget - totalSpent;

  const tasks = project.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    deadline: t.deadline,
    assignedTo: taskOwnerEmail(t),
    subtasks: (t.subtasks || []).map((s) => ({
      id: s.id,
      title: s.title,
      isCompleted: s.isCompleted,
    })),
  }));

  const expenses = project.expenses.slice(-40).map((e) => ({
    id: e.id,
    title: e.title,
    amount: e.amount,
    category: e.category,
    date: e.date,
    paidBy: e.paidBy,
    supplier: e.supplier,
  }));

  const members = project.members.map((m) => ({
    email: m.email,
    name: m.name,
    role: m.role,
  }));

  let savedIssuerProfiles: { label: string; name: string; email: string; phone: string; address: string }[] = [];
  try {
    savedIssuerProfiles = loadDocumentParties(userEmail)
      .filter((p) => p.role === 'issuer')
      .map((p) => ({ label: p.label, name: p.name, email: p.email, phone: p.phone, address: p.address }));
  } catch {
    /* localStorage unavailable */
  }

  const email = userEmail.toLowerCase();
  const myAssignedTasks = project.tasks
    .filter((t) => (t.assignedTo || '').toLowerCase() === email)
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      deadline: t.deadline,
      subtasksDone: (t.subtasks || []).filter((s) => s.isCompleted).length,
      subtasksTotal: (t.subtasks || []).length,
    }));

  const currentActiveTask =
    myAssignedTasks.find((t) => t.status === 'in_progress') ||
    myAssignedTasks.find((t) => t.status === 'pending') ||
    null;

  return JSON.stringify(
    {
      projectId: project.id,
      name: project.name,
      projectType: project.projectType,
      clientName: project.clientName,
      address: project.address,
      budget: project.budget,
      currency: project.currency,
      status: project.status,
      totalSpent,
      remainingBudget: remaining,
      percentSpent: project.budget ? Math.round((totalSpent / project.budget) * 100) : 0,
      userRole: role,
      userEmail,
      /** Tasks assigned to the current user — use for "my task" / "what am I doing" questions */
      myAssignedTasks,
      /** Task currently in progress for this user, else first pending — answer "current task" from this */
      currentActiveTask,
      taskStatusLegend: {
        pending: 'not started yet',
        in_progress: 'currently doing / active',
        completed: 'finished',
      },
      members,
      savedIssuerProfiles,
      tasks,
      expenses,
      rentalProperty: project.rentalProperty,
      rentalBookings: (project.rentalBookings || []).slice(-50).map((booking) => ({
        id: booking.id,
        clientName: booking.clientName,
        clientPhone: booking.clientPhone,
        source: booking.source,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        totalNights: booking.totalNights,
        totalAmount: booking.totalAmount,
        paidAmount: booking.paidAmount,
        balanceDue: booking.balanceDue,
        payments: (booking.payments || []).slice(-15).map((payment) => ({
          id: payment.id,
          date: payment.date,
          amount: payment.amount,
          method: payment.method,
          receiptNumber: payment.receiptNumber,
        })),
        commissionRate: booking.commissionRate,
        commission: booking.commission,
        ownerPayout: booking.ownerPayout,
        status: booking.status,
      })),
      rentalOwnerPayments: (project.rentalOwnerPayments || []).slice(-30),
      settlements: settlements.map((s) => ({
        from: s.fromName,
        to: s.toName,
        amount: s.amount,
      })),
      paidByMember: paidMap,
    },
    null,
    2
  );
}
