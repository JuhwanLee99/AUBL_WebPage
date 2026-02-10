import 'package:flutter/material.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../../core/models/team_notice.dart';
import '../../../core/theme/app_theme.dart';

class NoticeCard extends StatelessWidget {
  const NoticeCard({super.key, required this.notice, this.onTap});

  final TeamNotice notice;
  final VoidCallback? onTap;

  Color get _categoryColor => switch (notice.category) {
        '긴급' => AppTheme.red500,
        '경기' => AppTheme.blue500,
        '훈련' => AppTheme.green500,
        _ => AppTheme.slate500,
      };

  @override
  Widget build(BuildContext context) {
    final dateTime =
        DateTime.fromMillisecondsSinceEpoch(notice.createdAt);
    final ago = timeago.format(dateTime, locale: 'ko');

    return ListTile(
      onTap: onTap,
      leading: notice.pinned
          ? const Icon(Icons.push_pin, size: 16, color: AppTheme.amber400)
          : null,
      title: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
            margin: const EdgeInsets.only(right: 8),
            decoration: BoxDecoration(
              color: _categoryColor.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              notice.category,
              style: TextStyle(
                color: _categoryColor,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Expanded(
            child: Text(
              notice.title,
              style: const TextStyle(color: Colors.white, fontSize: 14),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
      subtitle: Text(
        ago,
        style: const TextStyle(color: AppTheme.slate500, fontSize: 12),
      ),
      trailing: const Icon(Icons.chevron_right,
          size: 18, color: AppTheme.slate500),
      dense: true,
    );
  }
}
