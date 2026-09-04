import 'package:aubl_flutter_app/core/theme/app_theme.dart';
import 'package:aubl_flutter_app/core/widgets/season_campaign_hero.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  setUpAll(() async {
    final pretendard = FontLoader('Pretendard')
      ..addFont(rootBundle.load('assets/fonts/PretendardVariable.otf'));
    final barlow = FontLoader('BarlowCondensed')
      ..addFont(rootBundle.load('assets/fonts/BarlowCondensed-SemiBold.ttf'))
      ..addFont(rootBundle.load('assets/fonts/BarlowCondensed-Black.ttf'));
    await Future.wait([pretendard.load(), barlow.load()]);
  });

  for (final scenario in const [
    (width: 360.0, height: 800.0, textScale: 1.0, brightness: Brightness.light),
    (width: 390.0, height: 844.0, textScale: 1.3, brightness: Brightness.dark),
    (
      width: 768.0,
      height: 1024.0,
      textScale: 2.0,
      brightness: Brightness.light,
    ),
  ]) {
    testWidgets(
      'campaign hero fits ${scenario.width.toInt()}px at ${scenario.textScale}x',
      (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = Size(scenario.width, scenario.height);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.view.resetPhysicalSize);

        await tester.pumpWidget(
          MaterialApp(
            theme: AppTheme.light,
            darkTheme: AppTheme.dark,
            themeMode: scenario.brightness == Brightness.dark
                ? ThemeMode.dark
                : ThemeMode.light,
            home: MediaQuery(
              data: MediaQueryData(
                size: Size(scenario.width, scenario.height),
                textScaler: TextScaler.linear(scenario.textScale),
              ),
              child: Scaffold(
                body: SingleChildScrollView(
                  padding: const EdgeInsets.all(12),
                  child: _hero(),
                ),
              ),
            ),
          ),
        );
        await tester.pump();

        expect(tester.takeException(), isNull);
        expect(find.text('PLAY BALL'), findsOneWidget);
        expect(find.text('경기 일정 · 결과'), findsOneWidget);
        expect(find.text('조별 순위 보기'), findsOneWidget);
        expect(find.byKey(const Key('season-campaign-art')), findsOneWidget);
        expect(find.text('중앙대학교(서울)'), findsOneWidget);
        expect(find.textContaining('호스트'), findsNothing);

        final surface = tester.widget<Container>(
          find.byKey(const Key('season-campaign-surface')),
        );
        final decoration = surface.decoration! as BoxDecoration;
        expect(decoration.borderRadius, BorderRadius.circular(4));
        final border = decoration.border! as Border;
        expect(border.top.width, scenario.width < 560 ? 1 : 2);

        for (final label in ['경기 일정 · 결과', '조별 순위 보기']) {
          final button = find.ancestor(
            of: find.text(label),
            matching: find.byWidgetPredicate(
              (widget) => widget is ButtonStyleButton,
            ),
          );
          expect(tester.getSize(button).height, greaterThanOrEqualTo(46));
        }
      },
    );
  }

  testWidgets('campaign hero exposes one concise heading semantic', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(body: SingleChildScrollView(child: _hero())),
      ),
    );

    expect(
      find.bySemanticsLabel(RegExp('우리의 청춘은 이번에도 PLAY BALL')),
      findsOneWidget,
    );
    semantics.dispose();
  });

  for (final mode in const [ThemeMode.light, ThemeMode.dark]) {
    testWidgets('campaign hero visual baseline in ${mode.name} mode', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 1100);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          darkTheme: AppTheme.dark,
          themeMode: mode,
          home: Scaffold(
            body: Align(
              alignment: Alignment.topCenter,
              child: Padding(padding: const EdgeInsets.all(12), child: _hero()),
            ),
          ),
        ),
      );
      await tester.pump();

      await expectLater(
        find.byType(SeasonCampaignHero),
        matchesGoldenFile('goldens/season_campaign_hero_390_${mode.name}.png'),
      );
    });
  }
}

Widget _hero() {
  return const SeasonCampaignHero(
    topline: '전국대학아마추어야구연합회 · SINCE 1981',
    lead: '우리의 청춘은 이번에도',
    emphasis: 'PLAY BALL',
    description:
        '2026 제46회 전국대학아마추어야구연합회(AUBL). 대한민국 유일의 순수 대학 아마추어 야구 리그에서\n40개 대학 2,000여 명의 선수가 써 내려가는 각본 없는 드라마가 지금 시작됩니다.',
    subcopy:
        '2026 연합회교 중앙대학교(서울)와 함께하는 시즌 — 실시간 기록과 중계, 디지털화를 핵심 가치로 리그의 새로운 도약을 준비했습니다.',
    primaryActionLabel: '경기 일정 · 결과',
    onPrimaryAction: _noop,
    secondaryActionLabel: '조별 순위 보기',
    onSecondaryAction: _noop,
    facts: [
      SeasonHeroFact(
        label: '2026 연합회교',
        value: '중앙대학교(서울)',
        description: '46주년 시즌 운영을 담당하는 연합회교',
      ),
      SeasonHeroFact(
        label: 'FORMAT',
        value: 'A~H조 8개 조 / 약 40팀',
        description: '조별 예선 후 으뜸·버금 이원화 토너먼트',
      ),
      SeasonHeroFact(
        label: 'VISION',
        value: '실시간 기록 · 중계 · 디지털화',
        description: '웹 플랫폼 기반으로 즉시 전달하는 2026 시즌',
      ),
    ],
  );
}

void _noop() {}
