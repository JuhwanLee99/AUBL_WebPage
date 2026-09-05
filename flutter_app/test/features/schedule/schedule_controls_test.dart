import 'package:aubl_flutter_app/core/models/public_season_models.dart';
import 'package:aubl_flutter_app/core/theme/app_theme.dart';
import 'package:aubl_flutter_app/features/schedule/widgets/schedule_controls.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

void main() {
  setUpAll(() => initializeDateFormatting('ko'));

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

    testWidgets('supports keyboard selection and one concise semantic label', (
      tester,
    ) async {
      String? selected;
      final semantics = tester.ensureSemantics();
      await _pumpSized(
        tester,
        width: 360,
        height: 520,
        child: ScheduleGroupSelector(
          value: 'B',
          onChanged: (value) => selected = value,
        ),
      );

      expect(find.bySemanticsLabel('A조 경기와 순위 보기'), findsOneWidget);
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pump();
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pump();

      expect(selected, 'A');
      expect(tester.takeException(), isNull);
      semantics.dispose();
    });
  });

  group('ScheduleCardHeader', () {
    testWidgets('stacks long summary text at 360px and 200%', (tester) async {
      await _pumpSized(
        tester,
        width: 360,
        height: 220,
        textScale: 2,
        child: const SizedBox(
          width: 280,
          child: ScheduleCardHeader(title: 'H조', detail: '123경기 완료 · 5팀'),
        ),
      );

      expect(
        tester.getTopLeft(find.text('123경기 완료 · 5팀')).dy,
        greaterThan(tester.getTopLeft(find.text('H조')).dy),
      );
      expect(tester.takeException(), isNull);
    });
  });

  group('ScheduleMonthNavigator', () {
    testWidgets('keeps month controls in one compact row at 360px', (
      tester,
    ) async {
      await _pumpSized(
        tester,
        width: 360,
        height: 220,
        child: ScheduleMonthNavigator(
          month: DateTime(2026, 9),
          onPrevious: () {},
          onToday: () {},
          onNext: () {},
        ),
      );

      expect(find.text('오늘'), findsOneWidget);
      expect(find.text('오늘로 이동'), findsNothing);
      expect(
        (tester.getCenter(find.text('오늘')).dy -
                tester.getCenter(find.text('2026년 9월')).dy)
            .abs(),
        lessThan(24),
      );
      expect(tester.takeException(), isNull);
    });

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

    testWidgets('keeps 44dp date targets in the compact in-panel width', (
      tester,
    ) async {
      await _pumpSized(
        tester,
        width: 360,
        height: 760,
        textScale: 2,
        child: SizedBox(
          width: 308,
          child: ScheduleMonthGrid(
            month: DateTime(2026, 9),
            selectedDate: DateTime(2026, 9, 1),
            eventCountForDate: (_) => 0,
            onDateSelected: (_) {},
          ),
        ),
      );

      final target = find.byKey(const ValueKey('schedule-date-1'));
      expect(tester.getSize(target).width, greaterThanOrEqualTo(44));
      expect(tester.getSize(target).height, greaterThanOrEqualTo(44));
      expect(tester.takeException(), isNull);
    });

    testWidgets('exposes one actionable date semantic', (tester) async {
      DateTime? selected;
      final semantics = tester.ensureSemantics();
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

      final dateSemantic = find.bySemanticsLabel('3일, 경기 2개');
      expect(dateSemantic, findsOneWidget);
      await tester.tap(dateSemantic);
      expect(selected, DateTime(2026, 9, 3));
      expect(tester.takeException(), isNull);
      semantics.dispose();
    });
  });

  group('ScheduleCompactGameCard', () {
    testWidgets('keeps the primary matchup readable at 360px', (tester) async {
      var tapped = false;
      await _pumpSized(
        tester,
        width: 360,
        height: 360,
        child: ScheduleCompactGameCard(
          game: _game(
            awayTeamName: '아주 긴 원정대학교 야구팀',
            homeTeamName: '아주 긴 홈대학교 야구팀',
          ),
          onTap: () => tapped = true,
        ),
      );

      expect(find.text('아주 긴 원정대학교 야구팀'), findsOneWidget);
      expect(find.text('아주 긴 홈대학교 야구팀'), findsOneWidget);
      expect(find.text('중앙대학교 야구장'), findsOneWidget);
      await tester.tap(find.byType(ScheduleCompactGameCard));
      expect(tapped, isTrue);
      expect(tester.takeException(), isNull);
    });

    testWidgets('stacks teams without overflow at 200% text', (tester) async {
      final semantics = tester.ensureSemantics();
      await _pumpSized(
        tester,
        width: 360,
        height: 620,
        textScale: 2,
        child: ScheduleCompactGameCard(game: _game(), onTap: () {}),
      );

      expect(find.text('원정대학교 야구팀'), findsOneWidget);
      expect(find.text('홈대학교 야구팀'), findsOneWidget);
      expect(
        find.bySemanticsLabel(
          RegExp(r'종료, 9\.5\(토\) 14:00, 원정대학교 야구팀 7대 홈대학교 야구팀 5'),
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
      semantics.dispose();
    });
  });
}

PublicGame _game({
  String awayTeamName = '원정대학교 야구팀',
  String homeTeamName = '홈대학교 야구팀',
}) {
  return PublicGame.fromJson({
    'id': 1,
    'seasonId': 2026,
    'seasonYear': 2026,
    'startTime': '2026-09-05T14:00:00',
    'venue': '중앙대학교 야구장',
    'groupCode': 'A',
    'status': 'COMPLETED',
    'homeTeamId': 1,
    'homeTeamName': homeTeamName,
    'homeScore': 5,
    'awayTeamId': 2,
    'awayTeamName': awayTeamName,
    'awayScore': 7,
    'sourceProvider': 'UNIQUE_PLAY',
    'sourceGameId': 'game-1',
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
