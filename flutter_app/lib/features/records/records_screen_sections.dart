part of 'records_screen.dart';

// 정렬 활성 컬럼 강조색 (web: #34d399 emerald-400)
const _sortActiveColor = Color(0xFF34D399);
const _sortHint = '↕ 컬럼 탭하여 정렬';

// 정렬 활성 여부에 따른 셀 스타일 반환
TextStyle _cs(int cellIdx, int? sortColIdx) => sortColIdx == cellIdx
    ? _cellStyle.copyWith(color: _sortActiveColor, fontWeight: FontWeight.w700)
    : _cellStyle;

TextStyle _ns(int cellIdx, int? sortColIdx) => sortColIdx == cellIdx
    ? _numStyle.copyWith(color: _sortActiveColor, fontWeight: FontWeight.w700)
    : _numStyle;

String _tierLabel(String? value) {
  final raw = (value ?? '').trim().toUpperCase();
  if (raw.contains('EUTTEUM') || raw.contains('으뜸')) return '으뜸';
  if (raw.contains('BEOGEUM') || raw.contains('버금')) return '버금';
  return '-';
}

String _roundLabel(String? value) {
  final raw = (value ?? '').trim().toUpperCase();
  if (raw == 'FINAL') return '결승';
  if (raw == 'SEMI_FINAL') return '4강';
  if (raw == 'QUARTER_FINAL') return '8강';
  if (raw == 'ROUND_OF_16') return '16강';
  return value ?? '-';
}

extension _RecordsScreenSections on RecordsScreenState {
  Widget _buildFilterBar() {
    final selectedSeason = _seasons.where((e) => e.id == _seasonId).firstOrNull;
    final rankingYearOptions = _seasons.map((e) => e.year + 1).toSet().toList()
      ..sort((a, b) => b.compareTo(a));

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: AppTheme.slate900,
        border: Border(
            bottom:
                BorderSide(color: AppTheme.slate800.withValues(alpha: 0.8))),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          const horizontalPadding = 12.0;
          const spacing = 8.0;
          final usableWidth = constraints.maxWidth - horizontalPadding * 2;

          final secondaryControlWidth = usableWidth < 540
              ? usableWidth
              : usableWidth < 980
                  ? (usableWidth - spacing) / 2
                  : 220.0;

          final searchWidth = usableWidth < 540
              ? usableWidth
              : usableWidth < 980
                  ? (usableWidth - spacing) / 2
                  : 260.0;

          return Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _FilterDropdown<int>(
                        label: 'SEASON',
                        width: double.infinity,
                        value: _seasonId,
                        items: _seasons
                            .map((season) => DropdownMenuItem<int>(
                                  value: season.id,
                                  child: Text(
                                      '${season.year} 시즌 (ID:${season.id})'),
                                ))
                            .toList(),
                        onChanged: (value) {
                          if (value == null || value == _seasonId) return;
                          _changeSeason(value, _seasons.first);
                        },
                      ),
                    ),
                    const SizedBox(width: spacing),
                    Expanded(
                      child: _FilterDropdown<RecordScope>(
                        label: '리그/플레이오프',
                        width: double.infinity,
                        value: _filters.scope,
                        items: _scopeOptions
                            .map((scope) => DropdownMenuItem<RecordScope>(
                                  value: scope,
                                  child: Text(_scopeText(scope)),
                                ))
                            .toList(),
                        onChanged: (value) {
                          if (value == null || value == _filters.scope) return;
                          _setState(() {
                            _filters = _filters.copyWith(
                              scope: value,
                              playoffDivision: value != RecordScope.playoff
                                  ? RecordPlayoffDivision.all
                                  : _filters.playoffDivision,
                            );
                          });
                          _reloadRecords();
                        },
                      ),
                    ),
                    const SizedBox(width: spacing),
                    Expanded(
                      child: _FilterDropdown<RecordGroup>(
                        label: '조',
                        width: double.infinity,
                        value: _filters.group,
                        items: _groupOptions
                            .map((group) => DropdownMenuItem<RecordGroup>(
                                  value: group,
                                  child: Text(_groupText(group)),
                                ))
                            .toList(),
                        onChanged: (value) {
                          if (value == null || value == _filters.group) return;
                          _setState(() {
                            _filters = _filters.copyWith(group: value);
                          });
                          _reloadRecords();
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: spacing),
                Wrap(
                  spacing: spacing,
                  runSpacing: spacing,
                  children: [
                    _FilterDropdown<RecordPlayoffDivision>(
                      label: '플레이오프',
                      width: secondaryControlWidth,
                      value: _filters.playoffDivision,
                      enabled: _playoffFilterEnabled,
                      items: _playoffDivisionOptions
                          .map((division) =>
                              DropdownMenuItem<RecordPlayoffDivision>(
                                value: division,
                                child: Text(_playoffDivisionText(division)),
                              ))
                          .toList(),
                      onChanged: (value) {
                        if (!_playoffFilterEnabled ||
                            value == null ||
                            value == _filters.playoffDivision) {
                          return;
                        }
                        _setState(() {
                          _filters = _filters.copyWith(
                            playoffDivision: value,
                            scope: value != RecordPlayoffDivision.all
                                ? RecordScope.playoff
                                : _filters.scope,
                          );
                        });
                        _reloadRecords();
                      },
                    ),
                    SizedBox(
                      width: searchWidth,
                      child: TextField(
                        onChanged: (value) => _setState(() {
                          _filters = _filters.copyWith(searchQuery: value);
                        }),
                        style:
                            const TextStyle(fontSize: 13, color: Colors.white),
                        decoration: InputDecoration(
                          isDense: true,
                          labelText: 'SEARCH',
                          hintText: '팀/선수 검색',
                          prefixIcon: const Icon(Icons.search, size: 18),
                          contentPadding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 10),
                          border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8)),
                        ),
                      ),
                    ),
                    if (_tabCtrl.index == RecordsHubTab.pitchers.index ||
                        _tabCtrl.index == RecordsHubTab.batters.index)
                      SizedBox(
                        width: secondaryControlWidth,
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: _RegulationFilter(
                            value: _filters.regulation,
                            available: _regulationOptions,
                            onChanged: (next) {
                              _setState(() {
                                _filters = _filters.copyWith(regulation: next);
                              });
                              _reloadRecords();
                            },
                          ),
                        ),
                      ),
                    if (_tabCtrl.index == RecordsHubTab.power.index) ...[
                      _FilterDropdown<int>(
                        label: '기준 시즌',
                        width: secondaryControlWidth,
                        value: _filters.rankingYear ??
                            (selectedSeason?.year ?? 0) + 1,
                        items: rankingYearOptions
                            .map((year) => DropdownMenuItem<int>(
                                value: year, child: Text('$year')))
                            .toList(),
                        onChanged: (value) {
                          if (value == null || value == _filters.rankingYear) {
                            return;
                          }
                          _setState(() {
                            _filters = _filters.copyWith(rankingYear: value);
                          });
                          _loadPowerRankings();
                        },
                      ),
                      _FilterDropdown<int>(
                        label: 'LIMIT',
                        width: secondaryControlWidth,
                        value: _filters.powerLimit,
                        items: const [
                          DropdownMenuItem(value: 20, child: Text('20')),
                          DropdownMenuItem(value: 50, child: Text('50')),
                          DropdownMenuItem(value: 100, child: Text('100')),
                          DropdownMenuItem(value: 200, child: Text('200')),
                        ],
                        onChanged: (value) {
                          if (value == null || value == _filters.powerLimit) {
                            return;
                          }
                          _setState(() {
                            _filters = _filters.copyWith(powerLimit: value);
                          });
                          _loadPowerRankings();
                        },
                      ),
                    ],
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildOverviewTab() {
    return _RecordsOverviewSection(
      overview: _overview,
      teamStandings: _teamStandings,
      batters: _batters,
      pitchers: _pitchers,
      topInBatters: _topInBatters,
      topInPitchers: _topInPitchers,
      filters: _filters,
      batterSortItems: _batterSortItems,
      pitcherSortItems: _pitcherSortItems,
      onRefresh: _reloadRecords,
      onBatterSortChanged: (value) {
        _setState(() {
          _filters = _filters.copyWith(topBatterSort: value);
        });
        _reloadRecords();
      },
      onPitcherSortChanged: (value) {
        _setState(() {
          _filters = _filters.copyWith(topPitcherSort: value);
        });
        _reloadRecords();
      },
      onOpenPlayerDetail: (playerId) => _openPlayerDetail(playerId: playerId),
      formatTopBatterValue: _formatTopBatterValue,
      formatTopPitcherValue: _formatTopPitcherValue,
    );
  }

