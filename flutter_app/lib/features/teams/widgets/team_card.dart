import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/services/team_image_cache_manager.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/season_components.dart';

class TeamCard extends StatelessWidget {
  const TeamCard({
    super.key,
    required this.name,
    required this.group,
    this.emblemUrl,
    this.onTap,
  });

  final String name;
  final String group;
  final String? emblemUrl;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final hasEmblem = emblemUrl != null && emblemUrl!.trim().isNotEmpty;
    return Semantics(
      button: onTap != null,
      label: '$group조 $name 팀 상세',
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 76,
                  height: 76,
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: colors.surfaceMuted,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: colors.line),
                  ),
                  child: hasEmblem
                      ? CachedNetworkImage(
                          imageUrl: emblemUrl!,
                          cacheManager: TeamImageCacheManager.instance,
                          fit: BoxFit.contain,
                          fadeInDuration: const Duration(milliseconds: 150),
                          placeholder: (_, __) => Center(
                            child: SizedBox.square(
                              dimension: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: colors.cobalt,
                              ),
                            ),
                          ),
                          errorWidget: (_, __, ___) => _TeamInitial(name: name),
                        )
                      : _TeamInitial(name: name),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SeasonStatusBadge(
                        label: '$group조',
                        tone: SeasonBadgeTone.blue,
                      ),
                      const SizedBox(height: 9),
                      Text(
                        name,
                        style: Theme.of(context).textTheme.titleMedium,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: colors.muted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TeamInitial extends StatelessWidget {
  const _TeamInitial({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final initial = name.trim().isEmpty ? 'A' : name.trim().characters.first;
    return Center(
      child: Text(
        initial,
        style: TextStyle(
          color: colors.navy,
          fontFamily: 'BarlowCondensed',
          fontSize: 30,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}
