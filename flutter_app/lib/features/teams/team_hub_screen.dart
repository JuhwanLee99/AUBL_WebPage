import 'package:flutter/material.dart';

import '../../core/data/team_groups.dart';
import '../../core/services/backend_api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/season_components.dart';
import 'team_detail_screen.dart';
import 'team_hub_view_model.dart';
import 'widgets/team_card.dart';

class TeamHubScreen extends StatefulWidget {
  const TeamHubScreen({super.key});

  @override
  State<TeamHubScreen> createState() => _TeamHubScreenState();
}

class _TeamHubScreenState extends State<TeamHubScreen> {
  final _viewModel = TeamHubViewModel();
  final _api = BackendApiService();
  bool _loading = true;
  bool _usingPublishedSeason = false;

  @override
  void initState() {
    super.initState();
    _loadInitialData();
  }

  Future<void> _loadInitialData() async {
    await Future.wait<void>([
      _viewModel.loadEmblems(),
      _loadPublishedSeasonTeams(),
    ]);
    if (!mounted) return;
    setState(() => _loading = false);
  }

  Future<void> _loadPublishedSeasonTeams() async {
    try {
      final seasons = await _api.getSeasons();
      if (seasons.isEmpty) return;
      final overview = await _api.getSeasonOverview(seasons.first.id);
      final entries = overview.groups
          .expand(
            (group) => group.standings.map(
              (team) =>
                  TeamGroupEntry(name: team.teamName, group: group.groupCode),
            ),
          )
          .toList(growable: false);
      if (entries.isEmpty) return;
      _viewModel.setSeasonTeams(entries);
      _usingPublishedSeason = true;
    } catch (_) {
      // 과거 정적 편성은 API 장애·구시즌을 위한 제한적 fallback이다.
    }
  }

