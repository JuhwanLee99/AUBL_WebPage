import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'app_destination.dart';
import 'app_destination_navigation.dart';

/// B안: the original app's edge-to-edge, always available six-tab dock.
class NativeDestinationBar extends StatelessWidget {
  const NativeDestinationBar({
    super.key,
    required this.current,
    required this.onSelected,
    this.loggedIn = true,
  });

  final AppDestination current;
  final ValueChanged<AppDestination> onSelected;
  final bool loggedIn;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final largeText = MediaQuery.textScalerOf(context).scale(1) > 1.5;
    return Material(
      color: colors.surface,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: colors.line)),
        ),
        child: SafeArea(
          top: false,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final destination in AppDestination.values)
                Expanded(
                  child: Semantics(
                    label: destination == AppDestination.more && !loggedIn
                        ? '${destination.label}, 로그인'
                        : destination.label,
                    button: true,
                    selected: current == destination,
                    excludeSemantics: true,
                    onTap: () => onSelected(destination),
                    child: InkWell(
                      key: ValueKey('native-destination-${destination.name}'),
                      onTap: () => onSelected(destination),
                      child: Container(
                        constraints: BoxConstraints(
                          minHeight: largeText ? 94 : 64,
                        ),
                        padding: const EdgeInsets.fromLTRB(2, 9, 2, 8),
                        decoration: BoxDecoration(
                          border: Border(
                            top: BorderSide(
                              color: current == destination
                                  ? colors.cobalt
                                  : Colors.transparent,
                              width: 2,
                            ),
                          ),
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Badge(
                              isLabelVisible:
                                  destination == AppDestination.more &&
                                  !loggedIn,
                              smallSize: 5,
                              backgroundColor: colors.cobalt,
                              child: Icon(
                                destinationIcon(destination),
                                size: 23,
                                fill: current == destination ? 1 : 0,
                                color: current == destination
                                    ? colors.navy
                                    : colors.muted,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              destination.label,
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 10.5,
                                height: 1.2,
                                fontWeight: current == destination
                                    ? FontWeight.w800
                                    : FontWeight.w600,
                                color: current == destination
                                    ? colors.navy
                                    : colors.muted,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
