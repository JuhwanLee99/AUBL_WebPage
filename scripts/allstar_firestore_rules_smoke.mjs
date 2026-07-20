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

const adminApp = initializeAdminApp({ projectId }, `rules-smoke-seed-${Date.now()}`);
const adminDb = getAdminFirestore(adminApp);

try {
  await adminDb.doc(eventPath).set({ title: "Disposable rules smoke fixture" });
  await Promise.all(
    Object.entries(protectedDocuments).map(([area, documentPath]) =>
      adminDb.doc(documentPath).set({ area, seeded: true }),
    ),
  );

  await assertFullyBlocked("unauthenticated", createClient("unauthenticated"));
  await assertFullyBlocked("regular-user", createClient("regular-user", token("regular-user")));

  await assertPrivilegedReadBoundary(
    "admin-only",
    createClient("admin-only", token("admin-only", { admin: true })),
    new Set(["publicResults"]),
  );
  await assertPrivilegedReadBoundary(
    "auditor-only",
    createClient("auditor-only", token("auditor-only", { allstarVoteAuditor: true })),
    new Set(),
  );
  await assertPrivilegedReadBoundary(
    "admin-auditor",
    createClient("admin-auditor", token("admin-auditor", { admin: true, allstarVoteAuditor: true })),
    new Set(["ballots", "voterEligibility", "publicResults"]),
  );

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
  await deleteAdminApp(adminApp);
}
