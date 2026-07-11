import '../../core/data/team_groups.dart';
import 'data/team_hub_repository.dart';

enum TeamHubSortMode { name, group }

class TeamHubViewModel {
  TeamHubViewModel({TeamHubDataSource? dataSource})
      : _dataSource = dataSource ?? TeamHubRepository();

  final TeamHubDataSource _dataSource;

  String _searchQuery = '';
  String? _selectedGroup;
  TeamHubSortMode _sortMode = TeamHubSortMode.group;
  Map<String, String> _emblemByTeamId = {};

  String get searchQuery => _searchQuery;
  String? get selectedGroup => _selectedGroup;
  TeamHubSortMode get sortMode => _sortMode;
  Map<String, String> get emblemByTeamId => _emblemByTeamId;

  Future<void> loadEmblems() async {
    try {
      _emblemByTeamId = await _dataSource.getEmblemUrlsByTeamId();
    } catch (_) {
      _emblemByTeamId = {};
    }
  }

  void setSearchQuery(String value) {
    _searchQuery = value;
  }

  void setSelectedGroup(String? value) {
    _selectedGroup = value;
  }

  void toggleSortMode() {
    _sortMode = _sortMode == TeamHubSortMode.group
        ? TeamHubSortMode.name
        : TeamHubSortMode.group;
  }

  List<TeamGroupEntry> filteredTeams() {
    var teams = teamGroups.toList();

    if (_selectedGroup != null) {
      teams = teams.where((team) => team.group == _selectedGroup).toList();
    }
    if (_searchQuery.isNotEmpty) {
      final query = _searchQuery.toLowerCase();
      teams = teams
          .where((team) => team.name.toLowerCase().contains(query))
          .toList();
    }

    if (_sortMode == TeamHubSortMode.name) {
      teams.sort((a, b) => a.name.compareTo(b.name));
    } else {
      teams.sort((a, b) {
        final groupCompare = a.group.compareTo(b.group);
        return groupCompare != 0 ? groupCompare : a.name.compareTo(b.name);
      });
    }
    return teams;
  }

  String encodeTeamId(String name) => Uri.encodeComponent(name);
}
