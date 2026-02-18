import '../../core/services/backend_api_service.dart';

const _unsetValue = Object();

class RecordsFilterState {
  const RecordsFilterState({
    this.scope = RecordScope.all,
    this.group = RecordGroup.all,
    this.playoffDivision = RecordPlayoffDivision.all,
    this.regulation = RecordRegulation.inRule,
    this.searchQuery = '',
    this.rankingYear,
    this.powerLimit = 50,
    this.topBatterSort = BatterRankingSort.ops,
    this.topPitcherSort = PitcherRankingSort.era,
  });

  final RecordScope scope;
  final RecordGroup group;
  final RecordPlayoffDivision playoffDivision;
  final RecordRegulation regulation;
  final String searchQuery;
  final int? rankingYear;
  final int powerLimit;
  final BatterRankingSort topBatterSort;
  final PitcherRankingSort topPitcherSort;

  RecordsFilterState copyWith({
    RecordScope? scope,
    RecordGroup? group,
    RecordPlayoffDivision? playoffDivision,
    RecordRegulation? regulation,
    String? searchQuery,
    Object? rankingYear = _unsetValue,
    int? powerLimit,
    BatterRankingSort? topBatterSort,
    PitcherRankingSort? topPitcherSort,
  }) {
    return RecordsFilterState(
      scope: scope ?? this.scope,
      group: group ?? this.group,
      playoffDivision: playoffDivision ?? this.playoffDivision,
      regulation: regulation ?? this.regulation,
      searchQuery: searchQuery ?? this.searchQuery,
      rankingYear:
          rankingYear == _unsetValue ? this.rankingYear : rankingYear as int?,
      powerLimit: powerLimit ?? this.powerLimit,
      topBatterSort: topBatterSort ?? this.topBatterSort,
      topPitcherSort: topPitcherSort ?? this.topPitcherSort,
    );
  }
}
