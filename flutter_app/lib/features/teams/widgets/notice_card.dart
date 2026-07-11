import 'package:flutter/material.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../../core/models/team_notice.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/editor/delta_utils.dart';

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

  Widget _buildAttachmentBadge({
    required IconData icon,
    required String label,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppTheme.slate700.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: AppTheme.slate400),
          const SizedBox(width: 3),
          Text(
            label,
            style: const TextStyle(
              color: AppTheme.slate400,
              fontSize: 10,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final dateTime = DateTime.fromMillisecondsSinceEpoch(notice.createdAt);
    final ago = timeago.format(dateTime, locale: 'ko');
    final attachment = summarizeDeltaAttachments(notice.content);

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
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            ago,
            style: const TextStyle(color: AppTheme.slate500, fontSize: 12),
          ),
          if (attachment.hasAny) ...[
            const SizedBox(height: 4),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [
                if (attachment.hasImage)
                  _buildAttachmentBadge(
                    icon: Icons.image_outlined,
                    label: '이미지',
                  ),
                if (attachment.hasVideo)
                  _buildAttachmentBadge(
                    icon: Icons.videocam_outlined,
                    label: '동영상',
                  ),
                if (attachment.hasLink)
                  _buildAttachmentBadge(
                    icon: Icons.link,
                    label: '링크',
                  ),
              ],
            ),
          ],
        ],
      ),
      trailing: const Icon(Icons.chevron_right,
          size: 18, color: AppTheme.slate500),
      dense: true,
    );
  }
}
