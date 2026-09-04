import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/contracts/web_contracts.dart';
import '../../core/data/team_groups.dart';
import '../../core/models/match.dart' as m;
import '../../core/models/team.dart';
import '../../core/models/team_member.dart';
import '../../core/models/team_notice.dart';
import '../../core/services/team_image_cache_manager.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/match_time.dart';
import '../../core/webview/app_webview_screen.dart';
import '../../core/widgets/editor/delta_utils.dart';
import '../../core/widgets/editor/rich_text_editor.dart';
import '../../core/widgets/match_status_badge.dart';
import '../../core/widgets/season_components.dart';
import '../../core/widgets/section_header.dart';
import 'team_notice_detail_screen.dart';
import 'team_detail_view_model.dart';
import 'widgets/member_card.dart';
import 'widgets/notice_card.dart';

class TeamDetailScreen extends StatefulWidget {
  const TeamDetailScreen({
    super.key,
    required this.teamId,
    required this.teamName,
    this.groupCode,
  });

  final String teamId;
  final String teamName;
  final String? groupCode;

  @override
  State<TeamDetailScreen> createState() => _TeamDetailScreenState();
}

class _TeamDetailScreenState extends State<TeamDetailScreen> {
  static const List<String> _noticeCategories = ['일반', '훈련', '경기', '긴급'];

