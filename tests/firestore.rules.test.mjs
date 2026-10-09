import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const projectId = 'project_rules_test';
const ownerEmail = 'owner@example.com';
const managerEmail = 'manager@example.com';
const contributorEmail = 'contributor@example.com';
const inviteeEmail = 'pending@example.com';

let testEnv;

const projectFixture = () => ({
  id: projectId,
  name: 'Rules test project',
  clientName: 'Client',
  address: 'Site',
  description: 'Authorization fixture',
  startDate: '2026-07-18',
  estimatedEndDate: '2026-12-31',
  budget: 0,
  currency: 'DH',
  status: 'planning',
  projectType: 'construction',
  creatorEmail: ownerEmail,
  members: [
    { email: ownerEmail, name: 'Owner', role: 'owner', status: 'accepted' },
    { email: managerEmail, name: 'Manager', role: 'manager', status: 'accepted' },
    { email: contributorEmail, name: 'Contributor', role: 'contributor', status: 'accepted' },
    { email: inviteeEmail, name: 'Pending', role: 'read_only', status: 'pending' },
  ],
  memberEmails: [ownerEmail, managerEmail, contributorEmail],
  invitedEmails: [inviteeEmail],
  memberRoleByEmail: {
    [ownerEmail]: 'owner',
    [managerEmail]: 'manager',
    [contributorEmail]: 'contributor',
    [inviteeEmail]: 'read_only',
  },
  sections: [],
  expenses: [],
  tasks: [],
  photos: [],
  documents: [],
  reimbursements: [],
  rentalBookings: [],
});

const context = (uid, email) => testEnv.authenticatedContext(uid, { email });
const projectRef = (ctx) => doc(ctx.firestore(), 'projects', projectId);

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-hs-tracker',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(projectRef(ctx), projectFixture());
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('pending invitees can fetch the invited project but cannot list projects', async () => {
  const pendingDb = context('pending', inviteeEmail).firestore();
  await assertSucceeds(getDoc(doc(pendingDb, 'projects', projectId)));
  await assertFails(getDocs(query(
    collection(pendingDb, 'projects'),
    where('invitedEmails', 'array-contains', inviteeEmail)
  )));
  await assertSucceeds(getDoc(projectRef(context('contributor', contributorEmail))));
});

test('contributors can update content but cannot rewrite access lists', async () => {
  const contributorRef = projectRef(context('contributor', contributorEmail));
  await assertSucceeds(updateDoc(contributorRef, {
    tasks: [{ id: 'task_1', title: 'Allowed content update' }],
  }));
  await assertFails(updateDoc(contributorRef, {
    memberEmails: [...projectFixture().memberEmails, 'outsider@example.com'],
  }));
  await assertFails(updateDoc(contributorRef, {
    rentalOwnerPayments: [{ id: 'payment', date: '2026-07-29', amount: 1000 }],
  }));
});

