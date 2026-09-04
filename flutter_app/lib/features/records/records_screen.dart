import 'package:flutter/material.dart';

import '../../core/services/backend_api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/season_components.dart';
import 'player_detail_screen.dart';
import 'records_filter_state.dart';
import 'records_view_model.dart';

part 'records_screen_sections.dart';

enum RecordsHubTab {
  overview('개요'),
  standings('팀순위'),
  pitchers('투수기록'),
  batters('타자기록'),
  power('파워랭킹'),
  playerDetail('선수상세');

  const RecordsHubTab(this.label);
  final String label;
}

class RecordsScreen extends StatefulWidget {
  const RecordsScreen({
    super.key,
    this.initialTab = RecordsHubTab.overview,
    this.apiService,
  });

  final RecordsHubTab initialTab;
  final BackendApiService? apiService;

  @override
  RecordsScreenState createState() => RecordsScreenState();
}

class RecordsScreenState extends State<RecordsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl;
  late final BackendApiService _api;
  late final RecordsViewModel _viewModel;
  late final bool _ownsApi;

  List<SeasonSummary> _seasons = [];
  int? _seasonId;

  RecordsFilterState _filters = const RecordsFilterState();

  bool _initializing = true;
  bool _loading = false;
  bool _powerLoading = false;
  String? _error;
  String? _warning;
  String? _powerError;
  bool _playoffFilterEnabled = false;
  RecordFilterOptions? _recordFilterOptions;

  RecordsOverview? _overview;
  List<TeamRecordStanding> _teamStandings = [];
  List<BatterRanking> _batters = [];
  List<PitcherRanking> _pitchers = [];
  List<BatterRanking> _topInBatters = [];
  List<PitcherRanking> _topInPitchers = [];
  List<PlayoffSummaryRow> _playoffRows = [];
  List<PowerRankingApiRow> _powerRows = [];

  @override
  void initState() {
    super.initState();
    _api = widget.apiService ?? BackendApiService();
    _viewModel = RecordsViewModel(dataSource: BackendRecordsDataSource(_api));
    _ownsApi = widget.apiService == null;
    _tabCtrl = TabController(
      length: RecordsHubTab.values.length,
      vsync: this,
      initialIndex: widget.initialTab.index,
    )..addListener(_onTabChanged);

    _loadInitial();
  }

  @override
  void dispose() {
    _tabCtrl.removeListener(_onTabChanged);
    _tabCtrl.dispose();
    if (_ownsApi) {
      _api.dispose();
    }
    super.dispose();
  }

  void switchToTabIndex(int index) {
    if (index < 0 || index >= RecordsHubTab.values.length) return;
    _tabCtrl.animateTo(index);
  }

  void _onTabChanged() {
    if (_tabCtrl.indexIsChanging) return;
    if (_tabCtrl.index == RecordsHubTab.power.index &&
        _powerRows.isEmpty &&
        !_powerLoading) {
      _loadPowerRankings();
    }
    if (mounted) setState(() {});
  }

  void _setState(VoidCallback fn) {
    if (!mounted) return;
    setState(fn);
  }

  List<RecordScope> get _scopeOptions {
    final scopes =
        _recordFilterOptions?.scopes.toSet().toList() ?? <RecordScope>[];
    final normalized = scopes.isEmpty
        ? [RecordScope.all, RecordScope.league, RecordScope.playoff]
        : scopes;
    final output = <RecordScope>[RecordScope.all];
    if (normalized.contains(RecordScope.league)) {
      output.add(RecordScope.league);
    }
    if (_playoffFilterEnabled && normalized.contains(RecordScope.playoff)) {
      output.add(RecordScope.playoff);
    }
    return output;
  }

  List<RecordGroup> get _groupOptions {
    final groups = _recordFilterOptions?.groups
            .map((item) => item.group)
            .toSet()
            .toList() ??
        <RecordGroup>[];
    if (groups.isEmpty) {
      return const [
        RecordGroup.all,
        RecordGroup.a,
        RecordGroup.b,
        RecordGroup.c,
        RecordGroup.d,
        RecordGroup.e,
        RecordGroup.f,
        RecordGroup.g,
        RecordGroup.h,
      ];
    }
    final sorted = [...groups]..sort((a, b) => a.wire.compareTo(b.wire));
    return [RecordGroup.all, ...sorted];
  }

  List<RecordPlayoffDivision> get _playoffDivisionOptions {
    final divisions = _recordFilterOptions?.playoffDivisions.toSet().toList() ??
        <RecordPlayoffDivision>[];
    if (divisions.isEmpty) {
      return const [
        RecordPlayoffDivision.all,
        RecordPlayoffDivision.eutteum,
        RecordPlayoffDivision.beogeum,
      ];
    }
    final sorted = [...divisions]..sort((a, b) => a.wire.compareTo(b.wire));
    return [RecordPlayoffDivision.all, ...sorted];
  }

  List<RecordRegulation> get _regulationOptions {
    final regulations = _recordFilterOptions?.regulations.toSet().toList() ??
        <RecordRegulation>[];
    if (regulations.isEmpty) {
      return const [RecordRegulation.inRule, RecordRegulation.out];
    }
    final sorted = [...regulations]..sort((a, b) => a.wire.compareTo(b.wire));
    return sorted;
  }

  List<_SortItem<BatterRankingSort>> get _batterSortItems {
    final items = _recordFilterOptions?.batterSortOptions ?? const [];
    final normalized = items.isEmpty
        ? const [
            BatterRankingSort.battingAverage,
            BatterRankingSort.ops,
            BatterRankingSort.onBasePct,
            BatterRankingSort.sluggingPct,
            BatterRankingSort.hits,
            BatterRankingSort.homeRuns,
            BatterRankingSort.rbi,
            BatterRankingSort.gamesPlayed,
            BatterRankingSort.plateAppearance,
            BatterRankingSort.stolenBases,
          ]
        : items;
    return normalized
        .map((item) => _SortItem<BatterRankingSort>(
            value: item, label: _batterSortLabel(item)))
        .toList();
  }

  List<_SortItem<PitcherRankingSort>> get _pitcherSortItems {
    final items = _recordFilterOptions?.pitcherSortOptions ?? const [];
    final normalized = items.isEmpty
        ? const [
            PitcherRankingSort.era,
            PitcherRankingSort.whip,
            PitcherRankingSort.strikeouts,
            PitcherRankingSort.wins,
            PitcherRankingSort.saves,
            PitcherRankingSort.inningsPitched,
            PitcherRankingSort.walksAllowed,
            PitcherRankingSort.gamesPlayed,
          ]
        : items;
    return normalized
        .map((item) => _SortItem<PitcherRankingSort>(
            value: item, label: _pitcherSortLabel(item)))
        .toList();
  }

  String _scopeText(RecordScope value) {
    switch (value) {
      case RecordScope.all:
        return '전체';
      case RecordScope.league:
        return '리그';
      case RecordScope.playoff:
        return '플레이오프';
    }
  }

  String _groupText(RecordGroup value) {
    if (value == RecordGroup.all) return '전체조';
    return '${value.wire}조';
  }

  String _playoffDivisionText(RecordPlayoffDivision value) {
    switch (value) {
      case RecordPlayoffDivision.all:
        return '전체';
      case RecordPlayoffDivision.eutteum:
        return '으뜸';
      case RecordPlayoffDivision.beogeum:
        return '버금';
    }
  }

  String _batterSortLabel(BatterRankingSort value) {
    switch (value) {
      case BatterRankingSort.battingAverage:
        return 'AVG';
      case BatterRankingSort.hits:
        return 'H';
      case BatterRankingSort.homeRuns:
        return 'HR';
      case BatterRankingSort.rbi:
        return 'RBI';
      case BatterRankingSort.onBasePct:
        return 'OBP';
      case BatterRankingSort.sluggingPct:
        return 'SLG';
      case BatterRankingSort.ops:
        return 'OPS';
      case BatterRankingSort.gamesPlayed:
        return 'G';
      case BatterRankingSort.plateAppearance:
        return 'PA';
      case BatterRankingSort.stolenBases:
        return 'SB';
    }
  }

  String _pitcherSortLabel(PitcherRankingSort value) {
    switch (value) {
      case PitcherRankingSort.era:
        return 'ERA';
      case PitcherRankingSort.whip:
        return 'WHIP';
      case PitcherRankingSort.strikeouts:
        return 'K';
      case PitcherRankingSort.wins:
        return 'W';
      case PitcherRankingSort.saves:
        return 'SV';
      case PitcherRankingSort.inningsPitched:
        return 'IP';
      case PitcherRankingSort.walksAllowed:
        return 'BB';
      case PitcherRankingSort.gamesPlayed:
        return 'G';
    }
  }

  RecordsFilterState _normalizeFiltersForOptions(
    RecordsFilterState current,
    RecordFilterOptions? options,
  ) {
    var next = current;

    final optionScopes = options?.scopes.toSet().toList() ?? <RecordScope>[];
    final allowedScopes = optionScopes.isEmpty
        ? [RecordScope.all, RecordScope.league, RecordScope.playoff]
        : [
            RecordScope.all,
            if (optionScopes.contains(RecordScope.league)) RecordScope.league,
            if (optionScopes.contains(RecordScope.playoff) &&
                _playoffFilterEnabled)
              RecordScope.playoff,
          ];
    if (!allowedScopes.contains(next.scope)) {
      next = next.copyWith(scope: allowedScopes.first);
    }

    final optionGroups =
        options?.groups.map((item) => item.group).toSet().toList() ??
            <RecordGroup>[];
    final allowedGroups = optionGroups.isEmpty
        ? const [
            RecordGroup.all,
            RecordGroup.a,
            RecordGroup.b,
            RecordGroup.c,
            RecordGroup.d,
            RecordGroup.e,
            RecordGroup.f,
            RecordGroup.g,
            RecordGroup.h,
          ]
        : [RecordGroup.all, ...optionGroups];
    if (!allowedGroups.contains(next.group)) {
      next = next.copyWith(group: RecordGroup.all);
    }

    final optionDivisions =
        options?.playoffDivisions.toSet().toList() ?? <RecordPlayoffDivision>[];
    final allowedDivisions = optionDivisions.isEmpty
        ? const [
            RecordPlayoffDivision.all,
            RecordPlayoffDivision.eutteum,
            RecordPlayoffDivision.beogeum
          ]
        : [RecordPlayoffDivision.all, ...optionDivisions];
    if (!allowedDivisions.contains(next.playoffDivision)) {
      next = next.copyWith(playoffDivision: RecordPlayoffDivision.all);
    }
    if (next.scope != RecordScope.playoff &&
        next.playoffDivision != RecordPlayoffDivision.all) {
      next = next.copyWith(playoffDivision: RecordPlayoffDivision.all);
    }

    final allowedRegulations = options?.regulations.toSet().toList() ??
        const [RecordRegulation.inRule, RecordRegulation.out];
    if (!allowedRegulations.contains(next.regulation)) {
      final fallback = options?.defaultRegulation ??
          (allowedRegulations.isEmpty
              ? RecordRegulation.inRule
              : allowedRegulations.first);
      next = next.copyWith(regulation: fallback);
    }

    final allowedBatterSorts = (options?.batterSortOptions ??
            const [
              BatterRankingSort.battingAverage,
              BatterRankingSort.ops,
              BatterRankingSort.onBasePct,
              BatterRankingSort.sluggingPct,
              BatterRankingSort.hits,
              BatterRankingSort.homeRuns,
              BatterRankingSort.rbi,
              BatterRankingSort.gamesPlayed,
              BatterRankingSort.plateAppearance,
              BatterRankingSort.stolenBases,
            ])
        .toSet();
    if (!allowedBatterSorts.contains(next.topBatterSort)) {
      next = next.copyWith(topBatterSort: allowedBatterSorts.first);
    }

    final allowedPitcherSorts = (options?.pitcherSortOptions ??
            const [
              PitcherRankingSort.era,
              PitcherRankingSort.whip,
              PitcherRankingSort.strikeouts,
              PitcherRankingSort.wins,
              PitcherRankingSort.saves,
              PitcherRankingSort.inningsPitched,
              PitcherRankingSort.walksAllowed,
              PitcherRankingSort.gamesPlayed,
            ])
        .toSet();
    if (!allowedPitcherSorts.contains(next.topPitcherSort)) {
      next = next.copyWith(topPitcherSort: allowedPitcherSorts.first);
    }

    return next;
  }

  Future<void> _loadInitial() async {
    setState(() {
      _initializing = true;
      _error = null;
    });

    try {
      final seasons = await _viewModel.loadSeasons();
      if (!mounted) return;
      if (seasons.isEmpty) {
        setState(() {
          _seasons = [];
          _error = '등록된 시즌이 없습니다.';
          _initializing = false;
        });
        return;
      }

      final selectedSeasonId = seasons.first.id;
      final selectedSeason = seasons.first;
      setState(() {
        _seasons = seasons;
        _seasonId = selectedSeasonId;
        _filters = _filters.copyWith(rankingYear: selectedSeason.year + 1);
        _initializing = false;
      });

      await _loadFilterOptions(selectedSeasonId);
      await _reloadRecords();
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _error = err.toString();
        _initializing = false;
      });
    }
  }

  Future<void> _loadFilterOptions(int seasonId) async {
    try {
      final options = await _api.getRecordFilterOptions(seasonId);
      if (!mounted) return;
      final nextFilters = _normalizeFiltersForOptions(_filters, options);
      setState(() {
        _recordFilterOptions = options;
        _filters = nextFilters;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _recordFilterOptions = null;
      });
    }
  }

  Future<void> _changeSeason(int seasonId, SeasonSummary fallbackSeason) async {
    if (seasonId == _seasonId) return;
    final nextSeason = _seasons.firstWhere(
      (e) => e.id == seasonId,
      orElse: () => fallbackSeason,
    );
    setState(() {
      _seasonId = seasonId;
      _recordFilterOptions = null;
      _filters = _filters.copyWith(
        rankingYear: _filters.rankingYear ?? (nextSeason.year + 1),
      );
    });
    await _loadFilterOptions(seasonId);
    await _reloadRecords();
  }

  Future<void> _reloadRecords() async {
    final seasonId = _seasonId;
    if (seasonId == null) return;

    setState(() {
      _loading = true;
      _error = null;
      _warning = null;
    });

    final result = await _viewModel.reloadRecords(
      RecordsReloadRequest(
        seasonId: seasonId,
        scope: _filters.scope,
        group: _filters.group,
        playoffDivision: _filters.playoffDivision,
        regulation: _filters.regulation,
        searchQuery: _filters.searchQuery,
        topBatterSort: _filters.topBatterSort,
        topPitcherSort: _filters.topPitcherSort,
      ),
    );
    if (!mounted) return;

    if (result.hasError) {
      setState(() {
        _loading = false;
        _error = result.errorMessage;
      });
      return;
    }

    setState(() {
      _overview = result.overview;
      _teamStandings = result.teamStandings;
      _batters = result.batters;
      _pitchers = result.pitchers;
      _topInBatters = result.topInBatters;
      _topInPitchers = result.topInPitchers;
      _playoffRows = result.playoffRows;
      _playoffFilterEnabled = result.playoffFilterEnabled;
      _warning = result.warningMessage;
      _loading = false;
    });

    if (!result.playoffFilterEnabled && _filters.scope == RecordScope.playoff) {
      setState(() {
        _filters = _filters.copyWith(
          scope: RecordScope.all,
          playoffDivision: RecordPlayoffDivision.all,
        );
      });
      await _reloadRecords();
      return;
    }

    if (_tabCtrl.index == RecordsHubTab.power.index) {
      await _loadPowerRankings();
    }
  }

  Future<void> _loadPowerRankings() async {
    final rankingYear = _filters.rankingYear;
    if (rankingYear == null || rankingYear <= 0) return;

    setState(() {
      _powerLoading = true;
      _powerError = null;
    });

    try {
      final rows = await _viewModel.loadPowerRankings(
        rankingYear: rankingYear,
        limit: _filters.powerLimit,
      );
      if (!mounted) return;
      setState(() {
        _powerRows = rows;
        _powerLoading = false;
      });
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _powerRows = [];
        _powerError = err.toString();
        _powerLoading = false;
      });
    }
  }

  void _openPlayerDetail({int? playerId}) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PlayerDetailScreen(
          initialPlayerId: playerId,
          initialSeasonId: _seasonId,
          apiService: _api,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('기록'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kTextTabBarHeight),
          child: TabBar(
            controller: _tabCtrl,
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            labelPadding: const EdgeInsets.symmetric(horizontal: 14),
            tabs: RecordsHubTab.values
                .map((tab) => Tab(text: tab.label))
                .toList(),
          ),
        ),
      ),
      body: _initializing
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                if (_tabCtrl.index != RecordsHubTab.playerDetail.index)
                  _buildFilterBar(),
                if (_loading) const LinearProgressIndicator(minHeight: 1),
                if (_error != null)
                  _Banner(
                    icon: Icons.error_outline,
                    tone: SeasonBadgeTone.danger,
                    text: _error!,
                  ),
                if (_warning != null)
                  _Banner(
                    icon: Icons.warning_amber_rounded,
                    tone: SeasonBadgeTone.warning,
                    text: _warning!,
                  ),
                Expanded(
                  child: TabBarView(
                    controller: _tabCtrl,
                    children: [
                      _buildOverviewTab(),
                      _buildStandingsTab(),
                      _buildPitchersTab(),
                      _buildBattersTab(),
                      _buildPowerTab(),
                      PlayerDetailScreen(
                        key: ValueKey<int?>(_seasonId),
                        initialSeasonId: _seasonId,
                        apiService: _api,
                        embedded: true,
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({
    required this.icon,
    required this.tone,
    required this.text,
  });

  final IconData icon;
  final SeasonBadgeTone tone;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final color = switch (tone) {
      SeasonBadgeTone.danger => colors.danger,
      SeasonBadgeTone.warning => colors.warning,
      SeasonBadgeTone.success => colors.success,
      _ => colors.cobalt,
    };
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(color: color, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterDropdown<T> extends StatelessWidget {
  const _FilterDropdown({
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
    this.enabled = true,
    this.width = 150,
  });

  final String label;
  final T? value;
  final List<DropdownMenuItem<T>> items;
  final ValueChanged<T?> onChanged;
  final bool enabled;
  final double width;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width,
      child: DropdownButtonFormField<T>(
        key: ValueKey<Object?>(value),
        isExpanded: true,
        initialValue: value,
        decoration: InputDecoration(
          isDense: true,
          labelText: label,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
        ),
        items: items,
        onChanged: enabled ? onChanged : null,
      ),
    );
  }
}

class _RegulationFilter extends StatelessWidget {
  const _RegulationFilter({
    required this.value,
    required this.available,
    required this.onChanged,
  });

  final RecordRegulation value;
  final List<RecordRegulation> available;
  final ValueChanged<RecordRegulation> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final options = available.isEmpty
        ? const [RecordRegulation.inRule, RecordRegulation.out]
        : available;
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: colors.surfaceMuted,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: colors.line),
      ),
      child: Row(
        children: options
            .map(
              (item) => Padding(
                padding: const EdgeInsets.only(right: 6),
                child: _regButton(
                  context,
                  label: item == RecordRegulation.out ? 'OUT' : 'IN',
                  active: value == item,
                  onTap: () => onChanged(item),
                ),
              ),
            )
            .toList(),
      ),
    );
  }

  Widget _regButton(BuildContext context,
      {required String label,
      required bool active,
      required VoidCallback onTap}) {
    final colors = context.aublColors;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 38, minWidth: 48),
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            color: active ? colors.surface : Colors.transparent,
            border: Border.all(
                color: active ? colors.lineStrong : Colors.transparent),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: active ? colors.navy : colors.muted,
              fontSize: 12,
              fontWeight: active ? FontWeight.w900 : FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(label,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: colors.muted, fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text(value,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: colors.navyStrong,
                      fontFamily: 'BarlowCondensed',
                      fontWeight: FontWeight.w900,
                    )),
          ],
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.title, required this.child, this.hint});

  final String title;
  final Widget child;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                if (hint != null) ...[
                  const Spacer(),
                  Text(
                    hint!,
                    style: TextStyle(color: colors.muted, fontSize: 11),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 10),
            child,
          ],
        ),
      ),
    );
  }
}

