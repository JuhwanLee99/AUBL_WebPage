import 'package:flutter/material.dart';

import '../../core/contracts/web_contracts.dart';
import '../../core/theme/app_theme.dart';

/* ─── 데이터 모델 ─── */

class _ManualItem {
  final String heading;
  final List<String> bullets;
  const _ManualItem({
    required this.heading,
    required this.bullets,
  });
}

class _ManualSection {
  final String title;
  final IconData icon;
  final Color accent;
  final List<_ManualItem> items;

  const _ManualSection({
    required this.title,
    required this.icon,
    required this.accent,
    required this.items,
  });
}

/* ─── 콘텐츠 데이터 ─── */

const _roleLabels = ['방문자', '일반 회원', '관리자/기록원'];
const _roleIcons = [
  Icons.people_outline,
  Icons.person_outline,
  Icons.shield_outlined
];

final _guestSections = <_ManualSection>[
  const _ManualSection(
    title: '메인 및 리그 정보',
    icon: Icons.home_outlined,
    accent: AppTheme.blue400,
    items: [
      _ManualItem(
        heading: '홈 탭',
        bullets: [
          '라이브 경기, 오늘 일정, 내일 일정, 최근 결과를 확인합니다.',
          '당겨서 새로고침으로 최신 데이터를 반영합니다.',
        ],
      ),
      _ManualItem(
        heading: '팀 탭',
        bullets: [
          '팀명 검색, 조(A~H) 필터, 조별/이름순 정렬',
          '팀 카드를 탭하여 팀 상세로 진입합니다.',
        ],
      ),
      _ManualItem(
        heading: '더보기 > 리그 정보',
        bullets: [
          '리그 소개, 회칙, 개인정보 처리방침, 이용약관을 확인합니다.',
        ],
      ),
    ],
  ),
  const _ManualSection(
    title: '경기 일정 및 결과',
    icon: Icons.calendar_today,
    accent: AppTheme.green500,
    items: [
      _ManualItem(
        heading: '일정 탭',
        bullets: [
          '전체: 전체 경기 일정 확인',
          '라이브: 진행 중 경기만 조회',
          '결과: 종료 경기 조회',
          '조별: 조별 경기 필터 조회',
          '연습경기: 연습경기만 별도 조회',
        ],
      ),
      _ManualItem(
        heading: '경기 카드 탭',
        bullets: [
          '경기 카드를 누르면 문자중계/결과 화면으로 이동합니다.',
        ],
      ),
    ],
  ),
  const _ManualSection(
    title: '순위 및 기록실',
    icon: Icons.bar_chart,
    accent: AppTheme.orange500,
    items: [
      _ManualItem(
        heading: '기록 탭',
        bullets: [
          '개요, 팀순위, 투수기록, 타자기록, 파워랭킹, 선수상세 탭 전환',
          '시즌 선택, 검색/필터, 정렬 기준 변경',
          '선수 상세에서 시즌/게임 로그 조회',
        ],
      ),
    ],
  ),
  const _ManualSection(
    title: '경기 중계 시청',
    icon: Icons.live_tv,
    accent: AppTheme.purple500,
    items: [
      _ManualItem(
        heading: '문자중계',
        bullets: [
          '일정/홈에서 경기 선택 시 문자중계 화면으로 이동합니다.',
          '스코어보드/라이브 오버레이는 관리자 WebView에서 사용합니다.',
        ],
      ),
    ],
  ),
];

