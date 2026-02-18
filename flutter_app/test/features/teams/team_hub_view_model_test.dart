import 'package:aubl_flutter_app/features/teams/data/team_hub_repository.dart';
import 'package:aubl_flutter_app/features/teams/team_hub_view_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('TeamHubViewModel', () {
    test('loads emblem map from data source', () async {
      final viewModel = TeamHubViewModel(
        dataSource: _FakeTeamHubDataSource({
          'team-a': 'https://example.com/a.png',
        }),
      );

      await viewModel.loadEmblems();

      expect(viewModel.emblemByTeamId['team-a'], 'https://example.com/a.png');
    });

    test('returns empty emblem map when data source throws', () async {
      final viewModel = TeamHubViewModel(
        dataSource: _ThrowingTeamHubDataSource(),
      );

      await viewModel.loadEmblems();

      expect(viewModel.emblemByTeamId, isEmpty);
    });

    test('filters teams by group and query', () {
      final viewModel = TeamHubViewModel(
        dataSource: _FakeTeamHubDataSource({}),
      );

      viewModel.setSelectedGroup('H');
      viewModel.setSearchQuery('한양');
      final filtered = viewModel.filteredTeams();

      expect(filtered, isNotEmpty);
      expect(filtered.every((team) => team.group == 'H'), isTrue);
      expect(filtered.every((team) => team.name.contains('한양')), isTrue);
    });

    test('toggles sort mode', () {
      final viewModel = TeamHubViewModel(
        dataSource: _FakeTeamHubDataSource({}),
      );

      expect(viewModel.sortMode, TeamHubSortMode.group);
      viewModel.toggleSortMode();
      expect(viewModel.sortMode, TeamHubSortMode.name);
      viewModel.toggleSortMode();
      expect(viewModel.sortMode, TeamHubSortMode.group);
    });

    test('encodes team id using URI encoding', () {
      final viewModel = TeamHubViewModel(
        dataSource: _FakeTeamHubDataSource({}),
      );

      final encoded = viewModel.encodeTeamId('한국외대(서울) 야구부');
      expect(encoded, contains('%'));
      expect(encoded.contains(' '), isFalse);
      expect(encoded, contains('%20'));
    });
  });
}

class _FakeTeamHubDataSource implements TeamHubDataSource {
  _FakeTeamHubDataSource(this.result);

  final Map<String, String> result;

  @override
  Future<Map<String, String>> getEmblemUrlsByTeamId() async {
    return result;
  }
}

class _ThrowingTeamHubDataSource implements TeamHubDataSource {
  @override
  Future<Map<String, String>> getEmblemUrlsByTeamId() async {
    throw Exception('network error');
  }
}
