#!/usr/bin/env node

/**
 * Firestore Security Rules smoke test for private all-star voting data.
 *
 * The Admin SDK is used only to seed disposable emulator fixtures. Every
 * assertion is executed with the Firebase Web SDK so Firestore Rules are
 * evaluated exactly as they are for a browser client.
 */

import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import process from "node:process";
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  setDoc,
  setLogLevel,
  terminate,
  updateDoc,
} from "firebase/firestore";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;

if (!emulatorHost) {
  throw new Error("FIRESTORE_EMULATOR_HOST is required; refusing to contact a real Firestore database.");
}

if (!projectId?.startsWith("demo-")) {
  throw new Error(`A demo-* project is required for the rules smoke test (received: ${projectId ?? "none"}).`);
}

const separator = emulatorHost.lastIndexOf(":");
const host = emulatorHost.slice(0, separator);
const port = Number(emulatorHost.slice(separator + 1));

if (!host || !Number.isInteger(port)) {
  throw new Error(`Invalid FIRESTORE_EMULATOR_HOST: ${emulatorHost}`);
}

setLogLevel("silent");

const eventId = `rules-smoke-${Date.now()}`;
const eventPath = `allstarVotingEvents/${eventId}`;
const featureFlagPath = "publicFeatureFlags/allstar";
const featureAuditPath = `featureFlagAudit/rules-smoke-${Date.now()}`;
const protectedDocuments = {
  configLocks: `${eventPath}/configLocks/allstar`,
  ballots: `${eventPath}/ballots/seeded-ballot`,
  voterEligibility: `${eventPath}/voterEligibility/seeded-eligibility`,
  resultDrafts: `${eventPath}/resultDrafts/allstar`,
  publicResults: `${eventPath}/publicResults/allstar`,
};

const counters = { passed: 0, failed: 0 };
const clients = [];

function permissionDenied(error) {
  return error?.code === "permission-denied" || error?.code === "firestore/permission-denied";
}

async function expectDenied(label, operation) {
  try {
    await operation();
  } catch (error) {
    if (permissionDenied(error)) {
      counters.passed += 1;
      return;
    }
    counters.failed += 1;
    throw new Error(`${label}: expected permission-denied, received ${error?.code ?? error}`, { cause: error });
  }

  counters.failed += 1;
  throw new Error(`${label}: operation unexpectedly succeeded`);
}

async function expectAllowed(label, operation) {
  try {
    await operation();
    counters.passed += 1;
  } catch (error) {
    counters.failed += 1;
    throw new Error(`${label}: operation unexpectedly failed with ${error?.code ?? error}`, { cause: error });
  }
}

function createClient(name, mockUserToken) {
  const app = initializeApp(
    {
      apiKey: "rules-smoke-test-key",
      appId: `rules-smoke-${name}`,
      projectId,
    },
    `rules-smoke-${name}-${Date.now()}`,
  );
  const db = getFirestore(app);

  if (mockUserToken) {
    connectFirestoreEmulator(db, host, port, { mockUserToken });
  } else {
    connectFirestoreEmulator(db, host, port);
  }

  clients.push({ app, db });
  return db;
}

function token(uid, claims = {}) {
  return {
    sub: uid,
    user_id: uid,
    email: `${uid}@example.invalid`,
    email_verified: true,
    firebase: { sign_in_provider: "google.com" },
    ...claims,
  };
}

function collectionPath(documentPath) {
  return documentPath.split("/").slice(0, -1).join("/");
}

async function assertFullyBlocked(identity, db) {
  for (const [area, documentPath] of Object.entries(protectedDocuments)) {
    const existing = doc(db, documentPath);
    const parent = collection(db, collectionPath(documentPath));
    const createTarget = doc(parent, `client-created-${identity}`);

    await expectDenied(`${identity} cannot get ${area}`, () => getDoc(existing));
    await expectDenied(`${identity} cannot list ${area}`, () => getDocs(query(parent, limit(1))));
    await expectDenied(`${identity} cannot create ${area}`, () => setDoc(createTarget, { probe: identity }));
    await expectDenied(`${identity} cannot update ${area}`, () => updateDoc(existing, { probe: identity }));
    await expectDenied(`${identity} cannot delete ${area}`, () => deleteDoc(existing));
  }
}

async function assertPrivilegedReadBoundary(identity, db, allowedAreas) {
  for (const [area, documentPath] of Object.entries(protectedDocuments)) {
    const existing = doc(db, documentPath);
    const parent = collection(db, collectionPath(documentPath));
    const readExpectation = allowedAreas.has(area) ? expectAllowed : expectDenied;

    await readExpectation(`${identity} get boundary for ${area}`, () => getDoc(existing));
    await readExpectation(`${identity} list boundary for ${area}`, () => getDocs(query(parent, limit(1))));

    // Cloud Functions/Admin SDK are the only writers for protected voting areas.
    await expectDenied(`${identity} cannot create ${area}`, () =>
      setDoc(doc(parent, `privileged-created-${identity}`), { probe: identity }),
    );
    await expectDenied(`${identity} cannot update ${area}`, () => updateDoc(existing, { probe: identity }));
    await expectDenied(`${identity} cannot delete ${area}`, () => deleteDoc(existing));
  }
}

