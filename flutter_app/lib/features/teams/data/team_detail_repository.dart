import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/models/match.dart' as m;
import '../../../core/models/team.dart';
import '../../../core/models/team_member.dart';
import '../../../core/models/team_notice.dart';
import '../../../core/services/firestore_service.dart';

abstract class TeamDetailDataSource {
  Future<Team?> getTeam(String teamId);
  Future<List<m.Match>> getMatchesByTeam(String teamName);
  Stream<List<TeamNotice>> watchTeamNotices(String teamId);
  Stream<List<TeamMember>> watchTeamMembers(String teamId);
  Future<void> addTeamNotice(String teamId, TeamNotice notice);
  Future<void> toggleTeamNoticePin(String teamId, String noticeId, bool pinned);
  Future<void> deleteTeamNotice(String teamId, String noticeId);
  Future<Map<String, dynamic>?> getRoleData(String uid);
}

class TeamDetailRepository implements TeamDetailDataSource {
  TeamDetailRepository({
    FirestoreService? firestoreService,
    FirebaseFirestore? firestore,
  })  : _firestoreService = firestoreService ?? FirestoreService(),
        _firestore = firestore ?? FirebaseFirestore.instance;

  final FirestoreService _firestoreService;
  final FirebaseFirestore _firestore;

  @override
  Future<Team?> getTeam(String teamId) {
    return _firestoreService.getTeam(teamId);
  }

  @override
  Future<List<m.Match>> getMatchesByTeam(String teamName) {
    return _firestoreService.getMatchesByTeam(teamName);
  }

  @override
  Stream<List<TeamNotice>> watchTeamNotices(String teamId) {
    return _firestoreService.watchTeamNotices(teamId);
  }

  @override
  Stream<List<TeamMember>> watchTeamMembers(String teamId) {
    return _firestoreService.watchTeamMembers(teamId);
  }

  @override
  Future<void> addTeamNotice(String teamId, TeamNotice notice) {
    return _firestoreService.addTeamNotice(teamId, notice);
  }

  @override
  Future<void> toggleTeamNoticePin(
      String teamId, String noticeId, bool pinned) {
    return _firestoreService.toggleTeamNoticePin(teamId, noticeId, pinned);
  }

  @override
  Future<void> deleteTeamNotice(String teamId, String noticeId) {
    return _firestoreService.deleteTeamNotice(teamId, noticeId);
  }

  @override
  Future<Map<String, dynamic>?> getRoleData(String uid) async {
    final roleDoc = await _firestore.collection('roles').doc(uid).get();
    return roleDoc.data();
  }
}
