import { collectionGroup, getDocs, limit, query, where } from 'firebase/firestore';
import type { QuerySnapshot, DocumentData } from 'firebase/firestore';
import { firestore } from '../firebase/client';

/**
 * Team membership documents must carry their account UID as data.
 *
 * A collection-group query cannot safely fall back to a bare document ID:
 * Firestore interprets documentId() as a full document path for collection
 * groups. Keeping this lookup in one place prevents that invalid fallback from
 * returning inconsistent roles or leaving membership data behind on deletion.
 */
export async function getMembershipsByUid(
  uid: string,
  maximum?: number,
): Promise<QuerySnapshot<DocumentData, DocumentData>> {
  const memberships = collectionGroup(firestore, 'members');
  const membershipQuery = maximum === undefined
    ? query(memberships, where('uid', '==', uid))
    : query(memberships, where('uid', '==', uid), limit(maximum));
  return getDocs(membershipQuery);
}
