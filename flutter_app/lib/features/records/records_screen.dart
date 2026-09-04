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
  final TextEditingController _searchController = TextEditingController();

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
    _searchController.dispose();
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
    final groups =
        _recordFilterOptions?.groups
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
    final divisions =
        _recordFilterOptions?.playoffDivisions.toSet().toList() ??
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
    final regulations =
        _recordFilterOptions?.regulations.toSet().toList() ??
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
        .map(
          (item) => _SortItem<BatterRankingSort>(
            value: item,
            label: _batterSortLabel(item),
          ),
        )
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
        .map(
          (item) => _SortItem<PitcherRankingSort>(
            value: item,
            label: _pitcherSortLabel(item),
          ),
        )
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
            RecordPlayoffDivision.beogeum,
          ]
        : [RecordPlayoffDivision.all, ...optionDivisions];
    if (!allowedDivisions.contains(next.playoffDivision)) {
      next = next.copyWith(playoffDivision: RecordPlayoffDivision.all);
    }
    if (next.scope != RecordScope.playoff &&
        next.playoffDivision != RecordPlayoffDivision.all) {
      next = next.copyWith(playoffDivision: RecordPlayoffDivision.all);
    }

    final allowedRegulations =
        options?.regulations.toSet().toList() ??
        const [RecordRegulation.inRule, RecordRegulation.out];
    if (!allowedRegulations.contains(next.regulation)) {
      final fallback =
          options?.defaultRegulation ??
          (allowedRegulations.isEmpty
              ? RecordRegulation.inRule
              : allowedRegulations.first);
      next = next.copyWith(regulation: fallback);
    }

    final allowedBatterSorts =
        (options?.batterSortOptions ??
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

    final allowedPitcherSorts =
        (options?.pitcherSortOptions ??
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

  Future<void> _applySearchFilter() async {
    _setState(() {
      _filters = _filters.copyWith(searchQuery: _searchController.text);
    });
    await _reloadRecords();
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
  const _Banner({required this.icon, required this.tone, required this.text});

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
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: TextStyle(color: color, fontSize: 12)),
          ),
        ],
      ),
    );
  }
}

class _CompactFilterSummary extends StatelessWidget {
  const _CompactFilterSummary({required this.summary, required this.onPressed});

  final String summary;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final summaryWidget = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '현재 조회 조건',
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: colors.cobalt,
            fontWeight: FontWeight.w900,
            letterSpacing: .6,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          summary,
          maxLines: 3,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: colors.ink,
            fontWeight: FontWeight.w700,
            height: 1.35,
          ),
        ),
      ],
    );
    final button = ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 46),
      child: OutlinedButton.icon(
        onPressed: onPressed,
        icon: const Icon(Icons.tune, size: 18),
        label: const Text('검색·필터'),
      ),
    );
    final textScale = MediaQuery.textScalerOf(context).scale(1);
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 340 || textScale > 1.4) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [summaryWidget, const SizedBox(height: 10), button],
          );
        }
        return Row(
          children: [
            Expanded(child: summaryWidget),
            const SizedBox(width: 12),
            button,
          ],
        );
      },
    );
  }
}

class _RecordsRefreshList extends StatelessWidget {
  const _RecordsRefreshList({required this.onRefresh, required this.children});

