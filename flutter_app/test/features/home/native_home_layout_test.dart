import 'package:aubl_flutter_app/core/models/public_season_models.dart';
import 'package:aubl_flutter_app/core/navigation/app_destination.dart';
import 'package:aubl_flutter_app/core/navigation/native_destination_bar.dart';
import 'package:aubl_flutter_app/core/theme/app_theme.dart';
import 'package:aubl_flutter_app/features/home/widgets/native_home_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('ko');
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    await (FontLoader(
      'Pretendard',
    )..addFont(rootBundle.load('assets/fonts/PretendardVariable.otf'))).load();
    await (FontLoader('BarlowCondensed')
          ..addFont(
            rootBundle.load('assets/fonts/BarlowCondensed-SemiBold.ttf'),
          )
          ..addFont(rootBundle.load('assets/fonts/BarlowCondensed-Black.ttf')))
        .load();
  });

  Future<void> pumpHome(
    WidgetTester tester, {
    Size size = const Size(360, 800),
    double scale = 1,
    Brightness brightness = Brightness.light,
    VoidCallback? onDetails,
    VoidCallback? onGame,
    ValueChanged<AppDestination>? onTab,
  }) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = size;
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    await tester.pumpWidget(
      MaterialApp(
        theme: brightness == Brightness.light ? AppTheme.light : AppTheme.dark,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: RepaintBoundary(
          key: const Key('b-home-preview'),
          child: Scaffold(
            body: NativeHomeLayout(
              onRefresh: () async {},
              onIntro: () {},
              banner: NativeCampaignBanner(
                topline: '46TH AUBL · 2026 연합회교 중앙대학교(서울)',
                onDetails: onDetails ?? () {},
              ),
              freshness: const NativeFreshnessInfo(
                freshness: _freshness,
                fromCache: false,
              ),
              matches: NativeHomeSection(
                title: '경기 일정 · 결과',
                action: TextButton(
                  onPressed: () {},
                  child: const Text('전체 일정'),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SegmentedButton<bool>(
                      segments: const [
                        ButtonSegment(
                          value: false,
                          label: Text('목록'),
                          icon: Icon(Icons.view_agenda_outlined),
                        ),
                        ButtonSegment(
                          value: true,
                          label: Text('달력'),
                          icon: Icon(Icons.calendar_month_outlined),
                        ),
                      ],
                      selected: const {false},
                      onSelectionChanged: (_) {},
                    ),
                    const SizedBox(height: 12),
                    const Text('가까운 예정 경기'),
                    const SizedBox(height: 8),
                    NativeHomeGameTile(
                      key: const Key('first-game'),
                      game: _game,
                      onTap: onGame ?? () {},
                    ),
                    const SizedBox(height: 16),
                    const Text('최근 경기 결과'),
                    const SizedBox(height: 8),
                    NativeHomeGameTile(
                      game: PublicGame.fromJson({
                        ..._game.toJson(),
                        'status': 'COMPLETED',
                        'homeScore': 4,
                        'awayScore': 2,
                      }),
                      onTap: onGame ?? () {},
                    ),
                  ],
                ),
              ),
              groups: const NativeHomeSection(
                title: '조별 현황',
                child: SizedBox(
                  height: 280,
                  child: Text('A · B · C · D · E · F · G · H'),
                ),
              ),
              leaders: const Text('시즌 기록'),
              notices: const Text('리그 공지 · 커뮤니티'),
              partners: const Text('골드볼파크 · 메이저'),
            ),
            bottomNavigationBar: NativeDestinationBar(
              current: AppDestination.home,
              onSelected: onTab ?? (_) {},
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('B home exposes a game in the first 360px viewport', (
    tester,
  ) async {
    var opened = false;
    var campaignOpened = false;
    await pumpHome(
      tester,
      onGame: () => opened = true,
      onDetails: () => campaignOpened = true,
    );
    final game = find.byKey(const Key('first-game'));
    expect(tester.getBottomRight(game).dy, lessThan(700));
    expect(tester.getTopLeft(game).dy, lessThan(450));
    expect(
      tester.getSize(find.byType(NativeCampaignBanner)).height,
      lessThan(190),
    );
    expect(tester.getSize(game).height, lessThan(160));
    await tester.tap(find.byKey(const Key('native-campaign-details')));
    expect(campaignOpened, isTrue);
    await tester.tap(game);
    expect(opened, isTrue);
    expect(tester.takeException(), isNull);
  });

  for (final scenario in [
    (size: const Size(360, 800), scale: 2.0),
    (size: const Size(844, 390), scale: 1.3),
    (size: const Size(768, 1024), scale: 2.0),
  ]) {
    testWidgets('B home and dock fit ${scenario.size} at ${scenario.scale}x', (
      tester,
    ) async {
      AppDestination? selected;
      await pumpHome(
        tester,
        size: scenario.size,
        scale: scenario.scale,
        brightness: Brightness.dark,
        onTab: (value) => selected = value,
      );
      for (final destination in AppDestination.values) {
        final item = find.byKey(
          ValueKey('native-destination-${destination.name}'),
        );
        expect(tester.getSize(item).width, greaterThanOrEqualTo(44));
        expect(tester.getSize(item).height, greaterThanOrEqualTo(44));
        await tester.tap(item);
        expect(selected, destination);
      }
      final game = find.byKey(const Key('first-game'));
      await tester.scrollUntilVisible(
        game,
        160,
        scrollable: find
            .descendant(
              of: find.byKey(const Key('native-home-scroll')),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      for (final name in [_game.homeTeamName, _game.awayTeamName]) {
        final paragraph = tester.renderObject<RenderParagraph>(
          find.descendant(of: game, matching: find.text(name)),
        );
        expect(paragraph.didExceedMaxLines, isFalse);
      }
      expect(find.text('리그 소개').hitTestable(), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('B match preserves missing time and details without venue', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(360, 800);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: NativeHomeGameTile(
            game: PublicGame.fromJson({
              ..._game.toJson(),
              'startTime': null,
              'venue': null,
            }),
            onTap: () {},
          ),
        ),
      ),
    );
    expect(find.textContaining('시간 미정'), findsOneWidget);
    expect(find.textContaining('00:00'), findsNothing);
    expect(find.text('경기 상세'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'B dock preserves keyboard activation and single destination semantics',
    (tester) async {
      final semantics = tester.ensureSemantics();
      try {
        AppDestination? selected;
        await pumpHome(tester, onTab: (value) => selected = value);
        final games = find.byKey(const ValueKey('native-destination-games'));
        final icon = find
            .descendant(of: games, matching: find.byType(Icon))
            .first;
        Focus.of(tester.element(icon)).requestFocus();
        await tester.pump();
        await tester.sendKeyEvent(LogicalKeyboardKey.enter);
        expect(selected, AppDestination.games);
        expect(find.bySemanticsLabel('경기'), findsOneWidget);
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
    },
  );

  testWidgets('B freshness distinguishes checked time and exposes revision', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: NativeFreshnessInfo(
            freshness: SourceFreshness.fromJson({
              ..._freshness.toJson(),
              'checkedAt': '2026-09-04T15:30:00Z',
              'status': 'STALE',
            }),
            fromCache: false,
          ),
        ),
      ),
    );
    final summary = find.textContaining('9.5 00:30 확인');
    expect(summary, findsOneWidget);
    expect(find.textContaining('갱신 필요'), findsOneWidget);
    expect(find.textContaining('00:30 게시'), findsNothing);
    await tester.tap(summary);
    await tester.pumpAndSettle();
    expect(find.textContaining('게시 버전 design-b-fixture'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('B cached timestamp follows KST across UTC midnight', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: NativeFreshnessInfo(
            freshness: _freshness,
            fromCache: true,
            cachedAt: DateTime.utc(2026, 9, 4, 15, 30),
          ),
        ),
      ),
    );
    expect(find.textContaining('9.5 00:30 저장'), findsOneWidget);
    expect(find.textContaining('저장된 공식 기록'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  for (final brightness in Brightness.values) {
    testWidgets('B home 390px visual baseline ${brightness.name}', (
      tester,
    ) async {
      await pumpHome(
        tester,
        size: const Size(390, 844),
        brightness: brightness,
      );
      await expectLater(
        find.byKey(const Key('b-home-preview')),
        matchesGoldenFile('goldens/native_home_390_${brightness.name}.png'),
      );
    });
  }
}

const _freshness = SourceFreshness(
  provider: 'UNIQUE_PLAY',
  syncMode: 'MANUAL',
  publishedRevision: 'design-b-fixture',
  publishedAt: null,
  latestSourceUpdatedAt: null,
  checkedAt: null,
  ageSeconds: 0,
  status: 'CURRENT',
);

final _game = PublicGame.fromJson({
  'id': 1,
  'seasonId': 12,
  'seasonYear': 2026,
  'gameDate': '2026-09-06',
  'startTime': '2026-09-06T10:00:00+09:00',
  'groupCode': 'A',
  'status': 'SCHEDULED',
  'homeTeamName': '중앙대학교(서울)',
  'awayTeamName': '한국외국어대학교(글로벌)',
  'venue': '신월야구공원',
  'sourceProvider': 'UNIQUE_PLAY',
  'sourceGameId': 'design-b-example',
  'activeRevision': true,
});
