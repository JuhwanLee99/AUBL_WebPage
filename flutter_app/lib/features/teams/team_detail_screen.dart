import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../core/data/team_groups.dart';
import '../../core/models/match.dart' as m;
import '../../core/models/team.dart';
import '../../core/models/team_member.dart';
import '../../core/models/team_notice.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/webview/app_webview_screen.dart';
import '../../core/widgets/match_status_badge.dart';
import '../../core/widgets/section_header.dart';
import 'team_notice_detail_screen.dart';
import 'widgets/member_card.dart';
import 'widgets/notice_card.dart';

class TeamDetailScreen extends StatefulWidget {
  const TeamDetailScreen({
    super.key,
    required this.teamId,
    required this.teamName,
  });

  final String teamId;
  final String teamName;

  @override
  State<TeamDetailScreen> createState() => _TeamDetailScreenState();
}

class _TeamDetailScreenState extends State<TeamDetailScreen> {
  static const List<String> _noticeCategories = ['일반', '훈련', '경기', '긴급'];

  final _fs = FirestoreService();
  final TextEditingController _noticeSearchController = TextEditingController();
  Team? _team;
  bool _loading = true;
  bool _isCoach = false;
  bool _noticeBusy = false;
  List<m.Match> _matches = [];
  String _noticeSearchQuery = '';
  String _noticeFilter = 'ALL';
  String? _noticeStatus;
  String? _noticeError;

  @override
  void initState() {
    super.initState();
    _loadTeam();
    _loadMatches();
    _checkCoachRole();
  }

  @override
  void dispose() {
    _noticeSearchController.dispose();
    super.dispose();
  }

  Future<void> _loadTeam() async {
    final team = await _fs.getTeam(widget.teamId);
    if (mounted) {
      setState(() {
        _team = team;
        _loading = false;
      });
    }
  }

  Future<void> _loadMatches() async {
    final matches = await _fs.getMatchesByTeam(widget.teamName);
    if (mounted) setState(() => _matches = matches);
  }

  Future<void> _checkCoachRole() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;

    // 관리자 체크
    try {
      final token =
          await FirebaseAuth.instance.currentUser!.getIdTokenResult(true);
      if (token.claims?['admin'] == true) {
        if (mounted) setState(() => _isCoach = true);
        return;
      }
    } catch (_) {}

