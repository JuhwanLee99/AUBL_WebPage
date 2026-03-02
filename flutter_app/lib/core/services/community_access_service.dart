import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'firestore_service.dart';

class CommunityAccess {
  const CommunityAccess({
    required this.roleLabel,
    required this.isLoggedIn,
    required this.isAdmin,
    required this.isScorer,
    required this.isCoach,
    required this.isStaff,
    required this.isPlayer,
  });

  final String roleLabel;
  final bool isLoggedIn;
  final bool isAdmin;
  final bool isScorer;
  final bool isCoach;
  final bool isStaff;
  final bool isPlayer;

  bool get isPlayerOrAbove =>
      isLoggedIn && (isAdmin || isCoach || isStaff || isPlayer);
  bool get canWritePlayerRegistration => isLoggedIn && isAdmin;
  bool get canWriteUniformRegistration => isLoggedIn && (isAdmin || isCoach);
}

class CommunityAccessService {
  CommunityAccessService({FirestoreService? firestoreService})
      : _fs = firestoreService ?? FirestoreService();

  final FirestoreService _fs;

  Future<CommunityAccess> resolveCurrentUserAccess() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      return const CommunityAccess(
        roleLabel: '방문자',
        isLoggedIn: false,
        isAdmin: false,
        isScorer: false,
        isCoach: false,
        isStaff: false,
        isPlayer: false,
      );
    }

    try {
      final token = await user.getIdTokenResult(true);
      final admin = token.claims?['admin'] == true;
      if (admin) {
        return const CommunityAccess(
          roleLabel: '관리자',
          isLoggedIn: true,
          isAdmin: true,
          isScorer: false,
          isCoach: false,
          isStaff: false,
          isPlayer: false,
        );
      }

      final roleDoc = await FirebaseFirestore.instance
          .collection('roles')
          .doc(user.uid)
          .get();
      final data = roleDoc.data();
      if (roleDoc.exists && data?['role'] == 'scorer') {
        return const CommunityAccess(
          roleLabel: '기록원',
          isLoggedIn: true,
          isAdmin: false,
          isScorer: true,
          isCoach: false,
          isStaff: false,
          isPlayer: false,
        );
      }
      if (roleDoc.exists && data?['role'] == 'coach') {
        return const CommunityAccess(
          roleLabel: '감독',
          isLoggedIn: true,
          isAdmin: false,
          isScorer: false,
          isCoach: true,
          isStaff: false,
          isPlayer: false,
        );
      }

      final membership = await _fs.findUserTeamMembership(user.uid);
      if (membership != null) {
        final role = membership['role'] as String? ?? 'player';
        if (role == 'coach') {
          return const CommunityAccess(
            roleLabel: '감독',
            isLoggedIn: true,
            isAdmin: false,
            isScorer: false,
            isCoach: true,
            isStaff: false,
            isPlayer: false,
          );
        }
        if (role == 'staff') {
          return const CommunityAccess(
            roleLabel: '스태프',
            isLoggedIn: true,
            isAdmin: false,
            isScorer: false,
            isCoach: false,
            isStaff: true,
            isPlayer: false,
          );
        }
        return const CommunityAccess(
          roleLabel: '선수',
          isLoggedIn: true,
          isAdmin: false,
          isScorer: false,
          isCoach: false,
          isStaff: false,
          isPlayer: true,
        );
      }
    } catch (_) {
      // ignore and fallback
    }

    return const CommunityAccess(
      roleLabel: '일반',
      isLoggedIn: true,
      isAdmin: false,
      isScorer: false,
      isCoach: false,
      isStaff: false,
      isPlayer: false,
    );
  }
}
