import type { User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { firestore } from '@shared/firebase/client';
import { deltaToPreviewText } from '@shared/components/editor/quillUtils';
import type {
  BlockedUserEntry,
  ModerationReportPayload,
} from '@shared/types';

export type ModerationReasonOption = {
  code: string;
  label: string;
};

export const moderationReasonOptions: ModerationReasonOption[] = [
  { code: 'abuse', label: '욕설/괴롭힘' },
  { code: 'sexual', label: '음란/선정적 내용' },
  { code: 'hate', label: '혐오/차별 표현' },
  { code: 'violence', label: '폭력/위협' },
  { code: 'spam', label: '도배/광고/사기' },
  { code: 'impersonation', label: '사칭/개인정보 침해' },
  { code: 'other', label: '기타' },
];

export type ModerationReasonInput = {
  reasonCode: string;
  detail: string;
};

export function currentUserLabel(user: User | null): string {
  if (!user) return '알 수 없음';
  return user.displayName ?? user.email ?? user.uid;
}

export function clipPreview(text: string, maxLength = 180): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

export function buildContentPreview(content: string): string {
  const preview = deltaToPreviewText(content);
  return clipPreview(preview || content);
}

export async function promptModerationReason(
  actionLabel: '신고' | '차단',
): Promise<ModerationReasonInput | null> {
  const menu = moderationReasonOptions
    .map((option, idx) => `${idx + 1}. ${option.label}`)
    .join('\n');

  const raw = window.prompt(
    `${actionLabel} 사유를 번호로 선택하세요.\n\n${menu}`,
    '1',
  );
  if (raw == null) return null;

  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > moderationReasonOptions.length) {
    window.alert('올바른 번호를 입력해 주세요.');
    return null;
  }

  const selected = moderationReasonOptions[parsed - 1];
  const detail =
    window.prompt('상세 내용을 입력해 주세요. (선택)', '')?.trim() ?? '';

  return {
    reasonCode: selected.code,
    detail,
  };
}

function blockedUsersRef(uid: string) {
  return collection(firestore, 'userModeration', uid, 'blockedUsers');
}

export function watchBlockedUserIds(
  uid: string,
  onData: (blockedUserIds: Set<string>) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    blockedUsersRef(uid),
    (snapshot) => {
      onData(new Set(snapshot.docs.map((entry) => entry.id)));
    },
    onError,
  );
}

export function watchBlockedUsers(
  uid: string,
  onData: (entries: BlockedUserEntry[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  const q = query(blockedUsersRef(uid), orderBy('blockedAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((entry) => {
        const data = entry.data() as {
          label?: string;
          blockedAt?: number;
          lastReasonType?: string;
          lastContentDomain?: string;
        };
        return {
          uid: entry.id,
          label: data.label ?? '알 수 없는 사용자',
          blockedAt: data.blockedAt ?? 0,
          lastReasonType: data.lastReasonType,
          lastContentDomain: data.lastContentDomain,
        } satisfies BlockedUserEntry;
      });
      onData(items);
    },
    onError,
  );
}

export async function unblockUser(
  blockerUid: string,
  blockedUid: string,
): Promise<void> {
  await deleteDoc(doc(firestore, 'userModeration', blockerUid, 'blockedUsers', blockedUid));
}

export async function reportContent(
  reporterUid: string,
  reporterLabel: string,
  payload: ModerationReportPayload,
): Promise<void> {
  await addDoc(collection(firestore, 'contentReports'), {
    action: payload.action,
    reasonType: payload.reasonType,
    reasonDetail: payload.reasonDetail,
    reporterUid,
    reporterLabel,
    targetUid: payload.targetUid,
    targetLabel: payload.targetLabel,
    contentDomain: payload.contentDomain,
    contentId: payload.contentId,
    parentContentId: payload.parentContentId,
    contextId: payload.contextId,
    contentPreview: payload.contentPreview,
    status: 'pending',
    createdAt: Date.now(),
  });
}

export async function blockUserAndReport(
  blockerUid: string,
  blockerLabel: string,
  payload: ModerationReportPayload,
): Promise<void> {
  const now = Date.now();
  const batch = writeBatch(firestore);
  const blockedRef = doc(firestore, 'userModeration', blockerUid, 'blockedUsers', payload.targetUid);
  const reportRef = doc(collection(firestore, 'contentReports'));

  batch.set(
    blockedRef,
    {
      uid: payload.targetUid,
      label: payload.targetLabel,
      blockedAt: now,
      lastReasonType: payload.reasonType,
      lastContentDomain: payload.contentDomain,
    },
    { merge: true },
  );

  batch.set(reportRef, {
    action: 'block',
    reasonType: payload.reasonType,
    reasonDetail: payload.reasonDetail,
    reporterUid: blockerUid,
    reporterLabel: blockerLabel,
    targetUid: payload.targetUid,
    targetLabel: payload.targetLabel,
    contentDomain: payload.contentDomain,
    contentId: payload.contentId,
    parentContentId: payload.parentContentId,
    contextId: payload.contextId,
    contentPreview: payload.contentPreview,
    status: 'pending',
    createdAt: now,
  });

  await batch.commit();
}

export function buildModerationContentLink(
  contentDomain: string,
  contentId: string,
  contextId?: string,
): string | null {
  switch (contentDomain) {
    case 'noticePost':
      return `/community/notices/${contentId}`;
    case 'noticeComment':
      return contextId ? `/community/notices/${contextId}` : null;
    case 'inquiryPost':
      return `/community/inquiry/${contentId}`;
    case 'inquiryComment':
      return contextId ? `/community/inquiry/${contextId}` : null;
    case 'playerRegistrationPost':
      return `/community/player-registration/${contentId}`;
    case 'teamNoticeComment':
      if (!contextId || !contextId.includes(':')) return null;
      {
        const [teamId, noticeId] = contextId.split(':');
        if (!teamId || !noticeId) return null;
        return `/teams/${teamId}/notices/${noticeId}`;
      }
    default:
      return null;
  }
}

export function contentDomainLabel(contentDomain: string): string {
  switch (contentDomain) {
    case 'noticePost':
      return '공지 게시글';
    case 'noticeComment':
      return '공지 댓글';
    case 'inquiryPost':
      return '건의/문의 게시글';
    case 'inquiryComment':
      return '건의/문의 댓글';
    case 'playerRegistrationPost':
      return '선수등록 게시글';
    case 'teamNoticeComment':
      return '팀공지 댓글';
    default:
      return contentDomain;
  }
}

export function moderationReasonLabel(reasonCode: string): string {
  return moderationReasonOptions.find((option) => option.code === reasonCode)?.label ?? reasonCode;
}

export const moderationStatuses = [
  { value: 'pending', label: '접수' },
  { value: 'inReview', label: '검토중' },
  { value: 'resolved', label: '조치완료' },
  { value: 'rejected', label: '반려' },
] as const;
