import 'package:flutter/material.dart';

import '../../core/data/team_groups.dart';
import '../../core/theme/app_theme.dart';
import 'team_detail_screen.dart';
import 'widgets/team_card.dart';

class TeamHubScreen extends StatefulWidget {
  const TeamHubScreen({super.key});

  @override
  State<TeamHubScreen> createState() => _TeamHubScreenState();
}

class _TeamHubScreenState extends State<TeamHubScreen> {
  String _searchQuery = '';
  String? _selectedGroup;

  List<TeamGroupEntry> get _filteredTeams {
    var teams = teamGroups;

    if (_selectedGroup != null) {
      teams = teams.where((t) => t.group == _selectedGroup).toList();
    }
    if (_searchQuery.isNotEmpty) {
      final q = _searchQuery.toLowerCase();
      teams = teams.where((t) => t.name.toLowerCase().contains(q)).toList();
    }
    return teams;
  }

  /// Firestore doc ID와 동일하게 팀명을 인코딩
  String _encodeTeamId(String name) => Uri.encodeComponent(name);

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredTeams;

    return Scaffold(
      appBar: AppBar(title: const Text('팀')),
      body: Column(
        children: [
          // ── 검색바 ──
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: TextField(
              decoration: const InputDecoration(
                hintText: '팀명 검색...',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (v) => setState(() => _searchQuery = v),
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
                    selected: _selectedGroup == null,
                    onSelected: (_) =>
                        setState(() => _selectedGroup = null),
                  ),
                ),
                for (final g in groupLetters)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: ChoiceChip(
                      label: Text(
                        '$g조',
                        style: TextStyle(
                          color: _selectedGroup == g
                              ? Colors.white
                              : groupColors[g],
                        ),
                      ),
                      selected: _selectedGroup == g,
                      selectedColor: groupColors[g],
                      onSelected: (_) =>
                          setState(() => _selectedGroup = g),
                    ),
                  ),
              ],
            ),
          ),

          // ── 팀 수 ──
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                '${filtered.length}개 팀',
                style: const TextStyle(
                    color: AppTheme.slate400, fontSize: 13),
              ),
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
                return TeamCard(
                  name: entry.name,
                  group: entry.group,
                  color: groupColors[entry.group] ?? AppTheme.blue400,
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => TeamDetailScreen(
                          teamId: _encodeTeamId(entry.name),
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
    );
  }
}
