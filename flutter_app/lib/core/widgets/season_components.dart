import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/public_season_models.dart';
import '../theme/app_theme.dart';

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
    return Semantics(
      container: true,
      header: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: colors.line),
        ),
        child: Stack(
          children: [
            Positioned(
              right: 4,
              top: 0,
              child: Icon(Icons.auto_awesome,
                  color: colors.cobalt.withValues(alpha: 0.22), size: 44),
            ),
            Column(
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
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 8),
                title,
                if (description != null && description!.trim().isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(
                    description!,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: colors.muted,
                          height: 1.55,
                        ),
                  ),
                ],
                if (footer != null) ...[
                  const SizedBox(height: 16),
                  footer!,
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class SeasonWordmark extends StatelessWidget {
  const SeasonWordmark({
    super.key,
    required this.lead,
    required this.emphasis,
  });

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
    this.description,
    this.action,
  });

  final String title;
  final String? description;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleLarge),
              if (description != null) ...[
                const SizedBox(height: 3),
                Text(
                  description!,
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: colors.muted),
                ),
              ],
            ],
          ),
        ),
        if (action != null) action!,
      ],
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
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final SeasonActionStyle style;

  @override
  Widget build(BuildContext context) {
    final child = Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 18),
          const SizedBox(width: 7),
        ],
        Text(label),
      ],
    );
    return switch (style) {
      SeasonActionStyle.primary =>
        FilledButton(onPressed: onPressed, child: child),
      SeasonActionStyle.secondary =>
        OutlinedButton(onPressed: onPressed, child: child),
      SeasonActionStyle.text => TextButton(onPressed: onPressed, child: child),
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
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class DataFreshnessCard extends StatelessWidget {
  const DataFreshnessCard({super.key, required this.freshness});

  final SourceFreshness freshness;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final date = freshness.publishedAt ?? freshness.checkedAt;
    final status = freshness.status?.toUpperCase() ?? 'UNKNOWN';
    final tone = status == 'CURRENT'
        ? SeasonBadgeTone.success
        : status == 'STALE'
            ? SeasonBadgeTone.warning
            : SeasonBadgeTone.muted;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Icon(Icons.sync_outlined, color: colors.cobalt),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${freshness.provider ?? '공식 기록'} · ${freshness.syncMode == 'MANUAL' ? '관리자 수동 게시' : '게시 데이터'}',
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                  const SizedBox(height: 3),
                  Text(
                    date == null
                        ? '게시 시각 확인 중'
                        : '${DateFormat('yyyy.MM.dd HH:mm').format(date.toLocal())} 기준',
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: colors.muted),
                  ),
                ],
              ),
            ),
            SeasonStatusBadge(
              label: status == 'CURRENT'
                  ? '최신'
                  : status == 'STALE'
                      ? '갱신 필요'
                      : '확인 중',
              tone: tone,
            ),
          ],
        ),
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
      PublicGameStatus.suspended =>
        SeasonBadgeTone.warning,
      _ => SeasonBadgeTone.muted,
    };
    final date = game.startTime ?? game.gameDate;
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: EdgeInsets.all(compact ? 12 : 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  SeasonStatusBadge(label: statusLabel, tone: statusTone),
                  const SizedBox(width: 8),
                  if (game.groupCode != null)
                    SeasonStatusBadge(label: '${game.groupCode}조'),
                  const Spacer(),
                  Text(
                    date == null
                        ? '시간 미정'
                        : DateFormat('M.d(E) HH:mm', 'ko').format(date),
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: colors.muted),
                  ),
                ],
              ),
              SizedBox(height: compact ? 10 : 14),
              _MatchTeamRow(
                name: game.homeTeamName,
                score: game.homeScore,
                qualification: game.homeQualificationState,
                emphasized: game.isCompleted &&
                    game.homeScore != null &&
                    game.awayScore != null &&
                    game.homeScore! > game.awayScore!,
              ),
              const SizedBox(height: 8),
              _MatchTeamRow(
                name: game.awayTeamName,
                score: game.awayScore,
                qualification: game.awayQualificationState,
                emphasized: game.isCompleted &&
                    game.homeScore != null &&
                    game.awayScore != null &&
                    game.awayScore! > game.homeScore!,
              ),
              if (!compact && game.venue != null) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    Icon(Icons.location_on_outlined,
                        size: 16, color: colors.muted),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        game.venue!,
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(color: colors.muted),
                      ),
                    ),
                    if (onTap != null)
                      Text('경기 상세',
                          style: TextStyle(
                              color: colors.cobalt,
                              fontWeight: FontWeight.w800,
                              fontSize: 12)),
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
    return Row(
      children: [
        Expanded(
          child: Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: emphasized ? FontWeight.w900 : FontWeight.w700,
                ),
          ),
        ),
        if (qualification != QualificationState.unknown) ...[
          const SizedBox(width: 6),
          Text(
            qualification.label,
            style: TextStyle(
              color: colors.muted,
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
        const SizedBox(width: 10),
        Text(
          score?.toString() ?? '-',
          style: TextStyle(
            color: emphasized ? colors.navy : colors.ink,
            fontFamily: 'BarlowCondensed',
            fontSize: 24,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
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
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: colors.muted, height: 1.5),
            ),
            if (action != null) ...[
              const SizedBox(height: 12),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}