async function assertFeatureFlagBoundary(identity, db, canReadAudit) {
  const feature = doc(db, featureFlagPath);
  const featureCollection = collection(db, "publicFeatureFlags");
  await expectAllowed(`${identity} can read public feature flag`, () => getDoc(feature));
  await expectAllowed(`${identity} can list public feature flags`, () => getDocs(query(featureCollection, limit(1))));
  await expectDenied(`${identity} cannot create public feature flag`, () =>
    setDoc(doc(featureCollection, `client-created-${identity}`), { enabled: true }),
  );
  await expectDenied(`${identity} cannot update public feature flag`, () => updateDoc(feature, { enabled: true }));
  await expectDenied(`${identity} cannot delete public feature flag`, () => deleteDoc(feature));

  const audit = doc(db, featureAuditPath);
  const auditCollection = collection(db, "featureFlagAudit");
  const readExpectation = canReadAudit ? expectAllowed : expectDenied;
  await readExpectation(`${identity} audit get boundary`, () => getDoc(audit));
  await readExpectation(`${identity} audit list boundary`, () => getDocs(query(auditCollection, limit(1))));
  await expectDenied(`${identity} cannot create feature audit`, () =>
    setDoc(doc(auditCollection, `client-created-${identity}`), { feature: "allstar" }),
  );
  await expectDenied(`${identity} cannot update feature audit`, () => updateDoc(audit, { feature: "changed" }));
  await expectDenied(`${identity} cannot delete feature audit`, () => deleteDoc(audit));
}

const adminApp = initializeAdminApp({ projectId }, `rules-smoke-seed-${Date.now()}`);
const adminDb = getAdminFirestore(adminApp);

try {
  await adminDb.doc(eventPath).set({ title: "Disposable rules smoke fixture" });
  await adminDb.doc(featureFlagPath).set({ schemaVersion: 1, enabled: false, revision: 1 });
  await adminDb.doc(featureAuditPath).set({ feature: "allstar", seeded: true });
  await Promise.all(
    Object.entries(protectedDocuments).map(([area, documentPath]) =>
      adminDb.doc(documentPath).set({ area, seeded: true }),
    ),
  );

  const unauthenticated = createClient("unauthenticated");
  const regularUser = createClient("regular-user", token("regular-user"));
  const adminOnly = createClient("admin-only", token("admin-only", { admin: true }));
  const auditorOnly = createClient("auditor-only", token("auditor-only", { allstarVoteAuditor: true }));
  const adminAuditor = createClient("admin-auditor", token("admin-auditor", { admin: true, allstarVoteAuditor: true }));

  await assertFullyBlocked("unauthenticated", unauthenticated);
  await assertFullyBlocked("regular-user", regularUser);

  await assertPrivilegedReadBoundary(
    "admin-only",
    adminOnly,
    new Set(["publicResults"]),
  );
  await assertPrivilegedReadBoundary(
    "auditor-only",
    auditorOnly,
    new Set(),
  );
  await assertPrivilegedReadBoundary(
    "admin-auditor",
    adminAuditor,
    new Set(["ballots", "voterEligibility", "publicResults"]),
  );

  await assertFeatureFlagBoundary("unauthenticated", unauthenticated, false);
  await assertFeatureFlagBoundary("regular-user", regularUser, false);
  await assertFeatureFlagBoundary("admin-only", adminOnly, true);
  await assertFeatureFlagBoundary("auditor-only", auditorOnly, false);
  await assertFeatureFlagBoundary("admin-auditor", adminAuditor, true);

  process.stdout.write(
    JSON.stringify(
      {
        status: "PASS",
        assertions: counters.passed,
        projectId,
        emulator: emulatorHost,
        verified: {
          unauthenticatedAndRegularUsers: "no direct read or write",
          adminOnly: "publicResults read only",
          auditorOnly: "no direct read or write",
          adminAndAuditor: "ballots/voterEligibility/publicResults read only",
          configLocks: "no client access for any tested identity",
          resultDrafts: "no client access for any tested identity",
          publicFeatureFlags: "public read and Admin SDK-only write",
          featureFlagAudit: "admin read and Admin SDK-only write",
        },
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await Promise.allSettled(clients.map(({ db }) => terminate(db)));
  await Promise.allSettled(clients.map(({ app }) => deleteApp(app)));
  await adminDb.recursiveDelete(adminDb.doc(eventPath));
  await adminDb.doc(featureFlagPath).delete();
  await adminDb.doc(featureAuditPath).delete();
  await deleteAdminApp(adminApp);
}