  Widget _buildStandingsTab() {
    return _RecordsStandingsSection(
      teamStandings: _teamStandings,
      playoffRows: _playoffRows,
      onRefresh: _reloadRecords,
      scopeLabel: _scopeLabel,
      divisionLabel: _divisionLabel,
      groupLabel: _groupLabel,
    );
  }

  Widget _buildBattersTab() {
    return _RecordsBattersSection(
      filters: _filters,
      batterSortItems: _batterSortItems,
      topInBatters: _topInBatters,
      batters: _batters,
      onRefresh: _reloadRecords,
      onBatterSortChanged: (value) {
        _setState(() {
          _filters = _filters.copyWith(topBatterSort: value);
        });
        _reloadRecords();
      },
      onOpenPlayerDetail: (playerId) => _openPlayerDetail(playerId: playerId),
      formatTopBatterValue: _formatTopBatterValue,
      scopeLabel: _scopeLabel,
      divisionLabel: _divisionLabel,
      groupLabel: _groupLabel,
    );
  }

  Widget _buildPitchersTab() {
    return _RecordsPitchersSection(
      filters: _filters,
      pitcherSortItems: _pitcherSortItems,
      topInPitchers: _topInPitchers,
      pitchers: _pitchers,
      onRefresh: _reloadRecords,
      onPitcherSortChanged: (value) {
        _setState(() {
          _filters = _filters.copyWith(topPitcherSort: value);
        });
        _reloadRecords();
      },
      onOpenPlayerDetail: (playerId) => _openPlayerDetail(playerId: playerId),
      formatTopPitcherValue: _formatTopPitcherValue,
      scopeLabel: _scopeLabel,
      divisionLabel: _divisionLabel,
      groupLabel: _groupLabel,
    );
  }

  Widget _buildPowerTab() {
    return _RecordsPowerSection(
      powerLoading: _powerLoading,
      powerError: _powerError,
      rankingYear: _filters.rankingYear,
      powerRows: _powerRows,
      onRefresh: _loadPowerRankings,
    );
  }

