import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class ErrorBanner extends StatelessWidget {
  const ErrorBanner({super.key, required this.message, this.onDismiss});

  final String message;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.danger.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(4),
        border: Border(
          top: BorderSide(color: colors.line),
          right: BorderSide(color: colors.line),
          bottom: BorderSide(color: colors.line),
          left: BorderSide(color: colors.danger, width: 3),
        ),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: colors.danger, size: 19),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              message,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: colors.danger,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          if (onDismiss != null)
            IconButton(
              tooltip: '알림 닫기',
              onPressed: onDismiss,
              icon: Icon(Icons.close, color: colors.danger, size: 18),
            ),
        ],
      ),
    );
  }
}
