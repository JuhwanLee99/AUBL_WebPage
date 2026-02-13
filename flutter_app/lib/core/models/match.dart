import 'package:cloud_firestore/cloud_firestore.dart';

class Match {
  const Match({
    required this.id,
    required this.homeTeamId,
    required this.awayTeamId,
    this.homeTeamName = '',
    this.awayTeamName = '',
    this.homeScore,
    this.awayScore,
    required this.status,
    this.startTime,
    this.venue,
    this.notes,
    this.recordMode,
    this.deleted = false,
  });

  final String id;
  final String homeTeamId;
  final String awayTeamId;
  final String homeTeamName;
  final String awayTeamName;
  final int? homeScore;
  final int? awayScore;
  final String status; // scheduled | inProgress | completed | canceled
  final String? startTime; // ISO date string
  final String? venue;
  final String? notes;
  final String? recordMode; // official | practice
  final bool deleted;

  bool get isLive => status == 'inProgress';
  bool get isCompleted => status == 'completed';
  bool get isScheduled => status == 'scheduled';
  bool get isCanceled => status == 'canceled';
  bool get isPractice => recordMode == 'practice';

  factory Match.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    return Match(
      id: doc.id,
      homeTeamId: d['homeTeamId'] as String? ?? '',
      awayTeamId: d['awayTeamId'] as String? ?? '',
      homeTeamName: d['homeTeamName'] as String? ?? '',
      awayTeamName: d['awayTeamName'] as String? ?? '',
      homeScore: d['homeScore'] as int?,
      awayScore: d['awayScore'] as int?,
      status: d['status'] as String? ?? 'scheduled',
      startTime: d['startTime'] as String?,
      venue: d['venue'] as String?,
      notes: d['notes'] as String?,
      recordMode: d['recordMode'] as String?,
      deleted: d['deleted'] as bool? ?? false,
    );
  }

  factory Match.fromJson(Map<String, dynamic> d) => Match(
        id: d['id'] as String? ?? '',
        homeTeamId: d['homeTeamId'] as String? ?? '',
        awayTeamId: d['awayTeamId'] as String? ?? '',
        homeTeamName: d['homeTeamName'] as String? ?? '',
        awayTeamName: d['awayTeamName'] as String? ?? '',
        homeScore: d['homeScore'] as int?,
        awayScore: d['awayScore'] as int?,
        status: d['status'] as String? ?? 'scheduled',
        startTime: d['startTime'] as String?,
        venue: d['venue'] as String?,
        notes: d['notes'] as String?,
        recordMode: d['recordMode'] as String?,
        deleted: d['deleted'] as bool? ?? false,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'homeTeamId': homeTeamId,
        'awayTeamId': awayTeamId,
        'homeTeamName': homeTeamName,
        'awayTeamName': awayTeamName,
        'homeScore': homeScore,
        'awayScore': awayScore,
        'status': status,
        'startTime': startTime,
        'venue': venue,
        'notes': notes,
        'recordMode': recordMode,
        'deleted': deleted,
      };
}