final _memberSections = <_ManualSection>[
  const _ManualSection(
    title: '로그인 및 계정 관리',
    icon: Icons.lock_outline,
    accent: AppTheme.blue400,
    items: [
      _ManualItem(
        heading: '첫 실행 온보딩',
        bullets: [
          '"로그인 / 회원가입" 또는 "그냥 사용하기" 선택',
        ],
      ),
      _ManualItem(
        heading: '로그인 방식',
        bullets: [
          'WebView 로그인, 네이티브 Google 로그인, WebView Apple 로그인(iOS/Android)',
        ],
      ),
      _ManualItem(
        heading: '계정 화면',
        bullets: [
          'UID, 이메일, 로그인 제공자, 역할 확인',
          '계정 생성일, 최근 로그인 시각 표시',
          '로그아웃: Firebase 세션 및 WebView 쿠키 정리',
          '회원 탈퇴: 더보기 → 계정 → 회원 탈퇴 (재인증 후 처리)',
          '외부 삭제 안내: https://aubl.club/account-deletion',
        ],
      ),
    ],
  ),
  const _ManualSection(
    title: '커뮤니티 이용',
    icon: Icons.forum_outlined,
    accent: AppTheme.green500,
    items: [
      _ManualItem(
        heading: '공지사항',
        bullets: [
          '카테고리 필터: 전체, 긴급, 경기공지, 징계, 일반',
          '제목/내용/작성자 기준 검색',
          '공지 상세에서 댓글 작성/조회/삭제(본인 댓글)',
          '갤러리 배너로 외부 커뮤니티 이동',
        ],
      ),
      _ManualItem(
        heading: '건의/문의 게시판',
        bullets: [
          '커뮤니티 탭에서 건의/문의 게시판 배너로 진입',
          '플랫폼(앱/웹), 말머리(5종), 처리상태 필터',
          '말머리: 기능 개선 / 버그 신고 / 사용 문의 / 경기·기록 오류 / 기타',
          '처리상태: 미처리 / 처리 중 / 처리 완료',
          '비밀글은 목록에 표시되지만 작성자만 열람 가능',
          '로그인 후 글쓰기 가능 / 본인 글 수정·삭제 / 댓글 작성·삭제',
        ],
      ),
    ],
  ),
  const _ManualSection(
    title: '팀 상세 및 팀 공지',
    icon: Icons.sports_baseball,
    accent: AppTheme.orange500,
    items: [
      _ManualItem(
        heading: '팀 상세',
        bullets: [
          '팀 소개, 로스터, 팀 공지, 예정/최근 경기 확인',
        ],
      ),
      _ManualItem(
        heading: '팀 공지 게시판',
        bullets: [
          '카테고리 필터(전체/일반/훈련/경기/긴급)',
          '공지 검색, 고정 공지 우선 정렬',
          '댓글/답글 작성, 좋아요, 본인 댓글 삭제',
        ],
      ),
    ],
  ),
  const _ManualSection(
    title: '알림 설정',
    icon: Icons.notifications_outlined,
    accent: AppTheme.amber400,
    items: [
      _ManualItem(
        heading: '더보기 > 알림 설정',
        bullets: [
          '전체 알림 ON/OFF (OFF 시 긴급 공지 포함 모든 알림 중단)',
          '커뮤니티 공지 알림 ON/OFF',
          '홈팀 공지 알림 ON/OFF',
          '건의/문의 알림 ON/OFF — 내 글의 처리 상태 변경 및 새 댓글 알림 (로그인 시 동작)',
          '경기 알림: 전체 경기 / 소속팀 경기 / 받지 않음',
        ],
      ),
    ],
  ),
  const _ManualSection(
    title: '감독(Coach) 팀 홈 관리',
    icon: Icons.manage_accounts,
    accent: AppTheme.purple500,
    items: [
      _ManualItem(
        heading: '팀 브랜딩/소개',
        bullets: [
          '웹 팀 홈에서 로고 변경, 팀 설명 추가/수정',
        ],
      ),
      _ManualItem(
        heading: '팀 일정 운영',
        bullets: [
          '앱에서 예정/진행/최근 경기 확인',
          '웹 일정 화면으로 이동해 일정 운영',
        ],
      ),
      _ManualItem(
        heading: '선수 로스터',
        bullets: [
          '웹 팀 홈에서 선수 추가/수정/정리',
          '등번호/포지션/투타/프로필 관리',
        ],
      ),
      _ManualItem(
        heading: '팀 공지 운영',
        bullets: [
          '앱에서 공지 작성(제목/내용/카테고리 + 고정 옵션)',
          '공지 고정/해제, 삭제 수행',
        ],
      ),
    ],
  ),
];

