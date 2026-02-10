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
import '../../core/webview/app_webview_screen.dart';
import '../../core/widgets/match_status_badge.dart';

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
      body: RefreshIndicator(
        onRefresh: _onRefresh,
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            // ── 히어로 섹션 ──
            _buildHero(),

            Padding(
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
                      '오늘 일정', Icons.calendar_today, AppTheme.blue400),
                  const SizedBox(height: 8),
                  _buildHorizontalSchedule(
                      _todayMatches, '오늘 예정된 경기가 없습니다.'),
                  const SizedBox(height: 24),

                  // ── 내일 일정 ──
                  _buildSectionTitle(
                      '내일 일정', Icons.event, AppTheme.green500),
                  const SizedBox(height: 8),
                  _buildHorizontalSchedule(
                      _tomorrowMatches, '내일 예정된 경기가 없습니다.'),
                  const SizedBox(height: 24),

                  // ── 최근 경기 결과 ──
                  _buildSectionTitle(
                      '최근 경기 결과', Icons.scoreboard, AppTheme.orange500),
                  const SizedBox(height: 8),
                  _buildRecentResults(),
                  const SizedBox(height: 24),

                  // ── 팀 공지 ──
                  if (_userTeamId != null) ...[
                    _buildSectionTitle(
                      '$_userTeamName 공지',
                      Icons.campaign,
                      AppTheme.amber400,
                    ),
                    const SizedBox(height: 8),
                    _buildTeamNotices(),
                    const SizedBox(height: 24),
                  ],

                  // ── KEY VALUES ──
                  _buildKeyValues(),
                  const SizedBox(height: 24),

                  // ── 시즌 요약 ──
                  _buildSectionTitle(
                      '2026 시즌', Icons.sports_baseball, AppTheme.blue500),
                  const SizedBox(height: 8),
                  _buildSeasonSnapshot(),
                  const SizedBox(height: 24),

                  // ── 시즌 하이라이트 ──
                  _buildSeasonHighlights(),
                  const SizedBox(height: 24),

                  // ── 소셜 CTA ──
                  _buildSocialCta(),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── 히어로 영역 ──
  Widget _buildHero() {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(
          20, MediaQuery.of(context).padding.top + 24, 20, 28),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF0a1a3f), Color(0xFF0f2f8f), Color(0xFF0a1a3f)],
        ),
      ),
      child: Stack(
        children: [
          // 라디얼 글로우
          Positioned(
            top: -40,
            left: -40,
            child: Container(
              width: 160,
              height: 160,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    AppTheme.blue500.withValues(alpha: 0.16),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            bottom: -20,
            right: -20,
            child: Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    AppTheme.purple500.withValues(alpha: 0.10),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppTheme.orange500, AppTheme.purple500],
                  ),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  '2026 SEASON',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'AUBL',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 32,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Amateur University Baseball League',
                style: TextStyle(
                  color: AppTheme.slate400,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '대학 아마추어 야구의 모든 것',
                style: TextStyle(
                  color: AppTheme.blue400.withValues(alpha: 0.9),
                  fontSize: 14,
                ),
              ),
            ],
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
      height: 110,
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
            color: AppTheme.slate800,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  color: AppTheme.orange500.withValues(alpha: 0.14),
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text(
                  '${idx + 1}',
                  style: const TextStyle(
                    color: AppTheme.orange500,
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
            color: AppTheme.slate800,
            borderRadius: BorderRadius.circular(10),
            border: n.pinned
                ? Border.all(
                    color: AppTheme.amber400.withValues(alpha: 0.4))
                : null,
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
          color: AppTheme.orange500,
        ),
        const SizedBox(width: 10),
        _StatCard(
          label: 'GROUPS',
          value: '${groupLetters.length}',
          description: '조 편성',
          color: AppTheme.blue400,
        ),
        const SizedBox(width: 10),
        _StatCard(
          label: 'GAMES',
          value: _loadingSchedule ? '-' : '${_completedMatches.length}',
          description: '완료된 경기',
          color: AppTheme.green500,
        ),
      ],
    );
  }

  // ── KEY VALUES ──
  Widget _buildKeyValues() {
    const values = [
      (Icons.school, 'UNIVERSITY', '대학생 중심의 리그 운영', AppTheme.blue400),
      (Icons.sports_baseball, 'FAIR PLAY', '공정한 경쟁과 스포츠맨십', AppTheme.green500),
      (Icons.people, 'COMMUNITY', '야구를 사랑하는 커뮤니티', AppTheme.orange500),
      (Icons.trending_up, 'GROWTH', '선수 개개인의 성장 지원', AppTheme.purple500),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionTitle('AUBL KEY VALUES', Icons.star, AppTheme.amber400),
        const SizedBox(height: 10),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.5,
          children: values.map((v) {
            final (icon, title, desc, color) = v;
            return Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppTheme.slate800,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color: color.withValues(alpha: 0.2)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, color: color, size: 22),
                  const SizedBox(height: 8),
                  Text(title,
                      style: TextStyle(
                        color: color,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
                      )),
                  const SizedBox(height: 3),
                  Text(desc,
                      style: const TextStyle(
                          color: AppTheme.slate400, fontSize: 12)),
                ],
              ),
            );
          }).toList(),
        ),
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
            '바로가기', Icons.bolt, AppTheme.amber400),
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
                    color: AppTheme.slate800,
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
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              AppTheme.purple500.withValues(alpha: 0.15),
              AppTheme.orange500.withValues(alpha: 0.10),
            ],
          ),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
              color: AppTheme.purple500.withValues(alpha: 0.25)),
        ),
        child: const Row(
          children: [
            Icon(Icons.camera_alt, color: AppTheme.purple500, size: 28),
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
                      style:
                          TextStyle(color: AppTheme.slate400, fontSize: 12)),
                ],
              ),
            ),
            Icon(Icons.open_in_new, color: AppTheme.slate500, size: 18),
          ],
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
    required this.color,
  });

  final String label, value, description;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppTheme.slate800,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: TextStyle(
                    color: color,
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
            Navigator.of(context).push(MaterialPageRoute<void>(
              builder: (_) => AppWebViewScreen(
                path: '/scoreboard-text/${match.id}',
                title: '문자중계',
              ),
            ));
          },
          child: Container(
            width: double.infinity,
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.slate800,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                  color: AppTheme.red500.withValues(alpha: 0.4)),
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
                          _bsoRow('B', ms.balls, 4, AppTheme.green500),
                          const SizedBox(height: 3),
                          _bsoRow('S', ms.strikes, 3, AppTheme.yellow500),
                          const SizedBox(height: 3),
                          _bsoRow('O', ms.outs, 3, AppTheme.red500),
                        ],
                      ),
                      const SizedBox(width: 20),
                      _BaseDiamond(bases: ms.bases),
                    ],
                  ),
                ],
                // 장소 + 문자중계 링크
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (match.venue != null) ...[
                      Text(match.venue!,
                          style: const TextStyle(
                              color: AppTheme.slate500, fontSize: 12)),
                      const SizedBox(width: 12),
                    ],
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
        color: AppTheme.slate800,
        borderRadius: BorderRadius.circular(10),
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
        color: AppTheme.slate800,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        text,
        style: const TextStyle(color: AppTheme.slate500, fontSize: 14),
        textAlign: TextAlign.center,
      ),
    );
  }
}
