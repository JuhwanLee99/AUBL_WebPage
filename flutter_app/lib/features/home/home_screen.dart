import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:timeago/timeago.dart' as timeago;
import 'package:url_launcher/url_launcher.dart';

import '../../core/data/team_groups.dart';
import '../../core/models/match.dart';
import '../../core/models/match_state.dart';
import '../../core/models/team_notice.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
import '../../app/shell_controller.dart';
import '../../core/webview/app_webview_screen.dart';
import '../../core/widgets/match_status_badge.dart';
import '../intro/intro_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _fs = FirestoreService();
  List<Match> _todayMatches = [];
  List<Match> _tomorrowMatches = [];
  List<Match> _completedMatches = [];
  bool _loadingSchedule = true;

  // 사용자 팀 정보
  String? _userTeamId;
  String? _userTeamName;
  List<TeamNotice> _teamNotices = [];
  bool _loadingNotices = true;

  @override
  void initState() {
    super.initState();
    _loadSchedule();
    _loadUserTeam();
  }

  Future<void> _loadSchedule() async {
    try {
      final all = await _fs.getAllMatches();
      final now = DateTime.now();
      final todayStr =
          '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
      final tomorrow = now.add(const Duration(days: 1));
      final tomorrowStr =
          '${tomorrow.year}-${tomorrow.month.toString().padLeft(2, '0')}-${tomorrow.day.toString().padLeft(2, '0')}';

      final today = <Match>[];
      final tmrw = <Match>[];
      final completed = <Match>[];

      for (final m in all) {
        if (m.isCompleted) {
          completed.add(m);
        }
        if (m.startTime != null) {
          final dateStr = m.startTime!.substring(0, 10);
          if (dateStr == todayStr && m.status == 'scheduled') {
            today.add(m);
          } else if (dateStr == tomorrowStr && m.status == 'scheduled') {
            tmrw.add(m);
          }
        }
      }

      completed.sort(
          (a, b) => (b.startTime ?? '').compareTo(a.startTime ?? ''));

      if (mounted) {
        setState(() {
          _todayMatches = today;
          _tomorrowMatches = tmrw;
          _completedMatches = completed.take(5).toList();
          _loadingSchedule = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingSchedule = false);
    }
  }

  Future<void> _loadUserTeam() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      if (mounted) setState(() => _loadingNotices = false);
      return;
    }

    try {
      final roleDoc = await _fs.watchUserRole(user.uid).first;
      if (roleDoc != null && roleDoc['teamId'] != null) {
        final teamId = roleDoc['teamId'] as String;
        final teamName = roleDoc['teamName'] as String? ?? teamId;
        final notices = await _fs.watchTeamNotices(teamId).first;
        if (mounted) {
          setState(() {
            _userTeamId = teamId;
            _userTeamName = teamName;
            _teamNotices = [
              ...notices.where((n) => n.pinned),
              ...notices.where((n) => !n.pinned),
            ].take(5).toList();
            _loadingNotices = false;
          });
        }
      } else {
        if (mounted) setState(() => _loadingNotices = false);
      }
    } catch (_) {
      if (mounted) setState(() => _loadingNotices = false);
    }
  }

  Future<void> _onRefresh() async {
    await Future.wait([_loadSchedule(), _loadUserTeam()]);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // 화면 중앙 배경 로고
          Center(
            child: Opacity(
              opacity: 0.5,
              child: Image.asset(
                'assets/images/aubl_clean.png',
                width: 400,
                fit: BoxFit.contain,
              ),
            ),
          ),
          // 메인 콘텐츠
          RefreshIndicator(
            onRefresh: _onRefresh,
            child: CustomScrollView(
          slivers: [
            SliverPersistentHeader(
              pinned: true,
              delegate: _StickyHeroDelegate(
                statusBarHeight: MediaQuery.of(context).padding.top,
                onIntroTap: () {
                  Navigator.of(context).push(MaterialPageRoute<void>(
                    builder: (_) => const IntroScreen(),
                  ));
                },
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // ── 라이브 경기 ──
                    _buildSectionTitle(
                        '라이브 경기', Icons.circle, AppTheme.red500),
                    const SizedBox(height: 8),
                    _buildLiveMatches(),
                    const SizedBox(height: 24),

                    // ── 오늘 일정 ──
                    _buildSectionTitle(
                        '오늘 일정', Icons.calendar_today, AppTheme.slate300),
                    const SizedBox(height: 8),
                    _buildHorizontalSchedule(
                        _todayMatches, '오늘 예정된 경기가 없습니다.'),
                    const SizedBox(height: 24),

                    // ── 내일 일정 ──
                    _buildSectionTitle(
                        '내일 일정', Icons.event, AppTheme.slate300),
                    const SizedBox(height: 8),
                    _buildHorizontalSchedule(
                        _tomorrowMatches, '내일 예정된 경기가 없습니다.'),
                    const SizedBox(height: 24),

                    // ── 최근 경기 결과 ──
                    _buildSectionTitle(
                        '최근 경기 결과', Icons.scoreboard, AppTheme.slate300),
                    const SizedBox(height: 8),
                    _buildRecentResults(),
                    const SizedBox(height: 24),

                    // ── 팀 공지 ──
                    if (_userTeamId != null) ...[
                      _buildSectionTitle(
                        '$_userTeamName 공지',
                        Icons.campaign,
                        AppTheme.slate300,
                      ),
                      const SizedBox(height: 8),
                      _buildTeamNotices(),
                      const SizedBox(height: 24),
                    ],

                    // ── KEY VALUES ──
                    _buildKeyValues(),
                    const SizedBox(height: 16),

                    // ── 시즌 요약 ──
                    _buildSectionTitle(
                        '2026 시즌', Icons.sports_baseball, AppTheme.slate300),
                    const SizedBox(height: 8),
                    _buildSeasonSnapshot(),
                    const SizedBox(height: 24),

                    // ── 바로가기 ──
                    _buildSeasonHighlights(),
                    const SizedBox(height: 24),

                    // ── 소셜 CTA ──
                    _buildSocialCta(),
                    const SizedBox(height: 16),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title, IconData icon, Color color) {
    return Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 8),
        Text(
          title,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  // ── 라이브 경기 (실시간) ──
  Widget _buildLiveMatches() {
    return StreamBuilder<List<Match>>(
      stream: _fs.watchLiveMatches(),
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const _PlaceholderCard(text: '라이브 경기를 확인하는 중...');
        }
        final matches = snap.data ?? [];
        if (matches.isEmpty) {
          return const _PlaceholderCard(text: '현재 진행 중인 경기가 없습니다.');
        }
        return Column(
          children:
              matches.map((m) => _LiveMatchCard(match: m, fs: _fs)).toList(),
        );
      },
    );
  }

  // ── 일정 가로 스크롤 ──
  Widget _buildHorizontalSchedule(List<Match> matches, String emptyText) {
    if (_loadingSchedule) {
      return const _PlaceholderCard(text: '일정을 불러오는 중...');
    }
    if (matches.isEmpty) {
      return _PlaceholderCard(text: emptyText);
    }

    return SizedBox(
      height: 120,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: matches.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, i) => _SchedulePreviewCard(match: matches[i]),
      ),
    );
  }

  // ── 최근 경기 결과 ──
  Widget _buildRecentResults() {
    if (_loadingSchedule) {
      return const _PlaceholderCard(text: '결과를 불러오는 중...');
    }
    if (_completedMatches.isEmpty) {
      return const _PlaceholderCard(text: '완료된 경기가 없습니다.');
    }

    return Column(
      children: List.generate(_completedMatches.length, (idx) {
        final m = _completedMatches[idx];
        String dateLabel = '';
        if (m.startTime != null) {
          try {
            final dt = DateTime.parse(m.startTime!);
            dateLabel = DateFormat('M/d (E)', 'ko').format(dt);
          } catch (_) {}
        }

        return Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: AppTheme.slate800.withValues(alpha: 0.5),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
                color: AppTheme.slate700.withValues(alpha: 0.5)),
          ),
          child: Row(
            children: [
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  color: AppTheme.blue500.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text(
                  '${idx + 1}',
                  style: const TextStyle(
                    color: AppTheme.blue400,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${m.awayTeamName}  vs  ${m.homeTeamName}',
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 13,
                          fontWeight: FontWeight.w600),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      dateLabel,
                      style: const TextStyle(
                          color: AppTheme.slate500, fontSize: 11),
                    ),
                  ],
                ),
              ),
              Text(
                '${m.awayScore ?? 0} : ${m.homeScore ?? 0}',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
        );
      }),
    );
  }

  // ── 팀 공지 ──
  Widget _buildTeamNotices() {
    if (_loadingNotices) {
      return const _PlaceholderCard(text: '공지를 불러오는 중...');
    }
    if (_teamNotices.isEmpty) {
      return const _PlaceholderCard(text: '등록된 팀 공지가 없습니다.');
    }
    return Column(
      children: _teamNotices.map((n) {
        final ago = timeago.format(
          DateTime.fromMillisecondsSinceEpoch(n.createdAt),
          locale: 'ko',
        );
        return Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppTheme.slate800.withValues(alpha: 0.5),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: n.pinned
                  ? AppTheme.amber400.withValues(alpha: 0.3)
                  : AppTheme.slate700.withValues(alpha: 0.5),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  if (n.pinned) ...[
                    const Icon(Icons.push_pin,
                        size: 13, color: AppTheme.amber400),
                    const SizedBox(width: 4),
                  ],
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(
                      color: AppTheme.blue500.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      n.category,
                      style: const TextStyle(
                        color: AppTheme.blue400,
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const Spacer(),
                  Text(ago,
                      style: const TextStyle(
                          color: AppTheme.slate500, fontSize: 11)),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                n.title,
                style: const TextStyle(color: Colors.white, fontSize: 14),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  // ── 시즌 요약 ──
  Widget _buildSeasonSnapshot() {
    return Row(
      children: [
        _StatCard(
          label: 'TEAMS',
          value: '${teamGroups.length}',
          description: '참가 팀',
        ),
        const SizedBox(width: 8),
        _StatCard(
          label: 'GROUPS',
          value: '${groupLetters.length}',
          description: '조 편성',
        ),
        const SizedBox(width: 8),
        _StatCard(
          label: 'GAMES',
          value: _loadingSchedule ? '-' : '${_completedMatches.length}',
          description: '완료된 경기',
        ),
      ],
    );
  }

  // ── KEY VALUES ──
  Widget _buildKeyValues() {
    const values = [
      (Icons.school, 'UNIVERSITY', '대학생 중심의 리그 운영'),
      (Icons.sports_baseball, 'FAIR PLAY', '공정한 경쟁과 스포츠맨십'),
      (Icons.people, 'COMMUNITY', '야구를 사랑하는 커뮤니티'),
      (Icons.trending_up, 'GROWTH', '선수 개개인의 성장 지원'),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionTitle('AUBL KEY VALUES', Icons.star, AppTheme.blue400),
        const SizedBox(height: 8),
        LayoutBuilder(builder: (context, constraints) {
          // 태블릿(넓은 화면)에서 카드 높이가 과도하게 커지지 않도록 비율 조정
          final ratio = constraints.maxWidth > 600 ? 2.4 : 2.0;
          return GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            padding: EdgeInsets.zero,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: ratio,
            children: values.map((v) {
              final (icon, title, desc) = v;
              return Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppTheme.slate800.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                      color: AppTheme.slate700.withValues(alpha: 0.5)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(icon, color: AppTheme.blue400, size: 20),
                    const SizedBox(height: 6),
                    Text(title,
                        style: const TextStyle(
                          color: AppTheme.slate300,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.5,
                        )),
                    const SizedBox(height: 3),
                    Text(desc,
                        style: const TextStyle(
                            color: AppTheme.slate500, fontSize: 11)),
                  ],
                ),
              );
            }).toList(),
          );
        }),
      ],
    );
  }

  // ── 시즌 하이라이트 ──
  Widget _buildSeasonHighlights() {
    const highlights = [
      (Icons.groups, '팀', '참가 팀 목록 및 상세 정보'),
      (Icons.calendar_month, '일정', '전체 경기 일정 확인'),
      (Icons.leaderboard, '기록', '타자·투수 시즌 기록'),
      (Icons.emoji_events, '순위', 'Elo 기반 팀 순위'),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionTitle(
            '바로가기', Icons.bolt, AppTheme.slate300),
        const SizedBox(height: 10),
        Row(
          children: highlights.map((h) {
            final (icon, label, _) = h;
            return Expanded(
              child: GestureDetector(
                onTap: () {
                  // 바로가기 탭 인덱스: 팀=1, 일정=2, 기록=3, 순위=더보기
                  final idx = {
                    '팀': 1,
                    '일정': 2,
                    '기록': 3,
                  };
                  final tabIdx = idx[label];
                  if (tabIdx != null) {
                    // MainShell의 BottomNav 탭 전환은 직접 접근이 어려우므로 스킵
                  }
                },
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  decoration: BoxDecoration(
                    color: AppTheme.slate800.withValues(alpha: 0.5),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                        color: AppTheme.slate700.withValues(alpha: 0.5)),
                  ),
                  child: Column(
                    children: [
                      Icon(icon, color: AppTheme.blue400, size: 22),
                      const SizedBox(height: 6),
                      Text(label,
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  // ── 소셜 CTA ──
  Widget _buildSocialCta() {
    return GestureDetector(
      onTap: () async {
        final uri = Uri.parse('https://instagram.com/aubl_1981');
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      },
      child: Container(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0x99833AB4), Color(0x99E1306C), Color(0x99F77737)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Padding(
          padding: EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(Icons.camera_alt, color: Colors.white, size: 24),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('AUBL 인스타그램',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w600)),
                    SizedBox(height: 2),
                    Text('@aubl_1981 · 소식과 하이라이트',
                        style: TextStyle(
                            color: Colors.white70, fontSize: 12)),
                  ],
                ),
              ),
              Icon(Icons.open_in_new, color: Colors.white70, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}

// ────────────────────────────────────────────
// 시즌 통계 카드
// ────────────────────────────────────────────
class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.description,
  });

  final String label, value, description;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppTheme.slate800.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
              color: AppTheme.slate700.withValues(alpha: 0.5)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: const TextStyle(
                    color: AppTheme.slate400,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5)),
            const SizedBox(height: 4),
            Text(value,
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(description,
                style: const TextStyle(
                    color: AppTheme.slate500, fontSize: 11)),
          ],
        ),
      ),
    );
  }
}

// ────────────────────────────────────────────
// 라이브 경기 카드 (실시간 MatchState 구독)
// ────────────────────────────────────────────
class _LiveMatchCard extends StatelessWidget {
  const _LiveMatchCard({required this.match, required this.fs});

  final Match match;
  final FirestoreService fs;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<MatchState?>(
      stream: fs.watchMatchState(match.id),
      builder: (context, stateSnap) {
        final ms = stateSnap.data;

        return GestureDetector(
          onTap: () {
            final shell = ShellController.of(context);
            if (shell != null) {
              shell.openEmbeddedWebView(
                  '/scoreboard-text/${match.id}', '문자중계');
            } else {
              Navigator.of(context).push(MaterialPageRoute<void>(
                builder: (_) => AppWebViewScreen(
                  path: '/scoreboard-text/${match.id}',
                  title: '문자중계',
                ),
              ));
            }
          },
          child: Container(
            width: double.infinity,
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.slate800.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                  color: AppTheme.red500.withValues(alpha: 0.3)),
            ),
            child: Column(
              children: [
                // 상태 배지 + 이닝
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const MatchStatusBadge(status: 'inProgress'),
                    if (ms != null) ...[
                      const SizedBox(width: 8),
                      Text(ms.inningLabel,
                          style: const TextStyle(
                              color: AppTheme.slate300, fontSize: 13)),
                    ],
                  ],
                ),
                const SizedBox(height: 12),
                // 팀명 + 스코어
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        match.homeTeamName,
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w600),
                        textAlign: TextAlign.center,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 6),
                      decoration: BoxDecoration(
                        color: AppTheme.slate700,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        '${ms?.homeScore ?? match.homeScore ?? 0}'
                        '  :  '
                        '${ms?.awayScore ?? match.awayScore ?? 0}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                    Expanded(
                      child: Text(
                        match.awayTeamName,
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w600),
                        textAlign: TextAlign.center,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                // BSO + 베이스
                if (ms != null) ...[
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Column(
                        children: [
                          _bsoRow('B', ms.balls, 3, AppTheme.green500),
                          const SizedBox(height: 3),
                          _bsoRow('S', ms.strikes, 2, AppTheme.yellow500),
                          const SizedBox(height: 3),
                          _bsoRow('O', ms.outs, 3, AppTheme.red500),
                        ],
                      ),
                      const SizedBox(width: 20),
                      _BaseDiamond(bases: ms.bases),
                    ],
                  ),
                  // 투수 / 타자 정보
                  if (ms.currentPitcher != null ||
                      ms.currentBatter != null) ...[
                    const SizedBox(height: 10),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (ms.currentPitcher != null) ...[
                          const Icon(Icons.sports_baseball,
                              size: 12, color: AppTheme.slate400),
                          const SizedBox(width: 4),
                          Text('투수 ${ms.currentPitcher}',
                              style: const TextStyle(
                                  color: AppTheme.slate300,
                                  fontSize: 11)),
                        ],
                        if (ms.currentPitcher != null &&
                            ms.currentBatter != null)
                          const SizedBox(width: 14),
                        if (ms.currentBatter != null) ...[
                          const Icon(Icons.person,
                              size: 12, color: AppTheme.slate400),
                          const SizedBox(width: 4),
                          Text('타석 ${ms.currentBatter}',
                              style: const TextStyle(
                                  color: AppTheme.slate300,
                                  fontSize: 11)),
                        ],
                      ],
                    ),
                  ],
                ],
                // 경기 일시 + 장소
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (match.startTime != null) ...[
                      Text(_formatDateTime(match.startTime!),
                          style: const TextStyle(
                              color: AppTheme.slate500, fontSize: 11)),
                      if (match.venue != null)
                        const SizedBox(width: 8),
                    ],
                    if (match.venue != null)
                      Text(match.venue!,
                          style: const TextStyle(
                              color: AppTheme.slate500, fontSize: 11)),
                  ],
                ),
                // 문자중계 + 라이브 오버레이 버튼
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    GestureDetector(
                      onTap: () {
                        Navigator.of(context).push(MaterialPageRoute<void>(
                          builder: (_) => AppWebViewScreen(
                            path: '/live-overlay/${match.id}',
                            title: '라이브 오버레이',
                          ),
                        ));
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          border: Border.all(
                              color: AppTheme.red500.withValues(alpha: 0.4)),
                          borderRadius: BorderRadius.circular(8),
                          color: AppTheme.red500.withValues(alpha: 0.1),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.live_tv,
                                size: 13, color: AppTheme.red500),
                            SizedBox(width: 4),
                            Text('라이브',
                                style: TextStyle(
                                    color: AppTheme.red500,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        border: Border.all(color: AppTheme.slate600),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.article_outlined,
                              size: 13, color: AppTheme.slate400),
                          SizedBox(width: 4),
                          Text('문자중계',
                              style: TextStyle(
                                  color: AppTheme.slate400,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  String _formatDateTime(String startTime) {
    try {
      final dt = DateTime.parse(startTime);
      return DateFormat('M/d (E) HH:mm', 'ko').format(dt);
    } catch (_) {
      return startTime;
    }
  }

  Widget _bsoRow(String label, int value, int max, Color color) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 14,
          child: Text(label,
              style: const TextStyle(color: AppTheme.slate400, fontSize: 11)),
        ),
        ...List.generate(max, (i) {
          return Container(
            width: 8,
            height: 8,
            margin: const EdgeInsets.only(right: 2),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: i < value ? color : AppTheme.slate700,
            ),
          );
        }),
      ],
    );
  }
}