test('versioned project records inherit access and preserve role boundaries', async () => {
  const ownerDb = context('owner', ownerEmail).firestore();
  const managerDb = context('manager', managerEmail).firestore();
  const contributorDb = context('contributor', contributorEmail).firestore();
  const pendingDb = context('pending', inviteeEmail).firestore();
  const outsiderDb = context('outsider', 'outsider@example.com').firestore();
  const ownerRef = projectRef(context('owner', ownerEmail));

  await assertSucceeds(updateDoc(ownerRef, {
    storageVersion: 2,
    recordRevision: '2026-07-31T12:00:00.000Z',
    recordCounts: { task: 0 },
  }));
  await assertSucceeds(updateDoc(projectRef(context('contributor', contributorEmail)), {
    recordRevision: '2026-07-31T12:01:00.000Z',
    recordCounts: { task: 1 },
  }));

  const taskRecord = {
    projectId,
    kind: 'task',
    entityId: 'task-v2',
    payload: { id: 'task-v2', title: 'Allowed task' },
    updatedAt: '2026-07-31T12:01:00.000Z',
    updatedBy: contributorEmail,
  };
  const taskRef = doc(contributorDb, 'projects', projectId, 'records', 'task__task-v2');
  await assertSucceeds(setDoc(taskRef, taskRecord));
  await assertSucceeds(getDoc(doc(managerDb, 'projects', projectId, 'records', 'task__task-v2')));
  await assertFails(getDoc(doc(pendingDb, 'projects', projectId, 'records', 'task__task-v2')));
  await assertFails(getDoc(doc(outsiderDb, 'projects', projectId, 'records', 'task__task-v2')));
  await assertFails(updateDoc(projectRef(context('pending', inviteeEmail)), {
    memberEmails: [...projectFixture().memberEmails, inviteeEmail],
    memberRoleByEmail: {
      ...projectFixture().memberRoleByEmail,
      [inviteeEmail]: 'manager',
    },
    invitedEmails: [],
  }));
  await assertSucceeds(updateDoc(projectRef(context('pending', inviteeEmail)), {
    members: projectFixture().members.map((member) =>
      member.email === inviteeEmail ? { ...member, status: 'accepted' } : member
    ),
    memberEmails: [...projectFixture().memberEmails, inviteeEmail],
    memberRoleByEmail: projectFixture().memberRoleByEmail,
    invitedEmails: [],
  }));
  await assertSucceeds(getDoc(doc(pendingDb, 'projects', projectId, 'records', 'task__task-v2')));

  await assertFails(setDoc(
    doc(contributorDb, 'projects', projectId, 'records', 'owner-payment'),
    {
      ...taskRecord,
      kind: 'rental_owner_payment',
      entityId: 'owner-payment',
      payload: { id: 'owner-payment', amount: 1000 },
    }
  ));
  await assertSucceeds(setDoc(
    doc(managerDb, 'projects', projectId, 'records', 'owner-payment'),
    {
      ...taskRecord,
      kind: 'rental_owner_payment',
      entityId: 'owner-payment',
      payload: { id: 'owner-payment', amount: 1000 },
      updatedBy: managerEmail,
    }
  ));
  await assertFails(setDoc(
    doc(contributorDb, 'projects', projectId, 'records', 'spoofed-task'),
    { ...taskRecord, entityId: 'spoofed-task', updatedBy: ownerEmail }
  ));
  await assertSucceeds(deleteDoc(taskRef));

  const deleteBatch = writeBatch(ownerDb);
  deleteBatch.delete(doc(ownerDb, 'projects', projectId, 'records', 'owner-payment'));
  deleteBatch.delete(doc(ownerDb, 'projects', projectId));
  await assertSucceeds(deleteBatch.commit());
});

test('invitees accept with a surgical membership patch (no role map, no records)', async () => {
  const pendingRef = projectRef(context('pending', inviteeEmail));
  const acceptedMembers = projectFixture().members.map((member) =>
    member.email === inviteeEmail ? { ...member, status: 'accepted' } : member
  );
  // Exact shape the app writes: members + memberEmails + invitedEmails only.
  await assertSucceeds(updateDoc(pendingRef, {
    members: acceptedMembers,
    memberEmails: [...projectFixture().memberEmails, inviteeEmail],
    invitedEmails: [],
  }));
  // Membership granted: the project root stays readable (records inherit access).
  await assertSucceeds(getDoc(pendingRef));
});

test('invitees decline by leaving the invite lists without joining members', async () => {
  const pendingRef = projectRef(context('pending', inviteeEmail));
  const declinedMembers = projectFixture().members.map((member) =>
    member.email === inviteeEmail ? { ...member, status: 'declined' } : member
  );
  await assertSucceeds(updateDoc(pendingRef, {
    members: declinedMembers,
    invitedEmails: [],
  }));
  // No longer invited and never a member: the project doc is unreadable again.
  await assertFails(getDoc(pendingRef));
});

test('outsiders cannot self-add through the invitee patch', async () => {
  const outsiderRef = projectRef(context('outsider', 'outsider@example.com'));
  await assertFails(updateDoc(outsiderRef, {
    members: [
      ...projectFixture().members,
      { email: 'outsider@example.com', name: 'Outsider', role: 'contributor', status: 'accepted' },
    ],
    memberEmails: [...projectFixture().memberEmails, 'outsider@example.com'],
    invitedEmails: [],
  }));
});

test('invitees cannot touch anything outside the membership patch', async () => {
  const pendingRef = projectRef(context('pending', inviteeEmail));
  const acceptedMembers = projectFixture().members.map((member) =>
    member.email === inviteeEmail ? { ...member, status: 'accepted' } : member
  );
  await assertFails(updateDoc(pendingRef, {
    members: acceptedMembers,
    memberEmails: [...projectFixture().memberEmails, inviteeEmail],
    invitedEmails: [],
    tasks: [{ id: 'task_smuggled', title: 'Smuggled task' }],
  }));
  await assertFails(updateDoc(pendingRef, {
    members: acceptedMembers,
    memberEmails: [...projectFixture().memberEmails, inviteeEmail],
    invitedEmails: [],
    budget: 999999,
  }));
});

