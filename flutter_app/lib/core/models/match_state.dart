import 'package:cloud_firestore/cloud_firestore.dart';

class MatchState {
  const MatchState({
    required this.id,
    required this.status,
    this.inning = 1,
    this.half = 'top',
    this.balls = 0,
    this.strikes = 0,
    this.outs = 0,
    this.bases = const [null, null, null],
    this.homeScore = 0,
    this.awayScore = 0,
    this.currentPitcher,
    this.currentBatter,
  });

  final String id;
  final String status;
  final int inning;
  final String half; // top | bottom
  final int balls;
  final int strikes;
  final int outs;
  final List<String?> bases; // [first, second, third]
  final int homeScore;
  final int awayScore;
  final String? currentPitcher;
  final String? currentBatter;

  String get inningLabel => '$inning회 ${half == 'top' ? '초' : '말'}';

  factory MatchState.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    final score = d['score'] as Map<String, dynamic>?;
    final rawBases = d['bases'] as List<dynamic>?;
    final half = d['half'] as String? ?? 'top';

    // lineups에서 현재 투수/타자 추출
    final lineups = d['lineups'] as Map<String, dynamic>?;
    final batterIndex = d['batterIndex'] as Map<String, dynamic>?;

    // 초(top) → away 공격, home 수비 / 말(bottom) → home 공격, away 수비
    final defenseSide = half == 'top' ? 'home' : 'away';
    final battingSide = half == 'top' ? 'away' : 'home';

    String? pitcherName;
    String? batterName;

    if (lineups != null) {
      // 수비 측 라인업에서 포지션 'P'인 선수 찾기
      final defenseLineup = lineups[defenseSide] as List<dynamic>?;
      if (defenseLineup != null) {
        for (final slot in defenseLineup) {
          if (slot is Map<String, dynamic>) {
            final pos = (slot['pos'] as String?)?.toUpperCase() ?? '';
            if (pos == 'P') {
              pitcherName = slot['name'] as String?;
              break;
            }
          }
        }
      }

      // 공격 측 라인업에서 현재 타자 찾기
      final offenseLineup = lineups[battingSide] as List<dynamic>?;
      if (offenseLineup != null && offenseLineup.isNotEmpty) {
        final idx = batterIndex?[battingSide] as int? ?? 0;
        final activeOffense =
            offenseLineup.whereType<Map<String, dynamic>>().toList();
        if (activeOffense.isNotEmpty) {
          final batterSlot = activeOffense[idx % activeOffense.length];
          batterName = batterSlot['name'] as String?;
        }
      }
    }

    return MatchState(
      id: doc.id,
      status: d['status'] as String? ?? 'scheduled',
      inning: d['inning'] as int? ?? 1,
      half: half,
      balls: d['balls'] as int? ?? 0,
      strikes: d['strikes'] as int? ?? 0,
      outs: d['outs'] as int? ?? 0,
      bases: rawBases != null
          ? rawBases.map((e) => e as String?).toList()
          : const [null, null, null],
      homeScore: score?['home'] as int? ?? 0,
      awayScore: score?['away'] as int? ?? 0,
      currentPitcher: pitcherName,
      currentBatter: batterName,
    );
  }
}