// ────────────────────────────────────────────
// 베이스 다이아몬드 위젯
// ────────────────────────────────────────────
class _BaseDiamond extends StatelessWidget {
  const _BaseDiamond({required this.bases});

  final List<String?> bases;

  @override
  Widget build(BuildContext context) {
    final first = bases.isNotEmpty && bases[0] != null;
    final second = bases.length > 1 && bases[1] != null;
    final third = bases.length > 2 && bases[2] != null;

    return SizedBox(
      width: 36,
      height: 36,
      child: Stack(
        children: [
          Positioned(left: 12, top: 0, child: _baseMarker(second)),
          Positioned(left: 0, top: 12, child: _baseMarker(third)),
          Positioned(right: 0, top: 12, child: _baseMarker(first)),
        ],
      ),
    );
  }

  Widget _baseMarker(bool occupied) {
    return Transform.rotate(
      angle: 0.785398, // 45 degrees
      child: Container(
        width: 12,
        height: 12,
        decoration: BoxDecoration(
          color: occupied ? AppTheme.yellow500 : AppTheme.slate700,
          border: Border.all(
            color: occupied ? AppTheme.yellow500 : AppTheme.slate600,
          ),
        ),
      ),
    );
  }
}

// ────────────────────────────────────────────
// 예정 경기 미리보기 카드
// ────────────────────────────────────────────
class _SchedulePreviewCard extends StatelessWidget {
  const _SchedulePreviewCard({required this.match});

