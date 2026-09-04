import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'season_components.dart';

@immutable
class SeasonHeroFact {
  const SeasonHeroFact({
    required this.label,
    required this.value,
    required this.description,
  });

  final String label;
  final String value;
  final String description;
}

/// The native Flutter counterpart of the 2026 web campaign hero.
///
/// The artwork is deliberately drawn in code so the mark stays sharp, adapts
/// to both themes, and never depends on the reference screenshots.
class SeasonCampaignHero extends StatelessWidget {
  const SeasonCampaignHero({
    super.key,
    required this.topline,
    required this.lead,
    required this.emphasis,
    required this.description,
    required this.subcopy,
    required this.primaryActionLabel,
    required this.onPrimaryAction,
    required this.secondaryActionLabel,
    required this.onSecondaryAction,
    required this.facts,
  });

  final String topline;
  final String lead;
  final String emphasis;
  final String description;
  final String subcopy;
  final String primaryActionLabel;
  final VoidCallback onPrimaryAction;
  final String secondaryActionLabel;
  final VoidCallback onSecondaryAction;
  final List<SeasonHeroFact> facts;

  @override
  Widget build(BuildContext context) {
    final colors = _CampaignPalette.of(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final compact = width < 560;
        final medium = width >= 560 && width < 820;
        final horizontalPadding = compact
            ? 18.0
            : medium
            ? 24.0
            : math.min(82.0, math.max(42.0, width * 0.06));
        final verticalPadding = compact ? 34.0 : (medium ? 38.0 : 70.0);
        final leadSize = compact
            ? (width * 0.082).clamp(24.0, 38.0)
            : medium
            ? (width * 0.067).clamp(32.0, 52.0)
            : (width * 0.047).clamp(44.0, 66.0);
        final emphasisSize = compact
            ? (width * 0.19).clamp(56.0, 83.0)
            : medium
            ? (width * 0.145).clamp(72.0, 108.0)
            : (width * 0.125).clamp(108.0, 176.0);

        return Semantics(
          container: true,
          header: true,
          label: '$lead $emphasis',
          child: Container(
            key: const Key('season-campaign-surface'),
            width: double.infinity,
            constraints: BoxConstraints(minHeight: width >= 820 ? 570 : 0),
            clipBehavior: Clip.hardEdge,
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(4),
              border: Border.all(color: colors.navy, width: compact ? 1 : 2),
            ),
            child: Stack(
              children: [
                Positioned.fill(
                  child: ExcludeSemantics(
                    child: CustomPaint(
                      key: const Key('season-campaign-art'),
                      painter: _SeasonCampaignPainter(
                        navy: colors.navy,
                        cobalt: colors.cobalt,
                        surface: colors.surface,
                        compact: compact,
                      ),
                    ),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.fromLTRB(
                    horizontalPadding,
                    verticalPadding,
                    horizontalPadding,
                    compact ? 30 : (medium ? 34 : 52),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Topline(topline: topline, compact: compact),
                      SizedBox(height: compact ? 38 : (medium ? 48 : 66)),
                      ExcludeSemantics(
                        child: Text(
                          lead,
                          style: TextStyle(
                            color: colors.navy,
                            fontFamily: 'Pretendard',
                            fontSize: leadSize,
                            fontStyle: FontStyle.italic,
                            fontWeight: FontWeight.w900,
                            height: 1.03,
                            letterSpacing: -leadSize * 0.06,
                          ),
                        ),
                      ),
                      ExcludeSemantics(
                        child: SizedBox(
                          width: double.infinity,
                          child: FittedBox(
                            fit: BoxFit.scaleDown,
                            alignment: Alignment.centerLeft,
                            child: Text(
                              emphasis,
                              maxLines: 1,
                              style: TextStyle(
                                color: colors.navy,
                                fontFamily: 'BarlowCondensed',
                                fontSize: emphasisSize,
                                fontStyle: FontStyle.italic,
                                fontWeight: FontWeight.w900,
                                height: 0.88,
                                letterSpacing: -emphasisSize * 0.075,
                              ),
                            ),
                          ),
                        ),
                      ),
                      SizedBox(height: compact ? 24 : 28),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 760),
                        child: Text(
                          description,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                color: colors.description,
                                fontSize: compact ? 13 : 15,
                                height: 1.65,
                              ),
                        ),
                      ),
                      const SizedBox(height: 13),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 760),
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            border: Border(
                              left: BorderSide(color: colors.cobalt, width: 3),
                            ),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.only(left: 12),
                            child: Text(
                              subcopy,
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(
                                    color: colors.navy,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800,
                                    height: 1.55,
                                  ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 28),
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: [
                          SeasonActionButton(
                            label: primaryActionLabel,
                            onPressed: onPrimaryAction,
                            campaign: true,
                          ),
                          SeasonActionButton(
                            label: secondaryActionLabel,
                            onPressed: onSecondaryAction,
                            style: SeasonActionStyle.secondary,
                            campaign: true,
                          ),
                        ],
                      ),
                      if (facts.isNotEmpty) ...[
                        SizedBox(height: compact ? 36 : 52),
                        _FactGrid(facts: facts.take(3).toList()),
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

class _Topline extends StatelessWidget {
  const _Topline({required this.topline, required this.compact});

  final String topline;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colors = _CampaignPalette.of(context);
    final style = TextStyle(
      color: colors.navy,
      fontFamily: 'BarlowCondensed',
      fontFamilyFallback: const ['Pretendard'],
      fontSize: 12,
      fontStyle: FontStyle.italic,
      fontWeight: FontWeight.w900,
      letterSpacing: 0.96,
    );
    if (compact) {
      return Text('2026 SEASON AUBL', style: style);
    }
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 720),
      child: Row(
        children: [
          Text('2026 SEASON AUBL', style: style),
          const SizedBox(width: 20),
          Expanded(
            child: Text(
              topline,
              textAlign: TextAlign.end,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: style,
            ),
          ),
        ],
      ),
    );
  }
}

class _FactGrid extends StatelessWidget {
  const _FactGrid({required this.facts});

  final List<SeasonHeroFact> facts;

  @override
  Widget build(BuildContext context) {
    final colors = _CampaignPalette.of(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final textScale = MediaQuery.textScalerOf(context).scale(1);
        final horizontal = constraints.maxWidth >= 700 && textScale <= 1.5;
        if (!horizontal) {
          return Container(
            width: double.infinity,
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: colors.line)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var index = 0; index < facts.length; index++)
                  _FactCell(
                    fact: facts[index],
                    bottomBorder: index != facts.length - 1,
                  ),
              ],
            ),
          );
        }
        return Container(
          width: double.infinity,
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: colors.line)),
          ),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var index = 0; index < facts.length; index++) ...[
                  Expanded(child: _FactCell(fact: facts[index])),
                  if (index != facts.length - 1)
                    VerticalDivider(width: 1, color: colors.line),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

class _FactCell extends StatelessWidget {
  const _FactCell({required this.fact, this.bottomBorder = false});

  final SeasonHeroFact fact;
  final bool bottomBorder;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(0, 18, 18, 18),
      decoration: bottomBorder
          ? BoxDecoration(
              border: Border(bottom: BorderSide(color: colors.line)),
            )
          : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            fact.label.toUpperCase(),
            style: TextStyle(
              color: colors.cobalt,
              fontFamily: 'BarlowCondensed',
              fontFamilyFallback: const ['Pretendard'],
              fontSize: 10,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            fact.value,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              color: colors.navy,
              fontSize: 16,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            fact.description,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: colors.muted,
              fontSize: 12,
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }
}

class _SeasonCampaignPainter extends CustomPainter {
  const _SeasonCampaignPainter({
    required this.navy,
    required this.cobalt,
    required this.surface,
    required this.compact,
  });

  final Color navy;
  final Color cobalt;
  final Color surface;
  final bool compact;

  @override
  void paint(Canvas canvas, Size size) {
    final opacity = compact ? 0.32 : 0.72;
    final rule = Paint()
      ..color = navy
      ..strokeWidth = 2;
    canvas.drawLine(Offset.zero.translate(0, 18), Offset(size.width, 18), rule);
    canvas.drawLine(
      Offset(0, size.height - 18),
      Offset(size.width, size.height - 18),
      rule,
    );

    final orbit = Paint()
      ..color = cobalt.withValues(alpha: opacity)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    canvas.save();
    canvas.translate(size.width - (compact ? 72 : 118), compact ? 218 : 270);
    canvas.rotate(-11 * math.pi / 180);
    final firstWidth = compact ? 410.0 : math.min(610.0, size.width * 0.72);
    final secondWidth = compact ? 355.0 : math.min(540.0, size.width * 0.64);
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset.zero,
        width: firstWidth,
        height: compact ? 112 : 170,
      ),
      orbit,
    );
    canvas.drawOval(
      Rect.fromCenter(
        center: const Offset(4, 32),
        width: secondWidth,
        height: compact ? 78 : 120,
      ),
      orbit,
    );
    canvas.restore();

    _drawStar(canvas, Offset(size.width * 0.84, 90), 13.5, opacity);
    _drawStar(
      canvas,
      Offset(size.width * 0.95, math.min(size.height - 90, 380)),
      8.5,
      opacity,
    );
    _drawStar(
      canvas,
      Offset(size.width * 0.69, math.min(size.height - 130, 255)),
      6.75,
      opacity,
    );
    _drawBall(
      canvas,
      Offset(size.width * (compact ? 0.88 : 0.91), compact ? 290 : 258),
      compact ? 25 : 33,
      opacity,
    );
  }

  void _drawStar(Canvas canvas, Offset center, double radius, double opacity) {
    final paint = Paint()
      ..color = navy.withValues(alpha: opacity)
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.square;
    canvas.drawLine(
      Offset(center.dx, center.dy - radius),
      Offset(center.dx, center.dy + radius),
      paint,
    );
    canvas.drawLine(
      Offset(center.dx - radius, center.dy),
      Offset(center.dx + radius, center.dy),
      paint,
    );
  }

  void _drawBall(Canvas canvas, Offset center, double radius, double opacity) {
    final fill = Paint()..color = surface.withValues(alpha: 0.94);
    final outline = Paint()
      ..color = navy.withValues(alpha: opacity)
      ..style = PaintingStyle.stroke
      ..strokeWidth = compact ? 3.5 : 5;
    final seam = Paint()
      ..color = cobalt.withValues(alpha: opacity)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    canvas.drawCircle(center, radius, fill);
    canvas.drawCircle(center, radius, outline);
    final seamHeight = radius * 1.45;
    canvas.drawArc(
      Rect.fromCenter(
        center: Offset(center.dx - radius * 0.38, center.dy),
        width: radius * 0.72,
        height: seamHeight,
      ),
      -math.pi / 2,
      math.pi,
      false,
      seam,
    );
    canvas.drawArc(
      Rect.fromCenter(
        center: Offset(center.dx + radius * 0.38, center.dy),
        width: radius * 0.72,
        height: seamHeight,
      ),
      math.pi / 2,
      math.pi,
      false,
      seam,
    );
  }

  @override
  bool shouldRepaint(covariant _SeasonCampaignPainter oldDelegate) {
    return oldDelegate.navy != navy ||
        oldDelegate.cobalt != cobalt ||
        oldDelegate.surface != surface ||
        oldDelegate.compact != compact;
  }
}

@immutable
class _CampaignPalette {
  const _CampaignPalette({
    required this.surface,
    required this.description,
    required this.muted,
    required this.line,
    required this.navy,
    required this.cobalt,
  });

  final Color surface;
  final Color description;
  final Color muted;
  final Color line;
  final Color navy;
  final Color cobalt;

  static _CampaignPalette of(BuildContext context) {
    return Theme.of(context).brightness == Brightness.dark
        ? const _CampaignPalette(
            surface: Color(0xFF0D203D),
            description: Color(0xFFBCC9DA),
            muted: Color(0xFFAEBBD1),
            line: Color(0xFF2C4A73),
            navy: Color(0xFFDCE9FF),
            cobalt: Color(0xFF83B5FF),
          )
        : const _CampaignPalette(
            surface: Color(0xFFFFFFFF),
            description: Color(0xFF344054),
            muted: Color(0xFF667085),
            line: Color(0xFFCFD7E6),
            navy: Color(0xFF06245F),
            cobalt: Color(0xFF154DA2),
          );
  }
}
