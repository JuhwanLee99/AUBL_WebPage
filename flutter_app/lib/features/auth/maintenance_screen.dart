import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

class MaintenanceScreen extends StatelessWidget {
  const MaintenanceScreen({
    super.key,
    required this.resumeDate,
    required this.message,
  });

  final String resumeDate;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.slate900,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('🔧', style: TextStyle(fontSize: 56)),
                const SizedBox(height: 24),
                const Text(
                  '서비스 점검 중',
                  style: TextStyle(
                    color: AppTheme.slate200,
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  message.replaceAll(r'\n', '\n'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: AppTheme.slate400,
                    fontSize: 14,
                    height: 1.7,
                  ),
                ),
                if (resumeDate.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: AppTheme.slate800,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppTheme.slate700),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.schedule_rounded,
                          color: AppTheme.slate400,
                          size: 16,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '서비스 재개 예정: $resumeDate',
                          style: const TextStyle(
                            color: AppTheme.slate300,
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
