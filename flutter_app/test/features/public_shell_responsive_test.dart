import 'package:aubl_flutter_app/core/theme/app_theme.dart';
import 'package:aubl_flutter_app/features/auth/maintenance_screen.dart';
import 'package:aubl_flutter_app/features/onboarding/onboarding_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('onboarding keeps the campaign hero usable at 360px and 200%', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(360, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(2)),
          child: child!,
        ),
        home: OnboardingScreen(onComplete: () {}),
      ),
    );
    await tester.pump();

    expect(find.text('PLAY BALL'), findsOneWidget);
    expect(find.text('로그인 / 회원가입'), findsOneWidget);
    expect(find.text('로그인 없이 둘러보기'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('maintenance notice fits a compact dark screen at 200%', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(360, 720));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(2)),
          child: child!,
        ),
        home: const MaintenanceScreen(
          resumeDate: '2026-09-06 09:00 KST',
          message: '더 안정적인 서비스를 위해 점검하고 있습니다.',
        ),
      ),
    );
    await tester.pump();

    expect(find.text('서비스 점검 중'), findsOneWidget);
    expect(find.text('2026-09-06 09:00 KST'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
