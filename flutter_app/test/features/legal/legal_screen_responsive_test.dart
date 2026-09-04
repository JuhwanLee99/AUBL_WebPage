import 'package:aubl_flutter_app/core/theme/app_theme.dart';
import 'package:aubl_flutter_app/features/legal/privacy_screen.dart';
import 'package:aubl_flutter_app/features/legal/terms_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Future<void> pumpScreen(
    WidgetTester tester, {
    required Widget screen,
    required Size size,
    required ThemeData theme,
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(MaterialApp(theme: theme, home: screen));
    await tester.pump();
  }

  testWidgets('약관 화면이 360px 다크 테마에서 넘치지 않는다', (tester) async {
    await pumpScreen(
      tester,
      screen: const TermsScreen(),
      size: const Size(360, 800),
      theme: AppTheme.dark,
    );

    expect(find.text('이용약관'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('개인정보 화면이 넓은 화면에서 중앙 정렬된다', (tester) async {
    await pumpScreen(
      tester,
      screen: const PrivacyScreen(),
      size: const Size(1280, 900),
      theme: AppTheme.light,
    );

    final hero = tester.getRect(find.text('PRIVACY POLICY'));
    expect(hero.left, greaterThan(180));
    expect(hero.right, lessThan(1100));
    expect(tester.takeException(), isNull);
  });
}