test('new operational records enforce contributor and manager boundaries', async () => {
  const contributorDb = context('contributor', contributorEmail).firestore();
  const managerDb = context('manager', managerEmail).firestore();
  const base = { projectId, entityId: 'record', payload: { id: 'record' }, updatedAt: '2026-08-01T10:00:00Z' };

  for (const kind of ['rental_calendar_block', 'contact', 'construction_change_order', 'construction_site_log']) {
    await assertSucceeds(setDoc(doc(contributorDb, 'projects', projectId, 'records', `${kind}__record`), { ...base, kind, updatedBy: contributorEmail }));
  }
  for (const kind of ['rental_owner_statement', 'construction_funding', 'construction_purchase_order', 'construction_budget_commitment']) {
    await assertFails(setDoc(doc(contributorDb, 'projects', projectId, 'records', `${kind}__record`), { ...base, kind, updatedBy: contributorEmail }));
    await assertSucceeds(setDoc(doc(managerDb, 'projects', projectId, 'records', `${kind}__record`), { ...base, kind, updatedBy: managerEmail }));
  }
});

test('private contact directory is isolated by user id', async () => {
  const ownerDb = context('owner', ownerEmail).firestore();
  const outsiderDb = context('outsider', 'outsider@example.com').firestore();
  const contactRef = doc(ownerDb, 'users', 'owner', 'contacts', 'contact-1');
  await assertSucceeds(setDoc(contactRef, { id: 'contact-1', name: 'Client', updatedAt: '2026-08-01T10:00:00Z' }));
  await assertSucceeds(getDoc(contactRef));
  await assertFails(getDoc(doc(outsiderDb, 'users', 'owner', 'contacts', 'contact-1')));
});

test('a versioned project and its first records can be created atomically', async () => {
  const ownerDb = context('owner-new', ownerEmail).firestore();
  const newProjectId = 'project_rules_versioned_new';
  const batch = writeBatch(ownerDb);
  batch.set(doc(ownerDb, 'projects', newProjectId), {
    ...projectFixture(),
    id: newProjectId,
    storageVersion: 2,
    recordRevision: '2026-07-31T13:00:00.000Z',
    recordCounts: { task: 1 },
    sections: [],
    expenses: [],
    tasks: [],
    photos: [],
    documents: [],
    reimbursements: [],
    rentalBookings: [],
  });
  batch.set(doc(ownerDb, 'projects', newProjectId, 'records', 'task__initial'), {
    projectId: newProjectId,
    kind: 'task',
    entityId: 'initial',
    payload: { id: 'initial', title: 'Initial task' },
    updatedAt: '2026-07-31T13:00:00.000Z',
    updatedBy: ownerEmail,
  });
  await assertSucceeds(batch.commit());
});

test('only the creator can migrate legacy arrays to versioned records', async () => {
  const managerDb = context('manager', managerEmail).firestore();
  await assertFails(updateDoc(doc(managerDb, 'projects', projectId), {
    storageVersion: 2,
    recordRevision: '2026-07-31T14:00:00.000Z',
    recordCounts: { task: 0 },
  }));

  const ownerDb = context('owner', ownerEmail).firestore();
  const migration = writeBatch(ownerDb);
  migration.update(doc(ownerDb, 'projects', projectId), {
    storageVersion: 2,
    recordRevision: '2026-07-31T14:01:00.000Z',
    recordCounts: { task: 1 },
    sections: deleteField(),
    expenses: deleteField(),
    tasks: deleteField(),
    photos: deleteField(),
    documents: deleteField(),
    reimbursements: deleteField(),
    rentalBookings: deleteField(),
  });
  migration.set(doc(ownerDb, 'projects', projectId, 'records', 'task__migrated'), {
    projectId,
    kind: 'task',
    entityId: 'migrated',
    payload: { id: 'migrated', title: 'Preserved task' },
    updatedAt: '2026-07-31T14:01:00.000Z',
    updatedBy: ownerEmail,
  });
  await assertSucceeds(migration.commit());
});

