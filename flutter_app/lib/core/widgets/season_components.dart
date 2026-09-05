import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/public_season_models.dart';
import '../theme/app_theme.dart';
import '../utils/kst_clock.dart';

class SeasonPageHero extends StatelessWidget {
  const SeasonPageHero({
    super.key,
    required this.eyebrow,
    required this.title,
    this.description,
    this.leading,
    this.footer,
  });

  final String eyebrow;
  final Widget title;
  final String? description;
  final Widget? leading;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 640;
        return Semantics(
          container: true,
          header: true,
          child: Container(
            width: double.infinity,
            constraints: const BoxConstraints(minHeight: 220),
            clipBehavior: Clip.hardEdge,
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(4),
              border: Border.all(color: colors.navy, width: 2),
            ),
            child: Stack(
              children: [
                Positioned(
                  top: 14,
                  left: 0,
                  right: 0,
                  child: Container(height: 2, color: colors.navy),
                ),
                Positioned(
                  bottom: 14,
                  left: 0,
                  right: 0,
                  child: Container(height: 2, color: colors.navy),
                ),
                Padding(
                  padding: EdgeInsets.fromLTRB(
                    wide ? 38 : 22,
                    wide ? 40 : 34,
                    wide ? 38 : 22,
                    wide ? 38 : 32,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (leading != null) ...[
                        leading!,
                        const SizedBox(height: 16),
                      ],
                      Text(
                        eyebrow.toUpperCase(),
                        style: TextStyle(
                          color: colors.cobalt,
                          fontFamily: 'BarlowCondensed',
                          fontSize: 13,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.55,
                        ),
                      ),
                      const SizedBox(height: 10),
                      DefaultTextStyle(
                        style:
                            (wide
                                ? Theme.of(context).textTheme.headlineLarge
                                : Theme.of(context).textTheme.headlineMedium) ??
                            const TextStyle(),
                        child: title,
                      ),
                      if (description != null &&
                          description!.trim().isNotEmpty) ...[
                        const SizedBox(height: 18),
                        Text(
                          description!,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(color: colors.muted, height: 1.7),
                        ),
                      ],
                      if (footer != null) ...[
                        const SizedBox(height: 16),
                        footer!,
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class SeasonWordmark extends StatelessWidget {
  const SeasonWordmark({super.key, required this.lead, required this.emphasis});

  final String lead;
  final String emphasis;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          lead,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            color: colors.ink,
            fontWeight: FontWeight.w900,
          ),
        ),
        Text(
          emphasis,
          style: TextStyle(
            color: colors.navyStrong,
            fontFamily: 'BarlowCondensed',
            fontSize: 48,
            height: 0.98,
            fontWeight: FontWeight.w900,
            letterSpacing: -0.5,
          ),
        ),
      ],
    );
  }
}

class SeasonSectionHeader extends StatelessWidget {
  const SeasonSectionHeader({
    super.key,
    required this.title,
    this.eyebrow,
    this.description,
    this.action,
  });

  final String title;
  final String? eyebrow;
  final String? description;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final copy = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (eyebrow != null) ...[
          Text(
            eyebrow!.toUpperCase(),
            style: TextStyle(
              color: colors.cobalt,
              fontFamily: 'BarlowCondensed',
              fontSize: 11,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.75,
            ),
          ),
          const SizedBox(height: 6),
        ],
        Text(title, style: Theme.of(context).textTheme.titleLarge),
        if (description != null) ...[
          const SizedBox(height: 4),
          Text(
            description!,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: colors.muted),
          ),
        ],
      ],
    );
    return LayoutBuilder(
      builder: (context, constraints) {
        final textScale = MediaQuery.textScalerOf(context).scale(1);
        final stackAction = constraints.maxWidth < 430 || textScale >= 1.3;
        return Container(
          padding: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: colors.navy, width: 2)),
          ),
          child: stackAction
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    copy,
                    if (action != null) ...[const SizedBox(height: 8), action!],
                  ],
                )
              : Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(child: copy),
                    if (action != null) ...[const SizedBox(width: 16), action!],
                  ],
                ),
        );
      },
    );
  }
}

