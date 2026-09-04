import 'package:aubl_flutter_app/core/navigation/app_destination.dart';
import 'package:aubl_flutter_app/core/navigation/app_destination_navigation.dart';
import 'package:aubl_flutter_app/core/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('six destination bar fits 360px and keeps tap targets', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(360, 800);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    var selected = AppDestination.home;

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: MediaQuery(
          data: const MediaQueryData(
            size: Size(360, 800),
            textScaler: TextScaler.linear(1.3),
          ),
          child: Scaffold(
            bottomNavigationBar: FloatingDestinationBar(
              current: selected,
              loggedIn: false,
              onSelected: (value) => selected = value,
            ),
          ),
        ),
      ),
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

    await tester.tap(find.text('경기'));
    expect(selected, AppDestination.games);
  });

  testWidgets('landscape tablet uses the six destination rail', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(1024, 768);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
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
    );

    expect(tester.takeException(), isNull);
    expect(find.byType(NavigationRail), findsOneWidget);
    expect(find.text('기록'), findsOneWidget);
  });
}
