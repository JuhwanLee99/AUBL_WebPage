import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:aubl_flutter_app/core/models/match.dart' as m;
import 'package:aubl_flutter_app/core/models/team.dart';
import 'package:aubl_flutter_app/core/models/team_member.dart';
import 'package:aubl_flutter_app/core/models/team_notice.dart';
import 'package:aubl_flutter_app/features/teams/data/team_detail_repository.dart';
import 'package:aubl_flutter_app/features/teams/team_detail_view_model.dart';

void main() {
  group('TeamDetailViewModel', () {
    test('checkCoachRole returns true for admin user', () async {
      final viewModel = TeamDetailViewModel(
        dataSource: _FakeTeamDetailDataSource(),
        authSource: _FakeAuthSource(
          userId: 'uid-1',
          userName: 'tester',
          isAdmin: true,
        ),
      );

      final result = await viewModel.checkCoachRole('team-1');
      expect(result, isTrue);
    });

    test('checkCoachRole returns true for matching coach role', () async {
      final dataSource = _FakeTeamDetailDataSource()
        ..roleDataByUid['uid-1'] = {'role': 'coach', 'teamId': 'team-1'};
      final viewModel = TeamDetailViewModel(
        dataSource: dataSource,
        authSource: _FakeAuthSource(
          userId: 'uid-1',
          userName: 'tester',
          isAdmin: false,
        ),
      );

      final result = await viewModel.checkCoachRole('team-1');
      expect(result, isTrue);
    });

    test('toggleNoticePinned maps permission denied error', () async {
      final dataSource = _FakeTeamDetailDataSource()
        ..togglePinnedError =
            FirebaseException(plugin: 'firestore', code: 'permission-denied');
      final viewModel = TeamDetailViewModel(
        dataSource: dataSource,
        authSource: _FakeAuthSource(
          userId: 'uid-1',
          userName: 'tester',
          isAdmin: false,
        ),
      );

      final result = await viewModel.toggleNoticePinned(
        teamId: 'team-1',
        notice: _notice(),
      );

      expect(result.statusMessage, isNull);
      expect(result.errorMessage, '팀 공지 수정 권한이 없습니다.');
    });

    test('addNotice returns success and passes author metadata', () async {
      final dataSource = _FakeTeamDetailDataSource();
      final viewModel = TeamDetailViewModel(
        dataSource: dataSource,
        authSource: _FakeAuthSource(
          userId: 'uid-1',
          userName: 'coach',
          isAdmin: false,
        ),
      );

      final result = await viewModel.addNotice(
        teamId: 'team-1',
        title: '공지 제목',
        content: '공지 내용',
        category: '일반',
        pinned: true,
      );

      expect(result.statusMessage, '팀 공지를 등록했습니다.');
      expect(result.errorMessage, isNull);
      expect(dataSource.addedNotice, isNotNull);
      expect(dataSource.addedNotice!.createdByUid, 'uid-1');
      expect(dataSource.addedNotice!.createdByName, 'coach');
      expect(dataSource.addedNotice!.pinned, isTrue);
    });
  });
}

class _FakeTeamDetailDataSource implements TeamDetailDataSource {
  final Map<String, Map<String, dynamic>> roleDataByUid = {};
  Object? togglePinnedError;
  TeamNotice? addedNotice;

  @override
  Future<void> addTeamNotice(String teamId, TeamNotice notice) async {
    addedNotice = notice;
  }

  @override
  Future<void> deleteTeamNotice(String teamId, String noticeId) async {}

  @override
  Future<List<m.Match>> getMatchesByTeam(String teamName) async => const [];

  @override
  Future<Map<String, dynamic>?> getRoleData(String uid) async {
    return roleDataByUid[uid];
  }

  @override
  Future<Team?> getTeam(String teamId) async => null;

  @override
  Future<void> toggleTeamNoticePin(
      String teamId, String noticeId, bool pinned) async {
    if (togglePinnedError != null) {
      throw togglePinnedError!;
    }
  }

  @override
  Stream<List<TeamMember>> watchTeamMembers(String teamId) {
    return Stream.value(const []);
  }

  @override
  Stream<List<TeamNotice>> watchTeamNotices(String teamId) {
    return Stream.value(const []);
  }
}

class _FakeAuthSource implements TeamDetailAuthSource {
  _FakeAuthSource({
    required this.userId,
    required this.userName,
    required this.isAdmin,
  });

  final String? userId;
  final String? userName;
  final bool isAdmin;

  @override
  String? get currentUserId => userId;

  @override
  String? get currentUserName => userName;

  @override
  Future<bool> isCurrentUserAdmin() async => isAdmin;
}

TeamNotice _notice() {
  return const TeamNotice(
    id: 'notice-1',
    title: '기존 공지',
    content: '기존 내용',
    createdAt: 1,
    category: '일반',
    pinned: false,
  );
}
