import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/models/public_season_models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/kst_clock.dart';
import '../../../core/widgets/season_components.dart';

/// Shared by the live home and its fixture tests, so first-screen density and
/// pinned navigation are verified without substituting the data repositories.
class NativeHomeLayout extends StatelessWidget {
  const NativeHomeLayout({
    super.key,
    required this.onRefresh,
    required this.onIntro,
    required this.banner,
    required this.freshness,
    required this.matches,
    required this.groups,
    required this.leaders,
    required this.notices,
    required this.partners,
    this.announcement,
    this.teamNotices,
  });

  final Future<void> Function() onRefresh;
  final VoidCallback onIntro;
  final Widget banner;
  final Widget freshness;
  final Widget matches;
  final Widget groups;
  final Widget leaders;
  final Widget notices;
  final Widget partners;
  final Widget? announcement;
  final Widget? teamNotices;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: LayoutBuilder(
        builder: (context, constraints) {
          final horizontal = constraints.maxWidth < 520 ? 12.0 : 24.0;
          return Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1180),
              child: RefreshIndicator(
                onRefresh: onRefresh,
                child: CustomScrollView(
                  key: const Key('native-home-scroll'),
                  physics: const AlwaysScrollableScrollPhysics(),
                  slivers: [
                    SliverAppBar(
                      pinned: true,
                      title: Image.asset(
                        'assets/images/aubl_clean.png',
                        height: 32,
                        width: 42,
                        fit: BoxFit.contain,
                        color: Theme.of(context).brightness == Brightness.dark
                            ? context.aublColors.ink
                            : null,
                        semanticLabel: 'AUBL',
                      ),
                      actions: [
                        TextButton.icon(
                          onPressed: onIntro,
                          icon: const Icon(Icons.info_outline, size: 18),
                          label: const Text('리그 소개'),
                        ),
                        const SizedBox(width: 8),
                      ],
                    ),
                    SliverPadding(
                      padding: EdgeInsets.fromLTRB(
                        horizontal,
                        4,
                        horizontal,
                        24,
                      ),
                      sliver: SliverList.list(
                        children: [
                          if (announcement != null) ...[
                            announcement!,
                            const SizedBox(height: 12),
                          ],
                          banner,
                          freshness,
                          if (teamNotices != null) ...[
                            const SizedBox(height: 12),
                            teamNotices!,
                          ],
                          const SizedBox(height: 16),
                          matches,
                          const SizedBox(height: 24),
                          groups,
                          const SizedBox(height: 24),
                          leaders,
                          const SizedBox(height: 24),
                          notices,
                          const SizedBox(height: 24),
                          partners,
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// B안 keeps the campaign identity in the old app's short, scroll-away header.
class NativeCampaignBanner extends StatelessWidget {
  const NativeCampaignBanner({
    super.key,
    required this.topline,
    required this.onDetails,
  });

  final String topline;
  final VoidCallback onDetails;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Material(
      color: colors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: colors.lineStrong),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: const Key('native-campaign-details'),
        onTap: onDetails,
        child: CustomPaint(
          painter: _NativeCampaignArt(colors.cobalt),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '2026 SEASON AUBL',
                  style: TextStyle(
                    fontFamily: 'BarlowCondensed',
                    fontWeight: FontWeight.w900,
                    fontStyle: FontStyle.italic,
                    color: colors.cobalt,
                    fontSize: 12,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '우리의 청춘은 이번에도',
                  style: TextStyle(
                    color: colors.navy,
                    fontSize: 17,
                    height: 1.15,
                    fontWeight: FontWeight.w900,
                    fontStyle: FontStyle.italic,
                    letterSpacing: -0.6,
                  ),
                ),
                Text(
                  'PLAY BALL',
                  style: TextStyle(
                    fontFamily: 'BarlowCondensed',
                    color: colors.navy,
                    fontSize: 42,
                    height: 1.0,
                    fontWeight: FontWeight.w900,
                    fontStyle: FontStyle.italic,
                    letterSpacing: -1.2,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        topline,
                        style: TextStyle(
                          fontSize: 10,
                          height: 1.35,
                          color: colors.muted,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Icon(Icons.chevron_right, size: 18, color: colors.muted),
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

class _NativeCampaignArt extends CustomPainter {
  const _NativeCampaignArt(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withValues(alpha: 0.16)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;
    canvas.drawOval(
      Rect.fromLTWH(size.width * .5, size.height * .22, size.width * .75, 74),
      paint,
    );
    canvas.drawOval(
      Rect.fromLTWH(size.width * .58, size.height * .35, size.width * .65, 66),
      paint,
    );
    final star = Offset(size.width - 33, 29);
    canvas.drawLine(star.translate(-5, 0), star.translate(5, 0), paint);
    canvas.drawLine(star.translate(0, -5), star.translate(0, 5), paint);
  }

  @override
  bool shouldRepaint(covariant _NativeCampaignArt oldDelegate) =>
      oldDelegate.color != color;
}

/// A label and content, without nesting another bordered panel around cards.
class NativeHomeSection extends StatelessWidget {
  const NativeHomeSection({
    super.key,
    required this.title,
    required this.child,
    this.action,
  });

  final String title;
  final Widget child;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final titleWidget = Semantics(
      header: true,
      child: Text(
        title,
        style: Theme.of(
          context,
        ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (MediaQuery.textScalerOf(context).scale(1) >= 1.5) ...[
          titleWidget,
          if (action != null) action!,
        ] else
          Row(
            children: [
              Expanded(child: titleWidget),
              if (action != null) ...[const SizedBox(width: 8), action!],
            ],
          ),
        const SizedBox(height: 8),
        child,
      ],
    );
  }
}

/// Shows a complete matchup at app-list density; the full card remains in detail.
class NativeHomeGameTile extends StatelessWidget {
  const NativeHomeGameTile({
    super.key,
    required this.game,
    required this.onTap,
  });

  final PublicGame game;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final date = game.startTime ?? game.gameDate;
    final dateLabel = date == null
        ? '일정 미정'
        : '${DateFormat('M.d(E)', 'ko').format(date)} · '
              '${game.startTime == null ? '시간 미정' : DateFormat('HH:mm').format(date)}';
    final hasScore = game.homeScore != null && game.awayScore != null;
    final largeText = MediaQuery.textScalerOf(context).scale(1) >= 1.5;
    final status = switch (game.status) {
      PublicGameStatus.scheduled => '예정',
      PublicGameStatus.inProgress => '진행 중',
      PublicGameStatus.completed => '종료',
      PublicGameStatus.canceled => '취소',
      PublicGameStatus.suspended => '중단',
      PublicGameStatus.unknown => '확인 중',
    };
    final scoreStyle = TextStyle(
      fontFamily: 'BarlowCondensed',
      fontSize: 24,
      height: 1.1,
      fontWeight: FontWeight.w900,
      color: colors.navy,
    );
    return Card(
      margin: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(4),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(dateLabel, style: Theme.of(context).textTheme.bodySmall),
                  Text(
                    '${game.groupCode == null ? '' : '${game.groupCode}조 · '}$status',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: game.status == PublicGameStatus.inProgress
                          ? colors.danger
                          : colors.cobalt,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (largeText)
                for (final team in [
                  (game.homeTeamName, game.homeScore),
                  (game.awayTeamName, game.awayScore),
                ])
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Row(
                      children: [
                        Expanded(child: Text(team.$1)),
                        const SizedBox(width: 12),
                        Text(hasScore ? '${team.$2}' : '—', style: scoreStyle),
                      ],
                    ),
                  )
              else
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        game.homeTeamName,
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Text(
                        hasScore
                            ? '${game.homeScore} : ${game.awayScore}'
                            : 'VS',
                        style: scoreStyle,
                      ),
                    ),
                    Expanded(
                      child: Text(
                        game.awayTeamName,
                        textAlign: TextAlign.right,
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                    ),
                  ],
                ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      game.venue ?? '구장 미정',
                      style: Theme.of(
                        context,
                      ).textTheme.bodySmall?.copyWith(color: colors.muted),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '경기 상세',
                    style: Theme.of(
                      context,
                    ).textTheme.labelMedium?.copyWith(color: colors.cobalt),
                  ),
                  Icon(Icons.chevron_right, size: 16, color: colors.cobalt),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class NativeFreshnessInfo extends StatelessWidget {
  const NativeFreshnessInfo({
    super.key,
    required this.freshness,
    required this.fromCache,
    this.cachedAt,
  });

  final SourceFreshness freshness;
  final bool fromCache;
  final DateTime? cachedAt;

  @override
  Widget build(BuildContext context) {
    final date = fromCache
        ? cachedAt
        : freshness.publishedAt ?? freshness.checkedAt;
    final timeKind = fromCache
        ? '저장'
        : freshness.publishedAt != null
        ? '게시'
        : '확인';
    final timeLabel = date == null
        ? '게시 시각 확인 중'
        : '${DateFormat('M.d HH:mm').format(fromCache ? KstClock.now(instant: date) : KstClock.normalizeApi(date))} $timeKind';
    final provider = freshness.provider?.toUpperCase() == 'UNIQUE_PLAY'
        ? '유니크플레이'
        : freshness.provider ?? '공식';
    final status = freshness.status?.toUpperCase();
    final statusLabel = status == 'STALE'
        ? ' · 갱신 필요'
        : status != 'CURRENT'
        ? ' · 게시 상태 확인 중'
        : '';
    final color = fromCache || status != 'CURRENT'
        ? context.aublColors.warning
        : context.aublColors.muted;
    return ExpansionTile(
      tilePadding: EdgeInsets.zero,
      childrenPadding: const EdgeInsets.only(bottom: 8),
      shape: const Border(),
      collapsedShape: const Border(),
      minTileHeight: 44,
      leading: Icon(
        fromCache ? Icons.cloud_off_outlined : Icons.verified_outlined,
        size: 18,
        color: color,
      ),
      title: Text(
        '${fromCache ? '저장된 공식 기록' : '$provider 기록'} · $timeLabel$statusLabel',
        style: Theme.of(
          context,
        ).textTheme.bodySmall?.copyWith(color: context.aublColors.muted),
      ),
      children: [
        DataFreshnessCard(
          freshness: freshness,
          fromCache: fromCache,
          cachedAt: cachedAt,
        ),
      ],
    );
  }
}
