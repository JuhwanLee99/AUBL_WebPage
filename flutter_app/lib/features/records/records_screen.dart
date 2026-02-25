import 'package:flutter/material.dart';

import '../../core/services/backend_api_service.dart';
import '../../core/theme/app_theme.dart';
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

      await _reloadRecords();
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _error = err.toString();
        _initializing = false;
      });
    }
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
            isScrollable: false,
            labelPadding: const EdgeInsets.symmetric(horizontal: 6),
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
                    color: AppTheme.red500,
                    text: _error!,
                  ),
                if (_warning != null)
                  _Banner(
                    icon: Icons.warning_amber_rounded,
                    color: AppTheme.orange500,
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
    required this.color,
    required this.text,
  });

  final IconData icon;
  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
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
    required this.onChanged,
  });

  final RecordRegulation value;
  final ValueChanged<RecordRegulation> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppTheme.slate700),
      ),
      child: Row(
        children: [
          _regButton(
              label: 'IN',
              active: value == RecordRegulation.inRule,
              onTap: () => onChanged(RecordRegulation.inRule)),
          const SizedBox(width: 6),
          _regButton(
              label: 'OUT',
              active: value == RecordRegulation.out,
              onTap: () => onChanged(RecordRegulation.out)),
        ],
      ),
    );
  }

  Widget _regButton(
      {required String label,
      required bool active,
      required VoidCallback onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          color: active
              ? AppTheme.blue500.withValues(alpha: 0.22)
              : Colors.transparent,
          border:
              Border.all(color: active ? AppTheme.blue400 : AppTheme.slate700),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: active ? AppTheme.blue400 : AppTheme.slate300,
            fontSize: 12,
            fontWeight: FontWeight.w700,
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
    return Container(
      width: 168,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTheme.slate700),
        color: AppTheme.slate800.withValues(alpha: 0.35),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: const TextStyle(
                  color: AppTheme.slate400,
                  fontSize: 12,
                  fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(value,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w800)),
        ],
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
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.slate700.withValues(alpha: 0.7)),
        color: AppTheme.slate800.withValues(alpha: 0.35),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                title,
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w700),
              ),
              if (hint != null) ...[
                const Spacer(),
                Text(
                  hint!,
                  style: const TextStyle(
                      color: AppTheme.slate500, fontSize: 10),
                ),
              ],
            ],
          ),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}

class _TopFivePanel<T> extends StatelessWidget {
  const _TopFivePanel({
    required this.title,
    required this.accent,
    required this.rows,
    required this.emptyText,
    required this.sortWidget,
    required this.itemBuilder,
  });

  final String title;
  final Color accent;
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
                  style: const TextStyle(
                      color: AppTheme.slate300, fontWeight: FontWeight.w700)),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                      style: const TextStyle(
                          color: Colors.white, fontWeight: FontWeight.w700)),
                  Text(team,
                      style: const TextStyle(
                          color: AppTheme.slate500, fontSize: 12)),
                ],
              ),
            ),
            Text(value,
                style: const TextStyle(
                    color: AppTheme.slate200,
                    fontSize: 13,
                    fontWeight: FontWeight.w700)),
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
    return Padding(
      padding: const EdgeInsets.all(18),
      child: Center(
        child: Text(
          text,
          style: const TextStyle(color: AppTheme.slate500, fontSize: 13),
        ),
      ),
    );
  }
}

const _thStyle = TextStyle(
    color: AppTheme.slate300, fontSize: 12, fontWeight: FontWeight.w700);
const _cellStyle = TextStyle(color: Colors.white, fontSize: 12);
const _linkCellStyle = TextStyle(
    color: AppTheme.blue400, fontSize: 12, fontWeight: FontWeight.w700);
final _numStyle =
    _cellStyle.copyWith(fontFeatures: const [FontFeature.tabularFigures()]);

extension _IterableFirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