final _adminSections = <_ManualSection>[
  const _ManualSection(
    title: '관리자 메뉴',
    icon: Icons.admin_panel_settings,
    accent: Colors.red,
    items: [
      _ManualItem(
        heading: '더보기 > 관리자 섹션',
        bullets: [
          '관리자 권한 계정에만 관리자 메뉴가 노출됩니다.',
          '권한이 없으면 관리자 메뉴가 보이지 않습니다.',
        ],
      ),
    ],
  ),
  const _ManualSection(
    title: '경기 일정 관리',
    icon: Icons.edit_calendar,
    accent: AppTheme.orange500,
    items: [
      _ManualItem(
        heading: '더보기 > 일정 관리',
        bullets: [
          'WebView로 ${WebRouteContracts.scheduleManage} 진입',
          '일정 생성/수정, 상태 변경(예정/진행 중/종료/취소)',
          '연습경기 운영',
        ],
      ),
    ],
  ),
  const _ManualSection(
    title: '관리자 패널',
    icon: Icons.settings,
    accent: AppTheme.blue400,
    items: [
      _ManualItem(
        heading: '더보기 > 관리자 패널',
        bullets: [
          'WebView로 ${WebRouteContracts.admin} 진입',
          '랜딩 문구/티커, 리그 소개, 회칙, 팀/조 편성, 감독 권한 관리',
          '경기 기록 수정(/admin/games) — 종료 경기 라인업·박스스코어 사후 수정',
          '서비스 점검 모드 ON/OFF — 점검 메시지·재개일 설정, 저장 즉시 반영',
        ],
      ),
    ],
  ),
  const _ManualSection(
    title: '경기 기록 수정',
    icon: Icons.edit_note,
    accent: AppTheme.amber400,
    items: [
      _ManualItem(
        heading: '더보기 > 관리자 패널 > 경기 기록 수정',
        bullets: [
          '완료·취소 경기 목록에서 수정할 경기를 선택합니다.',
          '라인업 수정: 선수 이름·등번호·포지션 인라인 편집 → 라인업 저장',
          '박스스코어 수정: 라인스코어·합계·타자·투수 기록 직접 편집 → 박스스코어 저장',
          '저장 후 백엔드 재임포트 실행 버튼을 눌러야 랭킹·기록이 갱신됩니다.',
          '가로 스크롤이 필요하므로 태블릿 또는 가로 모드를 권장합니다.',
        ],
      ),
    ],
  ),
  const _ManualSection(
    title: '전자 기록지 작성',
    icon: Icons.fact_check,
    accent: AppTheme.green500,
    items: [
      _ManualItem(
        heading: '더보기 > 기록원',
        bullets: [
          'WebView 전체화면으로 ${WebRouteContracts.scorekeeper} 진입',
          '경기 선택 및 라인업 입력',
          '타석/주루/수비 이벤트 기록',
          'Lock 점유/해제, 단축키 모드',
          '문자 중계 입력, 경기 종료 및 CSV 저장/다운로드',
        ],
      ),
    ],
  ),
  const _ManualSection(
    title: '라이브 방송 제어',
    icon: Icons.cast,
    accent: AppTheme.purple500,
    items: [
      _ManualItem(
        heading: '더보기 > 스코어보드',
        bullets: [
          'WebView로 ${WebRouteContracts.scoreboard} 진입',
          '기록원 데이터가 문자중계/오버레이에 반영되는 상태 점검',
        ],
      ),
    ],
  ),
];

