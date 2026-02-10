import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

// ── Mock 타자 데이터 (웹과 동일) ──
class _BatterStat {
  const _BatterStat({
    required this.name, required this.team, required this.year,
    required this.avg, required this.obp, required this.slg,
    required this.ops, required this.hr, required this.rbi,
    required this.sb, required this.war,
  });
  final String name, team;
  final int year, hr, rbi, sb;
  final double avg, obp, slg, ops, war;
}

const _batterStats = [
  _BatterStat(name:'서준호',team:'한양대 불새',year:2024,avg:.385,obp:.462,slg:.654,ops:1.116,hr:5,rbi:28,sb:12,war:4.2),
  _BatterStat(name:'김하늘',team:'연세대 EAGLES',year:2024,avg:.367,obp:.441,slg:.600,ops:1.041,hr:4,rbi:22,sb:8,war:3.8),
  _BatterStat(name:'전유진',team:'고려대 백구회',year:2024,avg:.350,obp:.420,slg:.550,ops:.970,hr:3,rbi:19,sb:15,war:3.5),
  _BatterStat(name:'윤태훈',team:'중앙대 랑데뷰',year:2024,avg:.340,obp:.405,slg:.520,ops:.925,hr:2,rbi:17,sb:20,war:3.2),
  _BatterStat(name:'박민수',team:'성균관대 킹고야구반',year:2024,avg:.332,obp:.398,slg:.500,ops:.898,hr:2,rbi:15,sb:6,war:2.9),
  _BatterStat(name:'강건우',team:'서강대 알바트로스',year:2024,avg:.328,obp:.390,slg:.480,ops:.870,hr:1,rbi:14,sb:10,war:2.7),
  _BatterStat(name:'박지온',team:'한국외대 야구부',year:2024,avg:.310,obp:.375,slg:.460,ops:.835,hr:1,rbi:12,sb:5,war:2.4),
  _BatterStat(name:'정재원',team:'한양대 불새',year:2023,avg:.372,obp:.450,slg:.620,ops:1.070,hr:4,rbi:25,sb:10,war:4.0),
  _BatterStat(name:'신지환',team:'연세대 EAGLES',year:2023,avg:.355,obp:.430,slg:.580,ops:1.010,hr:3,rbi:20,sb:14,war:3.6),
  _BatterStat(name:'김세인',team:'고려대 백구회',year:2023,avg:.340,obp:.410,slg:.540,ops:.950,hr:2,rbi:18,sb:9,war:3.3),
];

// ── Mock 투수 데이터 ──
class _PitcherStat {
  const _PitcherStat({
    required this.name, required this.team, required this.year,
    required this.era, required this.ip, required this.whip,
    required this.so, required this.bb, required this.sv,
    required this.war,
  });
  final String name, team;
  final int year, so, bb, sv;
  final double era, ip, whip, war;
  double get kbb => bb > 0 ? so / bb : 0;
}

const _pitcherStats = [
  _PitcherStat(name:'임동현',team:'한양대 불새',year:2024,era:1.25,ip:50.1,whip:0.89,so:62,bb:12,sv:0,war:4.5),
  _PitcherStat(name:'이도현',team:'연세대 EAGLES',year:2024,era:1.80,ip:45.0,whip:0.95,so:55,bb:14,sv:2,war:3.9),
  _PitcherStat(name:'최민재',team:'고려대 백구회',year:2024,era:2.10,ip:42.2,whip:1.02,so:48,bb:10,sv:1,war:3.5),
  _PitcherStat(name:'이수안',team:'성균관대 킹고야구반',year:2024,era:2.45,ip:40.0,whip:1.10,so:42,bb:15,sv:0,war:3.0),
  _PitcherStat(name:'강현우',team:'중앙대 랑데뷰',year:2024,era:2.80,ip:38.1,whip:1.15,so:38,bb:12,sv:3,war:2.7),
  _PitcherStat(name:'문하림',team:'한양대 불새',year:2023,era:1.50,ip:48.0,whip:0.92,so:58,bb:11,sv:1,war:4.2),
  _PitcherStat(name:'임동현',team:'한양대 불새',year:2023,era:1.90,ip:42.2,whip:0.98,so:50,bb:13,sv:0,war:3.7),
  _PitcherStat(name:'마준호',team:'연세대 EAGLES',year:2023,era:2.20,ip:40.1,whip:1.05,so:45,bb:14,sv:2,war:3.3),
  _PitcherStat(name:'한지훈',team:'고려대 백구회',year:2023,era:2.60,ip:38.0,whip:1.12,so:40,bb:16,sv:0,war:2.8),
];

class RecordsScreen extends StatefulWidget {
  const RecordsScreen({super.key});

  @override
  State<RecordsScreen> createState() => _RecordsScreenState();
}

