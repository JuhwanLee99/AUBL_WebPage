import 'package:flutter/material.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../../core/models/team_notice.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/editor/delta_utils.dart';

class NoticeCard extends StatelessWidget {
  const NoticeCard({super.key, required this.notice, this.onTap});

  final TeamNotice notice;
  final VoidCallback? onTap;

  Color _categoryColor(BuildContext context) => switch (notice.category) {
        '긴급' => context.aublColors.danger,
        '경기' => context.aublColors.cobalt,
        '훈련' => context.aublColors.success,
        _ => context.aublColors.muted,
      };

  Widget _buildAttachmentBadge(
    BuildContext context, {
    required IconData icon,
    required String label,
  }) {
    final colors = context.aublColors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: colors.surfaceMuted,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: colors.muted),
          const SizedBox(width: 3),
          Text(
            label,
            style: TextStyle(
              color: colors.muted,
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
    final colors = context.aublColors;
    final categoryColor = _categoryColor(context);
    final dateTime = DateTime.fromMillisecondsSinceEpoch(notice.createdAt);
    final ago = timeago.format(dateTime, locale: 'ko');
    final attachment = summarizeDeltaAttachments(notice.content);

    return ListTile(
      onTap: onTap,
      leading: notice.pinned
          ? Icon(Icons.push_pin, size: 16, color: colors.warning)
          : null,
      title: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
            margin: const EdgeInsets.only(right: 8),
            decoration: BoxDecoration(
              color: categoryColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              notice.category,
              style: TextStyle(
                color: categoryColor,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Expanded(
            child: Text(
              notice.title,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
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
            style: TextStyle(color: colors.muted, fontSize: 12),
          ),
          if (attachment.hasAny) ...[
            const SizedBox(height: 4),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [
                if (attachment.hasImage)
                  _buildAttachmentBadge(
                    context,
                    icon: Icons.image_outlined,
                    label: '이미지',
                  ),
                if (attachment.hasVideo)
                  _buildAttachmentBadge(
                    context,
                    icon: Icons.videocam_outlined,
                    label: '동영상',
                  ),
                if (attachment.hasLink)
                  _buildAttachmentBadge(
                    context,
                    icon: Icons.link,
                    label: '링크',
                  ),
              ],
            ),
          ],
        ],
      ),
      trailing: Icon(Icons.chevron_right, size: 18, color: colors.muted),
      dense: true,
    );
  }
}
