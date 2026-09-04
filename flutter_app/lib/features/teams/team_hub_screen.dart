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
          .expand((group) => group.standings.map(
                (team) => TeamGroupEntry(
                  name: team.teamName,
                  group: group.groupCode,
                ),
              ))
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

    final colors = context.aublColors;
    return Scaffold(
      appBar: AppBar(title: const Text('팀')),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: SeasonPageHero(
                eyebrow: '2026 SEASON TEAMS',
                title: Text(
                  '팀 디렉터리',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                description: _usingPublishedSeason
                    ? 'A~H조의 공식 시즌 편성과 팀 정보를 확인하세요.'
                    : '저장된 팀 편성을 표시하고 있습니다. 연결되면 공식 편성으로 갱신됩니다.',
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
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
            const SizedBox(height: 10),
            SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: ChoiceChip(
                      label: const Text('전체'),
                      selected: _viewModel.selectedGroup == null,
                      onSelected: (_) => setState(() {
                        _viewModel.setSelectedGroup(null);
                      }),
                    ),
                  ),
                  for (final group in groupLetters)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: ChoiceChip(
                        label: Text('$group조'),
                        selected: _viewModel.selectedGroup == group,
                        onSelected: (_) => setState(() {
                          _viewModel.setSelectedGroup(group);
                        }),
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
              child: Row(
                children: [
                  Text(
                    _loading ? '팀 정보를 불러오는 중' : '${filtered.length}개 팀',
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: colors.muted),
                  ),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: () => setState(_viewModel.toggleSortMode),
                    icon: const Icon(Icons.sort_rounded, size: 18),
                    label: Text(
                      _viewModel.sortMode == TeamHubSortMode.group
                          ? '조별 정렬'
                          : '이름순 정렬',
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : filtered.isEmpty
                      ? const Padding(
                          padding: EdgeInsets.all(16),
                          child: SeasonStatePanel(
                            icon: Icons.search_off_rounded,
                            title: '검색 결과가 없습니다',
                            message: '다른 팀명이나 조를 선택해 보세요.',
                          ),
                        )
                      : GridView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 4, 16, 104),
                          gridDelegate:
                              const SliverGridDelegateWithMaxCrossAxisExtent(
                            maxCrossAxisExtent: 360,
                            mainAxisExtent: 108,
                            mainAxisSpacing: 12,
                            crossAxisSpacing: 12,
                          ),
                          itemCount: filtered.length,
                          itemBuilder: (context, index) {
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
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }
}
