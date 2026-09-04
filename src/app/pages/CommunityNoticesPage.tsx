import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { firestore } from '../../shared/firebase/client';
import { useAdmin } from '../../shared/auth/useAdmin';
import { deltaToPreviewText } from '../../shared/components/editor/quillUtils';
import { useBlockedUserIds } from '../../shared/moderation/useBlockedUsers';
import type { Notice, NoticeCategory } from '../../shared/types';
import './CommunityPages.css';

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
    <div className="season-content-page community-ui community-notice-list-page">
      <header className="community-page-header">
        <div className="community-page-header__copy">
          <p className="community-eyebrow">LEAGUE NOTICE</p>
          <h1>공지사항</h1>
          <p className="community-page-header__description">경기 운영과 리그 소식, 중요한 안내를 확인하세요.</p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => navigate('new')}
            className="community-action community-action--primary"
          >
            공지 작성
          </button>
        )}
      </header>

      {/* 필터 탭 */}
      <div className="community-filter-bar" role="group" aria-label="공지 카테고리 필터">
        {FILTERS.map((filter) => (
          <button
            type="button"
            key={filter.value}
            onClick={() => setActiveFilter(filter.value)}
            className={activeFilter === filter.value ? 'is-active' : undefined}
            aria-pressed={activeFilter === filter.value}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* 검색 */}
      <div className="community-search">
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="제목, 내용, 작성자 검색"
          className="community-input"
          aria-label="공지사항 검색"
        />
        {searchQuery.trim() && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="community-action community-action--quiet"
          >
            초기화
          </button>
        )}
      </div>

      <div className="community-result-count" aria-live="polite">
        {filteredNotices.length}개 공지
      </div>

      {/* 공지사항 목록 (filteredNotices 사용) */}
      <div className="community-notice-list">
        {filteredNotices.length === 0 ? (
          <div className="community-empty">
            {searchQuery.trim() ? '검색 결과가 없습니다.' : '해당 카테고리의 게시글이 없습니다.'}
          </div>
        ) : (
          filteredNotices.map(notice => (
            <Link
              key={notice.id}
              to={notice.id}
              className="community-notice-card"
            >
              <div className="community-notice-card__meta">
                <span className={`community-label${notice.category === '긴급' ? ' is-urgent' : ''}`}>{notice.category}</span>
                <time dateTime={new Date(notice.createdAt).toISOString()}>{new Date(notice.createdAt).toLocaleString()}</time>
              </div>
              <h2>{notice.title}</h2>
              <p>{deltaToPreviewText(notice.content)}</p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