test('versioned record deletion creates recoverable trash with admin-only restore', async () => {
  const ownerDb = context('owner', ownerEmail).firestore();
  const contributorDb = context('contributor', contributorEmail).firestore();
  const managerDb = context('manager', managerEmail).firestore();
  const outsiderDb = context('outsider', 'outsider@example.com').firestore();
  const revision = '2026-07-31T15:00:00.000Z';

  await updateDoc(doc(ownerDb, 'projects', projectId), {
    storageVersion: 2,
    recordRevision: revision,
    recordCounts: { task: 1 },
  });
  const activeRef = doc(ownerDb, 'projects', projectId, 'records', 'task__recoverable');
  await setDoc(activeRef, {
    projectId,
    kind: 'task',
    entityId: 'recoverable',
    payload: { id: 'recoverable', title: 'Recover me' },
    updatedAt: revision,
    updatedBy: ownerEmail,
  });

  const deletedAt = '2026-07-31T15:01:00.000Z';
  const contributorDelete = writeBatch(contributorDb);
  contributorDelete.set(
    doc(contributorDb, 'projects', projectId, 'trash', 'task__recoverable'),
    {
      projectId,
      kind: 'task',
      entityId: 'recoverable',
      payload: { id: 'recoverable', title: 'Recover me' },
      updatedAt: revision,
      updatedBy: ownerEmail,
      deletedAt,
      deletedBy: contributorEmail,
    }
  );
  contributorDelete.delete(
    doc(contributorDb, 'projects', projectId, 'records', 'task__recoverable')
  );
  contributorDelete.update(doc(contributorDb, 'projects', projectId), {
    recordRevision: deletedAt,
    recordCounts: { task: 0 },
  });
  await assertSucceeds(contributorDelete.commit());

  const contributorTrashRef = doc(
    contributorDb,
    'projects',
    projectId,
    'trash',
    'task__recoverable'
  );
  await assertSucceeds(getDoc(contributorTrashRef));
  await assertFails(getDoc(doc(
    outsiderDb,
    'projects',
    projectId,
    'trash',
    'task__recoverable'
  )));
  await assertFails(deleteDoc(contributorTrashRef));

  const restoredAt = '2026-07-31T15:02:00.000Z';
  const managerRestore = writeBatch(managerDb);
  managerRestore.set(doc(managerDb, 'projects', projectId, 'records', 'task__recoverable'), {
    projectId,
    kind: 'task',
    entityId: 'recoverable',
    payload: { id: 'recoverable', title: 'Recover me' },
    updatedAt: restoredAt,
    updatedBy: managerEmail,
  });
  managerRestore.delete(doc(
    managerDb,
    'projects',
    projectId,
    'trash',
    'task__recoverable'
  ));
  managerRestore.update(doc(managerDb, 'projects', projectId), {
    recordRevision: restoredAt,
    recordCounts: { task: 1 },
  });
  await assertSucceeds(managerRestore.commit());
});

test('managers cannot remove or demote the project owner', async () => {
  const managerRef = projectRef(context('manager', managerEmail));
  await assertFails(updateDoc(managerRef, {
    memberEmails: [managerEmail, contributorEmail],
    memberRoleByEmail: {
      [managerEmail]: 'manager',
      [contributorEmail]: 'contributor',
    },
  }));
});

test('only the creator can delete a project', async () => {
  await assertFails(deleteDoc(projectRef(context('manager', managerEmail))));
  await assertSucceeds(deleteDoc(projectRef(context('owner', ownerEmail))));
});

test('outsiders cannot read rental or construction project data', async () => {
  await assertFails(getDoc(projectRef(context('outsider', 'outsider@example.com'))));
});

test('rental settings accept zero commission and reject malformed financial data', async () => {
  const ownerRef = projectRef(context('owner', ownerEmail));
  const validRentalProperty = {
    ownerName: 'Apartment Owner',
    ownerEmail: 'apartment-owner@example.com',
    ownerPhone: '+212600000000',
    buildingNumber: 'A-12',
    pricePerNight: 700,
    commissionRate: 0,
    monthlyCommissionRates: { '2026-07': 0 },
    notes: 'Valid rental settings',
  };

  await assertSucceeds(updateDoc(ownerRef, {
    projectType: 'rental',
    rentalProperty: validRentalProperty,
  }));
  await assertFails(updateDoc(ownerRef, {
    rentalProperty: { ...validRentalProperty, commissionRate: -1 },
  }));
  await assertFails(updateDoc(ownerRef, {
    rentalProperty: { ...validRentalProperty, pricePerNight: '700' },
  }));
  await assertFails(updateDoc(ownerRef, {
    rentalBookings: 'not-a-list',
  }));
  await assertSucceeds(updateDoc(ownerRef, {
    rentalOwnerPayments: [{
      id: 'owner_payment_1',
      date: '2026-07-29',
      period: '2026-07',
      amount: 2500,
      method: 'bank_transfer',
    }],
  }));
  await assertFails(updateDoc(ownerRef, {
    rentalOwnerPayments: 'not-a-list',
  }));
});