  final _viewModel = TeamDetailViewModel();
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
    final team = await _viewModel.loadTeam(widget.teamId);
    if (mounted) {
      setState(() {
        _team = team;
        _loading = false;
      });
    }
  }

  Future<void> _loadMatches() async {
    final matches = await _viewModel.loadMatches(widget.teamName);
    if (mounted) setState(() => _matches = matches);
  }

  Future<void> _checkCoachRole() async {
    final isCoach = await _viewModel.checkCoachRole(widget.teamId);
    if (!mounted) return;
    setState(() => _isCoach = isCoach);
  }

  String get _groupLabel {
    final g = widget.groupCode ?? teamNameToGroup[widget.teamName];
    return g != null ? '$g조' : '';
  }

  Color _noticeCategoryColor(String category) {
    return switch (category) {
      '긴급' => context.aublColors.danger,
      '경기' => context.aublColors.cobalt,
      _ => context.aublColors.navy,
    };
  }

  void _applyNoticeActionResult(TeamDetailActionResult result) {
    setState(() {
      _noticeStatus = result.statusMessage;
      _noticeError = result.errorMessage;
    });
  }

  Future<void> _toggleNoticePinned(TeamNotice notice) async {
    if (!_isCoach || _noticeBusy) return;
    setState(() {
      _noticeBusy = true;
      _noticeStatus = null;
      _noticeError = null;
    });
    try {
      final result = await _viewModel.toggleNoticePinned(
        teamId: widget.teamId,
        notice: notice,
      );
      if (!mounted) return;
      _applyNoticeActionResult(result);
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
        title: const Text('공지 삭제'),
        content: const Text('이 공지를 삭제하시겠습니까?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('취소'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: context.aublColors.danger,
            ),
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
      final result = await _viewModel.deleteNotice(
        teamId: widget.teamId,
        notice: notice,
      );
      if (!mounted) return;
      _applyNoticeActionResult(result);
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
        .where(
          (m) =>
              (m.homeTeamName == widget.teamName &&
                  (m.homeScore ?? 0) > (m.awayScore ?? 0)) ||
              (m.awayTeamName == widget.teamName &&
                  (m.awayScore ?? 0) > (m.homeScore ?? 0)),
        )
        .length;
    final losses = completed
        .where(
          (m) =>
              (m.homeTeamName == widget.teamName &&
                  (m.homeScore ?? 0) < (m.awayScore ?? 0)) ||
              (m.awayTeamName == widget.teamName &&
                  (m.awayScore ?? 0) < (m.homeScore ?? 0)),
        )
        .length;
    final draws = completed.length - wins - losses;

    return Scaffold(
      appBar: AppBar(title: Text(widget.teamName)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : LayoutBuilder(
              builder: (context, constraints) {
                final outerInset = constraints.maxWidth > 1000
                    ? (constraints.maxWidth - 1000) / 2
                    : 0.0;
                return RefreshIndicator(
                  onRefresh: () async {
                    await _loadTeam();
                    await _loadMatches();
                  },
                  child: ListView(
                    padding: EdgeInsets.fromLTRB(outerInset, 0, outerInset, 32),
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
                        const SectionHeader(
                          title: '예정 경기',
                          icon: Icons.schedule,
                        ),
                        ...upcoming.map(_buildMatchTile),
                      ],

                      // ── 완료 경기 ──
                      if (completed.isNotEmpty) ...[
                        const SectionHeader(
                          title: '최근 결과',
                          icon: Icons.check_circle,
                        ),
                        ...completed.take(5).map(_buildMatchTile),
                      ],

                      // ── 로스터 ──
                      const SectionHeader(title: '로스터', icon: Icons.people),
                      _buildRoster(),
                    ],
                  ),
                );
              },
            ),
    );
  }

  Widget _buildHeader(int wins, int losses, int draws) {
    final colors = context.aublColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final textScale = MediaQuery.textScalerOf(context).scale(1);
            final stacked = constraints.maxWidth < 600 || textScale >= 1.3;
            final emblem = Container(
              width: stacked ? double.infinity : 154,
              height: stacked ? 130 : 154,
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: colors.surfaceMuted,
                border: Border(
                  right: stacked
                      ? BorderSide.none
                      : BorderSide(color: colors.line),
                  bottom: stacked
                      ? BorderSide(color: colors.line)
                      : BorderSide.none,
                ),
              ),
              child: _team?.emblemUrl != null && _team!.emblemUrl!.isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: _team!.emblemUrl!,
                      cacheManager: TeamImageCacheManager.instance,
                      fit: BoxFit.contain,
                      errorWidget: (_, __, ___) => Icon(
                        Icons.shield_outlined,
                        size: 58,
                        color: colors.cobalt,
                      ),
                    )
                  : Icon(Icons.shield_outlined, size: 58, color: colors.cobalt),
            );
            final copy = Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '2026 TEAM PROFILE',
                    style: TextStyle(
                      color: colors.cobalt,
                      fontFamily: 'BarlowCondensed',
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.4,
                    ),
                  ),
                  const SizedBox(height: 7),
                  Text(
                    widget.teamName,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  if (_groupLabel.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    SeasonStatusBadge(
                      label: _groupLabel,
                      tone: SeasonBadgeTone.blue,
                    ),
                  ],
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 18,
                    runSpacing: 10,
                    children: [
                      _statValue('$wins', '승'),
                      _statValue('$draws', '무'),
                      _statValue('$losses', '패'),
                      _statValue('${wins + losses + draws}', '총 경기'),
                    ],
                  ),
                ],
              ),
            );
            if (stacked) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [emblem, copy],
              );
            }
            return Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                emblem,
                Expanded(child: copy),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _statValue(String value, String label) {
    final colors = context.aublColors;
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 54),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: TextStyle(
              color: colors.navyStrong,
              fontFamily: 'BarlowCondensed',
              fontSize: 24,
              fontWeight: FontWeight.w900,
              height: 1,
            ),
          ),
          const SizedBox(height: 3),
          Text(label, style: TextStyle(color: colors.muted, fontSize: 11)),
        ],
      ),
    );
  }

  Widget _buildTeamInfo() {
    final colors = context.aublColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_team!.shortIntro != null && _team!.shortIntro!.isNotEmpty)
                Text(
                  _team!.shortIntro!,
                  style: TextStyle(color: colors.ink, fontSize: 14),
                ),
              if (_team!.longIntro != null && _team!.longIntro!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  _team!.longIntro!,
                  style: TextStyle(color: colors.muted, fontSize: 13),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNotices() {
    final colors = context.aublColors;
    return StreamBuilder<List<TeamNotice>>(
      stream: _viewModel.watchTeamNotices(widget.teamId),
      builder: (context, snap) {
        if (snap.hasError) {
          final err = snap.error;
          if (err is FirebaseException && err.code == 'permission-denied') {
            return Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                '팀 공지는 해당 팀 선수/감독만 열람할 수 있습니다.',
                style: TextStyle(color: colors.danger),
              ),
            );
          }
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              '팀 공지를 불러오지 못했습니다.',
              style: TextStyle(color: colors.danger),
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
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Text('아직 공지가 없습니다.', style: TextStyle(color: colors.muted)),
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
                final content = deltaToPreviewText(
                  notice.content,
                ).toLowerCase();
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
                      label: const Text('전체'),
                      selected: _noticeFilter == 'ALL',
                      showCheckmark: false,
                      onSelected: (_) => setState(() => _noticeFilter = 'ALL'),
                    ),
                    ..._noticeCategories.map((category) {
                      final color = _noticeCategoryColor(category);
                      final selected = _noticeFilter == category;
                      return FilterChip(
                        label: Text(
                          category,
                          style: TextStyle(
                            color: selected ? color : colors.muted,
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                        selected: selected,
                        showCheckmark: false,
                        selectedColor: color.withValues(alpha: 0.12),
                        side: BorderSide(color: selected ? color : colors.line),
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
                decoration: InputDecoration(
                  hintText: '제목, 내용, 작성자 검색',
                  prefixIcon: const Icon(Icons.search, size: 20),
                  suffixIcon: _noticeSearchQuery.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close, size: 18),
                          onPressed: () {
                            _noticeSearchController.clear();
                            setState(() => _noticeSearchQuery = '');
                          },
                        ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
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
                    color: colors.success.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(
                      color: colors.success.withValues(alpha: 0.4),
                    ),
                  ),
                  child: Text(
                    _noticeStatus!,
                    style: TextStyle(
                      color: colors.success,
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
                    color: colors.danger.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(
                      color: colors.danger.withValues(alpha: 0.4),
                    ),
                  ),
                  child: Text(
                    _noticeError!,
                    style: TextStyle(
                      color: colors.danger,
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
                  style: TextStyle(color: colors.muted, fontSize: 12),
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
                  style: TextStyle(color: colors.muted),
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
                                child: Text(n.pinned ? '고정 해제' : '공지 고정'),
                              ),
                              OutlinedButton(
                                onPressed: _noticeBusy
                                    ? null
                                    : () => _deleteNotice(n),
                                style: OutlinedButton.styleFrom(
                                  side: BorderSide(color: colors.danger),
                                  foregroundColor: colors.danger,
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
    final colors = context.aublColors;
    final isHome = match.homeTeamName == widget.teamName;
    final opponent = isHome ? match.awayTeamName : match.homeTeamName;
    final myScore = isHome ? match.homeScore : match.awayScore;
    final opScore = isHome ? match.awayScore : match.homeScore;

    return Card(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: ListTile(
        dense: true,
        leading: MatchStatusBadge(status: match.status),
        title: Text(
          'VS $opponent',
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
        ),
        trailing: match.isCompleted || match.isLive
            ? Text(
                '${myScore ?? 0} - ${opScore ?? 0}',
                style: TextStyle(
                  color: colors.navyStrong,
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
              )
            : Text(
                formatMatchStartTime(match.startTime, pattern: 'yyyy-MM-dd') ??
                    '',
                style: TextStyle(color: colors.muted, fontSize: 12),
              ),
        onTap: () {
          if (match.isLive) {
            Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => AppWebViewScreen(
                  path: WebRouteContracts.scoreboardText(match.detailId),
                  title: '문자중계',
                ),
              ),
            );
          } else if (match.isCompleted) {
            Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => AppWebViewScreen(
                  path: WebRouteContracts.scoreboardText(match.detailId),
                  title: '경기 결과',
                ),
              ),
            );
          } else {
            Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => AppWebViewScreen(
                  path: WebRouteContracts.scoreboardText(match.detailId),
                  title: '경기 정보',
                ),
              ),
            );
          }
        },
      ),
    );
  }

  Widget _buildRoster() {
    final colors = context.aublColors;
    return StreamBuilder<List<TeamMember>>(
      stream: _viewModel.watchTeamMembers(widget.teamId),
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          );
        }
        final members = snap.data ?? [];
        if (members.isEmpty) {
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Text('등록된 팀원이 없습니다.', style: TextStyle(color: colors.muted)),
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
    String contentDelta = '';
    String category = '일반';
    bool pinned = false;
    bool saving = false;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => Dialog(
          insetPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 24,
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('공지 작성', style: Theme.of(ctx).textTheme.titleLarge),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: category,
                  items: _noticeCategories
                      .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                      .toList(),
                  onChanged: (v) {
                    if (v != null) setDialogState(() => category = v);
                  },
                  decoration: const InputDecoration(labelText: '카테고리'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: titleCtrl,
                  decoration: const InputDecoration(labelText: '제목'),
                ),
                const SizedBox(height: 12),
                RichTextEditor(
                  onChanged: (v) => contentDelta = v,
                  placeholder: '내용을 입력하세요',
                  minHeight: 160,
                ),
                const SizedBox(height: 6),
                Text(
                  '이미지/동영상은 툴바 버튼으로 URL을 입력하여 삽입할 수 있습니다.',
                  style: TextStyle(color: ctx.aublColors.muted, fontSize: 11),
                ),
                const SizedBox(height: 4),
                CheckboxListTile(
                  value: pinned,
                  onChanged: (v) => setDialogState(() => pinned = v ?? false),
                  contentPadding: EdgeInsets.zero,
                  title: const Text('상단 고정 공지'),
                  controlAffinity: ListTileControlAffinity.leading,
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton(
                      onPressed: saving ? null : () => Navigator.pop(ctx),
                      child: const Text('취소'),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(
                      onPressed: () async {
                        if (saving) return;
                        final title = titleCtrl.text.trim();
                        if (title.isEmpty || isDeltaEmpty(contentDelta)) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('제목과 내용을 입력해주세요.')),
                          );
                          return;
                        }
                        setDialogState(() => saving = true);
                        try {
                          final result = await _viewModel.addNotice(
                            teamId: widget.teamId,
                            title: title,
                            content: contentDelta,
                            category: category,
                            pinned: pinned,
                          );
                          if (mounted) {
                            _applyNoticeActionResult(result);
                          }
                          if (result.errorMessage == null && ctx.mounted) {
                            Navigator.pop(ctx);
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
              ],
            ),
          ),
        ),
      ),
    );
  }
}
