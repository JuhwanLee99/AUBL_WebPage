import 'package:cloud_firestore/cloud_firestore.dart';

abstract class TeamHubDataSource {
  Future<Map<String, String>> getEmblemUrlsByTeamId();
}

class TeamHubRepository implements TeamHubDataSource {
  TeamHubRepository({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;

  @override
  Future<Map<String, String>> getEmblemUrlsByTeamId() async {
    final snap = await _firestore.collection('teams').get();
    final map = <String, String>{};
    for (final doc in snap.docs) {
      final data = doc.data();
      final url = data['emblemUrl'];
      if (url is String && url.isNotEmpty) {
        map[doc.id] = url;
      }
    }
    return map;
  }
}
