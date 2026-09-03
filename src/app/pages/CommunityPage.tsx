import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { firestore } from '../../shared/firebase/client';
import { useCommunityAccess } from '../../shared/auth/useCommunityAccess';
import type { Notice, InquiryPost, PlayerRegistrationPost } from '../../shared/types';

// 스타일 상수
const cardStyle = {
  background: 'rgba(15, 23, 42, 0.6)',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  borderRadius: '18px',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '16px',
  height: '100%', // 부모 Grid 높이에 맞춤
  minHeight: '500px', // 최소 높이 보장 (갤러리 iframe 높이 고려)
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '12px',
};

const titleStyle = {
  fontSize: '20px',
  fontWeight: 900,
  color: '#f8fafc',
  margin: 0,
};

const linkStyle = {
  textDecoration: 'none',
  color: '#60a5fa',
  fontWeight: 700,
  fontSize: '14px',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
};

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
    <div className="season-content-page community-dashboard" style={{ display: 'flex', flexDirection: 'column', gap: '24px', minHeight: '60vh' }}>
      <div className="community-dashboard__grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '24px' }}>
        {/* 좌상: 공지사항 */}
        <section className="community-dashboard__panel" style={cardStyle}>
          <div style={headerStyle}>
            <h2 style={titleStyle}>공지사항</h2>
            <Link to="notices" style={linkStyle}>
              더보기 &rarr;
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
            {displayNotices.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                등록된 공지사항이 없습니다.
              </div>
            ) : (
              displayNotices.map((notice) => (
                <Link
                  key={notice.id}
                  to={`notices/${notice.id}`}
                  style={{
                    textDecoration: 'none',
                    background: 'rgba(255,255,255,0.03)',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: '1px solid rgba(148,163,184,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'all 0.2s',
                  }}
                >
                  <span
                    style={{
                      fontSize: '12px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontWeight: 800,
                      background: getCategoryColor(notice.category),
                      color: '#0f172a',
                      minWidth: 'fit-content',
                    }}
                  >
                    {notice.category}
                  </span>
                  <span style={{ color: '#e2e8f0', fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {notice.title}
                  </span>
                  <span style={{ color: '#64748b', fontSize: '12px', minWidth: 'fit-content' }}>
                    {new Date(notice.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* 우상: 건의/문의 */}
        <section className="community-dashboard__panel" style={cardStyle}>
          <div style={headerStyle}>
            <h2 style={titleStyle}>건의/문의 게시판</h2>
            <Link to="inquiry" style={linkStyle}>
              더보기 &rarr;
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {recentInquiries.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', padding: '24px 0' }}>
                아직 게시글이 없습니다.
              </div>
            ) : (
              recentInquiries.map((post) => (
                <Link
                  key={post.id}
                  to={`inquiry/${post.id}`}
                  style={{
                    textDecoration: 'none',
                    background: 'rgba(255,255,255,0.03)',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    border: '1px solid rgba(148,163,184,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    pointerEvents: post.isPrivate ? 'none' : 'auto',
                    opacity: post.isPrivate ? 0.65 : 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontWeight: 800,
                      background: post.platform === 'app' ? '#818cf8' : '#34d399',
                      color: '#0f172a',
                      minWidth: 'fit-content',
                    }}
                  >
                    {post.platform === 'app' ? '앱' : '웹'}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontWeight: 800,
                      background: getInquiryCategoryColor(post.category),
                      color: '#0f172a',
                      minWidth: 'fit-content',
                    }}
                  >
                    {post.category}
                  </span>
                  {post.isPrivate && <span style={{ fontSize: '12px' }}>🔒</span>}
                  <span style={{ color: '#e2e8f0', fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {post.isPrivate ? '비밀글입니다.' : post.title}
                  </span>
                  <span style={{ color: '#64748b', fontSize: '12px', minWidth: 'fit-content' }}>
                    {new Date(post.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* 좌하: 선수 등록 */}
        <section className="community-dashboard__panel" style={cardStyle}>
          <div style={headerStyle}>
            <h2 style={titleStyle}>선수 등록 게시판</h2>
            <Link to="player-registration" style={linkStyle}>
              더보기 &rarr;
            </Link>
          </div>
          {!isPlayerOrAbove ? (
            <div
              style={{
                borderRadius: '12px',
                border: '1px solid rgba(248,113,113,0.35)',
                background: 'rgba(127,29,29,0.35)',
                color: '#fecaca',
                padding: '14px',
                lineHeight: 1.7,
                fontWeight: 700,
              }}
            >
              선수/기록원 등급 이상 계정만 접근할 수 있습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {visiblePlayerRegistrations.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', padding: '24px 0' }}>
                  아직 게시글이 없습니다.
                </div>
              ) : (
                visiblePlayerRegistrations.map((post) => (
                  <Link
                    key={post.id}
                    to={`player-registration/${post.id}`}
                    style={{
                      textDecoration: 'none',
                      background: 'rgba(255,255,255,0.03)',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      border: '1px solid rgba(148,163,184,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 800,
                        background: getPlayerRegistrationCategoryColor(post.category),
                        color: '#0f172a',
                        minWidth: 'fit-content',
                      }}
                    >
                      {post.category}
                    </span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {post.title}
                    </span>
                    <span style={{ color: '#64748b', fontSize: '12px', minWidth: 'fit-content' }}>
                      {new Date(post.createdAt).toLocaleDateString()}
                    </span>
                  </Link>
                ))
              )}
            </div>
          )}
        </section>

        {/* 우하: 갤러리 */}
        <section className="community-dashboard__panel community-dashboard__panel--gallery" style={cardStyle}>
          <div style={headerStyle}>
            <h2 style={titleStyle}>AUBL 갤러리</h2>
            <Link to="gallery" style={linkStyle}>
              전체보기 &rarr;
            </Link>
          </div>
          <div style={{ flex: 1, background: '#fff', borderRadius: '12px', overflow: 'hidden', position: 'relative', minHeight: '400px' }}>
            <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'transparent' }} />
            <iframe
              title="Gallery Preview"
              src="https://gall.dcinside.com/mgallery/board/lists/?id=aubl"
              style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none', opacity: 0.7 }}
              tabIndex={-1}
            />
            <div
              style={{
                position: 'absolute',
                bottom: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 20,
                background: 'rgba(15, 23, 42, 0.9)',
                padding: '10px 20px',
                borderRadius: '20px',
                color: '#fff',
                fontWeight: 700,
                fontSize: '14px',
                whiteSpace: 'nowrap',
              }}
            >
              <Link to="gallery" style={{ color: 'inherit', textDecoration: 'none' }}>
                갤러리 입장하기
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function getInquiryCategoryColor(category: string) {
  switch (category) {
    case '기능 개선': return '#60a5fa';
    case '버그 신고': return '#f87171';
    case '사용 문의': return '#4ade80';
    default: return '#94a3b8';
  }
}

function getCategoryColor(category: string) {
  switch(category) {
    case '긴급': return '#f87171';
    case '심판/기록원 모집': return '#22c55e';
    case '징계': return '#fb923c';
    case '경기공지': return '#60a5fa';
    default: return '#94a3b8';
  }
}

function getPlayerRegistrationCategoryColor(category: string) {
  switch (category) {
    case '선수 등록': return '#f87171';
    case '유니폼 등록': return '#34d399';
    default: return '#94a3b8';
  }
}
