import 'package:aubl_flutter_app/core/theme/app_theme.dart';
import 'package:aubl_flutter_app/features/schedule/widgets/schedule_controls.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ScheduleGroupSelector', () {
    testWidgets(
      'keeps all groups visible at 360px and supports tier selection',
      (tester) async {
        String? selected;
        await _pumpSized(
          tester,
          width: 360,
          height: 520,
          child: ScheduleGroupSelector(
            value: 'A',
            onChanged: (value) => selected = value,
          ),
        );

        for (final group in ScheduleGroupSelector.groups) {
          expect(find.text('$group조'), findsOneWidget);
        }
        expect(find.text('으뜸권'), findsOneWidget);
        expect(find.text('버금권'), findsOneWidget);

        final firstTarget = find.ancestor(
          of: find.text('A조'),
          matching: find.byType(InkWell),
        );
        expect(tester.getSize(firstTarget).height, greaterThanOrEqualTo(48));

        await tester.tap(find.text('으뜸권'));
        expect(selected, 'EUTTEUM');
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets('uses an eight-column group row on a wide surface', (
      tester,
    ) async {
      await _pumpSized(
        tester,
        width: 900,
        height: 360,
        child: ScheduleGroupSelector(value: 'D', onChanged: (_) {}),
      );

      final a = tester.getTopLeft(find.text('A조'));
      final h = tester.getTopLeft(find.text('H조'));
      expect((a.dy - h.dy).abs(), lessThan(1));
      expect(tester.takeException(), isNull);
    });

    testWidgets('keeps the complete selector usable at 200% text', (
      tester,
    ) async {
      await _pumpSized(
        tester,
        width: 360,
        height: 820,
        textScale: 2,
        child: ScheduleGroupSelector(value: 'BEOGEUM', onChanged: (_) {}),
      );

      for (final group in ScheduleGroupSelector.groups) {
        expect(find.text('$group조'), findsOneWidget);
      }
      expect(find.text('으뜸권'), findsOneWidget);
      expect(find.text('버금권'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('ScheduleMonthNavigator', () {
    testWidgets('stacks today control without overflow at 200% text', (
      tester,
    ) async {
      var previous = false;
      var today = false;
      var next = false;
      await _pumpSized(
        tester,
        width: 360,
        height: 300,
        textScale: 2,
        child: ScheduleMonthNavigator(
          month: DateTime(2026, 9),
          onPrevious: () => previous = true,
          onToday: () => today = true,
          onNext: () => next = true,
        ),
      );

      expect(find.text('2026년 9월'), findsOneWidget);
      expect(find.text('오늘로 이동'), findsOneWidget);
      await tester.tap(find.byTooltip('이전 달'));
      await tester.tap(find.text('오늘로 이동'));
      await tester.tap(find.byTooltip('다음 달'));
      expect((previous, today, next), (true, true, true));
      expect(tester.takeException(), isNull);
    });
  });

  group('ScheduleMonthGrid', () {
    testWidgets('uses 44dp date targets and count labels at normal scale', (
      tester,
    ) async {
      DateTime? selected;
      await _pumpSized(
        tester,
        width: 360,
        height: 620,
        child: ScheduleMonthGrid(
          month: DateTime(2026, 9),
          selectedDate: DateTime(2026, 9, 1),
          eventCountForDate: (date) => date.day == 3 ? 2 : 0,
          onDateSelected: (date) => selected = date,
        ),
      );

      final dateTarget = find.byKey(const ValueKey('schedule-date-3'));
      expect(tester.getSize(dateTarget).height, greaterThanOrEqualTo(44));
      expect(find.byKey(const ValueKey('schedule-event-count-3')), findsOne);
      expect(find.text('2경기'), findsOneWidget);
      await tester.tap(dateTarget);
      expect(selected, DateTime(2026, 9, 3));
      expect(tester.takeException(), isNull);
    });

    testWidgets('uses a dot instead of tiny count text at large scale', (
      tester,
    ) async {
      await _pumpSized(
        tester,
        width: 360,
        height: 760,
        textScale: 2,
        child: ScheduleMonthGrid(
          month: DateTime(2026, 9),
          selectedDate: DateTime(2026, 9, 1),
          eventCountForDate: (date) => date.day == 3 ? 2 : 0,
          onDateSelected: (_) {},
        ),
      );

      expect(find.byKey(const ValueKey('schedule-event-dot-3')), findsOne);
      expect(
        find.byKey(const ValueKey('schedule-event-count-3')),
        findsNothing,
      );
      expect(find.text('2경기'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  });
}

Future<void> _pumpSized(
  WidgetTester tester, {
  required double width,
  required double height,
  required Widget child,
  double textScale = 1,
}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: Scaffold(
        body: MediaQuery(
          data: MediaQueryData(
            size: Size(width, height),
            textScaler: TextScaler.linear(textScale),
          ),
          child: SingleChildScrollView(
            child: Padding(padding: const EdgeInsets.all(12), child: child),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}