class _TopFivePanel<T> extends StatelessWidget {
  const _TopFivePanel({
    required this.title,
    required this.rows,
    required this.emptyText,
    required this.sortWidget,
    required this.itemBuilder,
  });

  final String title;
  final List<T> rows;
  final String emptyText;
  final Widget sortWidget;
  final Widget Function(T row) itemBuilder;

  @override
  Widget build(BuildContext context) {
    return _Card(
      title: title,
      child: Column(
        children: [
          Align(alignment: Alignment.centerRight, child: sortWidget),
          const SizedBox(height: 8),
          if (rows.isEmpty)
            _EmptyState(text: emptyText)
          else
            ...rows.map(itemBuilder),
        ],
      ),
    );
  }
}

class _TopPlayerTile extends StatelessWidget {
  const _TopPlayerTile({
    required this.rank,
    required this.name,
    required this.team,
    required this.value,
    required this.onTap,
  });

  final int rank;
  final String name;
  final String team;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            SizedBox(
              width: 28,
              child: Text('$rank',
                  style: TextStyle(
                      color: colors.navy, fontWeight: FontWeight.w900)),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                  Text(team,
                      style: TextStyle(color: colors.muted, fontSize: 12)),
                ],
              ),
            ),
            Text(value,
                style: TextStyle(
                    color: colors.cobalt,
                    fontSize: 13,
                    fontWeight: FontWeight.w900)),
          ],
        ),
      ),
    );
  }
}

