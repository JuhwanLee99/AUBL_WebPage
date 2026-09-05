import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/models/public_season_models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/kst_clock.dart';
import '../../../core/widgets/season_components.dart';

/// Large-text-safe month navigation used by the official schedule views.
class ScheduleMonthNavigator extends StatelessWidget {
  const ScheduleMonthNavigator({
    super.key,
    required this.month,
    required this.onPrevious,
    required this.onToday,
    required this.onNext,
  });

  final DateTime month;
  final VoidCallback onPrevious;
  final VoidCallback onToday;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return LayoutBuilder(
      builder: (context, constraints) {
        final textScale = MediaQuery.textScalerOf(context).scale(1);
        final stackToday = textScale >= 1.3 || constraints.maxWidth < 300;
        final monthLabel = Text(
          DateFormat('yyyy년 M월').format(month),
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            fontFamily: 'BarlowCondensed',
            fontStyle: FontStyle.italic,
            letterSpacing: -0.3,
          ),
        );

        Widget arrow({
          required String tooltip,
          required IconData icon,
          required VoidCallback onPressed,
        }) {
          return IconButton(
            constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
            tooltip: tooltip,
            onPressed: onPressed,
            icon: Icon(icon),
          );
        }

        final monthRow = Row(
          children: [
            arrow(
              tooltip: '이전 달',
              icon: Icons.chevron_left,
              onPressed: onPrevious,
            ),
            Expanded(child: monthLabel),
            arrow(
              tooltip: '다음 달',
              icon: Icons.chevron_right,
              onPressed: onNext,
            ),
          ],
        );

        return Container(
          width: double.infinity,
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: colors.surface,
            border: Border.all(color: colors.line),
            borderRadius: BorderRadius.circular(4),
          ),
          child: stackToday
              ? Column(
                  children: [
                    monthRow,
                    const SizedBox(height: 4),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: onToday,
                        child: const Text('오늘로 이동'),
                      ),
                    ),
                  ],
                )
              : Row(
                  children: [
                    Expanded(child: monthRow),
                    const SizedBox(width: 8),
                    OutlinedButton(onPressed: onToday, child: const Text('오늘')),
                  ],
                ),
        );
      },
    );
  }
}

/// Keeps every preliminary group visible instead of hiding options in a
/// horizontal scroller. Postseason tiers are intentionally separated so the
/// selected filter remains unambiguous.
class ScheduleGroupSelector extends StatelessWidget {
  const ScheduleGroupSelector({
    super.key,
    required this.value,
    required this.onChanged,
  });

  static const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  static const qualificationTiers = ['EUTTEUM', 'BEOGEUM'];

  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final textScale = MediaQuery.textScalerOf(context).scale(1);
        final columns = constraints.maxWidth >= 720 && textScale < 1.6 ? 8 : 4;
        final gap = constraints.maxWidth < 420 ? 6.0 : 8.0;
        final itemWidth =
            (constraints.maxWidth - (columns - 1) * gap) / columns;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SelectorLabel(label: '예선 조 선택'),
            const SizedBox(height: 8),
            Wrap(
              spacing: gap,
              runSpacing: gap,
              children: [
                for (final group in groups)
                  SizedBox(
                    width: itemWidth,
                    child: _ScheduleFilterButton(
                      label: '$group조',
                      semanticsLabel: '$group조 경기와 순위 보기',
                      selected: value == group,
                      onTap: () => onChanged(group),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 18),
            const _SelectorLabel(label: '진출 권역 선택'),
            const SizedBox(height: 8),
            Row(
              children: [
                for (
                  var index = 0;
                  index < qualificationTiers.length;
                  index++
                ) ...[
                  if (index > 0) const SizedBox(width: 8),
                  Expanded(
                    child: _ScheduleFilterButton(
                      label: qualificationTiers[index] == 'EUTTEUM'
                          ? '으뜸권'
                          : '버금권',
                      semanticsLabel: qualificationTiers[index] == 'EUTTEUM'
                          ? '으뜸권 팀과 경기 보기'
                          : '버금권 팀과 경기 보기',
                      selected: value == qualificationTiers[index],
                      onTap: () => onChanged(qualificationTiers[index]),
                    ),
                  ),
                ],
              ],
            ),
          ],
        );
      },
    );
  }
}

