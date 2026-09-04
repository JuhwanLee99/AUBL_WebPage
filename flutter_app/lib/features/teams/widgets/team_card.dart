import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/services/team_image_cache_manager.dart';
import '../../../core/theme/app_theme.dart';

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
          child: Row(
            children: [
              SizedBox(
                width: 106,
                height: double.infinity,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: colors.surfaceMuted,
                    border: Border(right: BorderSide(color: colors.line)),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
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
                            errorWidget: (_, __, ___) =>
                                _TeamInitial(name: name),
                          )
                        : _TeamInitial(name: name),
                  ),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '$group GROUP',
                        style: TextStyle(
                          color: colors.cobalt,
                          fontFamily: 'BarlowCondensed',
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.1,
                        ),
                      ),
                      const SizedBox(height: 7),
                      Text(
                        name,
                        style: Theme.of(context).textTheme.titleMedium,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: Icon(
                  Icons.arrow_forward_rounded,
                  size: 18,
                  color: colors.muted,
                ),
              ),
            ],
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
          fontSize: 34,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}
