import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../auth/login_webview_screen.dart';

class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key, required this.onComplete});

  final VoidCallback onComplete;

  Future<void> _handleLogin(BuildContext context) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const LoginWebViewScreen()),
    );
    onComplete();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.aublColors.canvas,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            children: [
              const Spacer(flex: 3),
              Image.asset(
                'assets/images/aubl_clean.png',
                width: 200,
                fit: BoxFit.contain,
              ),
              const SizedBox(height: 24),
              Text(
                'AUBL',
                style: TextStyle(
                  color: context.aublColors.navyStrong,
                  fontFamily: 'BarlowCondensed',
                  fontSize: 32,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 2,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '전국대학아마추어야구연합회',
                style: TextStyle(
                  color: context.aublColors.muted,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 20),
              Text(
                '경기 일정, 기록, 문자중계를\n한곳에서 확인하세요',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: context.aublColors.ink,
                  fontSize: 16,
                  height: 1.5,
                ),
              ),
              const Spacer(flex: 4),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: () => _handleLogin(context),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: context.aublColors.cobalt,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    textStyle: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  child: const Text('로그인 / 회원가입'),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: TextButton(
                  onPressed: onComplete,
                  style: TextButton.styleFrom(
                    foregroundColor: context.aublColors.muted,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(
                        color: context.aublColors.line.withValues(alpha: 0.5),
                      ),
                    ),
                    textStyle: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  child: const Text('그냥 사용하기'),
                ),
              ),
              const SizedBox(height: 48),
            ],
          ),
        ),
      ),
    );
  }
}