  final Match match;

  @override
  Widget build(BuildContext context) {
    String dateLabel = '';
    String timeLabel = '';
    if (match.startTime != null) {
      try {
        final dt = DateTime.parse(match.startTime!);
        dateLabel = DateFormat('M/d (E)', 'ko').format(dt);
        timeLabel = DateFormat('HH:mm').format(dt);
      } catch (_) {
        dateLabel = match.startTime!;
      }
    }

    return Container(
      width: 200,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.slate800.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
            color: AppTheme.slate700.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Text(dateLabel,
                  style: const TextStyle(
                      color: AppTheme.blue400,
                      fontSize: 12,
                      fontWeight: FontWeight.w500)),
              const Spacer(),
              Text(timeLabel,
                  style: const TextStyle(
                      color: AppTheme.slate400, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            match.homeTeamName,
            style: const TextStyle(
                color: Colors.white, fontSize: 14, fontWeight: FontWeight.w500),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          Row(
            children: [
              const Text('vs ',
                  style: TextStyle(color: AppTheme.slate500, fontSize: 13)),
              Expanded(
                child: Text(
                  match.awayTeamName,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w500),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          if (match.venue != null)
            Text(match.venue!,
                style:
                    const TextStyle(color: AppTheme.slate500, fontSize: 11),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

// ────────────────────────────────────────────
// 플레이스홀더 카드
// ────────────────────────────────────────────
class _PlaceholderCard extends StatelessWidget {
  const _PlaceholderCard({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.slate800.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
            color: AppTheme.slate700.withValues(alpha: 0.5)),
      ),
      child: Text(
        text,
        style: const TextStyle(color: AppTheme.slate500, fontSize: 14),
        textAlign: TextAlign.center,
      ),
    );
  }
}

// ────────────────────────────────────────────
// 스티키 히어로 헤더 (스크롤 시 AUBL 영역 고정)
// ────────────────────────────────────────────
class _StickyHeroDelegate extends SliverPersistentHeaderDelegate {
  _StickyHeroDelegate({
    required this.statusBarHeight,
    required this.onIntroTap,
  });

  final double statusBarHeight;
  final VoidCallback onIntroTap;

  static const double _badgeArea = 32.0;
  static const double _pinnedRow = 62.0;
  static const double _topPad = 14.0;
  static const double _bottomPad = 10.0;

  @override
  double get maxExtent =>
      statusBarHeight + _topPad + _badgeArea + _pinnedRow + _bottomPad;

  @override
  double get minExtent =>
      statusBarHeight + _topPad + _pinnedRow + _bottomPad;

  @override
  bool shouldRebuild(covariant _StickyHeroDelegate old) =>
      statusBarHeight != old.statusBarHeight;

  @override
  Widget build(
      BuildContext context, double shrinkOffset, bool overlapsContent) {
    final t = (shrinkOffset / _badgeArea).clamp(0.0, 1.0);

    return Stack(
      children: [
        // 배경 그라데이션
        Positioned.fill(
          child: Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color(0xFF0a1a3f),
                  Color(0xFF0f2f8f),
                  Color(0xFF0a1a3f),
                ],
              ),
            ),
          ),
        ),
        // 콘텐츠
        Padding(
          padding: EdgeInsets.fromLTRB(
              20, statusBarHeight + _topPad, 20, _bottomPad),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 뱃지 — 스크롤 시 접히며 페이드아웃
              ClipRect(
                child: Align(
                  alignment: Alignment.topLeft,
                  heightFactor: 1.0 - t,
                  child: Opacity(
                    opacity: 1.0 - t,
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 3),
                        decoration: BoxDecoration(
                          border: Border.all(
                              color: AppTheme.slate500
                                  .withValues(alpha: 0.4)),
                          borderRadius: BorderRadius.circular(20),
                          color: Colors.white.withValues(alpha: 0.06),
                        ),
                        child: const Text(
                          '46TH AUBL · HOSTED BY CHUNG-ANG UNIVERSITY (SEOUL)',
                          style: TextStyle(
                            color: AppTheme.slate300,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 0.3,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              // AUBL 타이틀 + 부제 + 리그소개 — 항상 고정
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'AUBL',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 28,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.5,
                            height: 1.1,
                          ),
                        ),
                        SizedBox(height: 3),
                        Text(
                          '전국대학아마추어야구연합회 · SINCE 1981',
                          style: TextStyle(
                            color: AppTheme.slate400,
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: onIntroTap,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 7),
                      decoration: BoxDecoration(
                        border: Border.all(
                            color: AppTheme.slate500
                                .withValues(alpha: 0.4)),
                        borderRadius: BorderRadius.circular(8),
                        color: Colors.white.withValues(alpha: 0.06),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.info_outline,
                              size: 13, color: AppTheme.slate300),
                          SizedBox(width: 5),
                          Text('리그 소개',
                              style: TextStyle(
                                  color: AppTheme.slate300,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}
