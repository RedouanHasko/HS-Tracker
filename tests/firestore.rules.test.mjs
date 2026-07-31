import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
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
