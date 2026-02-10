import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class TeamCard extends StatelessWidget {
  const TeamCard({
    super.key,
    required this.name,
    required this.group,
    required this.color,
    this.emblemUrl,
    this.onTap,
  });

  final String name;
  final String group;
  final Color color;
  final String? emblemUrl;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTheme.slate800.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.slate700, width: 0.5),
        ),
        child: Stack(
          children: [
            if (emblemUrl != null && emblemUrl!.isNotEmpty)
              Positioned.fill(
                child: Opacity(
                  opacity: 0.32,
                  child: Center(
                    child: Image.network(
                      emblemUrl!,
                      fit: BoxFit.contain,
                      alignment: Alignment.center,
                      errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                    ),
                  ),
                ),
              ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // 조 배지
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    '$group조',
                    style: TextStyle(
                      color: color,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                // 팀명
                Text(
                  name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
