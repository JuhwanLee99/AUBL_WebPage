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

    return MatchState(
      id: doc.id,
      status: d['status'] as String? ?? 'scheduled',
      inning: d['inning'] as int? ?? 1,
      half: d['half'] as String? ?? 'top',
      balls: d['balls'] as int? ?? 0,
      strikes: d['strikes'] as int? ?? 0,
      outs: d['outs'] as int? ?? 0,
      bases: rawBases != null
          ? rawBases.map((e) => e as String?).toList()
          : const [null, null, null],
      homeScore: score?['home'] as int? ?? 0,
      awayScore: score?['away'] as int? ?? 0,
      currentPitcher: d['currentPitcher'] as String?,
      currentBatter: d['currentBatter'] as String?,
    );
  }
}
