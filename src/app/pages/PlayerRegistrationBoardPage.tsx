import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { firestore } from '../../shared/firebase/client';
import { useCommunityAccess } from '../../shared/auth/useCommunityAccess';
import { useBlockedUserIds } from '../../shared/moderation/useBlockedUsers';
import type { PlayerRegistrationCategory, PlayerRegistrationPost } from '../../shared/types';
import './PlayerRegistrationPages.css';

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

  const filterBtn = (label: string, active: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={`player-registration-filter${active ? ' is-active' : ''}`}
      aria-pressed={active}
    >
      {label}
    </button>
  );

  if (roleLoading) {
    return <div className="player-registration-state">권한 확인 중...</div>;
  }

  if (!isAuthenticated || !isPlayerOrAbove) {
    return (
      <div className="player-registration-page player-registration-access-page">
        <header className="player-registration-header">
          <span className="player-registration-kicker">PLAYER REGISTRATION</span>
          <h1>선수 등록 게시판</h1>
        </header>
        <div className="player-registration-feedback player-registration-feedback--error" role="alert">
          이 게시판은 선수/기록원 등급 이상 계정만 접근할 수 있습니다.
          {!isAuthenticated && (
            <>
              {' '}
              <Link to="/login">
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
    <div className="season-content-page board-list-page player-registration-page player-registration-board">
      <header className="player-registration-header player-registration-header--split">
        <div>
          <span className="player-registration-kicker">PLAYER REGISTRATION</span>
          <h1>선수 등록 게시판</h1>
          <p>선수 및 유니폼 등록 관련 요청을 확인합니다.</p>
        </div>
        {canWriteAny && (
          <button
            type="button"
            onClick={() => navigate('new')}
            className="player-registration-action player-registration-action--primary"
          >
            글쓰기
          </button>
        )}
      </header>

      <div className="player-registration-guide">
        선수/기록원 등급 이상만 열람 가능하며, 말머리별 작성 권한은 다음과 같습니다. `선수 등록`: 관리자만, `유니폼 등록`:
        감독/관리자
      </div>

      <div className="player-registration-filter-row" role="group" aria-label="게시글 분류">
        {CATEGORY_FILTERS.map((f) =>
          filterBtn(f.label, categoryFilter === f.value, () => setCategoryFilter(f.value)),
        )}
      </div>

      <div className="player-registration-search">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="제목, 작성자 검색"
          aria-label="선수 등록 게시글 검색"
        />
      </div>

      <div className="player-registration-count">
        {loadingPosts ? '불러오는 중...' : `${filteredPosts.length}개 게시글`}
      </div>

      <div className="player-registration-list">
        {loadingPosts ? (
          <div className="player-registration-state">게시글을 불러오는 중입니다.</div>
        ) : filteredPosts.length === 0 ? (
          <div className="player-registration-state">게시글이 없습니다.</div>
        ) : (
          filteredPosts.map((post) => (
            <Link key={post.id} to={post.id} className="player-registration-list-item">
              <article>
                <div className="player-registration-list-item__meta">
                  <span className="player-registration-category">
                    {post.category}
                  </span>
                  <time>
                    {new Date(post.createdAt).toLocaleString()}
                  </time>
                </div>
                <h2>{post.title}</h2>
                <div className="player-registration-list-item__author">{post.author}</div>
              </article>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
