import { getIdTokenResult } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '../firebase/client';

export async function resolveUserRole(
  user: User | null,
  adminEmails: string[],
): Promise<string | null> {
  if (!user) return null;
  try {
    const token = await getIdTokenResult(user, true);
    if ((token.claims as Record<string, unknown>).admin) return '관리자';
  } catch {
    // ignore token fetch errors; fall back to email list
  }
  const email = user.email?.toLowerCase();
  if (email && adminEmails.includes(email)) return '관리자';
  try {
    const roleDoc = await getDoc(doc(firestore, 'roles', user.uid));
    if (roleDoc.exists() && roleDoc.data()?.role === 'scorer') return '기록원';
  } catch {
    // ignore role lookup errors
  }
  return '일반';
}
