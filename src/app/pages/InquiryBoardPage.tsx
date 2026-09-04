import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { firestore, auth } from '../../shared/firebase/client';
import { useAdmin } from '../../shared/auth/useAdmin';
import { useBlockedUserIds } from '../../shared/moderation/useBlockedUsers';
import type { InquiryPost, InquiryPlatform, InquiryCategory, InquiryStatus } from '../../shared/types';
import './CommunityPages.css';

type PlatformFilter = InquiryPlatform | 'ALL';
type CategoryFilter = InquiryCategory | 'ALL';
type StatusFilter = InquiryStatus | 'ALL';

const PLATFORM_FILTERS: { label: string; value: PlatformFilter }[] = [
  { label: '전체', value: 'ALL' },
  { label: '앱', value: 'app' },
  { label: '웹', value: 'web' },
];

const CATEGORY_FILTERS: { label: string; value: CategoryFilter }[] = [
  { label: '전체', value: 'ALL' },
  { label: '기능 개선', value: '기능 개선' },
  { label: '버그 신고', value: '버그 신고' },
  { label: '사용 문의', value: '사용 문의' },
  { label: '경기/기록 오류', value: '경기/기록 오류' },
  { label: '기타', value: '기타' },
];

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: '전체', value: 'ALL' },
  { label: '미처리', value: '미처리' },
  { label: '처리 중', value: '처리 중' },
  { label: '처리 완료', value: '처리 완료' },
];

export default function InquiryBoardPage() {
  const [posts, setPosts] = useState<InquiryPost[]>([]);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const { isAdmin } = useAdmin();
  const { blockedUserIds } = useBlockedUserIds();
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => setCurrentUser(user));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const q = query(collection(firestore, 'inquiries'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as InquiryPost)));
      } catch (err) {
        console.error('건의/문의 목록 불러오기 실패:', err);
      }
    };
    void fetchPosts();
  }, []);

  const filteredPosts = useMemo(() => {
    let result = posts.filter((post) => !blockedUserIds.has(post.uid));
    if (platformFilter !== 'ALL') result = result.filter((p) => p.platform === platformFilter);
    if (categoryFilter !== 'ALL') result = result.filter((p) => p.category === categoryFilter);
    if (statusFilter !== 'ALL') result = result.filter((p) => (p.status ?? '미처리') === statusFilter);

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((p) =>
        `${p.title} ${p.author}`.toLowerCase().includes(q),
      );
    }
    return result;
  }, [posts, platformFilter, categoryFilter, statusFilter, searchQuery, blockedUserIds]);

  const isAccessible = (post: InquiryPost) =>
    !post.isPrivate || currentUser?.uid === post.uid || isAdmin;

  return (
    <div className="season-content-page community-ui community-inquiry-list-page">
      {/* 헤더 */}
      <header className="community-page-header">
        <div className="community-page-header__copy">
          <p className="community-eyebrow">AUBL SUPPORT</p>
          <h1>건의/문의 게시판</h1>
          <p className="community-page-header__description">서비스 개선 의견과 경기·기록 관련 문의를 남기고 처리 상태를 확인하세요.</p>
        </div>
        {currentUser && (
          <button
            type="button"
            onClick={() => navigate('new')}
            className="community-action community-action--primary"
          >
            글쓰기
          </button>
        )}
      </header>

      <div className="community-info-note">
        첨부파일 업로드는 현재 지원하지 않습니다. 스크린샷 등 첨부가 필요하면 게시글 작성 후
        `aublcau@gmail.com`으로 전송해 주세요.
      </div>

      {/* 필터 행 */}
      <div className="community-inquiry-filter-panel">
        <div className="community-inquiry-filter-row">
          <span className="community-inquiry-filter-label">플랫폼</span>
          <div className="community-segmented" role="group" aria-label="플랫폼 필터">
            {PLATFORM_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setPlatformFilter(f.value)}
                className={platformFilter === f.value ? 'is-active' : undefined}
                aria-pressed={platformFilter === f.value}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="community-inquiry-filter-row">
          <span className="community-inquiry-filter-label">분류</span>
          <div className="community-segmented" role="group" aria-label="문의 분류 필터">
            {CATEGORY_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setCategoryFilter(f.value)}
                className={categoryFilter === f.value ? 'is-active' : undefined}
                aria-pressed={categoryFilter === f.value}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="community-inquiry-filter-row">
          <span className="community-inquiry-filter-label">상태</span>
          <div className="community-segmented" role="group" aria-label="처리 상태 필터">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={statusFilter === f.value ? 'is-active' : undefined}
                aria-pressed={statusFilter === f.value}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 검색 */}
      <div className="community-search">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="제목, 작성자 검색"
          className="community-input"
          aria-label="건의 및 문의 검색"
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
        {filteredPosts.length}개 게시글
      </div>

      {/* 목록 */}
      <div className="community-inquiry-list">
        {filteredPosts.length === 0 ? (
          <div className="community-empty">
            게시글이 없습니다.
          </div>
        ) : (
          filteredPosts.map((post) => {
            const accessible = isAccessible(post);
            return accessible ? (
              <Link key={post.id} to={post.id} className="community-inquiry-card-link">
                <PostCard post={post} accessible />
              </Link>
            ) : (
              <div key={post.id} className="community-inquiry-card-link is-locked" aria-disabled="true">
                <PostCard post={post} accessible={false} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function PostCard({ post, accessible }: { post: InquiryPost; accessible: boolean }) {
  const status = post.status ?? '미처리';
  return (
    <article className={`community-inquiry-card${accessible ? '' : ' is-locked'}`}>
      {/* 뱃지 행 */}
      <div className="community-inquiry-card__meta">
        <span className="community-label">
          {post.platform === 'app' ? '앱' : '웹'}
        </span>
        <span className="community-label">
          {post.category}
        </span>
        {/* 처리 상태 뱃지 */}
        <span className={`community-inquiry-status ${getStatusClass(status)}`}>
          {status}
        </span>
        {post.isPrivate && (
          <span className="community-label is-private">비공개</span>
        )}
        <time dateTime={new Date(post.createdAt).toISOString()}>
          {new Date(post.createdAt).toLocaleDateString()}
        </time>
      </div>

      {/* 제목 */}
      <h2>{post.isPrivate && !accessible ? '비밀글입니다.' : post.title}</h2>

      {/* 작성자 */}
      <div className="community-inquiry-card__author">
        {post.isPrivate && !accessible ? '' : post.author}
      </div>
    </article>
  );
}

function getStatusClass(status: string) {
  switch (status) {
    case '미처리': return 'is-pending';
    case '처리 중': return 'is-progress';
    case '처리 완료': return 'is-complete';
    default: return 'is-neutral';
  }
}