/// Compact heading used above group standings and qualification summaries.
///
/// The detail moves below the title before either side has to truncate, which
/// keeps the same information readable with large accessibility text.
class ScheduleCardHeader extends StatelessWidget {
  const ScheduleCardHeader({
    super.key,
    required this.title,
    required this.detail,
  });

  final String title;
  final String detail;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final titleWidget = Text(
      title,
      style: Theme.of(context).textTheme.titleMedium,
    );
    final detailWidget = Text(
      detail,
      style: Theme.of(
        context,
      ).textTheme.bodySmall?.copyWith(color: colors.muted),
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        final textScale = MediaQuery.textScalerOf(context).scale(1);
        final stack = constraints.maxWidth < 400 || textScale >= 1.3;
        if (stack) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [titleWidget, const SizedBox(height: 4), detailWidget],
          );
        }
        return Row(
          children: [
            Expanded(child: titleWidget),
            const SizedBox(width: 12),
            detailWidget,
          ],
        );
      },
    );
  }
}

/// Dense, app-native game card for schedule lists.
///
/// It keeps venue and qualification information while using less vertical
/// space than the promotional/public-web card. At larger text sizes the
/// matchup changes from a versus row to two independent team rows.
class ScheduleCompactGameCard extends StatelessWidget {
  const ScheduleCompactGameCard({
    super.key,
    required this.game,
    required this.onTap,
  });

  final PublicGame game;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final rawDate = game.startTime ?? game.gameDate;
    final date = rawDate == null ? null : KstClock.normalizeApi(rawDate);
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
    final scoreVisible = game.isCompleted || game.isLive;
    final dateLabel = date == null
        ? '시간 미정'
        : DateFormat('M.d(E) HH:mm', 'ko').format(date);
    final semanticScore = scoreVisible
        ? '${game.awayTeamName} ${game.awayScore ?? '-'}대 '
              '${game.homeTeamName} ${game.homeScore ?? '-'}'
        : '${game.awayTeamName} 대 ${game.homeTeamName}';
    final semanticLabel = [
      statusLabel,
      dateLabel,
      semanticScore,
      if (game.venue?.trim().isNotEmpty == true) game.venue!.trim(),
    ].join(', ');