class SeasonSectionPanel extends StatelessWidget {
  const SeasonSectionPanel({
    super.key,
    required this.title,
    required this.child,
    this.eyebrow,
    this.description,
    this.action,
  });

  final String title;
  final String? eyebrow;
  final String? description;
  final Widget? action;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 520;
        return Container(
          width: double.infinity,
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 14 : 24,
            vertical: compact ? 20 : 26,
          ),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: colors.line),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SeasonSectionHeader(
                title: title,
                eyebrow: eyebrow,
                description: description,
                action: action,
              ),
              const SizedBox(height: 16),
              child,
            ],
          ),
        );
      },
    );
  }
}

enum SeasonActionStyle { primary, secondary, text }

class SeasonActionButton extends StatelessWidget {
  const SeasonActionButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.style = SeasonActionStyle.primary,
    this.campaign = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final SeasonActionStyle style;
  final bool campaign;

  @override
  Widget build(BuildContext context) {
    final labelWidget = Text(
      label,
      textAlign: TextAlign.center,
      softWrap: true,
    );
    final child = icon == null
        ? labelWidget
        : Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18),
              const SizedBox(width: 8),
              Flexible(child: labelWidget),
            ],
          );
    final campaignStyle = ButtonStyle(
      minimumSize: const WidgetStatePropertyAll(Size(44, 46)),
      padding: const WidgetStatePropertyAll(
        EdgeInsets.symmetric(horizontal: 18, vertical: 10),
      ),
      shape: WidgetStatePropertyAll(
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(2)),
      ),
      textStyle: const WidgetStatePropertyAll(
        TextStyle(
          fontFamily: 'Pretendard',
          fontSize: 14,
          fontWeight: FontWeight.w900,
          height: 1.2,
        ),
      ),
    );
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final campaignNavy = isDark
        ? const Color(0xFFDCE9FF)
        : const Color(0xFF06245F);
    final campaignPrimary = isDark
        ? const Color(0xFF285FA9)
        : const Color(0xFF06245F);
    return switch (style) {
      SeasonActionStyle.primary => FilledButton(
        onPressed: onPressed,
        style: campaign
            ? campaignStyle.copyWith(
                backgroundColor: WidgetStatePropertyAll(campaignPrimary),
                foregroundColor: const WidgetStatePropertyAll(Colors.white),
                side: WidgetStatePropertyAll(
                  BorderSide(
                    color: isDark ? const Color(0xFF3978CF) : campaignNavy,
                  ),
                ),
              )
            : null,
        child: child,
      ),
      SeasonActionStyle.secondary => OutlinedButton(
        onPressed: onPressed,
        style: campaign
            ? campaignStyle.copyWith(
                backgroundColor: WidgetStatePropertyAll(
                  isDark ? Colors.transparent : Colors.white,
                ),
                foregroundColor: WidgetStatePropertyAll(campaignNavy),
                side: WidgetStatePropertyAll(BorderSide(color: campaignNavy)),
              )
            : null,
        child: child,
      ),
      SeasonActionStyle.text => TextButton(
        onPressed: onPressed,
        style: campaign ? campaignStyle : null,
        child: child,
      ),
    };
  }
}

enum SeasonBadgeTone { navy, blue, muted, success, warning, danger }

class SeasonStatusBadge extends StatelessWidget {
  const SeasonStatusBadge({
    super.key,
    required this.label,
    this.tone = SeasonBadgeTone.muted,
  });

  final String label;
  final SeasonBadgeTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final foreground = switch (tone) {
      SeasonBadgeTone.navy => colors.navy,
      SeasonBadgeTone.blue => colors.cobalt,
      SeasonBadgeTone.muted => colors.muted,
      SeasonBadgeTone.success => colors.success,
      SeasonBadgeTone.warning => colors.warning,
      SeasonBadgeTone.danger => colors.danger,
    };
    return Container(
      constraints: const BoxConstraints(minHeight: 24),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: foreground.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: foreground.withValues(alpha: 0.34)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: foreground,
          fontSize: 11,
          fontWeight: FontWeight.w900,
          height: 1.2,
          letterSpacing: 0.7,
        ),
      ),
    );
  }
}

