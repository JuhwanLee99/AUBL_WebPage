import 'package:aubl_flutter_app/core/models/official_player_game_logs.dart';
import 'package:aubl_flutter_app/core/theme/app_theme.dart';
import 'package:aubl_flutter_app/features/records/official_player_game_logs_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final data = OfficialPlayerGameLogs.fromJson({
    'status': 'AVAILABLE',
    'syncRevision': 'revision-1',
    'games': [
      {
        'sourceGameId': 'up-game-1',
        'backendGameId': 11,
        'playedAt': '2026-08-24T15:00:00',
        'homeTeamName': '대학 야구팀 A',
        'awayTeamName': '대학 야구팀 B',
        'homeScore': 5,
        'awayScore': 10,
        'batters': [
          {
            'rowKey': 'batter-1',
            'playerName': '타자',
            'position': '중견',
            'stats': {
              'atBats': 3,
              'hits': 1,
              'rbi': null,
              'battingAverage': 0.333,
            },
            'plateAppearances': [
              {'inning': 2, 'result': '사구,송구실책,사구'},
            ],
          },
        ],
        'pitchers': [
          {
            'rowKey': 'pitcher-1',
            'playerName': '투수',
            'decision': '패',
            'stats': {'outs': 5, 'era': 4.2, 'walksAndHitByPitch': 3},
          },
        ],
      },
    ],
  });

  for (final dark in [false, true]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('official rows at 360px, dark=$dark, scale=$scale', (
        tester,
      ) async {
        await tester.binding.setSurfaceSize(const Size(360, 900));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        String? opened;
        await tester.pumpWidget(
          MaterialApp(
            theme: dark ? AppTheme.dark : AppTheme.light,
            home: MediaQuery(
              data: MediaQueryData(textScaler: TextScaler.linear(scale)),
              child: Scaffold(
                body: SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: OfficialPlayerGameLogsView(
                    data: data,
                    onOpenGame: (id) => opened = id,
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.tap(find.byType(ExpansionTile));
        await tester.pumpAndSettle();
        expect(find.text('1.2'), findsOneWidget);
        expect(find.text('4.20'), findsOneWidget);
        expect(find.text('2회 · 사구,송구실책,사구'), findsOneWidget);
        await tester.ensureVisible(find.text('경기 상세'));
        await tester.tap(find.text('경기 상세'));
        expect(opened, 'up-game-1');
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('unmapped identity has an explicit empty state', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: OfficialPlayerGameLogsView(
            data: const OfficialPlayerGameLogs(
              status: 'IDENTITY_UNRESOLVED',
              games: [],
            ),
            onOpenGame: (_) {},
          ),
        ),
      ),
    );
    expect(find.textContaining('동명이인 기록을 임의로 합치지 않습니다'), findsOneWidget);
    expect(find.byType(ExpansionTile), findsNothing);
  });
}
