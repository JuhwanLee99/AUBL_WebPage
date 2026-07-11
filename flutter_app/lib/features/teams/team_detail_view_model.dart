import 'package:firebase_auth/firebase_auth.dart';

import '../../core/models/match.dart' as m;
import '../../core/models/team.dart';
import '../../core/models/team_member.dart';
import '../../core/models/team_notice.dart';
import 'data/team_detail_repository.dart';

class TeamDetailActionResult {
  const TeamDetailActionResult({
    this.statusMessage,
    this.errorMessage,
  });

  final String? statusMessage;
  final String? errorMessage;
}

abstract class TeamDetailAuthSource {
  String? get currentUserId;
  String? get currentUserName;
  Future<bool> isCurrentUserAdmin();
}

class FirebaseTeamDetailAuthSource implements TeamDetailAuthSource {
  FirebaseTeamDetailAuthSource({FirebaseAuth? auth})
      : _auth = auth ?? FirebaseAuth.instance;

  final FirebaseAuth _auth;

  @override
  String? get currentUserId => _auth.currentUser?.uid;

  @override
  String? get currentUserName {
    final email = _auth.currentUser?.email;
    if (email == null || email.isEmpty) return null;
    return email.split('@').first;
  }

  @override
  Future<bool> isCurrentUserAdmin() async {
    final user = _auth.currentUser;
    if (user == null) return false;
    try {
      final token = await user.getIdTokenResult(true);
      return token.claims?['admin'] == true;
    } catch (_) {
      return false;
    }
  }
}

class TeamDetailViewModel {
  TeamDetailViewModel({
    TeamDetailDataSource? dataSource,
    TeamDetailAuthSource? authSource,
  })  : _dataSource = dataSource ?? TeamDetailRepository(),
        _authSource = authSource ?? FirebaseTeamDetailAuthSource();

  final TeamDetailDataSource _dataSource;
  final TeamDetailAuthSource _authSource;

  Future<Team?> loadTeam(String teamId) {
    return _dataSource.getTeam(teamId);
  }

  Future<List<m.Match>> loadMatches(String teamName) {
    return _dataSource.getMatchesByTeam(teamName);
  }

  Stream<List<TeamNotice>> watchTeamNotices(String teamId) {
    return _dataSource.watchTeamNotices(teamId);
  }

  Stream<List<TeamMember>> watchTeamMembers(String teamId) {
    return _dataSource.watchTeamMembers(teamId);
  }

  Future<bool> checkCoachRole(String teamId) async {
    final uid = _authSource.currentUserId;
    if (uid == null) return false;

    if (await _authSource.isCurrentUserAdmin()) {
      return true;
    }

    final roleData = await _dataSource.getRoleData(uid);
    if (roleData == null) return false;
    return roleData['role'] == 'coach' && roleData['teamId'] == teamId;
  }

  Future<TeamDetailActionResult> toggleNoticePinned({
    required String teamId,
    required TeamNotice notice,
  }) async {
    try {
      final nextPinned = !notice.pinned;
      await _dataSource.toggleTeamNoticePin(teamId, notice.id, nextPinned);
      return TeamDetailActionResult(
        statusMessage: nextPinned ? '공지 고정을 설정했습니다.' : '공지 고정을 해제했습니다.',
      );
    } on FirebaseException catch (e) {
      return TeamDetailActionResult(
        errorMessage: e.code == 'permission-denied'
            ? '팀 공지 수정 권한이 없습니다.'
            : '공지 고정 변경 중 문제가 발생했습니다.',
      );
    } catch (_) {
      return const TeamDetailActionResult(
        errorMessage: '공지 고정 변경 중 문제가 발생했습니다.',
      );
    }
  }

  Future<TeamDetailActionResult> deleteNotice({
    required String teamId,
    required TeamNotice notice,
  }) async {
    try {
      await _dataSource.deleteTeamNotice(teamId, notice.id);
      return const TeamDetailActionResult(
        statusMessage: '팀 공지를 삭제했습니다.',
      );
    } on FirebaseException catch (e) {
      return TeamDetailActionResult(
        errorMessage: e.code == 'permission-denied'
            ? '팀 공지 삭제 권한이 없습니다.'
            : '팀 공지 삭제 중 문제가 발생했습니다.',
      );
    } catch (_) {
      return const TeamDetailActionResult(
        errorMessage: '팀 공지 삭제 중 문제가 발생했습니다.',
      );
    }
  }

  Future<TeamDetailActionResult> addNotice({
    required String teamId,
    required String title,
    required String content,
    required String category,
    required bool pinned,
  }) async {
    try {
      await _dataSource.addTeamNotice(
        teamId,
        TeamNotice(
          id: '',
          title: title,
          content: content,
          createdAt: DateTime.now().millisecondsSinceEpoch,
          createdByUid: _authSource.currentUserId,
          createdByName: _authSource.currentUserName,
          category: category,
          pinned: pinned,
        ),
      );
      return const TeamDetailActionResult(
        statusMessage: '팀 공지를 등록했습니다.',
      );
    } on FirebaseException catch (e) {
      return TeamDetailActionResult(
        errorMessage: e.code == 'permission-denied'
            ? '팀 공지 작성 권한이 없습니다.'
            : '공지 등록 중 문제가 발생했습니다.',
      );
    } catch (_) {
      return const TeamDetailActionResult(
        errorMessage: '공지 등록 중 문제가 발생했습니다.',
      );
    }
  }
}
