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

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: colors.line),
      ),
      child: ListTile(
        minTileHeight: 68,
        leading: Container(
          width: 44,
          height: 44,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: colors.surfaceMuted,
            borderRadius: BorderRadius.circular(3),
            border: Border.all(color: colors.line),
            image:
                member.profileImageUrl != null &&
                    member.profileImageUrl!.isNotEmpty
                ? DecorationImage(
                    image: CachedNetworkImageProvider(
                      member.profileImageUrl!,
                      cacheManager: TeamImageCacheManager.instance,
                    ),
                    fit: BoxFit.cover,
                  )
                : null,
          ),
          child:
              member.profileImageUrl == null || member.profileImageUrl!.isEmpty
              ? Center(
                  child: Text(
                    member.name.isNotEmpty ? member.name[0] : '?',
                    style: TextStyle(
                      color: colors.navy,
                      fontFamily: 'BarlowCondensed',
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                )
              : null,
        ),
        title: Wrap(
          spacing: 6,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(
              member.name,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
            ),
            if (member.number != null)
              Text(
                '#${member.number}',
                style: TextStyle(color: colors.cobalt, fontSize: 12),
              ),
          ],
        ),
        subtitle: Text(
          [
            roleLabel,
            if (member.position != null && member.position!.isNotEmpty)
              member.position!,
            if (member.bats != null) '타:${member.bats}',
            if (member.throws_ != null) '투:${member.throws_}',
          ].join(' · '),
          style: TextStyle(color: colors.muted, fontSize: 12),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        dense: true,
      ),
    );
  }
}