final _troubleshooting = <({String title, List<String> steps})>[
  (
    title: '로그인이 안 될 때',
    steps: [
      '앱 완전 종료 후 재실행',
      '로그아웃 후 재로그인',
      'Google 로그인 문제 시 기기 Google 계정 상태 확인',
      'Apple 로그인 문제 시 WebView에서 버튼 재시도 및 기본 브라우저 로그인 상태 확인',
    ],
  ),
  (
    title: '데이터가 오래된 것 같을 때',
    steps: [
      '화면 당겨서 새로고침',
      '앱 재실행',
      '네트워크 상태 확인',
    ],
  ),
  (
    title: '관리자 메뉴가 보이지 않을 때',
    steps: [
      '계정 역할 재확인',
      '관리자 권한 반영 후 재로그인',
      '여전히 미노출 시 권한 매핑(admin claim, roles) 점검',
    ],
  ),
  (
    title: '종료 경기 기록을 수정해야 할 때',
    steps: [
      '더보기 > 관리자 패널 > 경기 기록 수정(/admin/games)으로 진입합니다.',
      '대상 경기를 선택해 라인업 또는 박스스코어를 수정하고 저장합니다.',
      '저장 후 백엔드 재임포트 실행을 눌러야 랭킹·기록 페이지에 반영됩니다.',
      '박스스코어 편집은 가로 스크롤이 필요하므로 태블릿 또는 가로 모드 권장',
    ],
  ),
];

/* ─── 메인 스크린 ─── */

class UserManualScreen extends StatefulWidget {
  const UserManualScreen({super.key});

  @override
  State<UserManualScreen> createState() => _UserManualScreenState();
}

class _UserManualScreenState extends State<UserManualScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  List<_ManualSection> _sectionsForTab(int index) {
    return switch (index) {
      0 => _guestSections,
      1 => _memberSections,
      2 => _adminSections,
      _ => _guestSections,
    };
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          // ── 히어로 헤더 ──
          SliverToBoxAdapter(child: _buildHero()),

          // ── 탭 바 ──
          SliverPersistentHeader(
            pinned: true,
            delegate: _TabBarDelegate(
              tabBar: TabBar(
                controller: _tabCtrl,
                onTap: (_) => setState(() {}),
                isScrollable: false,
                labelColor: AppTheme.blue400,
                unselectedLabelColor: AppTheme.slate400,
                indicatorColor: AppTheme.blue400,
                indicatorSize: TabBarIndicatorSize.label,
                dividerColor: AppTheme.slate700,
                tabs: List.generate(
                    3,
                    (i) => Tab(
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(_roleIcons[i], size: 16),
                              const SizedBox(width: 4),
                              Flexible(
                                child: Text(
                                  _roleLabels[i],
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600),
                                ),
                              ),
                            ],
                          ),
                        )),
              ),
            ),
          ),

          // ── 본문 ──
          SliverToBoxAdapter(
            child: AnimatedBuilder(
              animation: _tabCtrl,
              builder: (context, _) {
                final sections = _sectionsForTab(_tabCtrl.index);
                return Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                  child: Column(
                    children:
                        sections.map((s) => _SectionCard(section: s)).toList(),
                  ),
                );
              },
            ),
          ),

          // ── 문제 해결 ──
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: _buildTroubleshooting(),
            ),
          ),

          // ── 푸터 ──
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppTheme.slate800,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                      color: AppTheme.slate700.withValues(alpha: 0.5)),
                ),
                child: const Text(
                  '문서 버전: 2026-02-18\n앱 구조: 하단 탭 홈 · 팀 · 일정 · 기록 · 커뮤니티 · 더보기\n일부 관리 기능은 WebView로 웹 관리 화면에 연결됩니다.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: AppTheme.slate500, fontSize: 11, height: 1.6),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /* ── 히어로 ── */
  Widget _buildHero() {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(
          20, MediaQuery.of(context).padding.top + 16, 20, 28),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF0a1a3f), Color(0xFF0f2f8f), Color(0xFF0a1a3f)],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              GestureDetector(
                onTap: () => Navigator.of(context).pop(),
                child: const Icon(Icons.arrow_back, color: Colors.white),
              ),
              const SizedBox(width: 12),
              const Text('사용 설명서',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: AppTheme.blue400.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
              border:
                  Border.all(color: AppTheme.blue400.withValues(alpha: 0.3)),
            ),
            child: const Text(
              'AUBL · USER MANUAL',
              style: TextStyle(
                  color: AppTheme.blue400,
                  fontSize: 11,
                  fontWeight: FontWeight.w600),
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'AUBL 앱 사용 설명서',
            style: TextStyle(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.w800,
              height: 1.3,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            '방문자, 일반 회원, 관리자/기록원별로 사용 가능한 기능을 안내합니다. 탭을 전환하여 역할별 가이드를 확인하세요.',
            style:
                TextStyle(color: AppTheme.slate300, fontSize: 13, height: 1.6),
          ),
        ],
      ),
    );
  }

  /* ── 문제 해결 ── */
  Widget _buildTroubleshooting() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            Icon(Icons.build_outlined, size: 16, color: AppTheme.amber400),
            SizedBox(width: 8),
            Text('문제 해결',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w700)),
          ],
        ),
        const SizedBox(height: 10),
        ..._troubleshooting.map((item) => Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppTheme.slate800,
                borderRadius: BorderRadius.circular(12),
                border:
                    Border.all(color: AppTheme.slate700.withValues(alpha: 0.5)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.title,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  ...item.steps.asMap().entries.map((e) => Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              width: 20,
                              child: Text(
                                '${e.key + 1}.',
                                style: const TextStyle(
                                    color: AppTheme.blue400,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600),
                              ),
                            ),
                            Expanded(
                              child: Text(e.value,
                                  style: const TextStyle(
                                      color: AppTheme.slate300,
                                      fontSize: 13,
                                      height: 1.5)),
                            ),
                          ],
                        ),
                      )),
                ],
              ),
            )),
      ],
    );
  }
}

