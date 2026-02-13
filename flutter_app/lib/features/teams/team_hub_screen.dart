import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/data/team_groups.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/background_logo.dart';
import 'team_detail_screen.dart';
import 'widgets/team_card.dart';

class TeamHubScreen extends StatefulWidget {
  const TeamHubScreen({super.key});

  @override
  State<TeamHubScreen> createState() => _TeamHubScreenState();
}

enum _SortMode { name, group }

class _TeamHubScreenState extends State<TeamHubScreen> {
  String _searchQuery = '';
  String? _selectedGroup;
  _SortMode _sortMode = _SortMode.group;
  Map<String, String> _emblemByTeamId = {};

  List<TeamGroupEntry> get _filteredTeams {
    var teams = teamGroups.toList();

    if (_selectedGroup != null) {
      teams = teams.where((t) => t.group == _selectedGroup).toList();
    }
    if (_searchQuery.isNotEmpty) {
      final q = _searchQuery.toLowerCase();
      teams = teams.where((t) => t.name.toLowerCase().contains(q)).toList();
    }

    if (_sortMode == _SortMode.name) {
      teams.sort((a, b) => a.name.compareTo(b.name));
    } else {
      teams.sort((a, b) {
        final g = a.group.compareTo(b.group);
        return g != 0 ? g : a.name.compareTo(b.name);
      });
    }
    return teams;
  }

  /// Firestore doc ID와 동일하게 팀명을 인코딩
  String _encodeTeamId(String name) => Uri.encodeComponent(name);

  @override
  void initState() {
    super.initState();
    _loadEmblems();
  }

  Future<void> _loadEmblems() async {
    try {
      final snap = await FirebaseFirestore.instance.collection('teams').get();
      final map = <String, String>{};
      for (final doc in snap.docs) {
        final data = doc.data();
        final url = data['emblemUrl'];
        if (url is String && url.isNotEmpty) {
          map[doc.id] = url;
        }
      }
      if (mounted) setState(() => _emblemByTeamId = map);
    } catch (_) {
      // 실패 시 로고 없이 표시
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredTeams;

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
                  onTap: () => setState(() => _sortMode =
                      _sortMode == _SortMode.group
                          ? _SortMode.name
                          : _SortMode.group),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.sort, size: 14, color: AppTheme.slate500),
                      const SizedBox(width: 4),
                      Text(
                        _sortMode == _SortMode.group ? '조별' : '이름순',
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
                final teamId = _encodeTeamId(entry.name);
                return TeamCard(
                  name: entry.name,
                  group: entry.group,
                  color: groupColors[entry.group] ?? AppTheme.blue400,
                  emblemUrl: _emblemByTeamId[teamId],
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
