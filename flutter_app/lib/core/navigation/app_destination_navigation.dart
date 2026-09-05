import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'app_destination.dart';

abstract final class AppNavigationBreakpoints {
  static const double rail = 768;
  static const double expandedRail = 1024;
  static const double minimumRailHeight = 600;

  static bool useRail(double width, {double height = double.infinity}) =>
      width >= rail && height >= minimumRailHeight;

  static bool useExpandedRail(
    double width, {
    double height = double.infinity,
  }) => width >= expandedRail && height >= minimumRailHeight;
}

class FloatingDestinationRail extends StatelessWidget {
  const FloatingDestinationRail({
    super.key,
    required this.current,
    required this.onSelected,
    this.expanded = false,
  });

  final AppDestination current;
  final ValueChanged<AppDestination> onSelected;
  final bool expanded;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final textScale = MediaQuery.textScalerOf(context).scale(1);
    final needsWideTargets = textScale >= 1.75;
    final railTheme = NavigationRailTheme.of(context).copyWith(
      backgroundColor: Colors.transparent,
      elevation: 0,
      useIndicator: true,
      indicatorColor: Theme.of(context).brightness == Brightness.dark
          ? const Color(0xFF1B3B66)
          : const Color(0xFFDCEAFE),
      indicatorShape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(6),
      ),
      minWidth: needsWideTargets ? 112 : 76,
      minExtendedWidth: needsWideTargets ? 252 : 218,
      selectedIconTheme: IconThemeData(color: colors.navy, size: 24),
      unselectedIconTheme: IconThemeData(color: colors.muted, size: 23),
      selectedLabelTextStyle: TextStyle(
        color: colors.navy,
        fontFamily: 'Pretendard',
        fontSize: 12,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.1,
      ),
      unselectedLabelTextStyle: TextStyle(
        color: colors.muted,
        fontFamily: 'Pretendard',
        fontSize: 12,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.1,
      ),
    );

    return SafeArea(
      minimum: const EdgeInsets.fromLTRB(8, 10, 0, 10),
      child: Container(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: colors.lineStrong),
          boxShadow: [
            BoxShadow(
              color: Theme.of(context).brightness == Brightness.dark
                  ? Colors.black.withValues(alpha: 0.24)
                  : AppTheme.navy900.withValues(alpha: 0.10),
              blurRadius: 20,
              offset: const Offset(3, 6),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(17),
          child: NavigationRailTheme(
            data: railTheme,
            child: NavigationRail(
              extended: expanded,
              scrollable: true,
              selectedIndex: current.index,
              labelType: expanded ? null : NavigationRailLabelType.all,
              groupAlignment: -0.75,
              leading: Padding(
                padding: const EdgeInsets.only(top: 6, bottom: 10),
                child: Semantics(
                  label: 'AUBL 홈',
                  image: true,
                  child: Image.asset(
                    'assets/images/aubl_clean.png',
                    width: expanded ? 38 : 34,
                    height: expanded ? 38 : 34,
                    fit: BoxFit.contain,
                  ),
                ),
              ),
              onDestinationSelected: (index) =>
                  onSelected(AppDestination.values[index]),
              destinations: AppDestination.values
                  .map(
                    (destination) => NavigationRailDestination(
                      icon: Icon(destinationIcon(destination)),
                      selectedIcon: Icon(destinationIcon(destination), fill: 1),
                      label: Text(destination.label),
                      padding: const EdgeInsets.symmetric(vertical: 3),
                    ),
                  )
                  .toList(),
            ),
          ),
        ),
      ),
    );
  }
}

class FloatingDestinationBar extends StatelessWidget {
  const FloatingDestinationBar({
    super.key,
    required this.current,
    required this.loggedIn,
    required this.onSelected,
  });

  final AppDestination current;
  final bool loggedIn;
  final ValueChanged<AppDestination> onSelected;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final brightness = Theme.of(context).brightness;
    final textScale = MediaQuery.textScalerOf(context).scale(1);
    final labelBehavior = textScale > 1.35
        ? NavigationDestinationLabelBehavior.onlyShowSelected
        : NavigationDestinationLabelBehavior.alwaysShow;
    final navigationTheme = NavigationBarTheme.of(context).copyWith(
      height: textScale > 1.35 ? 72 : 68,
      backgroundColor: colors.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      indicatorColor: brightness == Brightness.dark
          ? const Color(0xFF1B3B66)
          : const Color(0xFFDCEAFE),
      indicatorShape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(6),
      ),
      overlayColor: WidgetStatePropertyAll(
        colors.cobalt.withValues(alpha: 0.08),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          color: selected ? colors.navy : colors.muted,
          fontFamily: 'Pretendard',
          fontSize: 10.5,
          fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
          letterSpacing: -0.1,
        );
      }),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        return IconThemeData(
          color: states.contains(WidgetState.selected)
              ? colors.navy
              : colors.muted,
          size: 22,
        );
      }),
    );

    return SafeArea(
      maintainBottomViewPadding: true,
      minimum: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: colors.lineStrong),
          boxShadow: [
            BoxShadow(
              color: brightness == Brightness.dark
                  ? Colors.black.withValues(alpha: 0.24)
                  : AppTheme.navy900.withValues(alpha: 0.12),
              blurRadius: 24,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(21),
          child: NavigationBarTheme(
            data: navigationTheme,
            child: NavigationBar(
              selectedIndex: current.index,
              labelBehavior: labelBehavior,
              onDestinationSelected: (index) =>
                  onSelected(AppDestination.values[index]),
              destinations: AppDestination.values.map((destination) {
                Widget buildIcon({required bool selected}) {
                  Widget icon = Icon(
                    destinationIcon(destination),
                    fill: selected ? 1 : 0,
                  );
                  if (destination == AppDestination.more && !loggedIn) {
                    icon = Badge(
                      backgroundColor: colors.cobalt,
                      smallSize: 6,
                      child: icon,
                    );
                  }
                  return icon;
                }

                return NavigationDestination(
                  icon: buildIcon(selected: false),
                  selectedIcon: buildIcon(selected: true),
                  label: destination.label,
                  tooltip: destination.label,
                );
              }).toList(),
            ),
          ),
        ),
      ),
    );
  }
}

IconData destinationIcon(AppDestination destination) => switch (destination) {
  AppDestination.home => Icons.home_outlined,
  AppDestination.teams => Icons.groups_outlined,
  AppDestination.games => Icons.calendar_month_outlined,
  AppDestination.records => Icons.leaderboard_outlined,
  AppDestination.community => Icons.forum_outlined,
  AppDestination.more => Icons.menu,
};
