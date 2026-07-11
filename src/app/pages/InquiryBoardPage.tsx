import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { firestore, auth } from '../../shared/firebase/client';
import { useAdmin } from '../../shared/auth/useAdmin';
import { useBlockedUserIds } from '../../shared/moderation/useBlockedUsers';
import type { InquiryPost, InquiryPlatform, InquiryCategory, InquiryStatus } from '../../shared/types';

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

  const filterBtn = (
    label: string,
    active: boolean,
    onClick: () => void,
    color: string,
  ) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        padding: '6px 13px',
        borderRadius: '20px',
        border: '1px solid',
        borderColor: active ? color : 'rgba(148,163,184,0.3)',
        background: active ? color : 'transparent',
        color: active ? '#0f172a' : '#94a3b8',
        fontWeight: 700,
        fontSize: '13px',
        cursor: 'pointer',
        whiteSpace: 'nowrap' as const,
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );

  const sep = <div style={{ width: '1px', background: 'rgba(148,163,184,0.25)', margin: '0 4px', alignSelf: 'stretch' }} />;

  return (
    <div style={{ color: '#f8fafc', maxWidth: '1100px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 900, margin: 0 }}>💬 건의/문의 게시판</h2>
        {currentUser && (
          <button
            onClick={() => navigate('new')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            글쓰기
          </button>
        )}
      </div>

      <div
        style={{
          marginBottom: '14px',
          padding: '11px 13px',
          borderRadius: '10px',
          border: '1px solid rgba(59,130,246,0.35)',
          background: 'rgba(59,130,246,0.12)',
          color: '#bfdbfe',
          fontSize: '12px',
          lineHeight: 1.7,
          fontWeight: 600,
        }}
      >
        첨부파일 업로드는 현재 지원하지 않습니다. 스크린샷 등 첨부가 필요하면 게시글 작성 후
        `aublcau@gmail.com`으로 전송해 주세요.
      </div>

      {/* 필터 행 */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        {PLATFORM_FILTERS.map((f) =>
          filterBtn(f.label, platformFilter === f.value, () => setPlatformFilter(f.value), '#60a5fa'),
        )}
        {sep}
        {CATEGORY_FILTERS.map((f) =>
          filterBtn(f.label, categoryFilter === f.value, () => setCategoryFilter(f.value), getCategoryColor(f.value)),
        )}
        {sep}
        {STATUS_FILTERS.map((f) =>
          filterBtn(f.label, statusFilter === f.value, () => setStatusFilter(f.value), getStatusColor(f.value)),
        )}
      </div>

      {/* 검색 */}
      <div style={{ marginBottom: '14px', position: 'relative' }}>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="제목, 작성자 검색"
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
            boxSizing: 'border-box',
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
        {filteredPosts.length}개 게시글
      </div>

      {/* 목록 */}
      <div style={{ display: 'grid', gap: '10px' }}>
        {filteredPosts.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            게시글이 없습니다.
          </div>
        ) : (
          filteredPosts.map((post) => {
            const accessible = isAccessible(post);
            return accessible ? (
              <Link key={post.id} to={post.id} style={{ textDecoration: 'none', color: 'inherit' }}>
                <PostCard post={post} accessible />
              </Link>
            ) : (
              <div key={post.id} style={{ cursor: 'not-allowed' }}>
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
    <div
      style={{
        background: accessible ? 'rgba(15, 23, 42, 0.6)' : 'rgba(15, 23, 42, 0.35)',
        border: '1px solid rgba(148, 163, 184, 0.15)',
        borderRadius: '12px',
        padding: '16px 20px',
        opacity: accessible ? 1 : 0.7,
        transition: 'background 0.2s',
      }}
      onMouseOver={(e) => {
        if (accessible) e.currentTarget.style.background = 'rgba(30, 41, 59, 0.8)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = accessible
          ? 'rgba(15, 23, 42, 0.6)'
          : 'rgba(15, 23, 42, 0.35)';
      }}
    >
      {/* 뱃지 행 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <span style={{
          fontSize: '11px', padding: '2px 7px', borderRadius: '4px', fontWeight: 800,
          background: post.platform === 'app' ? '#818cf8' : '#34d399', color: '#0f172a',
        }}>
          {post.platform === 'app' ? '앱' : '웹'}
        </span>
        <span style={{
          fontSize: '11px', padding: '2px 7px', borderRadius: '4px', fontWeight: 800,
          background: getCategoryColor(post.category), color: '#0f172a',
        }}>
          {post.category}
        </span>
        {/* 처리 상태 뱃지 */}
        <span style={{
          fontSize: '11px', padding: '2px 7px', borderRadius: '4px', fontWeight: 800,
          background: getStatusBg(status), color: getStatusColor(status),
          border: `1px solid ${getStatusColor(status)}40`,
        }}>
          {status}
        </span>
        {post.isPrivate && (
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>🔒</span>
        )}
        <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: '12px' }}>
          {new Date(post.createdAt).toLocaleDateString()}
        </span>
      </div>

      {/* 제목 */}
      <span style={{ fontSize: '16px', fontWeight: 700, color: accessible ? '#f1f5f9' : '#64748b' }}>
        {post.isPrivate && !accessible ? '🔒 비밀글입니다.' : post.title}
      </span>

      {/* 작성자 */}
      <div style={{ marginTop: '5px', color: '#64748b', fontSize: '12px' }}>
        {post.isPrivate && !accessible ? '' : post.author}
      </div>
    </div>
  );
}

function getCategoryColor(category: string) {
  switch (category) {
    case '기능 개선': return '#60a5fa';
    case '버그 신고': return '#f87171';
    case '사용 문의': return '#4ade80';
    case '경기/기록 오류': return '#fb923c';
    default: return '#94a3b8';
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case '미처리': return '#f87171';
    case '처리 중': return '#fbbf24';
    case '처리 완료': return '#4ade80';
    default: return '#94a3b8';
  }
}

function getStatusBg(status: string) {
  switch (status) {
    case '미처리': return 'rgba(248,113,113,0.12)';
    case '처리 중': return 'rgba(251,191,36,0.12)';
    case '처리 완료': return 'rgba(74,222,128,0.12)';
    default: return 'rgba(148,163,184,0.12)';
  }
}