test('only project admins can create invitations', async () => {
  const invitation = {
    id: 'invite_rules_test',
    projectId,
    projectName: 'Rules test project',
    ownerEmail: managerEmail,
    ownerName: 'Manager',
    inviteeEmail: 'new@example.com',
    role: 'contributor',
    status: 'pending',
    timestamp: '2026-07-18T00:00:00.000Z',
  };
  const managerDb = context('manager', managerEmail).firestore();
  const outsiderDb = context('outsider', 'outsider@example.com').firestore();

  await assertSucceeds(setDoc(doc(managerDb, 'invitations', invitation.id), invitation));
  await assertFails(setDoc(doc(outsiderDb, 'invitations', 'invite_outsider'), {
    ...invitation,
    id: 'invite_outsider',
    ownerEmail: 'outsider@example.com',
  }));
});

test('activity writers cannot spoof actors or expand readers', async () => {
  const contributorDb = context('contributor', contributorEmail).firestore();
  const baseActivity = {
    id: 'activity_rules_test',
    projectId,
    userEmail: contributorEmail,
    userName: 'Contributor',
    actionType: 'task_updated',
    actionDetails: 'Updated a task',
    timestamp: '2026-07-18 00:00',
    memberEmails: projectFixture().memberEmails,
  };

  await assertSucceeds(setDoc(doc(contributorDb, 'activities', baseActivity.id), baseActivity));
  await assertFails(setDoc(doc(contributorDb, 'activities', 'activity_extra_reader'), {
    ...baseActivity,
    id: 'activity_extra_reader',
    memberEmails: [...baseActivity.memberEmails, 'outsider@example.com'],
  }));
  await assertFails(setDoc(doc(contributorDb, 'activities', 'activity_spoofed_actor'), {
    ...baseActivity,
    id: 'activity_spoofed_actor',
    userEmail: ownerEmail,
  }));
});

test('activity listeners must constrain results to the signed-in project member', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'activities', 'activity_query_test'), {
      id: 'activity_query_test',
      projectId,
      userEmail: contributorEmail,
      userName: 'Contributor',
      actionType: 'booking_added',
      actionDetails: 'Added a booking',
      timestamp: '2026-07-30 10:00',
      memberEmails: projectFixture().memberEmails,
    });
  });

  const contributorDb = context('contributor', contributorEmail).firestore();
  const outsiderDb = context('outsider', 'outsider@example.com').firestore();
  const activityQuery = (db, email) => query(
    collection(db, 'activities'),
    where('projectId', '==', projectId),
    where('memberEmails', 'array-contains', email),
    orderBy('timestamp', 'desc'),
    limit(100),
  );

  const result = await assertSucceeds(getDocs(activityQuery(contributorDb, contributorEmail)));
  const outsiderResult = await assertSucceeds(
    getDocs(activityQuery(outsiderDb, 'outsider@example.com')),
  );
  await assertFails(getDocs(activityQuery(outsiderDb, contributorEmail)));
  if (result.size !== 1) {
    throw new Error(`Expected one activity, received ${result.size}`);
  }
  if (!outsiderResult.empty) {
    throw new Error(`Expected no outsider activities, received ${outsiderResult.size}`);
  }
});

test('project gallery media is limited to accepted project writers', async () => {
  const contributorDb = context('contributor', contributorEmail).firestore();
  const pendingDb = context('pending', inviteeEmail).firestore();
  const outsiderDb = context('outsider', 'outsider@example.com').firestore();
  const media = {
    projectId,
    taskId: '_project_gallery',
    category: 'project_gallery',
    fileName: 'site-progress.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1,
    uploadDate: '2026-07-30T12:00:00.000Z',
    dataUrl: 'data:image/jpeg;base64,AA==',
  };

  const acceptedRef = doc(contributorDb, 'project_task_media', 'gallery_media_accepted');
  await assertSucceeds(setDoc(acceptedRef, media));
  await assertSucceeds(getDoc(acceptedRef));
  await assertFails(setDoc(
    doc(pendingDb, 'project_task_media', 'gallery_media_pending'),
    media,
  ));
  await assertFails(setDoc(
    doc(outsiderDb, 'project_task_media', 'gallery_media_outsider'),
    media,
  ));
  await assertFails(getDoc(
    doc(outsiderDb, 'project_task_media', 'gallery_media_accepted'),
  ));
});