class _SortItem<T> {
  const _SortItem({required this.value, required this.label});

  final T value;
  final String label;
}

class _SortDropdown<T> extends StatelessWidget {
  const _SortDropdown({
    required this.value,
    required this.items,
    required this.onChanged,
  });

  final T value;
  final List<_SortItem<T>> items;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 120,
      child: DropdownButtonFormField<T>(
        key: ValueKey<Object?>(value),
        isExpanded: true,
        initialValue: value,
        decoration: InputDecoration(
          isDense: true,
          labelText: '기준',
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
        ),
        items: items
            .map((item) => DropdownMenuItem<T>(
                value: item.value,
                child: Text(item.label, style: const TextStyle(fontSize: 12))))
            .toList(),
        onChanged: (next) {
          if (next == null) return;
          onChanged(next);
        },
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Padding(
      padding: const EdgeInsets.all(18),
      child: Center(
        child: Text(
          text,
          style: TextStyle(color: colors.muted, fontSize: 13),
        ),
      ),
    );
  }
}

const _thStyle = TextStyle(fontSize: 12, fontWeight: FontWeight.w800);
const _cellStyle = TextStyle(fontSize: 12);
const _linkCellStyle = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w800,
    decoration: TextDecoration.underline);
final _numStyle =
    _cellStyle.copyWith(fontFeatures: const [FontFeature.tabularFigures()]);

extension _IterableFirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