class DataFreshnessCard extends StatelessWidget {
  const DataFreshnessCard({
    super.key,
    required this.freshness,
    this.fromCache = false,
    this.cachedAt,
  });

  final SourceFreshness freshness;
  final bool fromCache;
  final DateTime? cachedAt;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final date = fromCache
        ? cachedAt
        : freshness.publishedAt ?? freshness.checkedAt;
    final status = freshness.status?.toUpperCase() ?? 'UNKNOWN';
    final provider = freshness.provider?.toUpperCase() == 'UNIQUE_PLAY'
        ? '유니크플레이'
        : freshness.provider ?? '공식 기록';
    final tone = status == 'CURRENT'
        ? SeasonBadgeTone.success
        : status == 'STALE'
        ? SeasonBadgeTone.warning
        : SeasonBadgeTone.muted;
    final badge = SeasonStatusBadge(
      label: fromCache
          ? '저장본'
          : status == 'CURRENT'
          ? '최신'
          : status == 'STALE'
          ? '갱신 필요'
          : '확인 중',
      tone: fromCache ? SeasonBadgeTone.warning : tone,
    );
    final copy = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          fromCache ? Icons.cloud_done_outlined : Icons.sync_outlined,
          size: 20,
          color: colors.cobalt,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                fromCache ? '$provider · 저장된 기록' : '$provider · 공식 기록',
                style: Theme.of(context).textTheme.labelLarge,
              ),
              const SizedBox(height: 2),
              Text(
                date == null
                    ? '게시 시각 확인 중'
                    : '${DateFormat('yyyy.MM.dd HH:mm').format(KstClock.normalizeApi(date))} 기준',
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: colors.muted),
              ),
              if (freshness.publishedRevision != null &&
                  freshness.publishedRevision!.trim().isNotEmpty) ...[
                const SizedBox(height: 3),
                Text(
                  '게시 버전 ${freshness.publishedRevision}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: colors.cobalt,
                    fontFamily: 'BarlowCondensed',
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.8,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(13, 14, 16, 14),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(
          top: BorderSide(color: colors.line),
          right: BorderSide(color: colors.line),
          bottom: BorderSide(color: colors.line),
          left: BorderSide(color: colors.cobalt, width: 4),
        ),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final stack =
              constraints.maxWidth < 420 ||
              MediaQuery.textScalerOf(context).scale(1) >= 1.6;
          return stack
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [copy, const SizedBox(height: 10), badge],
                )
              : Row(
                  children: [
                    Expanded(child: copy),
                    const SizedBox(width: 12),
                    badge,
                  ],
                );
        },
      ),
    );
  }
}

class PublicMatchCard extends StatelessWidget {
  const PublicMatchCard({
    super.key,
    required this.game,
    this.onTap,
    this.compact = false,
  });

