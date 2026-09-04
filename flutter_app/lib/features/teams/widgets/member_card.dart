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
    final colors = context.aublColors;
    final roleLabel = switch (member.role) {
      'coach' => '감독',
      'staff' => '스태프',
      _ => '선수',
    };

    return ListTile(
      leading: CircleAvatar(
        backgroundColor: colors.surfaceMuted,
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
                style:
                    TextStyle(color: colors.navy, fontWeight: FontWeight.w800),
              )
            : null,
      ),
      title: Row(
        children: [
          Text(
            member.name,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
          ),
          if (member.number != null) ...[
            const SizedBox(width: 6),
            Text(
              '#${member.number}',
              style: TextStyle(color: colors.muted, fontSize: 12),
            ),
          ],
        ],
      ),
      subtitle: Row(
        children: [
          Text(roleLabel, style: TextStyle(color: colors.muted, fontSize: 12)),
          if (member.position != null && member.position!.isNotEmpty) ...[
            Text(' · ', style: TextStyle(color: colors.muted, fontSize: 12)),
            Text(member.position!,
                style: TextStyle(color: colors.muted, fontSize: 12)),
          ],
          if (member.bats != null) ...[
            Text(' · ', style: TextStyle(color: colors.muted, fontSize: 12)),
            Text('타:${member.bats}',
                style: TextStyle(color: colors.muted, fontSize: 11)),
          ],
          if (member.throws_ != null) ...[
            Text(' 투:${member.throws_}',
                style: TextStyle(color: colors.muted, fontSize: 11)),
          ],
        ],
      ),
      dense: true,
    );
  }
}
