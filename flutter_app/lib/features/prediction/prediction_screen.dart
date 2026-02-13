import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

class PredictionScreen extends StatelessWidget {
  const PredictionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('승부예측')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.analytics_outlined,
                  size: 64, color: AppTheme.blue400),
              const SizedBox(height: 24),
              const Text(
                '승부예측 랩',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'AUBL의 경기 결과를 예측하는 AI 모델을 준비 중입니다.\n'
                '팀 전력 분석, 라인업 예측, 실시간 승률 업데이트 등\n'
                '다양한 기능을 곧 만나보실 수 있습니다.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppTheme.slate400, fontSize: 14),
              ),
              const SizedBox(height: 32),

              // 준비 과정
              ...['데이터 수집 및 정제', '예측 모델 개발', 'UI/UX 설계', '베타 테스트']
                  .asMap()
                  .entries
                  .map((e) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Row(
                          children: [
                            Container(
                              width: 28,
                              height: 28,
                              decoration: BoxDecoration(
                                color: AppTheme.blue500.withValues(alpha: 0.15),
                                shape: BoxShape.circle,
                              ),
                              child: Center(
                                child: Text(
                                  '${e.key + 1}',
                                  style: const TextStyle(
                                      color: AppTheme.blue400,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600),
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Text(e.value,
                                style: const TextStyle(
                                    color: AppTheme.slate300, fontSize: 14)),
                          ],
                        ),
                      )),
            ],
          ),
        ),
      ),
    );
  }
}
