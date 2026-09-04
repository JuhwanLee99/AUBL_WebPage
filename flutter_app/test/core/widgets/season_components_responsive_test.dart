import 'package:aubl_flutter_app/core/models/public_season_models.dart';
import 'package:aubl_flutter_app/core/theme/app_theme.dart';
import 'package:aubl_flutter_app/core/widgets/season_components.dart';
import 'package:flutter/material.dart';
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

        expect(tester.takeException(), isNull);
        expect(
          tester.getSize(find.widgetWithText(FilledButton, '경기 상세')).height,
          greaterThanOrEqualTo(44),
        );
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