/* ─── 섹션 카드 (확장 가능 아코디언) ─── */

class _SectionCard extends StatefulWidget {
  const _SectionCard({required this.section});
  final _ManualSection section;

  @override
  State<_SectionCard> createState() => _SectionCardState();
}

class _SectionCardState extends State<_SectionCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final s = widget.section;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: _expanded ? s.accent.withValues(alpha: 0.06) : AppTheme.slate800,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: _expanded
              ? s.accent.withValues(alpha: 0.3)
              : AppTheme.slate700.withValues(alpha: 0.5),
        ),
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          leading: Icon(s.icon, color: s.accent, size: 22),
          title: Text(s.title,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w700)),
          initiallyExpanded: false,
          onExpansionChanged: (v) => setState(() => _expanded = v),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          children: s.items.map((item) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 12),
                Text(item.heading,
                    style: TextStyle(
                        color: s.accent,
                        fontSize: 14,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                ...item.bullets.map((b) => Padding(
                      padding: const EdgeInsets.only(bottom: 3),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('• ',
                              style: TextStyle(color: s.accent, fontSize: 13)),
                          Expanded(
                            child: Text(b,
                                style: const TextStyle(
                                    color: AppTheme.slate300,
                                    fontSize: 13,
                                    height: 1.5)),
                          ),
                        ],
                      ),
                    )),
                _ScreenshotPlaceholder(label: item.heading),
              ],
            );
          }).toList(),
        ),
      ),
    );
  }
}

/* ─── 스크린샷 Placeholder ─── */

class _ScreenshotPlaceholder extends StatelessWidget {
  const _ScreenshotPlaceholder({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.symmetric(vertical: 32),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: AppTheme.slate700.withValues(alpha: 0.5),
          style: BorderStyle.solid,
          strokeAlign: BorderSide.strokeAlignInside,
        ),
        color: AppTheme.slate900.withValues(alpha: 0.6),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.image_outlined,
              size: 28, color: AppTheme.slate600.withValues(alpha: 0.7)),
          const SizedBox(height: 6),
          Text(
            '스크린샷: $label',
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppTheme.slate600, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

/* ─── 탭 바 Persistent Header ─── */

class _TabBarDelegate extends SliverPersistentHeaderDelegate {
  final TabBar tabBar;

  _TabBarDelegate({required this.tabBar});

  @override
  double get minExtent => tabBar.preferredSize.height;

  @override
  double get maxExtent => tabBar.preferredSize.height;

  @override
  Widget build(
      BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      color: AppTheme.slate900,
      child: tabBar,
    );
  }

  @override
  bool shouldRebuild(covariant _TabBarDelegate oldDelegate) => false;
}
