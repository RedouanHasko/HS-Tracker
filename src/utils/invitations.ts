import { Invitation, Project } from '../types';

/** Thrown when an invitation can no longer be honored (revoked, consumed, or never issued). */
export class InviteRevokedError extends Error {
  constructor(message?: string) {
    super(message || 'This invitation is no longer valid.');
    this.name = 'InviteRevokedError';
  }
}

export interface InviteeMembershipDecision {
  projectId: string;
  email: string;
  displayName: string;
  role: Invitation['role'];
  decision: 'accept' | 'decline';
}

export interface StoredMembershipLists {
  members: Project['members'];
  memberEmails: string[];
  invitedEmails: string[];
  creatorEmail: string;
}

export type InviteeMembershipOutcome = 'joined' | 'already-member' | 'declined-recorded' | 'already-declined';

/**
 * Pure builder for the invitee self-service patch. The result is exactly what
 * firestore.rules `isInviteeMembershipPatch` allows: members + memberEmails +
 * invitedEmails on accept, members + invitedEmails on decline. Never touches the
 * role map, settings, recordRevision, or the versioned records subcollection —
 * all of which a pending invitee is forbidden to read or write.
 *
 * Side-effect free on purpose: unit-tested directly, applied by db.ts.
 */
export function buildInviteeMembershipPatch(
  stored: StoredMembershipLists,
  args: InviteeMembershipDecision
): {
  outcome: InviteeMembershipOutcome;
  update: { members: Project['members']; memberEmails?: string[]; invitedEmails: string[] };
  memberEmailsAfter: string[];
} {
  const email = args.email.toLowerCase();
  const cleanMemberEmails = (stored.memberEmails || []).map((e) => e.toLowerCase());
  const cleanInvitedEmails = (stored.invitedEmails || []).map((e) => e.toLowerCase());
  const entry = (stored.members || []).find((m) => m.email.toLowerCase() === email);
  const isMember = cleanMemberEmails.includes(email);

  if (args.decision === 'decline') {
    if (entry?.status === 'declined' && !cleanInvitedEmails.includes(email)) {
      return { outcome: 'already-declined', update: { members: stored.members, invitedEmails: cleanInvitedEmails }, memberEmailsAfter: cleanMemberEmails };
    }
    if (!entry && !cleanInvitedEmails.includes(email) && !isMember) {
      throw new InviteRevokedError('This invitation was revoked by the project owner.');
    }
    const members = (stored.members || []).map((m) =>
      m.email.toLowerCase() === email
        ? { email, name: m.name, role: m.role, ...(m.avatar ? { avatar: m.avatar } : {}), status: 'declined' as const }
        : m
    );
    return {
      outcome: 'declined-recorded',
      update: { members, invitedEmails: cleanInvitedEmails.filter((e) => e !== email) },
      memberEmailsAfter: cleanMemberEmails,
    };
  }

  // Accept path.
  if (entry?.status === 'accepted' && isMember) {
    return { outcome: 'already-member', update: { members: stored.members, invitedEmails: cleanInvitedEmails }, memberEmailsAfter: cleanMemberEmails };
  }
  const stillInvited = cleanInvitedEmails.includes(email) || entry?.status === 'pending';
  if (!stillInvited && !isMember) {
    throw new InviteRevokedError('This invitation was revoked by the project owner.');
  }
  if (isMember && !stillInvited) {
    // Edge: already in the access list (e.g. a previous partial accept). Heal the row, consume the invite.
    const members = (stored.members || []).map((m) =>
      m.email.toLowerCase() === email
        ? { email, name: args.displayName || m.name, role: args.role, ...(m.avatar ? { avatar: m.avatar } : {}), status: 'accepted' as const }
        : m
    );
    return {
      outcome: 'already-member',
      update: { members, invitedEmails: cleanInvitedEmails.filter((e) => e !== email) },
      memberEmailsAfter: cleanMemberEmails,
    };
  }
  const acceptedEntry = {
    email,
    name: args.displayName || entry?.name || email.split('@')[0],
    role: args.role,
    ...(entry?.avatar ? { avatar: entry.avatar } : {}),
    status: 'accepted' as const,
  };
  const members = entry
    ? (stored.members || []).map((m) => (m.email.toLowerCase() === email ? acceptedEntry : m))
    : [...(stored.members || []), acceptedEntry];
  const memberEmailsAfter = isMember ? cleanMemberEmails : [...cleanMemberEmails, email];
  return {
    outcome: 'joined',
    update: { members, memberEmails: memberEmailsAfter, invitedEmails: cleanInvitedEmails.filter((e) => e !== email) },
    memberEmailsAfter,
  };
}