  @override
  void dispose() {
    _api.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _viewModel.filteredTeams();

    final textScale = MediaQuery.textScalerOf(context).scale(1);
    final cardExtent = textScale >= 1.6
        ? 160.0
        : textScale >= 1.3
        ? 132.0
        : 112.0;
    return Scaffold(
      appBar: AppBar(title: const Text('팀')),
      body: SafeArea(
        top: false,
        child: LayoutBuilder(
          builder: (context, constraints) {
            return Align(
              alignment: Alignment.topCenter,
              child: SizedBox(
                width: constraints.maxWidth > 1180
                    ? 1180
                    : constraints.maxWidth,
                height: constraints.maxHeight,
                child: CustomScrollView(
                  slivers: [
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                      sliver: SliverToBoxAdapter(
                        child: SeasonPageHero(
                          eyebrow: '2026 SEASON TEAMS',
                          title: const Text('팀 디렉터리'),
                          description: _usingPublishedSeason
                              ? 'A~H조의 공식 시즌 편성과 팀 정보를 확인하세요.'
                              : '저장된 팀 편성을 표시하고 있습니다. 연결되면 공식 편성으로 갱신됩니다.',
                        ),
                      ),
                    ),
                    SliverPadding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      sliver: SliverToBoxAdapter(
                        child: TextField(
                          decoration: const InputDecoration(
                            hintText: '팀명 검색',
                            prefixIcon: Icon(Icons.search_rounded),
                          ),
                          textInputAction: TextInputAction.search,
                          onChanged: (value) => setState(() {
                            _viewModel.setSearchQuery(value);
                          }),
                        ),
                      ),
                    ),
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
                      sliver: SliverToBoxAdapter(
                        child: _TeamGroupSelector(
                          selectedGroup: _viewModel.selectedGroup,
                          onSelected: (group) => setState(() {
                            _viewModel.setSelectedGroup(group);
                          }),
                        ),
                      ),
                    ),
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
                      sliver: SliverToBoxAdapter(
                        child: _TeamDirectorySummary(
                          label: _loading
                              ? '팀 정보를 불러오는 중'
                              : '${filtered.length}개 팀',
                          sortLabel:
                              _viewModel.sortMode == TeamHubSortMode.group
                              ? '조별 정렬'
                              : '이름순 정렬',
                          onSort: () => setState(_viewModel.toggleSortMode),
                        ),
                      ),
                    ),
                    if (_loading)
                      const SliverFillRemaining(
                        hasScrollBody: false,
                        child: Center(child: CircularProgressIndicator()),
                      )
                    else if (filtered.isEmpty)
                      const SliverPadding(
                        padding: EdgeInsets.all(16),
                        sliver: SliverToBoxAdapter(
                          child: SeasonStatePanel(
                            icon: Icons.search_off_rounded,
                            title: '검색 결과가 없습니다',
                            message: '다른 팀명이나 조를 선택해 보세요.',
                          ),
                        ),
                      )
                    else
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(12, 4, 12, 104),
                        sliver: SliverGrid(
                          gridDelegate:
                              SliverGridDelegateWithMaxCrossAxisExtent(
                                maxCrossAxisExtent: 380,
                                mainAxisExtent: cardExtent,
                                mainAxisSpacing: 12,
                                crossAxisSpacing: 12,
                              ),
                          delegate: SliverChildBuilderDelegate((
                            context,
                            index,
                          ) {
                            final entry = filtered[index];
                            final teamId = _viewModel.encodeTeamId(entry.name);
                            return TeamCard(
                              name: entry.name,
                              group: entry.group,
                              emblemUrl: _viewModel.emblemByTeamId[teamId],
                              onTap: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute<void>(
                                    builder: (_) => TeamDetailScreen(
                                      teamId: teamId,
                                      teamName: entry.name,
                                      groupCode: entry.group,
                                    ),
                                  ),
                                );
                              },
                            );
                          }, childCount: filtered.length),
                        ),
                      ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _TeamDirectorySummary extends StatelessWidget {
  const _TeamDirectorySummary({
    required this.label,
    required this.sortLabel,
    required this.onSort,
  });

  final String label;
  final String sortLabel;
  final VoidCallback onSort;

  @override
  Widget build(BuildContext context) {
    final labelWidget = Text(
      label,
      style: Theme.of(context).textTheme.bodySmall,
    );
    final sortButton = TextButton.icon(
      onPressed: onSort,
      icon: const Icon(Icons.sort_rounded, size: 18),
      label: Text(sortLabel),
    );
    if (MediaQuery.textScalerOf(context).scale(1) >= 1.5) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [labelWidget, sortButton],
      );
    }
    return Row(
      children: [
        Expanded(child: labelWidget),
        const SizedBox(width: 8),
        sortButton,
      ],
    );
  }
}

class _TeamGroupSelector extends StatelessWidget {
  const _TeamGroupSelector({
    required this.selectedGroup,
    required this.onSelected,
  });

  final String? selectedGroup;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final options = <String?>[null, ...groupLetters];
    final textScale = MediaQuery.textScalerOf(context).scale(1);
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 780
            ? 9
            : constraints.maxWidth >= 520
            ? 5
            : 3;
        final itemHeight = textScale >= 1.6 ? 56.0 : 44.0;
        final rows = (options.length / columns).ceil();
        return SizedBox(
          height: rows * itemHeight + (rows - 1) * 6,
          child: GridView.builder(
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: columns,
              mainAxisExtent: itemHeight,
              mainAxisSpacing: 6,
              crossAxisSpacing: 6,
            ),
            itemCount: options.length,
            itemBuilder: (context, index) {
              final group = options[index];
              final selected = group == selectedGroup;
              final selectedFill =
                  Theme.of(context).brightness == Brightness.dark
                  ? const Color(0xFF285FA9)
                  : AppTheme.navy900;
              return Semantics(
                button: true,
                selected: selected,
                label: group == null ? '전체 팀 보기' : '$group조 팀 보기',
                child: Material(
                  color: selected ? selectedFill : colors.surface,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(4),
                    side: BorderSide(
                      color: selected ? selectedFill : colors.line,
                    ),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => onSelected(group),
                    child: Center(
                      child: Text(
                        group == null ? '전체' : '$group조',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.labelLarge?.copyWith(
                          color: selected ? Colors.white : colors.ink,
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }
}
