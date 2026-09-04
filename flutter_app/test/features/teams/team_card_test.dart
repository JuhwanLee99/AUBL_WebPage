import 'package:aubl_flutter_app/core/theme/app_theme.dart';
import 'package:aubl_flutter_app/features/teams/widgets/team_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget buildCard({
    required ThemeData theme,
    double textScale = 1,
    VoidCallback? onTap,
  }) {
    return MaterialApp(
      theme: theme,
      home: MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
        child: Scaffold(
          body: Center(
            child: SizedBox(
              width: 360,
              height: textScale >= 1.6 ? 160 : 112,
              child: TeamCard(name: '중앙대학교(서울)', group: 'A', onTap: onTap),
            ),
          ),
        ),
      ),
    );
  }

  testWidgets('팀 카드가 라이트·다크 테마에서 내용을 유지한다', (tester) async {
    for (final theme in [AppTheme.light, AppTheme.dark]) {
      await tester.pumpWidget(buildCard(theme: theme));
      await tester.pump();

      expect(find.text('A GROUP'), findsOneWidget);
      expect(find.text('중앙대학교(서울)'), findsOneWidget);
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets('팀 카드는 큰 글자와 터치 동작을 지원한다', (tester) async {
    var tapped = false;
    await tester.pumpWidget(
      buildCard(
        theme: AppTheme.light,
        textScale: 2,
        onTap: () => tapped = true,
      ),
    );
    await tester.pump();

    await tester.tap(find.byType(TeamCard));
    expect(tapped, isTrue);
    expect(tester.takeException(), isNull);
  });
}
