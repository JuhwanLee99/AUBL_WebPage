import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class MatchStatusBadge extends StatelessWidget {
  const MatchStatusBadge({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      'inProgress' => ('LIVE', AppTheme.red500),
      'completed' => ('종료', AppTheme.slate500),
      'canceled' => ('취소', AppTheme.slate600),
      'scheduled' => ('예정', AppTheme.blue500),
      _ => (status, AppTheme.slate500),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
