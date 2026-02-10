import 'dart:math';

import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'power_ranking_screen.dart';

// ── Mock 데이터 (웹의 mockData.ts + rankingEngine.ts 기반) ──
class _TeamRank {
  _TeamRank({
    required this.name,
    required this.colorHex,
  });
  final String name;
  final String colorHex;
  int wins = 0, losses = 0, draws = 0;
  double elo = 1500;

  int get games => wins + losses + draws;
  double get winRate => games > 0 ? wins / games : 0;

  Color get color {
    final hex = colorHex.replaceFirst('#', '');
    return Color(int.parse('FF$hex', radix: 16));
  }
}

// Elo 계산 (웹 rankingEngine.ts 포팅)
List<_TeamRank> _calculateRankings() {
  final teams = [
    _TeamRank(name: '한양대 불새', colorHex: '#4f46e5'),
    _TeamRank(name: '연세대 EAGLES', colorHex: '#8b5cf6'),
    _TeamRank(name: '고려대 백구회', colorHex: '#f59e0b'),
    _TeamRank(name: '중앙대 랑데뷰', colorHex: '#ef4444'),
    _TeamRank(name: '성균관대 킹고야구반', colorHex: '#10b981'),
    _TeamRank(name: '서강대 알바트로스', colorHex: '#3b82f6'),
    _TeamRank(name: '한국외대 야구부', colorHex: '#f97316'),
  ];

  // Mock match results
  final matches = [
    ('한양대 불새', '연세대 EAGLES', 3, 2),
    ('연세대 EAGLES', '고려대 백구회', 1, 1),
    ('고려대 백구회', '한양대 불새', 0, 2),
    ('중앙대 랑데뷰', '성균관대 킹고야구반', 5, 4),
    ('한양대 불새', '성균관대 킹고야구반', 2, 6),
    ('서강대 알바트로스', '중앙대 랑데뷰', 3, 3),
    ('한국외대 야구부', '서강대 알바트로스', 4, 1),
  ];

  const kFactor = 32.0;

  for (final (homeName, awayName, hs, as_) in matches) {
    final home = teams.firstWhere((t) => t.name == homeName);
    final away = teams.firstWhere((t) => t.name == awayName);

    final ratingDiff = away.elo - home.elo;
    final expectedHome = 1.0 / (1.0 + pow(10, ratingDiff / 400));
    final double actual;
    if (hs > as_) {
      home.wins++;
      away.losses++;
      actual = 1.0;
    } else if (hs < as_) {
      home.losses++;
      away.wins++;
      actual = 0.0;
    } else {
      home.draws++;
      away.draws++;
      actual = 0.5;
    }

    final mov = log((hs - as_).abs() + 1);
    final delta = (kFactor * mov * (actual - expectedHome)).round();
    home.elo += delta;
    away.elo -= delta;
  }

  teams.sort((a, b) => b.elo.compareTo(a.elo));
  return teams;
}

