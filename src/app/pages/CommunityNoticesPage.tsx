import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { firestore } from '../../shared/firebase/client';
import { useAdmin } from '../../shared/auth/useAdmin';
import { deltaToPreviewText } from '../../shared/components/editor/quillUtils';
import { useBlockedUserIds } from '../../shared/moderation/useBlockedUsers';
import type { Notice, NoticeCategory } from '../../shared/types';

// 필터 타입 정의
type FilterValue = NoticeCategory | 'ALL';

// 필터 옵션 정의
const FILTERS: { label: string; value: FilterValue }[] = [
  { label: '전체', value: 'ALL' },
  { label: '긴급', value: '긴급' },
  { label: '심판/기록원 모집', value: '심판/기록원 모집' },
  { label: '경기공지', value: '경기공지' },
  { label: '징계', value: '징계' },
  { label: '일반', value: '일반' },
];

export default function CommunityNoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]); // 전체 공지사항 원본
  const [activeFilter, setActiveFilter] = useState<FilterValue>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const { isAdmin } = useAdmin();
  const { blockedUserIds } = useBlockedUserIds();
  const navigate = useNavigate();

  // 1. 컴포넌트 로드 시 '전체' 공지사항을 한 번만 불러옵니다.
  useEffect(() => {
    const fetchNotices = async () => {
      try {
        const q = query(collection(firestore, 'notices'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notice)));
      } catch (error) {
        console.error("공지사항 불러오기 실패:", error);
      }
    };
    void fetchNotices();
  }, []);

  // 2. 현재 선택된 필터에 따라 보여줄 목록을 계산합니다. (Client-side Filtering)
  const filteredNotices = useMemo(() => {
    const visibleNotices = notices.filter((notice) => {
      const ownerUid = notice.uid ?? notice.authorUid ?? '';
      if (!ownerUid) return true;
      return !blockedUserIds.has(ownerUid);
    });

    const categoryFiltered =
      activeFilter === 'ALL'
        ? visibleNotices
        : visibleNotices.filter((notice) => notice.category === activeFilter);

    const q = searchQuery.trim().toLowerCase();
    if (!q) return categoryFiltered;

    return categoryFiltered.filter((notice) =>
      `${notice.title} ${deltaToPreviewText(notice.content)} ${notice.author}`.toLowerCase().includes(q),
    );
  }, [notices, activeFilter, searchQuery, blockedUserIds]);

  return (
    <div style={{ color: '#f8fafc', maxWidth: '1100px', margin: '0 auto', paddingBottom: '40px' }}>
      
      {/* 상단 헤더 및 글쓰기 버튼 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 900, margin: 0 }}>📢 공지사항</h2>
        {isAdmin && (
          <button
            onClick={() => navigate('new')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            글쓰기
          </button>
        )}
      </div>

      {/* 필터 탭 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setActiveFilter(filter.value)}
            style={{
              padding: '8px 14px',
              borderRadius: '20px',
              border: '1px solid',
              borderColor: activeFilter === filter.value ? getCategoryColor(filter.value) : 'rgba(148, 163, 184, 0.3)',
              background: activeFilter === filter.value ? getCategoryColor(filter.value) : 'transparent',
              color: activeFilter === filter.value ? '#0f172a' : '#94a3b8',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap'
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* 검색 */}
      <div style={{ marginBottom: '16px', position: 'relative' }}>
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="제목, 내용, 작성자 검색"
          style={{
            width: '100%',
            borderRadius: '10px',
            border: '1px solid rgba(148, 163, 184, 0.35)',
            background: 'rgba(15, 23, 42, 0.6)',
            color: '#e2e8f0',
            fontSize: '14px',
            fontWeight: 600,
            padding: '11px 40px 11px 12px',
            outline: 'none',
          }}
        />
        {searchQuery.trim() && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              border: 'none',
              borderRadius: '8px',
              background: 'rgba(51,65,85,0.85)',
              color: '#cbd5e1',
              fontSize: '12px',
              fontWeight: 800,
              padding: '5px 8px',
              cursor: 'pointer',
            }}
          >
            초기화
          </button>
        )}
      </div>

      <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700, marginBottom: '12px' }}>
        {filteredNotices.length}개 공지
      </div>

      {/* 공지사항 목록 (filteredNotices 사용) */}
      <div style={{ display: 'grid', gap: '16px' }}>
        {filteredNotices.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            {searchQuery.trim() ? '검색 결과가 없습니다.' : '해당 카테고리의 게시글이 없습니다.'}
          </div>
        ) : (
          filteredNotices.map(notice => (
            <Link
              key={notice.id}
              to={notice.id}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div 
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(148, 163, 184, 0.15)',
                  borderRadius: '12px',
                  padding: '20px',
                  transition: 'background 0.2s, transform 0.1s',
                  cursor: 'pointer'
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(30, 41, 59, 0.8)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(15, 23, 42, 0.6)')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <span style={{
                    fontSize: '12px',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontWeight: 800,
                    background: getCategoryColor(notice.category),
                    color: '#0f172a'
                  }}>
                    {notice.category}
                  </span>
                  <span style={{ color: '#94a3b8', fontSize: '13px' }}>
                    {new Date(notice.createdAt).toLocaleString()}
                  </span>
                </div>
                
                <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700, color: '#f1f5f9' }}>
                  {notice.title}
                </h3>
                
                <p style={{
                  margin: 0,
                  color: '#cbd5e1',
                  lineHeight: 1.6,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {deltaToPreviewText(notice.content)}
                </p>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function getCategoryColor(category: string) {
  switch(category) {
    case '긴급': return '#f87171';
    case '심판/기록원 모집': return '#22c55e';
    case '징계': return '#fb923c';
    case '경기공지': return '#60a5fa';
    case 'ALL': return '#cbd5e1';
    default: return '#94a3b8';
  }
}