test('generated documents use atomic counters, immutable numbers, and cancellation', async () => {
  const contributorDb = context('contributor', contributorEmail).firestore();
  const outsiderDb = context('outsider', 'outsider@example.com').firestore();
  const counterRef = doc(contributorDb, 'projects', projectId, 'document_counters', 'invoice_2026');
  const documentRef = doc(contributorDb, 'projects', projectId, 'generated_documents', 'invoice_2026_000001');
  const now = '2026-08-01T12:00:00.000Z';
  const generatedDocument = {
    id: 'invoice_2026_000001',
    projectId,
    kind: 'invoice',
    number: 'FAC-2026-0001',
    status: 'draft',
    version: 1,
    documentDate: '2026-08-01',
    dueDate: '2026-08-15',
    currency: 'DH',
    issuer: { name: 'HS Tracker', email: '', phone: '', address: '' },
    recipient: { name: 'Client', email: '', phone: '', address: '', kind: 'client' },
    items: [{ id: 'line-1', description: 'Renovation work', quantity: 1, unitPrice: 1200 }],
    visibleColumns: ['description', 'unitPrice', 'total'],
    taxRate: 0,
    notes: '',
    subtotal: 1200,
    total: 1200,
    createdAt: now,
    createdBy: contributorEmail,
    updatedAt: now,
    updatedBy: contributorEmail,
  };

  const createBatch = writeBatch(contributorDb);
  createBatch.set(counterRef, {
    projectId,
    kind: 'invoice',
    year: 2026,
    nextNumber: 1,
    updatedAt: now,
    updatedBy: contributorEmail,
  });
  createBatch.set(documentRef, generatedDocument);
  await assertSucceeds(createBatch.commit());
  await assertSucceeds(getDoc(documentRef));
  await assertFails(getDoc(doc(outsiderDb, 'projects', projectId, 'generated_documents', generatedDocument.id)));

  await assertFails(updateDoc(counterRef, { nextNumber: 3, updatedAt: now, updatedBy: contributorEmail }));
  await assertFails(updateDoc(documentRef, {
    number: 'FAC-2026-9999',
    version: 2,
    updatedAt: now,
    updatedBy: contributorEmail,
  }));
  await assertFails(updateDoc(documentRef, {
    status: 'finalized',
    version: 3,
    updatedAt: now,
    updatedBy: contributorEmail,
  }));
  await assertSucceeds(updateDoc(documentRef, {
    status: 'cancelled',
    version: 2,
    updatedAt: '2026-08-01T12:01:00.000Z',
    updatedBy: contributorEmail,
  }));
  await assertFails(deleteDoc(documentRef));
  await assertFails(deleteDoc(counterRef));
});

test('AI undo deltas are private to members and removable by their author', async () => {
  const contributorDb = context('contributor', contributorEmail).firestore();
  const outsiderDb = context('outsider', 'outsider@example.com').firestore();
  const entry = {
    id: 'undo_rules_test',
    projectId,
    createdAt: '2026-08-01T12:00:00.000Z',
    createdBy: contributorEmail,
    previousRootValues: {},
    missingRootKeys: [],
    recordChanges: [{
      recordId: 'task__task-1',
      kind: 'task',
      previous: null,
    }],
  };
  const entryRef = doc(contributorDb, 'projects', projectId, 'ai_undo', entry.id);
  await assertSucceeds(setDoc(entryRef, entry));
  await assertFails(getDoc(doc(outsiderDb, 'projects', projectId, 'ai_undo', entry.id)));
  await assertFails(setDoc(
    doc(contributorDb, 'projects', projectId, 'ai_undo', 'undo_spoofed'),
    { ...entry, id: 'undo_spoofed', createdBy: ownerEmail },
  ));
  await assertFails(updateDoc(entryRef, { createdAt: '2026-08-01T12:01:00.000Z' }));
  await assertSucceeds(deleteDoc(entryRef));
});