class StandingsScreen extends StatelessWidget {
  const StandingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final rankings = _calculateRankings();
    final top = rankings.first;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          // ── 히어로 ──
          SliverToBoxAdapter(
            child: Container(
              width: double.infinity,
              padding: EdgeInsets.fromLTRB(
                  20, MediaQuery.of(context).padding.top + 16, 20, 24),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Color(0xFF0a1a3f),
                    Color(0xFF0f2f8f),
                    Color(0xFF0a1a3f),
                  ],
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      GestureDetector(
                        onTap: () => Navigator.of(context).pop(),
                        child: const Icon(Icons.arrow_back, color: Colors.white),
                      ),
                      const SizedBox(width: 12),
                      const Text('순위',
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 20,
                              fontWeight: FontWeight.bold)),
                    ],
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'Elo 레이팅 기반 실시간 팀 순위',
                    style: TextStyle(color: AppTheme.slate400, fontSize: 13),
                  ),
                ],
              ),
            ),
          ),

          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  // ── 1위 하이라이트 ──
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          top.color.withValues(alpha: 0.3),
                          AppTheme.slate800,
                        ],
                      ),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                          color: top.color.withValues(alpha: 0.4)),
                    ),
                    child: Column(
                      children: [
                        const Text('현재 1위',
                            style: TextStyle(
                                color: AppTheme.slate400, fontSize: 12)),
                        const SizedBox(height: 4),
                        Text(top.name,
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 20,
                                fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: top.winRate,
                            backgroundColor:
                                AppTheme.slate700.withValues(alpha: 0.5),
                            color: top.color,
                            minHeight: 6,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text('Elo ${top.elo.round()}',
                                style: TextStyle(
                                    color: top.color, fontSize: 14)),
                            const SizedBox(width: 16),
                            Text(
                                '승률 ${(top.winRate * 100).toStringAsFixed(1)}%',
                                style: const TextStyle(
                                    color: AppTheme.slate300,
                                    fontSize: 14)),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // ── 요약 통계 ──
                  Row(
                    children: [
                      _summaryCard(
                        'AVG Elo',
                        '${(rankings.fold<double>(0, (sum, t) => sum + t.elo) / rankings.length).round()}',
                        AppTheme.blue400,
                      ),
                      const SizedBox(width: 10),
                      _summaryCard(
                        '참가 팀',
                        '${rankings.length}',
                        AppTheme.green500,
                      ),
                      const SizedBox(width: 10),
                      _summaryCard(
                        '총 경기',
                        '${rankings.fold<int>(0, (sum, t) => sum + t.games) ~/ 2}',
                        AppTheme.orange500,
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // ── 순위 테이블 ──
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: DataTable(
                      headingRowColor:
                          WidgetStateProperty.all(AppTheme.slate800),
                      columnSpacing: 16,
                      columns: const [
                        DataColumn(label: Text('#', style: _h)),
                        DataColumn(label: Text('팀', style: _h)),
                        DataColumn(
                            label: Text('경기', style: _h), numeric: true),
                        DataColumn(
                            label: Text('승', style: _h), numeric: true),
                        DataColumn(
                            label: Text('무', style: _h), numeric: true),
                        DataColumn(
                            label: Text('패', style: _h), numeric: true),
                        DataColumn(
                            label: Text('승률', style: _h), numeric: true),
                        DataColumn(
                            label: Text('Elo', style: _h), numeric: true),
                      ],
                      rows: List.generate(rankings.length, (i) {
                        final t = rankings[i];
                        return DataRow(cells: [
                          DataCell(Text('${i + 1}', style: _c)),
                          DataCell(Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 8,
                                height: 8,
                                margin: const EdgeInsets.only(right: 8),
                                decoration: BoxDecoration(
                                  color: t.color,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              Text(t.name,
                                  style: _c.copyWith(
                                      fontWeight: FontWeight.w500)),
                            ],
                          )),
                          DataCell(Text('${t.games}', style: _n)),
                          DataCell(Text('${t.wins}', style: _n)),
                          DataCell(Text('${t.draws}', style: _n)),
                          DataCell(Text('${t.losses}', style: _n)),
                          DataCell(Text(
                              '${(t.winRate * 100).toStringAsFixed(1)}%',
                              style: _n)),
                          DataCell(Text('${t.elo.round()}',
                              style:
                                  _n.copyWith(color: AppTheme.blue400))),
                        ]);
                      }),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // ── CTA: 파워 랭킹 ──
                  GestureDetector(
                    onTap: () {
                      Navigator.of(context).push(MaterialPageRoute<void>(
                        builder: (_) => const PowerRankingScreen(),
                      ));
                    },
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [AppTheme.orange500, AppTheme.purple500],
                        ),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.bolt, color: Colors.white, size: 18),
                          SizedBox(width: 6),
                          Text('파워 랭킹 보기',
                              style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 32),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

Widget _summaryCard(String label, String value, Color color) {
  return Expanded(
    child: Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.slate800,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: TextStyle(
                  color: color,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5)),
          const SizedBox(height: 4),
          Text(value,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w800)),
        ],
      ),
    ),
  );
}

const _h =
    TextStyle(color: AppTheme.slate300, fontSize: 12, fontWeight: FontWeight.w600);
const _c = TextStyle(color: Colors.white, fontSize: 13);
final _n = _c.copyWith(
  fontFeatures: const [FontFeature.tabularFigures()],
);