  String _formatTopBatterValue(BatterRanking row) {
    switch (_filters.topBatterSort) {
      case BatterRankingSort.battingAverage:
        return 'AVG ${row.battingAverage.toStringAsFixed(3)}';
      case BatterRankingSort.hits:
        return 'H ${row.hits}';
      case BatterRankingSort.homeRuns:
        return 'HR ${row.homeRuns}';
      case BatterRankingSort.rbi:
        return 'RBI ${row.runsBattedIn}';
      case BatterRankingSort.onBasePct:
        return 'OBP ${row.onBasePct.toStringAsFixed(3)}';
      case BatterRankingSort.sluggingPct:
        return 'SLG ${row.sluggingPct.toStringAsFixed(3)}';
      case BatterRankingSort.ops:
        return 'OPS ${row.ops.toStringAsFixed(3)}';
      case BatterRankingSort.gamesPlayed:
        return 'G ${row.gamesPlayed}';
      case BatterRankingSort.plateAppearance:
        return 'PA ${row.plateAppearance}';
      case BatterRankingSort.stolenBases:
        return 'SB ${row.stolenBases}';
    }
  }

  String _formatTopPitcherValue(PitcherRanking row) {
    switch (_filters.topPitcherSort) {
      case PitcherRankingSort.whip:
        return 'WHIP ${row.whip.toStringAsFixed(2)}';
      case PitcherRankingSort.strikeouts:
        return 'K ${row.strikeouts}';
      case PitcherRankingSort.wins:
        return 'W ${row.wins}';
      case PitcherRankingSort.saves:
        return 'SV ${row.saves}';
      case PitcherRankingSort.era:
        return 'ERA ${row.era.toStringAsFixed(2)}';
      case PitcherRankingSort.inningsPitched:
        return 'IP ${row.inningsPitched.toStringAsFixed(1)}';
      case PitcherRankingSort.walksAllowed:
        return 'BB ${row.walksAllowed}';
      case PitcherRankingSort.gamesPlayed:
        return 'G ${row.gamesPlayed}';
    }
  }

  String _scopeLabel(String? value) {
    final raw = (value ?? '').trim().toUpperCase();
    if (raw.contains('PLAYOFF') || raw.contains('포스트')) return 'PLAYOFF';
    if (raw.contains('LEAGUE') ||
        raw.contains('REGULAR') ||
        raw.contains('정규') ||
        raw.contains('리그')) {
      return 'LEAGUE';
    }
    return '-';
  }

  String _divisionLabel(String? value) {
    final raw = (value ?? '').trim().toUpperCase();
    if (raw.contains('EUTTEUM') || raw.contains('으뜸')) return '으뜸';
    if (raw.contains('BEOGEUM') || raw.contains('버금')) return '버금';
    return '-';
  }

  String _groupLabel(String? partCode) {
    final group = RecordsViewModel.resolveGroupFromPartCode(partCode);
    if (group == null) return '-';
    return '${group.wire}조';
  }
}

class _RecordsOverviewSection extends StatelessWidget {
  const _RecordsOverviewSection({
    required this.overview,
    required this.teamStandings,
    required this.batters,
    required this.pitchers,
    required this.topInBatters,
    required this.topInPitchers,
    required this.filters,
    required this.batterSortItems,
    required this.pitcherSortItems,
    required this.onRefresh,
    required this.onBatterSortChanged,
    required this.onPitcherSortChanged,
    required this.onOpenPlayerDetail,
    required this.formatTopBatterValue,
    required this.formatTopPitcherValue,
  });

  final RecordsOverview? overview;
  final List<TeamRecordStanding> teamStandings;
  final List<BatterRanking> batters;
  final List<PitcherRanking> pitchers;
  final List<BatterRanking> topInBatters;
  final List<PitcherRanking> topInPitchers;
  final RecordsFilterState filters;
  final List<_SortItem<BatterRankingSort>> batterSortItems;
  final List<_SortItem<PitcherRankingSort>> pitcherSortItems;
  final Future<void> Function() onRefresh;
  final ValueChanged<BatterRankingSort> onBatterSortChanged;
  final ValueChanged<PitcherRankingSort> onPitcherSortChanged;
  final ValueChanged<int?> onOpenPlayerDetail;
  final String Function(BatterRanking row) formatTopBatterValue;
  final String Function(PitcherRanking row) formatTopPitcherValue;

