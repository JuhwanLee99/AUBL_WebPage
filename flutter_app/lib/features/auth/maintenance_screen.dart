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
      backgroundColor: context.aublColors.canvas,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('🔧', style: TextStyle(fontSize: 56)),
                const SizedBox(height: 24),
                Text(
                  '서비스 점검 중',
                  style: TextStyle(
                    color: context.aublColors.ink,
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  message.replaceAll(r'\n', '\n'),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: context.aublColors.muted,
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
                      color: context.aublColors.surface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: context.aublColors.line),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.schedule_rounded,
                          color: context.aublColors.muted,
                          size: 16,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '서비스 재개 예정: $resumeDate',
                          style: TextStyle(
                            color: context.aublColors.ink,
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
