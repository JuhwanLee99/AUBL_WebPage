import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../auth/login_webview_screen.dart';

class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key, required this.onComplete});

  final VoidCallback onComplete;

  Future<void> _handleLogin(BuildContext context) async {
    await Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => const LoginWebViewScreen()));
    onComplete();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final horizontalPadding = constraints.maxWidth < 420 ? 24.0 : 36.0;
            return SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                horizontalPadding,
                28,
                horizontalPadding,
                28,
              ),
              child: Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxWidth: 520,
                    minHeight: (constraints.maxHeight - 56).clamp(
                      0,
                      double.infinity,
                    ),
                  ),
                  child: IntrinsicHeight(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Spacer(),
                        Semantics(
                          label: 'AUBL 전국대학아마추어야구연합회',
                          image: true,
                          child: Center(
                            child: Image.asset(
                              'assets/images/aubl_clean.png',
                              width: 116,
                              height: 72,
                              fit: BoxFit.contain,
                              color:
                                  Theme.of(context).brightness ==
                                      Brightness.dark
                                  ? colors.ink
                                  : null,
                              colorBlendMode: BlendMode.srcIn,
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'AUBL',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: colors.navyStrong,
                            fontFamily: 'BarlowCondensed',
                            fontSize: 36,
                            fontWeight: FontWeight.w900,
                            height: 1,
                            letterSpacing: 1.2,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '전국대학아마추어야구연합회',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: colors.muted,
                                fontWeight: FontWeight.w700,
                              ),
                        ),
                        const SizedBox(height: 20),
                        Text(
                          '경기 일정, 기록, 문자중계를\n한곳에서 확인하세요',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(color: colors.ink, height: 1.45),
                        ),
                        const Spacer(),
                        const SizedBox(height: 24),
                        FilledButton(
                          onPressed: () => _handleLogin(context),
                          style: FilledButton.styleFrom(
                            minimumSize: const Size.fromHeight(52),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 18,
                              vertical: 14,
                            ),
                          ),
                          child: const Text('로그인 / 회원가입'),
                        ),
                        const SizedBox(height: 10),
                        OutlinedButton(
                          onPressed: onComplete,
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size.fromHeight(52),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 18,
                              vertical: 14,
                            ),
                            foregroundColor: colors.navy,
                            side: BorderSide(color: colors.lineStrong),
                          ),
                          child: const Text('로그인 없이 둘러보기'),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          '2026 시즌 · 우리의 청춘은 이번에도 PLAY BALL',
                          textAlign: TextAlign.center,
                          style: Theme.of(
                            context,
                          ).textTheme.bodySmall?.copyWith(color: colors.muted),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