  @override
  Widget build(BuildContext context) {
    final avgWinPct = teamStandings.isEmpty
        ? 0.0
        : teamStandings
                .map((e) => e.winPct)
                .fold<double>(0.0, (sum, value) => sum + value) /
            teamStandings.length;

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _MetricCard(
                  label: '총 경기', value: '${overview?.totalGames ?? 0} G'),
              _MetricCard(
                  label: '참여 팀',
                  value: '${overview?.totalTeams ?? teamStandings.length} 팀'),
              _MetricCard(
                  label: '평균 승률',
                  value: '${(avgWinPct * 100).toStringAsFixed(1)}%'),
              _MetricCard(
                  label: '타자/투수 행 수',
                  value: '${batters.length}/${pitchers.length}'),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _TopFivePanel<BatterRanking>(
                  title: '타자 TOP 5 (규정 IN)',
                  accent: AppTheme.purple500,
                  rows: topInBatters,
                  emptyText: '타자 데이터가 없습니다.',
                  sortWidget: _SortDropdown<BatterRankingSort>(
                    value: filters.topBatterSort,
                    items: batterSortItems,
                    onChanged: onBatterSortChanged,
                  ),
                  itemBuilder: (row) => _TopPlayerTile(
                    rank: row.rank,
                    name: row.playerName,
                    team: row.teamName,
                    value: formatTopBatterValue(row),
                    onTap: () => onOpenPlayerDetail(row.playerId),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _TopFivePanel<PitcherRanking>(
                  title: '투수 TOP 5 (규정 IN)',
                  accent: AppTheme.blue400,
                  rows: topInPitchers,
                  emptyText: '투수 데이터가 없습니다.',
                  sortWidget: _SortDropdown<PitcherRankingSort>(
                    value: filters.topPitcherSort,
                    items: pitcherSortItems,
                    onChanged: onPitcherSortChanged,
                  ),
                  itemBuilder: (row) => _TopPlayerTile(
                    rank: row.rank,
                    name: row.playerName,
                    team: row.teamName,
                    value: formatTopPitcherValue(row),
                    onTap: () => onOpenPlayerDetail(row.playerId),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RecordsBattersSection extends StatefulWidget {
  const _RecordsBattersSection({
    required this.filters,
    required this.batterSortItems,
    required this.topInBatters,
    required this.batters,
    required this.onRefresh,
    required this.onBatterSortChanged,
    required this.onOpenPlayerDetail,
    required this.formatTopBatterValue,
    required this.scopeLabel,
    required this.divisionLabel,
    required this.groupLabel,
  });

  final RecordsFilterState filters;
  final List<_SortItem<BatterRankingSort>> batterSortItems;
  final List<BatterRanking> topInBatters;
  final List<BatterRanking> batters;
  final Future<void> Function() onRefresh;
  final ValueChanged<BatterRankingSort> onBatterSortChanged;
  final ValueChanged<int?> onOpenPlayerDetail;
  final String Function(BatterRanking row) formatTopBatterValue;
  final String Function(String? value) scopeLabel;
  final String Function(String? value) divisionLabel;
  final String Function(String? partCode) groupLabel;

  @override
  State<_RecordsBattersSection> createState() => _RecordsBattersSectionState();
}

class _RecordsBattersSectionState extends State<_RecordsBattersSection> {
  int? _sortColIdx;
  bool _sortAsc = true;

  void _onSort(int colIdx, bool ascending) {
    setState(() {
      _sortColIdx = colIdx;
      _sortAsc = ascending;
    });
  }

  List<BatterRanking> get _sortedBatters {
    final idx = _sortColIdx;
    if (idx == null) return widget.batters;
    final sorted = [...widget.batters];
    int cmp(BatterRanking a, BatterRanking b) {
      switch (idx) {
        case 0:
          return a.rank.compareTo(b.rank);
        case 1:
          return a.playerName.compareTo(b.playerName);
        case 2:
          return a.teamName.compareTo(b.teamName);
        case 3:
          return (a.scope ?? '').compareTo(b.scope ?? '');
        case 4:
          return (a.seasonType ?? '').compareTo(b.seasonType ?? '');
        case 5:
          return (a.partCode ?? '').compareTo(b.partCode ?? '');
        case 6:
          return (a.regulation ?? '').compareTo(b.regulation ?? '');
        case 7:
          return (int.tryParse(a.jerseyNumber) ?? 0)
              .compareTo(int.tryParse(b.jerseyNumber) ?? 0);
        case 8:
          return (a.seasonYear ?? 0).compareTo(b.seasonYear ?? 0);
        case 9:
          return a.battingAverage.compareTo(b.battingAverage);
        case 10:
          return a.onBasePct.compareTo(b.onBasePct);
        case 11:
          return a.sluggingPct.compareTo(b.sluggingPct);
        case 12:
          return a.ops.compareTo(b.ops);
        case 13:
          return a.homeRuns.compareTo(b.homeRuns);
        case 14:
          return a.runsBattedIn.compareTo(b.runsBattedIn);
        case 15:
          return a.stolenBases.compareTo(b.stolenBases);
        case 16:
          return a.hits.compareTo(b.hits);
        case 17:
          return a.gamesPlayed.compareTo(b.gamesPlayed);
        default:
          return 0;
      }
    }

    sorted.sort((a, b) => _sortAsc ? cmp(a, b) : cmp(b, a));
    return sorted;
  }

  @override
  Widget build(BuildContext context) {
    final batters = _sortedBatters;
    return RefreshIndicator(
      onRefresh: widget.onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          _TopFivePanel<BatterRanking>(
            title: '타자 TOP 5 (규정 IN)',
            accent: AppTheme.purple500,
            rows: widget.topInBatters,
            emptyText: '타자 데이터가 없습니다.',
            sortWidget: _SortDropdown<BatterRankingSort>(
              value: widget.filters.topBatterSort,
              items: widget.batterSortItems,
              onChanged: widget.onBatterSortChanged,
            ),
            itemBuilder: (row) => _TopPlayerTile(
              rank: row.rank,
              name: row.playerName,
              team: row.teamName,
              value: widget.formatTopBatterValue(row),
              onTap: () => widget.onOpenPlayerDetail(row.playerId),
            ),
          ),
          const SizedBox(height: 10),
          _Card(
            title: '타자 기록',
            hint: _sortHint,
            child: batters.isEmpty
                ? const _EmptyState(text: '표시할 타자 기록이 없습니다.')
                : _buildPlayerStatsTable(
                    statColumns: const [
                      DataColumn(
                          label: Text('AVG', style: _thStyle), numeric: true),
                      DataColumn(
                          label: Text('OBP', style: _thStyle), numeric: true),
                      DataColumn(
                          label: Text('SLG', style: _thStyle), numeric: true),
                      DataColumn(
                          label: Text('OPS', style: _thStyle), numeric: true),
                      DataColumn(
                          label: Text('HR', style: _thStyle), numeric: true),
                      DataColumn(
                          label: Text('RBI', style: _thStyle), numeric: true),
                      DataColumn(
                          label: Text('SB', style: _thStyle), numeric: true),
                      DataColumn(
                          label: Text('H', style: _thStyle), numeric: true),
                      DataColumn(
                          label: Text('G', style: _thStyle), numeric: true),
                    ],
                    sortColumnIndex: _sortColIdx,
                    sortAscending: _sortAsc,
                    onSort: _onSort,
                    rows: batters
                        .map(
                          (row) => DataRow(
                            cells: [
                              ..._buildPlayerBaseCells(
                                rank: row.rank,
                                playerName: row.playerName,
                                playerId: row.playerId,
                                teamName: row.teamName,
                                scope: row.scope,
                                seasonType: row.seasonType,
                                partCode: row.partCode,
                                regulation: row.regulation,
                                jerseyNumber: row.jerseyNumber,
                                seasonYear: row.seasonYear,
                                onOpenPlayerDetail: widget.onOpenPlayerDetail,
                                scopeLabel: widget.scopeLabel,
                                divisionLabel: widget.divisionLabel,
                                groupLabel: widget.groupLabel,
                                sortColIdx: _sortColIdx,
                              ),
                              DataCell(Text(
                                  row.battingAverage.toStringAsFixed(3),
                                  style: _ns(9, _sortColIdx))),
                              DataCell(Text(row.onBasePct.toStringAsFixed(3),
                                  style: _ns(10, _sortColIdx))),
                              DataCell(Text(row.sluggingPct.toStringAsFixed(3),
                                  style: _ns(11, _sortColIdx))),
                              DataCell(Text(row.ops.toStringAsFixed(3),
                                  style: _numStyle.copyWith(
                                      color: _sortColIdx == 12
                                          ? _sortActiveColor
                                          : AppTheme.purple500,
                                      fontWeight: _sortColIdx == 12
                                          ? FontWeight.w700
                                          : null))),
                              DataCell(Text('${row.homeRuns}',
                                  style: _ns(13, _sortColIdx))),
                              DataCell(Text('${row.runsBattedIn}',
                                  style: _ns(14, _sortColIdx))),
                              DataCell(Text('${row.stolenBases}',
                                  style: _ns(15, _sortColIdx))),
                              DataCell(Text('${row.hits}',
                                  style: _ns(16, _sortColIdx))),
                              DataCell(Text('${row.gamesPlayed}',
                                  style: _ns(17, _sortColIdx))),
                            ],
                          ),
                        )
                        .toList(),
                  ),
          ),
        ],
      ),
    );
  }
}

class _RecordsPitchersSection extends StatefulWidget {
  const _RecordsPitchersSection({
    required this.filters,
    required this.pitcherSortItems,
    required this.topInPitchers,
    required this.pitchers,
    required this.onRefresh,
    required this.onPitcherSortChanged,
    required this.onOpenPlayerDetail,
    required this.formatTopPitcherValue,
    required this.scopeLabel,
    required this.divisionLabel,
    required this.groupLabel,
  });

  final RecordsFilterState filters;
  final List<_SortItem<PitcherRankingSort>> pitcherSortItems;
  final List<PitcherRanking> topInPitchers;
  final List<PitcherRanking> pitchers;
  final Future<void> Function() onRefresh;
  final ValueChanged<PitcherRankingSort> onPitcherSortChanged;
  final ValueChanged<int?> onOpenPlayerDetail;
  final String Function(PitcherRanking row) formatTopPitcherValue;
  final String Function(String? value) scopeLabel;
  final String Function(String? value) divisionLabel;
  final String Function(String? partCode) groupLabel;

  @override
  State<_RecordsPitchersSection> createState() =>
      _RecordsPitchersSectionState();
}

class _RecordsPitchersSectionState extends State<_RecordsPitchersSection> {
  int? _sortColIdx;
  bool _sortAsc = true;

  void _onSort(int colIdx, bool ascending) {
    setState(() {
      _sortColIdx = colIdx;
      _sortAsc = ascending;
    });
  }

  List<PitcherRanking> get _sortedPitchers {
    final idx = _sortColIdx;
    if (idx == null) return widget.pitchers;
    final sorted = [...widget.pitchers];
    int cmp(PitcherRanking a, PitcherRanking b) {
      switch (idx) {
        case 0:
          return a.rank.compareTo(b.rank);
        case 1:
          return a.playerName.compareTo(b.playerName);
        case 2:
          return a.teamName.compareTo(b.teamName);
        case 3:
          return (a.scope ?? '').compareTo(b.scope ?? '');
        case 4:
          return (a.seasonType ?? '').compareTo(b.seasonType ?? '');
        case 5:
          return (a.partCode ?? '').compareTo(b.partCode ?? '');
        case 6:
          return (a.regulation ?? '').compareTo(b.regulation ?? '');
        case 7:
          return (int.tryParse(a.jerseyNumber) ?? 0)
              .compareTo(int.tryParse(b.jerseyNumber) ?? 0);
        case 8:
          return (a.seasonYear ?? 0).compareTo(b.seasonYear ?? 0);
        case 9:
          return a.era.compareTo(b.era);
        case 10:
          return a.inningsPitched.compareTo(b.inningsPitched);
        case 11:
          return a.whip.compareTo(b.whip);
        case 12:
          return a.strikeouts.compareTo(b.strikeouts);
        case 13:
          return a.walksAllowed.compareTo(b.walksAllowed);
        case 14:
          return a.wins != b.wins
              ? a.wins.compareTo(b.wins)
              : b.losses.compareTo(a.losses);
        case 15:
          return a.saves.compareTo(b.saves);
        case 16:
          return a.gamesPlayed.compareTo(b.gamesPlayed);
        default:
          return 0;
      }
    }

    sorted.sort((a, b) => _sortAsc ? cmp(a, b) : cmp(b, a));
    return sorted;
  }

  @override
  Widget build(BuildContext context) {
    final pitchers = _sortedPitchers;
    return RefreshIndicator(
      onRefresh: widget.onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          _TopFivePanel<PitcherRanking>(
            title: '투수 TOP 5 (규정 IN)',
            accent: AppTheme.blue400,
            rows: widget.topInPitchers,
            emptyText: '투수 데이터가 없습니다.',
            sortWidget: _SortDropdown<PitcherRankingSort>(
              value: widget.filters.topPitcherSort,
              items: widget.pitcherSortItems,
              onChanged: widget.onPitcherSortChanged,
            ),
            itemBuilder: (row) => _TopPlayerTile(
              rank: row.rank,
              name: row.playerName,
              team: row.teamName,
              value: widget.formatTopPitcherValue(row),
              onTap: () => widget.onOpenPlayerDetail(row.playerId),
            ),
          ),
          const SizedBox(height: 10),
          _Card(
            title: '투수 기록',
            hint: _sortHint,
            child: pitchers.isEmpty
                ? const _EmptyState(text: '표시할 투수 기록이 없습니다.')
                : _buildPlayerStatsTable(
                    statColumns: const [
                      DataColumn(
                          label: Text('ERA', style: _thStyle), numeric: true),
                      DataColumn(
                          label: Text('IP', style: _thStyle), numeric: true),
                      DataColumn(
                          label: Text('WHIP', style: _thStyle), numeric: true),
                      DataColumn(
                          label: Text('K', style: _thStyle), numeric: true),
                      DataColumn(
                          label: Text('BB', style: _thStyle), numeric: true),
                      DataColumn(
                          label: Text('W-L', style: _thStyle), numeric: true),
                      DataColumn(
                          label: Text('SV', style: _thStyle), numeric: true),
                      DataColumn(
                          label: Text('G', style: _thStyle), numeric: true),
                    ],
                    sortColumnIndex: _sortColIdx,
                    sortAscending: _sortAsc,
                    onSort: _onSort,
                    rows: pitchers
                        .map(
                          (row) => DataRow(
                            cells: [
                              ..._buildPlayerBaseCells(
                                rank: row.rank,
                                playerName: row.playerName,
                                playerId: row.playerId,
                                teamName: row.teamName,
                                scope: row.scope,
                                seasonType: row.seasonType,
                                partCode: row.partCode,
                                regulation: row.regulation,
                                jerseyNumber: row.jerseyNumber,
                                seasonYear: row.seasonYear,
                                onOpenPlayerDetail: widget.onOpenPlayerDetail,
                                scopeLabel: widget.scopeLabel,
                                divisionLabel: widget.divisionLabel,
                                groupLabel: widget.groupLabel,
                                sortColIdx: _sortColIdx,
                              ),
                              DataCell(Text(row.era.toStringAsFixed(2),
                                  style: _ns(9, _sortColIdx))),
                              DataCell(Text(
                                  row.inningsPitched.toStringAsFixed(1),
                                  style: _ns(10, _sortColIdx))),
                              DataCell(Text(row.whip.toStringAsFixed(2),
                                  style: _ns(11, _sortColIdx))),
                              DataCell(Text('${row.strikeouts}',
                                  style: _ns(12, _sortColIdx))),
                              DataCell(Text('${row.walksAllowed}',
                                  style: _ns(13, _sortColIdx))),
                              DataCell(Text('${row.wins}-${row.losses}',
                                  style: _cs(14, _sortColIdx))),
                              DataCell(Text('${row.saves}',
                                  style: _ns(15, _sortColIdx))),
                              DataCell(Text('${row.gamesPlayed}',
                                  style: _ns(16, _sortColIdx))),
                            ],
                          ),
                        )
                        .toList(),
                  ),
          ),
        ],
      ),
    );
  }
}

Widget _buildPlayerStatsTable({
  required List<DataColumn> statColumns,
  required List<DataRow> rows,
  int? sortColumnIndex,
  bool sortAscending = true,
  void Function(int, bool)? onSort,
}) {
  final allStatCols = statColumns
      .map(
          (c) => DataColumn(label: c.label, numeric: c.numeric, onSort: onSort))
      .toList();
  return _buildHorizontalDataTable(
    columns: [..._buildBaseColumns(onSort), ...allStatCols],
    rows: rows,
    sortColumnIndex: sortColumnIndex,
    sortAscending: sortAscending,
  );
}

Widget _buildHorizontalDataTable({
  required List<DataColumn> columns,
  required List<DataRow> rows,
  int? sortColumnIndex,
  bool sortAscending = true,
}) {
  return SingleChildScrollView(
    scrollDirection: Axis.horizontal,
    child: DataTable(
      headingRowColor: WidgetStateProperty.all(AppTheme.slate800),
      columnSpacing: 14,
      sortColumnIndex: sortColumnIndex,
      sortAscending: sortAscending,
      columns: columns,
      rows: rows,
    ),
  );
}

List<DataCell> _buildPlayerBaseCells({
  required int rank,
  required String playerName,
  required int? playerId,
  required String teamName,
  required String? scope,
  required String? seasonType,
  required String? partCode,
  required String? regulation,
  required String jerseyNumber,
  required int? seasonYear,
  required ValueChanged<int?> onOpenPlayerDetail,
  required String Function(String? value) scopeLabel,
  required String Function(String? value) divisionLabel,
  required String Function(String? partCode) groupLabel,
  int? sortColIdx,
}) {
  return [
    DataCell(Text('$rank', style: _ns(0, sortColIdx))),
    DataCell(
      InkWell(
        onTap: () => onOpenPlayerDetail(playerId),
        child: Text(
          playerName,
          style: sortColIdx == 1
              ? _linkCellStyle.copyWith(color: _sortActiveColor)
              : _linkCellStyle,
        ),
      ),
    ),
    DataCell(Text(teamName, style: _cs(2, sortColIdx))),
    DataCell(Text(scopeLabel(scope), style: _cs(3, sortColIdx))),
    DataCell(Text(divisionLabel(seasonType), style: _cs(4, sortColIdx))),
    DataCell(Text(groupLabel(partCode), style: _cs(5, sortColIdx))),
    DataCell(
        Text((regulation ?? 'IN').toUpperCase(), style: _cs(6, sortColIdx))),
    DataCell(Text(jerseyNumber.isEmpty ? '-' : jerseyNumber,
        style: _ns(7, sortColIdx))),
    DataCell(Text('${seasonYear ?? '-'}', style: _ns(8, sortColIdx))),
  ];
}

List<DataColumn> _buildBaseColumns(void Function(int, bool)? onSort) => [
      DataColumn(label: const Text('#', style: _thStyle), onSort: onSort),
      DataColumn(label: const Text('이름', style: _thStyle), onSort: onSort),
      DataColumn(label: const Text('팀', style: _thStyle), onSort: onSort),
      DataColumn(label: const Text('구분', style: _thStyle), onSort: onSort),
      DataColumn(label: const Text('플레이오프', style: _thStyle), onSort: onSort),
      DataColumn(label: const Text('조', style: _thStyle), onSort: onSort),
      DataColumn(label: const Text('규정', style: _thStyle), onSort: onSort),
      DataColumn(
          label: const Text('등번호', style: _thStyle),
          numeric: true,
          onSort: onSort),
      DataColumn(
          label: const Text('년도', style: _thStyle),
          numeric: true,
          onSort: onSort),
    ];

class _RecordsStandingsSection extends StatefulWidget {
  const _RecordsStandingsSection({
    required this.teamStandings,
    required this.playoffRows,
    required this.onRefresh,
    required this.scopeLabel,
    required this.divisionLabel,
    required this.groupLabel,
  });

  final List<TeamRecordStanding> teamStandings;
  final List<PlayoffSummaryRow> playoffRows;
  final Future<void> Function() onRefresh;
  final String Function(String? value) scopeLabel;
  final String Function(String? value) divisionLabel;
  final String Function(String? partCode) groupLabel;

  @override
  State<_RecordsStandingsSection> createState() =>
      _RecordsStandingsSectionState();
}

class _RecordsStandingsSectionState extends State<_RecordsStandingsSection> {
  int? _sortColIdx;
  bool _sortAsc = true;

  void _onSort(int colIdx, bool ascending) {
    setState(() {
      _sortColIdx = colIdx;
      _sortAsc = ascending;
    });
  }

  // Returns original indices sorted by the active column.
  // The '#' column always displays the original API rank (originalIndex + 1).
  List<int> get _sortedIndices {
    final indices = List.generate(widget.teamStandings.length, (i) => i);
    final idx = _sortColIdx;
    if (idx == null) return indices;

    int cmp(int ia, int ib) {
      final a = widget.teamStandings[ia];
      final b = widget.teamStandings[ib];
      switch (idx) {
        case 0:
          return ia.compareTo(ib);
        case 1:
          return a.teamName.compareTo(b.teamName);
        case 2:
          return (a.scope ?? '').compareTo(b.scope ?? '');
        case 3:
          return (a.seasonType ?? '').compareTo(b.seasonType ?? '');
        case 4:
          return (a.partCode ?? '').compareTo(b.partCode ?? '');
        case 5:
          final ga = a.wins + a.losses + a.ties;
          final gb = b.wins + b.losses + b.ties;
          return ga.compareTo(gb);
        case 6:
          final va = a.wins * 1000 + a.ties * 100 - a.losses;
          final vb = b.wins * 1000 + b.ties * 100 - b.losses;
          return va.compareTo(vb);
        case 7:
          return a.winPct.compareTo(b.winPct);
        default:
          return 0;
      }
    }

    indices.sort((ia, ib) => _sortAsc ? cmp(ia, ib) : cmp(ib, ia));
    return indices;
  }

  @override
  Widget build(BuildContext context) {
    if (widget.teamStandings.isEmpty) {
      return const _EmptyState(text: '표시할 팀 순위가 없습니다.');
    }

    final sortedIndices = _sortedIndices;

    return RefreshIndicator(
      onRefresh: widget.onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          _Card(
            title: '팀 순위',
            hint: _sortHint,
            child: _buildHorizontalDataTable(
              sortColumnIndex: _sortColIdx,
              sortAscending: _sortAsc,
              columns: [
                DataColumn(
                    label: const Text('#', style: _thStyle), onSort: _onSort),
                DataColumn(
                    label: const Text('팀', style: _thStyle), onSort: _onSort),
                DataColumn(
                    label: const Text('구분', style: _thStyle), onSort: _onSort),
                DataColumn(
                    label: const Text('플레이오프', style: _thStyle),
                    onSort: _onSort),
                DataColumn(
                    label: const Text('조', style: _thStyle), onSort: _onSort),
                DataColumn(
                    label: const Text('경기', style: _thStyle),
                    numeric: true,
                    onSort: _onSort),
                DataColumn(
                    label: const Text('승-무-패', style: _thStyle),
                    numeric: true,
                    onSort: _onSort),
                DataColumn(
                    label: const Text('승률', style: _thStyle),
                    numeric: true,
                    onSort: _onSort),
              ],
              rows: sortedIndices.map((index) {
                final row = widget.teamStandings[index];
                final games = row.wins + row.losses + row.ties;
                return DataRow(
                  cells: [
                    DataCell(Text('${index + 1}', style: _ns(0, _sortColIdx))),
                    DataCell(Text(row.teamName,
                        style: _sortColIdx == 1
                            ? _cellStyle.copyWith(
                                color: _sortActiveColor,
                                fontWeight: FontWeight.w700)
                            : _cellStyle.copyWith(
                                fontWeight: FontWeight.w600))),
                    DataCell(Text(widget.scopeLabel(row.scope),
                        style: _cs(2, _sortColIdx))),
                    DataCell(Text(widget.divisionLabel(row.seasonType),
                        style: _cs(3, _sortColIdx))),
                    DataCell(Text(widget.groupLabel(row.partCode),
                        style: _cs(4, _sortColIdx))),
                    DataCell(Text('$games', style: _ns(5, _sortColIdx))),
                    DataCell(Text('${row.wins}-${row.ties}-${row.losses}',
                        style: _ns(6, _sortColIdx))),
                    DataCell(Text('${(row.winPct * 100).toStringAsFixed(1)}%',
                        style: _ns(7, _sortColIdx))),
                  ],
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 10),
          _Card(
            title: '플레이오프 스테이지 요약',
            child: widget.playoffRows.isEmpty
                ? const _EmptyState(text: '요약할 플레이오프 데이터가 없습니다.')
                : _buildHorizontalDataTable(
                    columns: const [
                      DataColumn(label: Text('구분', style: _thStyle)),
                      DataColumn(label: Text('라운드', style: _thStyle)),
                      DataColumn(
                          label: Text('점수', style: _thStyle), numeric: true),
                      DataColumn(label: Text('팀', style: _thStyle)),
                    ],
                    rows: widget.playoffRows
                        .map(
                          (row) => DataRow(
                            cells: [
                              DataCell(Text(_tierLabel(row.playoffTier),
                                  style: _cellStyle)),
                              DataCell(Text(_roundLabel(row.playoffRound),
                                  style: _cellStyle)),
                              DataCell(Text(row.finalsPoints.toStringAsFixed(1),
                                  style: _numStyle)),
                              DataCell(Text(row.teamName, style: _cellStyle)),
                            ],
                          ),
                        )
                        .toList(),
                  ),
          ),
        ],
      ),
    );
  }
}

class _RecordsPowerSection extends StatelessWidget {
  const _RecordsPowerSection({
    required this.powerLoading,
    required this.powerError,
    required this.rankingYear,
    required this.powerRows,
    required this.onRefresh,
  });

  final bool powerLoading;
  final String? powerError;
  final int? rankingYear;
  final List<PowerRankingApiRow> powerRows;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          if (powerLoading)
            const Padding(
              padding: EdgeInsets.all(12),
              child: LinearProgressIndicator(minHeight: 1),
            ),
          if (powerError != null)
            _Banner(
              icon: Icons.error_outline,
              color: AppTheme.red500,
              text: powerError!,
            ),
          _Card(
            title: '파워랭킹 (${rankingYear ?? '-'})',
            child: powerRows.isEmpty && !powerLoading
                ? const _EmptyState(text: '파워랭킹 데이터가 없습니다.')
                : _buildHorizontalDataTable(
                    columns: const [
                      DataColumn(
                          label: Text('#', style: _thStyle), numeric: true),
                      DataColumn(label: Text('팀', style: _thStyle)),
                      DataColumn(
                          label: Text('총점', style: _thStyle), numeric: true),
                      DataColumn(
                          label: Text('Y1', style: _thStyle), numeric: true),
                      DataColumn(
                          label: Text('Y2', style: _thStyle), numeric: true),
                      DataColumn(
                          label: Text('Y3', style: _thStyle), numeric: true),
                      DataColumn(label: Text('윈도우', style: _thStyle)),
                      DataColumn(label: Text('버전', style: _thStyle)),
                    ],
                    rows: powerRows
                        .map(
                          (row) => DataRow(
                            cells: [
                              DataCell(Text('${row.rank}', style: _numStyle)),
                              DataCell(Text(row.teamName, style: _cellStyle)),
                              DataCell(Text(
                                  row.weightedScore.toStringAsFixed(1),
                                  style: _numStyle)),
                              DataCell(Text(row.y1Score.toStringAsFixed(1),
                                  style: _numStyle)),
                              DataCell(Text(row.y2Score.toStringAsFixed(1),
                                  style: _numStyle)),
                              DataCell(Text(row.y3Score.toStringAsFixed(1),
                                  style: _numStyle)),
                              DataCell(Text(row.windowYears.join(', '),
                                  style: _cellStyle)),
                              DataCell(Text(row.calcVersion ?? '-',
                                  style: _cellStyle)),
                            ],
                          ),
                        )
                        .toList(),
                  ),
          ),
        ],
      ),
    );
  }
}
