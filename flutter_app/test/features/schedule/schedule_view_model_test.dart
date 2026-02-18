import 'package:aubl_flutter_app/core/models/match.dart' as m;
import 'package:aubl_flutter_app/features/schedule/data/schedule_repository.dart';
import 'package:aubl_flutter_app/features/schedule/schedule_view_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ScheduleViewModel', () {
    test('loads remote matches and caches latest result', () async {
      final source = _FakeScheduleDataSource(
        cached: [
          _match(
            id: 'cached',
            homeTeamName: '한양대학교 불새',
            awayTeamName: '연세대학교 EAGLES',
            status: 'scheduled',
          ),
        ],
        remote: [
          _match(
            id: 'remote',
            homeTeamName: '중앙대학교 랑데뷰',
            awayTeamName: '연세대학교 EAGLES',
            status: 'inProgress',
          ),
        ],
      );
      final viewModel = ScheduleViewModel(dataSource: source);

      await viewModel.loadMatches();

      expect(viewModel.isLoading, isFalse);
      expect(viewModel.allMatches.map((match) => match.id), ['remote']);
      expect(source.cachedWrites.map((match) => match.id), ['remote']);
    });

    test('turns off loading when remote fetch fails', () async {
      final source = _FakeScheduleDataSource(throwOnRemote: true);
      final viewModel = ScheduleViewModel(dataSource: source);

      await viewModel.loadMatches();

      expect(viewModel.isLoading, isFalse);
      expect(viewModel.allMatches, isEmpty);
    });

    test('filters matches by group and sorts completed matches desc', () async {
      final source = _FakeScheduleDataSource(
        remote: [
          _match(
            id: 'h-group',
            homeTeamName: '한양대학교 불새',
            awayTeamName: '연세대학교 EAGLES',
            status: 'completed',
            startTime: '2025-04-01T10:00:00.000',
          ),
          _match(
            id: 'f-group',
            homeTeamName: '연세대학교 EAGLES',
            awayTeamName: '중앙대학교 랑데뷰',
            status: 'completed',
            startTime: '2025-06-01T10:00:00.000',
          ),
          _match(
            id: 'practice',
            homeTeamName: '테스트팀',
            awayTeamName: '테스트상대',
            status: 'scheduled',
            recordMode: 'practice',
          ),
        ],
      );
      final viewModel = ScheduleViewModel(dataSource: source);

      await viewModel.loadMatches();

      expect(
        viewModel.groupMatches('H').map((match) => match.id),
        ['h-group'],
      );
      expect(
        viewModel.completedMatches.map((match) => match.id),
        ['f-group', 'h-group'],
      );
      expect(
        viewModel.practiceMatches.map((match) => match.id),
        ['practice'],
      );
    });
  });
}

class _FakeScheduleDataSource implements ScheduleDataSource {
  _FakeScheduleDataSource({
    this.cached,
    this.remote = const [],
    this.throwOnRemote = false,
  });

  final List<m.Match>? cached;
  final List<m.Match> remote;
  final bool throwOnRemote;
  List<m.Match> cachedWrites = const [];

  @override
  Future<void> cacheMatches(List<m.Match> matches) async {
    cachedWrites = matches;
  }

  @override
  Future<List<m.Match>> getAllMatches() async {
    if (throwOnRemote) {
      throw Exception('network error');
    }
    return remote;
  }

  @override
  Future<List<m.Match>?> getCachedMatches() async {
    return cached;
  }

  @override
  Stream<List<m.Match>> watchLiveMatches() {
    return Stream.value(const []);
  }
}

m.Match _match({
  required String id,
  required String homeTeamName,
  required String awayTeamName,
  required String status,
  String? startTime,
  String? recordMode,
}) {
  return m.Match(
    id: id,
    homeTeamId: 'home',
    awayTeamId: 'away',
    homeTeamName: homeTeamName,
    awayTeamName: awayTeamName,
    status: status,
    startTime: startTime,
    recordMode: recordMode,
  );
}
