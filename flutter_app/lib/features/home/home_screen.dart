import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../core/models/match.dart';
import '../../core/models/match_state.dart';
import '../../core/models/team_notice.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/match_status_badge.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _fs = FirestoreService();
  List<Match> _upcomingMatches = [];
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
      final scheduled = await _fs.getScheduledMatches();
      if (mounted) {
        setState(() {
          _upcomingMatches = scheduled.take(10).toList();
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
      // roles 컬렉션에서 사용자의 팀 역할 조회
      final roleDoc = await _fs.watchUserRole(user.uid).first;
      if (roleDoc != null && roleDoc['teamId'] != null) {
        final teamId = roleDoc['teamId'] as String;
        final teamName = roleDoc['teamName'] as String? ?? teamId;
        final notices =
            await _fs.watchTeamNotices(teamId).first;
        if (mounted) {
          setState(() {
            _userTeamId = teamId;
            _userTeamName = teamName;
            // 고정 공지 우선, 최신순, 최대 5건
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
      appBar: AppBar(
        title: const Text('AUBL'),
        centerTitle: false,
        titleTextStyle: const TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.bold,
          color: Colors.white,
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _onRefresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            // ── 라이브 경기 ──
            _buildSectionTitle('라이브 경기', Icons.circle, AppTheme.red500),
            const SizedBox(height: 8),
            _buildLiveMatches(),
            const SizedBox(height: 24),

            // ── 예정 경기 ──
            _buildSectionTitle('예정 경기', Icons.calendar_today, AppTheme.blue400),
            const SizedBox(height: 8),
            _buildUpcomingMatches(),
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
          ],
        ),
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
          children: matches.map((m) => _LiveMatchCard(match: m, fs: _fs)).toList(),
        );
      },
    );
  }

  // ── 예정 경기 ──
  Widget _buildUpcomingMatches() {
    if (_loadingSchedule) {
      return const _PlaceholderCard(text: '일정을 불러오는 중...');
    }
    if (_upcomingMatches.isEmpty) {
      return const _PlaceholderCard(text: '예정된 경기가 없습니다.');
    }

    return SizedBox(
      height: 110,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _upcomingMatches.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, i) {
          final m = _upcomingMatches[i];
          return _SchedulePreviewCard(match: m);
        },
      ),
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
                ? Border.all(color: AppTheme.amber400.withValues(alpha: 0.4))
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
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
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

        return Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppTheme.slate800,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: AppTheme.red500.withValues(alpha: 0.4),
            ),
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
                    Text(
                      ms.inningLabel,
                      style: const TextStyle(
                        color: AppTheme.slate300,
                        fontSize: 13,
                      ),
                    ),
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
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                      textAlign: TextAlign.center,
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
                        fontFamily: 'monospace',
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      match.awayTeamName,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              ),
              // BSO + 베이스
              if (ms != null) ...[
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _bsoLabel('B', ms.balls, 4, AppTheme.green500),
                    const SizedBox(width: 12),
                    _bsoLabel('S', ms.strikes, 3, AppTheme.yellow500),
                    const SizedBox(width: 12),
                    _bsoLabel('O', ms.outs, 3, AppTheme.red500),
                  ],
                ),
              ],
              if (match.venue != null) ...[
                const SizedBox(height: 8),
                Text(
                  match.venue!,
                  style: const TextStyle(
                      color: AppTheme.slate500, fontSize: 12),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _bsoLabel(String label, int value, int max, Color color) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label,
            style: const TextStyle(color: AppTheme.slate400, fontSize: 12)),
        const SizedBox(width: 4),
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
          // 날짜 + 시간
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
          // 팀명
          Text(
            match.homeTeamName,
            style: const TextStyle(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.w500),
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
          // 장소
          if (match.venue != null)
            Text(
              match.venue!,
              style: const TextStyle(
                  color: AppTheme.slate500, fontSize: 11),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
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
