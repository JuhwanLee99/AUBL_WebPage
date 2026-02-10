import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/match.dart';
import '../models/match_state.dart';
import '../models/notice.dart';
import '../models/notice_comment.dart';
import '../models/team.dart';
import '../models/team_member.dart';
import '../models/team_notice.dart';
import '../models/user_profile.dart';

class FirestoreService {
  FirestoreService({FirebaseFirestore? firestore})
      : _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  // ────────────────────────────────────────────
  // Matches
  // ────────────────────────────────────────────

  Stream<List<Match>> watchLiveMatches() {
    return _db
        .collection('matches')
        .where('status', isEqualTo: 'inProgress')
        .snapshots()
        .map((snap) => snap.docs
            .map(Match.fromFirestore)
            .where((m) => !m.deleted)
            .toList());
  }

  Future<List<Match>> getMatchesByDate(DateTime date) async {
    final dateStr =
        '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

    final snap = await _db
        .collection('matches')
        .where('startTime', isGreaterThanOrEqualTo: dateStr)
        .where('startTime', isLessThan: '${dateStr}Z') // same-day range
        .get();

    return snap.docs
        .map(Match.fromFirestore)
        .where((m) => !m.deleted)
        .toList();
  }

  Future<List<Match>> getAllMatches() async {
    final snap = await _db.collection('matches').orderBy('startTime').get();
    return snap.docs
        .map(Match.fromFirestore)
        .where((m) => !m.deleted)
        .toList();
  }

  Future<List<Match>> getCompletedMatches() async {
    final snap = await _db
        .collection('matches')
        .where('status', isEqualTo: 'completed')
        .orderBy('startTime', descending: true)
        .get();
    return snap.docs
        .map(Match.fromFirestore)
        .where((m) => !m.deleted)
        .toList();
  }

  Future<List<Match>> getScheduledMatches() async {
    final snap = await _db
        .collection('matches')
        .where('status', isEqualTo: 'scheduled')
        .orderBy('startTime')
        .get();
    return snap.docs
        .map(Match.fromFirestore)
        .where((m) => !m.deleted)
        .toList();
  }

  Future<List<Match>> getMatchesByTeam(String teamName) async {
    // Firestore doesn't support OR queries across different fields easily.
    // Fetch home matches, then away matches, merge + sort.
    final homeSnap = await _db
        .collection('matches')
        .where('homeTeamName', isEqualTo: teamName)
        .get();
    final awaySnap = await _db
        .collection('matches')
        .where('awayTeamName', isEqualTo: teamName)
        .get();

    final ids = <String>{};
    final results = <Match>[];
    for (final doc in [...homeSnap.docs, ...awaySnap.docs]) {
      if (ids.add(doc.id)) {
        final m = Match.fromFirestore(doc);
        if (!m.deleted) results.add(m);
      }
    }
    results.sort((a, b) => (a.startTime ?? '').compareTo(b.startTime ?? ''));
    return results;
  }

  Future<MatchState?> getMatchState(String matchId) async {
    final doc = await _db.collection('matchStates').doc(matchId).get();
    if (!doc.exists) return null;
    return MatchState.fromFirestore(doc);
  }

  Stream<MatchState?> watchMatchState(String matchId) {
    return _db
        .collection('matchStates')
        .doc(matchId)
        .snapshots()
        .map((doc) => doc.exists ? MatchState.fromFirestore(doc) : null);
  }

  // ────────────────────────────────────────────
  // Teams
  // ────────────────────────────────────────────

  Future<Team?> getTeam(String teamId) async {
    final doc = await _db.collection('teams').doc(teamId).get();
    if (!doc.exists) return null;
    return Team.fromFirestore(doc);
  }

  Stream<List<TeamMember>> watchTeamMembers(String teamId) {
    return _db
        .collection('teams')
        .doc(teamId)
        .collection('members')
        .orderBy('joinedAt', descending: true)
        .snapshots()
        .map((snap) => snap.docs.map(TeamMember.fromFirestore).toList());
  }

