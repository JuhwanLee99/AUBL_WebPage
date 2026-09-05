import 'package:aubl_flutter_app/core/navigation/app_destination.dart';
import 'package:aubl_flutter_app/core/navigation/app_destination_navigation.dart';
import 'package:aubl_flutter_app/core/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Future<void> pumpBar(
    WidgetTester tester, {
    required Size size,
    required double textScale,
    required ValueChanged<AppDestination> onSelected,
  }) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = size;

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: MediaQuery(
          data: MediaQueryData(
            size: size,
            textScaler: TextScaler.linear(textScale),
          ),
          child: Scaffold(
            bottomNavigationBar: FloatingDestinationBar(
              current: AppDestination.home,
              loggedIn: false,
              onSelected: onSelected,
            ),
          ),
        ),
      ),
    );
  }

  testWidgets('six destination bar fits 360px and keeps tap targets at 1.3x', (
    tester,
  ) async {
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    var selected = AppDestination.home;

    await pumpBar(
      tester,
      size: const Size(360, 800),
      textScale: 1.3,
      onSelected: (value) => selected = value,
    );

    expect(tester.takeException(), isNull);
    expect(find.byType(NavigationDestination), findsNWidgets(6));
    for (final destination in AppDestination.values) {
      expect(find.text(destination.label), findsOneWidget);
    }
    expect(
      tester.getSize(find.byType(NavigationBar)).height,
      greaterThanOrEqualTo(48),
    );
    for (final destination in AppDestination.values) {
      final destinationFinder = find.byWidgetPredicate(
        (widget) =>
            widget is NavigationDestination &&
            widget.label == destination.label,
      );
      expect(tester.getSize(destinationFinder).width, greaterThanOrEqualTo(44));
    }

    await tester.tap(find.text('경기'));
    expect(selected, AppDestination.games);
  });

  testWidgets('six destination bar fits 390px at 2x without overflow', (
    tester,
  ) async {
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);

    await pumpBar(
      tester,
      size: const Size(390, 844),
      textScale: 2,
      onSelected: (_) {},
    );

    expect(tester.takeException(), isNull);
    expect(find.byType(NavigationDestination), findsNWidgets(6));
    expect(
      tester.widget<NavigationBar>(find.byType(NavigationBar)).labelBehavior,
      NavigationDestinationLabelBehavior.onlyShowSelected,
    );
    expect(find.text('홈'), findsOneWidget);
    for (final destination in AppDestination.values) {
      expect(find.byTooltip(destination.label), findsOneWidget);
    }
  });

  testWidgets('768px tablet uses a compact six destination rail at 1.3x', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(768, 1024);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: MediaQuery(
          data: const MediaQueryData(
            size: Size(768, 1024),
            textScaler: TextScaler.linear(1.3),
          ),
          child: Scaffold(
            body: Row(
              children: [
                FloatingDestinationRail(
                  current: AppDestination.records,
                  onSelected: (_) {},
                ),
                const Expanded(child: SizedBox()),
              ],
            ),
          ),
        ),
      ),
    );

    expect(tester.takeException(), isNull);
    expect(find.byType(NavigationRail), findsOneWidget);
    expect(
      tester.widget<NavigationRail>(find.byType(NavigationRail)).extended,
      isFalse,
    );
    expect(find.text('기록'), findsOneWidget);
  });

  testWidgets('1024px tablet uses an expanded rail at 2x', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(1024, 1366);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: MediaQuery(
          data: const MediaQueryData(
            size: Size(1024, 1366),
            textScaler: TextScaler.linear(2),
          ),
          child: Scaffold(
            body: Row(
              children: [
                FloatingDestinationRail(
                  current: AppDestination.community,
                  expanded: true,
                  onSelected: (_) {},
                ),
                const Expanded(child: SizedBox()),
              ],
            ),
          ),
        ),
      ),
    );

    expect(tester.takeException(), isNull);
    expect(find.byType(NavigationRail), findsOneWidget);
    expect(
      tester.widget<NavigationRail>(find.byType(NavigationRail)).extended,
      isTrue,
    );
    for (final destination in AppDestination.values) {
      expect(find.text(destination.label), findsOneWidget);
    }
  });

  test('navigation breakpoints switch at 768 and expand at 1024', () {
    expect(AppNavigationBreakpoints.useRail(767.9), isFalse);
    expect(AppNavigationBreakpoints.useRail(768), isTrue);
    expect(AppNavigationBreakpoints.useRail(844, height: 390), isFalse);
    expect(AppNavigationBreakpoints.useRail(768, height: 600), isTrue);
    expect(AppNavigationBreakpoints.useExpandedRail(1023.9), isFalse);
    expect(AppNavigationBreakpoints.useExpandedRail(1024), isTrue);
    expect(
      AppNavigationBreakpoints.useExpandedRail(1024, height: 599),
      isFalse,
    );
  });

  testWidgets(
    'compact rail keeps destinations reachable with a tablet keyboard at 200%',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(768, 600);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      AppDestination? selected;
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: MediaQuery(
            data: const MediaQueryData(
              size: Size(768, 600),
              padding: EdgeInsets.only(top: 24, bottom: 24),
              viewInsets: EdgeInsets.only(bottom: 300),
              textScaler: TextScaler.linear(2),
            ),
            child: Scaffold(
              body: Row(
                children: [
                  FloatingDestinationRail(
                    current: AppDestination.home,
                    onSelected: (value) => selected = value,
                  ),
                  const Expanded(child: SizedBox()),
                ],
              ),
            ),
          ),
        ),
      );
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(find.text('더보기'));
      await tester.tap(find.text('더보기'));
      expect(selected, AppDestination.more);
    },
  );
}