    // 코치 역할 체크
    final roleDoc =
        await FirebaseFirestore.instance.collection('roles').doc(uid).get();
    if (!mounted) return;
    if (roleDoc.exists) {
      final data = roleDoc.data();
      if (data?['role'] == 'coach' && data?['teamId'] == widget.teamId) {
        setState(() => _isCoach = true);
      }
    }
  }

  String get _groupLabel {
    final g = teamNameToGroup[widget.teamName];
    return g != null ? '$g조' : '';
  }

  Color _noticeCategoryColor(String category) {
    return switch (category) {
      '긴급' => AppTheme.red500,
      '경기' => AppTheme.blue500,
      '훈련' => AppTheme.green500,
      _ => AppTheme.slate500,
    };
  }

  Future<void> _toggleNoticePinned(TeamNotice notice) async {
    if (!_isCoach || _noticeBusy) return;
    setState(() {
      _noticeBusy = true;
      _noticeStatus = null;
      _noticeError = null;
    });
    try {
      final nextPinned = !notice.pinned;
      await _fs.toggleTeamNoticePin(widget.teamId, notice.id, nextPinned);
      if (!mounted) return;
      setState(() {
        _noticeStatus = nextPinned ? '공지 고정을 설정했습니다.' : '공지 고정을 해제했습니다.';
      });
    } on FirebaseException catch (e) {
      if (!mounted) return;
      setState(() {
        _noticeError = e.code == 'permission-denied'
            ? '팀 공지 수정 권한이 없습니다.'
            : '공지 고정 변경 중 문제가 발생했습니다.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _noticeError = '공지 고정 변경 중 문제가 발생했습니다.';
      });
    } finally {
      if (mounted) {
        setState(() => _noticeBusy = false);
      }
    }
  }

  Future<void> _deleteNotice(TeamNotice notice) async {
    if (!_isCoach || _noticeBusy) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.slate800,
        title: const Text('공지 삭제'),
        content: const Text(
          '이 공지를 삭제하시겠습니까?',
          style: TextStyle(color: AppTheme.slate300),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('취소'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppTheme.red500),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('삭제'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() {
      _noticeBusy = true;
      _noticeStatus = null;
      _noticeError = null;
    });
    try {
      await _fs.deleteTeamNotice(widget.teamId, notice.id);
      if (!mounted) return;
      setState(() {
        _noticeStatus = '팀 공지를 삭제했습니다.';
      });
    } on FirebaseException catch (e) {
      if (!mounted) return;
      setState(() {
        _noticeError = e.code == 'permission-denied'
            ? '팀 공지 삭제 권한이 없습니다.'
            : '팀 공지 삭제 중 문제가 발생했습니다.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _noticeError = '팀 공지 삭제 중 문제가 발생했습니다.';
      });
    } finally {
      if (mounted) {
        setState(() => _noticeBusy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final upcoming = _matches.where((m) => m.isScheduled || m.isLive).toList();
    final completed = _matches.where((m) => m.isCompleted).toList();
    final wins = completed
        .where((m) =>
            (m.homeTeamName == widget.teamName &&
                (m.homeScore ?? 0) > (m.awayScore ?? 0)) ||
            (m.awayTeamName == widget.teamName &&
                (m.awayScore ?? 0) > (m.homeScore ?? 0)))
        .length;
    final losses = completed
        .where((m) =>
            (m.homeTeamName == widget.teamName &&
                (m.homeScore ?? 0) < (m.awayScore ?? 0)) ||
            (m.awayTeamName == widget.teamName &&
                (m.awayScore ?? 0) < (m.homeScore ?? 0)))
        .length;
    final draws = completed.length - wins - losses;

    return Scaffold(
      appBar: AppBar(title: Text(widget.teamName)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: () async {
                await _loadTeam();
                await _loadMatches();
              },
              child: ListView(
                padding: const EdgeInsets.only(bottom: 32),
                children: [
                  // ── 헤더 ──
                  _buildHeader(wins, losses, draws),

                  // ── 팀 정보 ──
                  if (_team != null) _buildTeamInfo(),

                  // ── 공지 ──
                  SectionHeader(
                    title: '팀 공지',
                    icon: Icons.campaign,
                    trailing: _isCoach
                        ? IconButton(
                            icon: const Icon(Icons.add, size: 20),
                            onPressed: _showAddNoticeDialog,
                          )
                        : null,
                  ),
                  _buildNotices(),

                  // ── 예정/진행 경기 ──
                  if (upcoming.isNotEmpty) ...[
                    const SectionHeader(title: '예정 경기', icon: Icons.schedule),
                    ...upcoming.map(_buildMatchTile),
                  ],

                  // ── 완료 경기 ──
                  if (completed.isNotEmpty) ...[
                    const SectionHeader(
                        title: '최근 결과', icon: Icons.check_circle),
                    ...completed.take(5).map(_buildMatchTile),
                  ],

                  // ── 로스터 ──
                  const SectionHeader(title: '로스터', icon: Icons.people),
                  _buildRoster(),
                ],
              ),
            ),
    );
  }

  Widget _buildHeader(int wins, int losses, int draws) {
    final group = teamNameToGroup[widget.teamName];
    final color = group != null
        ? groupColors[group] ?? AppTheme.blue400
        : AppTheme.blue400;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            color.withValues(alpha: 0.3),
            AppTheme.slate900,
          ],
        ),
      ),
      child: Column(
        children: [
          if (_team?.emblemUrl != null && _team!.emblemUrl!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: CachedNetworkImage(
                imageUrl: _team!.emblemUrl!,
                width: 80,
                height: 80,
                fit: BoxFit.contain,
                errorWidget: (_, __, ___) =>
                    Icon(Icons.shield, size: 60, color: color),
              ),
            ),
          Text(
            widget.teamName,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
            textAlign: TextAlign.center,
          ),
          if (_groupLabel.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                _groupLabel,
                style: TextStyle(color: color, fontSize: 14),
              ),
            ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _statChip('$wins승', AppTheme.green500),
              const SizedBox(width: 8),
              _statChip('$draws무', AppTheme.slate400),
              const SizedBox(width: 8),
              _statChip('$losses패', AppTheme.red500),
              const SizedBox(width: 12),
              Text(
                '총 ${wins + losses + draws}경기',
                style: const TextStyle(color: AppTheme.slate400, fontSize: 13),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _statChip(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style:
            TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.w600),
      ),
    );
  }

  Widget _buildTeamInfo() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_team!.shortIntro != null && _team!.shortIntro!.isNotEmpty)
            Text(
              _team!.shortIntro!,
              style: const TextStyle(color: AppTheme.slate300, fontSize: 14),
            ),
          if (_team!.longIntro != null && _team!.longIntro!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              _team!.longIntro!,
              style: const TextStyle(color: AppTheme.slate400, fontSize: 13),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildNotices() {
    return StreamBuilder<List<TeamNotice>>(
      stream: _fs.watchTeamNotices(widget.teamId),
      builder: (context, snap) {
        if (snap.hasError) {
          final err = snap.error;
          if (err is FirebaseException && err.code == 'permission-denied') {
            return const Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                '팀 공지는 해당 팀 선수/감독만 열람할 수 있습니다.',
                style: TextStyle(color: AppTheme.red500),
              ),
            );
          }
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Text(
              '팀 공지를 불러오지 못했습니다.',
              style: TextStyle(color: AppTheme.red500),
            ),
          );
        }

        if (snap.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          );
        }
        final notices = snap.data ?? [];
        if (notices.isEmpty) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Text('아직 공지가 없습니다.',
                style: TextStyle(color: AppTheme.slate500)),
          );
        }

        // pinned 우선, 최신순
        final sorted = List<TeamNotice>.from(notices)
          ..sort((a, b) {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return b.createdAt.compareTo(a.createdAt);
          });

        final categoryFiltered = _noticeFilter == 'ALL'
            ? sorted
            : sorted
                .where((notice) => notice.category == _noticeFilter)
                .toList();
        final query = _noticeSearchQuery.trim().toLowerCase();
        final visible = query.isEmpty
            ? categoryFiltered
            : categoryFiltered.where((notice) {
                final title = notice.title.toLowerCase();
                final content = notice.content.toLowerCase();
                final author = (notice.createdByName ?? '').toLowerCase();
                return title.contains(query) ||
                    content.contains(query) ||
                    author.contains(query);
              }).toList();

        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: [
                    FilterChip(
                      label: Text(
                        '전체',
                        style: TextStyle(
                          color: _noticeFilter == 'ALL'
                              ? AppTheme.orange500
                              : AppTheme.slate400,
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                      ),
                      selected: _noticeFilter == 'ALL',
                      showCheckmark: false,
                      selectedColor: AppTheme.orange500.withValues(alpha: 0.16),
                      backgroundColor: AppTheme.slate800.withValues(alpha: 0.4),
                      side: BorderSide(
                        color: _noticeFilter == 'ALL'
                            ? AppTheme.orange500
                            : AppTheme.slate700.withValues(alpha: 0.8),
                      ),
                      onSelected: (_) => setState(() => _noticeFilter = 'ALL'),
                    ),
                    ..._noticeCategories.map((category) {
                      final color = _noticeCategoryColor(category);
                      final selected = _noticeFilter == category;
                      return FilterChip(
                        label: Text(
                          category,
                          style: TextStyle(
                            color: selected ? color : AppTheme.slate400,
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                        selected: selected,
                        showCheckmark: false,
                        selectedColor: color.withValues(alpha: 0.16),
                        backgroundColor:
                            AppTheme.slate800.withValues(alpha: 0.4),
                        side: BorderSide(
                          color: selected
                              ? color
                              : AppTheme.slate700.withValues(alpha: 0.8),
                        ),
                        onSelected: (_) => setState(() {
                          _noticeFilter = category;
                        }),
                      );
                    }),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: TextField(
                controller: _noticeSearchController,
                onChanged: (value) =>
                    setState(() => _noticeSearchQuery = value),
                textInputAction: TextInputAction.search,
                style: const TextStyle(color: Colors.white, fontSize: 14),
                decoration: InputDecoration(
                  hintText: '제목, 내용, 작성자 검색',
                  hintStyle:
                      const TextStyle(color: AppTheme.slate500, fontSize: 13),
                  prefixIcon: const Icon(Icons.search,
                      color: AppTheme.slate500, size: 20),
                  suffixIcon: _noticeSearchQuery.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close,
                              color: AppTheme.slate500, size: 18),
                          onPressed: () {
                            _noticeSearchController.clear();
                            setState(() => _noticeSearchQuery = '');
                          },
                        ),
                  filled: true,
                  fillColor: AppTheme.slate800.withValues(alpha: 0.5),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(
                      color: AppTheme.slate700.withValues(alpha: 0.6),
                    ),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(
                      color: AppTheme.slate700.withValues(alpha: 0.6),
                    ),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(
                      color: AppTheme.blue500.withValues(alpha: 0.9),
                    ),
                  ),
                ),
              ),
            ),
            if (_noticeStatus != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.green500.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: AppTheme.green500.withValues(alpha: 0.4),
                    ),
                  ),
                  child: Text(
                    _noticeStatus!,
                    style: const TextStyle(
                      color: Color(0xFFBBF7D0),
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            if (_noticeError != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.red500.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: AppTheme.red500.withValues(alpha: 0.4),
                    ),
                  ),
                  child: Text(
                    _noticeError!,
                    style: const TextStyle(
                      color: Color(0xFFFECACA),
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  '${visible.length}개 공지',
                  style:
                      const TextStyle(color: AppTheme.slate500, fontSize: 12),
                ),
              ),
            ),
            if (visible.isEmpty)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  _noticeSearchQuery.trim().isEmpty
                      ? '아직 공지가 없습니다.'
                      : '검색 결과가 없습니다.',
                  style: const TextStyle(color: AppTheme.slate500),
                ),
              )
            else
              ...visible.map((n) {
                return Column(
                  children: [
                    NoticeCard(
                      notice: n,
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => TeamNoticeDetailScreen(
                              teamId: widget.teamId,
                              teamName: widget.teamName,
                              notice: n,
                              canManage: _isCoach,
                            ),
                          ),
                        );
                      },
                    ),
                    if (_isCoach)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              OutlinedButton(
                                onPressed: _noticeBusy
                                    ? null
                                    : () => _toggleNoticePinned(n),
                                style: OutlinedButton.styleFrom(
                                  side: BorderSide(
                                    color: AppTheme.slate700
                                        .withValues(alpha: 0.9),
                                  ),
                                  foregroundColor: AppTheme.slate200,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 8,
                                  ),
                                  textStyle: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                child: Text(n.pinned ? '고정 해제' : '공지 고정'),
                              ),
                              OutlinedButton(
                                onPressed:
                                    _noticeBusy ? null : () => _deleteNotice(n),
                                style: OutlinedButton.styleFrom(
                                  side: BorderSide(
                                    color:
                                        AppTheme.red500.withValues(alpha: 0.6),
                                  ),
                                  foregroundColor: const Color(0xFFFECACA),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 8,
                                  ),
                                  textStyle: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                child: const Text('공지 삭제'),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                );
              }),
          ],
        );
      },
    );
  }

  Widget _buildMatchTile(m.Match match) {
    final isHome = match.homeTeamName == widget.teamName;
    final opponent = isHome ? match.awayTeamName : match.homeTeamName;
    final myScore = isHome ? match.homeScore : match.awayScore;
    final opScore = isHome ? match.awayScore : match.homeScore;

    return ListTile(
      dense: true,
      leading: MatchStatusBadge(status: match.status),
      title: Text(
        'VS $opponent',
        style: const TextStyle(color: Colors.white, fontSize: 14),
      ),
      trailing: match.isCompleted || match.isLive
          ? Text(
              '${myScore ?? 0} - ${opScore ?? 0}',
              style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                  fontSize: 14),
            )
          : Text(
              match.startTime?.substring(0, 10) ?? '',
              style: const TextStyle(color: AppTheme.slate400, fontSize: 12),
            ),
      onTap: () {
        if (match.isLive) {
          Navigator.of(context).push(MaterialPageRoute<void>(
            builder: (_) => AppWebViewScreen(
              path: '/scoreboard-text/${match.id}',
              title: '문자중계',
            ),
          ));
        } else if (match.isCompleted) {
          Navigator.of(context).push(MaterialPageRoute<void>(
            builder: (_) => AppWebViewScreen(
              path: '/scoreboard-text/${match.id}',
              title: '경기 결과',
            ),
          ));
        } else {
          Navigator.of(context).push(MaterialPageRoute<void>(
            builder: (_) => AppWebViewScreen(
              path: '/scoreboard-text/${match.id}',
              title: '경기 정보',
            ),
          ));
        }
      },
    );
  }

  Widget _buildRoster() {
    return StreamBuilder<List<TeamMember>>(
      stream: _fs.watchTeamMembers(widget.teamId),
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          );
        }
        final members = snap.data ?? [];
        if (members.isEmpty) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Text('등록된 팀원이 없습니다.',
                style: TextStyle(color: AppTheme.slate500)),
          );
        }
        return Column(
          children: members.map((m) => MemberCard(member: m)).toList(),
        );
      },
    );
  }

  void _showAddNoticeDialog() {
    final titleCtrl = TextEditingController();
    final contentCtrl = TextEditingController();
    String category = '일반';
    bool pinned = false;
    bool saving = false;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: AppTheme.slate800,
          title: const Text('공지 작성'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: category,
                  items: _noticeCategories
                      .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                      .toList(),
                  onChanged: (v) {
                    if (v != null) setDialogState(() => category = v);
                  },
                  decoration: const InputDecoration(labelText: '카테고리'),
                  dropdownColor: AppTheme.slate700,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: titleCtrl,
                  decoration: const InputDecoration(labelText: '제목'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: contentCtrl,
                  decoration: const InputDecoration(labelText: '내용'),
                  maxLines: 4,
                ),
                const SizedBox(height: 8),
                CheckboxListTile(
                  value: pinned,
                  onChanged: (v) => setDialogState(() => pinned = v ?? false),
                  contentPadding: EdgeInsets.zero,
                  title: const Text('상단 고정 공지'),
                  controlAffinity: ListTileControlAffinity.leading,
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: saving ? null : () => Navigator.pop(ctx),
              child: const Text('취소'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(
                disabledBackgroundColor: AppTheme.slate700,
              ),
              onPressed: () async {
                if (saving) return;
                final title = titleCtrl.text.trim();
                final content = contentCtrl.text.trim();
                if (title.isEmpty || content.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('제목과 내용을 입력해주세요.')),
                  );
                  return;
                }

                setDialogState(() => saving = true);
                final user = FirebaseAuth.instance.currentUser;
                try {
                  await _fs.addTeamNotice(
                    widget.teamId,
                    TeamNotice(
                      id: '',
                      title: title,
                      content: content,
                      createdAt: DateTime.now().millisecondsSinceEpoch,
                      createdByUid: user?.uid,
                      createdByName: user?.email?.split('@').first,
                      category: category,
                      pinned: pinned,
                    ),
                  );
                  if (mounted) {
                    setState(() {
                      _noticeStatus = '팀 공지를 등록했습니다.';
                      _noticeError = null;
                    });
                  }
                  if (ctx.mounted) Navigator.pop(ctx);
                } on FirebaseException catch (e) {
                  if (mounted) {
                    setState(() {
                      _noticeError = e.code == 'permission-denied'
                          ? '팀 공지 작성 권한이 없습니다.'
                          : '공지 등록 중 문제가 발생했습니다.';
                      _noticeStatus = null;
                    });
                  }
                } catch (_) {
                  if (mounted) {
                    setState(() {
                      _noticeError = '공지 등록 중 문제가 발생했습니다.';
                      _noticeStatus = null;
                    });
                  }
                } finally {
                  if (ctx.mounted) {
                    setDialogState(() => saving = false);
                  }
                }
              },
              child: Text(saving ? '게시 중...' : '게시'),
            ),
          ],
        ),
      ),
    );
  }
}