    return Semantics(
      excludeSemantics: true,
      button: true,
      label: semanticLabel,
      onTap: onTap,
      child: Material(
        color: colors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(4),
          side: BorderSide(
            color: game.isLive ? colors.danger : colors.line,
            width: game.isLive ? 1.5 : 1,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(4),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 7,
                  runSpacing: 6,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    SeasonStatusBadge(label: statusLabel, tone: statusTone),
                    if (game.groupCode?.trim().isNotEmpty == true)
                      SeasonStatusBadge(label: '${game.groupCode}조'),
                    Text(
                      dateLabel,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: colors.muted,
                        fontWeight: FontWeight.w700,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final stacked =
                        constraints.maxWidth < 330 ||
                        MediaQuery.textScalerOf(context).scale(1) >= 1.3;
                    if (stacked) {
                      return Column(
                        children: [
                          _ScheduleTeamLine(
                            name: game.awayTeamName,
                            score: scoreVisible ? game.awayScore : null,
                            qualification: game.awayQualificationState,
                          ),
                          const SizedBox(height: 7),
                          _ScheduleTeamLine(
                            name: game.homeTeamName,
                            score: scoreVisible ? game.homeScore : null,
                            qualification: game.homeQualificationState,
                          ),
                        ],
                      );
                    }
                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: _ScheduleTeamBlock(
                            name: game.awayTeamName,
                            qualification: game.awayQualificationState,
                            alignment: CrossAxisAlignment.end,
                            textAlign: TextAlign.right,
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          child: Text(
                            scoreVisible
                                ? '${game.awayScore ?? '-'} : ${game.homeScore ?? '-'}'
                                : 'VS',
                            style: TextStyle(
                              color: scoreVisible
                                  ? colors.navyStrong
                                  : colors.muted,
                              fontFamily: 'BarlowCondensed',
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                              fontFeatures: const [
                                FontFeature.tabularFigures(),
                              ],
                            ),
                          ),
                        ),
                        Expanded(
                          child: _ScheduleTeamBlock(
                            name: game.homeTeamName,
                            qualification: game.homeQualificationState,
                            alignment: CrossAxisAlignment.start,
                            textAlign: TextAlign.left,
                          ),
                        ),
                      ],
                    );
                  },
                ),
                if (game.venue?.trim().isNotEmpty == true) ...[
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Icon(
                        Icons.location_on_outlined,
                        size: 16,
                        color: colors.muted,
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          game.venue!.trim(),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(
                            context,
                          ).textTheme.bodySmall?.copyWith(color: colors.muted),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        '상세',
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: colors.cobalt,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ScheduleTeamBlock extends StatelessWidget {
  const _ScheduleTeamBlock({
    required this.name,
    required this.qualification,
    required this.alignment,
    required this.textAlign,
  });

  final String name;
  final QualificationState qualification;
  final CrossAxisAlignment alignment;
  final TextAlign textAlign;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: alignment,
      children: [
        Text(
          name,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          textAlign: textAlign,
          style: Theme.of(context).textTheme.titleSmall,
        ),
        if (qualification != QualificationState.unknown) ...[
          const SizedBox(height: 2),
          Text(
            qualification.label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: textAlign,
            style: Theme.of(context).textTheme.labelSmall,
          ),
        ],
      ],
    );
  }
}

class _ScheduleTeamLine extends StatelessWidget {
  const _ScheduleTeamLine({
    required this.name,
    required this.score,
    required this.qualification,
  });

  final String name;
  final int? score;
  final QualificationState qualification;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: _ScheduleTeamBlock(
            name: name,
            qualification: qualification,
            alignment: CrossAxisAlignment.start,
            textAlign: TextAlign.left,
          ),
        ),
        const SizedBox(width: 10),
        Text(
          score?.toString() ?? '-',
          style: TextStyle(
            color: context.aublColors.navyStrong,
            fontFamily: 'BarlowCondensed',
            fontSize: 24,
            fontWeight: FontWeight.w900,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }
}

/// Month grid that keeps every date target at least 44dp tall. At larger text
/// scales the compact count label becomes a dot while the full count remains
/// available to assistive technology.
class ScheduleMonthGrid extends StatelessWidget {
  const ScheduleMonthGrid({
    super.key,
    required this.month,
    required this.selectedDate,
    required this.eventCountForDate,
    required this.onDateSelected,
  });

  final DateTime month;
  final DateTime selectedDate;
  final int Function(DateTime date) eventCountForDate;
  final ValueChanged<DateTime> onDateSelected;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final textScale = MediaQuery.textScalerOf(context).scale(1);
    final first = KstClock.monthStart(month);
    final days = DateTime(first.year, first.month + 1, 0).day;
    final leading = first.weekday - DateTime.monday;
    final cells = ((leading + days + 6) ~/ 7) * 7;
    final highTextScale = textScale >= 1.3;
    final cellExtent = (56 + (textScale - 1) * 18).clamp(56.0, 92.0).toDouble();

