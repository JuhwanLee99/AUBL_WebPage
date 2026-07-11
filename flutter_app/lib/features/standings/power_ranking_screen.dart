import 'dart:math';

import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

// ── 파워랭킹 데이터 ──
class _PowerRank {
  _PowerRank({
    required this.rank,
    required this.name,
    required this.colorHex,
    required this.score,
    required this.elo,
    required this.winRate,
    required this.trend,
  });
  final int rank;
  final String name, colorHex;
  final double score, elo, winRate;
  final int trend; // +1 up, -1 down, 0 same

  Color get color {
    final hex = colorHex.replaceFirst('#', '');
    return Color(int.parse('FF$hex', radix: 16));
  }
}

List<_PowerRank> _buildPowerRankings() {
  final rng = Random(42);
  final teams = [
    ('한양대 불새', '#4f46e5', 1580.0, 0.714),
    ('연세대 EAGLES', '#8b5cf6', 1545.0, 0.625),
    ('성균관대 킹고야구반', '#10b981', 1530.0, 0.600),
    ('고려대 백구회', '#f59e0b', 1510.0, 0.571),
    ('중앙대 랑데뷰', '#ef4444', 1495.0, 0.500),
    ('한국외대 야구부', '#f97316', 1470.0, 0.429),
    ('서강대 알바트로스', '#3b82f6', 1455.0, 0.375),
  ];

  final rankings = <_PowerRank>[];
  for (var i = 0; i < teams.length; i++) {
    final (name, hex, elo, wr) = teams[i];
    // 3년 가중 합산 스코어 시뮬레이션
    final score = elo * 0.5 + wr * 1000 * 0.3 + rng.nextDouble() * 200 * 0.2;
    rankings.add(_PowerRank(
      rank: i + 1,
      name: name,
      colorHex: hex,
      score: score,
      elo: elo,
      winRate: wr,
      trend: i < 2 ? 1 : (i > 4 ? -1 : 0),
    ));
  }
  rankings.sort((a, b) => b.score.compareTo(a.score));
  for (var i = 0; i < rankings.length; i++) {
    rankings[i] = _PowerRank(
      rank: i + 1,
      name: rankings[i].name,
      colorHex: rankings[i].colorHex,
      score: rankings[i].score,
      elo: rankings[i].elo,
      winRate: rankings[i].winRate,
      trend: rankings[i].trend,
    );
  }
  return rankings;
}

