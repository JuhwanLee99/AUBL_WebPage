import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/season_components.dart';

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
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(12, 24, 12, 32),
          child: Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SeasonPageHero(
                    eyebrow: 'SYSTEM NOTICE',
                    title: const Text('서비스 점검 중'),
                    description: message.replaceAll(r'\n', '\n'),
                    leading: Icon(
                      Icons.build_circle_outlined,
                      color: context.aublColors.cobalt,
                      size: 34,
                    ),
                  ),
                  if (resumeDate.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    SeasonSectionPanel(
                      eyebrow: 'SCHEDULE',
                      title: '서비스 재개 예정',
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            Icons.schedule_rounded,
                            color: context.aublColors.cobalt,
                            size: 20,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              resumeDate,
                              style: Theme.of(context).textTheme.titleMedium,
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
      ),
    );
  }
}