    // DecoratedBox paints the outline without consuming two logical pixels of
    // layout width. A bordered Container would leave each of seven columns at
    // 43.7dp in the 360px in-panel layout, just below the touch target floor.
    return ClipRRect(
      borderRadius: BorderRadius.circular(4),
      child: ColoredBox(
        color: colors.surface,
        child: DecoratedBox(
          position: DecorationPosition.foreground,
          decoration: BoxDecoration(
            border: Border.all(color: colors.line),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Row(
                  children: ['월', '화', '수', '목', '금', '토', '일']
                      .map(
                        (day) => Expanded(
                          child: Text(
                            day,
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.labelSmall
                                ?.copyWith(
                                  color: colors.muted,
                                  fontWeight: FontWeight.w900,
                                ),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ),
              Divider(height: 1, color: colors.line),
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: cells,
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 7,
                  mainAxisExtent: cellExtent,
                ),
                itemBuilder: (context, index) {
                  final day = index - leading + 1;
                  if (day < 1 || day > days) {
                    return DecoratedBox(
                      decoration: BoxDecoration(
                        color: colors.surfaceMuted.withValues(alpha: 0.35),
                        border: Border(
                          right: BorderSide(color: colors.line),
                          bottom: BorderSide(color: colors.line),
                        ),
                      ),
                    );
                  }
                  final date = DateTime(first.year, first.month, day);
                  final count = eventCountForDate(date);
                  final selected = KstClock.isSameDay(date, selectedDate);
                  final today = KstClock.isSameDay(date, KstClock.today());
                  return Semantics(
                    excludeSemantics: true,
                    button: true,
                    selected: selected,
                    label: '$day일, 경기 $count개${today ? ', 오늘' : ''}',
                    onTap: () => onDateSelected(date),
                    child: Material(
                      color: selected
                          ? colors.cobalt.withValues(alpha: 0.13)
                          : colors.surface,
                      child: InkWell(
                        key: ValueKey('schedule-date-$day'),
                        onTap: () => onDateSelected(date),
                        borderRadius: BorderRadius.circular(2),
                        child: Container(
                          constraints: const BoxConstraints(minHeight: 44),
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          decoration: BoxDecoration(
                            border: Border(
                              top: selected
                                  ? BorderSide(color: colors.cobalt, width: 2)
                                  : BorderSide.none,
                              right: BorderSide(color: colors.line),
                              bottom: BorderSide(color: colors.line),
                            ),
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              FittedBox(
                                fit: BoxFit.scaleDown,
                                child: Text(
                                  '$day',
                                  maxLines: 1,
                                  softWrap: false,
                                  style: Theme.of(context).textTheme.labelLarge
                                      ?.copyWith(
                                        color: today
                                            ? colors.cobalt
                                            : colors.ink,
                                        fontWeight: FontWeight.w900,
                                      ),
                                ),
                              ),
                              if (count > 0)
                                highTextScale
                                    ? Container(
                                        key: ValueKey(
                                          'schedule-event-dot-$day',
                                        ),
                                        width: 7,
                                        height: 7,
                                        decoration: BoxDecoration(
                                          color: colors.cobalt,
                                          shape: BoxShape.circle,
                                        ),
                                      )
                                    : Text(
                                        '$count경기',
                                        key: ValueKey(
                                          'schedule-event-count-$day',
                                        ),
                                        maxLines: 1,
                                        style: TextStyle(
                                          color: colors.cobalt,
                                          fontSize: 11,
                                          fontWeight: FontWeight.w900,
                                        ),
                                      ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SelectorLabel extends StatelessWidget {
  const _SelectorLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: Theme.of(
        context,
      ).textTheme.labelLarge?.copyWith(color: context.aublColors.muted),
    );
  }
}

class _ScheduleFilterButton extends StatelessWidget {
  const _ScheduleFilterButton({
    required this.label,
    required this.semanticsLabel,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final String semanticsLabel;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Semantics(
      excludeSemantics: true,
      button: true,
      selected: selected,
      label: semanticsLabel,
      onTap: onTap,
      child: Material(
        color: selected ? colors.navy : colors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(2),
          side: BorderSide(color: selected ? colors.navy : colors.lineStrong),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(2),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    color: selected ? colors.surface : colors.ink,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