class PowerRankingScreen extends StatelessWidget {
  const PowerRankingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final rankings = _buildPowerRankings();
    final top3 = rankings.take(3).toList();

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
                    Color(0xFF1a0a3f),
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
                        child: const Icon(Icons.arrow_back,
                            color: Colors.white),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Text('파워 랭킹',
                            style: TextStyle(
                                color: Colors.white,
                                fontSize: 20,
                                fontWeight: FontWeight.bold)),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [
                              AppTheme.orange500,
                              AppTheme.purple500,
                            ],
                          ),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Text('2026',
                            style: TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    '3년 가중 합산 기반 종합 파워 랭킹',
                    style:
                        TextStyle(color: AppTheme.slate400, fontSize: 13),
                  ),
                ],
              ),
            ),
          ),

          // ── TOP 3 ──
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('TOP 3',
                      style: TextStyle(
                          color: AppTheme.amber400,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.5)),
                  const SizedBox(height: 10),
                  ...top3.map((r) => Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [
                              r.color.withValues(alpha: 0.18),
                              AppTheme.slate800,
                            ],
                          ),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                              color: r.color.withValues(alpha: 0.3)),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 32,
                              height: 32,
                              decoration: BoxDecoration(
                                color: r.color.withValues(alpha: 0.2),
                                shape: BoxShape.circle,
                              ),
                              alignment: Alignment.center,
                              child: Text(
                                '#${r.rank}',
                                style: TextStyle(
                                    color: r.color,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment:
                                    CrossAxisAlignment.start,
                                children: [
                                  Text(r.name,
                                      style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 15,
                                          fontWeight: FontWeight.w600)),
                                  const SizedBox(height: 3),
                                  Text(
                                    'Elo ${r.elo.round()} · 승률 ${(r.winRate * 100).toStringAsFixed(1)}%',
                                    style: const TextStyle(
                                        color: AppTheme.slate400,
                                        fontSize: 12),
                                  ),
                                ],
                              ),
                            ),
                            Text(
                              r.score.toStringAsFixed(1),
                              style: TextStyle(
                                  color: r.color,
                                  fontSize: 18,
                                  fontWeight: FontWeight.w800),
                            ),
                          ],
                        ),
                      )),
                ],
              ),
            ),
          ),

          // ── 전체 랭킹 테이블 ──
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 8),
                  const Text('전체 순위',
                      style: TextStyle(
                          color: AppTheme.slate300,
                          fontSize: 14,
                          fontWeight: FontWeight.w600)),
                  const SizedBox(height: 10),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: DataTable(
                      headingRowColor:
                          WidgetStateProperty.all(AppTheme.slate800),
                      columnSpacing: 16,
                      columns: const [
                        DataColumn(label: Text('#', style: _hdr)),
                        DataColumn(label: Text('팀', style: _hdr)),
                        DataColumn(
                            label: Text('스코어', style: _hdr),
                            numeric: true),
                        DataColumn(
                            label: Text('Elo', style: _hdr),
                            numeric: true),
                        DataColumn(
                            label: Text('승률', style: _hdr),
                            numeric: true),
                        DataColumn(
                            label: Text('추세', style: _hdr)),
                      ],
                      rows: rankings.map((r) {
                        return DataRow(cells: [
                          DataCell(Text('${r.rank}', style: _cel)),
                          DataCell(Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 8,
                                height: 8,
                                margin:
                                    const EdgeInsets.only(right: 8),
                                decoration: BoxDecoration(
                                  color: r.color,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              Text(r.name,
                                  style: _cel.copyWith(
                                      fontWeight: FontWeight.w500)),
                            ],
                          )),
                          DataCell(Text(
                              r.score.toStringAsFixed(1),
                              style: _num.copyWith(
                                  color: AppTheme.amber400))),
                          DataCell(Text('${r.elo.round()}',
                              style: _num.copyWith(
                                  color: AppTheme.blue400))),
                          DataCell(Text(
                              '${(r.winRate * 100).toStringAsFixed(1)}%',
                              style: _num)),
                          DataCell(Icon(
                            r.trend > 0
                                ? Icons.arrow_upward
                                : r.trend < 0
                                    ? Icons.arrow_downward
                                    : Icons.remove,
                            size: 16,
                            color: r.trend > 0
                                ? AppTheme.green500
                                : r.trend < 0
                                    ? AppTheme.red500
                                    : AppTheme.slate500,
                          )),
                        ]);
                      }).toList(),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── 산출 방법 ──
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppTheme.slate800,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                      color: AppTheme.slate700.withValues(alpha: 0.5)),
                ),
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('산출 방법',
                        style: TextStyle(
                            color: AppTheme.slate300,
                            fontSize: 13,
                            fontWeight: FontWeight.w600)),
                    SizedBox(height: 8),
                    Text(
                      '• Elo 레이팅 (50%) : 경기 결과 기반 실시간 레이팅\n'
                      '• 승률 (30%) : 시즌 승률 × 1000\n'
                      '• 최근 폼 (20%) : 최근 5경기 성적 가중치\n\n'
                      '3개년 데이터를 가중 합산하여 최종 파워 랭킹을 산출합니다.\n'
                      '(당해 50% / 전년 30% / 전전년 20%)',
                      style: TextStyle(
                          color: AppTheme.slate400,
                          fontSize: 12,
                          height: 1.5),
                    ),
                  ],
                ),
              ),
            ),
          ),

          const SliverToBoxAdapter(child: SizedBox(height: 32)),
        ],
      ),
    );
  }
}

const _hdr = TextStyle(
    color: AppTheme.slate300, fontSize: 12, fontWeight: FontWeight.w600);
const _cel = TextStyle(color: Colors.white, fontSize: 13);
final _num = _cel.copyWith(
  fontFeatures: const [FontFeature.tabularFigures()],
);