  final Future<void> Function() onRefresh;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final horizontalPadding = constraints.maxWidth < 600 ? 12.0 : 20.0;
        return RefreshIndicator(
          onRefresh: onRefresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: EdgeInsets.fromLTRB(
              horizontalPadding,
              16,
              horizontalPadding,
              28,
            ),
            children: [
              Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1180),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: children,
                  ),
                ),
              ),
            ],
          ),
        );
      },
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
          labelText: label,
          constraints: const BoxConstraints(minHeight: 48),
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
      constraints: const BoxConstraints(minHeight: 48),
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: colors.surfaceMuted,
        borderRadius: BorderRadius.circular(3),
        border: Border.all(color: colors.line),
      ),
      child: Row(
        children: [
          for (var index = 0; index < options.length; index++)
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(
                  right: index == options.length - 1 ? 0 : 4,
                ),
                child: _regButton(
                  context,
                  label: options[index] == RecordRegulation.out
                      ? '규정 미충족'
                      : '규정 충족',
                  active: value == options[index],
                  onTap: () => onChanged(options[index]),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _regButton(
    BuildContext context, {
    required String label,
    required bool active,
    required VoidCallback onTap,
  }) {
    final colors = context.aublColors;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(2),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 44, minWidth: 72),
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(2),
            color: active ? colors.surface : Colors.transparent,
            border: Border.all(
              color: active ? colors.lineStrong : Colors.transparent,
            ),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
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
    return Container(
      constraints: const BoxConstraints(minHeight: 104),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: colors.line),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              label,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: colors.muted,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                color: colors.navyStrong,
                fontFamily: 'BarlowCondensed',
                fontWeight: FontWeight.w900,
              ),
            ),
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
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: colors.line),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: colors.navyStrong,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                if (hint != null) ...[
                  const SizedBox(width: 12),
                  Text(
                    hint!,
                    textAlign: TextAlign.end,
                    style: TextStyle(color: colors.muted, fontSize: 11),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 9),
            Container(height: 2, color: colors.navy),
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
      borderRadius: BorderRadius.circular(2),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 56),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            children: [
              SizedBox(
                width: 28,
                child: Text(
                  '$rank',
                  style: TextStyle(
                    color: colors.navy,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    Text(
                      team,
                      style: TextStyle(color: colors.muted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              Text(
                value,
                style: TextStyle(
                  color: colors.cobalt,
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RecordSortChoice {
  const _RecordSortChoice(this.column, this.label, this.ascendingByDefault);

  final int column;
  final String label;
  final bool ascendingByDefault;
}

class _CompactRankingToolbar extends StatelessWidget {
  const _CompactRankingToolbar({
    required this.value,
    required this.ascending,
    required this.choices,
    required this.onSortChanged,
    required this.onDirectionChanged,
  });

  final int value;
  final bool ascending;
  final List<_RecordSortChoice> choices;
  final ValueChanged<_RecordSortChoice> onSortChanged;
  final VoidCallback onDirectionChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: colors.surfaceMuted,
        borderRadius: BorderRadius.circular(3),
        border: Border.all(color: colors.line),
      ),
      child: Row(
        children: [
          Expanded(
            child: DropdownButtonFormField<int>(
              key: ValueKey<int>(value),
              initialValue: value,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: '목록 정렬',
                constraints: BoxConstraints(minHeight: 48),
              ),
              items: choices
                  .map(
                    (choice) => DropdownMenuItem<int>(
                      value: choice.column,
                      child: Text(choice.label),
                    ),
                  )
                  .toList(),
              onChanged: (next) {
                if (next == null) return;
                onSortChanged(
                  choices.firstWhere((choice) => choice.column == next),
                );
              },
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 48,
            height: 48,
            child: Semantics(
              button: true,
              label: ascending ? '오름차순, 정렬 방향 바꾸기' : '내림차순, 정렬 방향 바꾸기',
              child: ExcludeSemantics(
                child: OutlinedButton(
                  onPressed: onDirectionChanged,
                  style: OutlinedButton.styleFrom(padding: EdgeInsets.zero),
                  child: Icon(
                    ascending ? Icons.arrow_upward : Icons.arrow_downward,
                    size: 19,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CompactStat {
  const _CompactStat(this.label, this.value);

  final String label;
  final String value;
}

class _CompactPlayerRankingRow extends StatelessWidget {
  const _CompactPlayerRankingRow({
    required this.rank,
    required this.name,
    required this.team,
    required this.jerseyNumber,
    required this.primaryLabel,
    required this.primaryValue,
    required this.stats,
    required this.onTap,
  });

  final int rank;
  final String name;
  final String team;
  final String jerseyNumber;
  final String primaryLabel;
  final String primaryValue;
  final List<_CompactStat> stats;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Semantics(
      button: true,
      excludeSemantics: true,
      label: '공식 순위 $rank위, $name, $team, $primaryLabel $primaryValue',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(2),
        child: Container(
          constraints: const BoxConstraints(minHeight: 88),
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: colors.line)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 38,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '$rank',
                          style: const TextStyle(
                            fontFamily: 'BarlowCondensed',
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                        Text(
                          '공식',
                          style: Theme.of(context).textTheme.labelSmall
                              ?.copyWith(color: colors.muted, fontSize: 9),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: colors.ink,
                            fontWeight: FontWeight.w900,
                            height: 1.25,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '$team${jerseyNumber.isEmpty ? '' : ' · $jerseyNumber번'}',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: colors.muted,
                            fontSize: 12,
                            height: 1.35,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 96),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          primaryLabel,
                          maxLines: 2,
                          textAlign: TextAlign.end,
                          style: TextStyle(
                            color: colors.muted,
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Text(
                          primaryValue,
                          maxLines: 1,
                          style: TextStyle(
                            color: colors.cobalt,
                            fontFamily: 'BarlowCondensed',
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Padding(
                padding: const EdgeInsets.only(left: 38),
                child: Wrap(
                  spacing: 14,
                  runSpacing: 6,
                  children: stats
                      .map(
                        (stat) => Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(
                                text: '${stat.label} ',
                                style: TextStyle(
                                  color: colors.muted,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              TextSpan(
                                text: stat.value,
                                style: TextStyle(
                                  color: colors.ink,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w900,
                                  fontFeatures: const [
                                    FontFeature.tabularFigures(),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      )
                      .toList(),
                ),
              ),
            ],
          ),
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
      width: 144,
      child: DropdownButtonFormField<T>(
        key: ValueKey<Object?>(value),
        isExpanded: true,
        initialValue: value,
        decoration: const InputDecoration(
          labelText: '순위 기준',
          constraints: BoxConstraints(minHeight: 48),
        ),
        items: items
            .map(
              (item) => DropdownMenuItem<T>(
                value: item.value,
                child: Text(item.label, style: const TextStyle(fontSize: 12)),
              ),
            )
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
        child: Text(text, style: TextStyle(color: colors.muted, fontSize: 13)),
      ),
    );
  }
}

const _thStyle = TextStyle(fontSize: 12, fontWeight: FontWeight.w800);
const _cellStyle = TextStyle(fontSize: 12);
const _linkCellStyle = TextStyle(
  fontSize: 12,
  fontWeight: FontWeight.w800,
  decoration: TextDecoration.underline,
);
final _numStyle = _cellStyle.copyWith(
  fontFeatures: const [FontFeature.tabularFigures()],
);

extension _IterableFirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
