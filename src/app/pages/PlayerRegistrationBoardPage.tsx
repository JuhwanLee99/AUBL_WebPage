import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { firestore } from '../../shared/firebase/client';
import { useCommunityAccess } from '../../shared/auth/useCommunityAccess';
import { useBlockedUserIds } from '../../shared/moderation/useBlockedUsers';
import type { PlayerRegistrationCategory, PlayerRegistrationPost } from '../../shared/types';

type CategoryFilter = PlayerRegistrationCategory | 'ALL';

const CATEGORY_FILTERS: { label: string; value: CategoryFilter }[] = [
  { label: '전체', value: 'ALL' },
  { label: '선수 등록', value: '선수 등록' },
  { label: '유니폼 등록', value: '유니폼 등록' },
];

export default function PlayerRegistrationBoardPage() {
  const [posts, setPosts] = useState<PlayerRegistrationPost[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingPosts, setLoadingPosts] = useState(true);
  const navigate = useNavigate();
  const { blockedUserIds } = useBlockedUserIds();
  const {
    loading: roleLoading,
    isAuthenticated,
    isPlayerOrAbove,
    canWritePlayerRegistration,
    canWriteUniformRegistration,
  } = useCommunityAccess();

  useEffect(() => {
    if (!isPlayerOrAbove) {
      setPosts([]);
      setLoadingPosts(false);
      return;
    }
    const fetchPosts = async () => {
      try {
        const q = query(collection(firestore, 'playerRegistrationPosts'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlayerRegistrationPost)));
      } catch (err) {
        console.error('선수 등록 게시판 목록 불러오기 실패:', err);
      } finally {
        setLoadingPosts(false);
      }
    };
    void fetchPosts();
  }, [isPlayerOrAbove]);

  const filteredPosts = useMemo(() => {
    let result = posts.filter((post) => !blockedUserIds.has(post.uid));
    if (categoryFilter !== 'ALL') result = result.filter((p) => p.category === categoryFilter);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((p) => `${p.title} ${p.author}`.toLowerCase().includes(q));
    }
    return result;
  }, [posts, categoryFilter, searchQuery, blockedUserIds]);

  const canWriteAny = canWritePlayerRegistration || canWriteUniformRegistration;

  const filterBtn = (label: string, active: boolean, onClick: () => void, color: string) => (
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

  if (roleLoading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>권한 확인 중...</div>;
  }

  if (!isAuthenticated || !isPlayerOrAbove) {
    return (
      <div style={{ color: '#f8fafc', maxWidth: '900px', margin: '0 auto', paddingBottom: '40px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '20px' }}>🧢 선수 등록 게시판</h2>
        <div
          style={{
            borderRadius: '14px',
            border: '1px solid rgba(248,113,113,0.35)',
            background: 'rgba(127,29,29,0.35)',
            color: '#fecaca',
            padding: '18px 20px',
            lineHeight: 1.7,
            fontWeight: 700,
          }}
        >
          이 게시판은 선수/기록원 등급 이상 계정만 접근할 수 있습니다.
          {!isAuthenticated && (
            <>
              {' '}
              <Link to="/login" style={{ color: '#bfdbfe' }}>
                로그인
              </Link>
              이 필요합니다.
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ color: '#f8fafc', maxWidth: '1100px', margin: '0 auto', paddingBottom: '40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 900, margin: 0 }}>🧢 선수 등록 게시판</h2>
        {canWriteAny && (
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
        선수/기록원 등급 이상만 열람 가능하며, 말머리별 작성 권한은 다음과 같습니다. `선수 등록`: 관리자만, `유니폼 등록`:
        감독/관리자
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        {CATEGORY_FILTERS.map((f) =>
          filterBtn(f.label, categoryFilter === f.value, () => setCategoryFilter(f.value), getCategoryColor(f.value)),
        )}
      </div>

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
      </div>

      <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700, marginBottom: '12px' }}>
        {loadingPosts ? '불러오는 중...' : `${filteredPosts.length}개 게시글`}
      </div>

      <div style={{ display: 'grid', gap: '10px' }}>
        {loadingPosts ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>게시글을 불러오는 중입니다.</div>
        ) : filteredPosts.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>게시글이 없습니다.</div>
        ) : (
          filteredPosts.map((post) => (
            <Link key={post.id} to={post.id} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(148, 163, 184, 0.15)',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  transition: 'background 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontWeight: 800,
                      background: getCategoryColor(post.category),
                      color: '#0f172a',
                    }}
                  >
                    {post.category}
                  </span>
                  <span style={{ color: '#64748b', fontSize: '12px', marginLeft: 'auto' }}>
                    {new Date(post.createdAt).toLocaleString()}
                  </span>
                </div>
                <div style={{ color: '#f8fafc', fontSize: '16px', fontWeight: 800, marginBottom: '6px' }}>{post.title}</div>
                <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>{post.author}</div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function getCategoryColor(category: CategoryFilter | PlayerRegistrationCategory) {
  switch (category) {
    case '선수 등록':
      return '#f87171';
    case '유니폼 등록':
      return '#34d399';
    default:
      return '#94a3b8';
  }
}
