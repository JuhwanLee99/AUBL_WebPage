import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { firestore } from '../../shared/firebase/client';
import { useCommunityAccess } from '../../shared/auth/useCommunityAccess';
import type { Notice, InquiryPost, PlayerRegistrationPost } from '../../shared/types';
import './CommunityPages.css';

export default function CommunityPage() {
  const [displayNotices, setDisplayNotices] = useState<Notice[]>([]);
  const [recentInquiries, setRecentInquiries] = useState<InquiryPost[]>([]);
  const [recentPlayerRegistrations, setRecentPlayerRegistrations] = useState<PlayerRegistrationPost[]>([]);
  const { isPlayerOrAbove, loading: communityAccessLoading } = useCommunityAccess();
  const visiblePlayerRegistrations = isPlayerOrAbove ? recentPlayerRegistrations : [];

  useEffect(() => {
    const fetchInquiries = async () => {
      try {
        const q = query(collection(firestore, 'inquiries'), orderBy('createdAt', 'desc'), limit(5));
        const snap = await getDocs(q);
        setRecentInquiries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as InquiryPost)));
      } catch (err) {
        console.error('건의/문의 불러오기 실패', err);
      }
    };
    void fetchInquiries();
  }, []);

  useEffect(() => {
    const fetchAndSortNotices = async () => {
      try {
        // 충분한 양(20개)을 가져와서 클라이언트에서 우선순위 정렬
        const q = query(collection(firestore, 'notices'), orderBy('createdAt', 'desc'), limit(20));
        const snap = await getDocs(q);
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notice));

        // 정렬 로직: '긴급'이 최우선, 그 외에는 날짜(최신)순
        const sorted = list.sort((a, b) => {
          if (a.category === '긴급' && b.category !== '긴급') return -1;
          if (a.category !== '긴급' && b.category === '긴급') return 1;
          return b.createdAt - a.createdAt;
        });

        // 화면 높이를 고려하여 상위 7개만 노출 (갤러리 iframe 높이에 맞춤)
        setDisplayNotices(sorted.slice(0, 7));
      } catch (err) {
        console.error('Failed to fetch notices', err);
      }
    };
    void fetchAndSortNotices();
  }, []);

  useEffect(() => {
    if (communityAccessLoading) return;
    if (!isPlayerOrAbove) return;
    const fetchPlayerRegistrations = async () => {
      try {
        const q = query(collection(firestore, 'playerRegistrationPosts'), orderBy('createdAt', 'desc'), limit(5));
        const snap = await getDocs(q);
        setRecentPlayerRegistrations(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlayerRegistrationPost)));
      } catch (err) {
        console.error('선수 등록 게시판 불러오기 실패', err);
      }
    };
    void fetchPlayerRegistrations();
  }, [isPlayerOrAbove, communityAccessLoading]);

  return (
    <div className="season-content-page community-ui community-dashboard">
      <header className="community-page-header">
        <div className="community-page-header__copy">
          <p className="community-eyebrow">AUBL COMMUNITY</p>
          <h1>커뮤니티</h1>
          <p className="community-page-header__description">리그 공지와 운영 문의, 선수 등록 정보를 한곳에서 확인하세요.</p>
        </div>
      </header>

      <div className="community-dashboard__grid">
        {/* 좌상: 공지사항 */}
        <section className="community-panel">
          <div className="community-panel__header">
            <h2>공지사항</h2>
            <Link to="notices" className="community-text-link">
              더보기 &rarr;
            </Link>
          </div>
          <div className="community-feed">
            {displayNotices.length === 0 ? (
              <div className="community-empty">
                등록된 공지사항이 없습니다.
              </div>
            ) : (
              displayNotices.map((notice) => (
                <Link
                  key={notice.id}
                  to={`notices/${notice.id}`}
                  className="community-feed-row"
                >
                  <span className="community-feed-row__labels">
                    <span className={`community-label${notice.category === '긴급' ? ' is-urgent' : ''}`}>{notice.category}</span>
                  </span>
                  <span className="community-feed-row__title">
                    {notice.title}
                  </span>
                  <time dateTime={new Date(notice.createdAt).toISOString()}>
                    {new Date(notice.createdAt).toLocaleDateString()}
                  </time>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* 우상: 건의/문의 */}
        <section className="community-panel">
          <div className="community-panel__header">
            <h2>건의/문의 게시판</h2>
            <Link to="inquiry" className="community-text-link">
              더보기 &rarr;
            </Link>
          </div>
          <div className="community-feed">
            {recentInquiries.length === 0 ? (
              <div className="community-empty">
                아직 게시글이 없습니다.
              </div>
            ) : (
              recentInquiries.map((post) => (
                <Link
                  key={post.id}
                  to={`inquiry/${post.id}`}
                  className={`community-feed-row${post.isPrivate ? ' is-private' : ''}`}
                  aria-disabled={post.isPrivate || undefined}
                >
                  <span className="community-feed-row__labels">
                    <span className="community-label">{post.platform === 'app' ? '앱' : '웹'}</span>
                    <span className="community-label">{post.category}</span>
                    {post.isPrivate ? <span className="community-label is-private">비공개</span> : null}
                  </span>
                  <span className="community-feed-row__title">
                    {post.isPrivate ? '비밀글입니다.' : post.title}
                  </span>
                  <time dateTime={new Date(post.createdAt).toISOString()}>
                    {new Date(post.createdAt).toLocaleDateString()}
                  </time>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* 좌하: 선수 등록 */}
        <section className="community-panel">
          <div className="community-panel__header">
            <h2>선수 등록 게시판</h2>
            <Link to="player-registration" className="community-text-link">
              더보기 &rarr;
            </Link>
          </div>
          {!isPlayerOrAbove ? (
            <div className="community-access-note">
              선수/기록원 등급 이상 계정만 접근할 수 있습니다.
            </div>
          ) : (
            <div className="community-feed">
              {visiblePlayerRegistrations.length === 0 ? (
                <div className="community-empty">
                  아직 게시글이 없습니다.
                </div>
              ) : (
                visiblePlayerRegistrations.map((post) => (
                  <Link
                    key={post.id}
                    to={`player-registration/${post.id}`}
                    className="community-feed-row"
                  >
                    <span className="community-feed-row__labels">
                      <span className="community-label">{post.category}</span>
                    </span>
                    <span className="community-feed-row__title">
                      {post.title}
                    </span>
                    <time dateTime={new Date(post.createdAt).toISOString()}>
                      {new Date(post.createdAt).toLocaleDateString()}
                    </time>
                  </Link>
                ))
              )}
            </div>
          )}
        </section>

        {/* 우하: 갤러리 */}
        <section className="community-panel">
          <div className="community-panel__header">
            <h2>AUBL 갤러리</h2>
            <Link to="gallery" className="community-text-link">
              전체보기 &rarr;
            </Link>
          </div>
          <div className="community-gallery-preview">
            <div className="community-gallery-preview__shield" />
            <iframe
              title="Gallery Preview"
              src="https://gall.dcinside.com/mgallery/board/lists/?id=aubl"
              tabIndex={-1}
            />
            <Link to="gallery" className="community-action community-action--primary community-gallery-preview__action">
              갤러리 입장하기
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