class _RecordsScreenState extends State<RecordsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl;
  int _selectedYear = 2024;

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
        actions: [
          DropdownButton<int>(
            value: _selectedYear,
            dropdownColor: AppTheme.slate700,
            underline: const SizedBox.shrink(),
            style: const TextStyle(color: Colors.white, fontSize: 14),
            items: [2024, 2023]
                .map((y) => DropdownMenuItem(value: y, child: Text('$y')))
                .toList(),
            onChanged: (v) {
              if (v != null) setState(() => _selectedYear = v);
            },
          ),
          const SizedBox(width: 8),
        ],
        bottom: TabBar(
          controller: _tabCtrl,
          tabs: const [Tab(text: '타자'), Tab(text: '투수')],
        ),
      ),
      body: TabBarView(
        controller: _tabCtrl,
        children: [
          _BatterTable(year: _selectedYear),
          _PitcherTable(year: _selectedYear),
        ],
      ),
    );
  }
}

class _BatterTable extends StatelessWidget {
  const _BatterTable({required this.year});
  final int year;

  @override
  Widget build(BuildContext context) {
    final stats = _batterStats.where((s) => s.year == year).toList()
      ..sort((a, b) {
        final c = b.ops.compareTo(a.ops);
        return c != 0 ? c : b.war.compareTo(a.war);
      });

    if (stats.isEmpty) {
      return const Center(
        child: Text('해당 시즌 데이터가 없습니다.',
            style: TextStyle(color: AppTheme.slate500)),
      );
    }

    return SingleChildScrollView(
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
            DataColumn(label: Text('WAR', style: _headerStyle), numeric: true),
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
                DataCell(Text('${i + 1}', style: _cellStyle)),
                DataCell(Text(s.name,
                    style: _cellStyle.copyWith(fontWeight: FontWeight.w500))),
                DataCell(Text(s.team,
                    style: _cellStyle.copyWith(
                        fontSize: 11, color: AppTheme.slate400))),
                DataCell(Text(s.avg.toStringAsFixed(3),
                    style: _numStyle)),
                DataCell(Text(s.obp.toStringAsFixed(3),
                    style: _numStyle)),
                DataCell(Text(s.slg.toStringAsFixed(3),
                    style: _numStyle)),
                DataCell(Text(s.ops.toStringAsFixed(3),
                    style: _numStyle.copyWith(color: AppTheme.orange500))),
                DataCell(Text('${s.hr}', style: _numStyle)),
                DataCell(Text('${s.rbi}', style: _numStyle)),
                DataCell(Text('${s.sb}',
                    style: _numStyle.copyWith(
                        color: s.sb >= 15
                            ? AppTheme.green500
                            : null))),
                DataCell(Text(s.war.toStringAsFixed(1),
                    style: _numStyle.copyWith(color: AppTheme.yellow500))),
              ],
            );
          }),
        ),
      ),
    );
  }
}

class _PitcherTable extends StatelessWidget {
  const _PitcherTable({required this.year});
  final int year;

  @override
  Widget build(BuildContext context) {
    final stats = _pitcherStats.where((s) => s.year == year).toList()
      ..sort((a, b) {
        final c = a.era.compareTo(b.era);
        return c != 0 ? c : b.war.compareTo(a.war);
      });

    if (stats.isEmpty) {
      return const Center(
        child: Text('해당 시즌 데이터가 없습니다.',
            style: TextStyle(color: AppTheme.slate500)),
      );
    }

    return SingleChildScrollView(
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
            DataColumn(label: Text('WAR', style: _headerStyle), numeric: true),
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
                DataCell(Text('${i + 1}', style: _cellStyle)),
                DataCell(Text(s.name,
                    style: _cellStyle.copyWith(fontWeight: FontWeight.w500))),
                DataCell(Text(s.team,
                    style: _cellStyle.copyWith(
                        fontSize: 11, color: AppTheme.slate400))),
                DataCell(Text(s.era.toStringAsFixed(2),
                    style: _numStyle)),
                DataCell(Text(s.ip.toStringAsFixed(1),
                    style: _numStyle)),
                DataCell(Text(s.whip.toStringAsFixed(2),
                    style: _numStyle)),
                DataCell(Text('${s.so}', style: _numStyle)),
                DataCell(Text('${s.bb}', style: _numStyle)),
                DataCell(Text(s.kbb.toStringAsFixed(2),
                    style: _numStyle.copyWith(
                        color: s.kbb >= 4
                            ? AppTheme.green500
                            : AppTheme.yellow500))),
                DataCell(Text('${s.sv}', style: _numStyle)),
                DataCell(Text(s.war.toStringAsFixed(1),
                    style: _numStyle.copyWith(color: AppTheme.orange500))),
              ],
            );
          }),
        ),
      ),
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