  final PublicGame game;
  final VoidCallback? onTap;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final statusLabel = switch (game.status) {
      PublicGameStatus.inProgress => '진행 중',
      PublicGameStatus.completed => '종료',
      PublicGameStatus.canceled => '취소',
      PublicGameStatus.suspended => '중단',
      PublicGameStatus.scheduled => '예정',
      PublicGameStatus.unknown => '확인 중',
    };
    final statusTone = switch (game.status) {
      PublicGameStatus.inProgress => SeasonBadgeTone.danger,
      PublicGameStatus.completed => SeasonBadgeTone.navy,
      PublicGameStatus.canceled ||
      PublicGameStatus.suspended => SeasonBadgeTone.warning,
      _ => SeasonBadgeTone.muted,
    };
    final rawDate = game.startTime ?? game.gameDate;
    final date = rawDate == null ? null : KstClock.normalizeApi(rawDate);
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(4),
        child: Padding(
          padding: EdgeInsets.all(compact ? 12 : 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              LayoutBuilder(
                builder: (context, constraints) {
                  final stacked =
                      constraints.maxWidth < 330 ||
                      MediaQuery.textScalerOf(context).scale(1) >= 1.3;
                  final badges = Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      SeasonStatusBadge(label: statusLabel, tone: statusTone),
                      if (game.groupCode != null)
                        SeasonStatusBadge(label: '${game.groupCode}조'),
                    ],
                  );
                  final dateLabel = Text(
                    date == null
                        ? '시간 미정'
                        : game.startTime == null
                        ? '${DateFormat('M.d(E)', 'ko').format(date)} · 시간 미정'
                        : DateFormat('M.d(E) HH:mm', 'ko').format(date),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: colors.muted,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  );
                  return stacked
                      ? Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            badges,
                            const SizedBox(height: 7),
                            dateLabel,
                          ],
                        )
                      : Row(
                          children: [
                            badges,
                            const Spacer(),
                            const SizedBox(width: 10),
                            dateLabel,
                          ],
                        );
                },
              ),
              SizedBox(height: compact ? 10 : 14),
              _MatchTeamRow(
                name: game.homeTeamName,
                score: game.homeScore,
                qualification: game.homeQualificationState,
                emphasized:
                    game.isCompleted &&
                    game.homeScore != null &&
                    game.awayScore != null &&
                    game.homeScore! > game.awayScore!,
              ),
              const SizedBox(height: 8),
              _MatchTeamRow(
                name: game.awayTeamName,
                score: game.awayScore,
                qualification: game.awayQualificationState,
                emphasized:
                    game.isCompleted &&
                    game.homeScore != null &&
                    game.awayScore != null &&
                    game.awayScore! > game.homeScore!,
              ),
              if ((!compact && game.venue != null) || onTap != null) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    if (!compact && game.venue != null) ...[
                      Icon(
                        Icons.location_on_outlined,
                        size: 16,
                        color: colors.muted,
                      ),
                      const SizedBox(width: 4),
                    ],
                    Expanded(
                      child: !compact && game.venue != null
                          ? Text(
                              game.venue!,
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(color: colors.muted),
                            )
                          : const SizedBox.shrink(),
                    ),
                    if (onTap != null) ...[
                      const SizedBox(width: 12),
                      Text(
                        '경기 상세',
                        style: TextStyle(
                          color: colors.cobalt,
                          fontWeight: FontWeight.w800,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _MatchTeamRow extends StatelessWidget {
  const _MatchTeamRow({
    required this.name,
    required this.score,
    required this.qualification,
    required this.emphasized,
  });

  final String name;
  final int? score;
  final QualificationState qualification;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final qualificationLabel = qualification == QualificationState.unknown
        ? null
        : Text(
            qualification.label,
            style: TextStyle(
              color: colors.muted,
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          );
    return LayoutBuilder(
      builder: (context, constraints) {
        final stackQualification =
            constraints.maxWidth < 360 ||
            MediaQuery.textScalerOf(context).scale(1) >= 1.3;
        return Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    name,
                    softWrap: true,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: emphasized
                          ? FontWeight.w900
                          : FontWeight.w700,
                    ),
                  ),
                  if (stackQualification && qualificationLabel != null) ...[
                    const SizedBox(height: 2),
                    qualificationLabel,
                  ],
                ],
              ),
            ),
            if (!stackQualification && qualificationLabel != null) ...[
              const SizedBox(width: 6),
              qualificationLabel,
            ],
            const SizedBox(width: 10),
            Text(
              score?.toString() ?? '-',
              style: TextStyle(
                color: emphasized ? colors.navy : colors.ink,
                fontFamily: 'BarlowCondensed',
                fontSize: 24,
                fontWeight: FontWeight.w900,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
        );
      },
    );
  }
}

class SeasonStatePanel extends StatelessWidget {
  const SeasonStatePanel({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.action,
  });

  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Icon(icon, size: 32, color: colors.cobalt),
            const SizedBox(height: 10),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 5),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: colors.muted, height: 1.5),
            ),
            if (action != null) ...[const SizedBox(height: 12), action!],
          ],
        ),
      ),
    );
  }
}
