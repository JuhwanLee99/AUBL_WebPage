#!/usr/bin/env node

/**
 * Audit and, when explicitly confirmed, backfill teams/{teamId}/members/{uid}.uid.
 *
 * Dry-run is the default. Mismatched UID fields and duplicate memberships are
 * reported but never modified automatically.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const project = valueAfter('--project');
const confirmProject = valueAfter('--confirm-project');
const execute = args.includes('--execute');

if (!project) {
  console.error('Usage: node scripts/backfill_member_uids.mjs --project PROJECT_ID [--execute --confirm-project PROJECT_ID]');
  process.exit(2);
}
if (execute && confirmProject !== project) {
  console.error('--execute requires --confirm-project to exactly match --project.');
  process.exit(2);
}

const app = initializeApp({ credential: applicationDefault(), projectId: project });
const db = getFirestore(app);
const snapshot = await db.collectionGroup('members').get();
const missing = [];
const mismatched = [];
const pathsByUid = new Map();

for (const member of snapshot.docs) {
  const uidFromPath = member.id;
  const uidFromData = member.get('uid');
  const paths = pathsByUid.get(uidFromPath) ?? [];
  paths.push(member.ref.path);
  pathsByUid.set(uidFromPath, paths);

  if (uidFromData === undefined || uidFromData === null || uidFromData === '') {
    missing.push(member);
  } else if (uidFromData !== uidFromPath) {
    mismatched.push({ path: member.ref.path, documentUid: uidFromPath, storedUid: uidFromData });
  }
}

const duplicates = [...pathsByUid.entries()]
  .filter(([, paths]) => paths.length > 1)
  .map(([uid, paths]) => ({ uid, paths }));

if (execute && missing.length > 0) {
  for (let offset = 0; offset < missing.length; offset += 400) {
    const batch = db.batch();
    for (const member of missing.slice(offset, offset + 400)) {
      batch.update(member.ref, { uid: member.id });
    }
    await batch.commit();
  }
}

const output = {
  project,
  mode: execute ? 'execute' : 'dry-run',
  scanned: snapshot.size,
  backfilled: execute ? missing.length : 0,
  missingUid: missing.map((member) => member.ref.path),
  mismatchedUid: mismatched,
  duplicateMemberships: duplicates,
  queryInvariant: "Runtime lookups use the stored uid field; collection-group documentId fallback is intentionally unused.",
};

console.log(JSON.stringify(output, null, 2));
if (mismatched.length > 0 || duplicates.length > 0) process.exitCode = 1;
