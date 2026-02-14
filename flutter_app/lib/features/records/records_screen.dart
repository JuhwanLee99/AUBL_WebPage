import 'package:flutter/material.dart';

import '../../core/services/backend_api_service.dart';
import '../../core/theme/app_theme.dart';

class RecordsScreen extends StatefulWidget {
  const RecordsScreen({super.key});

  @override
  State<RecordsScreen> createState() => _RecordsScreenState();
}

class _RecordsScreenState extends State<RecordsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('기록'),
        bottom: TabBar(
          controller: _tabCtrl,
          tabs: const [Tab(text: '타자'), Tab(text: '투수')],
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
            child: TextField(
              decoration: const InputDecoration(
                hintText: '선수명 또는 팀명 검색...',
                prefixIcon: Icon(Icons.search),
                contentPadding:
                    EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              ),
              onChanged: (v) => setState(() => _searchQuery = v),
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: _tabCtrl,
              children: [
                _BatterTable(search: _searchQuery),
                _PitcherTable(search: _searchQuery),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BatterTable extends StatefulWidget {
  const _BatterTable({this.search = ''});
  final String search;

  @override
  State<_BatterTable> createState() => _BatterTableState();
}

class _BatterTableState extends State<_BatterTable> {
  final _api = BackendApiService();
  List<BatterRanking>? _data;
  String? _error;
  String _sort = 'ops';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _api.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _data = null;
      _error = null;
    });
    try {
      final result = await _api.getBatterRankings(sort: _sort, limit: 50);
      if (!mounted) return;
      setState(() => _data = result);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Center(
        child: Text('오류: $_error', style: const TextStyle(color: AppTheme.red500)),
      );
    }
    if (_data == null) {
      return const Center(child: CircularProgressIndicator());
    }

    final q = widget.search.toLowerCase();
    final stats = _data!
        .where((s) =>
            q.isEmpty ||
            s.playerName.toLowerCase().contains(q) ||
            s.teamName.toLowerCase().contains(q))
        .toList();

    if (stats.isEmpty) {
      return const Center(
        child: Text('해당 데이터가 없습니다.',
            style: TextStyle(color: AppTheme.slate500)),
      );
    }

    return Column(
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          child: Row(
            children: ['ops', 'avg', 'hits', 'hr']
                .map((key) => Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(
                        label: Text(key.toUpperCase(),
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                        selected: _sort == key,
                        onSelected: (_) {
                          setState(() => _sort = key);
                          _load();
                        },
                      ),
                    ))
                .toList(),
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SingleChildScrollView(
              child: DataTable(
                headingRowColor: WidgetStateProperty.all(AppTheme.slate800),
                columnSpacing: 14,
                dataRowMinHeight: 36,
                dataRowMaxHeight: 40,
                columns: const [
                  DataColumn(label: Text('#', style: _headerStyle)),
                  DataColumn(label: Text('이름', style: _headerStyle)),
                  DataColumn(label: Text('팀', style: _headerStyle)),
                  DataColumn(label: Text('AVG', style: _headerStyle), numeric: true),
                  DataColumn(label: Text('OBP', style: _headerStyle), numeric: true),
                  DataColumn(label: Text('SLG', style: _headerStyle), numeric: true),
                  DataColumn(label: Text('OPS', style: _headerStyle), numeric: true),
                  DataColumn(label: Text('HR', style: _headerStyle), numeric: true),
                  DataColumn(label: Text('RBI', style: _headerStyle), numeric: true),
                  DataColumn(label: Text('SB', style: _headerStyle), numeric: true),
                  DataColumn(label: Text('G', style: _headerStyle), numeric: true),
                ],
                rows: List.generate(stats.length, (i) {
                  final s = stats[i];
                  final isTop3 = i < 3;
                  final rowColor = isTop3
                      ? AppTheme.blue500.withValues(alpha: 0.08)
                      : Colors.transparent;

                  return DataRow(
                    color: WidgetStateProperty.all(rowColor),
                    cells: [
                      DataCell(Text('${s.rank}', style: _cellStyle)),
                      DataCell(Text(s.playerName,
                          style: _cellStyle.copyWith(fontWeight: FontWeight.w500))),
                      DataCell(Text(s.teamName,
                          style: _cellStyle.copyWith(
                              fontSize: 11, color: AppTheme.slate400))),
                      DataCell(Text(s.battingAverage.toStringAsFixed(3),
                          style: _numStyle)),
                      DataCell(Text(s.onBasePct.toStringAsFixed(3),
                          style: _numStyle)),
                      DataCell(Text(s.sluggingPct.toStringAsFixed(3),
                          style: _numStyle)),
                      DataCell(Text(s.ops.toStringAsFixed(3),
                          style: _numStyle.copyWith(color: AppTheme.orange500))),
                      DataCell(Text('${s.homeRuns}', style: _numStyle)),
                      DataCell(Text('${s.runsBattedIn}', style: _numStyle)),
                      DataCell(Text('${s.stolenBases}',
                          style: _numStyle.copyWith(
                              color: s.stolenBases >= 15
                                  ? AppTheme.green500
                                  : null))),
                      DataCell(Text('${s.gamesPlayed}', style: _numStyle)),
                    ],
                  );
                }),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _PitcherTable extends StatefulWidget {
  const _PitcherTable({this.search = ''});
  final String search;

  @override
  State<_PitcherTable> createState() => _PitcherTableState();
}

class _PitcherTableState extends State<_PitcherTable> {
  final _api = BackendApiService();
  List<PitcherRanking>? _data;
  String? _error;
  String _sort = 'era';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _api.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _data = null;
      _error = null;
    });
    try {
      final result = await _api.getPitcherRankings(sort: _sort, limit: 50);
      if (!mounted) return;
      setState(() => _data = result);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Center(
        child: Text('오류: $_error', style: const TextStyle(color: AppTheme.red500)),
      );
    }
    if (_data == null) {
      return const Center(child: CircularProgressIndicator());
    }

    final q = widget.search.toLowerCase();
    final stats = _data!
        .where((s) =>
            q.isEmpty ||
            s.playerName.toLowerCase().contains(q) ||
            s.teamName.toLowerCase().contains(q))
        .toList();

    if (stats.isEmpty) {
      return const Center(
        child: Text('해당 데이터가 없습니다.',
            style: TextStyle(color: AppTheme.slate500)),
      );
    }

    return Column(
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          child: Row(
            children: ['era', 'whip', 'so', 'wins', 'saves']
                .map((key) => Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(
                        label: Text(
                          {'era': 'ERA', 'whip': 'WHIP', 'so': 'K', 'wins': 'W', 'saves': 'SV'}[key]!,
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                        ),
                        selected: _sort == key,
                        onSelected: (_) {
                          setState(() => _sort = key);
                          _load();
                        },
                      ),
                    ))
                .toList(),
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SingleChildScrollView(
              child: DataTable(
                headingRowColor: WidgetStateProperty.all(AppTheme.slate800),
                columnSpacing: 14,
                dataRowMinHeight: 36,
                dataRowMaxHeight: 40,
                columns: const [
                  DataColumn(label: Text('#', style: _headerStyle)),
                  DataColumn(label: Text('이름', style: _headerStyle)),
                  DataColumn(label: Text('팀', style: _headerStyle)),
                  DataColumn(label: Text('ERA', style: _headerStyle), numeric: true),
                  DataColumn(label: Text('IP', style: _headerStyle), numeric: true),
                  DataColumn(label: Text('WHIP', style: _headerStyle), numeric: true),
                  DataColumn(label: Text('K', style: _headerStyle), numeric: true),
                  DataColumn(label: Text('BB', style: _headerStyle), numeric: true),
                  DataColumn(label: Text('K/BB', style: _headerStyle), numeric: true),
                  DataColumn(label: Text('SV', style: _headerStyle), numeric: true),
                  DataColumn(label: Text('W-L', style: _headerStyle), numeric: true),
                ],
                rows: List.generate(stats.length, (i) {
                  final s = stats[i];
                  final isTop3 = i < 3;
                  final rowColor = isTop3
                      ? AppTheme.blue500.withValues(alpha: 0.08)
                      : Colors.transparent;

                  return DataRow(
                    color: WidgetStateProperty.all(rowColor),
                    cells: [
                      DataCell(Text('${s.rank}', style: _cellStyle)),
                      DataCell(Text(s.playerName,
                          style: _cellStyle.copyWith(fontWeight: FontWeight.w500))),
                      DataCell(Text(s.teamName,
                          style: _cellStyle.copyWith(
                              fontSize: 11, color: AppTheme.slate400))),
                      DataCell(Text(s.era.toStringAsFixed(2),
                          style: _numStyle)),
                      DataCell(Text(s.inningsPitched.toStringAsFixed(1),
                          style: _numStyle)),
                      DataCell(Text(s.whip.toStringAsFixed(2),
                          style: _numStyle)),
                      DataCell(Text('${s.strikeouts}', style: _numStyle)),
                      DataCell(Text('${s.walksAllowed}', style: _numStyle)),
                      DataCell(Text(s.kbb.toStringAsFixed(2),
                          style: _numStyle.copyWith(
                              color: s.kbb >= 4
                                  ? AppTheme.green500
                                  : AppTheme.yellow500))),
                      DataCell(Text('${s.saves}', style: _numStyle)),
                      DataCell(Text('${s.wins}-${s.losses}',
                          style: _numStyle.copyWith(color: AppTheme.orange500))),
                    ],
                  );
                }),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

const _headerStyle = TextStyle(
  color: AppTheme.slate300,
  fontSize: 12,
  fontWeight: FontWeight.w600,
);

const _cellStyle = TextStyle(color: Colors.white, fontSize: 12);

final _numStyle = _cellStyle.copyWith(
  fontFeatures: const [FontFeature.tabularFigures()],
);
