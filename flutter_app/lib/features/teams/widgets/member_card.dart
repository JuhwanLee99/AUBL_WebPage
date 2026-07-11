import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/models/team_member.dart';
import '../../../core/services/team_image_cache_manager.dart';
import '../../../core/theme/app_theme.dart';

class MemberCard extends StatelessWidget {
  const MemberCard({super.key, required this.member});

  final TeamMember member;

  @override
  Widget build(BuildContext context) {
    final roleLabel = switch (member.role) {
      'coach' => '감독',
      'staff' => '스태프',
      _ => '선수',
    };

    return ListTile(
      leading: CircleAvatar(
        backgroundColor: AppTheme.slate700,
        backgroundImage:
            member.profileImageUrl != null && member.profileImageUrl!.isNotEmpty
                ? CachedNetworkImageProvider(
                    member.profileImageUrl!,
                    cacheManager: TeamImageCacheManager.instance,
                  )
                : null,
        child: member.profileImageUrl == null || member.profileImageUrl!.isEmpty
            ? Text(
                member.name.isNotEmpty ? member.name[0] : '?',
                style: const TextStyle(color: Colors.white),
              )
            : null,
      ),
      title: Row(
        children: [
          Text(
            member.name,
            style: const TextStyle(color: Colors.white, fontSize: 14),
          ),
          if (member.number != null) ...[
            const SizedBox(width: 6),
            Text(
              '#${member.number}',
              style: const TextStyle(color: AppTheme.slate400, fontSize: 12),
            ),
          ],
        ],
      ),
      subtitle: Row(
        children: [
          Text(roleLabel,
              style: const TextStyle(color: AppTheme.slate400, fontSize: 12)),
          if (member.position != null && member.position!.isNotEmpty) ...[
            const Text(' · ',
                style: TextStyle(color: AppTheme.slate500, fontSize: 12)),
            Text(member.position!,
                style: const TextStyle(color: AppTheme.slate400, fontSize: 12)),
          ],
          if (member.bats != null) ...[
            const Text(' · ',
                style: TextStyle(color: AppTheme.slate500, fontSize: 12)),
            Text('타:${member.bats}',
                style: const TextStyle(color: AppTheme.slate500, fontSize: 11)),
          ],
          if (member.throws_ != null) ...[
            Text(' 투:${member.throws_}',
                style: const TextStyle(color: AppTheme.slate500, fontSize: 11)),
          ],
        ],
      ),
      dense: true,
    );
  }
}