  Stream<List<TeamNotice>> watchTeamNotices(String teamId) {
    return _db
        .collection('teams')
        .doc(teamId)
        .collection('notices')
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) => snap.docs.map(TeamNotice.fromFirestore).toList());
  }

  Future<void> addTeamNotice(String teamId, TeamNotice notice) {
    return _db
        .collection('teams')
        .doc(teamId)
        .collection('notices')
        .add(notice.toFirestore());
  }

  Future<void> deleteTeamNotice(String teamId, String noticeId) {
    return _db
        .collection('teams')
        .doc(teamId)
        .collection('notices')
        .doc(noticeId)
        .delete();
  }

  Future<void> toggleTeamNoticePin(
      String teamId, String noticeId, bool pinned) {
    return _db
        .collection('teams')
        .doc(teamId)
        .collection('notices')
        .doc(noticeId)
        .update({'pinned': pinned});
  }

  Future<void> addTeamMember(String teamId, TeamMember member) {
    return _db
        .collection('teams')
        .doc(teamId)
        .collection('members')
        .doc(member.uid)
        .set(member.toFirestore());
  }

  Future<void> removeTeamMember(String teamId, String uid) {
    return _db
        .collection('teams')
        .doc(teamId)
        .collection('members')
        .doc(uid)
        .delete();
  }

  Future<void> updateTeamInfo(String teamId, Map<String, dynamic> data) {
    return _db.collection('teams').doc(teamId).set(data, SetOptions(merge: true));
  }

  // ────────────────────────────────────────────
  // Team Notice Comments
  // ────────────────────────────────────────────

  Stream<List<NoticeComment>> watchTeamNoticeComments(
      String teamId, String noticeId) {
    return _db
        .collection('teams')
        .doc(teamId)
        .collection('notices')
        .doc(noticeId)
        .collection('comments')
        .orderBy('createdAt')
        .snapshots()
        .map((snap) => snap.docs.map(NoticeComment.fromFirestore).toList());
  }

  Future<void> addTeamNoticeComment(
      String teamId, String noticeId, NoticeComment comment) {
    return _db
        .collection('teams')
        .doc(teamId)
        .collection('notices')
        .doc(noticeId)
        .collection('comments')
        .add(comment.toFirestore());
  }

  Future<void> deleteTeamNoticeComment(
      String teamId, String noticeId, String commentId) {
    return _db
        .collection('teams')
        .doc(teamId)
        .collection('notices')
        .doc(noticeId)
        .collection('comments')
        .doc(commentId)
        .delete();
  }

  Future<void> toggleCommentLike(
      String teamId, String noticeId, String commentId, String uid) async {
    final ref = _db
        .collection('teams')
        .doc(teamId)
        .collection('notices')
        .doc(noticeId)
        .collection('comments')
        .doc(commentId);

    return _db.runTransaction((tx) async {
      final snap = await tx.get(ref);
      if (!snap.exists) return;
      final likedBy =
          (snap.data()?['likedBy'] as List<dynamic>?)?.cast<String>() ?? [];
      if (likedBy.contains(uid)) {
        likedBy.remove(uid);
      } else {
        likedBy.add(uid);
      }
      tx.update(ref, {'likedBy': likedBy, 'likeCount': likedBy.length});
    });
  }

  // ────────────────────────────────────────────
  // Global Notices
  // ────────────────────────────────────────────

  Future<List<Notice>> getNotices({int limit = 20}) async {
    final snap = await _db
        .collection('notices')
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .get();
    return snap.docs.map(Notice.fromFirestore).toList();
  }

  Future<Notice?> getNotice(String noticeId) async {
    final doc = await _db.collection('notices').doc(noticeId).get();
    if (!doc.exists) return null;
    return Notice.fromFirestore(doc);
  }

  Stream<List<NoticeComment>> watchNoticeComments(String noticeId) {
    return _db
        .collection('notices')
        .doc(noticeId)
        .collection('comments')
        .orderBy('createdAt')
        .snapshots()
        .map((snap) => snap.docs.map(NoticeComment.fromFirestore).toList());
  }

  Future<void> addNoticeComment(String noticeId, NoticeComment comment) {
    return _db
        .collection('notices')
        .doc(noticeId)
        .collection('comments')
        .add(comment.toFirestore());
  }

  Future<void> deleteNoticeComment(String noticeId, String commentId) {
    return _db
        .collection('notices')
        .doc(noticeId)
        .collection('comments')
        .doc(commentId)
        .delete();
  }

  // ────────────────────────────────────────────
  // Users / Roles
  // ────────────────────────────────────────────

  Future<UserProfile?> getUserProfile(String uid) async {
    final doc = await _db.collection('users').doc(uid).get();
    if (!doc.exists) return null;
    return UserProfile.fromFirestore(doc);
  }

  Stream<Map<String, dynamic>?> watchUserRole(String uid) {
    return _db
        .collection('roles')
        .doc(uid)
        .snapshots()
        .map((doc) => doc.exists ? doc.data() : null);
  }

  /// 이메일로 uid 조회 (팀원 추가 시 사용)
  Future<String?> findUidByEmail(String email) async {
    final snap = await _db
        .collection('users')
        .where('emailLower', isEqualTo: email.toLowerCase())
        .limit(1)
        .get();
    if (snap.docs.isEmpty) return null;
    return snap.docs.first.id;
  }

  // ────────────────────────────────────────────
  // Static Content
  // ────────────────────────────────────────────

  Future<Map<String, dynamic>?> getStaticContent() async {
    final doc = await _db.collection('settings').doc('staticContent').get();
    return doc.data();
  }

  Stream<Map<String, dynamic>?> watchLiveInfo() {
    return _db
        .collection('settings')
        .doc('liveInfo')
        .snapshots()
        .map((doc) => doc.data());
  }
}
