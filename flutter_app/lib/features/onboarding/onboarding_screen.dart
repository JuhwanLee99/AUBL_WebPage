import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/season_campaign_hero.dart';
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
    return Scaffold(
      backgroundColor: context.aublColors.canvas,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 28),
            child: Align(
              alignment: Alignment.topCenter,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 960),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      label: 'AUBL 전국대학아마추어야구연합회',
                      image: true,
                      child: Image.asset(
                        'assets/images/aubl_clean.png',
                        width: 46,
                        height: 38,
                        fit: BoxFit.contain,
                      ),
                    ),
                    const SizedBox(height: 12),
                    SeasonCampaignHero(
                      topline: '전국대학아마추어야구연합회 · SINCE 1981',
                      lead: '우리의 청춘은 이번에도',
                      emphasis: 'PLAY BALL',
                      description:
                          '경기 일정과 결과, 조별 현황, 선수 기록과 문자중계를 하나의 앱에서 확인하세요.',
                      subcopy: '2026 연합회교 중앙대학교(서울)와 함께하는 제46회 AUBL 시즌입니다.',
                      primaryActionLabel: '로그인 / 회원가입',
                      onPrimaryAction: () => _handleLogin(context),
                      secondaryActionLabel: '로그인 없이 둘러보기',
                      onSecondaryAction: onComplete,
                      facts: const [
                        SeasonHeroFact(
                          label: 'GAMES',
                          value: '일정 · 결과 · 라이브',
                          description: '공식 시즌 경기 흐름을 한눈에 확인',
                        ),
                        SeasonHeroFact(
                          label: 'RECORDS',
                          value: '조별 · 타자 · 투수',
                          description: '게시된 UniquePlay 기록을 기준으로 제공',
                        ),
                        SeasonHeroFact(
                          label: 'COMMUNITY',
                          value: '공지 · 팀 · 커뮤니티',
                          description: '연합회와 소속 팀의 소식을 빠르게 전달',
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
