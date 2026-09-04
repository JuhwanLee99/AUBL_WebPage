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
    _ => context.aublColors.navy,
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
        borderRadius: BorderRadius.circular(3),
        border: Border.all(color: colors.line),
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

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Material(
        color: colors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(4),
          side: BorderSide(color: colors.line),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          borderRadius: BorderRadius.circular(4),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (notice.pinned) ...[
                  Icon(Icons.push_pin_outlined, size: 16, color: colors.navy),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: categoryColor.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(3),
                              border: Border.all(
                                color: categoryColor.withValues(alpha: 0.45),
                              ),
                            ),
                            child: Text(
                              notice.category,
                              style: TextStyle(
                                color: categoryColor,
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          Text(
                            ago,
                            style: TextStyle(color: colors.muted, fontSize: 12),
                          ),
                        ],
                      ),
                      const SizedBox(height: 7),
                      Text(
                        notice.title,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (attachment.hasAny) ...[
                        const SizedBox(height: 7),
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
                ),
                const SizedBox(width: 8),
                Icon(
                  Icons.arrow_forward_rounded,
                  size: 18,
                  color: colors.muted,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
