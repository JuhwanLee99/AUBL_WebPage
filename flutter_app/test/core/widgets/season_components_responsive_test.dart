import 'package:aubl_flutter_app/core/models/public_season_models.dart';
import 'package:aubl_flutter_app/core/theme/app_theme.dart';
import 'package:aubl_flutter_app/core/widgets/season_components.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

void main() {
  setUpAll(() => initializeDateFormatting('ko'));

  for (final scenario in const [
    (width: 360.0, height: 800.0, textScale: 1.0),
    (width: 390.0, height: 844.0, textScale: 1.3),
    (width: 768.0, height: 1024.0, textScale: 2.0),
  ]) {
    testWidgets(
      'season components fit ${scenario.width.toInt()}px at ${scenario.textScale}x text',
      (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = Size(scenario.width, scenario.height);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.view.resetPhysicalSize);

        await tester.pumpWidget(
          MaterialApp(
            theme: AppTheme.light,
            home: MediaQuery(
              data: MediaQueryData(
                size: Size(scenario.width, scenario.height),
                textScaler: TextScaler.linear(scenario.textScale),
              ),
              child: Scaffold(
                body: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    const SeasonPageHero(
                      eyebrow: '2026 AUBL SEASON',
                      title: Text('우리의 청춘은 이번에도 PLAY BALL'),
                      description: '46TH AUBL · 2026 연합회교 중앙대학교(서울)',
                    ),
                    const SizedBox(height: 12),
                    DataFreshnessCard(
                      freshness: _freshness,
                      fromCache: true,
                      cachedAt: DateTime.utc(2026, 9, 4, 1),
                    ),
                    const SizedBox(height: 12),
                    PublicMatchCard(game: _game, onTap: _noop),
                    const SizedBox(height: 12),
                    const SeasonActionButton(
                      key: Key('test-action'),
                      label: '경기 상세',
                      icon: Icons.arrow_forward,
                      onPressed: _noop,
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
        await tester.pump();

        final renderError = tester.takeException();
        if (renderError case final FlutterError error) {
          fail(
            error.diagnostics
                .map((diagnostic) => diagnostic.toStringDeep())
                .join('\n'),
          );
        }
        expect(renderError, isNull);
        await tester.scrollUntilVisible(
          find.byKey(const Key('test-action')),
          240,
          scrollable: find.byType(Scrollable).first,
        );
        final action = find.descendant(
          of: find.byKey(const Key('test-action')),
          matching: find.byType(FilledButton),
        );
        expect(action, findsOneWidget);
        expect(tester.getSize(action).height, greaterThanOrEqualTo(44));
      },
    );
  }

  testWidgets('hero and match action expose meaningful semantics', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: const Scaffold(
          body: SeasonPageHero(
            eyebrow: '2026 AUBL',
            title: Text('PLAY BALL'),
            description: '연합회교 중앙대학교(서울)',
          ),
        ),
      ),
    );

    expect(find.bySemanticsLabel(RegExp('PLAY BALL')), findsWidgets);
    semantics.dispose();
  });

  testWidgets(
    'long teams and a match without a venue remain readable and actionable at 200%',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(360, 800);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      var opened = false;
      final game = PublicGame.fromJson({
        ..._game.toJson(),
        'venue': null,
        'startTime': null,
      });
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: MediaQuery(
            data: const MediaQueryData(
              size: Size(360, 800),
              textScaler: TextScaler.linear(2),
            ),
            child: Scaffold(
              body: SingleChildScrollView(
                padding: const EdgeInsets.all(12),
                child: PublicMatchCard(game: game, onTap: () => opened = true),
              ),
            ),
          ),
        ),
      );
      for (final team in [game.homeTeamName, game.awayTeamName]) {
        final paragraph = tester.renderObject<RenderParagraph>(find.text(team));
        expect(paragraph.didExceedMaxLines, isFalse);
      }
      expect(find.textContaining('시간 미정'), findsOneWidget);
      expect(find.textContaining('00:00'), findsNothing);
      expect(find.text('경기 상세'), findsOneWidget);
      await tester.ensureVisible(find.text('경기 상세'));
      await tester.tap(find.text('경기 상세'));
      expect(opened, isTrue);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('each shared component fits 390px at 1.3x in isolation', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);

    final cases = <(String, Widget)>[
      (
        'hero',
        const SeasonPageHero(
          eyebrow: '2026 AUBL SEASON',
          title: Text('우리의 청춘은 이번에도 PLAY BALL'),
          description: '46TH AUBL · 2026 연합회교 중앙대학교(서울)',
        ),
      ),
      (
        'freshness',
        DataFreshnessCard(
          freshness: _freshness,
          fromCache: true,
          cachedAt: DateTime.utc(2026, 9, 4, 1),
        ),
      ),
      ('match', PublicMatchCard(game: _game, onTap: _noop)),
      (
        'action',
        const SeasonActionButton(
          label: '경기 상세',
          icon: Icons.arrow_forward,
          onPressed: _noop,
        ),
      ),
    ];
    for (final (name, widget) in cases) {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: MediaQuery(
            data: const MediaQueryData(
              size: Size(390, 844),
              textScaler: TextScaler.linear(1.3),
            ),
            child: Scaffold(
              body: Padding(padding: const EdgeInsets.all(16), child: widget),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(tester.takeException(), isNull, reason: name);
    }
  });
}

void _noop() {}

const _freshness = SourceFreshness(
  provider: 'UNIQUE_PLAY',
  syncMode: 'MANUAL',
  publishedRevision: 'revision-2026-09',
  publishedAt: null,
  latestSourceUpdatedAt: null,
  checkedAt: null,
  ageSeconds: null,
  status: 'CURRENT',
);

final _game = PublicGame(
  backendGameId: 100,
  seasonId: 12,
  seasonYear: 2026,
  gameDate: DateTime(2026, 9, 4),
  startTime: DateTime(2026, 9, 4, 18, 30),
  timezone: 'Asia/Seoul',
  venue: '서울특별시 장충리틀야구장 제1경기장',
  groupCode: 'A',
  status: PublicGameStatus.scheduled,
  gameType: 'REGULAR',
  gameNumber: 1,
  homeTeamId: 1,
  homeTeamName: '아주 긴 이름을 가진 홈 야구팀',
  homeScore: null,
  homeQualificationState: QualificationState.currentEutteum,
  awayTeamId: 2,
  awayTeamName: '아주 긴 이름을 가진 원정 야구팀',
  awayScore: null,
  awayQualificationState: QualificationState.currentBeogeum,
  sourceProvider: 'UNIQUE_PLAY',
  sourceGameId: 'up-100',
  syncRevision: 'revision-2026-09',
  sourceUpdatedAt: null,
  freshnessStatus: 'CURRENT',
  activeRevision: true,
);
