import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/models/official_player_game_logs.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/kst_clock.dart';

/// The official revision is displayed independently from AUBL's manual logs.
class OfficialPlayerGameLogsView extends StatelessWidget {
  const OfficialPlayerGameLogsView({
    super.key,
    required this.data,
    required this.onOpenGame,
    this.gameId,
  });

  final OfficialPlayerGameLogs data;
  final int? gameId;
  final ValueChanged<String> onOpenGame;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final games = data.games
        .where((game) => gameId == null || game.backendGameId == gameId)
        .toList();
    final published = data.publishedAt;
    final message = switch (data.status) {
      'REVIEW_REQUIRED' => '경기 결과와 공식 상세 기록의 대조가 필요해 관리자 확인 중입니다.',
      'IDENTITY_UNRESOLVED' => '선수 연결을 확인 중입니다. 동명이인 기록을 임의로 합치지 않습니다.',
      'NOT_COLLECTED' => '공식 경기별 기록이 아직 게시되지 않았습니다.',
      _ => '해당 조건의 공개된 경기별 기록이 없습니다.',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'UniquePlay 공식 경기별 기록',
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: 4),
        Text(
          '선택 시즌의 활성 게시본 기준 · 시즌 미선택 시 최신 시즌\n'
          '기존 수동 기록과 중복 합산하지 않습니다. 미제공 수치는 —로 표시합니다.',
          style: TextStyle(color: colors.muted, fontSize: 12),
        ),
        if (published != null) ...[
          const SizedBox(height: 4),
          Text(
            '게시 ${DateFormat('yyyy.MM.dd HH:mm').format(KstClock.normalizeApi(published))} KST',
            style: TextStyle(color: colors.muted, fontSize: 12),
          ),
        ],
        const SizedBox(height: 12),
        if (games.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Text(message, style: TextStyle(color: colors.muted)),
          ),
        for (final game in games)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: colors.surface,
              border: Border.all(color: colors.line),
              borderRadius: BorderRadius.circular(4),
            ),
            child: ExpansionTile(
              key: ValueKey(game.sourceGameId),
              tilePadding: const EdgeInsets.symmetric(horizontal: 12),
              childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              title: Text(
                '${game.homeTeamName} ${game.homeScore ?? '—'} : '
                '${game.awayScore ?? '—'} ${game.awayTeamName}',
                style: Theme.of(context).textTheme.titleSmall,
              ),
              subtitle: Text(_dateLabel(game.playedAt)),
              children: [
                for (final row in game.batters)
                  _PlayerRow(row: row, pitcher: false),
                for (final row in game.pitchers)
                  _PlayerRow(row: row, pitcher: true),
                Align(
                  alignment: Alignment.centerRight,
                  child: OutlinedButton.icon(
                    onPressed: game.sourceGameId.isEmpty
                        ? null
                        : () => onOpenGame(game.sourceGameId),
                    icon: const Icon(Icons.open_in_new, size: 18),
                    label: const Text('경기 상세'),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  static String _dateLabel(String raw) {
    final date = KstClock.tryParseApi(raw);
    return date == null
        ? '경기 일시 확인 중'
        : DateFormat('yyyy.MM.dd HH:mm').format(date);
  }
}

class _PlayerRow extends StatelessWidget {
  const _PlayerRow({required this.row, required this.pitcher});
  final OfficialPlayerRow row;
  final bool pitcher;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final values = pitcher
        ? <(String, String)>[
            ('이닝', row.inningsLabel),
            ('피안타', row.displayStat('hitsAllowed')),
            ('실점', row.displayStat('runsAllowed')),
            ('자책', row.displayStat('earnedRuns')),
            ('4사구', row.displayStat('walksAndHitByPitch')),
            ('삼진', row.displayStat('strikeouts')),
            ('방어율', row.displayStat('era', decimals: 2)),
          ]
        : <(String, String)>[
            ('타수', row.displayStat('atBats')),
            ('안타', row.displayStat('hits')),
            ('타점', row.displayStat('rbi')),
            ('도루', row.displayStat('stolenBases')),
            ('득점', row.displayStat('runs')),
            ('타율', row.displayStat('battingAverage', decimals: 3)),
          ];
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${pitcher ? '투수' : '타자'} · ${row.playerName}'
            '${row.position == null ? '' : ' · ${row.position}'}'
            '${row.decision == null ? '' : ' · ${row.decision}'}',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 16,
            runSpacing: 10,
            children: [
              for (final (label, value) in values)
                Semantics(
                  label: '$label $value',
                  excludeSemantics: true,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        style: TextStyle(color: colors.muted, fontSize: 12),
                      ),
                      Text(
                        value,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ],
                  ),
                ),
            ],
          ),
          if (row.plateAppearances.isNotEmpty) ...[
            const SizedBox(height: 12),
            for (final appearance in row.plateAppearances)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text('${appearance.inning}회 · ${appearance.result}'),
              ),
          ],
        ],
      ),
    );
  }
}
