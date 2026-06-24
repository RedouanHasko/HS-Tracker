# Security Specification

This security specification outlines the data invariants, threat model, and validation layers designed to secure the BuildTrack (budget tracking, partners & activities) application on Firestore.

## 1. Data Invariants

1. **User Profile Ownership**: A user profile document ID (`userId`) must match the authenticated `request.auth.uid`. No user can create or modify another user's profile.
2. **Project Membership**: Read and write access to a project is strictly restricted to its creator (`creatorEmail`) or its listed collaborators/members (`memberEmails`).
3. **Invitation Legitimacy**: An invitation can only be created by the sender (`ownerEmail` == user) and can only have its status accepted or declined by the target recipient (`inviteeEmail` == user).
4. **PII and Private Isolation**: Private notifications can only be accessed or deleted by the recipient of the notification.

---

## 2. Threat Model: "The Dirty Dozen" Payloads

We design security rules to completely repel and deny the following 12 malicious operations:

1. **Profile Spoofing**: Attempt to write a public user profile under a UID that does not match the active auth UID.
2. **Profile Hijacking**: Attempt to update someone else's user profile.
3. **Project Injection**: Attempt to create a project claiming the creator is a victim's email address.
4. **Project Access Theft**: Attempt to retrieve details of a project where the requester is neither the creator nor a project member.
5. **Project Vandalism**: Attempt to update details of a project from an unauthorized account.
6. **Project Deletion Exploit**: Attempt to delete a project when not the designated creator.
7. **Invitation Forge**: Attempt to send an invitation where the sender's `ownerEmail` is spoofed to be anyone else.
8. **Invitation Hijack**: Attempt to accept/decline an invitation meant for a different recipient.
9. **Id Resource Poisoning**: Attempt to create a project using a 10KB string as an ID, risking resources/indexing exhaustion.
10. **Activity Spoofing**: Attempt to write arbitrary log activities under a project the user is not a member of.
11. **Notification Snooping**: Attempt to query/listen to private notifications belonging to another user.
12. **Immutable Field Tampering**: Attempt to modify the immutable `creatorEmail` of a project after its initial creation.

---

## 3. Test Cases (TDD Blueprint)

Our security rule suite is validated against these exact scenarios. Each payload defined below is strictly rejected with a `PERMISSION_DENIED` status:

* **T1 (Deny Profile Spoofing)**: `db.doc('user_profiles/victim_uid').set({ fullName: 'Malicious Hack', email: 'attacker@test.com' })`
* **T2 (Deny Profile Hijack)**: `db.doc('user_profiles/victim_uid').update({ fullName: 'Hacked' })`
* **T3 (Deny Project Injection)**: `db.doc('projects/p123').set({ creatorEmail: 'victim@test.com', memberEmails: ['victim@test.com'] })`
* **T4 (Deny Project Access Theft)**: `db.doc('projects/p456').get()` (Requester is not a member)
* **T5 (Deny Project Vandalism)**: `db.doc('projects/p456').update({ name: 'Hacked' })`
* **T6 (Deny Project Deletion Exploit)**: `db.doc('projects/p456').delete()`
* **T7 (Deny Invitation Forge)**: `db.doc('invitations/i123').set({ ownerEmail: 'victim@test.com', inviteeEmail: 'attacker@test.com', status: 'pending' })`
* **T8 (Deny Invitation Hijack)**: `db.doc('invitations/i123').update({ status: 'accepted' })` (Where inviteeEmail is not the requester)
* **T9 (Deny Id Poisoning)**: `db.doc('projects/very_long_junk_id_xxx...').set({ ... })`
* **T10 (Deny Activity Spoofing)**: `db.doc('activities/act123').set({ projectId: 'victim_project', actionType: 'expense_added' })`
* **T11 (Deny Notification Snooping)**: `db.doc('users/victim_uid/notifications/notif123').get()`
* **T12 (Deny Creator Email Tampering)**: `db.doc('projects/p123').update({ creatorEmail: 'attacker@test.com' })`
