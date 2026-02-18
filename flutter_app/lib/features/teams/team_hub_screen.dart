import 'package:flutter/material.dart';

import '../../core/data/team_groups.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/background_logo.dart';
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

  @override
  void initState() {
    super.initState();
    _loadInitialData();
  }

  Future<void> _loadInitialData() async {
    await _viewModel.loadEmblems();
    if (!mounted) return;
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _viewModel.filteredTeams();

    return Scaffold(
      appBar: AppBar(title: const Text('팀')),
      body: Stack(
        children: [
          const BackgroundLogo(),
          Column(
            children: [
              // ── 검색바 ──
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: TextField(
                  decoration: const InputDecoration(
                    hintText: '팀명 검색...',
                    prefixIcon: Icon(Icons.search),
                  ),
                  onChanged: (value) => setState(() {
                    _viewModel.setSearchQuery(value);
                  }),
                ),
              ),

              // ── 조 필터 ──
              SizedBox(
                height: 40,
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
                    for (final g in groupLetters)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: ChoiceChip(
                          label: Text(
                            '$g조',
                            style: TextStyle(
                              color: _viewModel.selectedGroup == g
                                  ? Colors.white
                                  : groupColors[g],
                            ),
                          ),
                          selected: _viewModel.selectedGroup == g,
                          selectedColor: groupColors[g],
                          onSelected: (_) => setState(() {
                            _viewModel.setSelectedGroup(g);
                          }),
                        ),
                      ),
                  ],
                ),
              ),

              // ── 팀 수 + 정렬 ──
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                child: Row(
                  children: [
                    Text(
                      '${filtered.length}개 팀',
                      style: const TextStyle(
                          color: AppTheme.slate400, fontSize: 13),
                    ),
                    const Spacer(),
                    GestureDetector(
                      onTap: () => setState(() {
                        _viewModel.toggleSortMode();
                      }),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.sort,
                              size: 14, color: AppTheme.slate500),
                          const SizedBox(width: 4),
                          Text(
                            _viewModel.sortMode == TeamHubSortMode.group
                                ? '조별'
                                : '이름순',
                            style: const TextStyle(
                                color: AppTheme.slate500, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              // ── 팀 그리드 ──
              Expanded(
                child: GridView.builder(
                  padding: const EdgeInsets.all(12),
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 220,
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    childAspectRatio: 1.6,
                  ),
                  itemCount: filtered.length,
                  itemBuilder: (context, i) {
                    final entry = filtered[i];
                    final teamId = _viewModel.encodeTeamId(entry.name);
                    return TeamCard(
                      name: entry.name,
                      group: entry.group,
                      color: groupColors[entry.group] ?? AppTheme.blue400,
                      emblemUrl: _viewModel.emblemByTeamId[teamId],
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => TeamDetailScreen(
                              teamId: teamId,
                              teamName: entry.name,
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
        ],
      ),
    );
  }
}
