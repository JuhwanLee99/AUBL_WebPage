import 'package:cloud_firestore/cloud_firestore.dart';

class Team {
  const Team({
    required this.id,
    required this.name,
    this.university = '',
    this.division = 'EUTTEUM',
    this.logoColor = '#3B82F6',
    this.founded,
    this.shortIntro,
    this.longIntro,
    this.emblemUrl,
    this.history,
  });

  final String id;
  final String name;
  final String university;
  final String division; // EUTTEUM | BEOGEUM
  final String logoColor;
  final int? founded;
  final String? shortIntro;
  final String? longIntro;
  final String? emblemUrl;
  final String? history;

  factory Team.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    return Team(
      id: doc.id,
      name: d['name'] as String? ?? '',
      university: d['university'] as String? ?? '',
      division: d['division'] as String? ?? 'EUTTEUM',
      logoColor: d['logoColor'] as String? ?? '#3B82F6',
      founded: d['founded'] as int?,
      shortIntro: d['shortIntro'] as String?,
      longIntro: d['longIntro'] as String?,
      emblemUrl: d['emblemUrl'] as String?,
      history: d['history'] as String?,
    );
  }
}
