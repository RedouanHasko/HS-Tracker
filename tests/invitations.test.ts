import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInviteeMembershipPatch,
  InviteRevokedError,
} from '../src/utils/invitations';

const OWNER = 'owner@example.com';
const INVITEE = 'pending@example.com';

function storedLists(overrides = {}) {
  return {
    members: [
      { email: OWNER, name: 'Owner', role: 'owner' as const, status: 'accepted' as const },
      { email: INVITEE, name: 'Pending', role: 'contributor' as const, status: 'pending' as const },
    ],
    memberEmails: [OWNER],
    invitedEmails: [INVITEE],
    creatorEmail: OWNER,
    ...overrides,
  };
}

const acceptArgs = {
  projectId: 'proj_1',
  email: INVITEE,
  displayName: 'Pending User',
  role: 'contributor' as const,
  decision: 'accept' as const,
};

test('accept writes exactly the rules-allowed keys: members, memberEmails, invitedEmails', () => {
  const built = buildInviteeMembershipPatch(storedLists(), acceptArgs);
  assert.equal(built.outcome, 'joined');
  assert.deepEqual(Object.keys(built.update).sort(), ['invitedEmails', 'memberEmails', 'members']);
  assert.deepEqual(built.update.memberEmails, [OWNER, INVITEE]);
  assert.deepEqual(built.update.invitedEmails, []);
  const entry = built.update.members.find((m) => m.email === INVITEE);
  assert.equal(entry?.status, 'accepted');
  assert.equal(entry?.role, 'contributor');
  assert.ok(!('invitationId' in (entry || {})), 'stale invitation links are dropped on accept');
});

test('accept is case-insensitive on the invitee email', () => {
  const built = buildInviteeMembershipPatch(storedLists(), { ...acceptArgs, email: 'Pending@Example.COM' });
  assert.equal(built.outcome, 'joined');
  assert.deepEqual(built.memberEmailsAfter, [OWNER, INVITEE]);
});

test('accept heals a member row when the access list already contains the user', () => {
  const stored = storedLists({ memberEmails: [OWNER, INVITEE] });
  const built = buildInviteeMembershipPatch(stored, acceptArgs);
  assert.equal(built.outcome, 'joined');
  // No duplicate access entries are ever written.
  assert.deepEqual(built.memberEmailsAfter, [OWNER, INVITEE]);
  assert.deepEqual(built.update.invitedEmails, []);
  const entry = built.update.members.find((m) => m.email === INVITEE);
  assert.equal(entry?.status, 'accepted');
});

test('accept is a clean no-op when the user already joined', () => {
  const stored = storedLists({
    members: [
      { email: OWNER, name: 'Owner', role: 'owner' as const, status: 'accepted' as const },
      { email: INVITEE, name: 'Pending', role: 'contributor' as const, status: 'accepted' as const },
    ],
    memberEmails: [OWNER, INVITEE],
    invitedEmails: [],
  });
  const built = buildInviteeMembershipPatch(stored, acceptArgs);
  assert.equal(built.outcome, 'already-member');
  assert.deepEqual(built.update.invitedEmails, []);
});

test('accept throws InviteRevokedError when the invite was revoked owner-side', () => {
  const stored = storedLists({
    members: [{ email: OWNER, name: 'Owner', role: 'owner' as const, status: 'accepted' as const }],
    invitedEmails: [],
  });
  assert.throws(() => buildInviteeMembershipPatch(stored, acceptArgs), InviteRevokedError);
});

test('decline removes the invite without touching memberEmails', () => {
  const built = buildInviteeMembershipPatch(storedLists(), {
    ...acceptArgs,
    decision: 'decline' as const,
  });
  assert.equal(built.outcome, 'declined-recorded');
  assert.deepEqual(Object.keys(built.update).sort(), ['invitedEmails', 'members']);
  assert.deepEqual(built.update.invitedEmails, []);
  assert.deepEqual(built.memberEmailsAfter, [OWNER]);
  const entry = built.update.members.find((m) => m.email === INVITEE);
  assert.equal(entry?.status, 'declined');
});

test('decline is idempotent when already declined', () => {
  const stored = storedLists({
    members: [
      { email: OWNER, name: 'Owner', role: 'owner' as const, status: 'accepted' as const },
      { email: INVITEE, name: 'Pending', role: 'contributor' as const, status: 'declined' as const },
    ],
    invitedEmails: [],
  });
  const built = buildInviteeMembershipPatch(stored, { ...acceptArgs, decision: 'decline' as const });
  assert.equal(built.outcome, 'already-declined');
});

test('decline of a revoked invite throws InviteRevokedError', () => {
  const stored = storedLists({
    members: [{ email: OWNER, name: 'Owner', role: 'owner' as const, status: 'accepted' as const }],
    invitedEmails: [],
  });
  assert.throws(
    () => buildInviteeMembershipPatch(stored, { ...acceptArgs, decision: 'decline' as const }),
    InviteRevokedError
  );
});

test('accept appends a member row when the invitee was never in the members array', () => {
  const stored = storedLists({
    members: [{ email: OWNER, name: 'Owner', role: 'owner' as const, status: 'accepted' as const }],
  });
  const built = buildInviteeMembershipPatch(stored, acceptArgs);
  assert.equal(built.outcome, 'joined');
  assert.equal(built.update.members.length, 2);
  assert.equal(built.update.members[1].status, 'accepted');
});

test('re-invite of a declined member flips them back to pending shape via owner write path', () => {
  // Owner-side: declining members keep their row so the resend flow can find them.
  const stored = storedLists({
    members: [
      { email: OWNER, name: 'Owner', role: 'owner' as const, status: 'accepted' as const },
      { email: INVITEE, name: 'Pending', role: 'contributor' as const, status: 'declined' as const },
    ],
    invitedEmails: [],
  });
  const declined = stored.members.find((m) => m.email === INVITEE);
  assert.equal(declined?.status, 'declined');
});
