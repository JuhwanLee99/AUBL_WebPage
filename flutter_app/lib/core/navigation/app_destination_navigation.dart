import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'app_destination.dart';

class FloatingDestinationRail extends StatelessWidget {
  const FloatingDestinationRail({
    super.key,
    required this.current,
    required this.onSelected,
  });

  final AppDestination current;
  final ValueChanged<AppDestination> onSelected;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return SafeArea(
      minimum: const EdgeInsets.fromLTRB(12, 12, 0, 12),
      child: Container(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: colors.line),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(21),
          child: NavigationRail(
            backgroundColor: colors.surface,
            selectedIndex: current.index,
            labelType: NavigationRailLabelType.all,
            groupAlignment: -0.6,
            onDestinationSelected: (index) =>
                onSelected(AppDestination.values[index]),
            destinations: AppDestination.values
                .map(
                  (destination) => NavigationRailDestination(
                    icon: Icon(destinationIcon(destination)),
                    selectedIcon: Icon(destinationIcon(destination), fill: 1),
                    label: Text(destination.label),
                  ),
                )
                .toList(),
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
    return SafeArea(
      minimum: const EdgeInsets.fromLTRB(12, 0, 12, 10),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: colors.line),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(
                alpha: Theme.of(context).brightness == Brightness.dark
                    ? 0.24
                    : 0.09,
              ),
              blurRadius: 22,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(21),
          child: NavigationBar(
            selectedIndex: current.index,
            labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
            onDestinationSelected: (index) =>
                onSelected(AppDestination.values[index]),
            destinations: AppDestination.values.map((destination) {
              Widget icon = Icon(destinationIcon(destination));
              if (destination == AppDestination.more && !loggedIn) {
                icon = Badge(child: icon);
              }
              return NavigationDestination(
                icon: icon,
                selectedIcon: Icon(destinationIcon(destination), fill: 1),
                label: destination.label,
                tooltip: destination.label,
              );
            }).toList(),
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
