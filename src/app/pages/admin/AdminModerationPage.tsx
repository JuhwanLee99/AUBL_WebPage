import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { firestore } from '@shared/firebase/client';
import { useAuth } from '@shared/auth/AuthProvider';
import {
  buildModerationContentLink,
  contentDomainLabel,
  moderationReasonLabel,
  moderationStatuses,
} from '@shared/moderation/moderationService';
import type { ModerationReport } from '@shared/types';

const currentTimestamp = () => Date.now();

const cardStyle: React.CSSProperties = {
  borderRadius: '16px',
  border: '1px solid rgba(148,163,184,0.28)',
  background: 'linear-gradient(135deg, rgba(15,23,42,0.78), rgba(30,41,59,0.78))',
  padding: '16px',
  boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid rgba(148,163,184,0.35)',
  background: 'rgba(15,23,42,0.65)',
  color: '#e2e8f0',
  fontSize: '13px',
};

type SelectFilter = 'ALL' | string;

export default function AdminModerationPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<SelectFilter>('pending');
  const [actionFilter, setActionFilter] = useState<SelectFilter>('ALL');
  const [domainFilter, setDomainFilter] = useState<SelectFilter>('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const q = query(collection(firestore, 'contentReports'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const next = snapshot.docs.map((item) => {
          const data = item.data() as Omit<ModerationReport, 'id'>;
          return {
            id: item.id,
            action: data.action,
            reasonType: data.reasonType,
            reasonDetail: data.reasonDetail ?? '',
            reporterUid: data.reporterUid,
            reporterLabel: data.reporterLabel ?? '',
            targetUid: data.targetUid ?? '',
            targetLabel: data.targetLabel ?? '알 수 없음',
            contentDomain: data.contentDomain,
            contentId: data.contentId,
            contentPreview: data.contentPreview ?? '',
            parentContentId: data.parentContentId,
            contextId: data.contextId,
            status: data.status ?? 'pending',
            createdAt: data.createdAt ?? 0,
            reviewedAt: data.reviewedAt,
            reviewedBy: data.reviewedBy,
            reviewNote: data.reviewNote,
          } satisfies ModerationReport;
        });
        setReports(next);
        setLoading(false);
      },
      () => {
        setReports([]);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const domainOptions = useMemo(
    () => Array.from(new Set(reports.map((report) => report.contentDomain))).sort(),
    [reports],
  );

  const filteredReports = useMemo(() => {
    const queryText = search.trim().toLowerCase();
    return reports.filter((report) => {
      if (statusFilter !== 'ALL' && report.status !== statusFilter) return false;
      if (actionFilter !== 'ALL' && report.action !== actionFilter) return false;
      if (domainFilter !== 'ALL' && report.contentDomain !== domainFilter) return false;
      if (!queryText) return true;

      const haystack = [
        report.reasonType,
        report.reasonDetail,
        report.reporterUid,
        report.reporterLabel,
        report.targetUid,
        report.targetLabel,
        report.contentPreview,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(queryText);
    });
  }, [reports, statusFilter, actionFilter, domainFilter, search]);

  const pendingCount = useMemo(
    () => reports.filter((report) => report.status === 'pending').length,
    [reports],
  );

  const updateStatus = async (report: ModerationReport, nextStatus: string) => {
    const note = window.prompt('처리 메모를 입력하세요. (선택)', report.reviewNote ?? '') ?? report.reviewNote ?? '';
    try {
      await updateDoc(doc(firestore, 'contentReports', report.id), {
        status: nextStatus,
        reviewNote: note.trim(),
        reviewedAt: currentTimestamp(),
        reviewedBy: user?.uid ?? 'admin',
      });
    } catch (error) {
      window.alert(`상태 업데이트 실패: ${String(error)}`);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: '6px' }}>
            <h2 style={{ margin: 0, color: '#e2e8f0' }}>신고/차단 관리</h2>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px', fontWeight: 700 }}>
              신규 접수 {pendingCount}건 · 총 {reports.length}건
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={inputStyle}>
              <option value="ALL">전체 상태</option>
              {moderationStatuses.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
            <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} style={inputStyle}>
              <option value="ALL">전체 액션</option>
              <option value="report">신고</option>
              <option value="block">차단</option>
            </select>
            <select value={domainFilter} onChange={(event) => setDomainFilter(event.target.value)} style={inputStyle}>
              <option value="ALL">전체 도메인</option>
              {domainOptions.map((domain) => (
                <option key={domain} value={domain}>{contentDomainLabel(domain)}</option>
              ))}
            </select>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="신고자/대상자/내용/사유 검색"
            style={inputStyle}
          />
        </div>
      </section>

      <section style={{ ...cardStyle, display: 'grid', gap: '10px' }}>
        {loading ? (
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>신고함을 불러오는 중...</div>
        ) : filteredReports.length === 0 ? (
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>조건에 맞는 신고가 없습니다.</div>
        ) : (
          filteredReports.map((report) => {
            const link = buildModerationContentLink(report.contentDomain, report.contentId, report.contextId);
            const statusLabel = moderationStatuses.find((status) => status.value === report.status)?.label ?? report.status;
            return (
              <article
                key={report.id}
                style={{
                  borderRadius: '12px',
                  border: '1px solid rgba(148,163,184,0.24)',
                  background: 'rgba(15,23,42,0.55)',
                  padding: '12px',
                  display: 'grid',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', fontWeight: 900, borderRadius: '999px', padding: '2px 8px', background: 'rgba(96,165,250,0.22)', color: '#bfdbfe' }}>
                    {report.action === 'block' ? '차단' : '신고'}
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 900, borderRadius: '999px', padding: '2px 8px', background: 'rgba(148,163,184,0.2)', color: '#e2e8f0' }}>
                    {contentDomainLabel(report.contentDomain)}
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 900, borderRadius: '999px', padding: '2px 8px', background: 'rgba(251,191,36,0.18)', color: '#fde68a' }}>
                    {statusLabel}
                  </span>
                  <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '12px' }}>
                    {new Date(report.createdAt).toLocaleString('ko-KR')}
                  </span>
                </div>

                <div style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.5 }}>
                  <div>사유: {moderationReasonLabel(report.reasonType)}</div>
                  {report.reasonDetail ? <div>상세: {report.reasonDetail}</div> : null}
                  <div>신고자: {report.reporterLabel || report.reporterUid}</div>
                  <div>대상자: {report.targetLabel || report.targetUid || '알 수 없음'}</div>
                </div>

                <div
                  style={{
                    borderRadius: '10px',
                    border: '1px solid rgba(148,163,184,0.2)',
                    background: 'rgba(2,6,23,0.5)',
                    color: '#e2e8f0',
                    fontSize: '12px',
                    padding: '9px 10px',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {report.contentPreview || '(미리보기 없음)'}
                </div>

                {report.reviewNote ? (
                  <div style={{ color: '#94a3b8', fontSize: '12px' }}>처리 메모: {report.reviewNote}</div>
                ) : null}

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <select
                    value={report.status}
                    onChange={(event) => void updateStatus(report, event.target.value)}
                    style={{ ...inputStyle, maxWidth: '170px' }}
                  >
                    {moderationStatuses.map((status) => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                  {link ? (
                    <Link
                      to={link}
                      style={{
                        padding: '9px 12px',
                        borderRadius: '10px',
                        border: '1px solid rgba(96,165,250,0.42)',
                        background: 'rgba(59,130,246,0.18)',
                        color: '#dbeafe',
                        fontWeight: 800,
                        fontSize: '12px',
                        textDecoration: 'none',
                      }}
                    >
                      원문 보기
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
